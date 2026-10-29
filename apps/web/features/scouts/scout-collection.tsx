import "./dashboard-overview.css";
import Link from "next/link";
import { buttonVariants } from "@repo/ui/components/button";
import { Icon } from "@repo/ui/components/icon";
import { ScoutSummary } from "./scout-summary";
import { RefreshDashboard } from "./refresh-dashboard";
import type { ScoutDashboard } from "./scout-contracts";

/** Provides a dedicated management view of the current account-owned catalog page and its existing mutations. */
export function ScoutCollection({
  page,
  olderPage,
  updated,
}: {
  page: ScoutDashboard;
  olderPage: boolean;
  updated: boolean;
}) {
  const searching = page.items.some(
    (scout) =>
      scout.status === "active" &&
      ["pending", "searching"].includes(scout.discovery),
  );

  return (
    <div className="dashboard-overview scout-collection">
      <header className="dashboard-heading">
        <div>
          <h1>Your scouts.</h1>
          <p>
            Give each search its own direction. Refine it whenever life changes.
          </p>
        </div>
        <div className="dashboard-heading-actions">
          <RefreshDashboard searching={searching} />
          <Link className={buttonVariants()} href="/onboarding?step=goal&new=1">
            <Icon name="compass" size={18} />
            Create a scout
          </Link>
        </div>
      </header>
      {updated && (
        <p className="dashboard-save-notice" role="status">
          <Icon name="check" size={20} /> Your changes are saved.
        </p>
      )}
      <div className="dashboard-section-heading">
        <h2>{olderPage ? "Earlier scouts" : "Your search directions"}</h2>
        <span>{page.items.length} shown</span>
      </div>
      {page.items.length > 0 ? (
        <div className="scout-collection-grid">
          {page.items.map((scout) => (
            <ScoutSummary
              key={scout.id}
              scout={scout}
              run={page.discovery.runs.find((run) => run.scoutId === scout.id)}
            />
          ))}
        </div>
      ) : (
        <div className="dashboard-empty">
          <span className="dashboard-empty-symbol">
            <Icon name="compass" size={30} />
          </span>
          <h3>
            {olderPage
              ? "You’ve reached the end"
              : "What would you like to find?"}
          </h3>
          <p>
            {olderPage
              ? "Return to your latest scouts to manage your current searches."
              : "Create a scout for a job, contract or client project. You choose the brief and alert preferences."}
          </p>
          <Link
            className={buttonVariants()}
            href={
              olderPage ? "/dashboard/scouts" : "/onboarding?step=goal&new=1"
            }
          >
            {olderPage ? "Latest scouts" : "Create your first scout"}
          </Link>
        </div>
      )}
      {(olderPage || page.nextCursor) && (
        <nav className="dashboard-pagination" aria-label="Scout pages">
          {olderPage && (
            <Link
              className={buttonVariants({ variant: "secondary" })}
              href="/dashboard/scouts"
            >
              Latest scouts
            </Link>
          )}
          {page.nextCursor && (
            <Link
              className={buttonVariants({ variant: "secondary" })}
              href={`/dashboard/scouts?after=${encodeURIComponent(page.nextCursor)}`}
            >
              Earlier scouts <Icon name="arrowRight" size={16} />
            </Link>
          )}
        </nav>
      )}
    </div>
  );
}
