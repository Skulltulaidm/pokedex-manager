import { betterAuth } from "better-auth";
import { jwt } from "better-auth/plugins";
import { Pool } from "pg";

export const auth = betterAuth({
  database: new Pool({
    connectionString: process.env.DATABASE_URL,
    // The Kysely adapter takes no schema option, so the connection is scoped
    // instead to keep Better Auth's tables out of public.
    options: "-c search_path=auth",
  }),
  emailAndPassword: {
    enabled: true,
  },
  plugins: [jwt()],
});
