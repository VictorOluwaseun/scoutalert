import {
  EmailTemplates,
  type EmailContent,
  type OpportunityEmailInput,
} from "@repo/core/notifications";
import {
  emailButton,
  emailColors,
  emailHeading,
  emailLayout,
  emailLink,
  escapeHtml,
} from "./email-layout.js";
import {
  compactOpportunityEmailEntry,
  opportunityEmailEntry,
} from "./opportunity-email.js";

/** Renders ScoutAlert's transactional emails; transport, consent, identity and scheduling stay outside presentation. */
export class ScoutEmailTemplates extends EmailTemplates {
  private readonly dashboardUrl: string;
  private readonly alertsUrl: string;

  /** Receives the configured web origin from composition; no environment, provider or data-source access occurs here. */
  constructor(publicOrigin: string) {
    super();
    this.dashboardUrl = new URL("/dashboard", publicOrigin).href;
    this.alertsUrl = new URL("/dashboard/scouts", publicOrigin).href;
  }

  /** Keeps the code selectable as one string and retains browser binding, expiry and separate alert consent. */
  signInCode(input: { code: string; expiresInMinutes: number }): EmailContent {
    const subject = "Your ScoutAlert sign-in code";
    const expiry = `Expires in ${input.expiresInMinutes} minutes`;
    const instructions =
      "Enter this code in the browser where you requested it. Use the latest code if you requested another.";
    const security =
      "Keep this code to yourself. If you did not request it, you can safely ignore this email.";
    const consent =
      "Verifying your account does not subscribe you to opportunity alerts.";
    return {
      subject,
      text: `Your ScoutAlert code is ${input.code}.\n\n${expiry}. It can only be used in the browser that requested it. Use the latest code if you requested another.\n\n${security}\n\n${consent}`,
      html: emailLayout({
        subject,
        preview:
          "Your sign-in code is ready. Return to the browser where you requested it to continue.",
        category: "Account access",
        body: `${emailHeading("Your sign-in code.")}
          <p class="email-muted" style="margin:0;color:${emailColors.muted};font-size:16px;line-height:25px;">${instructions}</p>
          <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="margin:28px 0;"><tr><td align="center" bgcolor="${emailColors.lime}" style="padding:28px 12px;background:${emailColors.lime};border-radius:12px;color:${emailColors.ink};">
            <p class="email-code" style="margin:0;font-family:'Courier New',Courier,monospace;font-size:44px;line-height:54px;letter-spacing:8px;font-weight:700;color:${emailColors.ink};">${escapeHtml(input.code)}</p>
            <p style="margin:8px 0 0;font-size:13px;line-height:20px;color:${emailColors.ink};">${escapeHtml(expiry)}</p>
          </td></tr></table>
          <p style="margin:0;font-size:14px;line-height:23px;">${security}</p>
          <p class="email-muted email-rule" style="margin:24px 0 0;padding-top:20px;border-top:1px solid #dde1e6;font-size:12px;line-height:19px;color:${emailColors.muted};">${consent}</p>`,
        footer:
          "Sent because a sign-in code was requested for this email address.",
      }),
    };
  }

  /** Shares one evidence layout across daily/weekly digests and prompt alerts without adding claims or changing eligibility. */
  opportunities(input: OpportunityEmailInput): EmailContent {
    const count = input.opportunities.length;
    const noun = count === 1 ? "opportunity" : "opportunities";
    const prompt = input.kind === "prompt";
    const subject = prompt
      ? `ScoutAlert: ${count === 1 ? "a strong match" : `${count} strong matches`} with supported details`
      : `ScoutAlert: ${count} ${noun} to review`;
    const title = prompt
      ? count === 1
        ? "A closer match to your brief."
        : "Closer matches to your brief."
      : `${count} ${noun} worth a look.`;
    const introduction = prompt
      ? "Your scout found a match with supported details for your brief. Review the evidence and the original posting before taking your next step."
      : "Here’s what your scouts found for your confirmed briefs. Start with the reasons each opportunity was found and what still needs checking.";
    const assessment =
      "AI assessments interpret source evidence and your brief; they do not independently verify employer claims.";
    const preferences =
      "You received this email because you enabled opportunity alerts. Change the frequency or turn emails off in your scout’s alert settings.";
    const entries = input.opportunities.map(opportunityEmailEntry);
    const layout = (contents: string): string =>
      emailLayout({
        subject,
        preview: `${count} ${noun} for your scouts, with reasons, source links and details to check.`,
        category: prompt ? "Prompt match alert" : "Opportunity digest",
        body: `${emailHeading(title)}<p class="email-muted" style="margin:0;font-size:16px;line-height:25px;color:${emailColors.muted};">${introduction}</p>
          ${emailButton("Review opportunities", this.dashboardUrl)}
          ${contents}
          <p class="email-muted email-rule" style="margin:28px 0 0;padding-top:20px;border-top:1px solid #dde1e6;font-size:12px;line-height:19px;color:${emailColors.muted};">${assessment}</p>`,
        footer: `${preferences}<p style="margin:10px 0 0;">${emailLink("Manage alerts", this.alertsUrl)}</p>`,
      });
    const fullHtml = layout(entries.map((entry) => entry.html).join(""));
    const compact = Buffer.byteLength(fullHtml, "utf8") > 90_000;
    const html = compact
      ? layout(
          `<p class="email-muted" style="margin:24px 0 0;font-size:14px;line-height:23px;color:${emailColors.muted};">This digest has a lot of detail. All ${count} ${noun} are listed below; open ScoutAlert for the full reasons, uncertainties and source evidence.</p>${input.opportunities.map(compactOpportunityEmailEntry).join("")}`,
        )
      : fullHtml;
    return {
      subject,
      text: `${title}\n\n${introduction}\n\n${entries.map((entry) => entry.text).join("\n\n---\n\n")}\n\nReview opportunities: ${this.dashboardUrl}\n\n${assessment}\n\n${preferences}\nManage alerts: ${this.alertsUrl}`,
      html,
    };
  }

  /** Confirms receipt in the message itself without implying that an SMTP acknowledgement proves inbox delivery. */
  connectionCheck(): EmailContent {
    const subject = "ScoutAlert email connection check";
    const introduction =
      "If you can read this message, your ScoutAlert test email has arrived.";
    const detail =
      "This is a delivery test. It does not contain a sign-in code, create an account or change your opportunity alert preferences.";
    return {
      subject,
      text: `${introduction}\n\n${detail}\n\nOpen ScoutAlert: ${this.dashboardUrl}`,
      html: emailLayout({
        subject,
        preview:
          "Your ScoutAlert delivery test. Check that the message is readable and arrived in the expected inbox.",
        category: "Delivery test",
        body: `${emailHeading("A good connection.")}<p class="email-muted" style="margin:0;font-size:16px;line-height:25px;color:${emailColors.muted};">${introduction}</p><table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="margin-top:28px;"><tr><td class="email-soft" style="padding:20px;background:${emailColors.soft};border-radius:10px;font-size:14px;line-height:23px;">${detail}</td></tr></table>${emailButton("Open ScoutAlert", this.dashboardUrl)}`,
        footer: "Sent as part of an explicitly requested email delivery check.",
      }),
    };
  }
}
