import Link from "next/link";
import { Icon } from "@repo/ui/components/icon";
import type { WebDiscoveryCase } from "./discovery-contracts";
import { discoveryTimestamp } from "./discovery-presentation";

const statuses: Record<string, string> = {
  searching: "Searching",
  completed: "Search checked",
  partial: "Some sources unavailable",
  deferred: "Continues later",
  unavailable: "Needs attention",
  cancelled: "Brief updated",
};

const reasons: Record<string, string> = {
  native_posts_checked:
    "Posts were received directly from X and saved for review. Your scout’s requirements still apply before recommendations or alerts.",
  monitored_sources_checked:
    "A scheduled source check captured evidence for review. Your scout’s requirements still apply before any recommendation or alert.",
  provider_not_configured:
    "Web search wasn’t connected when this run started. Your scout will try again on its next scheduled search.",
  public_intent_required:
    "Edit the role or type of work in your scout to give it a short, clear search target.",
  daily_budget_reached:
    "The current search allowance has been reached. Your scout will try again in a later run.",
  deadline_reached:
    "This search reached its time limit. The leads already found are saved.",
  some_sources_unavailable:
    "Some pages restrict access or could not be read. Search snippets remain unverified.",
  bounded_search_window:
    "This search checked a limited set of recent results. It does not cover every posting or platform.",
  superseded: "Your latest scout brief takes priority.",
  provider_configuration_changed:
    "Search access changed. A later run will use the updated connection.",
};

const explorationLabels: Record<string, string> = {
  follow_source_link: "Followed a relevant source link",
  check_promising_result: "Checked a promising result",
  continue_result_page: "Checked another results page",
  refine_demand_query: "Refined the search for openings or requests",
  broaden_query_wording: "Tried different search wording",
  exploration_limit: "Reached this search’s exploration allowance",
  no_further_action: "No useful follow-up remained",
};

/** Explains review progress without implying that every lead or source has been verified. */
function reviewDescription(run: WebDiscoveryCase): string {
  if (run.reviewReason === "ai_budget_reached") {
    return "Today’s AI review allowance has been reached. Saved leads can be reviewed after the allowance resets.";
  }

  if (run.reviewStatus === "deferred") {
    return "This review window ended. Some leads still need checking.";
  }

  if (run.reviewReason === "some_reviews_unavailable") {
    return "This review pass finished with some leads unresolved.";
  }

  if (run.reviewStatus === "complete") {
    return run.reviewReason === "source_reviews_complete"
      ? "Captured sources have been reviewed. Other search snippets remain unverified."
      : "This review pass is complete. See each result’s evidence for details.";
  }

  return "Checking the leads found in this search.";
}

/** Summarizes one search by scout, status and completed checks; its full trail stays available on expansion. */
function ActivityRow({ run }: { run: WebDiscoveryCase }) {
  return (
    <article className="web-activity">
      <h3>{run.scoutName}</h3>
      <span className="web-activity-status" data-status={run.status}>
        <span aria-hidden="true" />
        {run.reason === "native_posts_checked"
          ? "X posts received"
          : run.reason === "monitored_sources_checked"
            ? "Monitored sources checked"
            : run.reason === "provider_not_configured"
              ? "Search unavailable"
              : (statuses[run.status] ?? "Status unavailable")}
      </span>
      <dl className="web-activity-counts">
        <div>
          <dt>Leads</dt>
          <dd>{run.leadCount}</dd>
        </div>
        {run.provider !== "x-api" && (
          <div>
            <dt>Searches</dt>
            <dd>{run.searchesCompleted}</dd>
          </div>
        )}
        {run.provider !== "x-api" && (
          <div>
            <dt>Sources checked</dt>
            <dd>{run.documentsChecked}</dd>
          </div>
        )}
      </dl>
      <details className="web-activity-details">
        <summary>
          Search details <Icon name="chevronDown" size={16} />
        </summary>
        <div>
          <p>
            {reasons[run.reason ?? ""] ??
              "Your scout is checking recent public search results."}
          </p>
          {run.strategy && (
            <section className="web-exploration">
              <h4>Search approach</h4>
              <p>
                {run.strategy.targets.length > 1
                  ? "These options are searched separately. Your requirements still apply to every recommendation."
                  : "Searching for this work using the preferences in your scout."}
              </p>
              <ul>
                {run.strategy.targets.map((target) => (
                  <li key={target}>{target}</li>
                ))}
              </ul>
            </section>
          )}
          {!!run.exploration?.length && (
            <section className="web-exploration">
              <h4>How the search developed</h4>
              <p>
                Selected steps; some may still be waiting for a search
                allowance.
              </p>
              <ol>
                {run.exploration.map((decision, index) => (
                  <li key={index}>
                    <strong>
                      {explorationLabels[decision.reason] ??
                        "Considered a follow-up"}
                    </strong>
                    {decision.target && <p>{decision.target}</p>}
                  </li>
                ))}
              </ol>
            </section>
          )}
          {run.reviewStatus && run.leadCount > 0 && (
            <section className="web-exploration">
              <h4>AI review</h4>
              <p>{reviewDescription(run)}</p>
            </section>
          )}
          <p className="web-lead-date">
            Started {discoveryTimestamp(run.startedAt)}
          </p>
          <Link href={`/dashboard/scouts/${encodeURIComponent(run.scoutId)}`}>
            View scout settings <Icon name="arrowRight" size={16} />
          </Link>
        </div>
      </details>
    </article>
  );
}

/** Shows the three newest runs across scouts, with earlier activity accessible in a disclosure; the supplied API order is preserved. */
export function SearchActivity({ runs }: { runs: WebDiscoveryCase[] }) {
  const newestFirst = [...runs].sort(
    (first, second) =>
      Date.parse(second.startedAt) - Date.parse(first.startedAt),
  );
  const recent = newestFirst.slice(0, 3);
  const earlier = newestFirst.slice(3);

  return (
    <aside className="web-activity-panel" aria-labelledby="web-activity-title">
      <div className="web-section-heading">
        <h2 id="web-activity-title">Search activity</h2>
        <Icon name="compass" size={21} />
      </div>
      <div className="web-activity-list">
        {recent.map((run) => (
          <ActivityRow key={run.id} run={run} />
        ))}
        {runs.length === 0 && (
          <div className="web-activity-empty">
            <p>Your scouts’ search progress will appear here.</p>
            <Link href="/dashboard#scouts">View your scouts</Link>
          </div>
        )}
        {earlier.length > 0 && (
          <details className="web-earlier-activity">
            <summary>
              Earlier searches ({earlier.length}){" "}
              <Icon name="chevronDown" size={16} />
            </summary>
            {earlier.map((run) => (
              <ActivityRow key={run.id} run={run} />
            ))}
          </details>
        )}
      </div>
      <p className="web-activity-note">
        Lead counts include all results found in each search, before review.
      </p>
    </aside>
  );
}
