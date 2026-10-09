import { convert } from "html-to-text";
import { z } from "zod";
import type { PrivateMailItem } from "@repo/core/connections";

const messageSchema = z.object({
  id: z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/),
  internalDate: z.string().regex(/^\d{10,16}$/),
  labelIds: z.array(z.string()).max(1000),
  payload: z.unknown(),
});
const partSchema = z.object({
  mimeType: z.string().max(200).optional(),
  filename: z.string().optional(),
  headers: z
    .array(z.object({ name: z.string(), value: z.string() }))
    .optional(),
  body: z
    .object({
      data: z.string().optional(),
      attachmentId: z.string().optional(),
      size: z.number().optional(),
    })
    .optional(),
  parts: z.array(z.unknown()).optional(),
});

/** Parses untrusted provider MIME into bounded plain text without fetching attachments, images or message links. */
export function gmailMessage(
  value: unknown,
  labelId: string,
  after: number,
  before: number,
): PrivateMailItem | null {
  const parsed = messageSchema.safeParse(value);
  if (!parsed.success) {
    return null;
  }
  const message = parsed.data;
  const time = Number(message.internalDate);
  if (
    !message.labelIds.includes(labelId) ||
    message.labelIds.some((id) => ["SPAM", "TRASH"].includes(id)) ||
    !Number.isFinite(time) ||
    time < after * 1000 ||
    time >= before * 1000
  ) {
    return null;
  }
  const root = partSchema.safeParse(message.payload);
  if (!root.success) {
    return null;
  }
  const pending: { value: unknown; depth: number }[] = [
    { value: message.payload, depth: 0 },
  ];
  const plain: string[] = [];
  const html: string[] = [];
  let truncated = false;
  let visited = 0;
  while (pending.length && visited < 50) {
    const next = pending.shift()!;
    visited++;
    const result = partSchema.safeParse(next.value);
    if (!result.success || next.depth > 8) {
      truncated = true;
      continue;
    }
    const part = result.data;
    if (
      part.filename ||
      part.body?.attachmentId ||
      part.mimeType === "message/rfc822"
    ) {
      truncated = true;
      continue;
    }
    const data = part.body?.data;
    const destination =
      part.mimeType === "text/plain"
        ? plain
        : part.mimeType === "text/html"
          ? html
          : null;
    if (data && destination) {
      const bounded = data.slice(0, 88000);
      truncated ||= bounded.length < data.length;
      destination.push(Buffer.from(bounded, "base64url").toString("utf8"));
    }
    pending.push(
      ...(part.parts ?? [])
        .slice(0, 50)
        .map((value) => ({ value, depth: next.depth + 1 })),
    );
    truncated ||= (part.parts?.length ?? 0) > 50;
  }
  truncated ||= pending.length > 0;
  const text = plain.length
    ? plain.join("\n\n")
    : convert(html.join("\n").slice(0, 100000), {
        wordwrap: false,
        selectors: [
          { selector: "img", format: "skip" },
          { selector: "script", format: "skip" },
          { selector: "style", format: "skip" },
        ],
        limits: { maxInputLength: 100000, maxDepth: 20 },
      });
  if (!text.trim()) {
    return null;
  }
  const headers = root.data.headers ?? [];
  return {
    id: message.id,
    subject: (
      headers.find((h) => h.name.toLowerCase() === "subject")?.value ??
      "Untitled email"
    ).slice(0, 300),
    sender: (
      headers.find((h) => h.name.toLowerCase() === "from")?.value ??
      "Unknown sender"
    ).slice(0, 320),
    text: text.slice(0, 16000),
    receivedAt: new Date(time).toISOString(),
    truncated: truncated || text.length > 16000,
  };
}
