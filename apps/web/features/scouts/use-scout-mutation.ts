"use client";

import { useRef, useState } from "react";
import {
  AccountRequestError,
  loadAccountContext,
  sendAccountRequest,
} from "../account/account-client";

/** Shares authenticated writes and stable lost-response retry identities across explicit dashboard controls. */
export function useScoutMutation() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AccountRequestError | null>(null);
  const running = useRef(false);
  const attempt = useRef<{ payload: string; key: string } | null>(null);

  /** Reuses a key for the same reviewed payload; concurrency failures never silently overwrite server state. */
  async function submit(path: string, body: object): Promise<unknown | null> {
    if (running.current) return null;
    running.current = true;
    setBusy(true);
    setError(null);
    const payload = JSON.stringify({ path, body });
    if (attempt.current?.payload !== payload)
      attempt.current = { payload, key: crypto.randomUUID() };
    try {
      const context = await loadAccountContext();
      if (!context.account) throw new AccountRequestError("unauthenticated");
      const result = await sendAccountRequest(
        path,
        { ...body, key: attempt.current.key },
        context.csrfToken,
      );
      attempt.current = null;
      return result;
    } catch (failure) {
      setError(
        failure instanceof AccountRequestError
          ? failure
          : new AccountRequestError("service_unavailable"),
      );
      return null;
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  return { submit, busy, error };
}
