import { ScoutControls } from "./scout-controls";
import { OpportunityFeedbackControls } from "./opportunity-feedback";
import Link from "next/link";
import { buttonVariants } from "@repo/ui/components/button";
import { Icon } from "@repo/ui/components/icon";
import { categoryLabels, arrangementLabels } from "../onboarding/fixtures";
import type {
  Opportunity,
  SavedScout,
  ManagedScout,
  ScoutDashboard,
} from "./scout-contracts";
import { DashboardShell } from "./dashboard-shell";
import { scoutAlertSchedule } from "./scout-presentation";
import { RefreshDashboard } from "./refresh-dashboard";

const discoveryLabels: Record<SavedScout["discovery"], string> = {
  pending: "Search queued",
  searching: "Searching connected sources",
  completed: "Search checked",
  failed: "Search interrupted",
  coverage_unavailable: "Source needed",
};

const criterionLabels: Record<string, string> = {
  role: "Role",
  category: "Type of work",
  arrangement: "Work arrangement",
  location: "Applicant location",
  experience: "Experience",
  authorization: "Work authorization",
  compensation: "Pay",
};
const statusLabels = {
  meets: "Matches your brief",
  conflicts: "Doesn’t match",
  unknown: "Needs confirmation",
};

/** Shows public source evidence, current scout contributions and unresolved fit criteria in readable rows. */
function OpportunityRow({ opportunity }: { opportunity: Opportunity }) {
  return (
    <article className="workspace-opportunity">
      <div className="workspace-opportunity-top">
        <div>
          <p className="workspace-opportunity-company">
            {opportunity.kind === "client_request"
              ? "Client project / service request · "
              : ""}
            {opportunity.company}
          </p>
          <h3>{opportunity.title}</h3>
          <p>{opportunity.location || "Location not stated"}</p>
        </div>
        <span className="workspace-review-tag">
          {opportunity.detail
            ? "AI assessed · Review details"
            : "Potential match"}
        </span>
      </div>
      <p className="workspace-opportunity-scouts">
        Found for {opportunity.scouts.join(", ")}
      </p>
      <ul className="workspace-fit-reasons">
        {opportunity.reasons.map((reason) => (
          <li key={reason}>
            <Icon name="check" size={18} />
            <span>{reason}</span>
          </li>
        ))}
      </ul>
      {opportunity.detail && (
        <details className="workspace-scout-details workspace-assessment">
          <summary>
            How it compares with your brief{" "}
            <Icon name="chevronDown" size={18} />
          </summary>
          <p>
            AI assessment for{" "}
            {opportunity.assessmentScout || opportunity.scouts[0]}. These
            conclusions use the posting, any cited employer policies and your
            confirmed brief. Authorization details are user-declared.
          </p>
          {opportunity.detail.employerResearch && (
            <section className="workspace-criterion">
              <h4>Employer policy research</h4>
              <p>
                Checked{" "}
                {new Date(
                  opportunity.detail.employerResearch.checkedAt,
                ).toLocaleString("en-GB", { timeZone: "UTC" })}{" "}
                UTC. Rechecked when the evidence expires.
              </p>
              {opportunity.detail.employerResearch.findings.map((finding) => (
                <div key={finding.fact}>
                  <strong>
                    {finding.fact === "sponsorship"
                      ? "Sponsorship"
                      : criterionLabels[finding.fact]}{" "}
                    ·{" "}
                    {finding.status === "resolved"
                      ? "Evidence found"
                      : finding.status === "conflicting"
                        ? "Conflicting evidence"
                        : "Still unclear"}
                  </strong>
                  <p>{finding.explanation}</p>
                  {finding.quotes.map((quote) => (
                    <blockquote key={quote}>{quote}</blockquote>
                  ))}
                  {finding.sourceUrl && (
                    <a
                      href={finding.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Read employer source <Icon name="arrowRight" size={16} />
                    </a>
                  )}
                </div>
              ))}
            </section>
          )}
          <div className="workspace-criteria">
            {opportunity.detail.criteria.map((item) => (
              <section key={item.criterion} className="workspace-criterion">
                <div>
                  <h4>{criterionLabels[item.criterion] || item.criterion}</h4>
                  <span data-status={item.status}>
                    {statusLabels[item.status]}
                  </span>
                </div>
                <p>{item.explanation}</p>
                {item.quotes.map((quote) => (
                  <blockquote key={quote}>{quote}</blockquote>
                ))}
                {item.briefQuotes.length > 0 && (
                  <p className="workspace-brief-evidence">
                    Your brief: {item.briefQuotes.join(" · ")}
                  </p>
                )}
              </section>
            ))}
          </div>
        </details>
      )}
      <details className="workspace-scout-details">
        <summary>
          What needs checking <Icon name="chevronDown" size={18} />
        </summary>
        <ul className="workspace-uncertainties">
          {opportunity.uncertainties.map((value) => (
            <li key={value}>{value}</li>
          ))}
        </ul>
      </details>
      {opportunity.availability && (
        <p className="workspace-run-note">
          {
            {
              available:
                "The employer’s posting was still published with the assessed details",
              closed:
                "The posting was unavailable or its application deadline had passed",
              changed:
                "The employer’s posting had changed; this assessment needs updating",
              unresolved:
                "We couldn’t confirm the posting’s current availability",
            }[opportunity.availability.status]
          }
          {" when checked at "}
          {new Date(opportunity.availability.checkedAt).toLocaleString(
            "en-GB",
            { timeZone: "UTC", dateStyle: "medium", timeStyle: "short" },
          )}{" "}
          UTC.{" "}
          <a
            href={opportunity.availability.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            Check source
          </a>
        </p>
      )}
      <div className="workspace-opportunity-bottom">
        <span>
          Evidence checked{" "}
          {new Date(opportunity.checkedAt).toLocaleDateString("en-GB", {
            timeZone: "UTC",
            day: "numeric",
            month: "short",
            year: "numeric",
          })}
        </span>
        <a
          className={buttonVariants({ variant: "secondary" })}
          href={opportunity.url}
          target="_blank"
          rel="noopener noreferrer"
        >
          View source posting <Icon name="arrowRight" size={18} />
        </a>
      </div>
      <OpportunityFeedbackControls
        key={`${opportunity.id}:${opportunity.feedback?.version ?? 0}`}
        opportunity={opportunity}
      />
    </article>
  );
}

/** Shows a persisted scout and lets the user inspect its confirmed brief with revision-fenced lifecycle controls. */
function ScoutRow({
  scout,
  run,
}: {
  scout: ManagedScout;
  run?: ScoutDashboard["discovery"]["runs"][number];
}) {
  const { search, alerts } = scout;
  return (
    <article className="workspace-scout">
      <div className="workspace-scout-top">
        <span className="workspace-scout-icon">
          <Icon name="compass" size={26} />
        </span>
        <div className="workspace-scout-title">
          <h3>{scout.name}</h3>
          <p>
            {categoryLabels[search.category]} · {search.target}
          </p>
        </div>
        <span
          className="workspace-status"
          data-paused={scout.status === "paused"}
        >
          <span />
          {scout.status === "paused"
            ? "Paused"
            : discoveryLabels[scout.discovery]}
        </span>
      </div>
      {scout.discovery === "coverage_unavailable" && (
        <p className="workspace-run-note">
          No fresh source evidence was available for this category on the last
          check. Your brief is saved and your scout will retry.
        </p>
      )}
      {scout.discovery === "failed" && (
        <p className="workspace-run-note">
          This search couldn’t finish. Your scout will retry on its next
          scheduled check.
        </p>
      )}
      {scout.discovery === "completed" && (
        <p className="workspace-run-note">
          {run?.matchCount ?? 0} potential{" "}
          {(run?.matchCount ?? 0) === 1 ? "match" : "matches"} in the latest
          check of connected sources. Eligibility and detailed fit still need
          review.
        </p>
      )}
      <div className="workspace-scout-meta">
        <span>
          <Icon name="laptop" size={18} />
          {arrangementLabels[search.arrangement]}
        </span>
        <span>
          <Icon name="map" size={18} />
          {search.residence || "Residence not specified"}
        </span>
      </div>
      <div className="workspace-scout-schedule">
        <Icon
          name={alerts.frequency === "dashboard" ? "eye" : "bell"}
          size={18}
        />
        <span>
          {scout.status === "paused"
            ? `Paused · Saved schedule: ${scoutAlertSchedule(alerts)}`
            : scoutAlertSchedule(alerts)}
        </span>
      </div>
      <details className="workspace-scout-details">
        <summary>
          View confirmed brief <Icon name="chevronDown" size={18} />
        </summary>
        <div className="workspace-brief-content">
          <p className="workspace-brief-goal">{search.goal}</p>
          <dl>
            <div>
              <dt>Where you want to work</dt>
              <dd>{search.workLocations || "Not specified"}</dd>
            </div>
            <div>
              <dt>Work arrangement</dt>
              <dd>
                {arrangementLabels[search.arrangement]}
                {search.arrangementRequired ? " · Required" : ""}
              </dd>
            </div>
            <div>
              <dt>Experience and availability</dt>
              <dd>{search.background || "Not specified"}</dd>
            </div>
            <div>
              <dt>Minimum pay</dt>
              <dd>
                {search.minimumPay
                  ? `${search.currency} ${search.minimumPay} per ${search.payPeriod}`
                  : "No minimum set"}
              </dd>
            </div>
            <div>
              <dt>Unclear eligibility</dt>
              <dd>
                {search.unknownEligibility === "review"
                  ? "Keep for review"
                  : "Exclude"}
              </dd>
            </div>
            <div>
              <dt>Undisclosed pay</dt>
              <dd>
                {search.undisclosedPay === "include"
                  ? "Include for review"
                  : "Exclude"}
              </dd>
            </div>
            <div>
              <dt>Prompt alerts</dt>
              <dd>
                {alerts.promptAlerts
                  ? `Strong matches · At most one per 24 hours · Quiet ${alerts.quietHours?.start ?? "20:00"}–${alerts.quietHours?.end ?? "08:00"} (${alerts.timezone})`
                  : "Off"}
              </dd>
            </div>
            <div>
              <dt>Opportunity emails</dt>
              <dd>
                {alerts.consent
                  ? "Allowed for this scout"
                  : "Off for this scout"}
              </dd>
            </div>
          </dl>
        </div>
      </details>
      <ScoutControls key={`${scout.id}:${scout.version}`} scout={scout} />
    </article>
  );
}

/** Presents server-owned scouts and an honest discovery empty state; fictional examples remain a separate preview. */
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
  const examplesCategory = page.items[0]?.search.category ?? "employment";
  const searching = page.items.some(
    (scout) =>
      scout.status === "active" &&
      (scout.discovery === "pending" || scout.discovery === "searching"),
  );
  const freshSources = page.discovery.sources.filter(
    (source) =>
      source.checkedAt &&
      Date.now() - Date.parse(source.checkedAt) < 30 * 60_000,
  );
  return (
    <DashboardShell account={page.account}>
      {updated && (
        <p className="workspace-save-notice" role="status">
          <Icon name="check" size={20} />
          Your changes are saved.
        </p>
      )}
      <header className="workspace-heading">
        <div>
          <h1>Your dashboard.</h1>
          <p>Your saved scouts and opportunities, in one place.</p>
        </div>
        <Link className={buttonVariants()} href="/onboarding?step=goal&new=1">
          <Icon name="compass" size={19} />
          {hasScouts ? "Add a scout" : "Create your first scout"}
        </Link>
      </header>
      <div className="workspace-discovery-note">
        <span className="workspace-note-icon">
          <Icon name="clock" size={23} />
        </span>
        <div>
          <strong>
            {hasScouts
              ? "Your scouts have a search direction."
              : "Start with what you’re looking for."}
          </strong>
          <p>
            {hasScouts
              ? "Connected sources: Figma and Remote job boards, plus Freelancer client projects and service requests. Freelancer coverage is a rolling sample of fixed-price and hourly requests; local-only and private postings are excluded. Opportunities marked AI assessed include a comparison with your brief and quotes from the posting. Other results are potential matches awaiting detailed assessment."
              : "Create a scout for jobs, contract roles, client projects or service requests. We’ll check supported sources against your brief."}
          </p>
        </div>
      </div>
      <section
        id="scouts"
        className="workspace-section"
        aria-labelledby="scouts-heading"
      >
        <div className="workspace-section-heading">
          <div>
            <h2 id="scouts-heading">Your scouts</h2>
            <p>
              {olderPage
                ? "Earlier scouts saved to your account."
                : "Each scout keeps its own brief and alert choices."}
            </p>
          </div>
          {hasScouts && (
            <span className="workspace-count">
              {page.items.length} {page.items.length === 1 ? "scout" : "scouts"}{" "}
              shown
            </span>
          )}
        </div>
        {hasScouts ? (
          <div className="workspace-scout-list">
            {page.items.map((scout) => (
              <ScoutRow
                key={scout.id}
                scout={scout}
                run={page.discovery.runs.find(
                  (run) => run.scoutId === scout.id,
                )}
              />
            ))}
          </div>
        ) : (
          <div className="workspace-empty-scout">
            <Icon name="compass" size={30} />
            <div>
              <h3>
                {olderPage
                  ? "No more scouts on this page."
                  : "Your first scout belongs here."}
              </h3>
              <p>
                {olderPage
                  ? "Return to your latest scouts to see the current list."
                  : "Tell your AI scout what work you want to find. You’ll review the details before saving."}
              </p>
            </div>
          </div>
        )}
        {(olderPage || page.nextCursor) && (
          <nav className="workspace-pagination" aria-label="Scout pages">
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
                Earlier scouts <Icon name="arrowRight" size={18} />
              </Link>
            )}
          </nav>
        )}
      </section>
      <section
        id="opportunities"
        className="workspace-section"
        aria-labelledby="opportunities-heading"
      >
        <div className="workspace-section-heading">
          <div>
            <h2 id="opportunities-heading">Opportunities</h2>
            <p>
              Recent potential matches from connected sources, grouped across
              your scouts.
            </p>
          </div>
          <RefreshDashboard searching={searching} />
        </div>
        {page.discovery.sources.length > 0 && (
          <p className="workspace-coverage">
            {freshSources.length} of {page.discovery.sources.length} connected
            sources have fresh evidence.{" "}
            {page.discovery.sources.some((source) => source.failedAt)
              ? "A source refresh failed; results use its last fresh evidence where available."
              : "Source feeds refresh every five minutes. Client requests are checked individually before an email."}
          </p>
        )}
        {page.discovery.email.uncertainCount > 0 && (
          <p className="workspace-email-note">
            An email submission needs checking. We’re holding those postings to
            avoid sending them twice.
          </p>
        )}
        {page.discovery.email.rejectedCount > 0 && (
          <p className="workspace-email-note">
            A previous email was rejected. Unsent opportunities remain available
            for a later digest.
          </p>
        )}
        {page.opportunities.length > 0 ? (
          <div className="workspace-opportunity-list">
            {page.opportunities.map((opportunity) => (
              <OpportunityRow key={opportunity.id} opportunity={opportunity} />
            ))}
          </div>
        ) : (
          <div className="workspace-opportunity-empty">
            <span className="workspace-empty-symbol">
              <Icon name="briefcase" size={31} />
            </span>
            <h3>
              {hasScouts
                ? searching
                  ? "Your scout is checking for opportunities."
                  : hasActiveScouts
                    ? "No current matches to show yet."
                    : "Your scouts are paused."
                : "Make room for your next opportunity."}
            </h3>
            <p>
              {hasScouts
                ? !hasActiveScouts
                  ? "Resume a scout when you’re ready to start searching again. Its brief and alert choices are saved."
                  : "Your scout checks connected job boards and a rolling feed of international client projects and service requests. Coverage is limited, and your requirements may exclude unclear postings. It will keep checking for suitable work."
                : "Save your first scout to set your search direction. There are no live search results yet."}
            </p>
            <Link
              href={`/dashboard/examples?category=${examplesCategory}`}
              className="workspace-preview-link"
            >
              Preview example opportunities <Icon name="arrowRight" size={18} />
            </Link>
            <span className="workspace-example-note">
              Fictional examples · No live search results
            </span>
          </div>
        )}
      </section>
      {page.hiddenOpportunities.length > 0 && (
        <details className="workspace-hidden">
          <summary>
            Hidden opportunities{" "}
            <span>{page.hiddenOpportunities.length} shown</span>
            <Icon name="chevronDown" size={18} />
          </summary>
          <p>
            Your latest hidden choices. Undo makes an opportunity eligible for a
            future search; current availability and fit will still be checked.
          </p>
          {page.hiddenOpportunities.map((opportunity) => (
            <article className="workspace-hidden-row" key={opportunity.id}>
              <div>
                <h3>{opportunity.title}</h3>
                <p>{opportunity.company}</p>
              </div>
              <OpportunityFeedbackControls
                key={`${opportunity.id}:${opportunity.feedback?.version ?? 0}`}
                opportunity={opportunity}
              />
            </article>
          ))}
        </details>
      )}
      <footer className="workspace-footer">
        <Icon name="shield" size={18} />
        <span>
          Your scouts are saved to your account. Sign in with this email on
          another device to see them.
        </span>
      </footer>
    </DashboardShell>
  );
}
