import { sourceAccessMessage } from "./source-access-message";
import { Icon } from "@repo/ui/components/icon";
import type { SourceMonitor } from "./discovery-contracts";
import { discoveryTimestamp } from "./discovery-presentation";

/** Explains scheduling and access gaps without presenting captured changes as verified opportunities. */
function monitorStatus(source: SourceMonitor): string {
  if (source.status === "retired") {
    return "Monitoring stopped";
  }
  if (source.status === "deferred") {
    return source.reason === "daily_budget_reached"
      ? "Waiting for the source-check allowance to reset"
      : "Source unavailable; a retry is scheduled";
  }
  if (source.status === "pending_review") {
    return "Captured source awaiting review";
  }
  return source.kind === "probe"
    ? "New source to check"
    : "Scheduled for revisits";
}

/** A compact server-rendered disclosure keeps source health available alongside the existing search activity. */
export function SourceMonitoring({
  sources = [],
}: {
  sources?: SourceMonitor[];
}) {
  return (
    <section className="web-monitor-panel" aria-labelledby="web-monitor-title">
      <h2 id="web-monitor-title">Sources to revisit</h2>
      <p>
        Useful pages are checked again for new openings and project requests.
      </p>
      {!sources.length && (
        <p>
          Sources will appear here after your scouts find and review useful
          pages.
        </p>
      )}
      {!!sources.length && (
        <details className="web-monitor-list">
          <summary>
            Recent monitored pages ({sources.length}){" "}
            <Icon name="chevronDown" size={16} />
          </summary>
          {sources.map((source) => (
            <article key={source.url} className="web-monitor-row">
              <h3>
                <a href={source.url} target="_blank" rel="noopener noreferrer">
                  {source.title || new URL(source.url).hostname}
                  <Icon name="arrowRight" size={16} />
                </a>
              </h3>
              <p>{new URL(source.url).hostname}</p>
              <p>{monitorStatus(source)}</p>
              {sourceAccessMessage(source.reason) && (
                <p>{sourceAccessMessage(source.reason)}</p>
              )}
              <p>{source.scouts.join(", ")}</p>
              <p>
                {source.checks} checks · {source.changes} changes ·{" "}
                {source.discoveredLinks} links found
              </p>
              {source.checkedAt && (
                <p>Last checked {discoveryTimestamp(source.checkedAt)}</p>
              )}
              {source.status !== "retired" && (
                <p>Next check due {discoveryTimestamp(source.nextCheckAt)}</p>
              )}
            </article>
          ))}
        </details>
      )}
    </section>
  );
}
