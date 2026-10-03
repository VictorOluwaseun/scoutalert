/** Bounded public operational samples; model demand labels are not independent relevance judgments or personal fit. */
export interface DiscoveryPerformance {
  attempts: number;
  successful: number;
  observations: number;
  novel: number;
  reviewed: number;
  demand: number;
  noise: number;
}

/** Supplies neutral history for a route that has not yet earned a measurable sample. */
export function emptyDiscoveryPerformance(): DiscoveryPerformance {
  return {
    attempts: 0,
    successful: 0,
    observations: 0,
    novel: 0,
    reviewed: 0,
    demand: 0,
    noise: 0,
  };
}

/** Ranks routing utility only after enough observations; unreviewed content never counts as rejected demand. */
export function discoveryUtility(sample: DiscoveryPerformance): number {
  if (sample.attempts < 3) {
    return 0;
  }
  const novelty = sample.observations ? sample.novel / sample.observations : 0;
  const quality =
    sample.reviewed >= 5 ? (sample.demand - sample.noise) / sample.reviewed : 0;
  return Math.round(
    20 * novelty +
      40 * quality -
      10 * (1 - sample.successful / sample.attempts),
  );
}

/** Reserves every fifth selection for the oldest eligible candidate; history cannot permanently exclude rare or new searches. */
export function prioritizeDiscovery<T>(
  candidates: T[],
  sample: (candidate: T) => DiscoveryPerformance,
  admission: number,
): T[] {
  if (admission % 5 === 0) {
    return candidates;
  }
  return [...candidates].sort(
    (a, b) => discoveryUtility(sample(b)) - discoveryUtility(sample(a)),
  );
}

/** Slows repeated empty/noisy windows while retaining bounded revisits; partial pagination uses separate immediate continuation. */
export function queryRevisitMinutes(sample: DiscoveryPerformance): number {
  if (sample.attempts < 3) {
    return 10;
  }
  if (sample.observations === 0) {
    return Math.min(120, 15 * 2 ** Math.min(3, sample.attempts - 3));
  }
  if (
    sample.reviewed >= 5 &&
    sample.demand === 0 &&
    sample.noise / sample.reviewed >= 0.8
  ) {
    return 60;
  }
  if (sample.novel / sample.observations < 0.1) {
    return 45;
  }
  return sample.demand >= 3 ? 10 : 20;
}

/** Prioritizes current demand and new context over repeatedly unchanged noise without asserting source freshness. */
export function nativeRevisitMinutes(
  label: string | null,
  unchanged: number,
): number {
  if (["closed", "service_offer", "discussion"].includes(label ?? "")) {
    return 360;
  }
  if (["job_opening", "client_request"].includes(label ?? "")) {
    return 20;
  }
  return Math.min(180, 15 * 2 ** Math.min(4, Math.max(0, unchanged)));
}

/** Spreads remaining paid capacity to UTC reset with a small startup burst; raised limits automatically shorten the wait. */
export function nativeAdmissionDelay(input: {
  now: Date;
  lastAttemptAt: Date | null;
  requests: number;
  reservedMicros: number;
  dailyRequests: number;
  dailyMicros: number;
  nextCostMicros: number;
}): number {
  if (!input.lastAttemptAt || input.requests < 3) {
    return 0;
  }
  const remaining = Math.min(
    input.dailyRequests - input.requests,
    input.nextCostMicros > 0
      ? Math.floor(
          (input.dailyMicros - input.reservedMicros) / input.nextCostMicros,
        )
      : Infinity,
  );
  if (remaining <= 0) {
    return 0;
  }
  const reset = new Date(input.now);
  reset.setUTCHours(24, 0, 0, 0);
  const interval = Math.ceil(
    (reset.getTime() - input.now.getTime()) / remaining,
  );
  return Math.max(
    0,
    input.lastAttemptAt.getTime() + interval - input.now.getTime(),
  );
}
