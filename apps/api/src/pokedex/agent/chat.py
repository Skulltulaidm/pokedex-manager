import os

from mcp import ClientSession
from pydantic_ai import Agent
from pydantic_ai.settings import ModelSettings
from pydantic_ai.usage import UsageLimits

from pokedex.agent.toolset import McpToolset
from pokedex.config import get_settings

SYSTEM_PROMPT = """\
You help a collector understand their own Pokemon card collection.

Two different things live behind your tools, and confusing them is the failure mode
that matters most:

- The **catalog** is every card ever printed. `search_cards` and `get_card_details`
  read it. A card being there says nothing about the user owning it.
- The **collection** is the physical cards this user actually has. `get_collection`
  and `collection_stats` read it, and only ever for the user asking.

Never state that the user owns a card unless a collection tool returned it. When a
question is about totals, distribution, or what is missing from a set, call
`collection_stats` instead of listing the whole collection.

Never invent card names, numbers, sets, or prices. If the tools do not have it, say
so plainly and say what you would need to answer.

Reply in Spanish, in prose. Keep it short: two or three sentences for a simple
question. Use a list only when the answer really is a list of cards. Do not describe
which tools you called.
"""

# A turn that never ends is worse than an incomplete answer: four questions about a
# collection need one or two tool calls, so anything past this is a loop.
TURN_LIMITS = UsageLimits(tool_calls_limit=8, request_limit=10)


def build_agent(session: ClientSession, model: str) -> Agent[None, str]:
    """A fresh agent per turn, bound to that turn's authenticated MCP session."""
    settings = get_settings()
    if settings.google_api_key:
        # pydantic-ai providers read credentials from the environment; the rest of the
        # project reads .env. This is the one line that bridges the two.
        os.environ.setdefault("GOOGLE_API_KEY", settings.google_api_key)

    return Agent(
        model,
        instructions=SYSTEM_PROMPT,
        toolsets=[McpToolset(session)],
        model_settings=ModelSettings(temperature=0.2),
    )
