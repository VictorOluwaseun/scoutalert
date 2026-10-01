import "server-only";

/** Reads a bounded UTF-8 JSON body without trusting a client-supplied content length. */
export async function readRequestBody(
  request: Request,
  maximumBytes = 32 * 1024,
): Promise<string> {
  if (
    !/^application\/json(?:\s*;|$)/i.test(
      request.headers.get("content-type") ?? "",
    )
  ) {
    throw new Error("invalid_request");
  }

  const reader = request.body?.getReader();

  if (!reader) {
    throw new Error("invalid_request");
  }

  const chunks: Uint8Array[] = [];
  let length = 0;

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    if (!value) {
      continue;
    }

    length += value.byteLength;

    if (length > maximumBytes) {
      await reader.cancel();
      throw new Error("request_too_large");
    }

    chunks.push(value);
  }

  const bytes = new Uint8Array(length);
  let offset = 0;

  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}
