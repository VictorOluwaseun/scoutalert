"use client";

import { Field, SelectInput } from "../onboarding/components/form-parts";
import type { ManagedScout } from "./scout-contracts";

/** Edits explicit delivery preferences; choosing an email schedule never checks consent on the person's behalf. */
export function EditScoutAlerts({
  alerts,
  update,
  disabled,
}: {
  alerts: ManagedScout["alerts"];
  update: (alerts: ManagedScout["alerts"]) => void;
  disabled: boolean;
}) {
  const email = alerts.frequency !== "dashboard";
  const quiet = alerts.quietHours ?? { start: "20:00", end: "08:00" };

  /** Dashboard-only clears email permissions; moving back to email requires a fresh affirmative choice. */
  function frequency(value: ManagedScout["alerts"]["frequency"]): void {
    update({
      ...alerts,
      frequency: value,
      consent: value === "dashboard" ? false : alerts.consent,
      promptAlerts: value === "dashboard" ? false : alerts.promptAlerts,
    });
  }

  return (
    <fieldset className="workspace-edit-section" disabled={disabled}>
      <legend>Your alerts</legend>
      <div className="workspace-edit-fields">
        <label className="scout-field" htmlFor="edit-frequency">
          How would you like updates?
          <SelectInput
            id="edit-frequency"
            value={alerts.frequency}
            onChange={(e) =>
              frequency(e.target.value as ManagedScout["alerts"]["frequency"])
            }
          >
            <option value="daily">Daily digest</option>
            <option value="weekly">Weekly digest</option>
            <option value="dashboard">Dashboard only</option>
          </SelectInput>
        </label>
        {email && (
          <>
            <div className="workspace-edit-grid">
              <Field
                id="edit-timezone"
                label="Timezone"
                list="edit-timezones"
                value={alerts.timezone}
                onChange={(e) =>
                  update({ ...alerts, timezone: e.target.value })
                }
                help="For example: Africa/Lagos or Europe/London."
              />
              <datalist id="edit-timezones">
                {[
                  "Africa/Lagos",
                  "UTC",
                  "Europe/London",
                  "America/New_York",
                  "America/Los_Angeles",
                  "Asia/Kolkata",
                ].map((value) => (
                  <option key={value} value={value} />
                ))}
              </datalist>
              <Field
                id="edit-delivery"
                label="Digest delivery time"
                type="time"
                value={alerts.deliveryTime}
                onChange={(e) =>
                  update({ ...alerts, deliveryTime: e.target.value })
                }
              />
            </div>
            {alerts.frequency === "weekly" && (
              <label className="scout-field" htmlFor="edit-weekday">
                Delivery day
                <SelectInput
                  id="edit-weekday"
                  value={alerts.weekday}
                  onChange={(e) =>
                    update({ ...alerts, weekday: e.target.value })
                  }
                >
                  {[
                    "Monday",
                    "Tuesday",
                    "Wednesday",
                    "Thursday",
                    "Friday",
                    "Saturday",
                    "Sunday",
                  ].map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </SelectInput>
              </label>
            )}
            <label className="workspace-check">
              <input
                type="checkbox"
                checked={alerts.promptAlerts}
                onChange={(e) =>
                  update({ ...alerts, promptAlerts: e.target.checked })
                }
              />
              <span>
                Also send prompt alerts when all assessed requirements are
                supported.
                <small>
                  At most one per 24 hours across your scouts, outside quiet
                  hours.
                </small>
              </span>
            </label>
            {alerts.promptAlerts && (
              <div className="workspace-edit-grid">
                <Field
                  id="edit-quiet-start"
                  label="Quiet hours start"
                  type="time"
                  value={quiet.start}
                  onChange={(e) =>
                    update({
                      ...alerts,
                      quietHours: { ...quiet, start: e.target.value },
                    })
                  }
                />
                <Field
                  id="edit-quiet-end"
                  label="Quiet hours end"
                  type="time"
                  value={quiet.end}
                  onChange={(e) =>
                    update({
                      ...alerts,
                      quietHours: { ...quiet, end: e.target.value },
                    })
                  }
                />
              </div>
            )}
            <label className="workspace-check workspace-consent">
              <input
                type="checkbox"
                checked={alerts.consent}
                onChange={(e) =>
                  update({ ...alerts, consent: e.target.checked })
                }
              />
              <span>
                Email me opportunities for this scout using these choices.
                <small>
                  You can change your choices or pause this scout at any time.
                </small>
              </span>
            </label>
          </>
        )}
        {!email && (
          <p>
            See opportunities on your dashboard. Opportunity emails are off for
            this scout.
          </p>
        )}
      </div>
    </fieldset>
  );
}
