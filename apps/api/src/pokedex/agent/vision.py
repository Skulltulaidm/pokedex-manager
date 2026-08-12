from typing import Any

from pydantic_ai import Agent, BinaryContent, PromptedOutput

from pokedex.agent.models import OLLAMA_PREFIX, build_model
from pokedex.schemas.scan import CardReading

PROMPT = """\
Transcribe only what is printed on this Pokemon trading card.

Do not infer or identify which card this is — another system does that. If a
field is not legible, return null; do not guess.

The collector number usually appears as X/Y near a bottom corner: X is
collector_number and Y is set_total. Read them as printed, including any letter
prefix. HP appears at the top right. rarity_symbol is the small shape beside the
collector number.
"""

def build_output(name: str, schema: Any = CardReading) -> Any:
    # Structured output defaults to tool calling, which the open vision models
    # served by Ollama do not implement. Prompting for JSON works on any of them.
    if name.startswith(OLLAMA_PREFIX):
        return PromptedOutput(schema)
    return schema


async def read_card(image: bytes, model: str) -> CardReading:
    """Transcribe a card photo. Raises on provider failure; the caller decides."""
    agent = Agent(build_model(model), output_type=build_output(model), instructions=PROMPT)
    result = await agent.run([BinaryContent(data=image, media_type="image/jpeg")])
    return CardReading.model_validate(result.output)
