import { z } from 'zod';

/** Private API settings; no key has a hard-coded or development fallback value. */
export const identityConfigurationSchema = z.object({
  DATABASE_URL: z.url().refine((value) => /^postgres(?:ql)?:/.test(value)),
  REDIS_URL: z.url().refine((value) => /^rediss?:/.test(value)),
  IDENTITY_SECRET: z.string().regex(/^[a-f0-9]{64,}$/i),
  WEB_API_SECRET: z.string().regex(/^[a-f0-9]{64,}$/i),
});
export type IdentityConfiguration = z.infer<typeof identityConfigurationSchema>;
export const IDENTITY_CONFIGURATION = Symbol('IDENTITY_CONFIGURATION');

/** Validates without leaking Zod input values or connection credentials in startup errors. */
export function readIdentityConfiguration(): IdentityConfiguration {
  const result = identityConfigurationSchema.safeParse(process.env);

  if (!result.success) {
    throw new Error(
      'Configure DATABASE_URL, REDIS_URL, IDENTITY_SECRET and WEB_API_SECRET before starting identity.',
    );
  }

  return result.data;
}
