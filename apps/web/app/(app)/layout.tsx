"use client";

import { LayoutGrid, MessageCircle, PieChart, ScanLine } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

import { AccountMenu } from "@/components/account-menu";
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
    <div className="lg:flex lg:h-svh lg:overflow-hidden">
      {/* A rail rather than a top bar: the horizontal space was going unused, and
          a fixed rail keeps the page itself from scrolling on a desktop. */}
      <aside className="border-edge bg-surface/50 hidden w-60 shrink-0 flex-col border-r px-3 py-5 lg:flex">
        <Link
          href="/collection"
          className="font-display mb-7 px-3 text-[19px] font-semibold tracking-[-0.03em]"
        >
          Poké<span className="text-muted-foreground">Dex</span>
        </Link>

        <nav className="flex-1">
          <ul className="space-y-1">
            {NAV.map(({ href, label, icon: Icon }) => {
              const active = pathname === href;
              return (
                <li key={href}>
                  <Link
                    href={href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                      active
                        ? "bg-accent text-foreground"
                        : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                    )}
                  >
                    <Icon className="size-[18px] shrink-0" />
                    {label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="border-edge flex items-center gap-3 border-t px-3 pt-4">
          <AccountMenu email={session.user.email} />
          <p className="text-muted-foreground min-w-0 flex-1 truncate text-xs">
            {session.user.email}
          </p>
        </div>
      </aside>

      <main
        key={pathname}
        className="rise mx-auto w-full max-w-6xl px-4 pt-5 pb-32 lg:h-svh lg:overflow-y-auto lg:px-8 lg:py-7"
      >
        {children}
      </main>

      <nav
        className="fixed inset-x-0 z-20 flex justify-center px-4 lg:hidden"
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
