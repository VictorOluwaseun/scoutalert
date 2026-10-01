import type { Category, ScoutDraft } from "./types";

export const categories = [
  {
    value: "employment",
    title: "A new job",
    description: "Full-time, part-time, or an internship",
    icon: "briefcase",
  },
  {
    value: "contracts",
    title: "Contract work",
    description: "A role for a project or a period of time",
    icon: "clock",
  },
  {
    value: "services",
    title: "Client projects",
    description: "Clients who need your skills or services",
    icon: "sparkles",
  },
] as const;

export const examples = [
  {
    label: "A remote design role",
    goal: "I'm a product designer based in Lagos, looking for a full-time remote role with an international team.",
    details: {
      category: "employment",
      target: "Product designer",
      residence: "Lagos, Nigeria",
      arrangement: "remote",
    },
  },
  {
    label: "Flexible contract work",
    goal: "I'm looking for remote software engineering contracts, ideally around 20 hours a week.",
    details: {
      category: "contracts",
      target: "Software engineering",
      arrangement: "remote",
      background: "Available for around 20 hours a week",
      payPeriod: "hour",
    },
  },
  {
    label: "My next client project",
    goal: "I design brands and websites, and I'm looking for client projects I can work on remotely.",
    details: {
      category: "services",
      target: "Brand and website design",
      arrangement: "remote",
      payPeriod: "project",
    },
  },
] satisfies { label: string; goal: string; details: Partial<ScoutDraft> }[];

export const arrangementLabels = {
  remote: "Remote",
  hybrid: "Hybrid",
  onsite: "On-site",
  open: "No preference",
  unknown: "Not sure yet",
};
export const categoryLabels: Record<Category, string> = {
  employment: "Employment",
  contracts: "Contract work",
  services: "Client projects",
};

/** Seeds only an exact, explicitly selected example; arbitrary text is refined manually. */
export function exampleDetails(goal: string): Partial<ScoutDraft> {
  return examples.find((example) => example.goal === goal)?.details ?? {};
}

/** Fictional content for evaluating the interface, never retrieved or ranked as real opportunities. */
export const opportunities = [
  {
    id: "job-design",
    category: "employment",
    title: "Product designer",
    company: "Example design studio",
    initial: "d",
    color: "lilac",
    arrangement: "remote",
    pay: "$70k–$95k / year",
    detail: "Shape a thoughtful product with a small, collaborative team.",
    tags: ["Product design", "Full-time"],
    eligibility: "Hiring locations need confirmation",
  },
  {
    id: "job-operations",
    category: "employment",
    title: "Operations coordinator",
    company: "Example operations team",
    initial: "o",
    color: "peach",
    arrangement: "hybrid",
    pay: "Compensation not listed",
    detail:
      "Help a growing team turn everyday complexity into clear processes.",
    tags: ["Operations", "Full-time"],
    eligibility: "Work authorization needs confirmation",
  },
  {
    id: "contract-engineering",
    category: "contracts",
    title: "Software engineering contract",
    company: "Example technology team",
    initial: "t",
    color: "blue",
    arrangement: "remote",
    pay: "$50–$80 / hour",
    detail: "Build a focused product release with flexible weekly hours.",
    tags: ["Engineering", "3-month contract"],
    eligibility: "Contractor locations need confirmation",
  },
  {
    id: "contract-content",
    category: "contracts",
    title: "Content strategy contract",
    company: "Example editorial team",
    initial: "e",
    color: "lilac",
    arrangement: "remote",
    pay: "Compensation not listed",
    detail: "Develop a clear editorial direction for a new product launch.",
    tags: ["Content strategy", "Part-time"],
    eligibility: "Availability needs confirmation",
  },
  {
    id: "service-brand",
    category: "services",
    title: "Brand identity & website",
    company: "Example client brief",
    initial: "b",
    color: "peach",
    arrangement: "remote",
    pay: "$3k–$5k / project",
    detail: "Create a visual identity and a small website for a new business.",
    tags: ["Brand design", "Client project"],
    eligibility: "Budget and deliverables need confirmation",
  },
  {
    id: "service-support",
    category: "services",
    title: "Customer support setup",
    company: "Example service request",
    initial: "s",
    color: "blue",
    arrangement: "remote",
    pay: "Budget not listed",
    detail:
      "Help a small business set up a friendly, effective support process.",
    tags: ["Customer support", "Client project"],
    eligibility: "Project scope needs confirmation",
  },
] as const;

export type ExampleOpportunity = (typeof opportunities)[number];
