import { forwardScoutRequest } from "../../../../server/api-client/scout-api";
/** Revokes the shared account session before clearing its browser cookie. */
export async function POST(request: Request): Promise<Response> {
  return forwardScoutRequest(request, "/v1/identity/logout", { logout: true });
}
