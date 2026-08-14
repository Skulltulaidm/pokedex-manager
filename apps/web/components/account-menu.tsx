"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";

import { clearAccessToken } from "@/lib/api-client";
import { authClient } from "@/lib/auth-client";
import { UserAvatar } from "@/components/user-avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu";

export function AccountMenu({ email }: { email?: string }) {
  const router = useRouter();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            aria-label="Cuenta y preferencias"
            className="focus-visible:ring-ring rounded-full focus-visible:ring-2 focus-visible:outline-none"
          >
            <UserAvatar value={email} size={32} />
          </button>
        }
      />
      <DropdownMenuContent align="end" className="w-56">
        {email && (
          <>
            <DropdownMenuGroup>
              <DropdownMenuLabel className="truncate font-normal">{email}</DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
          </>
        )}

        <DropdownMenuItem
          onClick={async () => {
            await authClient.signOut();
            clearAccessToken();
            router.replace("/sign-in");
          }}
        >
          <LogOut />
          Cerrar sesión
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
