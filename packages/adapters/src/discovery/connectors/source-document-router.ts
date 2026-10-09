import {
  SourceDocumentRepository,
  type SourceDocumentResult,
} from "@repo/core/discovery";
import { ashbyTarget } from "./ashby-postings.js";

/** Selects explicit public provider capabilities before generic HTML/browser retrieval; private access is never inferred from a URL. */
export class SourceDocumentRouter extends SourceDocumentRepository {
  /** Receives separately composed readers with independent source admission rules. */
  constructor(
    private readonly pages: SourceDocumentRepository,
    private readonly ashby: SourceDocumentRepository,
  ) {
    super();
  }

  /** Uses the public Ashby API only for recognized hosted board/detail identities; all other URLs keep normal crawl policy. */
  read(url: string): Promise<SourceDocumentResult> {
    return ashbyTarget(url) ? this.ashby.read(url) : this.pages.read(url);
  }
}
