"use client";

import { AccountMenu } from "@/components/account-menu";
import { NewsBell } from "@/components/news-bell";
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
      {/* The count is what gives way here: a phone fits the title, the screen's
          own action and the two bits of chrome, and not much else. */}
      <div className="ml-auto flex shrink-0 items-center gap-1">
        {children}
        {/* A phone has no site header, and the bottom bar is full at six, so
            this is how it reaches the novedades screen. */}
        <span className="ml-1 lg:hidden">
          <NewsBell />
        </span>
        <span className="lg:hidden">
          <AccountMenu email={session?.user.email} compact />
        </span>
      </div>
    </header>
  );
}
