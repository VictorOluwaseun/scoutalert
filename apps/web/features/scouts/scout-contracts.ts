import type { ScoutDraft } from "../onboarding/types";
import type { VerifiedAccount } from "../account/account-client";

/** Public saved-scout DTO; transport types contain no persistence or account credentials. */
export interface SavedScout {
  id: string;
  name: string;
  status: "active" | "paused";
  discovery:
    "pending" | "searching" | "completed" | "failed" | "coverage_unavailable";
  activatedAt: string;
  search: Pick<
    ScoutDraft,
    | "goal"
    | "category"
    | "target"
    | "name"
    | "arrangement"
    | "arrangementRequired"
    | "residence"
    | "workLocations"
    | "background"
    | "authorizationLocations"
    | "sponsorshipNeed"
    | "authorizationConfirmed"
    | "minimumPay"
    | "currency"
    | "payPeriod"
    | "unknownEligibility"
    | "undisclosedPay"
  >;
  alerts: {
    frequency: ScoutDraft["frequency"];
    timezone: string;
    deliveryTime: string;
    weekday: string;
    promptAlerts: boolean;
    quietHours?: { start: string; end: string };
    consent: boolean;
    consentVersion: "opportunity-alerts-v1";
  };
}

/** Current editable snapshot; the version must accompany every mutation. */
export interface ManagedScout extends SavedScout {
  version: number;
}

/** One server-authorized page; the cursor only selects ordering within the verified account. */
export interface ScoutDashboard {
  account: VerifiedAccount;
  items: ManagedScout[];
  nextCursor: string | null;
  opportunities: Opportunity[];
  hiddenOpportunities: Opportunity[];
  discovery: {
    sources: {
      id: string;
      checkedAt: string | null;
      failedAt: string | null;
      postingCount: number;
    }[];
    runs: {
      scoutId: string;
      status: string;
      finishedAt: string | null;
      matchCount: number;
    }[];
    email: {
      acceptedAt: string | null;
      uncertainCount: number;
      rejectedCount: number;
    };
  };
}

/** Transport evidence is separate from saved briefs; all source links are validated before rendering. */
export interface Opportunity {
  kind?: "job" | "client_request";
  feedback?: { value: "relevant" | "hidden" | "none"; version: number };
  id: string;
  title: string;
  company: string;
  location: string;
  url: string;
  checkedAt: string;
  scouts: string[];
  assessmentScout?: string | null;
  availability?: {
    status: "available" | "closed" | "changed" | "unresolved";
    checkedAt: string;
    sourceUrl: string;
    fingerprint: string | null;
  } | null;
  detail?: {
    assessedBy: "ai";
    verificationPolicy?: "supported-criteria-v2" | "supported-criteria-v3";
    employerResearch?: {
      checkedAt: string;
      expiresAt: string;
      documents: { url: string; checkedAt: string; fingerprint: string }[];
      findings: {
        fact: string;
        status: "resolved" | "unresolved" | "conflicting";
        applicability: string;
        explanation: string;
        value: string;
        quotes: string[];
        sourceUrl: string | null;
      }[];
    };
    criteria: {
      criterion: string;
      status: "meets" | "conflicts" | "unknown";
      explanation: string;
      quotes: string[];
      briefQuotes: string[];
    }[];
    research: { criterion: string; question: string; status: "unresolved" }[];
  } | null;
  reasons: string[];
  uncertainties: string[];
}

/** Requires bounded string lists for source evidence and private scout contributions. */
function strings(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= 200 &&
    value.every((item) => typeof item === "string" && item.length <= 5000)
  );
}

/** Validates source URLs and every displayed field; HTML from a provider is never rendered. */
function parseOpportunity(value: unknown): Opportunity | null {
  const item = record(value);
  if (
    !item ||
    !["id", "title", "company", "location", "url", "checkedAt"].every(
      (key) => typeof item[key] === "string",
    ) ||
    !strings(item.scouts) ||
    !strings(item.reasons) ||
    !strings(item.uncertainties) ||
    (item.kind != null &&
      !["job", "client_request"].includes(String(item.kind))) ||
    !validFeedback(item.feedback) ||
    !validDetail(item.detail) ||
    !validAvailability(item.availability) ||
    (item.assessmentScout != null && typeof item.assessmentScout !== "string")
  )
    return null;
  try {
    const url = new URL(String(item.url));
    if (url.protocol !== "https:" || url.username || url.password || url.port)
      return null;
    if (!Number.isFinite(Date.parse(String(item.checkedAt)))) return null;
    return item as unknown as Opportunity;
  } catch {
    return null;
  }
}

/** Accepts only dated public ATS observations; source links cannot redirect presentation to an arbitrary host. */
function validAvailability(value: unknown): boolean {
  if (value == null) return true;
  const item = record(value);
  if (
    !item ||
    !["available", "closed", "changed", "unresolved"].includes(
      String(item.status),
    ) ||
    typeof item.checkedAt !== "string" ||
    !Number.isFinite(Date.parse(item.checkedAt)) ||
    typeof item.sourceUrl !== "string"
  )
    return false;
  try {
    const url = new URL(item.sourceUrl);
    return (
      [
        "https://boards-api.greenhouse.io",
        "https://www.freelancer.com",
      ].includes(url.origin) &&
      !url.username &&
      !url.password &&
      (item.fingerprint === null || typeof item.fingerprint === "string")
    );
  } catch {
    return false;
  }
}

/** Checks assessment details before displaying provider-derived text; optional during rollout. */
function validDetail(value: unknown): boolean {
  if (value == null) return true;
  const detail = record(value);
  if (
    !detail ||
    detail.assessedBy !== "ai" ||
    !validEmployerResearch(detail.employerResearch) ||
    !Array.isArray(detail.criteria) ||
    detail.criteria.length !== 7 ||
    !Array.isArray(detail.research) ||
    detail.research.length > 7
  )
    return false;
  const names = [
    "role",
    "category",
    "arrangement",
    "location",
    "experience",
    "authorization",
    "compensation",
  ];
  const criteria = detail.criteria.every((input) => {
    const item = record(input);
    return (
      item &&
      names.includes(String(item.criterion)) &&
      ["meets", "conflicts", "unknown"].includes(String(item.status)) &&
      typeof item.explanation === "string" &&
      item.explanation.length <= 600 &&
      strings(item.quotes) &&
      strings(item.briefQuotes)
    );
  });
  return (
    criteria &&
    detail.research.every((input) => {
      const item = record(input);
      return (
        item &&
        names.includes(String(item.criterion)) &&
        typeof item.question === "string" &&
        item.question.length <= 600 &&
        item.status === "unresolved"
      );
    })
  );
}

/** Validates the bounded run/coverage projection without accepting private infrastructure failures. */
function parseDiscovery(value: unknown): ScoutDashboard["discovery"] | null {
  const summary = record(value);
  const email = record(summary?.email);
  if (
    !summary ||
    !email ||
    !Array.isArray(summary.sources) ||
    summary.sources.length > 10 ||
    !Array.isArray(summary.runs) ||
    summary.runs.length > 20
  )
    return null;
  const date = (input: unknown) =>
    input === null ||
    (typeof input === "string" && Number.isFinite(Date.parse(input)));
  const validSource = summary.sources.every((input) => {
    const source = record(input);
    return (
      source &&
      typeof source.id === "string" &&
      date(source.checkedAt) &&
      date(source.failedAt) &&
      Number.isSafeInteger(source.postingCount) &&
      Number(source.postingCount) >= 0
    );
  });
  const validRun = summary.runs.every((input) => {
    const run = record(input);
    return (
      run &&
      typeof run.scoutId === "string" &&
      [
        "searching",
        "completed",
        "failed",
        "cancelled",
        "coverage_unavailable",
      ].includes(String(run.status)) &&
      date(run.finishedAt) &&
      Number.isSafeInteger(run.matchCount) &&
      Number(run.matchCount) >= 0
    );
  });
  if (
    !validSource ||
    !validRun ||
    !date(email.acceptedAt) ||
    !Number.isSafeInteger(email.uncertainCount) ||
    !Number.isSafeInteger(email.rejectedCount) ||
    Number(email.uncertainCount) < 0 ||
    Number(email.rejectedCount) < 0
  )
    return null;
  return summary as unknown as ScoutDashboard["discovery"];
}

/** Narrows untrusted JSON without accepting primitives or arrays. */
function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Checks the fields displayed by onboarding and the dashboard before accepting server state. */
export function parseSavedScout(value: unknown): SavedScout | null {
  const scout = record(value);
  const search = record(scout?.search);
  const alerts = record(scout?.alerts);
  if (!scout || !search || !alerts) return null;
  const textFields = [
    "goal",
    "target",
    "name",
    "residence",
    "workLocations",
    "background",
    "minimumPay",
  ];
  const validSearch =
    textFields.every((field) => typeof search[field] === "string") &&
    ["employment", "contracts", "services"].includes(String(search.category)) &&
    ["remote", "hybrid", "onsite", "open", "unknown"].includes(
      String(search.arrangement),
    ) &&
    ["USD", "EUR", "GBP", "NGN"].includes(String(search.currency)) &&
    ["year", "month", "hour", "project"].includes(String(search.payPeriod)) &&
    ["review", "exclude"].includes(String(search.unknownEligibility)) &&
    ["include", "exclude"].includes(String(search.undisclosedPay)) &&
    typeof search.arrangementRequired === "boolean" &&
    (search.authorizationLocations === undefined ||
      (typeof search.authorizationLocations === "string" &&
        search.authorizationLocations.length <= 300)) &&
    (search.authorizationConfirmed === undefined ||
      typeof search.authorizationConfirmed === "boolean") &&
    (search.sponsorshipNeed === undefined ||
      ["needed", "not_needed", "unknown"].includes(
        String(search.sponsorshipNeed),
      ));
  const quiet = record(alerts.quietHours);
  const validQuiet =
    alerts.quietHours === undefined ||
    (quiet &&
      [quiet.start, quiet.end].every(
        (value) =>
          typeof value === "string" &&
          /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value),
      ) &&
      quiet.start !== quiet.end);
  const validAlerts =
    validQuiet &&
    ["daily", "weekly", "dashboard"].includes(String(alerts.frequency)) &&
    ["timezone", "deliveryTime", "weekday"].every(
      (field) => typeof alerts[field] === "string",
    ) &&
    typeof alerts.consent === "boolean" &&
    typeof alerts.promptAlerts === "boolean" &&
    alerts.consentVersion === "opportunity-alerts-v1";
  if (
    !validSearch ||
    !validAlerts ||
    typeof scout.id !== "string" ||
    typeof scout.name !== "string" ||
    !["active", "paused"].includes(String(scout.status)) ||
    ![
      "pending",
      "searching",
      "completed",
      "failed",
      "coverage_unavailable",
    ].includes(String(scout.discovery)) ||
    typeof scout.activatedAt !== "string" ||
    !Number.isFinite(Date.parse(scout.activatedAt))
  )
    return null;
  return scout as unknown as SavedScout;
}

/** Fails closed on malformed API state, keeping private server failures out of the presentation. */
export function parseScoutDashboard(value: unknown): ScoutDashboard | null {
  const page = record(value);
  const account = record(page?.account);
  if (
    !page ||
    !account ||
    typeof account.id !== "string" ||
    typeof account.email !== "string" ||
    !Array.isArray(page.items) ||
    page.items.length > 20
  )
    return null;
  if (
    page.nextCursor !== null &&
    (typeof page.nextCursor !== "string" ||
      page.nextCursor.length > 256 ||
      !/^[A-Za-z0-9_-]+$/.test(page.nextCursor))
  )
    return null;
  const items = page.items.map(parseManagedScout);
  if (items.some((item) => item === null)) return null;
  if (!Array.isArray(page.opportunities) || page.opportunities.length > 20)
    return null;
  const opportunities = page.opportunities.map(parseOpportunity);
  if (
    !Array.isArray(page.hiddenOpportunities) ||
    page.hiddenOpportunities.length > 20
  )
    return null;
  const hiddenOpportunities = page.hiddenOpportunities.map(parseOpportunity);
  if (hiddenOpportunities.some((item) => item === null)) return null;
  const discovery = parseDiscovery(page.discovery);
  if (!discovery || opportunities.some((item) => item === null)) return null;
  return {
    account: account as unknown as VerifiedAccount,
    items: items as ManagedScout[],
    nextCursor: page.nextCursor,
    opportunities: opportunities as Opportunity[],
    hiddenOpportunities: hiddenOpportunities as Opportunity[],
    discovery,
  };
}

/** Validates optimistic concurrency markers before making saved state editable. */
export function parseManagedScout(value: unknown): ManagedScout | null {
  const scout = parseSavedScout(value);
  const version = record(value)?.version;
  return scout && Number.isSafeInteger(version) && Number(version) > 0
    ? (value as ManagedScout)
    : null;
}

/** Accepts only explicit private choices and nonnegative feedback revisions. */
function validFeedback(value: unknown): boolean {
  if (value === undefined) return true;
  const item = record(value);
  return Boolean(
    item &&
    ["relevant", "hidden", "none"].includes(String(item.value)) &&
    Number.isSafeInteger(item.version) &&
    Number(item.version) >= 0,
  );
}

/** Only bounded dated employer evidence is rendered; source links must match the captured approved documents. */
function validEmployerResearch(value: unknown): boolean {
  if (value === undefined) return true;
  const item = record(value);
  if (
    !item ||
    ![item.checkedAt, item.expiresAt].every(
      (date) => typeof date === "string" && Number.isFinite(Date.parse(date)),
    ) ||
    !Array.isArray(item.documents) ||
    item.documents.length > 2 ||
    !Array.isArray(item.findings) ||
    item.findings.length !== 3
  )
    return false;
  const allowed = [
    "https://www.figma.com/careers/",
    "https://remote.com/careers",
    "https://remote.com/openings",
  ];
  const documents = item.documents.map(record);
  if (
    !documents.every(
      (doc) =>
        doc &&
        allowed.includes(String(doc.url)) &&
        typeof doc.checkedAt === "string" &&
        Number.isFinite(Date.parse(doc.checkedAt)) &&
        typeof doc.fingerprint === "string",
    )
  )
    return false;
  return item.findings.every((input) => {
    const finding = record(input);
    return (
      !!finding &&
      ["location", "authorization", "sponsorship"].includes(
        String(finding.fact),
      ) &&
      ["resolved", "unresolved", "conflicting"].includes(
        String(finding.status),
      ) &&
      typeof finding.explanation === "string" &&
      finding.explanation.length <= 600 &&
      strings(finding.quotes) &&
      (finding.sourceUrl === null ||
        documents.some((doc) => doc?.url === finding.sourceUrl))
    );
  });
}
