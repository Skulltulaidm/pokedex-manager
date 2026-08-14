import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { API, server } from "@/test/server";
import { ApiError, apiClient, clearAccessToken, getAccessToken } from "./api-client";

beforeEach(() => clearAccessToken());

function respond(status: number, body: Parameters<typeof HttpResponse.json>[0]) {
  server.use(http.get(`${API}/thing`, () => HttpResponse.json(body, { status })));
}

describe("apiClient success", () => {
  it("hands the body back when the API accepted the request", async () => {
    respond(200, { id: "base1-4" });

    await expect(apiClient({ method: "GET", url: "/thing" })).resolves.toMatchObject({
      status: 200,
      data: { id: "base1-4" },
    });
  });

  it("treats a redirect as a body worth passing on, not an error", async () => {
    respond(304, {});

    await expect(apiClient({ method: "GET", url: "/thing" })).resolves.toMatchObject({
      status: 304,
    });
  });
});

describe("apiClient failure", () => {
  it("throws instead of letting an error body flow on as data", async () => {
    respond(404, { detail: "Card not found" });

    const error = await apiClient({ method: "GET", url: "/thing" }).catch((e) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(404);
    expect(error.detail).toBe("Card not found");
    expect(error.name).toBe("ApiError");
  });

  it("reads the first message out of a FastAPI validation error", async () => {
    respond(422, {
      detail: [{ loc: ["body", "quantity"], msg: "Input should be greater than 0" }],
    });

    const error = await apiClient({ method: "GET", url: "/thing" }).catch((e) => e);

    expect(error.detail).toBe("Input should be greater than 0");
  });

  it("says nothing rather than something wrong when the body is not FastAPI's", async () => {
    respond(500, { error: "boom" });

    const error = await apiClient({ method: "GET", url: "/thing" }).catch((e) => e);

    expect(error.detail).toBeNull();
    expect(error.message).toBe("La petición falló con estado 500.");
  });

  it("survives an error body that is not an object at all", async () => {
    respond(503, "gateway down");

    const error = await apiClient({ method: "GET", url: "/thing" }).catch((e) => e);

    expect(error.detail).toBeNull();
    expect(error.status).toBe(503);
  });
});

describe("apiClient headers", () => {
  function capture() {
    const seen: Headers[] = [];
    server.use(
      http.post(`${API}/thing`, ({ request }) => {
        seen.push(request.headers);
        return HttpResponse.json({});
      }),
    );
    return seen;
  }

  it("carries the token Better Auth minted from the session cookie", async () => {
    const seen = capture();

    await apiClient({ method: "POST", url: "/thing", data: { a: 1 } });

    expect(seen[0]?.get("authorization")).toBe("Bearer test-token");
  });

  it("asks for the token once and reuses it", async () => {
    const seen = capture();
    const minted = vi.fn(() => HttpResponse.json({ token: "test-token" }));
    server.use(http.get("*/api/auth/token", minted));

    await apiClient({ method: "POST", url: "/thing", data: { a: 1 } });
    await apiClient({ method: "POST", url: "/thing", data: { a: 1 } });

    expect(minted).toHaveBeenCalledTimes(1);
    expect(seen).toHaveLength(2);
  });

  it("sends the request unauthenticated when there is no session", async () => {
    const seen = capture();
    server.use(http.get("*/api/auth/token", () => new HttpResponse(null, { status: 401 })));

    await apiClient({ method: "POST", url: "/thing", data: { a: 1 } });

    expect(seen[0]?.get("authorization")).toBeNull();
    await expect(getAccessToken()).resolves.toBeNull();
  });

  it("declares JSON, because the client stringifies the body either way", async () => {
    const seen = capture();

    await apiClient({ method: "POST", url: "/thing", data: { card_id: "base1-4" } });

    expect(seen[0]?.get("content-type")).toBe("application/json");
  });

  it("leaves the content type to the browser for a multipart upload", async () => {
    const seen = capture();
    const form = new FormData();
    form.append("image", new Blob(["scan"]), "scan.png");

    await apiClient({ method: "POST", url: "/thing", data: form });

    expect(seen[0]?.get("content-type")).not.toBe("application/json");
  });

  it("does not let a caller's header knock the token out", async () => {
    const seen = capture();

    await apiClient({
      method: "POST",
      url: "/thing",
      data: { a: 1 },
      headers: { Authorization: "Bearer stale" },
    });

    expect(seen[0]?.get("authorization")).toBe("Bearer test-token");
  });
});
