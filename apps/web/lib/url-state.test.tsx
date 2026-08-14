import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useUrlState } from "./url-state";

function visit(search = "") {
  window.history.replaceState(null, "", `/mercado${search}`);
}

beforeEach(() => visit());
afterEach(() => vi.restoreAllMocks());

describe("useUrlState", () => {
  it("seeds the defaults the URL does not already carry", () => {
    visit("?sort=price");
    const { result } = renderHook(() => useUrlState({ sort: "name", owned: "all" }));

    expect(result.current[0].get("sort")).toBe("price");
    expect(result.current[0].get("owned")).toBe("all");
  });

  it("leaves the address bar alone until something is set", () => {
    visit("?sort=price");
    renderHook(() => useUrlState({ owned: "all" }));

    expect(window.location.search).toBe("?sort=price");
  });

  it("ignores a default that is undefined", () => {
    renderHook(() => useUrlState({ set_id: undefined }));

    expect(window.location.search).toBe("");
  });

  it("writes the URL without navigating", () => {
    const push = vi.spyOn(window.history, "pushState");
    const popped = vi.fn();
    window.addEventListener("popstate", popped);

    const { result } = renderHook(() => useUrlState());
    act(() => result.current[1]({ owned: "owned" }));

    expect(window.location.pathname + window.location.search).toBe("/mercado?owned=owned");
    expect(result.current[0].get("owned")).toBe("owned");
    // A replace is not a navigation: nothing subscribed to the router — which is
    // why `useSearchParams` cannot be the reader — hears about it.
    expect(push).not.toHaveBeenCalled();
    expect(popped).not.toHaveBeenCalled();

    window.removeEventListener("popstate", popped);
  });

  it("merges into what is already there instead of replacing it", () => {
    visit("?sort=price");
    const { result } = renderHook(() => useUrlState());

    act(() => result.current[1]({ owned: "owned" }));
    act(() => result.current[1]({ search: "pikachu" }));

    expect(result.current[0].get("sort")).toBe("price");
    expect(result.current[0].get("owned")).toBe("owned");
    expect(result.current[0].get("search")).toBe("pikachu");
  });

  it("drops a key set to undefined or to the empty string", () => {
    visit("?sort=price&search=pikachu");
    const { result } = renderHook(() => useUrlState());

    act(() => result.current[1]({ search: "" }));
    expect(result.current[0].has("search")).toBe(false);

    act(() => result.current[1]({ sort: undefined }));
    expect(result.current[0].has("sort")).toBe(false);
  });

  it("leaves a bare path when the last key goes", () => {
    visit("?sort=price");
    const { result } = renderHook(() => useUrlState());

    act(() => result.current[1]({ sort: undefined }));

    expect(window.location.search).toBe("");
    expect(window.location.pathname).toBe("/mercado");
  });

  it("re-reads the URL when the back button rewrites it", () => {
    const { result } = renderHook(() => useUrlState());
    act(() => result.current[1]({ owned: "owned" }));

    act(() => {
      window.history.replaceState(null, "", "/mercado?owned=missing");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });

    expect(result.current[0].get("owned")).toBe("missing");
  });

  it("stops listening for the back button once unmounted", () => {
    const remove = vi.spyOn(window, "removeEventListener");
    const { unmount } = renderHook(() => useUrlState());

    unmount();

    expect(remove).toHaveBeenCalledWith("popstate", expect.any(Function));
  });
});
