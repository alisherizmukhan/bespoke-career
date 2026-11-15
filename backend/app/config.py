from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    env: str = "development"
    database_url: str = "sqlite:///./carenear.db"
    jwt_secret: str = "dev-only-change-me"
    jwt_expires_minutes: int = 60 * 24 * 7
    file_signing_ttl_seconds: int = 60 * 30
    cors_origins: str = "http://localhost:3000"
    frontend_url: str = "http://localhost:3000"
    public_api_url: str = "http://localhost:8000"

    admin_email: str = "admin@bespoke.app"
    admin_password: str = "ChangeMe-Admin-2026"
    seed_demo_data: bool = True

    # Email (SMTP). Without it, verification links go back to the registrant (demo mode)
    # and reset links are written to server logs only.
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = "Bespoke <no-reply@bespoke.app>"

    # Payments. With STRIPE_SECRET_KEY set, checkout goes through Stripe (sk_test_ = Stripe test mode, sk_live_ = real
    # charges). Without it, billing runs in the built-in test mode that records subscriptions but takes no payment.
    stripe_secret_key: str = ""
    stripe_webhook_secret: str = ""

    # AI provider. "openai" (default) or "anthropic"; without a key, AI features fall back to rule-based logic.
    ai_provider: str = "openai"
    openai_api_key: str = ""
    openai_model: str = "gpt-5.5"            # smart tier: complex tasks
    openai_model_fast: str = "gpt-5.4-mini"  # fast tier: everyday answers and simple extraction
    anthropic_api_key: str = ""
    anthropic_model: str = "claude-opus-5-5"

    # Job ingestion
    ingest_enabled: bool = True
    ingest_interval_minutes: int = 60
    ingest_user_agent: str = "Mozilla/5.0 (compatible; BespokeJobs/1.0)"
    ingest_request_delay_s: float = 1.2
    job_ttl_days: int = 45
    # Optional keyed job APIs (free registration): enable the matching sources in the admin panel.
    adzuna_app_id: str = ""
    adzuna_app_key: str = ""
    usajobs_api_key: str = ""
    usajobs_email: str = ""

    # Storage
    s3_endpoint: str = ""
    s3_bucket: str = ""
    s3_region: str = "auto"
    s3_access_key_id: str = ""
    s3_secret_access_key: str = ""
    local_upload_dir: str = "./uploads"
    max_upload_mb: int = 10

    @property
    def sqlalchemy_url(self) -> str:
        url = self.database_url
        if url.startswith("postgres://"):
            url = "postgresql://" + url[len("postgres://"):]
        if url.startswith("postgresql://"):
            url = "postgresql+psycopg://" + url[len("postgresql://"):]
        return url

    @property
    def cors_list(self) -> list[str]:
        return [o.strip().rstrip("/") for o in self.cors_origins.split(",") if o.strip()]

    @property
    def ai_enabled(self) -> bool:
        return bool(self.openai_api_key if self.ai_provider == "openai" else self.anthropic_api_key)

    @property
    def ai_model(self) -> str:
        return self.openai_model if self.ai_provider == "openai" else self.anthropic_model

    @property
    def email_enabled(self) -> bool:
        return bool(self.smtp_host)

    @property
    def s3_enabled(self) -> bool:
        return bool(self.s3_bucket and self.s3_access_key_id)

    @property
    def stripe_enabled(self) -> bool:
        return self.stripe_secret_key.startswith(("sk_test_", "sk_live_", "rk_test_", "rk_live_"))

    @property
    def stripe_live(self) -> bool:
        return self.stripe_secret_key.startswith(("sk_live_", "rk_live_"))


@lru_cache
def get_settings() -> Settings:
    return Settings()
