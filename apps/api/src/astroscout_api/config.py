from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

_REPO_ROOT: Path = Path(__file__).resolve().parents[4]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(
            _REPO_ROOT / ".env",
            Path(__file__).resolve().parents[2] / ".env",
        ),
        extra="ignore",
    )

    ads_token: str | None = None

    # RAG ingestion (write side). Web retrieval uses its own keys.
    openai_api_key: str | None = None
    openai_base_url: str | None = None  # Add this line to support the relay API.
    supabase_url: str | None = None
    supabase_service_key: str | None = None

    # Comma-separated list of allowed web origins for CORS.
    cors_origins_raw: str = "http://localhost:3000,http://127.0.0.1:3000"

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.cors_origins_raw.split(",") if o.strip()]


settings = Settings()
