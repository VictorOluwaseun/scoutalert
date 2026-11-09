import type { OpportunityView } from "../../../scouting/domain/discovery.js";

/** Complete alternative bodies for a message; delivery identity and consent remain with the caller. */
export interface EmailContent {
  readonly subject: string;
  readonly text: string;
  readonly html: string;
}

/** Presentation input contains only opportunities already reserved and rechecked for this recipient. */
export interface OpportunityEmailInput {
  readonly kind: "digest" | "prompt";
  readonly opportunities: readonly OpportunityView[];
}

/** Inward presentation port keeps email markup, branding and public URLs out of application use cases. */
export abstract class EmailTemplates {
  /** Renders a browser-bound code without exposing it in the subject or inbox preview. */
  abstract signInCode(input: {
    code: string;
    expiresInMinutes: number;
  }): EmailContent;

  /** Presents supported reasons and unresolved questions without upgrading evidence into guarantees. */
  abstract opportunities(input: OpportunityEmailInput): EmailContent;

  /** Renders an explicitly requested diagnostic; this method never submits email. */
  abstract connectionCheck(): EmailContent;
}
