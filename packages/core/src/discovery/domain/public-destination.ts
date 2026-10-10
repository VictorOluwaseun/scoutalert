/** Rejects visibly invalid public destinations before routing; adapters still enforce DNS, crawl policy and network admission. */
export function publicDestination(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      value.length <= 2048 &&
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.port &&
      url.hostname.includes(".") &&
      !/(?:^|\.)(?:localhost|local|internal|test)$/iu.test(url.hostname)
    );
  } catch {
    return false;
  }
}
