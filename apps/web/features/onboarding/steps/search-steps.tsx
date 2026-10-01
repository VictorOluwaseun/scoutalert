import { AuthorizationFields } from "../components/authorization-fields";
import { Button } from "@repo/ui/components/button";
import { Icon } from "@repo/ui/components/icon";
import {
  categories,
  examples,
  arrangementLabels,
  categoryLabels,
} from "../fixtures";
import type { Arrangement, StepProps } from "../types";
import {
  Choice,
  Field,
  FormError,
  SelectInput,
  SummaryRow,
} from "../components/form-parts";
import { RotatingHeadline } from "../components/rotating-headline";

/** Starts with one editable brief; examples populate the field without submitting it. */
export function GoalStep({
  draft,
  update,
  next,
  error,
  loaded,
}: StepProps & { loaded: boolean }) {
  return (
    <section className="scout-goal-step">
      <RotatingHeadline />
      <p className="scout-lede">
        Tell it what you’re looking for. It searches for jobs, contracts, and
        client projects, checks the details, and emails you when it finds
        something that fits.
      </p>
      <form
        noValidate
        className="scout-goal-form"
        onSubmit={(event) => {
          event.preventDefault();
          next();
        }}
      >
        <label htmlFor="goal">What would you like your scout to find?</label>
        <div className="scout-prompt-box" data-error={Boolean(error)}>
          <textarea
            id="goal"
            rows={3}
            maxLength={4001}
            value={draft.goal}
            disabled={!loaded}
            onChange={(event) => update({ goal: event.target.value })}
            placeholder="For example: remote product design roles or client website projects."
            aria-invalid={Boolean(error)}
            aria-describedby="goal-note goal-error"
          />
          <div className="scout-prompt-actions">
            <Button type="submit" disabled={!loaded}>
              Continue to details
              <Icon name="arrowRight" size={17} />
            </Button>
          </div>
        </div>
        <div id="goal-error">
          <FormError>{error}</FormError>
        </div>
        <p id="goal-note" className="scout-subtle">
          Setting up your brief doesn’t run a search. You can edit your answers
          as you go.
        </p>
      </form>
      <div className="scout-examples">
        <span id="goal-examples-heading">Try an example goal</span>
        <p id="goal-examples-note">
          Choose one to fill the box, then edit it to make it yours.
        </p>
        <div
          role="group"
          aria-labelledby="goal-examples-heading"
          aria-describedby="goal-examples-note"
        >
          {examples.map((example) => (
            <button
              key={example.label}
              type="button"
              disabled={!loaded}
              aria-label={`Fill goal with example: ${example.label}`}
              onClick={() => {
                update({ goal: example.goal });
                document.getElementById("goal")?.focus();
              }}
            >
              <span className="scout-example-icon">
                <Icon name="pencil" size={17} />
              </span>
              <span>{example.label}</span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

/** Confirms the category and target explicitly instead of presenting local heuristics as AI interpretation. */
export function FocusStep({ draft, update, next, error }: StepProps) {
  return (
    <section>
      <h1 className="scout-display" tabIndex={-1}>
        Let’s give your scout
        <br />a little direction.
      </h1>
      <p className="scout-lede">
        A clear brief helps it look for the right things. Start with the kind of
        opportunity you want.
      </p>
      <div className="scout-original-brief">
        <Icon name="sparkles" size={17} />
        <p>{draft.goal}</p>
      </div>
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          next();
        }}
        className="scout-step-form"
      >
        <fieldset className="scout-fieldset">
          <legend>I’m looking for</legend>
          <div className="scout-category-options">
            {categories.map((category) => (
              <Choice
                key={category.value}
                name="category"
                value={category.value}
                title={category.title}
                description={category.description}
                icon={category.icon}
                selected={draft.category === category.value}
                onSelect={() =>
                  update({
                    category: category.value,
                    minimumPay:
                      category.value === draft.category ? draft.minimumPay : "",
                    payPeriod:
                      category.value === "services"
                        ? "project"
                        : category.value === "contracts"
                          ? "hour"
                          : "year",
                  })
                }
              />
            ))}
          </div>
        </fieldset>
        <Field
          id="target"
          label={
            draft.category === "services"
              ? "What kind of projects or clients?"
              : "Which roles or kind of work?"
          }
          placeholder={
            draft.category === "services"
              ? "e.g. Brand identity and website design"
              : "e.g. Product designer, operations, customer support"
          }
          value={draft.target}
          onChange={(event) => update({ target: event.target.value })}
          maxLength={200}
          required
          aria-invalid={Boolean(error)}
          aria-describedby={error ? "target-help target-error" : "target-help"}
          help="A role, a skill, or an area you'd like to work in is enough."
        />
        <FormError id="target-error">{error}</FormError>
        <div className="scout-field">
          <label htmlFor="background">
            A little about you <span>Optional</span>
          </label>
          <textarea
            id="background"
            className="scout-input"
            rows={3}
            maxLength={2000}
            placeholder="Your experience, skills, or what you'd like to do next. No CV needed."
            value={draft.background}
            onChange={(event) => update({ background: event.target.value })}
          />
        </div>
        <div className="scout-form-actions">
          <Button type="submit">
            Continue to preferences
            <Icon name="arrowRight" size={17} />
          </Button>
          <span>You don’t need to have it all figured out.</span>
        </div>
      </form>
    </section>
  );
}

/** Keeps work arrangement, residence, hiring geography, pay units, and unknown policies distinct. */
export function PreferencesStep({
  draft,
  update,
  next,
  error,
  pending = false,
}: StepProps & { pending?: boolean }) {
  return (
    <section>
      <h1 className="scout-display" tabIndex={-1}>
        Good work should
        <br />
        fit your life.
      </h1>
      <p className="scout-lede">
        Tell your scout what matters. Leave anything you’re still figuring out
        open.
      </p>
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          next();
        }}
        className="scout-step-form"
      >
        <fieldset className="scout-fieldset">
          <legend>How would you like to work?</legend>
          <div className="scout-segmented">
            {Object.entries(arrangementLabels).map(([value, label]) => (
              <label key={value} data-selected={draft.arrangement === value}>
                <input
                  className="sr-only"
                  name="arrangement"
                  type="radio"
                  value={value}
                  checked={draft.arrangement === value}
                  onChange={() =>
                    update({
                      arrangement: value as Arrangement,
                      arrangementRequired: ["open", "unknown"].includes(value)
                        ? false
                        : draft.arrangementRequired,
                    })
                  }
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
        {["remote", "hybrid", "onsite"].includes(draft.arrangement) && (
          <label className="scout-check-line">
            <input
              type="checkbox"
              checked={draft.arrangementRequired}
              onChange={(event) =>
                update({ arrangementRequired: event.target.checked })
              }
            />
            This is a must-have, not just a preference
          </label>
        )}
        <div className="scout-field-grid">
          <Field
            id="residence"
            label="Where are you based?"
            placeholder="City or country — or leave it open"
            value={draft.residence}
            maxLength={200}
            onChange={(event) => update({ residence: event.target.value })}
            help="Your residence, not your work authorization."
          />
          <Field
            id="work-locations"
            label="Where would you like to work?"
            placeholder="Locations or regions you're interested in"
            value={draft.workLocations}
            maxLength={300}
            onChange={(event) => update({ workLocations: event.target.value })}
            help="Remote roles can still have hiring restrictions."
          />
        </div>
        <AuthorizationFields value={draft} update={update} />
        <fieldset className="scout-fieldset">
          <legend>
            {draft.category === "services"
              ? "A project budget you have in mind"
              : "A minimum you're comfortable with"}{" "}
            <span>Optional</span>
          </legend>
          <div className="scout-pay-fields">
            <SelectInput
              aria-label="Pay currency"
              value={draft.currency}
              onChange={(event) =>
                update({
                  currency: event.target.value as typeof draft.currency,
                })
              }
            >
              {["USD", "EUR", "GBP", "NGN"].map((currency) => (
                <option key={currency}>{currency}</option>
              ))}
            </SelectInput>
            <input
              aria-label="Minimum pay"
              className="scout-input"
              type="number"
              min="0"
              step="any"
              placeholder="No minimum"
              value={draft.minimumPay}
              onChange={(event) => update({ minimumPay: event.target.value })}
            />
            <SelectInput
              aria-label="Pay period"
              value={draft.payPeriod}
              onChange={(event) =>
                update({
                  payPeriod: event.target.value as typeof draft.payPeriod,
                })
              }
            >
              {["year", "month", "hour", "project"].map((period) => (
                <option key={period} value={period}>
                  per {period}
                </option>
              ))}
            </SelectInput>
          </div>
        </fieldset>
        <details className="scout-details">
          <summary>
            <Icon name="sliders" size={17} />
            When an opportunity leaves things unclear
            <Icon name="chevronDown" size={18} />
          </summary>
          <div className="scout-details-content">
            <label className="scout-field">
              Unknown hiring eligibility
              <SelectInput
                value={draft.unknownEligibility}
                onChange={(event) =>
                  update({
                    unknownEligibility: event.target
                      .value as typeof draft.unknownEligibility,
                  })
                }
              >
                <option value="review">
                  Keep in a separate group to review
                </option>
                <option value="exclude">
                  Leave it out of my recommendations
                </option>
              </SelectInput>
            </label>
            <label className="scout-field">
              Compensation isn’t listed
              <SelectInput
                value={draft.undisclosedPay}
                onChange={(event) =>
                  update({
                    undisclosedPay: event.target
                      .value as typeof draft.undisclosedPay,
                  })
                }
              >
                <option value="include">Include it, with a clear note</option>
                <option value="exclude">
                  Only include disclosed compensation
                </option>
              </SelectInput>
            </label>
            <p className="scout-subtle">
              Missing information stays unknown. It won’t be treated as
              confirmed eligibility or zero pay.
            </p>
          </div>
        </details>
        <FormError>{error}</FormError>
        <p className="scout-subtle">
          We’ll check these search details on the server before review. This
          does not start a search.
        </p>
        <div className="scout-form-actions">
          <Button type="submit" disabled={pending} aria-busy={pending}>
            {pending ? "Checking your scout…" : "Review my scout"}
            <Icon name="arrowRight" size={17} />
          </Button>
        </div>
      </form>
    </section>
  );
}

/** Presents the current brief for approval and offers guest exploration before requesting an email. */
export function ReviewStep({
  draft,
  update,
  next,
  error,
  edit,
  explore,
}: StepProps & { edit: () => void; explore: () => void }) {
  return (
    <section>
      <h1 className="scout-display" tabIndex={-1}>
        This is your scout.
        <br />
        Make it feel like you.
      </h1>
      <p className="scout-lede">
        A final look at the brief. Nothing is set in stone — your scout should
        evolve with you.
      </p>
      <form
        noValidate
        className="scout-step-form"
        onSubmit={(event) => {
          event.preventDefault();
          next();
        }}
      >
        <Field
          id="scout-name"
          label="Give your scout a name"
          placeholder={`${draft.target || "My next opportunity"} scout`}
          value={draft.name}
          maxLength={100}
          onChange={(event) => update({ name: event.target.value })}
        />
        <div className="scout-review-sheet">
          <div className="scout-sheet-heading">
            <span>
              <Icon name="compass" size={19} />
              Your search brief
            </span>
            <button type="button" onClick={edit}>
              <Icon name="pencil" size={14} />
              Edit
            </button>
          </div>
          <dl>
            <SummaryRow label="Looking for" value={draft.target} />
            <SummaryRow
              label="Opportunity"
              value={categoryLabels[draft.category]}
            />
            <SummaryRow
              label="Work style"
              value={`${arrangementLabels[draft.arrangement]}${["remote", "hybrid", "onsite"].includes(draft.arrangement) ? (draft.arrangementRequired ? " · Must-have" : " · Preferred") : ""}`}
              unknown={draft.arrangement === "unknown"}
            />
            <SummaryRow
              label="Based in"
              value={draft.residence || "Not specified"}
              unknown={!draft.residence}
            />
            <SummaryRow
              label="Work locations"
              value={
                draft.workLocations ||
                "Open to exploring; eligibility unconfirmed"
              }
              unknown={!draft.workLocations}
            />
            <SummaryRow
              label="Declared authorization"
              value={
                draft.authorizationConfirmed
                  ? `${draft.authorizationLocations} · ${draft.sponsorshipNeed === "needed" ? "Sponsorship needed" : "Already authorized"}`
                  : "Not confirmed"
              }
              unknown={!draft.authorizationConfirmed}
            />
            <SummaryRow
              label="Minimum pay"
              value={
                draft.minimumPay
                  ? `${draft.currency} ${Number(draft.minimumPay).toLocaleString()} / ${draft.payPeriod}`
                  : "No minimum set"
              }
            />
            <SummaryRow
              label="Eligibility gaps"
              value={
                draft.unknownEligibility === "review"
                  ? "Separate for review"
                  : "Exclude unconfirmed opportunities"
              }
            />
            <SummaryRow
              label="Undisclosed pay"
              value={
                draft.undisclosedPay === "include"
                  ? "Include with a clear note"
                  : "Exclude"
              }
            />
          </dl>
          {draft.background && (
            <div className="scout-background-note">
              <span>Your background</span>
              <p>{draft.background}</p>
            </div>
          )}
        </div>
        <p className="scout-info-note">
          <Icon name="shield" size={17} />
          Location and remote preferences don’t confirm your eligibility. Your
          scout will keep those uncertainties visible.
        </p>
        <FormError>{error}</FormError>
        <div className="scout-review-actions">
          <Button type="submit">
            Continue to alert settings
            <Icon name="arrowRight" size={17} />
          </Button>
          <Button variant="ghost" onClick={explore}>
            <Icon name="eye" size={17} />
            Explore example opportunities
          </Button>
        </div>
      </form>
    </section>
  );
}
