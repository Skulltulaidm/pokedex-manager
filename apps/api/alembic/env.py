import asyncio
from logging.config import fileConfig
from typing import Any

from sqlalchemy import pool, text
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

from alembic import context
from pokedex.config import get_settings
from pokedex.db import Base
from pokedex.db import models as _models  # noqa: F401  (registers mappers on Base.metadata)
from pokedex.db.session import CONNECT_ARGS

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

config.set_main_option("sqlalchemy.url", get_settings().database_url)

target_metadata = Base.metadata

DOMAIN_SCHEMA = "pokedex"


def include_name(name: str | None, type_: str, parent_names: dict[str, Any]) -> bool:
    # Without this filter autogenerate reflects Better Auth's `auth` tables and
    # proposes dropping them, since they are absent from Base.metadata.
    if type_ == "schema":
        return name == DOMAIN_SCHEMA
    return True


def include_object(
    obj: Any, name: str | None, type_: str, reflected: bool, compare_to: Any
) -> bool:
    # `auth.user` is registered in Base.metadata only so cross-schema foreign
    # keys resolve; alembic must never try to create or drop it.
    if type_ == "table":
        return bool(getattr(obj, "schema", None) == DOMAIN_SCHEMA)
    return True


def _context_options() -> dict[str, Any]:
    return {
        "target_metadata": target_metadata,
        "include_schemas": True,
        "include_name": include_name,
        "include_object": include_object,
        "version_table_schema": DOMAIN_SCHEMA,
        "compare_type": True,
    }


def run_migrations_offline() -> None:
    context.configure(
        url=config.get_main_option("sqlalchemy.url"),
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        **_context_options(),
    )

    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    context.configure(connection=connection, **_context_options())

    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
        connect_args=CONNECT_ARGS,
    )

    async with connectable.connect() as connection:
        # The first migration writes into this schema and indexes with
        # gin_trgm_ops, so neither the schema nor the extension can be created
        # by anything inside the chain.
        await connection.execute(text(f'CREATE SCHEMA IF NOT EXISTS "{DOMAIN_SCHEMA}"'))
        await connection.execute(text("CREATE EXTENSION IF NOT EXISTS pg_trgm"))
        await connection.commit()
        await connection.run_sync(do_run_migrations)

    await connectable.dispose()


def run_migrations_online() -> None:
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
