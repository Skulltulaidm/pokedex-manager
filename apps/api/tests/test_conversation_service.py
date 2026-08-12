import pydantic_core
from pydantic_ai.messages import (
    ModelRequest,
    ModelResponse,
    TextPart,
    ToolCallPart,
    ToolReturnPart,
    UserPromptPart,
)

from pokedex.services.conversation import TITLE_MAX, _visible_text, title_from

# The shape a real turn takes once the agent has used a tool: four messages, of
# which only the first and last carry anything a person wrote or read.
TURN = [
    ModelRequest(parts=[UserPromptPart(content="¿Tengo algún Charizard?")]),
    ModelResponse(parts=[ToolCallPart(tool_name="get_collection", args={"type": "fire"})]),
    ModelRequest(
        parts=[
            ToolReturnPart(
                tool_name="get_collection", content={"count": 1}, tool_call_id="call-1"
            )
        ]
    ),
    ModelResponse(parts=[TextPart(content="Sí, tienes un Charizard del Base Set.")]),
]


def serialized() -> list[dict[str, object]]:
    return pydantic_core.to_jsonable_python(TURN)


def test_visible_text_keeps_only_what_a_person_wrote_or_read() -> None:
    texts = [_visible_text(payload) for payload in serialized()]

    assert texts == [
        "¿Tengo algún Charizard?",
        "",
        "",
        "Sí, tienes un Charizard del Base Set.",
    ]


def test_title_collapses_whitespace() -> None:
    assert title_from("  ¿Tengo\n  algún   Charizard?  ") == "¿Tengo algún Charizard?"


def test_long_title_is_truncated_with_an_ellipsis() -> None:
    title = title_from("¿" + "a" * 200)

    assert len(title) == TITLE_MAX
    assert title.endswith("…")
