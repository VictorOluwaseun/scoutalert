import Link from "next/link";
import type { ReactNode } from "react";
import { Icon } from "@repo/ui/components/icon";
import { Brand } from "../onboarding/components/brand";
import { SignOutButton } from "../account/sign-out-button";
import type { VerifiedAccount } from "../account/account-client";

/** A light workspace frame with real section links and a server-authorized account marker. */
export function DashboardShell({
  account,
  examples = false,
  children,
}: {
  account?: VerifiedAccount;
  examples?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="workspace">
      <a className="scout-skip-link" href="#workspace-main">
        Skip to content
      </a>
      <aside className="workspace-rail">
        <Link href="/dashboard" aria-label="ScoutAlert dashboard">
          <Brand small />
        </Link>
        <nav aria-label="Dashboard navigation">
          <Link href="/dashboard" aria-current={examples ? undefined : "page"}>
            <Icon name="compass" size={21} />
            Dashboard
          </Link>
          <Link href="/dashboard#scouts">
            <Icon name="search" size={21} />
            Your scouts
          </Link>
          <Link href="/dashboard#opportunities">
            <Icon name="briefcase" size={21} />
            Opportunities
          </Link>
        </nav>
        {account && (
          <div className="workspace-account">
            <span>Signed in as</span>
            <strong>{account.email}</strong>
            <SignOutButton />
          </div>
        )}
      </aside>
      <main id="workspace-main" className="workspace-main">
        {children}
      </main>
    </div>
  );
}
