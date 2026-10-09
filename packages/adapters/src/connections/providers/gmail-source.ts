import { createHash } from "node:crypto";
import { CodeChallengeMethod, OAuth2Client } from "google-auth-library";
import { z } from "zod";
import {
  MailConnectionError,
  MailSourceRepository,
  type MailBatch,
  type MailGrant,
  type MailImportClaim,
} from "@repo/core/connections";
import { gmailMessage } from "./gmail-message.js";

export const gmailReadonlyScope =
  "https://www.googleapis.com/auth/gmail.readonly";
export interface GmailConfiguration {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  encryptionKey: string;
}

/** Validates optional integration settings without including environment values in failures. */
export function readGmailConfiguration(
  env: Record<string, string | undefined>,
): GmailConfiguration | null {
  const values = [
    env.GMAIL_CLIENT_ID,
    env.GMAIL_CLIENT_SECRET,
    env.GMAIL_REDIRECT_URI,
    env.CONNECTIONS_ENCRYPTION_KEY,
  ].map((v) => v?.trim() ?? "");
  if (values.every((v) => !v)) {
    return null;
  }
  const schema = z.tuple([
    z.string().min(8).max(300),
    z.string().min(8).max(300),
    z.url(),
    z.string().regex(/^[a-f0-9]{64}$/i),
  ]);
  const parsed = schema.safeParse(values);
  if (!parsed.success) {
    throw new Error("Configure all Gmail connection settings together");
  }
  const [clientId, clientSecret, redirectUri, encryptionKey] = parsed.data;
  const url = new URL(redirectUri);
  const local =
    env.NODE_ENV !== "production" &&
    url.protocol === "http:" &&
    ["localhost", "127.0.0.1"].includes(url.hostname);
  if (
    (!local && url.protocol !== "https:") ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/api/connections/gmail/callback" ||
    [env.IDENTITY_SECRET, env.WEB_API_SECRET].includes(encryptionKey)
  ) {
    throw new Error("Invalid Gmail callback or encryption configuration");
  }
  return { clientId, clientSecret, redirectUri, encryptionKey };
}

/** Constructs an official Google OAuth client with bounded transport and no automatic request retries. */
export function createGmailClient(config: GmailConfiguration): OAuth2Client {
  return new OAuth2Client({
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    redirectUri: config.redirectUri,
    transporterOptions: {
      timeout: 8000,
      retry: false,
      maxRedirects: 0,
      maxContentLength: 4 * 1024 * 1024,
      signal: AbortSignal.timeout(30000),
    },
  });
}

/** Implements readonly Gmail access; all provider URLs are fixed and no user-supplied URL is requested. */
export class GmailSourceRepository extends MailSourceRepository {
  /** Receives a per-operation official client factory so grants never leak between accounts. */
  constructor(private readonly clients: () => OAuth2Client) {
    super();
  }

  /** Requests offline readonly access with explicit consent, CSRF state and an S256 PKCE challenge. */
  authorization(state: string, verifier: string): string {
    return this.clients().generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      scope: [gmailReadonlyScope],
      include_granted_scopes: false,
      state,
      code_challenge_method: CodeChallengeMethod.S256,
      code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    });
  }

  /** Checks granted scope, obtains the actual mailbox identity, and retains only an offline refresh grant. */
  async exchange(code: string, verifier: string): Promise<MailGrant> {
    try {
      const client = this.clients();
      const { tokens } = await client.getToken({
        code,
        codeVerifier: verifier,
      });
      if (!tokens.access_token || !tokens.refresh_token) {
        throw new MailConnectionError("reconnect_required");
      }
      const info = await client.getTokenInfo(tokens.access_token);
      if (!info.scopes.includes(gmailReadonlyScope)) {
        throw new MailConnectionError("reconnect_required");
      }
      client.setCredentials(tokens);
      const response = await client.request({
        url: "https://gmail.googleapis.com/gmail/v1/users/me/profile",
        method: "GET",
      });
      const profile = z
        .object({ emailAddress: z.email().max(320) })
        .parse(response.data);
      return {
        refreshToken: tokens.refresh_token,
        email: profile.emailAddress,
      };
    } catch (error) {
      throw safeMailError(error);
    }
  }

  /** Lists user labels only; selecting Inbox or All Mail is deliberately unavailable. */
  async labels(grant: MailGrant): Promise<{ id: string; name: string }[]> {
    try {
      const client = this.client(grant);
      const response = await client.request({
        url: "https://gmail.googleapis.com/gmail/v1/users/me/labels",
        method: "GET",
      });
      const labels = z
        .object({
          labels: z
            .array(
              z.object({
                id: z.string().max(200),
                name: z.string().max(225),
                type: z.enum(["system", "user"]),
              }),
            )
            .max(10000)
            .default([]),
        })
        .parse(response.data);
      return labels.labels
        .filter((label) => label.type === "user")
        .map(({ id, name }) => ({ id, name }))
        .sort((a, b) => a.name.localeCompare(b.name));
    } catch (error) {
      throw safeMailError(error);
    }
  }

  /** Imports at most five messages in one frozen time window; skips moved/deleted messages without widening the query. */
  async read(claim: MailImportClaim): Promise<MailBatch> {
    try {
      const client = this.client(claim.grant);
      const response = await client.request({
        url: "https://gmail.googleapis.com/gmail/v1/users/me/messages",
        method: "GET",
        params: {
          labelIds: claim.labelId,
          q: `after:${claim.after} before:${claim.before} -in:spam -in:trash`,
          maxResults: 5,
          includeSpamTrash: false,
          ...(claim.cursor ? { pageToken: claim.cursor } : {}),
        },
      });
      const page = z
        .object({
          messages: z
            .array(z.object({ id: z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/) }))
            .max(5)
            .default([]),
          nextPageToken: z.string().max(2048).optional(),
        })
        .parse(response.data);
      const items: MailBatch["items"] = [];
      let skipped = 0;
      for (const message of page.messages) {
        const item = await this.message(client, message.id, claim);
        if (!item) {
          skipped++;
          continue;
        }
        items.push(item);
      }
      return { items, next: page.nextPageToken ?? null, skipped };
    } catch (error) {
      throw safeMailError(error);
    }
  }

  /** Revokes using Google's official client after durable local disconnection. */
  async revoke(grant: MailGrant): Promise<boolean> {
    try {
      await this.clients().revokeToken(grant.refreshToken);
      return true;
    } catch {
      return false;
    }
  }

  /** Keeps refresh credentials isolated to one short-lived provider operation. */
  private client(grant: MailGrant): OAuth2Client {
    const client = this.clients();
    client.setCredentials({ refresh_token: grant.refreshToken });
    return client;
  }

  /** Checks label membership from metadata before fetching bodies and rechecks it on the returned full message. */
  private async message(
    client: OAuth2Client,
    id: string,
    claim: MailImportClaim,
  ) {
    const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}`;
    try {
      const meta = await client.request({
        url,
        method: "GET",
        params: { format: "minimal" },
      });
      const labels = z
        .object({ labelIds: z.array(z.string()) })
        .parse(meta.data).labelIds;
      if (
        !labels.includes(claim.labelId) ||
        labels.some((label) => ["SPAM", "TRASH"].includes(label))
      ) {
        return null;
      }
      const full = await client.request({
        url,
        method: "GET",
        params: { format: "full" },
      });
      const parsed = gmailMessage(
        full.data,
        claim.labelId,
        claim.after,
        claim.before,
      );
      return parsed?.id === id ? parsed : null;
    } catch (error) {
      if (providerStatus(error) === 404) {
        return null;
      }
      throw error;
    }
  }
}

/** Extracts only an HTTP status from a provider error; response bodies, request configs and headers remain private. */
function providerStatus(error: unknown): number | null {
  const parsed = z
    .object({ response: z.object({ status: z.number() }) })
    .safeParse(error);
  return parsed.success ? parsed.data.response.status : null;
}

/** Maps denied/expired grants without retaining the original error or its credential-bearing cause. */
function safeMailError(error: unknown): MailConnectionError {
  if (error instanceof MailConnectionError) {
    return error;
  }
  const response = z
    .object({
      response: z.object({ data: z.object({ error: z.string() }).optional() }),
    })
    .safeParse(error);
  const denied =
    providerStatus(error) === 401 ||
    (response.success &&
      response.data.response.data?.error === "invalid_grant");
  return new MailConnectionError(
    denied ? "reconnect_required" : "connection_unavailable",
  );
}
