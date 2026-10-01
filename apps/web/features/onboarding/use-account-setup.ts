"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  AccountRequestError,
  activateScout,
  activationPayload,
  loadAccountContext,
  loadSavedScout,
  logoutAccount,
  requestEmailCode,
  verifyEmailCode,
  type CodeChallenge,
  type SavedScout,
  type VerifiedAccount,
} from "./account-client";
import type { ScoutDraft } from "./types";

/** A deliberately new scout must not reuse a completed save key, even when its confirmed brief is identical. */
function clearActivationRequest() {
  try {
    sessionStorage.removeItem("scoutalert.activation-request");
  } catch {
    /* Unavailable storage leaves fresh in-memory retry keys usable. */
  }
}

/** Preserves only a non-authoritative retry identity; it contains no account or verification data. */
function activationKey(draft: ScoutDraft): string {
  const fingerprint = JSON.stringify(activationPayload(draft, ""));

  try {
    const previous = sessionStorage.getItem("scoutalert.activation-request");
    const record: unknown = previous ? JSON.parse(previous) : null;

    if (
      record &&
      typeof record === "object" &&
      "fingerprint" in record &&
      record.fingerprint === fingerprint &&
      "key" in record &&
      typeof record.key === "string"
    ) {
      return record.key;
    }

    const key = crypto.randomUUID();
    sessionStorage.setItem(
      "scoutalert.activation-request",
      JSON.stringify({ key, fingerprint }),
    );

    return key;
  } catch {
    return crypto.randomUUID();
  }
}

/** Coordinates authoritative identity and scout requests while keeping codes and credentials out of storage. */
export function useAccountSetup() {
  const params = useSearchParams();
  const savedId = params.get("scout");
  const freshStart = useRef(params.get("new") === "1");
  const [account, setAccount] = useState<VerifiedAccount | null>(null);
  const [challenge, setChallenge] = useState<CodeChallenge | null>(null);
  const [receipt, setReceipt] = useState<SavedScout | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const csrf = useRef("");
  const pending = useRef(false);
  const fallbackKey = useRef<{ fingerprint: string; key: string } | null>(null);

  useEffect(() => {
    if (freshStart.current) {
      clearActivationRequest();
    }

    let cancelled = false;
    void loadAccountContext()
      .then(async (context) => {
        const saved =
          context.account && savedId ? await loadSavedScout(savedId) : null;

        if (cancelled) {
          return;
        }

        csrf.current = context.csrfToken;
        setAccount(context.account);
        setChallenge(context.challenge);
        setReceipt(saved);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setError(
            error instanceof Error
              ? error.message
              : "We couldn’t restore your account. Try again.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoaded(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [savedId]);

  useEffect(() => {
    if (!challenge) {
      return;
    }

    const timer = window.setInterval(() => setNow(Date.now()), 1000);

    return () => window.clearInterval(timer);
  }, [challenge]);

  /** Serializes contact/save actions and refreshes the CSRF context after an availability failure. */
  async function perform<T>(action: () => Promise<T>): Promise<T | null> {
    if (pending.current) {
      return null;
    }

    pending.current = true;
    setBusy(true);
    setError("");

    try {
      if (!csrf.current) {
        const context = await loadAccountContext();
        csrf.current = context.csrfToken;
        setAccount(context.account);
        setChallenge(context.challenge);
      }

      return await action();
    } catch (error) {
      if (
        error instanceof AccountRequestError &&
        error.code === "unauthenticated"
      ) {
        setAccount(null);
      }

      setError(error instanceof Error ? error.message : "Please try again.");

      return null;
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  /** Requests the next proof generation and clears outdated code-entry state in the caller. */
  async function sendCode(email: string): Promise<boolean> {
    const result = await perform(() => requestEmailCode(email, csrf.current));
    const recovered = result
      ? null
      : await loadAccountContext().catch(() => null);
    const nextChallenge = result ?? recovered?.challenge;

    if (!nextChallenge || nextChallenge.email !== email.trim().toLowerCase()) {
      return false;
    }

    setChallenge(nextChallenge);
    setNow(Date.now());

    return true;
  }

  /** Verifies inbox access without activating a scout or recording alert consent. */
  async function verify(code: string): Promise<boolean> {
    if (!challenge) {
      setError("Request a code for this browser first.");

      return false;
    }

    const result = await perform(() =>
      verifyEmailCode(challenge, code, csrf.current),
    );

    if (!result) {
      return false;
    }

    setAccount(result);
    setChallenge(null);

    return true;
  }

  /** Persists a confirmed scout; an unchanged payload retains its retry key even with storage blocked. */
  async function activate(draft: ScoutDraft): Promise<SavedScout | null> {
    const fingerprint = JSON.stringify(activationPayload(draft, ""));
    const key =
      fallbackKey.current?.fingerprint === fingerprint
        ? fallbackKey.current.key
        : activationKey(draft);
    fallbackKey.current = { fingerprint, key };
    const result = await perform(() => activateScout(draft, key, csrf.current));

    if (result) {
      setReceipt(result);
    }

    return result;
  }

  /** Revokes the shared session before permitting an account switch. */
  async function signOut(): Promise<boolean> {
    const result = await perform(async () => {
      await logoutAccount(csrf.current);

      return true;
    });

    if (!result) {
      return false;
    }

    setAccount(null);
    setReceipt(null);
    fallbackKey.current = null;

    return true;
  }

  /** Starts a distinct scout intention without changing any saved scout or account state. */
  function startAnotherScout(): void {
    setReceipt(null);
    fallbackKey.current = null;

    try {
      sessionStorage.removeItem("scoutalert.activation-request");
    } catch {
      /* An unavailable browser store leaves the new in-memory intention usable. */
    }
  }

  return {
    account,
    challenge,
    receipt,
    loaded,
    busy,
    error,
    clearError: () => setError(""),
    sendCode,
    verify,
    activate,
    signOut,
    startAnotherScout,
    resendSeconds: challenge
      ? Math.max(0, Math.ceil((Date.parse(challenge.resendAt) - now) / 1000))
      : 0,
  };
}
