import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient();

/**
 * A hard navigation, not a router one.
 *
 * The session store is module-level and refreshes on a timeout that lands after
 * React's effects, so a client-side navigation hands the next screen the state
 * from before the transition: signing in bounced straight back to the form, and
 * signing out still looked signed in until something forced a refetch.
 */
export function leaveTo(path: string): void {
  window.location.replace(path);
}
