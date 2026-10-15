const accountPath =
  /\/(?:log[ -]?in|sign[ -]?in|sign[ -]?up|register|registration|subscribe|get-started|author)(?:\/|$)/iu;
const navigationLabel =
  /^(?:log[ -]?in|sign[ -]?in|sign[ -]?up|register|subscribe|privacy(?: policy)?|terms(?: of (?:use|service))?|cookie policy|home|(?:next|previous)(?: job| project| listing| opportunity)?|back(?: to .+)?|view company(?: profile)?|all jobs)$/iu;
const applicationService =
  /\b(?:auto[ -]?apply|job[ -]?copilot|automate (?:my|your) job search)\b/iu;

/** Excludes account/marketing navigation before model or fallback selection, even when an anchor says Apply now. Real job pages containing sign-in instructions remain candidates. */
export function discoveryNavigation(
  url: string,
  title: string | null,
): boolean {
  try {
    const pathname = new URL(url).pathname;
    return (
      accountPath.test(pathname) ||
      navigationLabel.test(title?.trim() ?? "") ||
      applicationService.test(`${pathname} ${title ?? ""}`)
    );
  } catch {
    return true;
  }
}
