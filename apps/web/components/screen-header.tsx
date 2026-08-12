"use client";

import { AccountMenu } from "@/components/account-menu";
import { authClient } from "@/lib/auth-client";

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
    <header className="mb-5 flex items-center gap-3">
      <h1 className="font-display truncate text-[27px] leading-none font-semibold tracking-[-0.03em] lg:text-[32px]">
        {title}
      </h1>
      {meta}
      <div className="ml-auto flex shrink-0 items-center gap-2">
        {children}
        <span className="lg:hidden">
          <AccountMenu email={session?.user.email} />
        </span>
      </div>
    </header>
  );
}
