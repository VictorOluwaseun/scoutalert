import { mkdir, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import {
  GreenhouseSourceConnector,
  FreelancerSourceConnector,
  PostgresEmployerEvidenceRepository,
} from "../../packages/adapters/dist/scouting/public.js";
import { withEvaluationDatabase } from "./database.mjs";
import { corpusHash, validateCorpus } from "./corpus.mjs";

const output = resolve(
  process.argv[2] ??
    `evaluations/opportunity-quality/runs/${new Date().toISOString().replaceAll(":", "-")}/corpus.json`,
);
const boards = { figma: "Figma", remotecom: "Remote" };
const pages = {
  figma: ["https://www.figma.com/careers/"],
  remotecom: ["https://remote.com/careers", "https://remote.com/openings"],
};
const common = {
  goal: "Find work matching my confirmed requirements",
  category: "employment",
  name: "Evaluation brief",
  arrangement: "remote",
  arrangementRequired: true,
  minimumPay: "",
  currency: "USD",
  payPeriod: "year",
  unknownEligibility: "review",
  undisclosedPay: "include",
  sponsorshipNeed: "not_needed",
  authorizationConfirmed: true,
};

/** Keeps history fictional and disjoint from all measured postings; no real user's feedback is exported. */
function history(title, kind) {
  return [
    {
      title,
      kind,
      postingId: `synthetic-history:${title}`,
      provenance: "synthetic-prior-feedback",
    },
  ];
}

const briefs = [
  {
    id: "design-ng",
    cohort: "employment-design-nigeria",
    feedbackHistory: history("Senior Product Designer", "job"),
    search: {
      ...common,
      target: "Product Designer",
      residence: "Lagos, Nigeria",
      workLocations: "Nigeria",
      authorizationLocations: "Nigeria",
      background:
        "Five years designing web and mobile products, using Figma, prototyping and conducting user research. Individual contributor, no management experience.",
    },
  },
  {
    id: "design-us",
    cohort: "employment-design-us",
    feedbackHistory: history("Senior Product Designer", "job"),
    search: {
      ...common,
      target: "Product Designer",
      residence: "New York, United States",
      workLocations: "United States",
      authorizationLocations: "United States",
      background:
        "Five years designing web and mobile products, using Figma, prototyping and conducting user research. Individual contributor, no management experience.",
    },
  },
  {
    id: "engineering-us",
    cohort: "employment-engineering-us",
    feedbackHistory: history("Software Engineer distributed systems", "job"),
    search: {
      ...common,
      target: "Software Engineer",
      residence: "New York, United States",
      workLocations: "United States",
      authorizationLocations: "United States",
      minimumPay: "120000",
      background:
        "Seven years building TypeScript and Python services, PostgreSQL databases and distributed systems. Mentored engineers, no team management or machine learning production experience.",
    },
  },
  {
    id: "sales-uk",
    cohort: "employment-sales-uk-sponsorship",
    feedbackHistory: [],
    search: {
      ...common,
      target: "Account Executive",
      residence: "London, United Kingdom",
      workLocations: "United Kingdom",
      authorizationLocations: "Nigeria",
      sponsorshipNeed: "needed",
      unknownEligibility: "exclude",
      background:
        "Six years in B2B SaaS sales to mid-market customers, owning prospecting, demos, negotiation and closing. Fluent English only. I need employer visa sponsorship.",
    },
  },
  {
    id: "contract-us",
    cohort: "contract-development-us",
    feedbackHistory: history("Website developer TypeScript", "job"),
    search: {
      ...common,
      category: "contracts",
      target: "Web Developer",
      residence: "Austin, United States",
      workLocations: "United States",
      authorizationLocations: "United States",
      payPeriod: "hour",
      minimumPay: "50",
      undisclosedPay: "exclude",
      background:
        "Three years building React and TypeScript websites. Seeking independent contract roles, not permanent employment.",
    },
  },
  {
    id: "website-ng",
    cohort: "services-web-nigeria",
    feedbackHistory: history("WordPress website development", "client_request"),
    search: {
      ...common,
      category: "services",
      target: "Website development",
      residence: "Lagos, Nigeria",
      workLocations: "Worldwide",
      authorizationLocations: "Nigeria",
      arrangementRequired: false,
      payPeriod: "project",
      background:
        "Five years building WordPress and Shopify websites, responsive themes and payment integrations. Seeking remote client website projects.",
    },
  },
  {
    id: "brand-global",
    cohort: "services-brand-international",
    feedbackHistory: history("Brand identity logo design", "client_request"),
    search: {
      ...common,
      category: "services",
      target: "Brand design",
      residence: "Lagos, Nigeria",
      workLocations: "Worldwide",
      authorizationLocations: "Nigeria",
      arrangementRequired: false,
      payPeriod: "project",
      minimumPay: "300",
      background:
        "Four years in brand identity, logo design, typography and brand guidelines using Illustrator and Figma. No software development, video editing or 3D experience.",
    },
  },
];

await withEvaluationDatabase(async (db) => {
  const connector = new GreenhouseSourceConnector(boards);
  const evidence = new PostgresEmployerEvidenceRepository(db, pages);
  const documents = {};
  const pools = {};
  const coverage = [];

  for (const source of Object.keys(boards)) {
    const snapshot = await connector.read(source, new Date());
    pools[source] = snapshot.postings.sort((a, b) => a.id.localeCompare(b.id));
    coverage.push({
      source,
      available: snapshot.postings.length,
      kind: "job",
      scope: "complete",
    });
    documents[source] = snapshot.postings[0]
      ? await evidence.read(snapshot.postings[0])
      : [];
  }

  const projects = await new FreelancerSourceConnector().read(
    "freelancer",
    new Date(),
  );
  const publicProjects = projects.postings.sort((a, b) =>
    a.id.localeCompare(b.id),
  );
  coverage.push({
    source: "freelancer",
    available: publicProjects.length,
    kind: "client_request",
    scope: "window",
  });
  const postings = [];

  /** Selects distinct source records deterministically, reporting missing strata rather than inventing examples. */
  function select(pool, pattern, includeText = false) {
    const posting = pool.find(
      (item) =>
        pattern.test(
          includeText ? `${item.title}\n${item.text}` : item.title,
        ) && !postings.some((found) => found.id === item.id),
    );

    if (posting) {
      postings.push(posting);
    }
  }

  for (const source of Object.keys(boards)) {
    select(pools[source], /product designer/i);
    select(
      pools[source],
      source === "figma" ? /software engineer/i : /account executive|engineer/i,
    );

    if (
      source === "remotecom" &&
      !postings.some((posting) => posting.source === source)
    ) {
      select(pools[source], /./);
    }
  }

  const jobs = Object.values(pools).flat();

  for (const pattern of [
    /account executive/i,
    /brand designer/i,
    /engineer/i,
    /./,
  ]) {
    if (postings.length >= 4) {
      break;
    }

    select(jobs, pattern);
  }

  // Distinct buyer requests include both fixed and hourly terms whenever the bounded live window contains them.
  select(publicProjects, /(?:website|wordpress|shopify)/i);
  select(publicProjects, /(?:logo|brand identity|branding)/i);
  select(publicProjects, /service request \(hourly\)/i, true);
  select(publicProjects, /service request \(fixed\)/i, true);
  const cases = briefs.flatMap((brief) =>
    postings.map((posting) => ({
      id: `${brief.id}:${posting.id}`,
      briefId: brief.id,
      postingId: posting.id,
      review: { status: "pending" },
    })),
  );
  const corpus = {
    schema: 2,
    capturedAt: new Date().toISOString(),
    provenance:
      "Frozen public source postings; synthetic briefs and prior feedback; independent human labels pending",
    author: "Codex",
    sampling:
      "Deterministic stratified convenience sample, not a random population sample",
    coverage: coverage.map((item) => ({
      ...item,
      selected: postings.filter((posting) => posting.source === item.source)
        .length,
    })),
    postings,
    documents,
    briefs,
    cases,
  };
  corpus.contentHash = corpusHash(corpus);
  validateCorpus(corpus);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(corpus, null, 2) + "\n", {
    flag: "wx",
  });
  console.log(
    JSON.stringify({
      output,
      postings: postings.length,
      cases: cases.length,
      coverage: corpus.coverage,
      contentHash: corpus.contentHash,
      independentLabels: 0,
    }),
  );
});
