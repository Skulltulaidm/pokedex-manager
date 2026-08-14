import { betterAuth } from "better-auth";
import { getMigrations } from "better-auth/db/migration";
import { jwt } from "better-auth/plugins";
import { Pool } from "pg";

/**
 * Better Auth migrates its own schema, because the two migration tools in this
 * repo are kept apart on purpose: Alembic owns `pokedex` and neither touches
 * the other's tables.
 *
 * The config below must mirror lib/auth.ts — a plugin added there and missed
 * here is a table this never creates. It cannot import that module: the
 * standalone build ships bundles, not the TypeScript source.
 */
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

// The adapter connects with search_path=auth and will not create that schema.
const bootstrap = new Pool({ connectionString });
await bootstrap.query('CREATE SCHEMA IF NOT EXISTS "auth"');
await bootstrap.end();

const auth = betterAuth({
  database: new Pool({ connectionString, options: "-c search_path=auth" }),
  emailAndPassword: { enabled: true },
  plugins: [jwt()],
});

const { runMigrations } = await getMigrations(auth.options);
await runMigrations();

console.log("auth schema is up to date");
process.exit(0);
