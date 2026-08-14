FROM node:22-slim AS builder
WORKDIR /repo

COPY package.json package-lock.json turbo.json ./
COPY apps/web/package.json apps/web/
COPY packages/ui/package.json packages/ui/
RUN npm ci

COPY tsconfig.json ./
COPY packages ./packages
COPY apps/web ./apps/web

# Baked into the client bundle at build time, so it has to be the URL a browser
# on the host can reach, not the one the container uses.
ARG NEXT_PUBLIC_API_URL=http://localhost:8010
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
RUN npm run build --workspace web


FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /repo/apps/web/.next/standalone ./
COPY --from=builder /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /repo/apps/web/public ./apps/web/public
COPY --from=builder /repo/apps/web/scripts ./apps/web/scripts

EXPOSE 3000
# Better Auth brings its own schema up before the server that depends on it.
CMD ["sh", "-c", "node apps/web/scripts/migrate-auth.mjs && node apps/web/server.js"]
