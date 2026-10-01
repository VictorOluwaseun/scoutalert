/** Cryptographic identity capabilities implemented outside core, with explicit purpose separation. */
export abstract class IdentityCredentials {
  /** Generates an unpredictable six-digit code, including codes with leading zeroes. */
  abstract code(): string;
  /** Creates an opaque UUID for a challenge or account. */
  abstract id(): string;
  /** Keyed digest binds a code to its generation, browser, recipient and sign-in purpose. */
  abstract codeDigest(
    id: string,
    browserHash: string,
    email: string,
    code: string,
  ): string;
  /** Hashes opaque handles and privately keys abuse-control identifiers. */
  abstract digest(value: string): string;
  /** Compares digests without data-dependent early termination. */
  abstract equal(left: string, right: string): boolean;
  /** Derives a recoverable session secret for a successfully consumed challenge; never public before proof. */
  abstract sessionToken(challengeId: string): string;
}
