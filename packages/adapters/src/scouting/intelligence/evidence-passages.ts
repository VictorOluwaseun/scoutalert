/** Gives untrusted source text stable passage IDs; stored citations always use original text selected by the model. */
export function evidencePassages(
  text: string,
  prefix: string,
): Record<string, string> {
  const passages: string[] = [];
  for (const paragraph of text.split(/\n+/u)) {
    if (!paragraph.trim()) continue;
    for (let offset = 0; offset < paragraph.length; offset += 1000)
      passages.push(paragraph.slice(offset, offset + 1000));
  }
  return Object.fromEntries(
    passages.map((passage, index) => [`${prefix}${index}`, passage]),
  );
}
/** Unknown IDs are rejected; the provider cannot inject invented quotations into stored evidence. */
export function resolveEvidence(
  ids: string[],
  passages: Record<string, string>,
): string[] {
  return [...new Set(ids)].map((id) => {
    if (!Object.hasOwn(passages, id))
      throw new Error("invalid_evidence_reference");
    return passages[id]!;
  });
}
