"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

import { AppSidebar, NAV } from "@/components/app-sidebar";
import { ChatWidget } from "@/components/chat-widget";
import { SiteHeader } from "@/components/site-header";
import { authClient } from "@/lib/auth-client";
import { SidebarInset, SidebarProvider } from "@workspace/ui/components/sidebar";
import { Spinner } from "@workspace/ui/components/spinner";
import { cn } from "@workspace/ui/lib/utils";

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
    <SidebarProvider
      style={
        {
          "--sidebar-width": "calc(var(--spacing) * 66)",
          "--header-height": "calc(var(--spacing) * 13)",
        } as React.CSSProperties
      }
    >
      <AppSidebar />

      {/* The inset owns the scroll, so the rail and the header stay put. */}
      <SidebarInset className="lg:h-[calc(100svh-1rem)] lg:overflow-hidden">
        <SiteHeader />
        <div key={pathname} className="rise scrollbar-none flex-1 overflow-x-hidden px-4 pt-5 pb-32 lg:overflow-y-auto lg:px-6 lg:py-6">
          {children}
        </div>
      </SidebarInset>

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

      <ChatWidget />
    </SidebarProvider>
  );
}
