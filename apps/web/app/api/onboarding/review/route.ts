const maximumRequestBytes = 16 * 1024;

type SearchRequestBody =
  { body: string } | { error: "invalid_request" | "request_too_large" };

/** Reads a small JSON payload without buffering an unbounded browser request. */
async function readSearchRequest(request: Request): Promise<SearchRequestBody> {
  const reader = request.body?.getReader();
  if (!reader) return { error: "invalid_request" };

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;

    totalBytes += value.byteLength;
    if (totalBytes > maximumRequestBytes) {
      await reader.cancel();
      return { error: "request_too_large" };
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return { body: new TextDecoder("utf-8", { fatal: true }).decode(bytes) };
  } catch {
    return { error: "invalid_request" };
  }
}

/** Forwards a bounded, same-origin onboarding check to the API host. */
export async function POST(request: Request): Promise<Response> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!/^application\/json(?:\s*;|$)/i.test(contentType)) {
    return Response.json({ code: "invalid_request" }, { status: 415 });
  }

  const configuredUrl = process.env.SCOUTALERT_API_URL;
  const localUrl =
    process.env.NODE_ENV === "development"
      ? "http://127.0.0.1:4040"
      : undefined;
  const apiUrl = configuredUrl ?? localUrl;
  if (!apiUrl) {
    return Response.json({ code: "service_unavailable" }, { status: 503 });
  }

  try {
    const payload = await readSearchRequest(request);
    if ("error" in payload) {
      return Response.json(
        { code: payload.error },
        { status: payload.error === "request_too_large" ? 413 : 400 },
      );
    }

    const upstream = await fetch(new URL("/v1/onboarding/review", apiUrl), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: payload.body,
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (![200, 400, 422].includes(upstream.status)) {
      return Response.json({ code: "service_unavailable" }, { status: 503 });
    }

    const result: unknown = await upstream.json();
    return Response.json(result, { status: upstream.status });
  } catch {
    return Response.json({ code: "service_unavailable" }, { status: 503 });
  }
}
