"""Install the explicitly allowed runtime files from Secrets Manager JSON on stdin.

Run as root on the deployment host. The input is never logged, evaluated as
shell code, or accepted as a path. Secret files are atomically replaced with
owner-only permissions; the directory must not be included in release archives.
"""

import json
import os
from pathlib import Path
import sys
import tempfile


def install_runtime_files():
    """Validate the complete secret payload before replacing any runtime file."""
    destination = Path("/opt/scoutalert/secrets")
    allowed = {"postgres.env", "temporal.env", "api.env", "web.env", "worker.env", "redis-password"}
    values = json.load(sys.stdin)
    if set(values) != allowed or not all(isinstance(value, str) and value for value in values.values()):
        raise ValueError("Runtime secret must contain exactly the six expected nonempty files")

    destination.mkdir(mode=0o700, parents=True, exist_ok=True)
    destination.chmod(0o700)
    for name, content in values.items():
        descriptor, temporary = tempfile.mkstemp(prefix=".incoming-", dir=destination)
        try:
            with os.fdopen(descriptor, "w", encoding="utf-8") as output:
                output.write(content)
            os.replace(temporary, destination / name)
        finally:
            if os.path.exists(temporary):
                os.unlink(temporary)


if __name__ == "__main__":
    install_runtime_files()
