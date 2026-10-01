/* Public evidence only. Model decisions are never requested or sent to this review page. */
const element = (id) => document.getElementById(id);
let corpus;
let index = 0;
let drafts = {};
let storageKey;
const fields = [
  ["target", "Looking for"],
  ["category", "Work type"],
  ["goal", "Goal"],
  ["background", "Experience"],
  ["arrangement", "Arrangement"],
  ["arrangementRequired", "Mandatory"],
  ["residence", "Residence"],
  ["workLocations", "Work locations"],
  ["authorizationLocations", "Declared right to work"],
  ["sponsorshipNeed", "Sponsorship"],
  ["authorizationConfirmed", "Declarations confirmed"],
  ["minimumPay", "Minimum pay"],
  ["currency", "Currency"],
  ["payPeriod", "Pay period"],
  ["unknownEligibility", "Unknown eligibility"],
  ["undisclosedPay", "Missing pay"],
];
const names = {
  employment: "Employment",
  contracts: "Contract roles",
  services: "Client projects and services",
  remote: "Remote",
  hybrid: "Hybrid",
  onsite: "On site",
  not_needed: "Not needed",
  needed: "Needed",
  review: "Keep for review",
  exclude: "Exclude",
  include: "Include",
  project: "Per project",
  hour: "Per hour",
  year: "Per year",
};

/** Renders untrusted source strings as text, never HTML or executable links. */
function node(tag, text, className) {
  const result = document.createElement(tag);
  result.textContent = text;

  if (className) {
    result.className = className;
  }

  return result;
}

/** Restricts visible source links to HTTPS; rendering remains safe even with hostile posting contents. */
function link(url, text) {
  const anchor = node("a", text);

  try {
    const parsed = new URL(url);

    if (parsed.protocol !== "https:") {
      return node("span", text);
    }

    anchor.href = parsed.href;
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
  } catch {
    return node("span", text);
  }

  return anchor;
}

/** Shows captured input only, restoring a reviewer’s own saved judgment without revealing any model output. */
function render() {
  const entry = corpus.cases[index];
  const posting = corpus.postings.find((item) => item.id === entry.postingId);
  const brief = corpus.briefs.find((item) => item.id === entry.briefId);
  element("case").value = String(index);
  element("progress").textContent =
    `${Object.keys(drafts).length} of ${corpus.cases.length} reviewed`;
  element("previous").disabled = index === 0;
  element("next").disabled = index === corpus.cases.length - 1;
  element("title").textContent = posting.title;
  element("kind").textContent =
    posting.kind === "client_request" ? "Client request" : "Job posting";
  element("source").textContent = `${posting.company} · ${posting.location}`;
  element("capture").textContent =
    `Captured ${new Date(corpus.capturedAt).toLocaleDateString()}`;
  const sourceLink = link(posting.url, "Open original posting");
  sourceLink.id = "source-link";
  element("source-link").replaceWith(sourceLink);
  element("posting").textContent = posting.text;
  element("documents").replaceChildren();

  for (const document of corpus.documents[posting.source] ?? []) {
    const details = node("details", "");
    details.append(
      node(
        "summary",
        new URL(document.url).hostname + new URL(document.url).pathname,
      ),
      link(document.url, "Open source page"),
      node(
        "p",
        `Captured ${new Date(document.checkedAt).toLocaleString()}`,
        "reading-note",
      ),
      node("div", document.text, "source-text"),
    );
    element("documents").append(details);
  }

  if (!(corpus.documents[posting.source] ?? []).length) {
    element("documents").append(
      node(
        "p",
        "No additional employer policy evidence was captured for this source.",
        "reading-note",
      ),
    );
  }

  element("brief").replaceChildren();

  for (const [key, title] of fields) {
    const value = brief.search[key];
    const display =
      typeof value === "boolean"
        ? value
          ? "Yes"
          : "No"
        : (names[value] ?? (value || "Not stated"));
    element("brief").append(node("dt", title), node("dd", display));
  }

  element("history").textContent = brief.feedbackHistory?.length
    ? `Synthetic earlier relevant choices: ${brief.feedbackHistory.map((item) => item.title).join("; ")}. These are separate from the opportunities being reviewed and do not change the confirmed requirements.`
    : "No prior feedback for this brief.";
  const draft = drafts[entry.id];
  const reviewer = element("reviewer").value;
  element("review-form").reset();
  element("reviewer").value = draft?.reviewer ?? reviewer;
  element("error").textContent = "";
  element("saved").textContent = draft
    ? "Your review is saved in this browser. You can revise it before export."
    : "";

  if (!draft) {
    return;
  }

  document.querySelector(
    `input[name=recommended][value=${draft.recommended ? "yes" : "no"}]`,
  ).checked = true;
  document.querySelector(
    `input[name=prompt][value=${draft.prompt ? "yes" : "no"}]`,
  ).checked = true;
  element("rationale").value = draft.rationale;
  element("attestation").checked = draft.independent;
}

/** Keeps drafts local; if browser storage is unavailable, preserve the in-memory review and explain the export path. */
function persist() {
  try {
    localStorage.setItem(storageKey, JSON.stringify(drafts));
  } catch {
    element("saved").textContent =
      "Browser storage is unavailable. Export your reviews before closing this page.";
  }
}

/** Validates judgments and explicit human attestation before saving; navigation does not silently invent a label. */
function save(event) {
  event.preventDefault();
  const data = new FormData(element("review-form"));
  const reviewer = element("reviewer").value.trim();
  const rationale = element("rationale").value.trim();
  const invalid =
    !data.has("recommended") ||
    !data.has("prompt") ||
    reviewer.length < 2 ||
    rationale.length < 12 ||
    !element("attestation").checked;

  if (invalid) {
    element("error").textContent =
      "Choose both decisions, explain the evidence, enter your name and confirm your independent review.";

    return;
  }

  if (data.get("prompt") === "yes" && data.get("recommended") !== "yes") {
    element("error").textContent =
      "An excluded opportunity cannot qualify for a prompt alert.";

    return;
  }

  if (/^(codex|chatgpt|openai|assistant|ai)$/i.test(reviewer)) {
    element("error").textContent =
      "An independent human reviewer must make this judgment.";

    return;
  }

  drafts[corpus.cases[index].id] = {
    status: "approved",
    reviewerType: "human",
    reviewer,
    independent: true,
    blind: true,
    reviewedAt: new Date().toISOString(),
    recommended: data.get("recommended") === "yes",
    prompt: data.get("prompt") === "yes",
    rationale,
  };
  index = Math.min(index + 1, corpus.cases.length - 1);
  render();
  persist();
  element("saved").textContent ||=
    "Previous review saved. Continue with this opportunity.";
}

/** Exports only completed decisions with the exact corpus identity; importing uses a separate validated command. */
function exportReviews() {
  if (!Object.keys(drafts).length) {
    element("error").textContent =
      "Complete and save a review before exporting.";
    element("error").scrollIntoView({ block: "center" });

    return;
  }

  const packet = {
    schema: 1,
    corpusHash: corpus.contentHash,
    exportedAt: new Date().toISOString(),
    reviews: Object.entries(drafts).map(([id, review]) => ({ id, review })),
  };
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(packet, null, 2) + "\n"], {
      type: "application/json",
    }),
  );
  const anchor = node("a", "");
  anchor.href = url;
  anchor.download = `scoutalert-reviews-${corpus.contentHash.slice(0, 12)}.json`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Loads a read-only packet containing public evidence and synthetic briefs; no application session or model API is used. */
async function start() {
  const response = await fetch("/review-data.json");

  if (!response.ok) {
    throw new Error("Review packet unavailable");
  }

  corpus = await response.json();
  storageKey = `scoutalert-independent-review:${corpus.contentHash}`;

  try {
    drafts = JSON.parse(localStorage.getItem(storageKey) ?? "{}");
  } catch {
    drafts = {};
  }

  const ids = new Set(corpus.cases.map((entry) => entry.id));
  drafts = Object.fromEntries(
    Object.entries(drafts).filter(
      ([id, value]) => ids.has(id) && value?.status === "approved",
    ),
  );
  corpus.cases.forEach((entry, position) => {
    const brief = corpus.briefs.find((item) => item.id === entry.briefId);
    const posting = corpus.postings.find((item) => item.id === entry.postingId);
    const option = node(
      "option",
      `${position + 1}. ${brief.search.target} — ${posting.title}`,
    );
    option.value = String(position);
    element("case").append(option);
  });
  element("scope").textContent =
    `${corpus.postings.length} public postings, ${corpus.briefs.length} synthetic briefs, ${corpus.cases.length} comparisons. ${corpus.sampling ?? "Convenience sample; not population-wide evidence."}`;
  element("case").addEventListener("change", () => {
    index = Number(element("case").value);
    render();
  });
  element("previous").addEventListener("click", () => {
    index--;
    render();
  });
  element("next").addEventListener("click", () => {
    index++;
    render();
  });
  element("review-form").addEventListener("submit", save);
  element("export").addEventListener("click", exportReviews);
  element("clear").addEventListener("click", () => {
    delete drafts[corpus.cases[index].id];
    render();
    persist();
  });
  render();
}

start().catch(() => {
  element("error").textContent =
    "The review packet could not be loaded. Restart the local review server and reload this page.";
});
