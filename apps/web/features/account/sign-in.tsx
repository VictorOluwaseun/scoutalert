"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@repo/ui/components/button";
import { Icon } from "@repo/ui/components/icon";
import { Brand } from "../onboarding/components/brand";
import { FormError } from "../onboarding/components/form-parts";
import {
  AccountRequestError,
  loadAccountContext,
  requestEmailCode,
  verifyEmailCode,
  type CodeChallenge,
} from "./account-client";

/** Verifies inbox access with the shared identity API, without creating a scout or changing alert consent. */
export function SignIn() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [challenge, setChallenge] = useState<CodeChallenge | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [invalid, setInvalid] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const csrf = useRef("");
  const pending = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  const resendSeconds = challenge
    ? Math.max(0, Math.ceil((Date.parse(challenge.resendAt) - now) / 1000))
    : 0;
  const expired = Boolean(challenge && Date.parse(challenge.expiresAt) <= now);

  useEffect(() => {
    let cancelled = false;
    void loadAccountContext()
      .then((context) => {
        if (cancelled) return;
        csrf.current = context.csrfToken;
        if (context.account) {
          router.replace("/dashboard");
          router.refresh();
          return;
        }
        setChallenge(context.challenge);
        setEmail(context.challenge?.email ?? "");
      })
      .catch((failure: unknown) => {
        if (!cancelled)
          setError(
            failure instanceof Error ? failure.message : "Please try again.",
          );
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    if (!challenge) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [challenge]);

  /** Validates the active field inline and serializes proof actions; lost send responses recover their challenge. */
  async function submit(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (pending.current) return;
    const valid = challenge
      ? /^\d{6}$/.test(code)
      : /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) &&
        email.trim().length <= 254;
    if (!valid) {
      setInvalid(true);
      setError(
        challenge
          ? "Enter the six-digit code from your email."
          : "Enter a valid email address.",
      );
      input.current?.focus();
      return;
    }
    await perform(challenge ? "verify" : "send");
  }

  /** Uses the same CSRF, cooldown and HttpOnly-session contract as onboarding; no proof is persisted in browser storage. */
  async function perform(action: "send" | "verify") {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    setInvalid(false);
    try {
      if (!csrf.current) csrf.current = (await loadAccountContext()).csrfToken;
      if (action === "send") {
        const next = await requestEmailCode(email.trim(), csrf.current);
        setChallenge(next);
        setCode("");
        setNow(Date.now());
        return;
      }
      if (!challenge) return;
      await verifyEmailCode(challenge, code, csrf.current);
      setCode("");
      router.replace("/dashboard");
      router.refresh();
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Please try again.",
      );
      setInvalid(
        failure instanceof AccountRequestError &&
          ["invalid_email", "invalid_code"].includes(failure.code),
      );
      if (action === "send") await recoverChallenge();
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  /** Restores only a pending generation for the submitted inbox after an ambiguous email response. */
  async function recoverChallenge() {
    const recovered = await loadAccountContext().catch(() => null);
    if (recovered?.challenge?.email !== email.trim().toLowerCase()) return;
    setChallenge(recovered.challenge);
    setCode("");
  }

  /** Clears only transient form state so a different inbox can request its own proof. */
  function changeEmail() {
    setChallenge(null);
    setCode("");
    setError("");
    setInvalid(false);
  }

  return (
    <div className="account-page scout-page">
      <header className="account-header">
        <Link href="/" aria-label="ScoutAlert home">
          <Brand />
        </Link>
        <Link href="/onboarding?step=goal">
          Create a scout <Icon name="arrowRight" size={18} />
        </Link>
      </header>
      <main className="account-main">
        <span className="account-symbol">
          <Icon name="mail" size={28} />
        </span>
        <h1>
          {challenge ? "Check your inbox." : "Welcome to your dashboard."}
        </h1>
        <p className="account-intro">
          {challenge ? (
            <>
              We sent a six-digit code to <strong>{challenge.email}</strong>.
              Enter it here to sign in.
            </>
          ) : (
            "Sign in with your email to see your saved scouts. No password to remember."
          )}
        </p>
        <form
          noValidate
          onSubmit={(event) => void submit(event)}
          aria-busy={!loaded || busy}
        >
          <label htmlFor="sign-in-proof">
            {challenge ? "Verification code" : "Email address"}
          </label>
          <input
            ref={input}
            id="sign-in-proof"
            className="scout-input"
            type={challenge ? "text" : "email"}
            inputMode={challenge ? "numeric" : "email"}
            autoComplete={challenge ? "one-time-code" : "email"}
            placeholder={challenge ? "000000" : "you@example.com"}
            maxLength={challenge ? 6 : 254}
            value={challenge ? code : email}
            disabled={!loaded || busy}
            aria-invalid={invalid}
            aria-describedby={error ? "sign-in-error" : undefined}
            onChange={(event) => {
              if (challenge) setCode(event.target.value.replace(/\D/g, ""));
              else setEmail(event.target.value);
              setInvalid(false);
              setError("");
            }}
          />
          <FormError id="sign-in-error">{error}</FormError>
          {expired && (
            <p className="account-expiry" role="status">
              This code has expired. Send a new code below.
            </p>
          )}
          <Button type="submit" disabled={!loaded || busy || expired}>
            {busy
              ? "Please wait…"
              : challenge
                ? "Sign in to my dashboard"
                : "Send sign-in code"}
            <Icon name="arrowRight" size={18} />
          </Button>
        </form>
        {challenge && (
          <div className="account-code-actions">
            <Button
              variant="secondary"
              disabled={busy || resendSeconds > 0}
              onClick={() => void perform("send")}
            >
              {resendSeconds
                ? `Send again in ${resendSeconds}s`
                : "Send a new code"}
            </Button>
            <Button variant="ghost" disabled={busy} onClick={changeEmail}>
              Use another email
            </Button>
          </div>
        )}
        <p className="account-footnote">
          <Icon name="shield" size={18} />
          <span>
            Signing in does not change your opportunity email preferences.
          </span>
        </p>
      </main>
    </div>
  );
}
