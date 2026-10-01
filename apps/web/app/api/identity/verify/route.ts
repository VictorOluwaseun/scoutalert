import { forwardScoutRequest } from "../../../../server/api-client/scout-api";
/** Exchanges inbox proof for a session cookie; session secrets never enter client JSON. */
export async function POST(request: Request): Promise<Response> {
  return forwardScoutRequest(request, "/v1/identity/verify", {
    establishSession: true,
  });
}
