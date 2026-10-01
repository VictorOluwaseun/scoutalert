import { forwardScoutRequest } from "../../../server/api-client/scout-api";

/** Forwards bounded scout listing through trusted cookie context; the API enforces account ownership. */
export async function GET(request: Request): Promise<Response> {
  const query = new URL(request.url).search;
  return forwardScoutRequest(request, `/v1/scouts${query}`);
}
