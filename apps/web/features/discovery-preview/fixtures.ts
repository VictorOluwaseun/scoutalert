/** Fictional presentation data. These records never enter discovery or account APIs. */
export type PreviewOpportunity = {
  id: string;
  scoutId: string;
  kind: "Job" | "Client project" | "Contract";
  source: string;
  sourceType: string;
  author: string;
  initials: string;
  title: string;
  summary: string;
  location: string;
  compensation: string;
  found: string;
  checked: string;
  reason: string;
  unknown: string;
  quote: string;
  evidence: { label: string; quote: string }[];
  nextStep: string;
};

/** A confirmed sample brief, kept separate from evidence about an opportunity. */
export type PreviewScout = {
  id: string;
  name: string;
  description: string;
  brief: string;
  requirements: string[];
  preferences: string[];
  alerts: string;
};

export const previewScouts: PreviewScout[] = [
  {
    id: "design-role",
    name: "My next design role",
    description: "Product design · Remote work",
    brief:
      "Find a product design role where I can make complex tools easier to use. I’m based in Lagos and want to work remotely with a thoughtful product team.",
    requirements: [
      "Remote from Nigeria",
      "Product or UX design",
      "Full-time or contract work",
    ],
    preferences: [
      "Small, collaborative product teams",
      "A clear salary or contract rate",
      "Tools that help people do their work",
    ],
    alerts:
      "Daily at 08:00, Africa/Lagos. Prompt alerts only after critical requirements are verified.",
  },
  {
    id: "client-projects",
    name: "My next client project",
    description: "Brand & website design · Worldwide",
    brief:
      "Find people and businesses looking for a designer for their brand or website. I work remotely, and I’m open to clients anywhere in the world.",
    requirements: [
      "A client looking to hire a designer",
      "Brand or website design",
      "Remote collaboration",
    ],
    preferences: [
      "A defined project with a clear decision-maker",
      "A budget of $3,000 or more",
      "Starting within the next month",
    ],
    alerts:
      "Daily at 08:00, Africa/Lagos. Requests with an unknown budget can appear for review.",
  },
];

export const previewOpportunities: PreviewOpportunity[] = [
  {
    id: "fieldwork-designer",
    scoutId: "design-role",
    kind: "Job",
    source: "Company website",
    sourceType: "Careers page",
    author: "Fieldwork Studio",
    initials: "fw",
    title: "Product designer",
    summary:
      "Help a small product team make planning and collaboration feel simpler for independent businesses.",
    location: "Remote · Nigeria included",
    compensation: "$65,000–$85,000 / year",
    found: "Found at 10:42",
    checked: "Source checked at 10:45",
    reason:
      "Product design, a small team and remote hiring that explicitly includes Nigeria.",
    unknown:
      "Employment arrangement and work authorization still need confirmation.",
    quote:
      "We’re looking for a product designer to turn complex workflows into clear, thoughtful experiences.",
    evidence: [
      {
        label: "Your location",
        quote:
          "Our remote team welcomes applications from Nigeria, Ghana, Kenya and South Africa.",
      },
      {
        label: "The work",
        quote:
          "You’ll own discovery, interaction design and prototyping, working directly with our product lead and two engineers.",
      },
      {
        label: "Compensation",
        quote:
          "The annual salary range for this full-time role is USD 65,000–85,000.",
      },
    ],
    nextStep:
      "Review the role and confirm how the company employs people in Nigeria before applying.",
  },
  {
    id: "olive-website",
    scoutId: "client-projects",
    kind: "Client project",
    source: "X",
    sourceType: "Public post",
    author: "Maya · Olive & Co.",
    initials: "m",
    title: "A new brand and website for a small business",
    summary:
      "A founder is looking for a freelance designer ahead of a new product launch.",
    location: "Remote collaboration",
    compensation: "Budget not shared",
    found: "Found at 10:28",
    checked: "Source checked at 10:31",
    reason:
      "A direct request for the brand and website work you offer, with remote collaboration mentioned.",
    unknown:
      "Budget, exact scope and whether the project is still available need checking.",
    quote:
      "Looking for a freelance designer to help with a brand refresh and a simple website for our launch next month. Happy to work remotely. Recommendations welcome!",
    evidence: [
      {
        label: "A client request",
        quote:
          "Looking for a freelance designer to help with a brand refresh and a simple website",
      },
      { label: "Remote work", quote: "Happy to work remotely." },
      { label: "Timing", quote: "for our launch next month" },
    ],
    nextStep:
      "Confirm the project is still open, then ask about scope and budget before preparing a proposal.",
  },
  {
    id: "northstar-contract",
    scoutId: "design-role",
    kind: "Contract",
    source: "LinkedIn",
    sourceType: "Public post",
    author: "Jonah · Northstar Tools",
    initials: "n",
    title: "A product design partner for a three-month project",
    summary:
      "A product lead needs design support to rethink the onboarding experience for a team planning app.",
    location: "Remote · Location eligibility unclear",
    compensation: "$60–$80 / hour",
    found: "Found at 09:56",
    checked: "Source checked at 10:02",
    reason:
      "Hands-on product design work with a defined contract length and a published rate.",
    unknown: "The post doesn’t say which countries the team can hire from.",
    quote:
      "We’re looking for an independent product designer for a three-month remote engagement. Focus: onboarding and activation. Budget is $60–$80/hour.",
    evidence: [
      {
        label: "Type of work",
        quote:
          "an independent product designer for a three-month remote engagement",
      },
      {
        label: "Your design focus",
        quote: "Focus: onboarding and activation.",
      },
      { label: "Compensation", quote: "Budget is $60–$80/hour." },
    ],
    nextStep:
      "Ask whether the team can contract with a designer based in Nigeria before discussing availability.",
  },
];

export type PreviewScenario =
  "ready" | "searching" | "empty" | "partial" | "interrupted";

export const previewScenarios: { value: PreviewScenario; label: string }[] = [
  { value: "ready", label: "Opportunities found" },
  { value: "searching", label: "First search running" },
  { value: "empty", label: "No suitable results yet" },
  { value: "partial", label: "Limited coverage" },
  { value: "interrupted", label: "Search interrupted" },
];

export const previewSearchStates: Record<
  PreviewScenario,
  { title: string; description: string; label: string }
> = {
  ready: {
    title: "New possibilities. A wider search continues.",
    description:
      "Your scouts have checked these finds and are exploring more places for work that fits.",
    label: "Exploring further",
  },
  searching: {
    title: "Your scouts are getting to work.",
    description:
      "Searching public pages and posts, then checking promising finds against your brief. There are no reviewed results yet.",
    label: "Searching",
  },
  empty: {
    title: "Nothing suitable from this search yet.",
    description:
      "The pages checked so far haven’t produced a suitable match. Your scouts will keep exploring without loosening your must-haves.",
    label: "Next search scheduled",
  },
  partial: {
    title: "Some places are harder to reach.",
    description:
      "Web results are available, but access to some social posts is limited. This is a partial view of what’s out there.",
    label: "Limited coverage",
  },
  interrupted: {
    title: "Part of your search was interrupted.",
    description:
      "A search provider didn’t respond. Your earlier finds are still here. The interrupted work is waiting for another attempt.",
    label: "Waiting to retry",
  },
};
