"use client";

import { usePathname } from "next/navigation";

import { SIDEBAR_NAV } from "@/components/app-sidebar";
import { NewsBell } from "@/components/news-bell";
import { Separator } from "@workspace/ui/components/separator";
import { SidebarTrigger } from "@workspace/ui/components/sidebar";

/** Screens you reach from inside another one, so they are not in the sidebar. */
const ASIDE = [
  { href: "/cards", label: "Carta" },
  { href: "/compare", label: "Comparar" },
  { href: "/collectors", label: "Coleccionista" },
];

export function SiteHeader() {
  const pathname = usePathname();
  const current = [...SIDEBAR_NAV, ...ASIDE].find((item) => pathname.startsWith(item.href));

  return (
    <header className="h-(--header-height) shrink-0 items-center border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height) hidden lg:flex">
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mx-2 data-[orientation=vertical]:h-4" />
        <span className="text-sm font-medium">{current?.label ?? "PokéDex"}</span>
        <div className="ml-auto">
          <NewsBell />
        </div>
      </div>
    </header>
  );
}
