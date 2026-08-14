"use client";

import {
  ArrowLeftRight,
  LayoutGrid,
  MessageCircle,
  PieChart,
  ScanLine,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { AccountMenu } from "@/components/account-menu";
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
  { href: "/collection", label: "Catálogo", icon: LayoutGrid },
  { href: "/scan", label: "Escanear", icon: ScanLine },
  { href: "/trades", label: "Trueques", icon: ArrowLeftRight },
  { href: "/stats", label: "Resumen", icon: PieChart },
  { href: "/chat", label: "Preguntar", icon: MessageCircle },
  { href: "/profile", label: "Tu perfil", icon: UserRound },
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
                  <span className="bg-primary text-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg">
                    <LayoutGrid className="size-4" />
                  </span>
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
              {NAV.map(({ href, label, icon: Icon }) => (
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
          <SidebarMenuItem className="flex items-center gap-2 px-1 py-0.5">
            <AccountMenu email={session?.user.email} />
            <p className="text-muted-foreground min-w-0 flex-1 truncate text-xs group-data-[collapsible=icon]:hidden">
              {session?.user.email}
            </p>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
