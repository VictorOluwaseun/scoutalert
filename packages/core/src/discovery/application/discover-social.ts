import {
  SocialDiscoveryRepository,
  SocialProvider,
  SocialProviderError,
  socialQuery,
  type SocialLimits,
} from "../domain/social-discovery.js";

/** Advances independent native discovery without blocking web discovery, private assessment or mail. */
export class DiscoverSocial {
  /** Receives inward contracts and a distinct spending envelope for native API access. */
  constructor(
    private readonly records: SocialDiscoveryRepository,
    private readonly provider: SocialProvider | null,
    private readonly limits: SocialLimits,
  ) {}

  /** Registers public intent, resumes shared progress and executes at most one network request per activity. */
  async execute(): Promise<"done" | "waiting" | "progress"> {
    // Content expiry remains active even when native access is disabled.
    await this.records.maintain();
    if (!this.provider) {
      return "done";
    }
    const policy = "x-public-demand-v1";
    for (const intent of await this.records.intents(policy)) {
      await this.records.subscribe(intent, policy, socialQuery(intent.search));
    }
    const claim = await this.records.claim(this.limits);
    if (claim.status !== "claimed") {
      return claim.status;
    }
    try {
      const result = await this.provider.read(claim.operation);
      await this.records.complete(claim, result);
    } catch (error) {
      await this.records.fail(
        claim,
        error instanceof SocialProviderError
          ? error
          : new SocialProviderError("provider_unavailable"),
      );
    }
    return "progress";
  }
}
