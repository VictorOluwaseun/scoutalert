"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { loadAccountContext, logoutAccount } from "./account-client";

/** Revokes the current account session through the shared identity routes, with visible failure recovery. */
export function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);

  /** Obtains a fresh CSRF token and navigates only after the durable session has been revoked. */
  async function signOut() {
    if (pending.current) {
      return;
    }

    pending.current = true;
    setBusy(true);
    setError("");

    try {
      const context = await loadAccountContext();
      await logoutAccount(context.csrfToken);
      router.replace("/sign-in");
      router.refresh();
    } catch {
      setError("We couldn’t sign you out. Please try again.");
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return (
    <div className="workspace-sign-out">
      <button type="button" disabled={busy} onClick={() => void signOut()}>
        {busy ? "Signing out…" : "Sign out"}
      </button>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
