"use client";

import { LayoutGrid, MessageCircle, PieChart, ScanLine } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

import { AccountMenu } from "@/components/account-menu";
import { authClient } from "@/lib/auth-client";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from "@workspace/ui/components/sidebar";
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
    <SidebarProvider>
      <Sidebar collapsible="icon" className="hidden lg:flex">
        <SidebarHeader className="px-4 py-4">
          <Link
            href="/collection"
            className="font-display truncate text-[19px] font-semibold tracking-[-0.03em]"
          >
            Poké<span className="text-muted-foreground">Dex</span>
          </Link>
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {NAV.map(({ href, label, icon: Icon }) => (
                  <SidebarMenuItem key={href}>
                    <SidebarMenuButton
                      isActive={pathname === href}
                      tooltip={label}
                      render={
                        <Link href={href}>
                          <Icon />
                          <span>{label}</span>
                        </Link>
                      }
                    />
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter className="flex-row items-center gap-2.5 px-3 py-3">
          <AccountMenu email={session.user.email} />
          <p className="text-muted-foreground min-w-0 flex-1 truncate text-xs group-data-[collapsible=icon]:hidden">
            {session.user.email}
          </p>
        </SidebarFooter>
      </Sidebar>

      {/* The scroll container is the inset, not the page, so the rail never
          travels with the content. */}
      <SidebarInset className="lg:h-svh lg:overflow-y-auto">
        <main key={pathname} className="rise w-full px-4 pt-5 pb-32 lg:px-8 lg:py-7">
          {children}
        </main>
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
    </SidebarProvider>
  );
}
