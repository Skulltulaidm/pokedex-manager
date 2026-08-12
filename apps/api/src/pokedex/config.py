from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str

    auth_jwks_url: str
    auth_issuer: str
    auth_audience: str

    # Doubles as the URL the in-app agent connects to: the chat is a client of the
    # same server external clients use, not a private side entrance.
    mcp_resource_url: str = "http://localhost:8010/mcp"

    # An alias, not a pinned version: gemini-2.5-flash was retired for new API keys
    # mid-project.
    # The scan column stores the key; the backend owns the path.
    storage_root: Path = Path("./data/scans")

    agent_model: str = "google-gla:gemini-flash-latest"
    google_api_key: str = ""

    @property
    def agent_enabled(self) -> bool:
        """Everything else must keep working when no model is configured."""
        return bool(self.google_api_key)


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
