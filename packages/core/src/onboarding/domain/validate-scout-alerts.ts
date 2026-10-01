import { ActivationError, type ScoutAlerts } from "./scout-activation.js";

/** Rejects contradictory subscriptions and invalid local schedules without inferring consent. */
export function validateScoutAlerts(alerts: ScoutAlerts): void {
  if (
    alerts.frequency === "dashboard" &&
    (alerts.consent || alerts.promptAlerts)
  ) {
    throw new ActivationError(
      "invalid_alerts",
      "Dashboard-only scouting keeps opportunity emails off.",
    );
  }

  const quiet = alerts.quietHours;

  if (
    quiet &&
    (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(quiet.start) ||
      !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(quiet.end) ||
      quiet.start === quiet.end)
  ) {
    throw new ActivationError(
      "invalid_alerts",
      "Choose different, valid start and end times for quiet hours.",
    );
  }

  if (alerts.frequency === "dashboard") {
    return;
  }

  if (!alerts.consent) {
    throw new ActivationError(
      "invalid_alerts",
      "Confirm opportunity alerts or choose dashboard only.",
    );
  }

  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(alerts.deliveryTime)) {
    throw new ActivationError(
      "invalid_alerts",
      "Choose a valid delivery time.",
    );
  }

  if (
    ![
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
      "Sunday",
    ].includes(alerts.weekday)
  ) {
    throw new ActivationError("invalid_alerts", "Choose a valid delivery day.");
  }

  try {
    new Intl.DateTimeFormat("en", { timeZone: alerts.timezone }).format();
  } catch {
    throw new ActivationError("invalid_alerts", "Choose a valid timezone.");
  }
}
