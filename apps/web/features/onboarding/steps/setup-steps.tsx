import { Button } from "@repo/ui/components/button";
import { Icon } from "@repo/ui/components/icon";
import {
  Choice,
  Field,
  FormError,
  SelectInput,
} from "../components/form-parts";
import type { Frequency, StepProps } from "../types";

/** Shows scheduling and separate alert consent; dashboard-only never requests an email subscription. */
export function AlertsStep({ draft, update, next, error }: StepProps) {
  const choices: { value: Frequency; title: string; description: string }[] = [
    {
      value: "daily",
      title: "Daily",
      description: "A thoughtful daily roundup",
    },
    {
      value: "weekly",
      title: "Weekly",
      description: "Your week’s worthwhile finds",
    },
    {
      value: "dashboard",
      title: "Dashboard only",
      description: "Check in whenever you like",
    },
  ];
  return (
    <section>
      <h1 className="scout-display" tabIndex={-1}>
        The right finds.
        <br />
        At the right time.
      </h1>
      <p className="scout-lede">
        Choose how you’d review opportunities. Dashboard only keeps opportunity
        emails off.
      </p>
      <form
        noValidate
        className="scout-step-form"
        onSubmit={(event) => {
          event.preventDefault();
          next();
        }}
      >
        <fieldset className="scout-fieldset">
          <legend>How would you like to review opportunities?</legend>
          <div className="scout-frequency-options">
            {choices.map((choice) => (
              <Choice
                key={choice.value}
                name="frequency"
                value={choice.value}
                title={choice.title}
                description={choice.description}
                selected={draft.frequency === choice.value}
                onSelect={() =>
                  update({
                    frequency: choice.value,
                    alertConsent: false,
                    promptAlerts:
                      choice.value === "dashboard" ? false : draft.promptAlerts,
                  })
                }
              />
            ))}
          </div>
        </fieldset>
        {draft.frequency !== "dashboard" && (
          <>
            <div className="scout-field-grid">
              <Field
                id="delivery-time"
                label="A good time for you"
                type="time"
                value={draft.deliveryTime}
                required
                onChange={(event) =>
                  update({ deliveryTime: event.target.value })
                }
              />
              <Field
                id="timezone"
                label="Your timezone"
                value={draft.timezone}
                required
                list="timezone-options"
                onChange={(event) => update({ timezone: event.target.value })}
                help="Suggested from your browser. Please confirm it."
              />
            </div>
            <datalist id="timezone-options">
              {[
                "Africa/Lagos",
                "Africa/Nairobi",
                "Europe/London",
                "America/New_York",
                "America/Los_Angeles",
                "Asia/Kolkata",
                "UTC",
              ].map((zone) => (
                <option key={zone} value={zone} />
              ))}
            </datalist>
            {draft.frequency === "weekly" && (
              <label className="scout-field">
                Which day?
                <SelectInput
                  value={draft.weekday}
                  onChange={(event) => update({ weekday: event.target.value })}
                >
                  {[
                    "Monday",
                    "Tuesday",
                    "Wednesday",
                    "Thursday",
                    "Friday",
                    "Saturday",
                    "Sunday",
                  ].map((day) => (
                    <option key={day}>{day}</option>
                  ))}
                </SelectInput>
              </label>
            )}
            <label className="scout-notification-option">
              <span className="scout-choice-icon">
                <Icon name="sparkles" size={21} />
              </span>
              <span>
                <strong>A little sooner for a strong match</strong>
                <span>
                  An extra email when every assessed requirement is supported,
                  including eligibility. At most one in 24 hours across your
                  scouts. Eligibility questions stay visible.
                </span>
              </span>
              <input
                type="checkbox"
                role="switch"
                aria-label="Prompt alerts for strong matches"
                checked={draft.promptAlerts}
                onChange={(event) =>
                  update({ promptAlerts: event.target.checked })
                }
              />
            </label>
            {draft.promptAlerts && (
              <fieldset className="scout-fieldset scout-quiet-hours">
                <legend>Quiet hours for prompt alerts</legend>
                <p className="scout-subtle">
                  No prompt alerts during these hours in your chosen timezone.
                  Your scheduled roundup keeps its own time.
                </p>
                <div className="scout-field-grid">
                  <Field
                    id="quiet-start"
                    label="Quiet hours start"
                    type="time"
                    value={draft.quietStart}
                    required
                    onChange={(event) =>
                      update({ quietStart: event.target.value })
                    }
                  />
                  <Field
                    id="quiet-end"
                    label="Quiet hours end"
                    type="time"
                    value={draft.quietEnd}
                    required
                    onChange={(event) =>
                      update({ quietEnd: event.target.value })
                    }
                  />
                </div>
              </fieldset>
            )}
            <label className="scout-consent">
              <input
                type="checkbox"
                checked={draft.alertConsent}
                onChange={(event) =>
                  update({ alertConsent: event.target.checked })
                }
              />
              <span>
                I’d like opportunity alerts for this scout. I can pause them or
                unsubscribe at any time.
              </span>
            </label>
          </>
        )}
        {draft.frequency === "dashboard" && (
          <p className="scout-info-note">
            <Icon name="eye" size={19} />
            Your scout’s finds will live in your dashboard. Account verification
            saves your scout; it doesn’t subscribe you to emails.
          </p>
        )}
        <FormError>{error}</FormError>
        <div className="scout-form-actions">
          <Button type="submit">
            Continue to account
            <Icon name="arrowRight" size={17} />
          </Button>
        </div>
      </form>
    </section>
  );
}

/** Requests an actual account code, or saves directly under an existing verified session. */
export function EmailStep({
  email,
  setEmail,
  next,
  error,
  pending,
  accountEmail,
  signOut,
}: {
  email: string;
  setEmail: (value: string) => void;
  next: () => void;
  error: string;
  pending: boolean;
  accountEmail?: string;
  signOut: () => void;
}) {
  return (
    <section className="scout-contact-step">
      <div className="scout-step-symbol">
        <Icon name="mail" size={29} />
      </div>
      <h1 className="scout-display" tabIndex={-1}>
        {accountEmail ? (
          <>
            Your scout.
            <br />
            Ready to save.
          </>
        ) : (
          <>
            Give your scout
            <br />a place to reach you.
          </>
        )}
      </h1>
      <p className="scout-lede">
        {accountEmail ? (
          <>
            You’re signed in as{" "}
            <strong className="scout-email-address">{accountEmail}</strong>.
            Save your confirmed brief and alert choices to your account.
          </>
        ) : (
          "Verify your email to save your scout and pick up on any device. No password to remember."
        )}
      </p>
      <form
        noValidate
        className="scout-step-form"
        onSubmit={(event) => {
          event.preventDefault();
          next();
        }}
      >
        {!accountEmail && (
          <Field
            id="email"
            label="Email address"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            required
            maxLength={254}
            disabled={pending}
            onChange={(event) => setEmail(event.target.value)}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? "email-error" : undefined}
          />
        )}
        <FormError id="email-error">{error}</FormError>
        <Button
          type="submit"
          className="scout-full-button"
          disabled={pending}
          aria-busy={pending}
        >
          {pending
            ? accountEmail
              ? "Saving your scout…"
              : "Sending your code…"
            : accountEmail
              ? "Save my scout"
              : "Send verification code"}
          <Icon name="arrowRight" size={17} />
        </Button>
      </form>
      {accountEmail && (
        <button
          className="scout-text-button scout-contact-note"
          type="button"
          onClick={signOut}
          disabled={pending}
        >
          Use a different account
        </button>
      )}
      <p className="scout-subtle scout-contact-note">
        Verifying your email signs you in. Opportunity emails follow the
        separate choices you made for this scout.
      </p>
    </section>
  );
}

/** Enters a real single-use code, with explicit resend timing and recoverable verification failures. */
export function VerifyStep({
  email,
  code,
  setCode,
  next,
  changeEmail,
  resend,
  resendSeconds,
  pending,
  error,
}: {
  email: string;
  code: string;
  setCode: (value: string) => void;
  next: () => void;
  changeEmail: () => void;
  resend: () => void;
  resendSeconds: number;
  pending: boolean;
  error: string;
}) {
  return (
    <section className="scout-contact-step">
      <div className="scout-step-symbol">
        <Icon name="shield" size={29} />
      </div>
      <h1 className="scout-display" tabIndex={-1}>
        One quick check.
        <br />
        Then your next chapter.
      </h1>
      <p className="scout-lede">
        Enter the code sent to{" "}
        <strong className="scout-email-address">{email}</strong>.
      </p>
      <button
        className="scout-text-button"
        type="button"
        onClick={changeEmail}
        disabled={pending}
      >
        Use a different email
        <Icon name="pencil" size={14} />
      </button>
      <form
        noValidate
        className="scout-step-form"
        onSubmit={(event) => {
          event.preventDefault();
          next();
        }}
      >
        <label className="scout-field" htmlFor="verification-code">
          Six-digit code
          <input
            id="verification-code"
            className="scout-input scout-code-input"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(event) =>
              setCode(event.target.value.replace(/\D/g, "").slice(0, 6))
            }
            placeholder="000000"
            required
            disabled={pending}
            aria-invalid={Boolean(error)}
            aria-describedby={
              error
                ? "verification-code-note verification-code-error"
                : "verification-code-note"
            }
          />
        </label>
        <div id="verification-code-note" className="scout-code-note">
          <span>Valid for 10 minutes. Use your latest code.</span>
        </div>
        <FormError id="verification-code-error">{error}</FormError>
        <Button
          type="submit"
          className="scout-full-button"
          disabled={pending}
          aria-busy={pending}
        >
          {pending ? "Checking and saving…" : "Verify and save my scout"}
          <Icon name="arrowRight" size={17} />
        </Button>
      </form>
      <div className="scout-contact-note">
        <button
          className="scout-text-button"
          type="button"
          onClick={resend}
          disabled={pending || resendSeconds > 0}
        >
          {resendSeconds > 0
            ? `Resend code in ${resendSeconds}s`
            : "Send a new code"}
          <Icon name="mail" size={17} />
        </button>
      </div>
      <p className="scout-subtle scout-contact-note">
        Keep this browser open. The code is tied to this browser for your
        security.
      </p>
    </section>
  );
}
