import logging
import smtplib
from email.message import EmailMessage

from sqlalchemy.orm import Session

from .config import get_settings
from .models import AuditLog, Notification

log = logging.getLogger("bespoke")
settings = get_settings()


def audit(db: Session, actor_id, action: str, entity_type: str | None = None, entity_id=None,
          ip: str | None = None, **details) -> None:
    db.add(AuditLog(actor_id=actor_id, action=action, entity_type=entity_type,
                    entity_id=str(entity_id) if entity_id is not None else None, details=details, ip=ip))


def notify(db: Session, user_id, type_: str, title: str, body: str | None = None, link: str | None = None) -> None:
    db.add(Notification(user_id=user_id, type=type_, title=title, body=body, link=link))


def send_email(to: str, subject: str, body: str) -> bool:
    if not settings.email_enabled:
        log.info("[email disabled] to=%s subject=%s", to, subject)
        return False
    msg = EmailMessage()
    msg["From"], msg["To"], msg["Subject"] = settings.smtp_from, to, subject
    msg.set_content(body)
    try:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=10) as s:
            s.starttls()
            if settings.smtp_user:
                s.login(settings.smtp_user, settings.smtp_password)
            s.send_message(msg)
        return True
    except Exception:  # noqa: BLE001
        log.exception("email send failed")
        return False
