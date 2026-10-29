import Link from "next/link";
import { Icon } from "@repo/ui/components/icon";
import { buttonVariants } from "@repo/ui/components/button";
import { DashboardShell } from "../scouts/dashboard-shell";
import { RefreshDashboard } from "../scouts/refresh-dashboard";
import { SearchActivity } from "./search-activity";
import { SourceMonitoring } from "./source-monitoring";
import { LeadResults } from "./lead-results";
import type { WebDiscoveryPage } from "./discovery-contracts";

/** Presents account-owned leads first, with search activity alongside the results and private reads kept on the server. */
export function WebDiscoveryView({ page }: { page: WebDiscoveryPage }) {
  const searching = page.cases.some(
    (run) => run.status === "searching" || run.reviewStatus === "reviewing",
  );

  return (
    <DashboardShell account={page.account} section="discovery">
      <div className="web-discovery">
        <header className="web-discovery-header">
          <div>
            <h1>Leads worth exploring.</h1>
            <p>Fresh leads from your scouts, ready for a closer look.</p>
          </div>
          <div className="web-discovery-actions">
            <RefreshDashboard searching={searching} />
            <Link className={buttonVariants()} href="/dashboard#opportunities">
              View opportunities
            </Link>
          </div>
        </header>
        <div className="web-discovery-notice">
          <Icon name="compass" size={20} />
          <p>
            <strong>A lead is a starting point.</strong> Your scout checks the
            source and your brief before recommending it.
          </p>
        </div>
        <div className="web-discovery-layout">
          <LeadResults leads={page.leads} />
          <div className="web-discovery-sidebar">
            <SearchActivity runs={page.cases} />
            <SourceMonitoring sources={page.monitors} />
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
