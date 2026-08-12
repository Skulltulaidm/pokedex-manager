from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str

    auth_jwks_url: str
    auth_issuer: str
    auth_audience: str

    # Advertised in OAuth discovery, so it must be the URL an external client
    # dials from outside the network the server runs in.
    mcp_resource_url: str = "http://localhost:8010/mcp"

    # Where the in-app agent connects. Same server, but reached from inside: in a
    # container the published port does not exist.
    mcp_internal_url: str = ""

    @property
    def mcp_agent_url(self) -> str:
        return self.mcp_internal_url or self.mcp_resource_url

    # An alias, not a pinned version: gemini-2.5-flash was retired for new API keys
    # mid-project.
    # The scan column stores the key; the backend owns the path.
    storage_root: Path = Path("./data/scans")

    agent_model: str = "google-gla:gemini-flash-latest"
    google_api_key: str = ""

    vision_model: str = "google-gla:gemini-flash-latest"
    ollama_url: str = "http://localhost:11434/v1"

    @property
    def agent_enabled(self) -> bool:
        """Everything else must keep working when no model is configured."""
        return bool(self.google_api_key)


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
