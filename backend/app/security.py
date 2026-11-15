import hashlib
import hmac
import secrets
import time
import uuid
from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from .config import get_settings
from .db import get_db
from .models import User

settings = get_settings()
bearer = HTTPBearer(auto_error=False)


def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()


def verify_password(pw: str, hashed: str | None) -> bool:
    if not hashed:
        return False
    try:
        return bcrypt.checkpw(pw.encode(), hashed.encode())
    except ValueError:
        return False


def create_access_token(user: User) -> str:
    now = datetime.now(timezone.utc)
    return jwt.encode({"sub": str(user.id), "role": user.role, "iat": int(now.timestamp()),
                       "exp": int((now + timedelta(minutes=settings.jwt_expires_minutes)).timestamp())},
                      settings.jwt_secret, algorithm="HS256")


def new_token() -> tuple[str, str]:
    raw = secrets.token_urlsafe(32)
    return raw, hashlib.sha256(raw.encode()).hexdigest()


def hash_token(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


# ---- signed, short-lived file URLs (private storage; <a>/<img> can't send auth headers)


def sign_file(kind: str, obj_id, user_id) -> str:
    exp = int(time.time()) + settings.file_signing_ttl_seconds
    msg = f"{kind}:{obj_id}:{user_id}:{exp}".encode()
    sig = hmac.new(settings.jwt_secret.encode(), msg, hashlib.sha256).hexdigest()[:32]
    return f"{settings.public_api_url.rstrip('/')}/api/v1/files/{kind}/{obj_id}?u={user_id}&e={exp}&s={sig}"


def check_file_signature(kind: str, obj_id, user_id, exp: int, sig: str) -> bool:
    if exp < time.time():
        return False
    msg = f"{kind}:{obj_id}:{user_id}:{exp}".encode()
    good = hmac.new(settings.jwt_secret.encode(), msg, hashlib.sha256).hexdigest()[:32]
    return hmac.compare_digest(good, sig)


def get_current_user(creds: HTTPAuthorizationCredentials | None = Depends(bearer),
                     db: Session = Depends(get_db)) -> User:
    if not creds:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Sign in to continue.")
    try:
        payload = jwt.decode(creds.credentials, settings.jwt_secret, algorithms=["HS256"])
        uid = uuid.UUID(payload["sub"])
    except (jwt.PyJWTError, ValueError, KeyError):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Your session has expired. Sign in again.")
    user = db.get(User, uid)
    if not user or user.account_status == "deleted":
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Account not found.")
    if user.account_status != "active":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This account is suspended. Contact support.")
    tva = user.tokens_valid_after
    if tva is not None:
        tva = tva if tva.tzinfo else tva.replace(tzinfo=timezone.utc)
        if int(payload.get("iat", 0)) < int(tva.timestamp()):
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Your session has expired. Sign in again.")
    return user


def optional_user(creds: HTTPAuthorizationCredentials | None = Depends(bearer),
                  db: Session = Depends(get_db)) -> User | None:
    if not creds:
        return None
    try:
        return get_current_user(creds, db)
    except HTTPException:
        return None


def require_admin(user: User = Depends(get_current_user)) -> User:
    if user.role != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Admins only.")
    return user


_hits: dict[str, deque] = defaultdict(deque)


def rate_limit(key: str, limit: int, window_s: int) -> None:
    now = time.time()
    q = _hits[key]
    while q and q[0] < now - window_s:
        q.popleft()
    if len(q) >= limit:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Too many requests. Wait a minute and try again.")
    q.append(now)


def client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"
