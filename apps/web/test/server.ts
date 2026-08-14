import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";

export const API = process.env.NEXT_PUBLIC_API_URL ?? "http://api.test";

/**
 * The network is mocked at the fetch boundary rather than by stubbing the
 * generated client, so `apiClient` — the layer that turns a 4xx body into an
 * `ApiError` — runs for real in every component test.
 */
export const server = setupServer(
  http.get("*/api/auth/token", () => HttpResponse.json({ token: "test-token" })),
);
