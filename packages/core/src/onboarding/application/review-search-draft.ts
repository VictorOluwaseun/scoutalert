import type {
  SearchDraft,
  SearchIssue,
  SearchReview,
} from "../domain/search-draft.js";

/** Applies deterministic search rules before an untrusted browser draft reaches review. */
export class ReviewSearchDraft {
  /** Checks explicit answers without inferring work authorization, pay units, or consent. */
  execute(draft: SearchDraft): SearchReview {
    const issues: SearchIssue[] = [];

    this.checkText(issues, "goal", draft.goal, 4000, true);
    this.checkText(issues, "target", draft.target, 200, true);
    this.checkText(issues, "name", draft.name, 100, false);
    this.checkText(issues, "residence", draft.residence, 200, false);
    this.checkText(issues, "workLocations", draft.workLocations, 300, false);
    this.checkText(issues, "background", draft.background, 2000, false);
    this.checkText(
      issues,
      "authorizationLocations",
      draft.authorizationLocations ?? "",
      300,
      false,
    );

    if (
      draft.authorizationConfirmed &&
      (!draft.authorizationLocations?.trim() ||
        !draft.sponsorshipNeed ||
        draft.sponsorshipNeed === "unknown")
    ) {
      issues.push({
        field: "authorizationLocations",
        code: "required",
        message:
          "Add the countries and your sponsorship needs before confirming these details.",
      });
    }

    if (
      draft.arrangementRequired &&
      ["open", "unknown"].includes(draft.arrangement)
    ) {
      issues.push({
        field: "arrangementRequired",
        code: "invalid_value",
        message: "Choose a specific work style before making it a must-have.",
      });
    }

    const minimumPay = draft.minimumPay.trim();

    if (minimumPay && !this.isPositiveAmount(minimumPay)) {
      issues.push({
        field: "minimumPay",
        code: "invalid_value",
        message: "Use a positive minimum, or leave it empty if you’re open.",
      });
    }

    if (issues.length > 0) {
      return { ready: false, issues };
    }

    return { ready: true };
  }

  /** Records a field-specific issue while leaving the person's actual wording untouched. */
  private checkText(
    issues: SearchIssue[],
    field: keyof SearchDraft,
    value: string,
    maxLength: number,
    required: boolean,
  ): void {
    if (required && !value.trim()) {
      issues.push({
        field,
        code: "required",
        message: `Add your ${field === "goal" ? "goal" : "target work"} before reviewing your scout.`,
      });

      return;
    }

    if (value.length <= maxLength) {
      return;
    }

    issues.push({
      field,
      code: "too_long",
      message: `Keep ${field} to ${maxLength.toLocaleString()} characters or fewer.`,
    });
  }

  /** Accepts decimal currency input without converting or inventing compensation units. */
  private isPositiveAmount(value: string): boolean {
    if (!/^\d+(?:\.\d+)?$/.test(value)) {
      return false;
    }

    return Number.isFinite(Number(value)) && Number(value) > 0;
  }
}
