import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

/** Encrypts private integration credentials and evidence with authenticated owner/purpose binding. */
export class MailSecrets {
  private readonly key: Buffer;

  /** Requires an independent 256-bit key; identity and transport secrets must not be reused. */
  constructor(hexKey: string) {
    if (!/^[a-f0-9]{64}$/i.test(hexKey)) {
      throw new Error("Invalid connection encryption configuration");
    }
    this.key = Buffer.from(hexKey, "hex");
  }

  /** Generates an unguessable URL-safe OAuth state or PKCE verifier. */
  random(): string {
    return randomBytes(32).toString("base64url");
  }

  /** Digests opaque, high-entropy browser/state identifiers before persistence. */
  digest(value: string): string {
    return createHash("sha256").update(value).digest("hex");
  }

  /** Encrypts with a fresh nonce and explicit purpose; ciphertext copied between owners cannot be opened. */
  seal(value: unknown, purpose: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    cipher.setAAD(Buffer.from(purpose));
    const body = Buffer.concat([
      cipher.update(JSON.stringify(value), "utf8"),
      cipher.final(),
    ]);
    return [
      "v1",
      iv.toString("base64url"),
      cipher.getAuthTag().toString("base64url"),
      body.toString("base64url"),
    ].join(".");
  }

  /** Authenticates envelope version, owner and purpose before parsing; callers never log decryption failures. */
  open<T>(value: string, purpose: string): T {
    const [version, nonce, tag, body, extra] = value.split(".");
    if (version !== "v1" || !nonce || !tag || !body || extra) {
      throw new Error("Invalid private envelope");
    }
    const decipher = createDecipheriv(
      "aes-256-gcm",
      this.key,
      Buffer.from(nonce, "base64url"),
    );
    decipher.setAAD(Buffer.from(purpose));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return JSON.parse(
      Buffer.concat([
        decipher.update(Buffer.from(body, "base64url")),
        decipher.final(),
      ]).toString("utf8"),
    ) as T;
  }
}
