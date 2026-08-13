"use client";

import client, {
  setConfig,
  type Client,
  type RequestConfig,
  type ResponseConfig,
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

/**
 * A response the API refused.
 *
 * `detail` is the API's own wording. Most of it is written for a developer and
 * in English, so a caller has to decide it is showable before rendering it.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly detail: string | null,
  ) {
    super(detail ?? `La petición falló con estado ${status}.`);
    this.name = "ApiError";
  }
}

/** FastAPI sends a string for a raised error and a list for schema validation. */
function detailOf(data: unknown): string | null {
  if (typeof data !== "object" || data === null) return null;

  const { detail } = data as { detail?: unknown };
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail) && typeof detail[0]?.msg === "string") {
    return detail[0].msg as string;
  }

  return null;
}

export const apiClient: Client = async <TResponseData, TError = unknown, TRequestData = unknown>(
  config: RequestConfig<TRequestData>,
): Promise<ResponseConfig<TResponseData>> => {
  const token = await getAccessToken();

  // Kubb's fetch client stringifies the body without declaring the type, so the
  // browser sends text/plain and FastAPI rejects the request.
  const isJsonBody =
    config.data !== undefined && !(config.data instanceof FormData);

  const response = await client<TResponseData, TError, TRequestData>({
    ...config,
    headers: {
      ...(isJsonBody ? { "Content-Type": "application/json" } : {}),
      ...(config.headers as Record<string, string> | undefined),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  // Kubb's client resolves on every status, so without this an error body flows
  // on as if it were the response, and the caller renders it as data.
  if (response.status >= 400) {
    throw new ApiError(response.status, detailOf(response.data));
  }

  return response;
};
