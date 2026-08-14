"use client";

import { useEffect } from "react";

import { LoadFailed } from "@/components/pokeball";

/**
 * Inside the shell, so a screen that throws keeps the navigation around it: the
 * error belongs to the page, not to the app.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto max-w-md py-16">
      <LoadFailed message="Esta pantalla falló al cargar." onRetry={reset} />
      {error.digest && (
        <p className="text-muted-foreground/60 mt-3 text-center font-mono text-[11px]">
          {error.digest}
        </p>
      )}
    </div>
  );
}
