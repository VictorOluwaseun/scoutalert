import { Parser } from "htmlparser2";
import type { SourceDocumentResult } from "@repo/core/discovery";
import { canonicalDiscoveryUrl } from "../persistence/discovery-identities.js";

type SearchForm = NonNullable<SourceDocumentResult["searchForms"]>[number];
const searchName =
  /^(?:q|query|search|keywords?|searchterm|search_term|search_query|s)$/iu;
const filterName =
  /^(?:category|type|sort|lang|language|location|remote|department)$/iu;

/** Captures up to three observed same-origin GET searches; credentials, arbitrary hidden fields and action forms are excluded. */
export function documentSearchForms(
  html: string,
  source: string,
): SearchForm[] {
  const forms: SearchForm[] = [];
  let current: SearchForm | null = null;
  let fields = 0;
  let invalid = false;
  const parser = new Parser({
    /** Uses only an explicit GET method/default and an observed action on the same public origin. */
    onopentag(name, attributes) {
      if (name === "form") {
        current = null;
        fields = 0;
        invalid = false;
        const action = resolveAction(attributes.action ?? source, source);
        current =
          (attributes.method ?? "get").toLowerCase() === "get" &&
          action &&
          forms.length < 3 &&
          attributes.hidden === undefined &&
          attributes["aria-hidden"] !== "true"
            ? { action, field: "", parameters: [] }
            : null;
        return;
      }
      if (!current || name !== "input" || attributes.disabled !== undefined) {
        return;
      }
      const type = (attributes.type ?? "text").toLowerCase();
      const field = attributes.name ?? "";
      if (
        ["password", "email", "file"].includes(type) ||
        /token|csrf|auth|session/iu.test(field)
      ) {
        invalid = true;
        return;
      }
      if (["text", "search"].includes(type) && searchName.test(field)) {
        fields += 1;
        current.field = field;
        return;
      }
      if (
        type === "hidden" &&
        filterName.test(field) &&
        (attributes.value ?? "").length <= 100
      ) {
        current.parameters.push([field, attributes.value ?? ""]);
        return;
      }
      if (
        attributes.required !== undefined &&
        !["submit", "button"].includes(type)
      ) {
        invalid = true;
      }
    },
    /** Emits only an unambiguous search field with bounded fixed filters. */
    onclosetag(name) {
      if (name !== "form") {
        return;
      }
      if (
        current &&
        fields === 1 &&
        !invalid &&
        current.parameters.length <= 8
      ) {
        forms.push(current);
      }
      current = null;
    },
  });
  parser.end(html);
  return forms;
}

/** Rejects cross-origin or action-like endpoints; query values must come from named successful GET controls. */
function resolveAction(action: string, source: string): string | null {
  try {
    const url = new URL(action, source);
    if (
      url.origin !== new URL(source).origin ||
      /(?:login|logout|sign.?in|subscribe|delete|apply|submit|payment|checkout)/iu.test(
        url.pathname,
      )
    ) {
      return null;
    }
    url.search = "";
    return canonicalDiscoveryUrl(url.href);
  } catch {
    return null;
  }
}
