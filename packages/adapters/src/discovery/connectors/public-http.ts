import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { request } from "node:https";
import { setTimeout as delay } from "node:timers/promises";
import { publicResponseBytes } from "./public-response-body.js";
import ipaddr from "ipaddr.js";
import { canonicalDiscoveryUrl } from "../persistence/discovery-identities.js";

export interface PublicResponse {
  status: number;
  contentType: string;
  body: string;
  /** Original decoded PDF bytes; textual body is empty for binary documents. */
  binary?: Uint8Array;
  /** Larger of wire and decoded bytes, for aggregate capture limits. */
  accountedBytes?: number;
  /** Selected response policy and redirect headers only; cookies and authentication headers are never propagated. */
  headers?: Record<string, string>;
}

/** Rejects special-use, mapped, private and reserved addresses before opening a source connection. */
export function isPublicAddress(address: string): boolean {
  return ipaddr.isValid(address) && ipaddr.parse(address).range() === "unicast";
}

/** Fetches bounded public HTTPS documents with DNS admission pinned to the actual TLS socket. */
export class PublicHttpRepository {
  /** Injectable DNS resolution supports deterministic rebinding and special-address tests. */
  constructor(private readonly resolve = lookup) {}

  /** Never follows redirects, sends cookies, executes scripts or shares an authenticated connection. */
  async read(
    value: string,
    maximumBytes: number,
    signal: AbortSignal,
  ): Promise<PublicResponse> {
    const canonical = canonicalDiscoveryUrl(value);

    if (!canonical) {
      throw new Error("source_address_blocked");
    }

    const url = new URL(canonical);

    if (isIP(url.hostname.replace(/^\[|\]$/g, ""))) {
      throw new Error("source_address_blocked");
    }

    const timeout = new AbortController();
    const addresses = await Promise.race([
      this.resolve(url.hostname, { all: true }),
      delay(3_000, null, { signal: timeout.signal }).then(() => {
        throw new Error("source_dns_timeout");
      }),
    ]).finally(() => timeout.abort());

    if (
      !addresses.length ||
      addresses.some((item) => !isPublicAddress(item.address))
    ) {
      throw new Error("source_address_blocked");
    }

    signal.throwIfAborted();
    const chosen = addresses[0]!;

    return new Promise((resolve, reject) => {
      const req = request(
        url,
        {
          agent: false,
          signal,
          servername: url.hostname,
          family: chosen.family,
          lookup: (_hostname, _options, callback) =>
            callback(null, chosen.address, chosen.family),
          headers: {
            "user-agent": "ScoutAlert/1.0",
            accept:
              "text/html,application/xhtml+xml,application/pdf,application/rss+xml,application/atom+xml,application/xml,application/json,text/javascript,text/css,text/plain;q=0.9",
            "accept-encoding": "identity",
          },
        },
        (response) => {
          response.once("error", reject);
          const encoding = response.headers["content-encoding"];

          if (encoding && !["identity", "gzip"].includes(encoding)) {
            response.destroy(new Error("source_encoding_unsupported"));
            reject(new Error("source_encoding_unsupported"));
            return;
          }

          const chunks: Buffer[] = [];
          let bytes = 0;
          response.on("data", (chunk: Buffer) => {
            bytes += chunk.length;

            if (bytes > maximumBytes) {
              response.destroy(new Error("source_response_too_large"));
              return;
            }

            chunks.push(chunk);
          });
          response.once("end", () => {
            const contentType = response.headers["content-type"] ?? "";
            publicResponseBytes(
              Buffer.concat(chunks),
              encoding,
              contentType,
              canonical,
              maximumBytes,
            )
              .then((decoded) => {
                signal.throwIfAborted();
                const pdf =
                  /^application\/pdf(?:;|$)/iu.test(contentType) ||
                  (/^application\/octet-stream(?:;|$)/iu.test(contentType) &&
                    decoded.subarray(0, 5).toString("ascii") === "%PDF-");
                const body = pdf ? "" : decoded.toString("utf8");
                if (Buffer.byteLength(body, "utf8") > maximumBytes) {
                  throw new Error("source_response_too_large");
                }
                resolve({
                  status: response.statusCode ?? 0,
                  contentType,
                  body,
                  ...(pdf ? { binary: decoded } : {}),
                  accountedBytes: Math.max(
                    bytes,
                    decoded.length,
                    Buffer.byteLength(body, "utf8"),
                  ),
                  headers: Object.fromEntries(
                    [
                      "content-security-policy",
                      "access-control-allow-origin",
                      "x-content-type-options",
                      "location",
                    ].flatMap((name) =>
                      typeof response.headers[name] === "string"
                        ? [[name, response.headers[name] as string]]
                        : [],
                    ),
                  ),
                });
              })
              .catch(reject);
          });
        },
      );
      req.once("error", reject);
      req.end();
    });
  }
}
