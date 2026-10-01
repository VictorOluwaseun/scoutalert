import type { SavedScout } from "./scout-contracts";

/** Formats confirmed delivery preferences consistently in the saved receipt and dashboard. */
export function scoutAlertSchedule(alerts: SavedScout["alerts"]): string {
  if (alerts.frequency === "dashboard")
    return "Dashboard only · Opportunity emails off";
  const day =
    alerts.frequency === "weekly" ? `Every ${alerts.weekday}` : "Daily";
  return `${day} at ${alerts.deliveryTime} · ${alerts.timezone}`;
}
