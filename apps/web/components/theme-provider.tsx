"use client";

import * as React from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";

/**
 * The app is light, and only light.
 *
 * `forcedTheme` rather than a default: a default still follows the operating
 * system, so anyone whose machine is dark would land in a theme this app no
 * longer supports. The provider stays because Sonner reads the theme from it.
 */
function ThemeProvider({
  children,
  ...props
}: React.ComponentProps<typeof NextThemesProvider>) {
  return (
    <NextThemesProvider
      attribute="class"
      forcedTheme="light"
      disableTransitionOnChange
      {...props}
    >
      {children}
    </NextThemesProvider>
  );
}

export { ThemeProvider };
