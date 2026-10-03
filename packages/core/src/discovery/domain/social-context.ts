import type { SourceDocumentResult } from "./contracts.js";
import type { NativePost } from "./social-discovery.js";

/** Context is attributed to its own public author; it never becomes primary-post quotation evidence. */
export interface NativeContext {
  complete: boolean;
  bounded: boolean;
  missingIds: string[];
  dependencies: string[];
  posts: {
    id: string;
    url: string;
    authorId: string;
    text: string;
    checkedAt: string;
    relation: "replied_to" | "quoted" | "retweeted" | "conversation";
    depth: number;
  }[];
}

export type NativeDocument = SourceDocumentResult & { nativePost: NativePost };

/** Recognizes legacy shortened captures until a refresh supplies explicit native text-completeness metadata. */
export function nativeTextIsTruncated(document: NativeDocument): boolean {
  return (
    document.nativePost.textTruncated ??
    /(?:…|\.\.\.)\s*https:\/\/t\.co\//u.test(document.text ?? "")
  );
}

/** Enumerates only source-declared parent/quote IDs and the platform's conversation root. */
export function nativeReferences(
  post: NativePost,
): { id: string; type: NativeContext["posts"][number]["relation"] }[] {
  const references = new Map(post.references.map((item) => [item.id, item]));
  const result: {
    id: string;
    type: NativeContext["posts"][number]["relation"];
  }[] = [...references.values()];
  if (
    !post.editIds.includes(post.conversationId) &&
    !references.has(post.conversationId)
  ) {
    result.push({ id: post.conversationId, type: "conversation" });
  }
  return result;
}

/** Resolves at most six related posts across two reference levels; missing, stale, cyclic or oversized context stays incomplete. */
export function buildNativeContext(
  primary: NativeDocument,
  sources: ReadonlyMap<string, NativeDocument>,
  now: Date,
): NativeContext | undefined {
  const queue = nativeReferences(primary.nativePost).map((item) => ({
    ...item,
    depth: 1,
    path: primary.nativePost.editIds,
  }));
  if (!queue.length) {
    return undefined;
  }
  const result: NativeContext = {
    complete: true,
    bounded: false,
    missingIds: [],
    dependencies: [],
    posts: [],
  };
  const visited = new Set(primary.nativePost.editIds);
  while (queue.length > 0) {
    const next = queue.shift()!;
    if (next.path.includes(next.id)) {
      result.bounded = true;
      result.complete = false;
      continue;
    }
    if (visited.has(next.id)) {
      continue;
    }
    if (next.depth > 2 || result.dependencies.length >= 6) {
      result.bounded = true;
      result.complete = false;
      continue;
    }
    visited.add(next.id);
    result.dependencies.push(next.id);
    const source = sources.get(next.id);
    if (
      !source ||
      source.status !== "fetched" ||
      !source.text ||
      Date.parse(source.checkedAt) <= now.getTime() - 24 * 60 * 60_000
    ) {
      result.complete = false;
      result.missingIds.push(next.id);
      continue;
    }
    for (const alias of source.nativePost.editIds) {
      visited.add(alias);
    }
    let text = source.text.slice(0, 2000);
    while (new TextEncoder().encode(text).byteLength > 2000) {
      text = text.slice(0, Math.floor(text.length * 0.9));
    }
    if (text.length < source.text.length || nativeTextIsTruncated(source)) {
      result.complete = false;
      result.bounded = true;
    }
    result.posts.push({
      id: source.nativePost.id,
      url: source.url,
      authorId: source.nativePost.authorId,
      text,
      checkedAt: source.checkedAt,
      relation: next.type,
      depth: next.depth,
    });
    for (const item of nativeReferences(source.nativePost)) {
      queue.push({
        ...item,
        depth: next.depth + 1,
        path: [...next.path, ...source.nativePost.editIds],
      });
    }
  }
  return result;
}
