"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@repo/ui/components/button";
import { Icon } from "@repo/ui/components/icon";
import {
  loadAccountContext,
  sendAccountRequest,
} from "../account/account-client";
import type { MailPage } from "./mail-contracts";

const notices: Record<string, string> = {
  connected: "Gmail is connected. Choose a label below to continue.",
  cancelled:
    "You cancelled the Google connection. No new account was connected.",
  failed: "The connection did not finish. Try connecting again.",
  expired:
    "That connection link has expired or your session changed. Please try again.",
};

/** Presents explicit Gmail consent, a narrow label choice and private imports in the established light workspace. */
export function MailConnections({
  page,
  result,
}: {
  page: MailPage;
  result?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(result ? (notices[result] ?? "") : "");
  const [error, setError] = useState("");
  const [labels, setLabels] = useState<{ id: string; name: string }[] | null>(
    null,
  );
  const [selected, setSelected] = useState(page.connection.label?.id ?? "");
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const connected = page.connection.status === "connected";

  useEffect(() => {
    if (!page.connection.importing) {
      return;
    }
    const timer = setInterval(() => router.refresh(), 10000);
    return () => clearInterval(timer);
  }, [page.connection.importing, router]);

  /** Sends only fixed owner-bound actions through the existing CSRF-protected transport. */
  async function action(
    name: "begin" | "label" | "import" | "disconnect",
    body: unknown = {},
  ) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const context = await loadAccountContext();
      const value = (await sendAccountRequest(
        `/api/connections/gmail/${name}`,
        body,
        context.csrfToken,
      )) as { url?: string; providerRevoked?: boolean };
      if (name === "begin") {
        window.location.assign(googleAuthorizationUrl(value.url));
        return;
      }
      if (name === "disconnect") {
        setLabels(null);
        setSelected("");
        setConfirmDisconnect(false);
        setMessage(
          value.providerRevoked
            ? "Disconnected. Imported emails have been removed from ScoutAlert."
            : "Disconnected and imported emails removed. Also remove ScoutAlert in your Google account’s connected apps; we couldn’t confirm Google revoked the grant.",
        );
      }
      if (name === "label") {
        setMessage("Label saved. You can now import its emails.");
      }
      if (name === "import") {
        setMessage(
          "Import requested. The worker will check this label shortly.",
        );
      }
      router.refresh();
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "This action did not finish. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  /** Loads selectable labels only after the person asks; the provider returns no message content here. */
  async function loadLabels() {
    setBusy(true);
    setError("");
    try {
      const value = (await sendAccountRequest(
        "/api/connections/gmail/labels",
      )) as { labels?: { id: string; name: string }[] };
      if (
        !Array.isArray(value.labels) ||
        !value.labels.every(
          (label) =>
            typeof label?.id === "string" && typeof label.name === "string",
        )
      ) {
        throw new Error("We couldn’t load your labels. Please try again.");
      }
      setLabels(value.labels);
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "We couldn’t load your labels.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mail-connections">
      <header>
        <h1>Your connections</h1>
        <p>
          Bring job alerts and project leads from your inbox into your private
          workspace.
        </p>
      </header>
      {message && (
        <p className="mail-notice" role="status">
          {message}
        </p>
      )}
      {error && (
        <p className="mail-error" role="alert">
          {error}
        </p>
      )}
      <section className="mail-connection" aria-labelledby="gmail-title">
        <div className="mail-heading">
          <span className="mail-icon">
            <Icon name="mail" size={24} />
          </span>
          <div>
            <h2 id="gmail-title">Gmail</h2>
            <p>{page.connection.email ?? "Use your regular Gmail account."}</p>
          </div>
          <span className="mail-state">
            {connected
              ? "Connected"
              : page.connection.status === "reconnect"
                ? "Reconnect needed"
                : "Not connected"}
          </span>
        </div>
        <p>
          Already receive job alerts or project newsletters? Create a Gmail
          label called <strong>ScoutAlert</strong> and apply it to the emails
          you want to bring here. You can also choose an existing label.
        </p>
        <div className="mail-permission">
          <Icon name="shield" size={20} />
          <p>
            Google asks for permission to read your mailbox. ScoutAlert uses
            that access to import only messages in your chosen label. It cannot
            send, change or delete your Gmail messages with this permission.
          </p>
        </div>
        {!page.available && (
          <p className="mail-notice">
            Gmail connection is being set up. You can keep using web discovery
            while it becomes available.
          </p>
        )}
        {!connected && (
          <Button
            disabled={busy || !page.available}
            onClick={() => action("begin")}
          >
            {busy ? "Opening Google…" : "Connect Gmail"}
          </Button>
        )}
        {connected && (
          <>
            <div className="mail-label-section">
              <h3>Which emails should we import?</h3>
              <p>
                {page.connection.label ? (
                  <>
                    Current label: <strong>{page.connection.label.name}</strong>
                  </>
                ) : (
                  "Choose a label before importing any emails."
                )}
              </p>
              <Button
                variant="secondary"
                disabled={busy || !page.available}
                onClick={loadLabels}
              >
                {labels ? "Refresh labels" : "Choose a Gmail label"}
              </Button>
              {labels?.length === 0 && (
                <p>
                  No custom labels found. Create one in Gmail, add your
                  job-alert emails to it, then refresh this list.
                </p>
              )}
              {!!labels?.length && (
                <form
                  noValidate
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (selected) {
                      void action("label", { id: selected });
                    }
                  }}
                >
                  <label htmlFor="gmail-label">Gmail label</label>
                  <div className="mail-select">
                    <select
                      id="gmail-label"
                      value={selected}
                      onChange={(event) => setSelected(event.target.value)}
                    >
                      <option value="">Select a label</option>
                      {labels.map((label) => (
                        <option key={label.id} value={label.id}>
                          {label.name}
                        </option>
                      ))}
                    </select>
                    <Icon name="chevronDown" size={20} />
                  </div>
                  {page.connection.label && (
                    <p>
                      Changing the label removes previous imports from
                      ScoutAlert. Your Gmail messages stay where they are.
                    </p>
                  )}
                  <Button
                    disabled={
                      busy ||
                      !selected ||
                      selected === page.connection.label?.id
                    }
                  >
                    Save label
                  </Button>
                </form>
              )}
            </div>
            {page.connection.label && (
              <div className="mail-label-section">
                <h3>Import your emails</h3>
                <p>
                  Import messages from the last 90 days. Imports run in small
                  batches and skip duplicates. Saved copies stay here for 30
                  days.
                </p>
                <Button
                  disabled={
                    busy || !page.available || page.connection.importing
                  }
                  onClick={() => action("import")}
                >
                  {page.connection.importing
                    ? "Import queued or running…"
                    : "Import emails"}
                </Button>
                <p>
                  Imports run when you request them. Automatic ongoing checks
                  and AI matching for private emails will follow.
                </p>
                {page.connection.error && (
                  <p role="status">
                    {page.connection.error === "import_daily_limit"
                      ? "The daily import allowance is used. This scan will continue after 00:00 UTC."
                      : page.connection.error === "some_messages_skipped"
                        ? "Some messages could not be imported. Attachments and unreadable messages are skipped."
                        : "The last import could not finish. It will retry, or you can reconnect Gmail if access has expired."}
                  </p>
                )}
              </div>
            )}
          </>
        )}
        {page.connection.status !== "disconnected" && (
          <div className="mail-disconnect">
            {!confirmDisconnect ? (
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => setConfirmDisconnect(true)}
              >
                Disconnect Gmail
              </Button>
            ) : (
              <>
                <p>
                  Disconnect Gmail and remove all imported emails from
                  ScoutAlert?
                </p>
                <div className="mail-actions">
                  <Button disabled={busy} onClick={() => action("disconnect")}>
                    Disconnect and remove imports
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={busy}
                    onClick={() => setConfirmDisconnect(false)}
                  >
                    Keep connection
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </section>
      <section className="mail-imports" aria-labelledby="mail-imports-title">
        <h2 id="mail-imports-title">Your imported emails</h2>
        <p>
          Private to your account. These are source emails awaiting review, not
          verified matches.
        </p>
        {!page.items.length && (
          <div className="mail-empty">
            <Icon name="mail" size={24} />
            <h3>No emails imported yet</h3>
            <p>Connect Gmail, choose a label, then import its emails.</p>
          </div>
        )}
        {page.items.map((item) => (
          <details key={item.id}>
            <summary>
              <span>
                <strong>{item.subject}</strong>
                <span>{item.sender}</span>
              </span>
              <Icon name="chevronDown" size={20} />
            </summary>
            <p>
              Received {new Date(item.receivedAt).toISOString().slice(0, 10)}
              {item.truncated
                ? " · Shortened preview; attachments excluded"
                : ""}
            </p>
            <pre>{item.text}</pre>
          </details>
        ))}
        {!!page.items.length && <p>Showing up to 20 recent imports.</p>}
      </section>
    </div>
  );
}

/** Restricts an authorization redirect to Google's fixed consent endpoint before leaving the workspace. */
function googleAuthorizationUrl(value: string | undefined): string {
  const url = new URL(value ?? "");
  if (
    url.origin !== "https://accounts.google.com" ||
    url.pathname !== "/o/oauth2/v2/auth" ||
    url.username ||
    url.password
  ) {
    throw new Error("We couldn’t start the Google connection.");
  }
  return url.toString();
}
