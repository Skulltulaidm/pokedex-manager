"use client";

import client, {
  setConfig,
  type Client,
} from "@kubb/plugin-client/clients/fetch";

setConfig({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8010",
});

let cachedToken: string | null = null;

export async function getAccessToken(): Promise<string | null> {
  if (cachedToken) return cachedToken;

  // Better Auth mints the JWT from the session cookie; the API never sees the cookie.
  const response = await fetch("/api/auth/token", { credentials: "include" });
  if (!response.ok) return null;

  const { token } = (await response.json()) as { token?: string };
  cachedToken = token ?? null;
  return cachedToken;
}

export function clearAccessToken(): void {
  cachedToken = null;
}

export const apiClient: Client = async (config) => {
  const token = await getAccessToken();

  // Kubb's fetch client stringifies the body without declaring the type, so the
  // browser sends text/plain and FastAPI rejects the request.
  const isJsonBody =
    config.data !== undefined && !(config.data instanceof FormData);

  return client({
    ...config,
    headers: {
      ...(isJsonBody ? { "Content-Type": "application/json" } : {}),
      ...(config.headers as Record<string, string> | undefined),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
};
