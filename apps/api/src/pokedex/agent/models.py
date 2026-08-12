from pydantic_ai.models import Model
from pydantic_ai.models.google import GoogleModel
from pydantic_ai.models.openai import OpenAIChatModel
from pydantic_ai.providers.google import GoogleProvider
from pydantic_ai.providers.ollama import OllamaProvider

from pokedex.config import get_settings

GOOGLE_PREFIX = "google-gla:"
OLLAMA_PREFIX = "ollama:"


def build_model(name: str) -> Model | str:
    """Resolve a provider-prefixed name, passing credentials from settings.

    Providers otherwise read credentials from the process environment, which would
    make .env and os.environ two sources of truth for the same key.
    """
    settings = get_settings()

    if name.startswith(OLLAMA_PREFIX):
        return OpenAIChatModel(
            name.removeprefix(OLLAMA_PREFIX),
            provider=OllamaProvider(base_url=settings.ollama_url),
        )

    if name.startswith(GOOGLE_PREFIX) and settings.google_api_key:
        return GoogleModel(
            name.removeprefix(GOOGLE_PREFIX),
            provider=GoogleProvider(api_key=settings.google_api_key),
        )

    return name
