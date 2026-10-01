import { z } from 'zod';

/** Shared alert transport shape; consent and schedule decisions are validated in core. */
export const scoutAlertsSchema = z.strictObject({
  frequency: z.enum(['daily', 'weekly', 'dashboard']),
  timezone: z.string().max(100),
  deliveryTime: z.string().max(5),
  weekday: z.string().max(10),
  promptAlerts: z.boolean(),
  quietHours: z
    .strictObject({ start: z.string().max(5), end: z.string().max(5) })
    .optional(),
  consent: z.boolean(),
  consentVersion: z.literal('opportunity-alerts-v1'),
});
