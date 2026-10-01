"use client";

import Link from "next/link";
import { AuthorizationFields } from "../onboarding/components/authorization-fields";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { buttonVariants } from "@repo/ui/components/button";
import { Icon } from "@repo/ui/components/icon";
import { Field, SelectInput } from "../onboarding/components/form-parts";
import type { ManagedScout } from "./scout-contracts";
import { EditScoutAlerts } from "./edit-scout-alerts";
import { useScoutMutation } from "./use-scout-mutation";

/** Edits a full confirmed snapshot; stale server versions require an explicit reload rather than an automatic overwrite. */
export function EditScout({ scout }: { scout: ManagedScout }) {
  const [search, setSearch] = useState(scout.search);
  const [alerts, setAlerts] = useState(scout.alerts);
  const router = useRouter();
  const mutation = useScoutMutation();
  const errorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (mutation.error) {
      errorRef.current?.focus();
    }
  }, [mutation.error]);

  /** Applies only explicit field changes, retaining unedited confirmed information. */
  function update<K extends keyof ManagedScout["search"]>(
    field: K,
    value: ManagedScout["search"][K],
  ): void {
    setSearch((current) => ({ ...current, [field]: value }));
  }

  /** Gives invalid fields their matching server message without relying on browser validation popups. */
  function issue(field: string): string | undefined {
    return mutation.error?.issues.find((item) => item.field === field)?.message;
  }

  /** Confirms the complete brief and alerts; server rules and transactional version checks remain authoritative. */
  async function save(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const result = await mutation.submit(`/api/scouts/${scout.id}/change`, {
      action: "update",
      version: scout.version,
      search,
      alerts,
    });

    if (!result) {
      return;
    }

    router.push("/dashboard?updated=1#scouts");
    router.refresh();
  }

  return (
    <div className="workspace-editor">
      <Link className="workspace-back" href="/dashboard#scouts">
        <Icon name="arrowLeft" size={19} />
        Back to your scouts
      </Link>
      <header className="workspace-heading">
        <div>
          <h1>Edit your scout.</h1>
          <p>
            {scout.status === "paused"
              ? "Update your brief and alerts. Your scout will stay paused until you resume it."
              : "Refine what you want. Saving starts a fresh check with your updated brief."}
          </p>
        </div>
      </header>
      <form onSubmit={save} noValidate aria-busy={mutation.busy}>
        <fieldset className="workspace-edit-section" disabled={mutation.busy}>
          <legend>Your search</legend>
          <div className="workspace-edit-fields">
            <Field
              id="edit-name"
              label="Scout name"
              value={search.name}
              maxLength={100}
              onChange={(e) => update("name", e.target.value)}
              help={issue("name")}
              aria-invalid={Boolean(issue("name"))}
            />
            <div className="scout-field">
              <label htmlFor="edit-goal">
                What would you like your scout to find?
              </label>
              <textarea
                id="edit-goal"
                className="scout-input"
                rows={3}
                value={search.goal}
                maxLength={4000}
                onChange={(e) => update("goal", e.target.value)}
                aria-invalid={Boolean(issue("goal"))}
                aria-describedby="edit-goal-help"
              />
              <span id="edit-goal-help">
                {issue("goal") ||
                  "Describe the work you want, in your own words."}
              </span>
            </div>
            <div className="workspace-edit-grid">
              <label className="scout-field" htmlFor="edit-category">
                Type of work
                <SelectInput
                  id="edit-category"
                  value={search.category}
                  onChange={(e) =>
                    update(
                      "category",
                      e.target.value as ManagedScout["search"]["category"],
                    )
                  }
                >
                  <option value="employment">Employment</option>
                  <option value="contracts">Contract work</option>
                  <option value="services">Client projects</option>
                </SelectInput>
              </label>
              <Field
                id="edit-target"
                label="Role or service you offer"
                value={search.target}
                maxLength={200}
                onChange={(e) => update("target", e.target.value)}
                help={issue("target")}
                aria-invalid={Boolean(issue("target"))}
              />
            </div>
            <label className="scout-field" htmlFor="edit-arrangement">
              Work arrangement
              <SelectInput
                id="edit-arrangement"
                value={search.arrangement}
                onChange={(e) =>
                  update(
                    "arrangement",
                    e.target.value as ManagedScout["search"]["arrangement"],
                  )
                }
              >
                <option value="remote">Remote</option>
                <option value="hybrid">Hybrid</option>
                <option value="onsite">On site</option>
                <option value="open">Open to any</option>
                <option value="unknown">Not decided</option>
              </SelectInput>
            </label>
            <label className="workspace-check">
              <input
                type="checkbox"
                checked={search.arrangementRequired}
                onChange={(e) =>
                  update("arrangementRequired", e.target.checked)
                }
              />
              This work arrangement is a must-have.
            </label>
            {issue("arrangementRequired") && (
              <p className="scout-error">{issue("arrangementRequired")}</p>
            )}
            <div className="workspace-edit-grid">
              <Field
                id="edit-residence"
                label="Where you live"
                value={search.residence}
                maxLength={200}
                onChange={(e) => update("residence", e.target.value)}
                help={issue("residence")}
              />
              <Field
                id="edit-locations"
                label="Where you want to work"
                value={search.workLocations}
                maxLength={300}
                onChange={(e) => update("workLocations", e.target.value)}
                help={issue("workLocations")}
              />
            </div>
            <div className="scout-field">
              <label htmlFor="edit-background">
                Your experience and availability
              </label>
              <textarea
                id="edit-background"
                className="scout-input"
                rows={4}
                value={search.background}
                maxLength={2000}
                onChange={(e) => update("background", e.target.value)}
                aria-describedby="edit-background-help"
              />
              <span id="edit-background-help">
                {issue("background") ||
                  "Skills, experience, seniority, or availability you want considered."}
              </span>
            </div>
            <AuthorizationFields
              value={search}
              update={(patch) =>
                setSearch((current) => ({ ...current, ...patch }))
              }
              error={issue("authorizationLocations")}
            />
            <div className="workspace-pay-grid">
              <label className="scout-field" htmlFor="edit-currency">
                Currency
                <SelectInput
                  id="edit-currency"
                  value={search.currency}
                  onChange={(e) =>
                    update(
                      "currency",
                      e.target.value as ManagedScout["search"]["currency"],
                    )
                  }
                >
                  {["USD", "EUR", "GBP", "NGN"].map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </SelectInput>
              </label>
              <Field
                id="edit-minimum"
                label="Minimum pay (optional)"
                inputMode="decimal"
                value={search.minimumPay}
                onChange={(e) => update("minimumPay", e.target.value)}
                placeholder="No minimum"
                help={issue("minimumPay")}
                aria-invalid={Boolean(issue("minimumPay"))}
              />
              <label className="scout-field" htmlFor="edit-period">
                Pay period
                <SelectInput
                  id="edit-period"
                  value={search.payPeriod}
                  onChange={(e) =>
                    update(
                      "payPeriod",
                      e.target.value as ManagedScout["search"]["payPeriod"],
                    )
                  }
                >
                  {["year", "month", "hour", "project"].map((value) => (
                    <option key={value} value={value}>
                      Per {value}
                    </option>
                  ))}
                </SelectInput>
              </label>
            </div>
            <div className="workspace-edit-grid">
              <label className="scout-field" htmlFor="edit-eligibility">
                When eligibility is unclear
                <SelectInput
                  id="edit-eligibility"
                  value={search.unknownEligibility}
                  onChange={(e) =>
                    update(
                      "unknownEligibility",
                      e.target.value as "review" | "exclude",
                    )
                  }
                >
                  <option value="review">Keep for review</option>
                  <option value="exclude">Exclude</option>
                </SelectInput>
              </label>
              <label className="scout-field" htmlFor="edit-undisclosed">
                When pay is not stated
                <SelectInput
                  id="edit-undisclosed"
                  value={search.undisclosedPay}
                  onChange={(e) =>
                    update(
                      "undisclosedPay",
                      e.target.value as "include" | "exclude",
                    )
                  }
                >
                  <option value="include">Include for review</option>
                  <option value="exclude">Exclude</option>
                </SelectInput>
              </label>
            </div>
          </div>
        </fieldset>
        <EditScoutAlerts
          alerts={alerts}
          update={setAlerts}
          disabled={mutation.busy}
        />
        {mutation.error && (
          <div
            className="workspace-edit-error"
            role="alert"
            tabIndex={-1}
            ref={errorRef}
          >
            <strong>{mutation.error.message}</strong>
            {mutation.error.issues.length > 0 && (
              <ul>
                {mutation.error.issues.map((item) => (
                  <li key={item.field}>{item.message}</li>
                ))}
              </ul>
            )}
            {mutation.error.code === "scout_changed" && (
              <button
                type="button"
                className={buttonVariants({ variant: "secondary" })}
                onClick={() => router.refresh()}
              >
                Load latest saved version
              </button>
            )}
          </div>
        )}
        <div className="workspace-save-bar">
          <div>
            <strong>
              {scout.status === "paused"
                ? "Your scout will stay paused."
                : "Your scout will use these details for its next search."}
            </strong>
            <p>Review your search and email choices before saving.</p>
          </div>
          <div className="workspace-control-buttons">
            <Link
              className={buttonVariants({ variant: "secondary" })}
              href="/dashboard#scouts"
            >
              Cancel
            </Link>
            <button
              className={buttonVariants()}
              type="submit"
              disabled={mutation.busy}
            >
              {mutation.busy ? "Saving…" : "Save changes"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
