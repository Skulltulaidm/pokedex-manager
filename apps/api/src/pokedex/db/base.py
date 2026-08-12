from sqlalchemy import MetaData
from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    # Every domain table lives in `pokedex`; the `auth` schema belongs to Better Auth.
    metadata = MetaData(schema="pokedex")
