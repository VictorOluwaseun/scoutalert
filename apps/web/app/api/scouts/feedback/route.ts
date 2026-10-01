import { forwardScoutRequest } from "@/server/api-client/scout-api";
/** Keeps feedback owner and credentials server-only and applies the shared browser mutation checks. */
export async function POST(request: Request): Promise<Response> {
  return forwardScoutRequest(request, "/v1/scouts/feedback");
}
