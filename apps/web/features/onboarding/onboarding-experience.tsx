"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button, buttonVariants } from "@repo/ui/components/button";
import { Icon } from "@repo/ui/components/icon";
import { Brand } from "./components/brand";
import { ScoutIllustration } from "./components/scout-illustration";
import { ScoutSummary, DigestPreview } from "./components/scout-summary";
import { OpportunityPreview } from "./components/opportunity-preview";
import {
  GoalStep,
  FocusStep,
  PreferencesStep,
  ReviewStep,
} from "./steps/search-steps";
import { AlertsStep, EmailStep, VerifyStep } from "./steps/setup-steps";
import { useOnboarding } from "./use-onboarding";
import { useAccountSetup } from "./use-account-setup";
import { reviewSearch } from "./search-review";
import type { Stage } from "./types";
import { scoutAlertSchedule } from "../scouts/scout-presentation";

const stageIndex: Record<Stage, number> = {
  goal: 0,
  focus: 1,
  preferences: 1,
  review: 2,
  explore: 2,
  alerts: 3,
  email: 3,
  verify: 3,
  ready: 4,
};
const backStages: Partial<Record<Stage, Stage>> = {
  focus: "goal",
  preferences: "focus",
  review: "preferences",
  alerts: "review",
  email: "alerts",
  verify: "email",
  explore: "review",
};
const progress = [
  { label: "Your goal", stage: "goal" },
  { label: "The details", stage: "focus" },
  { label: "Your scout", stage: "review" },
  { label: "Your rhythm", stage: "alerts" },
] as const;

/** Composes server-reviewed onboarding with shared identity, durable activation and honest discovery status. */
export function OnboardingExperience() {
  const accountSetup = useAccountSetup();
  const {
    draft,
    stage,
    loaded,
    routeReady,
    storageAvailable,
    error,
    setError,
    update,
    navigate,
    goBack,
    markSearchReviewed,
    start,
    discard,
  } = useOnboarding({
    loaded: accountSetup.loaded,
    challenge: Boolean(accountSetup.challenge),
    saved: Boolean(accountSetup.receipt),
  });
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [guest, setGuest] = useState(true);
  const [reviewBusy, setReviewBusy] = useState(false);
  const reviewPending = useRef(false);
  const latestDraft = useRef(draft);
  latestDraft.current = draft;
  const helpDialog = useRef<HTMLDialogElement>(null);
  const discardDialog = useRef<HTMLDialogElement>(null);
  const currentIndex = stageIndex[stage];

  useEffect(() => {
    if (!routeReady) {
      return;
    }

    document
      .querySelector<HTMLElement>("main h1")
      ?.focus({ preventScroll: true });
  }, [routeReady, stage]);

  /** Confirms the target scope and keeps a default name editable in review. */
  function confirmFocus() {
    if (!draft.target.trim()) {
      setError(
        "Add a role, skill, or kind of project for your scout to focus on.",
      );
      document.getElementById("target")?.focus();

      return;
    }

    navigate("preferences");
  }

  /** Requests the API's deterministic search check before showing the editable review. */
  async function confirmPreferences() {
    if (reviewPending.current) {
      return;
    }

    reviewPending.current = true;
    setReviewBusy(true);
    const submitted = JSON.stringify(draft);

    try {
      const result = await reviewSearch(draft);

      if (submitted !== JSON.stringify(latestDraft.current)) {
        setError("Your answers changed while we checked them. Review again.");

        return;
      }

      if (!result.ready) {
        setError(result.message);

        return;
      }

      markSearchReviewed();
      navigate("review");
    } finally {
      reviewPending.current = false;
      setReviewBusy(false);
    }
  }

  /** Moves the approved brief into notification setup, preserving any guest exploration edits. */
  function confirmReview() {
    if (!draft.target.trim()) {
      navigate("focus");

      return;
    }

    if (!draft.name.trim()) {
      update({ name: `${draft.target.trim()} scout` });
    }

    navigate("alerts");
  }

  /** Checks visible scheduling choices and separate alert consent before account setup. */
  function confirmAlerts() {
    if (draft.frequency !== "dashboard" && !draft.alertConsent) {
      setError(
        "Choose to receive opportunity alerts, or select dashboard only.",
      );

      return;
    }

    if (draft.frequency === "dashboard") {
      navigate("email");

      return;
    }

    if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(draft.deliveryTime)) {
      setError("Choose a delivery time.");
      document.getElementById("delivery-time")?.focus();

      return;
    }

    if (
      draft.promptAlerts &&
      (![draft.quietStart, draft.quietEnd].every((value) =>
        /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value),
      ) ||
        draft.quietStart === draft.quietEnd)
    ) {
      setError("Choose different start and end times for quiet hours.");
      document.getElementById("quiet-start")?.focus();

      return;
    }

    try {
      new Intl.DateTimeFormat("en", { timeZone: draft.timezone }).format();
    } catch {
      setError(
        "Choose a valid timezone, such as Africa/Lagos or Europe/London.",
      );
      document.getElementById("timezone")?.focus();

      return;
    }

    navigate("email");
  }

  /** Saves a confirmed scout under the shared verified account, with explicit consent validation. */
  async function saveConfirmedScout() {
    if (draft.frequency !== "dashboard" && !draft.alertConsent) {
      navigate("alerts");
      setError("Confirm opportunity alerts again, or choose dashboard only.");

      return;
    }

    const receipt = await accountSetup.activate(draft);

    if (!receipt) {
      return;
    }

    setGuest(false);
    navigate("ready", receipt.id);
  }

  /** Shows inline email feedback before requesting a code; an existing session saves directly. */
  async function requestVerification() {
    setError("");

    if (accountSetup.account) {
      await saveConfirmedScout();

      return;
    }

    if (!email.trim()) {
      setError("Enter your email address.");
      document.getElementById("email")?.focus();

      return;
    }

    if (
      email.trim().length > 254 ||
      !/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(email.trim())
    ) {
      setError("Enter a valid email address, like you@example.com.");
      document.getElementById("email")?.focus();

      return;
    }

    const sent = await accountSetup.sendCode(email);

    if (!sent) {
      return;
    }

    setCode("");
    navigate("verify");
  }

  /** Checks code completeness inline before inbox verification; scout saving remains independently retryable. */
  async function verifyAndSave() {
    setError("");

    if (!/^\d{6}$/.test(code)) {
      setError(
        code
          ? "Your code should have six digits."
          : "Enter the six-digit code from your email.",
      );
      document.getElementById("verification-code")?.focus();

      return;
    }

    if (!(await accountSetup.verify(code))) {
      return;
    }

    setCode("");
    await saveConfirmedScout();
  }

  /** Supersedes the previous code only when the server accepts a new request. */
  async function resendCode() {
    const address = accountSetup.challenge?.email;

    if (!address) {
      return;
    }

    if (await accountSetup.sendCode(address)) {
      setCode("");
    }
  }

  /** Discards the browser brief and transient contact state after an explicit local confirmation. */
  function confirmDiscard() {
    discardDialog.current?.close();
    setEmail("");
    setCode("");
    setGuest(true);
    discard();
  }

  const common = { draft, update, error };
  const isEntry = stage === "goal";
  const isReady = stage === "ready";
  const isExploring = stage === "explore";

  if (!routeReady) {
    return <main className="scout-page" aria-busy="true" />;
  }

  return (
    <div className="scout-page">
      <a className="scout-skip-link" href="#scout-main">
        Skip to your scout
      </a>
      <header className="scout-header">
        <button
          type="button"
          className="scout-brand-button"
          disabled={accountSetup.busy}
          aria-label="Return to your goal"
          onClick={() => navigate("goal")}
        >
          <Brand />
        </button>
        <div className="scout-header-actions">
          {isEntry && (
            <Link
              className="scout-text-button"
              href={accountSetup.account ? "/dashboard" : "/sign-in"}
            >
              {accountSetup.account ? "My dashboard" : "Sign in"}
            </Link>
          )}
          <span className="scout-preview-badge">
            <span />
            {accountSetup.receipt ? "Scout saved" : "Scout setup"}
          </span>
          <button
            className="scout-text-button"
            type="button"
            onClick={() => helpDialog.current?.showModal()}
          >
            How it works
            <Icon name="help" size={16} />
          </button>
        </div>
      </header>
      {!isEntry && !isReady && (
        <nav className="scout-progress" aria-label="Onboarding progress">
          <ol>
            {progress.map((item, index) => (
              <li
                key={item.stage}
                data-state={
                  index < currentIndex
                    ? "complete"
                    : index === currentIndex
                      ? "current"
                      : "upcoming"
                }
              >
                <button
                  type="button"
                  disabled={index >= currentIndex || accountSetup.busy}
                  aria-current={index === currentIndex ? "step" : undefined}
                  onClick={() => navigate(item.stage)}
                >
                  <span className="scout-progress-mark">
                    {index < currentIndex ? (
                      <Icon name="check" size={12} />
                    ) : (
                      index + 1
                    )}
                  </span>
                  {item.label}
                </button>
                {index < progress.length - 1 && (
                  <span className="scout-progress-line" />
                )}
              </li>
            ))}
          </ol>
        </nav>
      )}
      <main
        id="scout-main"
        className={`scout-main ${isEntry ? "scout-entry-layout" : "scout-flow-layout"} ${isReady ? "scout-ready-layout" : ""}`}
      >
        <div className="scout-main-content">
          {backStages[stage] && (
            <button
              type="button"
              className="scout-back"
              disabled={accountSetup.busy}
              onClick={() => goBack(backStages[stage]!)}
            >
              <Icon name="arrowLeft" size={15} />
              Back
            </button>
          )}
          {stage === "goal" && (
            <GoalStep {...common} loaded={loaded} next={start} />
          )}
          {stage === "focus" && <FocusStep {...common} next={confirmFocus} />}
          {stage === "preferences" && (
            <PreferencesStep
              {...common}
              next={confirmPreferences}
              pending={reviewBusy}
            />
          )}
          {stage === "review" && (
            <ReviewStep
              {...common}
              next={confirmReview}
              edit={() => navigate("focus")}
              explore={() => {
                setGuest(true);
                navigate("explore");
              }}
            />
          )}
          {stage === "alerts" && (
            <AlertsStep {...common} next={confirmAlerts} />
          )}
          {stage === "email" && (
            <EmailStep
              email={email}
              setEmail={(value) => {
                setEmail(value);
                setError("");
                accountSetup.clearError();
              }}
              next={requestVerification}
              error={error || accountSetup.error}
              pending={accountSetup.busy}
              accountEmail={accountSetup.account?.email}
              signOut={() => {
                void accountSetup.signOut();
              }}
            />
          )}
          {stage === "verify" && (
            <VerifyStep
              email={accountSetup.challenge?.email ?? email}
              code={code}
              setCode={(value) => {
                setCode(value);
                setError("");
                accountSetup.clearError();
              }}
              next={verifyAndSave}
              changeEmail={() => navigate("email")}
              resend={resendCode}
              resendSeconds={accountSetup.resendSeconds}
              pending={accountSetup.busy}
              error={error || accountSetup.error}
            />
          )}
          {isExploring && (
            <OpportunityPreview
              draft={draft}
              guest={guest}
              edit={() => navigate("focus")}
              continueSetup={confirmReview}
            />
          )}
          {isReady && (
            <section className="scout-ready">
              <div className="scout-ready-symbol">
                <Icon name="check" size={35} />
              </div>
              <span className="scout-intro-pill">A good beginning</span>
              <h1 className="scout-display" tabIndex={-1}>
                Your next chapter
                <br />
                has a direction.
              </h1>
              <p className="scout-lede">
                Your scout is saved to your account. Your confirmed brief and
                alert choices are ready for its first search.
              </p>
              <div className="scout-ready-brief">
                <Icon name="compass" size={26} />
                <div>
                  <strong>{accountSetup.receipt?.name}</strong>
                  <span>
                    {accountSetup.receipt
                      ? scoutAlertSchedule(accountSetup.receipt.alerts)
                      : ""}
                  </span>
                </div>
                <span className="scout-ready-label">Saved</span>
              </div>
              <p className="scout-ready-note">
                <Icon name="eye" size={18} />
                <span>
                  Follow your search status and opportunities on your dashboard.
                  Your scout checks our connected job and client-project
                  sources.
                </span>
              </p>
              <div className="scout-ready-actions">
                <Link className={buttonVariants()} href="/dashboard">
                  Go to my dashboard
                  <Icon name="arrowRight" size={17} />
                </Link>
                <Button
                  variant="ghost"
                  onClick={() => {
                    accountSetup.startAnotherScout();
                    discard();
                  }}
                >
                  Create another scout
                </Button>
              </div>
              <Link
                className="scout-ready-example-link"
                href={`/dashboard/examples?category=${accountSetup.receipt?.search.category ?? "employment"}`}
              >
                Preview example opportunities
              </Link>
            </section>
          )}
        </div>
        {isEntry && <ScoutIllustration />}
        {!isEntry && !isReady && !isExploring && stage !== "alerts" && (
          <ScoutSummary draft={draft} />
        )}
        {stage === "alerts" && draft.frequency !== "dashboard" && (
          <DigestPreview draft={draft} />
        )}
        {stage === "alerts" && draft.frequency === "dashboard" && (
          <ScoutSummary draft={draft} />
        )}
        {isExploring && <ScoutSummary draft={draft} />}
      </main>
      <footer className="scout-footer">
        <span>
          {!storageAvailable ? (
            <>
              <Icon name="help" size={14} />
              Browser storage is unavailable. Keep this tab open to retain your
              draft.
            </>
          ) : (
            <>
              <Icon name="shield" size={14} />
              {accountSetup.receipt
                ? "Scout saved to your account. Follow its progress on your dashboard."
                : draft.goal
                  ? "Draft saved in this browser. Finish setup to start this scout."
                  : "Set up a scout to start finding opportunities."}
            </>
          )}
        </span>
        <div>
          {draft.goal && (
            <button
              type="button"
              disabled={accountSetup.busy}
              onClick={() => discardDialog.current?.showModal()}
            >
              Discard draft
            </button>
          )}
        </div>
      </footer>
      <dialog
        className="scout-dialog"
        ref={helpDialog}
        aria-labelledby="help-title"
      >
        <button
          className="scout-dialog-close"
          aria-label="Close explanation"
          onClick={() => helpDialog.current?.close()}
        >
          <Icon name="close" size={20} />
        </button>
        <div className="scout-step-symbol">
          <Icon name="compass" size={28} />
        </div>
        <h2 id="help-title">A scout briefed by you.</h2>
        <ol>
          <li>
            <strong>Tell it what you want.</strong>
            <p>A job, contract, or client project. Start in your own words.</p>
          </li>
          <li>
            <strong>Make the details yours.</strong>
            <p>Confirm your preferences and keep unknowns visible.</p>
          </li>
          <li>
            <strong>Choose your rhythm.</strong>
            <p>
              Explore first, then decide how you’d like to hear about
              opportunities.
            </p>
          </li>
        </ol>
        <p className="scout-dialog-note">
          Save your scout to search connected job boards and client-project
          sources. Your dashboard shows matches, supporting details and anything
          still unconfirmed. Emails follow your alert choices. Example
          opportunities are fictional.
        </p>
        <Button onClick={() => helpDialog.current?.close()}>
          Let’s give it a try
          <Icon name="arrowRight" size={16} />
        </Button>
      </dialog>
      <dialog
        className="scout-dialog"
        ref={discardDialog}
        aria-labelledby="discard-title"
      >
        <h2 id="discard-title">Start with a fresh brief?</h2>
        <p>
          This removes your saved draft from this browser. Your current answers
          won’t be kept.
        </p>
        <div className="scout-dialog-actions">
          <Button
            variant="secondary"
            onClick={() => discardDialog.current?.close()}
          >
            Keep my draft
          </Button>
          <Button onClick={confirmDiscard}>Discard draft</Button>
        </div>
      </dialog>
      <span className="sr-only" aria-live="polite">
        {stage === "goal"
          ? "Describe your goal"
          : `Onboarding screen: ${stage}`}
      </span>
    </div>
  );
}
