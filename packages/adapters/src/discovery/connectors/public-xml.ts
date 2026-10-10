import { Parser } from "htmlparser2";

/** Rejects external-entity declarations, broken nesting and excessive parser work before building a small DOM. */
export function checkPublicXml(body: string, kind: "feed" | "sitemap"): void {
  if (
    Buffer.byteLength(body, "utf8") > 2_000_000 ||
    /<!\s*(?:DOCTYPE|ENTITY)\b/iu.test(body) ||
    /<\?xml[^?]*encoding\s*=\s*["'](?!utf-8["']|us-ascii["'])/iu.test(body)
  ) {
    throw new Error(`source_${kind}_invalid`);
  }
  let depth = 0;
  let count = 0;
  const selfClosing: boolean[] = [];
  const parser = new Parser(
    {
      /** Bounds element count and depth so hostile XML cannot create an unbounded tree or recursive traversal. */
      onopentag() {
        depth++;
        count++;
        selfClosing.push(body[parser.endIndex - 1] === "/");
        if (depth > 24 || count > 20_000) {
          throw new Error(`source_${kind}_limit`);
        }
      },
      /** Accepts explicit self-closing syntax; parser repair and end-of-input closures remain incomplete XML. */
      onclosetag(_name, implied) {
        depth--;
        const explicit = selfClosing.pop();
        if (implied && !explicit) {
          throw new Error(`source_${kind}_invalid`);
        }
      },
      /** Prevents text outside the XML root from being silently ignored. */
      ontext(text) {
        if (depth === 0 && text.trim()) {
          throw new Error(`source_${kind}_invalid`);
        }
      },
    },
    { xmlMode: true },
  );
  parser.end(body);
}
