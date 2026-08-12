"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { CardFan } from "@/components/card-fan";
import { clearAccessToken } from "@/lib/api-client";
import { authClient } from "@/lib/auth-client";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";

export default function SignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const result =
      mode === "sign-in"
        ? await authClient.signIn.email({ email, password })
        : await authClient.signUp.email({ email, password, name: email.split("@")[0] ?? "" });

    setBusy(false);

    if (result.error) {
      setError(
        mode === "sign-in"
          ? "Correo o contraseña incorrectos."
          : (result.error.message ?? "No se pudo crear la cuenta."),
      );
      return;
    }

    clearAccessToken();
    router.replace("/collection");
  }

  return (
    <main className="flex min-h-svh flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <CardFan />

        <h1 className="font-display mt-2 text-center text-[2rem] leading-none font-extrabold tracking-tight">
          Tu colección,
          <br />
          <span className="text-muted-foreground">carta por carta.</span>
        </h1>
        <p className="text-muted-foreground mx-auto mt-3 mb-8 max-w-[16rem] text-center text-sm leading-relaxed">
          Cataloga lo que tienes, y descubre exactamente qué te falta para
          completar cada set.
        </p>

        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">Correo</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password">Contraseña</Label>
            <Input
              id="password"
              type="password"
              autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
              required
              minLength={8}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>

          {error && <p className="text-destructive text-sm">{error}</p>}

          <Button type="submit" className="w-full" disabled={busy}>
            {mode === "sign-in" ? "Entrar" : "Crear cuenta"}
          </Button>
        </form>

        <button
          onClick={() => {
            setMode(mode === "sign-in" ? "sign-up" : "sign-in");
            setError(null);
          }}
          className="text-muted-foreground hover:text-foreground mt-5 w-full text-center text-sm"
        >
          {mode === "sign-in"
            ? "¿Primera vez? Crear una cuenta"
            : "Ya tengo cuenta"}
        </button>
      </div>
    </main>
  );
}
