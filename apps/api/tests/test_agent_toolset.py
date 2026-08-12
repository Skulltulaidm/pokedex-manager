from typing import Any

import pytest
from mcp.types import CallToolResult, ListToolsResult, TextContent, Tool
from pydantic_ai.exceptions import ModelRetry

from pokedex.agent.toolset import McpToolset

SCHEMA = {"type": "object", "properties": {"query": {"type": "string"}}}


class FakeSession:
    """Stands in for a live MCP session: only the two calls the toolset makes."""

    def __init__(self, result: CallToolResult) -> None:
        self.result = result
        self.calls: list[tuple[str, dict[str, Any]]] = []

    async def list_tools(self) -> ListToolsResult:
        return ListToolsResult(
            tools=[Tool(name="search_cards", description="Search the catalog", inputSchema=SCHEMA)]
        )

    async def call_tool(self, name: str, args: dict[str, Any]) -> CallToolResult:
        self.calls.append((name, args))
        return self.result


def toolset(result: CallToolResult) -> tuple[McpToolset, FakeSession]:
    session = FakeSession(result)
    return McpToolset(session), session  # type: ignore[arg-type]


def ok(structured: dict[str, Any] | None, text: str = "") -> CallToolResult:
    return CallToolResult(
        content=[TextContent(type="text", text=text)],
        structuredContent=structured,
        isError=False,
    )


async def test_get_tools_maps_the_mcp_schema() -> None:
    tools, _ = toolset(ok({}))

    exposed = await tools.get_tools(None)  # type: ignore[arg-type]

    assert set(exposed) == {"search_cards"}
    definition = exposed["search_cards"].tool_def
    assert definition.description == "Search the catalog"
    assert definition.parameters_json_schema == SCHEMA


async def test_call_tool_returns_structured_content() -> None:
    tools, session = toolset(ok({"count": 1, "cards": [{"id": "base1-4"}]}))

    result = await tools.call_tool("search_cards", {"query": "chari"}, None, None)  # type: ignore[arg-type]

    assert result == {"count": 1, "cards": [{"id": "base1-4"}]}
    assert session.calls == [("search_cards", {"query": "chari"})]


async def test_call_tool_falls_back_to_text() -> None:
    tools, _ = toolset(ok(None, text="no results"))

    result = await tools.call_tool("search_cards", {}, None, None)  # type: ignore[arg-type]

    assert result == "no results"


async def test_tool_error_becomes_a_model_retry() -> None:
    """A failed tool should reach the model as a result it can correct, not as a crash."""
    failed = CallToolResult(
        content=[TextContent(type="text", text="unknown set_id")],
        structuredContent=None,
        isError=True,
    )
    tools, _ = toolset(failed)

    with pytest.raises(ModelRetry, match="unknown set_id"):
        await tools.call_tool("search_cards", {"set_id": "nope"}, None, None)  # type: ignore[arg-type]
