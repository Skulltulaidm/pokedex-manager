import Link from "next/link";

import { Pokeball } from "@/components/pokeball";
import { buttonVariants } from "@workspace/ui/components/button";

export default function NotFound() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-4 px-6 text-center">
      <Pokeball state="escaped" size={64} />
      <div>
        <h1 className="font-display text-2xl font-semibold">Se escapó</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Esta página no existe. Puede que el enlace esté viejo o mal escrito.
        </p>
      </div>
      <Link href="/collection" className={buttonVariants()}>
        Volver al catálogo
      </Link>
    </main>
  );
}
