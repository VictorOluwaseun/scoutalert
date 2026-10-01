import { forwardScoutRequest } from "../../../../server/api-client/scout-api";

/** Saves a confirmed scout through authenticated, transactional API activation. */
export async function POST(request: Request): Promise<Response> {
  return forwardScoutRequest(request, "/v1/onboarding/scouts");
}
