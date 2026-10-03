import type { WebDiscoveryLead } from "./discovery-contracts";

/** Keeps reviewed offers, discussions, directories and closed postings out of the potential lead list. */
export function excludedLead(lead: WebDiscoveryLead): boolean {
  return (
    !!lead.review &&
    ["service_offer", "discussion", "directory", "closed"].includes(
      lead.review.label,
    )
  );
}

/** Uses an explicit time zone so server-rendered dates agree with hydrated browser content. */
export function discoveryTimestamp(value: string): string {
  return (
    new Date(value).toLocaleString("en-GB", {
      timeZone: "UTC",
      dateStyle: "medium",
      timeStyle: "short",
    }) + " UTC"
  );
}
