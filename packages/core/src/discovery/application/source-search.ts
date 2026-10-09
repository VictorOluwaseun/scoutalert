import type { SourceDocumentResult } from "../domain/contracts.js";

/** Builds bounded source-local searches from captured GET controls and public intent; private requirements never enter URLs. */
export function sourceSearchUrls(
  document: SourceDocumentResult,
  target: string,
): string[] {
  const urls: string[] = [];
  for (const form of document.searchForms?.slice(0, 3) ?? []) {
    try {
      const url = new URL(form.action);
      if (
        url.origin !== new URL(document.url).origin ||
        url.protocol !== "https:" ||
        url.username ||
        url.password ||
        url.port ||
        form.parameters.length > 8 ||
        !/^(?:q|query|search|keywords?|searchterm|search_term|search_query|s)$/iu.test(
          form.field,
        )
      ) {
        continue;
      }
      url.search = "";
      for (const [name, value] of form.parameters) {
        if (
          /^(?:category|type|sort|lang|language|location|remote|department)$/iu.test(
            name,
          ) &&
          value.length <= 100
        ) {
          url.searchParams.append(name, value);
        }
      }
      url.searchParams.set(form.field, target);
      url.searchParams.sort();
      if (url.href.length <= 2048) {
        urls.push(url.href);
      }
    } catch {
      // A malformed captured form is a missing access path, never a reason to invent another endpoint.
    }
  }
  return [...new Set(urls)];
}
