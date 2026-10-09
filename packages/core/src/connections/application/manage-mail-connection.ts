import {
  MailConnectionError,
  MailConnectionRepository,
  MailSourceRepository,
} from "../domain/mail.js";

/** Coordinates explicit account consent and label selection without accessing mail or database clients directly. */
export class ManageMailConnection {
  /** Receives persistence and an optional configured mail provider at the composition root. */
  constructor(
    private readonly records: MailConnectionRepository,
    private readonly source: MailSourceRepository | null,
  ) {}

  /** Returns account-owned data independently of provider availability. */
  async read(ownerId: string) {
    return {
      ...(await this.records.read(ownerId)),
      available: this.source !== null,
    };
  }

  /** Starts browser-bound consent only after an authenticated, CSRF-protected request. */
  async begin(ownerId: string, browser: string) {
    const source = this.provider();
    const state = await this.records.begin(ownerId, browser);
    return { url: source.authorization(state.state, state.verifier) };
  }

  /** Consumes consent once and refuses late callbacks after another consent or disconnect. */
  async finish(
    ownerId: string,
    browser: string,
    state: string,
    code: string,
  ): Promise<void> {
    const source = this.provider();
    const pending = await this.records.consume(ownerId, browser, state);
    const grant = await source.exchange(code, pending.verifier);
    await this.records.connect(ownerId, pending.revision, grant);
  }

  /** Exposes only selectable labels from the connected account. */
  async labels(ownerId: string) {
    const { grant } = await this.records.credentials(ownerId);
    return { labels: await this.provider().labels(grant) };
  }

  /** Validates membership at the provider before changing scope; browser-provided names are never trusted. */
  async select(ownerId: string, id: string): Promise<void> {
    const { grant, revision } = await this.records.credentials(ownerId);
    const labels = await this.provider().labels(grant);
    const label = labels.find((item) => item.id === id);
    if (!label) {
      throw new MailConnectionError("invalid_label");
    }
    await this.records.selectLabel(ownerId, revision, label);
  }

  /** Queues another bounded scan without doing provider work in the HTTP request. */
  async import(ownerId: string): Promise<void> {
    this.provider();
    await this.records.requestImport(ownerId);
  }

  /** Immediately stops local reads and deletes imported evidence, then attempts provider revocation. */
  async disconnect(ownerId: string) {
    const grant = await this.records.disconnect(ownerId);
    const revoked =
      !grant ||
      (grant !== "unavailable" && this.source
        ? await this.source.revoke(grant).catch(() => false)
        : false);
    return { disconnected: true, providerRevoked: revoked };
  }

  /** Keeps unconfigured integrations explicit instead of starting a partial authorization flow. */
  private provider(): MailSourceRepository {
    if (!this.source) {
      throw new MailConnectionError("connection_unavailable");
    }
    return this.source;
  }
}
