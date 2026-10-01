import { forwardScoutRequest } from "@/server/api-client/scout-api";
/** Forwards confirmed controls through cookie-bound session and CSRF checks; Nest validates ownership. */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await context.params;
  return forwardScoutRequest(
    request,
    `/v1/scouts/${encodeURIComponent(id)}/change`,
  );
}
