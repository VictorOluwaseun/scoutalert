"""Exercise deployment failure boundaries with isolated command doubles, never AWS."""

import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

DIRECTORY = Path(__file__).parent
SPEC = importlib.util.spec_from_file_location("publish_release", DIRECTORY / "publish-release.py")
publisher = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(publisher)
REGISTRY = "109837541388.dkr.ecr.eu-north-1.amazonaws.com/scoutalert"

# Executed in a separate process to test actual shell control flow and ERR traps.
COMMAND_DOUBLE = r'''
import json
import os
from pathlib import Path
import sys

arguments = sys.argv[1:]
name = Path(sys.argv[0]).name
root = Path(os.environ["SCOUTALERT_DEPLOY_DIR"])
with (root / "commands.jsonl").open("a") as output:
    output.write(json.dumps([name, *arguments]) + "\n")
failure = os.environ.get("DEPLOY_TEST_FAILURE", "")
matches = {
    "pull": "pull" in arguments,
    "migrate": "run" in arguments and "migrate" in arguments,
    "health": "up" in arguments and "--wait" in arguments,
    "edge": name == "curl",
    "worker": name == "timeout",
}
marker = root / "failure-triggered"
if matches.get(failure, False) and not marker.exists():
    marker.touch()
    sys.exit(1)
if name == "docker" and arguments[0] == "login":
    sys.stdin.read()
if name == "docker" and "ps" in arguments:
    service = arguments[-1]
    paused = service == "worker" and os.environ.get("DEPLOY_TEST_WORKER") == "paused"
    print("" if paused else f"container-{service}")
if name == "docker" and arguments[0] == "inspect":
    print("true 0")
if name == "aws":
    print("test-only-password")
'''


class HostDeploymentTests(unittest.TestCase):
    """Verify release replacement, downtime ordering, and recovery without containers."""

    def setUp(self):
        """Create a disposable host directory with command doubles on PATH."""
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        self.bin = self.root / "bin"
        self.bin.mkdir()
        for command in ("docker", "aws", "curl", "flock", "timeout"):
            path = self.bin / command
            path.write_text(f"#!{sys.executable}\n" + COMMAND_DOUBLE)
            path.chmod(0o755)
        self.original = "SCOUTALERT_HOST=scoutalert.app\nKEEP_SETTING=yes\n" + "".join(
            f"SCOUTALERT_{service.upper()}_IMAGE={REGISTRY}/{service}:previous\n"
            for service in ("api", "web", "worker")
        )
        (self.root / ".env").write_text(self.original)
        (self.root / "host.env").write_text("AWS_REGION=eu-north-1\n")
        (self.root / "compose.yaml").touch()
        (self.root / "backup.sh").write_text(
            '#!/bin/bash\nprintf \'["backup"]\\n\' >> commands.jsonl\n'
            'test "${DEPLOY_TEST_FAILURE:-}" != backup\n'
        )
        self.release = self.root / "release"
        self.release.mkdir()
        self.manifest = self.release / "images.env"
        self.manifest.write_text("".join(
            f"SCOUTALERT_{service.upper()}_IMAGE={REGISTRY}/{service}@sha256:{'a' * 64}\n"
            for service in ("api", "web", "worker")
        ))

    def run_release(self, failure="", worker="running"):
        """Execute the real host script and return its status and command trace."""
        result = subprocess.run(
            ["bash", str(DIRECTORY / "deploy.sh"), str(self.manifest)],
            env={**os.environ, "PATH": f"{self.bin}:{os.environ['PATH']}",
                 "SCOUTALERT_DEPLOY_DIR": str(self.root), "DEPLOY_TEST_FAILURE": failure,
                 "DEPLOY_TEST_WORKER": worker},
            capture_output=True, text=True,
        )
        log = self.root / "commands.jsonl"
        commands = [json.loads(line) for line in log.read_text().splitlines()] if log.exists() else []
        return result, commands

    def test_success_preserves_settings_and_orders_backup_before_downtime(self):
        """Only image settings change, with backup before stopping services and migrations before startup."""
        result, commands = self.run_release()
        self.assertEqual(result.returncode, 0, result.stderr)
        environment = (self.root / ".env").read_text()
        self.assertIn("KEEP_SETTING=yes", environment)
        self.assertEqual(environment.count("@sha256:"), 3)
        backup = commands.index(["backup"])
        stop = next(index for index, command in enumerate(commands) if "stop" in command)
        migrate = next(index for index, command in enumerate(commands) if "migrate" in command)
        start = next(index for index, command in enumerate(commands) if "up" in command)
        self.assertLess(backup, stop)
        self.assertLess(stop, migrate)
        self.assertLess(migrate, start)
        self.assertTrue((self.root / "current-release").exists())

    def test_paused_worker_stays_paused(self):
        """Deploying application images must not enable a previously stopped worker."""
        result, commands = self.run_release(worker="paused")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertFalse(any("worker" in command and ("up" in command or "stop" in command) for command in commands))

    def test_failures_after_downtime_restore_previous_images(self):
        """A failed migration, application health check, or TLS check must fail and recover images."""
        for failure in ("migrate", "health", "worker", "edge"):
            with self.subTest(failure=failure):
                (self.root / ".env").write_text(self.original)
                (self.root / "failure-triggered").unlink(missing_ok=True)
                (self.root / "commands.jsonl").unlink(missing_ok=True)
                result, commands = self.run_release(failure=failure)
                self.assertNotEqual(result.returncode, 0)
                self.assertEqual((self.root / ".env").read_text(), self.original)
                self.assertIn("restoring previous", result.stderr)
                self.assertTrue(any("up" in command and "worker" in command for command in commands))
                self.assertFalse((self.root / "current-release").exists())

    def test_preflight_failures_do_not_stop_services(self):
        """Image pull and backup failures must leave production running with its existing references."""
        for failure in ("pull", "backup"):
            with self.subTest(failure=failure):
                (self.root / "failure-triggered").unlink(missing_ok=True)
                (self.root / "commands.jsonl").unlink(missing_ok=True)
                result, commands = self.run_release(failure=failure)
                self.assertNotEqual(result.returncode, 0)
                self.assertFalse(any("stop" in command for command in commands))
                self.assertEqual((self.root / ".env").read_text(), self.original)

    def test_mutable_image_is_rejected_before_docker_commands(self):
        """An invalid manifest cannot mutate production containers."""
        self.manifest.write_text(self.manifest.read_text().replace("@sha256:" + "a" * 64, ":latest"))
        result, commands = self.run_release()
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(any(command[0] == "docker" for command in commands))


class ReleasePublisherTests(unittest.TestCase):
    """Verify immutable image validation and SSM status handling on the CI side."""

    def test_wrong_repository_and_mutable_tags_are_rejected(self):
        """A release cannot substitute another repository or mutable image tag."""
        outputs = {f"{name.title()}Repository": f"{REGISTRY}/{name}" for name in ("api", "web", "worker")}
        environment = {f"{name.upper()}_IMAGE": f"{REGISTRY}/{name}@sha256:{'a' * 64}" for name in ("api", "web", "worker")}
        self.assertEqual(publisher.release_environment(outputs, environment).count("@sha256:"), 3)
        for invalid in (f"{REGISTRY}/api:latest", f"{REGISTRY}/web@sha256:{'a' * 64}"):
            with self.assertRaises(ValueError):
                publisher.release_environment(outputs, {**environment, "API_IMAGE": invalid})

    def test_wait_handles_eventual_consistency_and_success(self):
        """SSM may not expose an invocation immediately after accepting the command."""
        missing = subprocess.CalledProcessError(1, "aws", stderr="InvocationDoesNotExist")
        with patch.object(publisher, "aws", side_effect=[missing, '{"Status":"InProgress"}', '{"Status":"Success","ResponseCode":0}']), patch.object(publisher.time, "sleep"):
            publisher.wait_for_command("command", "instance")

    def test_terminal_failures_are_not_reported_as_success(self):
        """All unsuccessful terminal states stop the workflow, including inconsistent success responses."""
        for status in ("Failed", "Cancelled", "TimedOut", "Success"):
            with self.subTest(status=status), patch.object(publisher, "aws", return_value=json.dumps({"Status": status, "ResponseCode": 1})):
                with self.assertRaises(RuntimeError):
                    publisher.wait_for_command("command", "instance")

    def test_unresolved_command_times_out(self):
        """A missing final SSM result must leave the deployment visibly unsuccessful."""
        with self.assertRaises(TimeoutError):
            publisher.wait_for_command("command", "instance", timeout=0)


if __name__ == "__main__":
    unittest.main()
