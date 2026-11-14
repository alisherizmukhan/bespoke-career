"""File storage: S3-compatible bucket (Railway Buckets) when configured, local disk otherwise.
Files are never public; they are streamed through the API after an access check."""
import os
import uuid
from pathlib import Path

from fastapi import HTTPException, UploadFile

from .config import get_settings

settings = get_settings()

IMAGE_TYPES = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic", "image/heif": "heif"}
DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
DOC_TYPES = {**IMAGE_TYPES, "application/pdf": "pdf"}
RESUME_TYPES = {"application/pdf": "pdf", DOCX: "docx"}

_s3 = None


def _client():
    global _s3
    if _s3 is None:
        import boto3

        _s3 = boto3.client(
            "s3",
            endpoint_url=settings.s3_endpoint or None,
            region_name=settings.s3_region or "auto",
            aws_access_key_id=settings.s3_access_key_id,
            aws_secret_access_key=settings.s3_secret_access_key,
        )
    return _s3


def _sniff(head: bytes, data: bytes = b"") -> str | None:
    if head.startswith(b"PK") and b"word/" in data[:200000]:
        return DOCX
    if head.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if head.startswith(b"\x89PNG"):
        return "image/png"
    if head[:4] == b"RIFF" and head[8:12] == b"WEBP":
        return "image/webp"
    if head[4:12] in (b"ftypheic", b"ftypheix", b"ftypmif1", b"ftypmsf1", b"ftypheif"):
        return "image/heic"
    if head.startswith(b"%PDF"):
        return "application/pdf"
    return None


async def save_upload(file: UploadFile, folder: str, allowed: dict[str, str], with_bytes: bool = False):
    """Validate type (by content, not just the header) and size, then store. Returns (path, type, size)."""
    data = await file.read(settings.max_upload_mb * 1024 * 1024 + 1)
    if len(data) > settings.max_upload_mb * 1024 * 1024:
        raise HTTPException(413, f"File is too large. The limit is {settings.max_upload_mb} MB.")
    if not data:
        raise HTTPException(400, "The file is empty.")
    sniffed = _sniff(data[:16], data)
    if sniffed not in allowed:
        kinds = ", ".join(sorted({v.upper() for v in allowed.values()}))
        raise HTTPException(415, f"This file type isn't supported. Use {kinds}.")
    key = f"{folder}/{uuid.uuid4().hex}.{allowed[sniffed]}"
    if settings.s3_enabled:
        _client().put_object(Bucket=settings.s3_bucket, Key=key, Body=data, ContentType=sniffed)
    else:
        p = Path(settings.local_upload_dir) / key
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(data)
    if with_bytes:
        return key, sniffed, len(data), data
    return key, sniffed, len(data)


def read_file(key: str) -> bytes:
    if settings.s3_enabled:
        obj = _client().get_object(Bucket=settings.s3_bucket, Key=key)
        return obj["Body"].read()
    p = Path(settings.local_upload_dir) / key
    if not p.resolve().is_relative_to(Path(settings.local_upload_dir).resolve()) or not p.exists():
        raise HTTPException(404, "File not found.")
    return p.read_bytes()


def delete_file(key: str) -> None:
    try:
        if settings.s3_enabled:
            _client().delete_object(Bucket=settings.s3_bucket, Key=key)
        else:
            os.remove(Path(settings.local_upload_dir) / key)
    except Exception:  # noqa: BLE001
        pass
