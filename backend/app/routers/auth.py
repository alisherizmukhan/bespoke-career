from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, EmailStr, Field, field_validator
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..db import get_db
from ..models import EmailToken, User, UserProfile, utcnow
from ..security import (client_ip, create_access_token, get_current_user, hash_password, hash_token, new_token,
                        rate_limit, verify_password)
from ..services import audit, log, send_email

router = APIRouter(prefix="/auth", tags=["auth"])
settings = get_settings()


def _pw(v: str) -> str:
    if len(v) < 8 or not any(c.isdigit() for c in v) or not any(c.isalpha() for c in v):
        raise ValueError("Use at least 8 characters with letters and numbers.")
    return v


class RegisterIn(BaseModel):
    full_name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    password: str
    accept_terms: bool

    @field_validator("password")
    @classmethod
    def _p(cls, v):
        return _pw(v)


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class TokenIn(BaseModel):
    token: str


class EmailIn(BaseModel):
    email: EmailStr


class ResetIn(BaseModel):
    token: str
    password: str

    @field_validator("password")
    @classmethod
    def _p(cls, v):
        return _pw(v)


def user_out(u: User, db: Session) -> dict:
    p = db.scalar(select(UserProfile).where(UserProfile.user_id == u.id))
    return {"id": str(u.id), "email": u.email, "role": u.role, "email_verified": u.email_verified_at is not None,
            "full_name": p.full_name if p else "", "onboarding_completed": bool(p and p.onboarding_completed),
            "profile_type": p.profile_type if p else None, "created_at": u.created_at}


def _issue(db: Session, user: User, kind: str, hours: int) -> str:
    raw, h = new_token()
    db.add(EmailToken(user_id=user.id, kind=kind, token_hash=h, expires_at=utcnow() + timedelta(hours=hours)))
    return raw


def _consume(db: Session, raw: str, kind: str) -> User:
    t = db.scalar(select(EmailToken).where(EmailToken.token_hash == hash_token(raw), EmailToken.kind == kind))
    exp = t.expires_at if t else None
    if exp is not None and exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)
    if not t or t.used_at or exp < datetime.now(timezone.utc):
        raise HTTPException(400, "This link is invalid or has expired. Request a new one.")
    t.used_at = utcnow()
    return db.get(User, t.user_id)


def _send_verification(db: Session, user: User) -> str | None:
    raw = _issue(db, user, "verify", 48)
    url = f"{settings.frontend_url.rstrip('/')}/verify-email?token={raw}"
    sent = send_email(user.email, "Confirm your Bespoke email", f"Confirm your email to finish setting up Bespoke:\n{url}\n")
    return None if sent else url  # demo mode without SMTP: the link goes back to the registrant


@router.post("/register", status_code=201)
def register(body: RegisterIn, request: Request, db: Session = Depends(get_db)):
    rate_limit(f"register:{client_ip(request)}", 10, 60)
    if not body.accept_terms:
        raise HTTPException(422, "Accept the Terms of Service and Privacy Policy to continue.")
    email = body.email.lower()
    if db.scalar(select(User).where(User.email == email)):
        raise HTTPException(409, "An account with this email already exists. Sign in instead.")
    u = User(email=email, password_hash=hash_password(body.password))
    db.add(u)
    db.flush()
    db.add(UserProfile(user_id=u.id, full_name=body.full_name.strip()))
    dev_url = _send_verification(db, u)
    audit(db, u.id, "user.registered", "user", u.id, ip=client_ip(request))
    db.commit()
    return {"access_token": create_access_token(u), "user": user_out(u, db), "dev_verification_url": dev_url}


@router.post("/login")
def login(body: LoginIn, request: Request, db: Session = Depends(get_db)):
    ip = client_ip(request)
    rate_limit(f"login:{ip}", 20, 60)
    rate_limit(f"login:{body.email.lower()}", 8, 60)
    u = db.scalar(select(User).where(User.email == body.email.lower()))
    if not u or u.account_status == "deleted" or not verify_password(body.password, u.password_hash):
        audit(db, u.id if u else None, "auth.login_failed", ip=ip)
        db.commit()
        raise HTTPException(401, "Email or password is incorrect.")
    if u.account_status != "active":
        raise HTTPException(403, "This account is suspended. Contact support.")
    u.last_login_at = utcnow()
    audit(db, u.id, "auth.login", "user", u.id, ip=ip)
    db.commit()
    return {"access_token": create_access_token(u), "user": user_out(u, db)}


@router.post("/logout")
def logout(request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    audit(db, user.id, "auth.logout", "user", user.id, ip=client_ip(request))
    db.commit()
    return {"ok": True}


@router.get("/me")
def me(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return user_out(user, db)


@router.post("/verify-email")
def verify_email(body: TokenIn, db: Session = Depends(get_db)):
    u = _consume(db, body.token, "verify")
    u.email_verified_at = u.email_verified_at or utcnow()
    audit(db, u.id, "auth.email_verified", "user", u.id)
    db.commit()
    return {"ok": True, "user": user_out(u, db)}


@router.post("/resend-verification")
def resend(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rate_limit(f"resend:{user.id}", 3, 300)
    if user.email_verified_at:
        return {"ok": True, "already_verified": True}
    url = _send_verification(db, user)
    db.commit()
    return {"ok": True, "dev_verification_url": url}


@router.post("/forgot-password")
def forgot(body: EmailIn, request: Request, db: Session = Depends(get_db)):
    rate_limit(f"forgot:{client_ip(request)}", 5, 300)
    u = db.scalar(select(User).where(User.email == body.email.lower()))
    if u and u.account_status == "active":
        raw = _issue(db, u, "reset", 1)
        url = f"{settings.frontend_url.rstrip('/')}/reset-password?token={raw}"
        if not send_email(u.email, "Reset your Bespoke password", f"Use this link within 1 hour:\n{url}\n"):
            log.warning("Password reset link for user %s (email disabled): %s", u.id, url)
        audit(db, u.id, "auth.password_reset_requested", "user", u.id, ip=client_ip(request))
        db.commit()
    return {"ok": True}


@router.post("/reset-password")
def reset(body: ResetIn, request: Request, db: Session = Depends(get_db)):
    u = _consume(db, body.token, "reset")
    u.password_hash = hash_password(body.password)
    audit(db, u.id, "auth.password_reset", "user", u.id, ip=client_ip(request))
    db.commit()
    return {"ok": True}


class ChangePw(BaseModel):
    current_password: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def _p(cls, v):
        return _pw(v)


@router.post("/change-password")
def change_password(body: ChangePw, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not verify_password(body.current_password, user.password_hash):
        raise HTTPException(400, "Current password is incorrect.")
    user.password_hash = hash_password(body.new_password)
    audit(db, user.id, "auth.password_changed", "user", user.id)
    db.commit()
    return {"ok": True}
