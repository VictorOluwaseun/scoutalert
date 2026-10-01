import { assessPosting } from "../domain/assess-posting.js";
import type { Assessment, Posting, RunContext } from "../domain/discovery.js";
import {
  CandidateEvaluator,
  IntelligenceProvider,
  IntelligenceRepository,
  type IntelligenceResult,
  type IntelligenceTask,
} from "./contracts.js";
import {
  assessPersonalFit,
  validAnalysis,
  validFit,
} from "./evidence-policy.js";
import {
  EmployerResearchProvider,
  needsEmployerResearch,
} from "../research/employer-evidence.js";

/** Reuses shared public extraction and private versioned fit, spending at most one provider call per activity attempt. */
export class EvaluateCandidates extends CandidateEvaluator {
  /** Receives inward ports; the provider configuration is part of every durable cache identity. */
  constructor(
    private readonly records: IntelligenceRepository,
    private readonly provider: IntelligenceProvider,
    private readonly researcher?: EmployerResearchProvider,
  ) {
    super();
  }

  /** Assesses eight new candidates per logical run and reuses earlier verdicts, including exclusions, across the full retrieved set. */
  async evaluate(
    context: RunContext,
    postings: Posting[],
  ): Promise<
    { posting: Posting; assessment: Assessment }[] | "progress" | "waiting"
  > {
    const plan = await this.records.plan(context, postings, this.configuration);
    const cached = new Map(plan.results.map((item) => [item.postingId, item]));
    const selected = new Set(plan.selected);
    const matches: { posting: Posting; assessment: Assessment }[] = [];

    for (const posting of postings) {
      const previous = cached.get(posting.id);
      const result =
        previous &&
        validFit(
          posting,
          context.search,
          previous.result.fit,
          previous.analysis,
        ) &&
        validAnalysis(posting, previous.analysis)
          ? {
              status: "ready" as const,
              assessment: assessPersonalFit(
                context.search,
                previous.analysis,
                previous.result.fit,
              ),
            }
          : selected.has(posting.id)
            ? await this.assess(context, posting)
            : { status: "unavailable" as const };

      if (result.status === "waiting" || result.status === "progress") {
        return result.status;
      }

      const assessment =
        result.status === "ready"
          ? result.assessment
          : assessPosting(context.search, posting);

      if (!assessment) {
        continue;
      }

      matches.push({ posting, assessment });
    }

    return matches;
  }

  /** Research policy changes invalidate prior fit without discarding reusable posting versions. */
  private get configuration(): string {
    return this.researcher
      ? `${this.provider.configuration}:${this.researcher.configuration}`
      : this.provider.configuration;
  }

  /** Keeps shared analysis free of personal context; fit keys include the exact owner, scout revision and analysis. */
  private async assess(
    context: RunContext,
    posting: Posting,
  ): Promise<
    | { status: "waiting" | "progress" | "unavailable" }
    | { status: "ready"; assessment: Assessment | null }
  > {
    const common = { posting, configuration: this.configuration };
    const extracted = await this.resolve({ ...common, kind: "extraction" });

    if (typeof extracted === "string") {
      return { status: extracted };
    }

    if (
      extracted.kind !== "extraction" ||
      !validAnalysis(posting, extracted.analysis)
    ) {
      return { status: "unavailable" };
    }

    const researched = await this.research(common, extracted.analysis);

    if (typeof researched === "string") {
      return { status: researched };
    }

    const analysis = researched;
    const evaluated = await this.resolve({
      ...common,
      kind: "fit",
      context,
      analysis,
    });

    if (typeof evaluated === "string") {
      return { status: evaluated };
    }

    if (
      evaluated.kind !== "fit" ||
      !validFit(posting, context.search, evaluated.fit, analysis)
    ) {
      return { status: "unavailable" };
    }

    return {
      status: "ready",
      assessment: assessPersonalFit(context.search, analysis, evaluated.fit),
    };
  }

  /** Supplements admitted candidates only; missing research cannot turn an unknown into a match. */
  private async research(
    common: Pick<IntelligenceTask, "posting" | "configuration">,
    analysis: import("./contracts.js").PostingAnalysis,
  ) {
    if (
      common.posting.kind === "client_request" ||
      !this.researcher ||
      !needsEmployerResearch(analysis)
    ) {
      return analysis;
    }

    const result = await this.resolve({
      ...common,
      kind: "research",
      analysis,
      evidenceEpoch: String(Math.floor(Date.now() / (15 * 60_000))),
    });

    if (typeof result === "string") {
      return result;
    }

    if (
      result.kind !== "research" ||
      !validAnalysis(common.posting, result.analysis)
    ) {
      return "unavailable" as const;
    }

    return result.analysis;
  }

  /** Leases fence duplicate calls; failures become bounded cooldowns, and provider output is validated before caching. */
  private async resolve(
    task: IntelligenceTask,
  ): Promise<IntelligenceResult | "waiting" | "progress" | "unavailable"> {
    const claim = await this.records.claim(task);

    if (claim.status === "ready") {
      return claim.result;
    }

    if (claim.status !== "claimed") {
      return claim.status;
    }

    try {
      const result = await this.execute(task);
      const valid =
        result.kind !== "fit"
          ? validAnalysis(task.posting, result.analysis)
          : validFit(
              task.posting,
              task.context!.search,
              result.fit,
              task.analysis,
            );

      if (!valid) {
        await this.records.fail(claim.token, "invalid_evidence");

        return "progress";
      }

      await this.records.complete(claim.token, result);

      return "progress";
    } catch {
      await this.records.fail(claim.token, "provider_unavailable");

      return "progress";
    }
  }

  /** One admitted provider step per attempt; public research never receives a private brief. */
  private async execute(task: IntelligenceTask): Promise<IntelligenceResult> {
    if (task.kind === "extraction") {
      return this.provider.extract(task.posting);
    }

    if (task.kind === "research") {
      return this.researcher!.investigate(task.posting, task.analysis!);
    }

    const result = await this.provider.assess(
      task.posting,
      task.context!.search,
      task.analysis!,
    );

    return { ...result, analysis: task.analysis };
  }
}
