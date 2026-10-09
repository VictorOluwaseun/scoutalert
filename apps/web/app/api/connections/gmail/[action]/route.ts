import { forwardScoutRequest } from "@/server/api-client/scout-api";

/** Forwards only explicit mail mutations through existing origin, CSRF and session checks. */
export async function POST(
  request: Request,
  context: { params: Promise<{ action: string }> },
) {
  const { action } = await context.params;
  if (!["begin", "label", "import", "disconnect"].includes(action)) {
    return new Response(null, { status: 404 });
  }
  return forwardScoutRequest(request, `/v1/connections/gmail/${action}`);
}

/** Label reads remain session-protected; arbitrary provider paths are not accepted. */
export async function GET(
  request: Request,
  context: { params: Promise<{ action: string }> },
) {
  const { action } = await context.params;
  if (action !== "labels") {
    return new Response(null, { status: 404 });
  }
  return forwardScoutRequest(request, "/v1/connections/gmail/labels");
}
