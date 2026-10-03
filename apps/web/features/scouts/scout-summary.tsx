import Link from "next/link";
import { Icon } from "@repo/ui/components/icon";
import { categoryLabels, arrangementLabels } from "../onboarding/fixtures";
import { ScoutControls } from "./scout-controls";
import { scoutAlertSchedule } from "./scout-presentation";
import type {
  SavedScout,
  ManagedScout,
  ScoutDashboard,
} from "./scout-contracts";

const discoveryLabels: Record<SavedScout["discovery"], string> = {
  pending: "Search queued",
  searching: "Searching",
  completed: "Search checked",
  failed: "Search interrupted",
  coverage_unavailable: "Source unavailable",
};

/** Shows a persisted scout and lets the user inspect its confirmed brief with revision-fenced lifecycle controls. */
export function ScoutSummary({
  scout,
  run,
}: {
  scout: ManagedScout;
  run?: ScoutDashboard["discovery"]["runs"][number];
}) {
  const { search, alerts } = scout;

  return (
    <article className="dashboard-scout">
      <div className="dashboard-scout-top">
        <span className="dashboard-scout-icon">
          <Icon name="compass" size={26} />
        </span>
        <div className="dashboard-scout-title">
          <h3>
            <Link href={`/dashboard/scouts/${encodeURIComponent(scout.id)}`}>
              {scout.name}
            </Link>
          </h3>
          <p>{categoryLabels[search.category]}</p>
        </div>
        <span
          className="dashboard-scout-status"
          data-paused={scout.status === "paused"}
          data-discovery={scout.discovery}
        >
          <span />
          {scout.status === "paused"
            ? "Paused"
            : discoveryLabels[scout.discovery]}
        </span>
      </div>
      {scout.discovery === "coverage_unavailable" && (
        <p className="dashboard-scout-note">
          No fresh source evidence was available for this category on the last
          check. Your brief is saved and your scout will retry.
        </p>
      )}
      {scout.discovery === "failed" && (
        <p className="dashboard-scout-note">
          This search couldn’t finish. Your scout will retry on its next
          scheduled check.
        </p>
      )}
      {scout.discovery === "completed" && run && (
        <p className="dashboard-scout-note">
          {run?.matchCount ?? 0} potential{" "}
          {(run?.matchCount ?? 0) === 1 ? "match" : "matches"} in the latest
          check.
        </p>
      )}
      <details className="dashboard-scout-details">
        <summary>
          View confirmed brief <Icon name="chevronDown" size={18} />
        </summary>
        <div className="dashboard-scout-meta">
          <span>
            <Icon name="laptop" size={18} />
            {arrangementLabels[search.arrangement]}
          </span>
          <span>
            <Icon name="map" size={18} />
            {search.residence || "Residence not specified"}
          </span>
        </div>
        <div className="dashboard-scout-schedule">
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
        <div className="dashboard-brief-content">
          <p className="dashboard-brief-goal">{search.goal}</p>
          <dl>
            <div>
              <dt>Role or type of work</dt>
              <dd>{search.target}</dd>
            </div>
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
