"""Publish a digest-pinned application release and wait for its SSM result."""

import hashlib
import json
import os
from pathlib import Path
import re
import shlex
import subprocess
import sys
import tempfile
import time


def aws(*arguments):
    """Run AWS CLI with inherited short-lived credentials; raise on API errors."""
    return subprocess.run(
        ["aws", *arguments], check=True, capture_output=True, text=True
    ).stdout


def stack_outputs(path):
    """Read only the deployment resource identifiers from DescribeStacks output."""
    outputs = {
        item["OutputKey"]: item["OutputValue"]
        for item in json.loads(Path(path).read_text())["Stacks"][0]["Outputs"]
    }
    required = ("InstanceId", "ArtifactBucket", "ApiRepository", "WebRepository", "WorkerRepository")
    return {key: outputs[key] for key in required}


def release_environment(outputs, environment):
    """Reject mutable tags or images outside the stack's three repositories."""
    lines = []
    for service in ("API", "WEB", "WORKER"):
        reference = environment[f"{service}_IMAGE"]
        repository = outputs[f"{service.title()}Repository"]
        if not re.fullmatch(re.escape(repository) + r"@sha256:[0-9a-f]{64}", reference):
            raise ValueError(f"Invalid immutable {service} image")
        lines.append(f"SCOUTALERT_{service}_IMAGE={reference}")
    return "\n".join(lines) + "\n"


def wait_for_command(command_id, instance_id, timeout=1320):
    """Wait beyond SSM's execution deadline; propagate terminal failures without logging secrets."""
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            result = json.loads(aws(
                "ssm", "get-command-invocation", "--command-id", command_id,
                "--instance-id", instance_id, "--output", "json",
            ))
        except subprocess.CalledProcessError as error:
            if "InvocationDoesNotExist" not in error.stderr:
                raise
            time.sleep(10)
            continue
        status = result["Status"]
        if status == "Success" and result.get("ResponseCode") == 0:
            return
        if status not in ("Pending", "InProgress", "Delayed"):
            raise RuntimeError(f"Deployment {command_id} ended with {status}; inspect SSM output.")
        time.sleep(10)
    raise TimeoutError(f"SSM command {command_id} is unresolved; inspect it before another release.")


def deploy(outputs, environment):
    """Upload a unique release, verify its files on EC2, then run the host deployment."""
    release_id = "-".join(environment[key] for key in ("GITHUB_SHA", "GITHUB_RUN_ID", "GITHUB_RUN_ATTEMPT"))
    if not re.fullmatch(r"[0-9a-f]{40}-[0-9]+-[0-9]+", release_id):
        raise ValueError("Invalid GitHub release identifier")
    manifest = release_environment(outputs, environment)
    script = Path(__file__).with_name("deploy.sh")
    prefix = f"s3://{outputs['ArtifactBucket']}/releases/github/{release_id}"
    remote_dir = f"/opt/scoutalert/releases/{release_id}"
    commands = ["set -eu", "umask 077", f"mkdir -p {shlex.quote(remote_dir)}", f"cd {shlex.quote(remote_dir)}"]
    with tempfile.TemporaryDirectory() as directory:
        manifest_path = Path(directory) / "images.env"
        manifest_path.write_text(manifest)
        for path in (script, manifest_path):
            uri = f"{prefix}/{path.name}"
            aws("s3", "cp", str(path), uri, "--sse", "AES256", "--only-show-errors")
            commands.append(f"aws s3 cp {shlex.quote(uri)} {path.name} --region {shlex.quote(environment['AWS_REGION'])} --only-show-errors")
            checksum = hashlib.sha256(path.read_bytes()).hexdigest()
            commands.append(f"echo '{checksum}  {path.name}' | sha256sum --check --status")
    commands.append(f"bash ./deploy.sh {shlex.quote(remote_dir + '/images.env')}")
    response = json.loads(aws(
        "ssm", "send-command", "--instance-ids", outputs["InstanceId"],
        "--document-name", "AWS-RunShellScript", "--timeout-seconds", "60",
        "--comment", f"ScoutAlert {release_id}",
        "--parameters", json.dumps({"commands": ["\n".join(commands)], "executionTimeout": ["1200"]}),
        "--output", "json",
    ))
    command_id = response["Command"]["CommandId"]
    print(f"Deployment command: {command_id}", flush=True)
    wait_for_command(command_id, outputs["InstanceId"])
    print(f"Production healthy at release {release_id}")
    summary = environment.get("GITHUB_STEP_SUMMARY")
    if summary:
        with open(summary, "a") as output:
            output.write(f"Deployed `{environment['GITHUB_SHA']}` to https://scoutalert.app.\n\nSSM command: `{command_id}`\n")


def main():
    """Expose resource discovery and release publishing as separate workflow steps."""
    outputs = stack_outputs(sys.argv[2])
    if sys.argv[1] == "outputs":
        for key, value in outputs.items():
            print(f"{key}={value}")
        return
    if sys.argv[1] != "deploy":
        raise ValueError("Expected outputs or deploy")
    deploy(outputs, os.environ)


if __name__ == "__main__":
    main()
