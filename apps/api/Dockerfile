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
# The domain tables carry foreign keys into auth.user, which Better Auth
# creates from the web service. Both start at once on a fresh deployment, so
# this waits for that schema rather than crash-looping until someone notices.
CMD ["sh", "-c", "for i in $(seq 1 30); do alembic upgrade head && break; echo 'waiting for the auth schema'; sleep 5; done; alembic current | grep -q . && exec fastapi run src/pokedex/main.py --host 0.0.0.0 --port 8000"]
