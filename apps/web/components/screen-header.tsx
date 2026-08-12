"use client";

import { authClient } from "@/lib/auth-client";
import { AccountMenu } from "@/components/account-menu";

/**
 * Each screen owns its own header. On mobile there is no product wordmark: the
 * user knows which app they opened, and the row is worth more as content.
 */
export function ScreenHeader({
  title,
  meta,
  children,
}: {
  title: string;
  meta?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const { data: session } = authClient.useSession();

  return (
    <header className="mb-5">
      <div className="flex items-center gap-3">
        <h1 className="font-display truncate text-[27px] leading-none font-semibold tracking-[-0.02em]">
          {title}
        </h1>
        {meta}
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {children}
          <AccountMenu email={session?.user.email} />
        </div>
      </div>
    </header>
  );
}
