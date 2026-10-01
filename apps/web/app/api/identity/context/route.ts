import { identityContext } from "../../../../server/api-client/scout-api";

/** Restores identity only from server records and initializes a browser-bound CSRF token. */
export async function GET(request: Request): Promise<Response> {
  return identityContext(request);
}
