FROM ghcr.io/astral-sh/uv:python3.13-bookworm-slim

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    PYTHONUNBUFFERED=1

WORKDIR /app

# Dependencies resolve from the lockfile alone, so this layer survives every
# change that does not touch it.
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-install-project --no-dev

# Declared as the package readme in pyproject, so the build backend needs it.
COPY README.md alembic.ini ./
COPY alembic ./alembic
COPY src ./src
RUN uv sync --frozen --no-dev

ENV PATH="/app/.venv/bin:$PATH" \
    STORAGE_ROOT=/data/scans

EXPOSE 8000
CMD ["sh", "-c", "alembic upgrade head && fastapi run src/pokedex/main.py --host 0.0.0.0 --port 8000"]
