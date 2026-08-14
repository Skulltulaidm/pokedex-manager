"use client";

import { Bell, EllipsisVertical, LifeBuoy, LogOut, Search, UserRound } from "lucide-react";
import Link from "next/link";

import { UserAvatar } from "@/components/user-avatar";
import { clearAccessToken } from "@/lib/api-client";
import { authClient, leaveTo } from "@/lib/auth-client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu";
import { cn } from "@workspace/ui/lib/utils";

/**
 * The account, at the foot of the rail.
 *
 * The whole row is the trigger rather than a control beside it: the row is
 * already the person, and a second target next to it is a second thing to aim
 * at for the same result.
 */
export function AccountMenu({
  email,
  name,
  compact,
}: {
  email?: string;
  name?: string | null;
  /** Just the avatar, for the places that have no room for a row. */
  compact?: boolean;
}) {
  const label = name || email?.split("@")[0] || "Tu cuenta";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            aria-label="Cuenta y preferencias"
            className={cn(
              "focus-visible:ring-ring focus-visible:outline-none",
              compact
                ? "rounded-full focus-visible:ring-2"
                : "hover:bg-sidebar-accent flex w-full items-center gap-2 rounded-lg p-1.5 text-left transition-colors focus-visible:ring-2",
            )}
          >
            <UserAvatar value={email} size={32} />
            {!compact && (
              <>
                <span className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
                  <span className="block truncate text-sm font-medium">{label}</span>
                  <span className="text-muted-foreground block truncate text-xs">
                    {email}
                  </span>
                </span>
                <EllipsisVertical className="text-muted-foreground size-4 shrink-0 group-data-[collapsible=icon]:hidden" />
              </>
            )}
          </button>
        }
      />

      <DropdownMenuContent align="end" side={compact ? "bottom" : "top"} className="w-60">
        <div className="flex items-center gap-2 px-2 py-1.5">
          <UserAvatar value={email} size={32} />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{label}</p>
            <p className="text-muted-foreground truncate text-xs">{email}</p>
          </div>
        </div>

        <DropdownMenuSeparator />

        <DropdownMenuGroup>
          <DropdownMenuItem render={<Link href="/profile" />}>
            <UserRound />
            Cuenta
          </DropdownMenuItem>
          <DropdownMenuItem render={<Link href="/notifications" />}>
            <Bell />
            Notificaciones
          </DropdownMenuItem>
          <DropdownMenuItem render={<Link href="/collection" />}>
            <Search />
            Buscar cartas
          </DropdownMenuItem>
          <DropdownMenuItem render={<Link href="/chat" />}>
            <LifeBuoy />
            Preguntar al asistente
          </DropdownMenuItem>
        </DropdownMenuGroup>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          onClick={async () => {
            await authClient.signOut();
            clearAccessToken();
            leaveTo("/sign-in");
          }}
        >
          <LogOut />
          Cerrar sesión
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
