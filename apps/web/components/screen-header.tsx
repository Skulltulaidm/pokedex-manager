"use client";

import { AccountMenu } from "@/components/account-menu";
import { authClient } from "@/lib/auth-client";

/**
 * The title holds the row; actions give way before it does.
 *
 * Everything an action bar accumulates competes with the one thing that says
 * where you are, and on a 390px screen the title is what loses.
 */
export function ScreenHeader({
  title,
  meta,
  children,
}: {
  title: string;
  meta?: string;
  children?: React.ReactNode;
}) {
  const { data: session } = authClient.useSession();

  return (
    <header className="mb-5 flex items-center gap-x-3 gap-y-1">
      <h1 className="font-display shrink-0 text-[27px] leading-none font-semibold tracking-[-0.03em] lg:text-[32px]">
        {title}
      </h1>
      {/* The count never breaks across lines: two words stacked beside a title
          read as a second heading, and on a phone that is the whole row. */}
      {meta && (
        <span className="text-muted-foreground min-w-0 truncate text-sm whitespace-nowrap">
          {meta}
        </span>
      )}
      <div className="ml-auto flex min-w-0 shrink items-center gap-1">
        {children}
        <span className="lg:hidden">
          <AccountMenu email={session?.user.email} />
        </span>
      </div>
    </header>
  );
}
