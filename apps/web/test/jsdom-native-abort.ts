import type { Environment } from "vitest/environments";
import { builtinEnvironments } from "vitest/environments";

/**
 * jsdom plus Node's own AbortController.
 *
 * jsdom installs its AbortController over Node's, and `fetch` — still Node's,
 * since jsdom has none — rejects any signal that is not from the implementation
 * it was built with. React Query hands a signal to every query, so without this
 * every request in a component test fails before it is sent.
 */
export default <Environment>{
  name: "jsdom-native-abort",
  transformMode: "web",
  async setup(global, options) {
    const controller = global.AbortController;
    const signal = global.AbortSignal;
    const { teardown } = await builtinEnvironments.jsdom.setup(global, options);

    Object.defineProperties(global, {
      AbortController: { value: controller, writable: true, configurable: true },
      AbortSignal: { value: signal, writable: true, configurable: true },
    });

    return { teardown };
  },
};
