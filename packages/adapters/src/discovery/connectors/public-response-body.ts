import { gunzip } from "node:zlib";
import { promisify } from "node:util";

const decompress = promisify(gunzip);

/** Decodes gzip transport or a gzip file with separate wire/output ceilings; compression cannot evade the capture budget. */
export async function publicResponseBody(
  bytes: Buffer,
  encoding: string | undefined,
  contentType: string,
  url: string,
  maximum: number,
): Promise<string> {
  if (bytes.length > maximum) {
    throw new Error("source_response_too_large");
  }
  if (encoding && !["identity", "gzip"].includes(encoding)) {
    throw new Error("source_encoding_unsupported");
  }
  let decoded =
    encoding === "gzip" ? await boundedGunzip(bytes, maximum) : bytes;
  const compressedFile =
    /^(?:application\/(?:x-)?gzip)(?:;|$)/iu.test(contentType) ||
    new URL(url).pathname.endsWith(".gz");
  if (compressedFile && decoded[0] === 0x1f && decoded[1] === 0x8b) {
    decoded = await boundedGunzip(decoded, maximum);
  }
  const body = decoded.toString("utf8");
  if (Buffer.byteLength(body, "utf8") > maximum) {
    throw new Error("source_response_too_large");
  }
  return body;
}

/** Uses Node's native output cap during decompression; truncated streams remain failures rather than partial XML. */
async function boundedGunzip(bytes: Buffer, maximum: number): Promise<Buffer> {
  try {
    return await decompress(bytes, { maxOutputLength: maximum });
  } catch (error) {
    const code = error instanceof Error && "code" in error ? error.code : null;
    throw new Error(
      code === "ERR_BUFFER_TOO_LARGE"
        ? "source_response_too_large"
        : "source_encoding_invalid",
    );
  }
}
