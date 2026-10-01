"use client";
import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@repo/ui/components/button";

/** Refreshes server-owned reads while a search runs; hidden tabs stop generating polling traffic. */
export function RefreshDashboard({ searching }: { searching: boolean }) {
  const router = useRouter();
  const [pending, transition] = useTransition();
  useEffect(() => {
    if (!searching) return;
    const timer = window.setInterval(() => {
      if (!document.hidden) router.refresh();
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [searching, router]);
  return (
    <Button
      variant="secondary"
      disabled={pending}
      onClick={() => transition(() => router.refresh())}
    >
      {pending ? "Updating…" : "Refresh results"}
    </Button>
  );
}
