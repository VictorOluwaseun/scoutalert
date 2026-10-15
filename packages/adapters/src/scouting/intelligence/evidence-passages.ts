/** Gives untrusted text stable passage IDs. A source minimum joins short labels to adjacent text using exact original offsets; private brief passages may still contain a single short value. No source wording is invented or discarded. */
export function evidencePassages(
  text: string,
  prefix: string,
  minimumLength = 1,
): Record<string, string> {
  const ranges: { start: number; end: number }[] = [];

  for (const match of text.matchAll(/[^\n]+/gu)) {
    const paragraph = match[0];
    if (!paragraph.trim()) {
      continue;
    }

    for (let offset = 0; offset < paragraph.length; offset += 1000) {
      const start = match.index + offset;
      const end = Math.min(start + 1000, match.index + paragraph.length);
      const previous = ranges.at(-1);
      const joinsShort =
        previous &&
        (text.slice(start, end).trim().length < minimumLength ||
          text.slice(previous.start, previous.end).trim().length <
            minimumLength);
      if (joinsShort) {
        previous.end = end;
        continue;
      }
      ranges.push({ start, end });
    }
  }

  return Object.fromEntries(
    ranges.map(({ start, end }, index) => [
      `${prefix}${index}`,
      text.slice(start, end),
    ]),
  );
}

/** Unknown IDs are rejected; the provider cannot inject invented quotations into stored evidence. */
export function resolveEvidence(
  ids: string[],
  passages: Record<string, string>,
): string[] {
  return [...new Set(ids)].map((id) => {
    if (!Object.hasOwn(passages, id)) {
      throw new Error("invalid_evidence_reference");
    }

    return passages[id]!;
  });
}
