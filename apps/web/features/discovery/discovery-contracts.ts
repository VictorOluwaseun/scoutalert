export interface WebDiscoveryLead {
  nativeContext?: {
    complete: boolean;
    bounded: boolean;
    missingIds: string[];
    dependencies: string[];
    posts: {
      id: string;
      url: string;
      authorId: string;
      text: string;
      checkedAt: string;
      relation: "replied_to" | "quoted" | "retweeted" | "conversation";
      depth: number;
    }[];
  } | null;
  nativePost?: {
    platform: "x";
    id: string;
    authorId: string;
    publishedAt: string;
    conversationId: string;
    editIds: string[];
    references: { id: string; type: "replied_to" | "quoted" | "retweeted" }[];
  } | null;
  review: {
    label:
      | "job_opening"
      | "client_request"
      | "service_offer"
      | "discussion"
      | "directory"
      | "closed"
      | "unclear";
    scope: "source" | "search_excerpt";
    explanation: string;
    quotes: string[];
    reviewedAt: string;
    facts: Record<
      string,
      { status: "stated" | "unknown" | "conflicting"; value: string }
    >;
  } | null;

  id: string;
  url: string;
  title: string | null;
  snippet: string | null;
  source: string;
  firstSeenAt: string;
  lastSeenAt: string;
  checkedAt: string | null;
  contentStatus: string;
  /** Last source access outcome; absent on historical responses. */
  contentReason?: string | null;
  content: string | null;
  postingId: string | null;
  scouts: string[];
}
export interface WebDiscoveryCase {
  strategy?: { targets: string[]; explanation: string } | null;
  exploration?: {
    reason: string;
    kind: string | null;
    target: string | null;
  }[];
  reviewStatus: string | null;
  reviewReason: string | null;
  id: string;
  scoutId: string;
  scoutName: string;
  scoutVersion: number;
  provider: string | null;
  status: string;
  reason: string | null;
  startedAt: string;
  finishedAt: string | null;
  searchesCompleted: number;
  documentsChecked: number;
  leadCount: number;
}
export interface SourceMonitor {
  title?: string | null;
  url: string;
  kind: "directory" | "posting" | "probe";
  status: "active" | "deferred" | "pending_review" | "retired";
  reason: string;
  checkedAt: string | null;
  nextCheckAt: string;
  checks: number;
  changes: number;
  discoveredLinks: number;
  scouts: string[];
}
export interface WebDiscoveryPage {
  monitors?: SourceMonitor[];
  account: { id: string; email: string };
  cases: WebDiscoveryCase[];
  leads: WebDiscoveryLead[];
}

/** Narrows untrusted transport objects before reading fields. */
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Accepts bounded nullable source text without rendering it as markup. */
function nullableText(value: unknown, maximum: number): value is string | null {
  return (
    value === null || (typeof value === "string" && value.length <= maximum)
  );
}

/** Rejects unsafe external navigation and malformed provenance in private reads. */
function lead(value: unknown): value is WebDiscoveryLead {
  if (
    !record(value) ||
    typeof value.id !== "string" ||
    typeof value.url !== "string" ||
    typeof value.source !== "string" ||
    typeof value.contentStatus !== "string"
  ) {
    return false;
  }

  try {
    const url = new URL(value.url);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      value.url.length > 2048
    ) {
      return false;
    }
  } catch {
    return false;
  }

  return (
    validNativePost(value.nativePost) &&
    validNativeContext(value.nativeContext) &&
    validReview(value.review) &&
    nullableText(value.title, 1000) &&
    nullableText(value.snippet, 8000) &&
    nullableText(value.content, 16000) &&
    (value.contentReason === undefined ||
      nullableText(value.contentReason, 100)) &&
    nullableText(value.postingId, 128) &&
    nullableText(value.checkedAt, 64) &&
    typeof value.firstSeenAt === "string" &&
    typeof value.lastSeenAt === "string" &&
    Number.isFinite(Date.parse(value.lastSeenAt)) &&
    (value.checkedAt === null ||
      Number.isFinite(Date.parse(value.checkedAt))) &&
    Array.isArray(value.scouts) &&
    value.scouts.every((name) => typeof name === "string")
  );
}

/** Accepts only bounded plain-text context with canonical X links; a related post retains its own attribution. */
function validNativeContext(value: unknown): boolean {
  if (value === undefined || value === null) {
    return true;
  }
  if (!record(value)) {
    return false;
  }
  const postId = (item: unknown) =>
    typeof item === "string" && /^\d{1,25}$/.test(item);
  const ids = (items: unknown) =>
    Array.isArray(items) && items.length <= 6 && items.every(postId);
  return (
    typeof value.complete === "boolean" &&
    typeof value.bounded === "boolean" &&
    ids(value.dependencies) &&
    ids(value.missingIds) &&
    Array.isArray(value.posts) &&
    value.posts.length <= 6 &&
    value.posts.every(
      (post) =>
        record(post) &&
        postId(post.id) &&
        postId(post.authorId) &&
        typeof post.url === "string" &&
        /^https:\/\/x\.com\/i\/status\/\d{1,25}$/.test(post.url) &&
        typeof post.text === "string" &&
        post.text.length <= 2000 &&
        typeof post.checkedAt === "string" &&
        Number.isFinite(Date.parse(post.checkedAt)) &&
        (post.depth === 1 || post.depth === 2) &&
        ["replied_to", "quoted", "retweeted", "conversation"].includes(
          String(post.relation),
        ),
    )
  );
}

/** Accepts native public provenance separately from Google snippets and ordinary page captures. */
function validNativePost(value: unknown): boolean {
  if (value === undefined || value === null) {
    return true;
  }
  if (!record(value) || value.platform !== "x") {
    return false;
  }
  const postId = (item: unknown) =>
    typeof item === "string" && /^\d{1,25}$/.test(item);
  return (
    [value.id, value.authorId, value.conversationId].every(postId) &&
    typeof value.publishedAt === "string" &&
    Number.isFinite(Date.parse(value.publishedAt)) &&
    Array.isArray(value.editIds) &&
    value.editIds.length <= 20 &&
    value.editIds.every(postId) &&
    Array.isArray(value.references) &&
    value.references.length <= 3 &&
    value.references.every(
      (item) =>
        record(item) &&
        postId(item.id) &&
        ["replied_to", "quoted", "retweeted"].includes(String(item.type)),
    )
  );
}

/** Validates cited review text independently of personal fit; provider content stays plain text. */
function validReview(value: unknown): boolean {
  if (value === null) {
    return true;
  }
  if (!record(value) || !record(value.facts)) {
    return false;
  }
  return (
    [
      "job_opening",
      "client_request",
      "service_offer",
      "discussion",
      "directory",
      "closed",
      "unclear",
    ].includes(String(value.label)) &&
    ["source", "search_excerpt"].includes(String(value.scope)) &&
    typeof value.explanation === "string" &&
    value.explanation.length <= 600 &&
    typeof value.reviewedAt === "string" &&
    Number.isFinite(Date.parse(value.reviewedAt)) &&
    Array.isArray(value.quotes) &&
    value.quotes.length <= 4 &&
    value.quotes.every(
      (quote) => typeof quote === "string" && quote.length <= 5000,
    ) &&
    Object.keys(value.facts).length <= 8 &&
    Object.values(value.facts).every(
      (fact) =>
        record(fact) &&
        ["stated", "unknown", "conflicting"].includes(String(fact.status)) &&
        typeof fact.value === "string" &&
        fact.value.length <= 1200,
    )
  );
}

/** Rejects malformed counts and activity identities before presenting server-owned progress. */
function activity(value: unknown): value is WebDiscoveryCase {
  return (
    record(value) &&
    validExploration(value.exploration) &&
    validStrategy(value.strategy) &&
    typeof value.id === "string" &&
    typeof value.scoutId === "string" &&
    typeof value.scoutName === "string" &&
    typeof value.status === "string" &&
    typeof value.startedAt === "string" &&
    Number.isFinite(Date.parse(value.startedAt)) &&
    nullableText(value.finishedAt, 64) &&
    nullableText(value.provider, 80) &&
    nullableText(value.reason, 160) &&
    nullableText(value.reviewStatus, 40) &&
    nullableText(value.reviewReason, 80) &&
    [
      value.scoutVersion,
      value.searchesCompleted,
      value.documentsChecked,
      value.leadCount,
    ].every(
      (count) =>
        typeof count === "number" && Number.isSafeInteger(count) && count >= 0,
    )
  );
}

/** Accepts a bounded public explanation while retaining compatibility with historical deterministic plans. */
function validStrategy(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    (record(value) &&
      typeof value.explanation === "string" &&
      value.explanation.length <= 600 &&
      Array.isArray(value.targets) &&
      value.targets.length > 0 &&
      value.targets.length <= 3 &&
      value.targets.every(
        (target) => typeof target === "string" && target.length <= 160,
      ))
  );
}

/** Keeps the bounded planning trail plain text; observed URLs never become executable markup. */
function validExploration(value: unknown): boolean {
  return (
    value === undefined ||
    (Array.isArray(value) &&
      value.length <= 5 &&
      value.every(
        (item) =>
          record(item) &&
          typeof item.reason === "string" &&
          item.reason.length <= 80 &&
          [null, "search", "document"].includes(item.kind as string | null) &&
          nullableText(item.target, 2048),
      ))
  );
}

/** Accepts a bounded owner-scoped monitoring view with safe public navigation and valid scheduling dates. */
function validMonitors(value: unknown): value is SourceMonitor[] | undefined {
  return (
    value === undefined ||
    (Array.isArray(value) && value.length <= 40 && value.every(validMonitor))
  );
}

/** Validates one source-health row; source labels and URLs remain plain text. */
function validMonitor(value: unknown): value is SourceMonitor {
  if (
    !record(value) ||
    typeof value.url !== "string" ||
    value.url.length > 2048
  ) {
    return false;
  }
  try {
    const url = new URL(value.url);
    if (url.protocol !== "https:" || url.username || url.password || url.port) {
      return false;
    }
  } catch {
    return false;
  }
  return (
    (value.title === undefined || nullableText(value.title, 1000)) &&
    ["directory", "posting", "probe"].includes(String(value.kind)) &&
    ["active", "deferred", "pending_review", "retired"].includes(
      String(value.status),
    ) &&
    typeof value.reason === "string" &&
    value.reason.length <= 100 &&
    (value.checkedAt === null ||
      (typeof value.checkedAt === "string" &&
        Number.isFinite(Date.parse(value.checkedAt)))) &&
    typeof value.nextCheckAt === "string" &&
    Number.isFinite(Date.parse(value.nextCheckAt)) &&
    [value.checks, value.changes, value.discoveredLinks].every(
      (count) =>
        typeof count === "number" && Number.isInteger(count) && count >= 0,
    ) &&
    Array.isArray(value.scouts) &&
    value.scouts.length <= 100 &&
    value.scouts.every((name) => typeof name === "string")
  );
}

/** Validates the bounded private API response; a transport failure never turns into fabricated results. */
export function parseWebDiscoveryPage(value: unknown): WebDiscoveryPage | null {
  if (
    !record(value) ||
    !record(value.account) ||
    typeof value.account.id !== "string" ||
    typeof value.account.email !== "string"
  ) {
    return null;
  }

  if (
    !validMonitors(value.monitors) ||
    !Array.isArray(value.cases) ||
    value.cases.length > 20 ||
    !value.cases.every(activity) ||
    !Array.isArray(value.leads) ||
    value.leads.length > 40 ||
    !value.leads.every(lead)
  ) {
    return null;
  }

  return {
    account: { id: value.account.id, email: value.account.email },
    cases: value.cases,
    monitors: value.monitors,
    leads: value.leads,
  };
}
