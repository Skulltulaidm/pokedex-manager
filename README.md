# PokéDex Manager

Catalogue a physical Pokémon card collection by photographing it, price it, and
trade it — then ask questions about all of it in plain language.

The interesting problem is not storage. It is that a shoebox of cards is
unreadable: you cannot tell what you have, what is worth something, or what you
are three cards away from completing. This turns a pile into a portfolio you can
query, value and swap, and the same data is reachable two ways — a REST API for
the web app, and an **MCP server** any assistant can connect to.

What it does, beyond cataloguing:

- **A portfolio.** Cost against market value, position by position, plus how few
  cards carry half of it. Prices are read once a day, so the series is real.
- **Trading.** Matching against other collectors, offers and counter-offers, and
  an open board where a proposal is published to nobody in particular and taken
  by whoever can fill it. Condition adjusts what a card is worth.
- **A trade simulator**, including one the assistant builds for you out of what
  you hold spare against what you actually want.
- **Direct messages**, because the deal happens in words.
- **An assistant** with thirteen tools over MCP, and a memory of what you told it.

---

## Quick start

Requires Docker, Node 20+, and [uv](https://docs.astral.sh/uv/).

```bash
cp .env.example .env
cp apps/api/.env.example apps/api/.env

docker compose up -d db          # Postgres 18, loopback only
npm install

npx @better-auth/cli@latest migrate -c apps/web --yes   # auth schema

cd apps/api
uv sync
uv run alembic upgrade head      # domain schema
uv run pokedex-sync base1        # seed the card catalogue (~3s)
cd ../..

npm run dev                      # web on :3000, api on :8010
```

Open http://localhost:3000 and create an account.

The two schemas are migrated by different tools on purpose: Better Auth owns
`auth` and Alembic owns `pokedex`, and neither is allowed to touch the other.

The chat and the scanner need a model. Put a Gemini key in `.env`:

```
GOOGLE_API_KEY=...
```

Without one the app works fully except those two: the chat answers 503 and a
scan degrades to manual entry.

To run vision locally instead, install [Ollama](https://ollama.com), then:

```bash
ollama pull qwen2.5vl:7b
echo 'VISION_MODEL=ollama:qwen2.5vl:7b' >> .env
```

The api container reaches a host Ollama through `host.docker.internal`, which is
already wired up.

---

## Deploying

Both images are self-sufficient: each brings up the schema it owns before it
serves. Alembic owns `pokedex`, Better Auth owns `auth`, and the API waits for
the second because its foreign keys point into it.

What a host needs to set:

| Service | Variables |
| ------- | --------- |
| api | `DATABASE_URL` (asyncpg), `AUTH_JWKS_URL`, `AUTH_ISSUER`, `AUTH_AUDIENCE`, `CORS_ORIGINS`, `PORT` |
| web | `DATABASE_URL`, `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET`, `NEXT_PUBLIC_API_URL`, `PORT`, `HOSTNAME=0.0.0.0` |

`NEXT_PUBLIC_API_URL` is baked into the client bundle at build time, so it must
be the URL a browser can reach — not the one the container uses.

Populate a fresh deployment with `pokedex-sync base1 base2 base3` for the
catalogue, and `pokedex-seed --count 1000` for a marketplace to look at.

---

## The MCP server

The collection is exposed over MCP at `http://localhost:8010/mcp`, using the
same JWT the REST API accepts and the same service layer underneath. The in-app
chat is a client of this server, not a parallel path to the data.

Generate a token while signed in (`/api/auth/token` returns one), then point any
MCP client at it:

```json
{
  "mcpServers": {
    "pokedex": {
      "url": "http://localhost:8010/mcp",
      "headers": { "Authorization": "Bearer <token>" }
    }
  }
}
```

Seven tools. Six read; exactly one writes, and it cannot reach the collection:

| Tool               |                                                |
| ------------------ | ---------------------------------------------- |
| `search_cards`     | the published catalogue, not your cards        |
| `get_card_details` | one card, printed layer and species layer      |
| `get_collection`   | the cards you actually own                     |
| `collection_stats` | totals, types, per-set coverage                |
| `find_gaps`        | what is missing from sets you started          |
| `get_wishlist`     | what you want, including assistant suggestions |
| `suggest_card`     | **write** — proposes a card for the wishlist   |

A tool that cannot resolve its user fails rather than falling back to a default.

---

## What it does

|                |                                                                                                                                      |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| **Scan**       | Photograph a card. The model transcribes what is printed; the lookup decides which card that is and shows why.                       |
| **Collection** | Search, filter by type, sort by name, number or price. Two cards can be compared side by side.                                       |
| **Summary**    | Composition by type, per-set coverage, estimated value in USD with the share of cards that carry a price.                            |
| **Ask**        | Chat about the collection in Spanish. The assistant reads through the MCP server and remembers standing facts between conversations. |
| **Share**      | A revocable public link, and CSV or JSON export.                                                                                     |

The public view is a separate schema from the owner's: notes and acquisition
dates never leave the account.

---

## Architecture

```
apps/web    Next.js 16 · Better Auth · TanStack Query · client generated by Kubb
apps/api    FastAPI · SQLAlchemy · pydantic-ai · MCP SDK
packages/ui shadcn components on Base UI, shared design tokens
```

Auth crosses the boundary once: Better Auth mints an Ed25519 JWT, FastAPI
verifies it offline against JWKS and never calls back.

Two schemas in one database. `auth` belongs to Better Auth; `pokedex` belongs to
Alembic, which is filtered so autogenerate never proposes dropping the other's
tables.

**Cards and species are separate layers.** A card is a printing; a species is
the Pokémon it depicts. They are joined by the source's own `dexId`, not by
matching names.

**Scanning splits three decisions.** The model reads what is printed on the
card. The code decides which card that is, by scoring every signal rather than
filtering on any one — a misread HP costs its weight instead of discarding the
right card. The user decides what to save, and only when the ambiguity is real.

---

## Verifying

```bash
npm run test        # 128 tests
npm run typecheck   # mypy strict + tsc
npm run lint
```

Tests run against the live database with each test in a transaction that is
always rolled back.

---

## Known limits

- One catalogue set is seeded by default; `pokedex-sync <set-id>` adds more.
- Images and files are served over plain HTTP on localhost; there is no TLS.
- Prices are not wired up, so no collection value is reported.
- Scan images are stored on a local volume; there is no cleanup job.
- The app is built to run locally and has never been deployed.
