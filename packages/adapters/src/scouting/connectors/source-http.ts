/** Bounds decoded response bytes before parsing; both collection and research share the same validation. */
export async function readSourceResponse(
  response: Response,
  maximum: number,
): Promise<Record<string, unknown>> {
  if (!response.ok || !response.body) throw new Error("source_unavailable");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximum) {
        await reader.cancel();
        throw new Error("source_too_large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    throw new Error("invalid_source_snapshot");
  return parsed as Record<string, unknown>;
}
