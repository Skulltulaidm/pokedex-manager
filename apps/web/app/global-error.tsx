"use client";

/**
 * Only reached when the root layout itself fails, so it replaces the document
 * and cannot lean on the app's providers, fonts or styles.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="es">
      <body
        style={{
          display: "flex",
          minHeight: "100svh",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "0.75rem",
          fontFamily: "system-ui, sans-serif",
          textAlign: "center",
          padding: "1.5rem",
        }}
      >
        <h1 style={{ fontSize: "1.25rem", fontWeight: 600 }}>Algo se rompió</h1>
        <p style={{ color: "#666", fontSize: "0.875rem" }}>
          La app no pudo arrancar. Vuelve a intentarlo.
        </p>
        <button
          onClick={reset}
          style={{
            border: "1px solid #ccc",
            borderRadius: "0.5rem",
            padding: "0.5rem 1rem",
            fontSize: "0.875rem",
          }}
        >
          Reintentar
        </button>
        {error.digest && (
          <code style={{ color: "#999", fontSize: "0.6875rem" }}>{error.digest}</code>
        )}
      </body>
    </html>
  );
}
