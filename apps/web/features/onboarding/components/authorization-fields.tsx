import type { ScoutDraft } from "../types";
import { Field, SelectInput } from "./form-parts";

type Authorization = Pick<
  ScoutDraft,
  "authorizationLocations" | "sponsorshipNeed" | "authorizationConfirmed"
>;

/** Collects an optional explicit declaration; edits clear confirmation and nothing is inferred from residence. */
export function AuthorizationFields({
  value,
  update,
  error,
}: {
  value: Authorization;
  update: (patch: Authorization) => void;
  error?: string;
}) {
  return (
    <fieldset className="scout-fieldset scout-authorization">
      <legend>
        Work authorization <span>Optional</span>
      </legend>
      <p>
        Your scout compares these answers with employer requirements. Leave them
        open if you’re unsure.
      </p>
      <Field
        id="authorization-locations"
        label="Countries covered by these details"
        placeholder="For example, Nigeria or the United Kingdom"
        value={value.authorizationLocations ?? ""}
        maxLength={300}
        onChange={(event) =>
          update({
            ...value,
            authorizationLocations: event.target.value,
            authorizationConfirmed: false,
          })
        }
        help={
          error ||
          "List where you already have permission to work, or where you would need sponsorship."
        }
        aria-invalid={Boolean(error)}
      />
      <label className="scout-field" htmlFor="sponsorship-need">
        Would you need employer sponsorship there?
        <SelectInput
          id="sponsorship-need"
          value={value.sponsorshipNeed ?? "unknown"}
          onChange={(event) =>
            update({
              ...value,
              sponsorshipNeed: event.target
                .value as Authorization["sponsorshipNeed"],
              authorizationConfirmed: false,
            })
          }
        >
          <option value="unknown">I’m not sure yet</option>
          <option value="not_needed">
            No, I already have permission to work there
          </option>
          <option value="needed">Yes, I would need sponsorship</option>
        </SelectInput>
      </label>
      <label className="scout-check-line">
        <input
          type="checkbox"
          checked={value.authorizationConfirmed ?? false}
          onChange={(event) =>
            update({ ...value, authorizationConfirmed: event.target.checked })
          }
        />
        These details are accurate for all the countries I listed.
      </label>
      <p>
        These are your declared details. ScoutAlert does not verify immigration
        status. Unknown eligibility can appear for review, but won’t trigger a
        prompt alert.
      </p>
    </fieldset>
  );
}
