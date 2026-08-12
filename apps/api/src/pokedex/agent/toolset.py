from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

import httpx2
import pydantic_core
from mcp import ClientSession
from mcp.client.streamable_http import streamable_http_client
from pydantic_ai.exceptions import ModelRetry
from pydantic_ai.tools import RunContext, ToolDefinition
from pydantic_ai.toolsets import AbstractToolset, ToolsetTool

# Tool arguments arrive already shaped by the model against the MCP schema; this
# validator passes them through instead of imposing a second Python-side model.
ARGS_VALIDATOR = pydantic_core.SchemaValidator(
    schema=pydantic_core.core_schema.dict_schema(
        pydantic_core.core_schema.str_schema(), pydantic_core.core_schema.any_schema()
    )
)

# The stream stays open for the whole turn, so the read timeout has to outlive the
# model's thinking, not just one tool call.
READ_TIMEOUT = 120.0


class McpToolset(AbstractToolset[Any]):
    """Exposes a live MCP session as a pydantic-ai toolset.

    pydantic-ai's own MCP client targets SDK 1.x and fails to import against 2.0,
    which renamed the wire fields and moved RequestContext.
    """

    def __init__(self, session: ClientSession) -> None:
        self.session = session

    @property
    def id(self) -> str:
        return "pokedex-mcp"

    async def get_tools(self, ctx: RunContext[Any]) -> dict[str, ToolsetTool[Any]]:
        listed = await self.session.list_tools()
        return {
            tool.name: ToolsetTool(
                toolset=self,
                tool_def=ToolDefinition(
                    name=tool.name,
                    description=tool.description,
                    parameters_json_schema=tool.input_schema,
                ),
                max_retries=1,
                args_validator=ARGS_VALIDATOR,
            )
            for tool in listed.tools
        }

    async def call_tool(
        self,
        name: str,
        tool_args: dict[str, Any],
        ctx: RunContext[Any],
        tool: ToolsetTool[Any],
    ) -> Any:
        result = await self.session.call_tool(name, tool_args)

        if result.is_error:
            # ModelRetry hands the failure back to the model as a tool result, which
            # lets it correct a bad argument instead of aborting the whole turn.
            raise ModelRetry(_text(result.content) or "tool call failed")

        if result.structured_content is not None:
            return result.structured_content
        return _text(result.content)


def _text(content: list[Any]) -> str:
    return "\n".join(block.text for block in content if getattr(block, "text", None))


@asynccontextmanager
async def mcp_session(url: str, token: str) -> AsyncIterator[ClientSession]:
    """One MCP session per chat turn, so the agent acts as the caller rather than
    as a shared service identity."""
    async with (
        httpx2.AsyncClient(
            headers={"Authorization": f"Bearer {token}"},
            timeout=httpx2.Timeout(30.0, read=READ_TIMEOUT),
            follow_redirects=True,
        ) as http,
        streamable_http_client(url, http_client=http) as (read, write),
        ClientSession(read, write) as session,
    ):
        await session.initialize()
        yield session
