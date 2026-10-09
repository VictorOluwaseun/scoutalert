import {
  MailConnectionError,
  MailConnectionRepository,
  MailSourceRepository,
} from "../domain/mail.js";

/** Executes one leased private import; message bodies never enter shared discovery or model prompts. */
export class ImportPrivateMail {
  /** Receives only inward repository contracts; worker composition owns their infrastructure. */
  constructor(
    private readonly records: MailConnectionRepository,
    private readonly source: MailSourceRepository,
  ) {}

  /** Advances one due page with explicit retries; stale work is rejected by the persistence lease. */
  async execute(): Promise<boolean> {
    const claim = await this.records.claim();
    if (!claim) {
      return false;
    }
    try {
      await this.records.complete(claim, await this.source.read(claim));
    } catch (error) {
      await this.records.fail(
        claim,
        error instanceof MailConnectionError &&
          error.code === "reconnect_required",
      );
    }
    return true;
  }
}
