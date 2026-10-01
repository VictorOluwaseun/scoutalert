"use client";

import Link from "next/link";
import { Button } from "@repo/ui/components/button";

/** Offers recovery from unexpected rendering failures without exposing private error details. */
export default function DashboardError({ reset }: { reset: () => void }) {
  return (
    <main className="workspace-loading">
      <h1>We couldn’t open your dashboard.</h1>
      <p>Please try again. Your saved scouts are safe.</p>
      <Button onClick={reset}>Try again</Button>
      <Link href="/sign-in">Sign in again</Link>
    </main>
  );
}
