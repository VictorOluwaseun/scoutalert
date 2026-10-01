import { forwardScoutRequest } from "../../../../../server/api-client/scout-api";

/** Recovers a saved scout receipt only within the current authenticated owner's scope. */
export async function GET(
  request: Request,
  context: RouteContext<"/api/onboarding/scouts/[id]">,
): Promise<Response> {
  const { id } = await context.params;

  if (!/^[a-f0-9-]{36}$/i.test(id)) {
    return Response.json({ code: "invalid_request" }, { status: 400 });
  }

  return forwardScoutRequest(
    request,
    `/v1/onboarding/scouts/${encodeURIComponent(id)}`,
  );
}
