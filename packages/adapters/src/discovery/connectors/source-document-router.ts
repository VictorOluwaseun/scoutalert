import {
  SourceDocumentRepository,
  type SourceDocumentResult,
} from "@repo/core/discovery";
import { ashbyTarget } from "./ashby-postings.js";
import { blueskyTarget } from "./bluesky-source-documents.js";

/** Selects explicit public provider capabilities before generic HTML/browser retrieval; private access is never inferred from a URL. */
export class SourceDocumentRouter extends SourceDocumentRepository {
  /** Receives separately composed readers with independent source admission rules. */
  constructor(
    private readonly pages: SourceDocumentRepository,
    private readonly ashby: SourceDocumentRepository,
    private readonly bluesky: SourceDocumentRepository | null = null,
  ) {
    super();
  }

  /** Routes recognized Bluesky posts and Ashby boards/details to their explicit public APIs; other URLs retain normal crawl policy. */
  read(url: string): Promise<SourceDocumentResult> {
    if (this.bluesky && blueskyTarget(url)) {
      return this.bluesky.read(url);
    }
    return ashbyTarget(url) ? this.ashby.read(url) : this.pages.read(url);
  }
}
