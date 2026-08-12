"use client";

import { usePathname } from "next/navigation";

import { NAV } from "@/components/app-sidebar";
import { Separator } from "@workspace/ui/components/separator";
import { SidebarTrigger } from "@workspace/ui/components/sidebar";

export function SiteHeader() {
  const pathname = usePathname();
  const current = NAV.find((item) => pathname.startsWith(item.href));

  return (
    <header className="h-(--header-height) shrink-0 items-center border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height) hidden lg:flex">
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mx-2 data-[orientation=vertical]:h-4" />
        <span className="text-sm font-medium">{current?.label ?? "PokéDex"}</span>
      </div>
    </header>
  );
}
