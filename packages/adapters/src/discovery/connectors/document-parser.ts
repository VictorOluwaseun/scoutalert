import { Parser } from "htmlparser2";
import { convert } from "html-to-text";
import { z } from "zod";
import type { Posting } from "@repo/core/scouting";
import { discoveryKey } from "../persistence/discovery-identities.js";

const address = z.object({
  addressLocality: z.string().optional(),
  addressRegion: z.string().optional(),
  addressCountry: z
    .union([z.string(), z.object({ name: z.string() })])
    .optional(),
});
const jobSchema = z
  .object({
    "@type": z.literal("JobPosting"),
    title: z.string().trim().min(1).max(500),
    hiringOrganization: z.object({ name: z.string().trim().min(1).max(500) }),
    description: z.string().min(1).max(250_000),
    datePosted: z.string(),
    dateModified: z.string().optional(),
    validThrough: z.string().optional(),
    jobLocationType: z.string().optional(),
    jobLocation: z
      .union([z.object({ address }), z.array(z.object({ address }))])
      .optional(),
  })
  .passthrough();

/** Renders untrusted source markup as inert bounded text, excluding scripts and navigation. */
export function documentText(html: string): string {
  return convert(html, {
    wordwrap: false,
    selectors: [
      { selector: "script", format: "skip" },
      { selector: "style", format: "skip" },
      { selector: "nav", format: "skip" },
      { selector: "a", options: { ignoreHref: true } },
      { selector: "img", format: "skip" },
    ],
  })
    .trim()
    .slice(0, 64_000);
}

/** Reads inert JSON-LD scripts without executing JavaScript or treating arbitrary social posts as formal listings. */
function structuredNodes(html: string): unknown[] {
  const nodes: unknown[] = [];
  let collecting = false;
  let buffer = "";
  const parser = new Parser({
    /** Starts a bounded JSON-LD script capture. */
    onopentag(name, attributes) {
      collecting =
        name === "script" &&
        attributes.type?.toLowerCase() === "application/ld+json";
      buffer = "";
    },
    /** Captures JSON text only while inside the relevant script. */
    ontext(text) {
      if (collecting) {
        buffer += text;
      }
    },
    /** Discards malformed JSON instead of inferring missing structured fields. */
    onclosetag(name) {
      if (!collecting || name !== "script") {
        return;
      }

      collecting = false;

      try {
        const value: unknown = JSON.parse(buffer);
        const graph =
          value && typeof value === "object" && "@graph" in value
            ? value["@graph"]
            : value;
        nodes.push(...(Array.isArray(graph) ? graph : [graph]));
      } catch {
        /* Invalid metadata leaves the content as an unassessed lead. */
      }
    },
  });
  parser.end(html);

  return nodes;
}

/** Promotes one explicit, non-expired JobPosting with actual company, location and publication date; all other content remains a lead. */
export function parseFormalPosting(
  html: string,
  url: string,
  now: Date,
): Posting | null {
  const jobs = structuredNodes(html)
    .map((node) => jobSchema.safeParse(node))
    .filter((result) => result.success)
    .map((result) => result.data);

  if (jobs.length !== 1) {
    return null;
  }

  const job = jobs[0]!;
  const published = new Date(job.datePosted);
  const expires = job.validThrough ? new Date(job.validThrough) : null;
  const locations = job.jobLocation
    ? Array.isArray(job.jobLocation)
      ? job.jobLocation
      : [job.jobLocation]
    : [];
  const geographic = locations
    .map(({ address: item }) =>
      [
        item.addressLocality,
        item.addressRegion,
        typeof item.addressCountry === "string"
          ? item.addressCountry
          : item.addressCountry?.name,
      ]
        .filter(Boolean)
        .join(", "),
    )
    .filter(Boolean)
    .join("; ");
  const location =
    job.jobLocationType === "TELECOMMUTE"
      ? ["Remote", geographic].filter(Boolean).join(" · ")
      : geographic;

  if (
    !location ||
    !Number.isFinite(published.getTime()) ||
    published > now ||
    (expires && (!Number.isFinite(expires.getTime()) || expires <= now))
  ) {
    return null;
  }

  const facts = Object.fromEntries(
    [
      "employmentType",
      "applicantLocationRequirements",
      "baseSalary",
      "qualifications",
      "experienceRequirements",
      "educationRequirements",
      "skills",
      "eligibilityToWorkRequirement",
    ]
      .filter((field) => job[field] !== undefined)
      .map((field) => [field, job[field]]),
  );
  const text = [
    documentText(job.description),
    documentText(html),
    `Source job metadata: ${JSON.stringify(facts)}`,
  ]
    .filter(Boolean)
    .join("\n\n");
  const updated = job.dateModified ? new Date(job.dateModified) : published;

  if (
    !text ||
    text.length > 64_000 ||
    !Number.isFinite(updated.getTime()) ||
    updated > now
  ) {
    return null;
  }

  const id = `web:${discoveryKey(url)}`;
  return {
    id,
    source: "web-discovery",
    externalId: url,
    familyId: id,
    company: job.hiringOrganization.name,
    title: job.title,
    location,
    url,
    text,
    sourceUpdatedAt: updated.toISOString(),
    kind: "job",
    version: 1,
    fingerprint: discoveryKey([
      job.title,
      job.hiringOrganization.name,
      location,
      text,
      job.datePosted,
      job.validThrough ?? null,
    ]),
  };
}
