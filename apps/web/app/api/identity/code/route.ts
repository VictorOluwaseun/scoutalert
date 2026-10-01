import { forwardScoutRequest } from "../../../../server/api-client/scout-api";
/** Requests or resends a browser-bound code through the shared identity API. */
export async function POST(request: Request): Promise<Response> {
  return forwardScoutRequest(request, "/v1/identity/code");
}
