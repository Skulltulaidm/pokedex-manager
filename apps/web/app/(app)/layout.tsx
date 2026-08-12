"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { LayoutGrid, MessageCircle, PieChart, Plus } from "lucide-react";

import { authClient } from "@/lib/auth-client";
import { Spinner } from "@workspace/ui/components/spinner";
import { cn } from "@workspace/ui/lib/utils";

const NAV = [
  { href: "/collection", label: "Colección", icon: LayoutGrid },
  { href: "/collection/add", label: "Agregar", icon: Plus },
  { href: "/stats", label: "Resumen", icon: PieChart },
  { href: "/chat", label: "Preguntar", icon: MessageCircle },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { data: session, isPending } = authClient.useSession();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isPending && !session) router.replace("/sign-in");
  }, [isPending, session, router]);

  if (isPending || !session) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <Spinner className="size-5" />
      </div>
    );
  }

  return (
    <div className="min-h-svh">
      <header className="border-edge/70 bg-background/70 sticky top-0 z-20 border-b backdrop-blur-xl">
        <div className="mx-auto flex max-w-5xl items-center gap-6 px-4 py-3.5">
          <Link
            href="/collection"
            className="font-display text-lg font-extrabold tracking-tight"
          >
            Poké<span className="text-muted-foreground">Dex</span>
          </Link>

          <nav className="ml-auto hidden gap-1 md:flex">
            {NAV.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm transition-colors",
                  pathname === href
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="size-4" />
                {label}
              </Link>
            ))}
          </nav>

          <button
            onClick={() => authClient.signOut()}
            className="text-muted-foreground hover:text-foreground ml-auto text-sm transition-colors md:ml-0"
          >
            Salir
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 pt-5 pb-32 md:pb-12">{children}</main>

      <nav className="fixed inset-x-0 bottom-5 z-20 flex justify-center px-4 md:hidden">
        <div className="glass flex gap-1 rounded-full p-1.5">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                aria-label={label}
                className={cn(
                  "flex items-center gap-2 rounded-full px-3.5 py-2.5 text-[13px] font-medium transition-colors",
                  active
                    ? "bg-foreground text-background"
                    : "text-muted-foreground",
                )}
              >
                <Icon className="size-[18px]" />
                {/* Only the current tab is named: four labels at once turn the bar
                    into a wall of text on a 360px screen. */}
                {active && label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
