/** Recognizes an explicit gate on the evidence itself; ordinary sign-in-to-apply controls do not make a readable brief incomplete. */
export function documentAccessReason(text: string): string | null {
  const normalized = text.replace(/\s+/gu, " ");
  const gate =
    /\b(?:log\s?in|sign\s?in|register|subscribe)(?:\s+or\s+(?:log\s?in|sign\s?in|register|subscribe))?\s+to\s+(?:view|read|access|download|unlock)\s+(?:(?:this|the)\s+(?:(?:full|complete)\s+)?|(?:full|complete)\s+)(?:rfp|rfq|brief|project details|job description|request details|solicitation documents?)\b/iu;
  return gate.test(normalized) ? "source_details_require_sign_in" : null;
}
