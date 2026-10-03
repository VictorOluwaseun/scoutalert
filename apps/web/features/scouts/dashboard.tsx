import "./dashboard-overview.css";
import Link from "next/link";
import { buttonVariants } from "@repo/ui/components/button";
import { Icon } from "@repo/ui/components/icon";
import { OpportunityFeedbackControls } from "./opportunity-feedback";
import { OpportunityCard } from "./opportunity-card";
import { OpportunityResults } from "./opportunity-results";
import { ScoutSummary } from "./scout-summary";
import { DashboardShell } from "./dashboard-shell";
import { RefreshDashboard } from "./refresh-dashboard";
import type { ScoutDashboard } from "./scout-contracts";

/** Summarizes dated source coverage separately from opportunities; the expanded note explains the limits of those reads. */
function SearchCoverage({
  discovery,
}: {
  discovery: ScoutDashboard["discovery"];
}) {
  const freshSources = discovery.sources.filter(
    (source) =>
      source.checkedAt &&
      Date.now() - Date.parse(source.checkedAt) < 30 * 60_000,
  );
  const refreshFailed = discovery.sources.some((source) => source.failedAt);

  return (
    <section
      className="dashboard-coverage"
      aria-labelledby="dashboard-coverage-title"
    >
      <h2 id="dashboard-coverage-title">Search coverage</h2>
      <p>
        {discovery.sources.length > 0
          ? `${freshSources.length} of ${discovery.sources.length} connected sources recently checked.`
          : "Source checks will appear here when your scouts start searching."}
      </p>
      {refreshFailed && (
        <p className="dashboard-coverage-warning">
          A source refresh failed. Some results use earlier evidence.
        </p>
      )}
      <details>
        <summary>
          About these results <Icon name="chevronDown" size={16} />
        </summary>
        <div>
          <p>
            Connected job boards and client project requests provide a limited
            sample of available work. Private and local-only Freelancer postings
            are excluded.
          </p>
          <p>
            Source feeds refresh every five minutes. Client requests are checked
            individually before an email.
          </p>
          <p>
            AI assessed results include a comparison with your brief and quotes
            from the posting. Other results are potential matches awaiting
            detailed assessment.
          </p>
        </div>
      </details>
    </section>
  );
}

/** Presents server-owned opportunities first, with compact scout management alongside them and genuine empty states. */
export function Dashboard({
  page,
  olderPage,
  updated = false,
}: {
  page: ScoutDashboard;
  olderPage: boolean;
  updated?: boolean;
}) {
  const hasScouts = page.items.length > 0;
  const hasActiveScouts = page.items.some((scout) => scout.status === "active");
  const searching = page.items.some(
    (scout) =>
      scout.status === "active" &&
      (scout.discovery === "pending" || scout.discovery === "searching"),
  );
  const examplesCategory = page.items[0]?.search.category ?? "employment";

  return (
    <DashboardShell account={page.account}>
      <div className="dashboard-overview">
        {updated && (
          <p className="dashboard-save-notice" role="status">
            <Icon name="check" size={20} />
            Your changes are saved.
          </p>
        )}
        <header className="dashboard-heading">
          <div>
            <h1>Your dashboard</h1>
            <p>Your opportunities and scouts, in one place.</p>
          </div>
          <div className="dashboard-heading-actions">
            <RefreshDashboard searching={searching} />
            <Link
              className={buttonVariants()}
              href="/onboarding?step=goal&new=1"
            >
              <Icon name="compass" size={18} />
              {hasScouts ? "Add a scout" : "Create a scout"}
            </Link>
          </div>
        </header>
        <div className="dashboard-intro">
          <Icon name={hasScouts ? "compass" : "search"} size={20} />
          <p>
            {hasScouts ? (
              <>
                <strong>Potential matches need a closer look.</strong> Review
                the source and any details still to confirm.
              </>
            ) : (
              <>
                <strong>Start with what you’re looking for.</strong> Create a
                scout for jobs, contracts or client projects.
              </>
            )}
          </p>
        </div>
        <div className="dashboard-layout">
          <section
            id="opportunities"
            className="dashboard-results"
            aria-labelledby="opportunities-heading"
          >
            <div className="dashboard-section-heading">
              <h2 id="opportunities-heading">Opportunities</h2>
              {page.opportunities.length > 0 && (
                <span>
                  {page.opportunities.length} recent{" "}
                  {page.opportunities.length === 1 ? "result" : "results"}
                </span>
              )}
            </div>
            {page.discovery.email.uncertainCount > 0 && (
              <p className="dashboard-email-note" role="status">
                An email submission needs checking. Those postings are held to
                avoid sending them twice.
              </p>
            )}
            {page.discovery.email.rejectedCount > 0 && (
              <p className="dashboard-email-note" role="status">
                A previous email was rejected. Unsent opportunities remain
                available for a later digest.
              </p>
            )}
            <OpportunityResults
              items={page.opportunities.map((opportunity) => ({
                id: opportunity.id,
                kind: opportunity.kind ?? "job",
                assessed: !!opportunity.detail,
                card: (
                  <OpportunityCard
                    key={opportunity.id}
                    opportunity={opportunity}
                  />
                ),
              }))}
            >
              <div className="dashboard-empty">
                <span className="dashboard-empty-symbol">
                  <Icon name="briefcase" size={30} />
                </span>
                <h3>
                  {hasScouts
                    ? searching
                      ? "Your scout is looking for opportunities"
                      : hasActiveScouts
                        ? "No current matches yet"
                        : "Your scouts are paused"
                    : "Your first opportunity starts with a scout"}
                </h3>
                <p>
                  {hasScouts
                    ? hasActiveScouts
                      ? "Your scouts will keep checking supported sources against your brief. Explore web leads while you wait."
                      : "Resume a scout to search again. Its brief and alert preferences are saved."
                    : "Tell your scout what work you want to find. You’ll review the details before saving."}
                </p>
                <Link
                  className={buttonVariants({ variant: "secondary" })}
                  href={
                    hasScouts
                      ? hasActiveScouts
                        ? "/dashboard/discovery"
                        : "#scouts"
                      : "/onboarding?step=goal&new=1"
                  }
                >
                  {hasScouts
                    ? hasActiveScouts
                      ? "Explore web leads"
                      : "View your scouts"
                    : "Create your first scout"}
                </Link>
                <Link
                  className="dashboard-text-link"
                  href={`/dashboard/examples?category=${examplesCategory}`}
                >
                  Preview example opportunities
                </Link>
                <span className="dashboard-example-note">
                  Fictional examples · No live search results
                </span>
              </div>
            </OpportunityResults>
            {page.hiddenOpportunities.length > 0 && (
              <details className="dashboard-hidden">
                <summary>
                  <span>
                    Hidden opportunities{" "}
                    <span className="dashboard-count">
                      {page.hiddenOpportunities.length}
                    </span>
                  </span>
                  <Icon name="chevronDown" size={18} />
                </summary>
                <p>
                  Undo makes an opportunity eligible for a future search.
                  Current availability and fit will still be checked.
                </p>
                {page.hiddenOpportunities.map((opportunity) => (
                  <article
                    className="dashboard-hidden-row"
                    key={opportunity.id}
                  >
                    <div>
                      <h3>{opportunity.title}</h3>
                      <p>{opportunity.company ?? "Organization not stated"}</p>
                    </div>
                    <OpportunityFeedbackControls
                      key={`${opportunity.id}:${opportunity.feedback?.version ?? 0}`}
                      opportunity={opportunity}
                    />
                  </article>
                ))}
              </details>
            )}
          </section>
          <aside
            className="dashboard-context"
            aria-label="Your scouts and search coverage"
          >
            <section id="scouts" aria-labelledby="scouts-heading">
              <div className="dashboard-section-heading">
                <h2 id="scouts-heading">Your scouts</h2>
                <span>{page.items.length} shown</span>
              </div>
              {olderPage && (
                <p className="dashboard-earlier-note">
                  Earlier scouts saved to your account.
                </p>
              )}
              {hasScouts ? (
                <div className="dashboard-scout-list">
                  {page.items.map((scout) => (
                    <ScoutSummary
                      key={scout.id}
                      scout={scout}
                      run={page.discovery.runs.find(
                        (run) => run.scoutId === scout.id,
                      )}
                    />
                  ))}
                </div>
              ) : (
                <div className="dashboard-no-scouts">
                  <Icon name="compass" size={25} />
                  <h3>
                    {olderPage
                      ? "No more scouts on this page"
                      : "Set your search direction"}
                  </h3>
                  <p>
                    {olderPage
                      ? "Return to your latest scouts to see the current list."
                      : "Each scout keeps its own brief and alert preferences."}
                  </p>
                  <Link
                    className="dashboard-text-link"
                    href={
                      olderPage ? "/dashboard" : "/onboarding?step=goal&new=1"
                    }
                  >
                    {olderPage ? "Latest scouts" : "Create a scout"}
                  </Link>
                </div>
              )}
              {(olderPage || page.nextCursor) && (
                <nav className="dashboard-pagination" aria-label="Scout pages">
                  {olderPage && (
                    <Link
                      className={buttonVariants({ variant: "secondary" })}
                      href="/dashboard"
                    >
                      Latest scouts
                    </Link>
                  )}
                  {page.nextCursor && (
                    <Link
                      className={buttonVariants({ variant: "secondary" })}
                      href={`/dashboard?after=${encodeURIComponent(page.nextCursor)}`}
                    >
                      Earlier scouts <Icon name="arrowRight" size={16} />
                    </Link>
                  )}
                </nav>
              )}
            </section>
            <Link
              className="dashboard-discovery-link"
              href="/dashboard/discovery"
            >
              <span className="dashboard-company-mark">
                <Icon name="globe" size={22} />
              </span>
              <span>
                <strong>Explore web leads</strong>
                <span>See what your scouts found</span>
              </span>
              <Icon name="arrowRight" size={17} />
            </Link>
            <SearchCoverage discovery={page.discovery} />
          </aside>
        </div>
        <footer className="dashboard-footer">
          <Icon name="shield" size={17} />
          <span>Your scouts and preferences are saved to your account.</span>
        </footer>
      </div>
    </DashboardShell>
  );
}
