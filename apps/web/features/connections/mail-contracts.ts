export interface MailPage {
  available: boolean;
  account: { id: string; email: string };
  connection: {
    status: "disconnected" | "connected" | "reconnect";
    email: string | null;
    label: { id: string; name: string } | null;
    importing: boolean;
    lastImportedAt: string | null;
    error: string | null;
  };
  items: {
    id: string;
    subject: string;
    sender: string;
    text: string;
    receivedAt: string;
    truncated: boolean;
  }[];
}

/** Narrows private HTTP data before the view renders source content or control state. */
export function parseMailPage(value: unknown): MailPage | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const page = value as MailPage;
  const connection = page.connection;
  if (
    typeof page.available !== "boolean" ||
    typeof page.account?.id !== "string" ||
    typeof page.account?.email !== "string" ||
    !connection ||
    !["disconnected", "connected", "reconnect"].includes(connection.status) ||
    typeof connection.importing !== "boolean" ||
    !nullableText(connection.email) ||
    !nullableText(connection.lastImportedAt) ||
    !nullableText(connection.error)
  ) {
    return null;
  }
  if (
    connection.label !== null &&
    (typeof connection.label?.id !== "string" ||
      typeof connection.label?.name !== "string")
  ) {
    return null;
  }
  if (
    !Array.isArray(page.items) ||
    page.items.length > 20 ||
    !page.items.every(
      (item) =>
        item &&
        typeof item.id === "string" &&
        typeof item.subject === "string" &&
        typeof item.sender === "string" &&
        typeof item.text === "string" &&
        item.text.length <= 16000 &&
        typeof item.truncated === "boolean" &&
        typeof item.receivedAt === "string" &&
        Number.isFinite(Date.parse(item.receivedAt)),
    )
  ) {
    return null;
  }
  return page;
}

/** Checks optional metadata without accepting undefined or arbitrary objects. */
function nullableText(value: unknown): boolean {
  return value === null || typeof value === "string";
}
