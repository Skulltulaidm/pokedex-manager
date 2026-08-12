import httpx
from pydantic import BaseModel, Field
from pydantic_ai import Agent, BinaryContent

from pokedex.agent.models import build_model
from pokedex.agent.vision import build_output

PROMPT = """\
You are shown two Pokemon trading cards, A then B.

Describe what differs in how they were printed and how they look: artwork,
frame, holo treatment, era, apparent wear. Compare only what is visible in the
images.

Say nothing about which is worth more, and nothing about game statistics — the
reader already has both. If the two images look like the same printing, say so
plainly. Reply in Spanish.
"""

TIMEOUT = httpx.Timeout(20.0, connect=5.0)


class VisualComparison(BaseModel):
    """What the model saw, kept short enough to read beside the cards."""

    summary: str = Field(max_length=400)
    differences: list[str] = Field(default_factory=list, max_length=4)


async def compare_images(a: str, b: str, model: str) -> VisualComparison:
    """Fetch both card images and ask the model what differs.

    The images are read from their source rather than passed as URLs: the model
    should be looking at the same bytes the user is.
    """
    async with httpx.AsyncClient(timeout=TIMEOUT, follow_redirects=True) as http:
        images = [(await http.get(url)).content for url in (a, b)]

    agent = Agent(
        build_model(model), output_type=build_output(model, VisualComparison), instructions=PROMPT
    )
    result = await agent.run(
        [
            "Card A:",
            BinaryContent(data=images[0], media_type="image/webp"),
            "Card B:",
            BinaryContent(data=images[1], media_type="image/webp"),
        ]
    )
    return VisualComparison.model_validate(result.output)
