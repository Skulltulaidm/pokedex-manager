"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { AccountMenu } from "@/components/account-menu";
import { PokedexMark } from "@/components/logo";
import {
  AskIcon,
  CatalogIcon,
  NewsIcon,
  ScanIcon,
  StatsIcon,
  TradeIcon,
  TrainerIcon,
} from "@/components/nav-icons";
import { authClient } from "@/lib/auth-client";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@workspace/ui/components/sidebar";

export const NAV = [
  { href: "/collection", label: "Catálogo", icon: CatalogIcon },
  { href: "/scan", label: "Escanear", icon: ScanIcon },
  { href: "/trades", label: "Trueques", icon: TradeIcon },
  { href: "/stats", label: "Resumen", icon: StatsIcon },
  { href: "/chat", label: "Preguntar", icon: AskIcon },
  { href: "/profile", label: "Tu perfil", icon: TrainerIcon },
];

/**
 * The rail can hold one more than the phone's bar can.
 *
 * Seven pills do not fit across 390px once the active one opens to show its
 * label, so novedades is reached on a phone through the bell in the header
 * instead of through the bar.
 */
export const SIDEBAR_NAV = [
  ...NAV,
  { href: "/notifications", label: "Novedades", icon: NewsIcon },
];

export function AppSidebar() {
  const pathname = usePathname();
  const { data: session } = authClient.useSession();

  return (
    <Sidebar collapsible="icon" variant="inset">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              render={
                <Link href="/collection">
                  <PokedexMark className="size-8!" />
                  <span className="font-display text-[15px] font-semibold tracking-[-0.02em]">
                    Poké<span className="text-muted-foreground">Dex</span>
                  </span>
                </Link>
              }
            />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {SIDEBAR_NAV.map(({ href, label, icon: Icon }) => (
                <SidebarMenuItem key={href}>
                  <SidebarMenuButton
                    isActive={pathname === href}
                    tooltip={label}
                    className="data-[active=true]:bg-primary data-[active=true]:text-primary-foreground"
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

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <AccountMenu email={session?.user.email} name={session?.user.name} />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
