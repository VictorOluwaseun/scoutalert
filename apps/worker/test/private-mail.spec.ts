import { describe, expect, it, vi } from "vitest";
import {
  createGmailClient,
  GmailSourceRepository,
  MailSecrets,
  readGmailConfiguration,
} from "@repo/adapters/connections";
import {
  ImportPrivateMail,
  ManageMailConnection,
  type MailConnectionRepository,
  type MailImportClaim,
} from "@repo/core/connections";

const config = {
  clientId: "client-id.apps.googleusercontent.com",
  clientSecret: "synthetic-secret",
  redirectUri: "http://localhost:3030/api/connections/gmail/callback",
  encryptionKey: "a".repeat(64),
};
const scope = "https://www.googleapis.com/auth/gmail.readonly";
const claim: MailImportClaim = {
  ownerId: "owner",
  revision: 1,
  lease: "lease",
  grant: { refreshToken: "synthetic-refresh", email: "test@example.test" },
  labelId: "Label_1",
  after: 1700000000,
  before: 1800000000,
  cursor: null,
};

/** Builds a deterministic, credential-free provider double while keeping the official client factory contract. */
function provider(request = vi.fn()) {
  const client = {
    request,
    setCredentials: vi.fn(),
    getToken: vi.fn(async () => ({
      tokens: {
        access_token: "synthetic-access",
        refresh_token: "synthetic-refresh",
      },
    })),
    getTokenInfo: vi.fn(async () => ({ scopes: [scope] })),
    revokeToken: vi.fn(async () => ({})),
  };
  return {
    source: new GmailSourceRepository(
      () => client as unknown as ReturnType<typeof createGmailClient>,
    ),
    client,
  };
}

/** Constructs a source message with an optional hostile or attachment MIME part. */
function message(payload: unknown, labels = ["Label_1"]) {
  return {
    id: "abc123",
    internalDate: "1750000000000",
    labelIds: labels,
    payload,
  };
}

describe("private Gmail provider and application boundaries", () => {
  it("uses the official OAuth client with readonly offline consent, S256 and exact callback", () => {
    const source = new GmailSourceRepository(() => createGmailClient(config));
    const url = new URL(source.authorization("state", "verifier"));
    expect(url.origin).toBe("https://accounts.google.com");
    expect(url.searchParams.get("scope")).toBe(scope);
    expect(url.searchParams.get("redirect_uri")).toBe(config.redirectUri);
    expect(url.searchParams.get("state")).toBe("state");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("code_challenge")).not.toBe("verifier");
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("include_granted_scopes")).toBe("false");
  });
  it("authenticates encrypted data against its owner and purpose", () => {
    const vault = new MailSecrets(config.encryptionKey);
    const encrypted = vault.seal({ refreshToken: "private" }, "owner-a:grant");
    expect(encrypted).not.toContain("private");
    expect(vault.open(encrypted, "owner-a:grant")).toEqual({
      refreshToken: "private",
    });
    expect(() => vault.open(encrypted, "owner-b:grant")).toThrow();
    expect(() => vault.open(encrypted, "owner-a:message")).toThrow();
    expect(() =>
      new MailSecrets("b".repeat(64)).open(encrypted, "owner-a:grant"),
    ).toThrow();
  });
  it("disables absent settings, rejects partial setup, insecure remote callbacks and reused keys", () => {
    expect(readGmailConfiguration({})).toBeNull();
    expect(() => readGmailConfiguration({ GMAIL_CLIENT_ID: "only" })).toThrow();
    const env = {
      GMAIL_CLIENT_ID: config.clientId,
      GMAIL_CLIENT_SECRET: config.clientSecret,
      GMAIL_REDIRECT_URI: config.redirectUri,
      CONNECTIONS_ENCRYPTION_KEY: config.encryptionKey,
    };
    expect(readGmailConfiguration(env)).toEqual(config);
    expect(() =>
      readGmailConfiguration({ ...env, NODE_ENV: "production" }),
    ).toThrow();
    expect(() =>
      readGmailConfiguration({
        ...env,
        GMAIL_REDIRECT_URI: "http://example.com/api/connections/gmail/callback",
      }),
    ).toThrow();
    expect(() =>
      readGmailConfiguration({ ...env, IDENTITY_SECRET: config.encryptionKey }),
    ).toThrow();
  });
  it("requires granted readonly scope and a refresh grant before saving the actual mailbox identity", async () => {
    const { source, client } = provider(
      vi.fn(async () => ({ data: { emailAddress: "mailbox@example.test" } })),
    );
    expect(await source.exchange("code", "verifier")).toEqual({
      email: "mailbox@example.test",
      refreshToken: "synthetic-refresh",
    });
    expect(client.getToken).toHaveBeenCalledWith({
      code: "code",
      codeVerifier: "verifier",
    });
    client.getTokenInfo.mockResolvedValueOnce({ scopes: [] });
    await expect(source.exchange("code", "verifier")).rejects.toMatchObject({
      code: "reconnect_required",
    });
  });
  it("offers only user-created labels and never widens to Inbox or All Mail", async () => {
    const { source } = provider(
      vi.fn(async () => ({
        data: {
          labels: [
            { id: "INBOX", name: "Inbox", type: "system" },
            { id: "Label_1", name: "ScoutAlert", type: "user" },
          ],
        },
      })),
    );
    expect(await source.labels(claim.grant)).toEqual([
      { id: "Label_1", name: "ScoutAlert" },
    ]);
  });
  it("reads exactly the selected label/window and excludes attachments and hidden HTML scripts", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({
        data: { messages: [{ id: "abc123" }], nextPageToken: "next-page" },
      })
      .mockResolvedValueOnce({ data: { labelIds: ["Label_1"] } })
      .mockResolvedValueOnce({
        data: message({
          mimeType: "multipart/mixed",
          headers: [
            { name: "Subject", value: "Designer wanted" },
            { name: "From", value: "Client" },
          ],
          parts: [
            {
              mimeType: "text/html",
              body: {
                data: Buffer.from(
                  '<p>Looking for a designer</p><script>steal()</script><img src="https://tracker.test">',
                ).toString("base64url"),
              },
            },
            {
              mimeType: "text/plain",
              filename: "private.txt",
              body: {
                attachmentId: "attachment",
                data: Buffer.from("private attachment").toString("base64url"),
              },
            },
          ],
        }),
      });
    const result = await provider(request).source.read(claim);
    expect(request.mock.calls[0]![0].params).toMatchObject({
      labelIds: "Label_1",
      maxResults: 5,
      q: "after:1700000000 before:1800000000 -in:spam -in:trash",
    });
    expect(result.next).toBe("next-page");
    expect(result.items[0]).toMatchObject({
      subject: "Designer wanted",
      text: "Looking for a designer",
      truncated: true,
    });
    expect(request).toHaveBeenCalledTimes(3);
  });
  it("does not fetch a body after the message leaves the selected label", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({ data: { messages: [{ id: "abc123" }] } })
      .mockResolvedValueOnce({ data: { labelIds: ["INBOX"] } });
    expect(await provider(request).source.read(claim)).toEqual({
      items: [],
      next: null,
      skipped: 1,
    });
    expect(request).toHaveBeenCalledTimes(2);
  });
  it("drops messages moved to Trash during a body fetch and truncates oversized text", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({ data: { messages: [{ id: "abc123" }] } })
      .mockResolvedValueOnce({ data: { labelIds: ["Label_1"] } })
      .mockResolvedValueOnce({
        data: message(
          {
            mimeType: "text/plain",
            body: { data: Buffer.from("private").toString("base64url") },
          },
          ["Label_1", "TRASH"],
        ),
      });
    expect((await provider(request).source.read(claim)).items).toEqual([]);
    request
      .mockResolvedValueOnce({ data: { messages: [{ id: "abc123" }] } })
      .mockResolvedValueOnce({ data: { labelIds: ["Label_1"] } })
      .mockResolvedValueOnce({
        data: message({
          mimeType: "text/plain",
          body: { data: Buffer.from("a".repeat(20000)).toString("base64url") },
        }),
      });
    const result = await provider(request).source.read(claim);
    expect(result.items[0]?.text).toHaveLength(16000);
    expect(result.items[0]?.truncated).toBe(true);
  });
  it("maps revoked grants to safe errors without provider headers or raw content", async () => {
    const { source } = provider(
      vi
        .fn()
        .mockRejectedValue({
          response: { status: 400, data: { error: "invalid_grant" } },
          config: { headers: { Authorization: "secret" } },
        }),
    );
    await expect(source.read(claim)).rejects.toMatchObject({
      message: "reconnect_required",
    });
  });
  it("refuses forged labels and uses the provider name when saving a selected label", async () => {
    const records = {
      credentials: vi.fn(async () => ({ grant: claim.grant, revision: 4 })),
      selectLabel: vi.fn(),
    } as unknown as MailConnectionRepository;
    const { source } = provider(
      vi.fn(async () => ({
        data: { labels: [{ id: "Label_1", name: "Real label", type: "user" }] },
      })),
    );
    const app = new ManageMailConnection(records, source);
    await expect(app.select("owner", "INBOX")).rejects.toMatchObject({
      code: "invalid_label",
    });
    await app.select("owner", "Label_1");
    expect(records.selectLabel).toHaveBeenCalledWith("owner", 4, {
      id: "Label_1",
      name: "Real label",
    });
  });
  it("commits local disconnect before remote revocation and reports an unconfirmed provider outcome", async () => {
    const order: string[] = [];
    const records = {
      disconnect: vi.fn(async () => {
        order.push("local");
        return claim.grant;
      }),
    } as unknown as MailConnectionRepository;
    const { source } = provider();
    vi.spyOn(source, "revoke").mockImplementation(async () => {
      order.push("provider");
      return false;
    });
    expect(
      await new ManageMailConnection(records, source).disconnect("owner"),
    ).toEqual({ disconnected: true, providerRevoked: false });
    expect(order).toEqual(["local", "provider"]);
  });
  it("records revoked import failures without putting private input in workflow results", async () => {
    const { source } = provider(
      vi.fn().mockRejectedValue({ response: { status: 401 } }),
    );
    const records = {
      claim: vi.fn(async () => claim),
      fail: vi.fn(),
      complete: vi.fn(),
    } as unknown as MailConnectionRepository;
    expect(await new ImportPrivateMail(records, source).execute()).toBe(true);
    expect(records.fail).toHaveBeenCalledWith(claim, true);
    expect(records.complete).not.toHaveBeenCalled();
  });
});
