import type { OpportunityView } from "@repo/core/scouting";
import {
  emailColors,
  emailLink,
  emailWebUrl,
  escapeHtml,
} from "./email-layout.js";

const availabilityLabels = {
  available: "Posting available when checked",
  unresolved: "Current availability needs confirmation",
  changed: "Posting changed; assessment needs updating",
  closed: "Posting closed or unavailable",
};

/** Formats an evidence timestamp in an explicit timezone; malformed data never invents a check date. */
function evidenceDate(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return "Date not available";
  }
  return `${new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(date)} UTC`;
}

/** Renders every reason or uncertainty; findings are never silently dropped to make a shorter email. */
function evidenceList(items: readonly string[]): string {
  return `<ul style="margin:8px 0 0;padding-left:20px;">${items.map((item) => `<li style="margin:0 0 5px;padding-left:2px;">${escapeHtml(item)}</li>`).join("")}</ul>`;
}

/** Preserves public employer findings and dated citations without including the user's private background or declarations. */
function employerEvidence(opportunity: OpportunityView): {
  html: string;
  text: string;
} {
  const research = opportunity.detail?.employerResearch;
  if (!research) {
    return { html: "", text: "" };
  }
  const findings = research.findings.map((item) => {
    const label = item.fact.charAt(0).toUpperCase() + item.fact.slice(1);
    const status = {
      resolved: "Evidence found",
      conflicting: "Conflicting evidence",
      unresolved: "Still unclear",
    }[item.status];
    const url = item.sourceUrl ? emailWebUrl(item.sourceUrl) : null;
    return {
      html: `<p style="margin:12px 0 0;"><strong>${escapeHtml(label)}: ${escapeHtml(status)}</strong><br>${escapeHtml(item.explanation)}${url ? `<br>${emailLink("Read employer source", url)}` : ""}</p>`,
      text: `${label}: ${status}\n${item.explanation}${url ? `\n${url}` : ""}`,
    };
  });
  const checked = `Employer evidence checked: ${evidenceDate(research.checkedAt)}`;
  const note = "Authorization comparisons use your declared details.";
  return {
    html: `<div class="email-rule" style="border-top:1px solid #dde1e6;margin:20px 0 0;padding-top:16px;"><p style="margin:0;font-weight:700;">Employer evidence</p>${findings.map((finding) => finding.html).join("")}<p class="email-muted" style="margin:12px 0 0;font-size:12px;line-height:19px;color:${emailColors.muted};">${escapeHtml(checked)}<br>${note}</p></div>`,
    text: `\n\n${checked}\n${findings.map((finding) => finding.text).join("\n\n")}\n${note}`,
  };
}

/** Creates an evidence-first listing summary in HTML and plain text from the same reserved opportunity. */
export function opportunityEmailEntry(opportunity: OpportunityView): {
  html: string;
  text: string;
} {
  const company = opportunity.company || "Organization not stated";
  const location = opportunity.location || "Location not stated";
  const kind =
    opportunity.kind === "client_request"
      ? "Client request"
      : "Job or contract";
  const scouts = opportunity.scouts.join(", ");
  const checked = `Evidence checked: ${evidenceDate(opportunity.checkedAt)}`;
  const source = emailWebUrl(opportunity.url);
  const sourceLabel = source
    ? new URL(source).hostname.replace(/^www\./, "")
    : "Source link unavailable";
  const research = employerEvidence(opportunity);
  const availability = opportunity.availability
    ? `${availabilityLabels[opportunity.availability.status]} · ${evidenceDate(opportunity.availability.checkedAt)}`
    : "Current availability needs confirmation";
  const reasons = opportunity.reasons.length
    ? `<p style="margin:20px 0 0;font-size:14px;font-weight:700;">Why it was found</p>${evidenceList(opportunity.reasons)}`
    : "";
  const uncertainties = opportunity.uncertainties.length
    ? `<table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="margin-top:18px;"><tr><td class="email-soft" style="background:${emailColors.soft};border-left:3px solid #9cae5c;padding:14px 16px;font-size:14px;line-height:22px;"><strong>Still to confirm</strong>${evidenceList(opportunity.uncertainties)}</td></tr></table>`
    : "";
  return {
    html: `<div class="email-rule" style="border-top:1px solid #dde1e6;margin-top:28px;padding-top:28px;">
      <p class="email-muted" style="margin:0 0 10px;font-size:12px;line-height:18px;color:${emailColors.muted};">${escapeHtml(kind)} &nbsp;/&nbsp; ${escapeHtml(sourceLabel)}</p>
      <h2 class="email-text" style="margin:0 0 8px;font-size:23px;line-height:29px;letter-spacing:-0.5px;color:${emailColors.ink};">${escapeHtml(opportunity.title)}</h2>
      <p style="margin:0;font-size:15px;line-height:23px;"><strong>${escapeHtml(company)}</strong><br>${escapeHtml(location)}</p>
      ${scouts ? `<p class="email-muted" style="margin:10px 0 0;font-size:12px;line-height:19px;color:${emailColors.muted};">Found for ${escapeHtml(scouts)}</p>` : ""}
      ${reasons}${uncertainties}${research.html}
      <p class="email-muted" style="margin:18px 0 0;font-size:12px;line-height:19px;color:${emailColors.muted};">${escapeHtml(checked)}<br>${escapeHtml(availability)}</p>
      <p style="margin:16px 0 0;font-size:14px;font-weight:700;">${source ? emailLink("View original posting", source) : "Source link unavailable. Review this opportunity in ScoutAlert."}</p>
    </div>`,
    text:
      [
        `${opportunity.title} — ${company}`,
        `${kind}\n${location}`,
        scouts ? `Scouts: ${scouts}` : "",
        opportunity.reasons.length
          ? `Why it was found:\n${opportunity.reasons.map((reason) => `- ${reason}`).join("\n")}`
          : "",
        opportunity.uncertainties.length
          ? `Still to confirm:\n${opportunity.uncertainties.map((item) => `- ${item}`).join("\n")}`
          : "",
        `${checked}\n${availability}`,
        source ??
          "Source link unavailable. Review this opportunity in ScoutAlert.",
      ]
        .filter(Boolean)
        .join("\n\n") + research.text,
  };
}

/** Bounds visible labels in the compact fallback while leaving complete source text in the plain-text alternative. */
function compactLabel(value: string): string {
  const characters = Array.from(value);
  return characters.length > 180
    ? `${characters.slice(0, 180).join("")}…`
    : value;
}

/** Keeps every reserved listing and its uncertainty count visible when a full digest would be clipped by email clients. */
export function compactOpportunityEmailEntry(
  opportunity: OpportunityView,
): string {
  const count = opportunity.uncertainties.length;
  const status = count
    ? `${count} ${count === 1 ? "detail" : "details"} still to confirm. Review the full reasons and evidence in ScoutAlert.`
    : "Review the full reasons, evidence and current availability in ScoutAlert.";
  const source = emailWebUrl(opportunity.url);
  const link =
    source && source.length <= 512
      ? emailLink("View original posting", source)
      : "Open ScoutAlert to view the original posting.";
  return `<div class="email-rule" style="border-top:1px solid #dde1e6;margin-top:24px;padding-top:24px;"><h2 style="margin:0 0 8px;font-size:20px;line-height:27px;">${escapeHtml(compactLabel(opportunity.title))}</h2><p style="margin:0;font-size:14px;line-height:23px;">${escapeHtml(compactLabel(opportunity.company || "Organization not stated"))}<br>${escapeHtml(compactLabel(opportunity.location || "Location not stated"))}</p><p class="email-muted" style="margin:12px 0;color:${emailColors.muted};font-size:13px;line-height:21px;">${status}</p><p style="margin:0;font-size:14px;">${link}</p></div>`;
}
