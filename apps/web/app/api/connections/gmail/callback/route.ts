import { finishGmailConnection } from "@/server/api-client/scout-api";

/** Handles Google's top-level callback through owner/browser-bound OAuth state rather than form CSRF. */
export async function GET(request: Request) {
  return finishGmailConnection(request);
}
