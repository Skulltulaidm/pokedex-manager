from sqlalchemy import Column, Table, Text

from pokedex.db.base import Base

# Better Auth owns this table and its migrations. It is registered here only so
# cross-schema foreign keys resolve; alembic's include_object hook skips it.
auth_user = Table(
    "user",
    Base.metadata,
    Column("id", Text, primary_key=True),
    schema="auth",
)
