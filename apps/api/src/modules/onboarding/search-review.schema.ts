import { z } from 'zod';

/** Strict transport shape for explicit search answers; semantic rules live in core. */
export const searchReviewRequestSchema = z.strictObject({
  search: z.strictObject({
    goal: z.string(),
    category: z.enum(['employment', 'contracts', 'services']),
    target: z.string(),
    name: z.string(),
    arrangement: z.enum(['remote', 'hybrid', 'onsite', 'open', 'unknown']),
    arrangementRequired: z.boolean(),
    residence: z.string(),
    workLocations: z.string(),
    background: z.string(),
    authorizationLocations: z.string().optional(),
    sponsorshipNeed: z.enum(['not_needed', 'needed', 'unknown']).optional(),
    authorizationConfirmed: z.boolean().optional(),
    minimumPay: z.string(),
    currency: z.enum(['USD', 'EUR', 'GBP', 'NGN']),
    payPeriod: z.enum(['year', 'month', 'hour', 'project']),
    unknownEligibility: z.enum(['review', 'exclude']),
    undisclosedPay: z.enum(['include', 'exclude']),
  }),
});
