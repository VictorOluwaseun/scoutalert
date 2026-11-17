import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

/** Start ScoutAlert's shared local dependencies and wait for their health checks. */
function startDevelopmentServices() {
  const manager = fileURLToPath(new URL("../../local-infrastructure/manage.py", import.meta.url));
  execFileSync("python3", [manager, "up", "scoutalert"], { stdio: "inherit" });
}

try {
  startDevelopmentServices();
} catch {
  console.error("Development services could not start. Check ../local-infrastructure and Docker.");
  process.exitCode = 1;
}
