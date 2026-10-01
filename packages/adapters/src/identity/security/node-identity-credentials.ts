import {
  createHmac,
  randomInt,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { IdentityCredentials } from "@repo/core/identity";

/** Implements purpose-separated identity proof generation using Node's native cryptography. */
export class NodeIdentityCredentials extends IdentityCredentials {
  /** Receives a private deployment key; configuration enforces a minimum 256-bit key. */
  constructor(private readonly secret: string) {
    super();
  }
  /** Generates all six-digit values uniformly, preserving leading zeroes. */
  code(): string {
    return randomInt(0, 1_000_000).toString().padStart(6, "0");
  }
  /** Generates a standard opaque UUID. */
  id(): string {
    return randomUUID();
  }
  /** Binds sign-in purpose, generation, browser and normalized recipient to the supplied code. */
  codeDigest(
    id: string,
    browserHash: string,
    email: string,
    code: string,
  ): string {
    return this.mac(
      JSON.stringify(["email-sign-in-v1", id, browserHash, email, code]),
    );
  }
  /** Privately keys token hashes and abuse identifiers to avoid offline email enumeration. */
  digest(value: string): string {
    return this.mac(JSON.stringify(["identity-digest-v1", value]));
  }
  /** Compares equal-length digest bytes in constant time. */
  equal(left: string, right: string): boolean {
    const a = Buffer.from(left);
    const b = Buffer.from(right);
    return a.length === b.length && timingSafeEqual(a, b);
  }
  /** Reconstructs only this challenge's opaque session secret after valid proof. */
  sessionToken(challengeId: string): string {
    return this.mac(JSON.stringify(["session-token-v1", challengeId]));
  }
  /** Computes an HMAC without emitting secrets, code material or private identifiers. */
  private mac(value: string): string {
    return createHmac("sha256", this.secret).update(value).digest("hex");
  }
}
