import { execFileSync } from "node:child_process";
import { setTimeout } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const services = [
  {
    name: "PostgreSQL",
    setting: "SCOUTALERT_POSTGRES_CONTAINER",
    container: "infrastructure-postgres-1",
    readiness: ["pg_isready"],
  },
  {
    name: "Redis",
    setting: "SCOUTALERT_REDIS_CONTAINER",
    container: "immureg-local-redis",
    readiness: ["redis-cli", "ping"],
  },
  {
    name: "Mailpit",
    setting: "SCOUTALERT_MAILPIT_CONTAINER",
    container: "immureg-e2e-mailpit",
    readiness: ["/mailpit", "readyz"],
  },
];

/** Starts the documented shared containers and waits for native service readiness without changing their data. */
async function startSharedService(service) {
  const container = process.env[service.setting] || service.container;
  console.info(`Starting ${service.name} (${container})…`);

  try {
    execFileSync("docker", ["start", container], { stdio: "inherit" });
  } catch {
    throw new Error(
      `Could not start ${service.name} container "${container}". Ensure it exists, or set ${service.setting} to your existing container name.`,
    );
  }

  const deadline = Date.now() + 60_000;

  while (Date.now() < deadline) {
    try {
      execFileSync("docker", ["exec", container, ...service.readiness], {
        stdio: "pipe",
        timeout: 5_000,
      });
      console.info(`${service.name} is ready.`);

      return;
    } catch {
      await setTimeout(1_000);
    }
  }

  throw new Error(
    `${service.name} was not ready within 60 seconds. Check docker logs ${container}.`,
  );
}

/** Requires a running Docker engine before starting dependencies; failures prevent application startup. */
async function startDevelopmentServices() {
  try {
    execFileSync("docker", ["info", "--format", "{{.ServerVersion}}"], {
      stdio: "pipe",
      timeout: 10_000,
    });
  } catch {
    throw new Error(
      "Docker is unavailable. Start Docker and rerun pnpm dev:start.",
    );
  }

  for (const service of services) {
    await startSharedService(service);
  }

  console.info("Starting Temporal…");
  execFileSync(
    "docker",
    [
      "compose",
      "-p",
      "scoutalert-execution",
      "-f",
      "infrastructure/scouting.compose.yaml",
      "up",
      "-d",
      "--wait",
      "--wait-timeout",
      "60",
    ],
    { cwd: root, stdio: "inherit" },
  );
  console.info("Development services are ready.");
}

try {
  await startDevelopmentServices();
} catch (error) {
  console.error(`Development startup failed: ${error.message}`);
  process.exitCode = 1;
}
