"use client";

import { LayoutGrid, MessageCircle, PieChart, ScanLine } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

import { authClient } from "@/lib/auth-client";
import { Spinner } from "@workspace/ui/components/spinner";
import { cn } from "@workspace/ui/lib/utils";

const NAV = [
  { href: "/collection", label: "Colección", icon: LayoutGrid },
  { href: "/scan", label: "Escanear", icon: ScanLine },
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
      <header className="border-edge bg-background/80 sticky top-0 z-20 hidden border-b backdrop-blur-xl md:block">
        <div className="mx-auto flex max-w-6xl items-center gap-1 px-6 py-3">
          <Link
            href="/collection"
            className="font-display mr-6 text-[17px] font-semibold tracking-[-0.02em]"
          >
            Poké<span className="text-muted-foreground">Dex</span>
          </Link>

          {NAV.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                pathname === href
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="size-4" />
              {label}
            </Link>
          ))}
        </div>
      </header>

      <main key={pathname} className="rise mx-auto max-w-6xl px-4 pt-5 pb-32 md:px-6 md:pb-12">
        {children}
      </main>

      <nav
        className="fixed inset-x-0 z-20 flex justify-center px-4 md:hidden"
        style={{ bottom: "max(env(safe-area-inset-bottom), 1.25rem)" }}
      >
        <ul className="glass flex gap-0.5 rounded-full p-1.5">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = pathname === href;
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  aria-label={label}
                  className={cn(
                    "flex items-center gap-2 rounded-full px-3.5 py-2.5 text-[13px] font-medium transition-all duration-300",
                    active
                      ? "bg-foreground text-background"
                      : "text-muted-foreground active:scale-90",
                  )}
                >
                  <Icon className="size-[18px] shrink-0" />
                  {/* Only the current tab is named: four labels at once fill the
                      bar on a 360px screen. */}
                  {active && label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
