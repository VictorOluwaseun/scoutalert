# Shared local development services

This Mac uses `../local-infrastructure` for infrastructure shared across projects.
Run the normal development command, or `python3 ../local-infrastructure/manage.py up scoutalert`.
Check services with `python3 ../local-infrastructure/manage.py status`.
Application stop/down commands leave shared dependencies running for other projects.
Explicit whole-stack shutdown: `python3 ../local-infrastructure/manage.py stop-all`.

Private Redis credentials are set in local environment files and the protected
shared state directory. The Docker reset created fresh development databases. The previous
backup archives are in the shared infrastructure directory. Remote database and provider settings remain as configured.

Destructive tests must use disposable containers. Existing Testcontainers and
Immureg's per-run E2E containers remain isolated. Data-I's `test:mongodb` command
now supplies a disposable MongoDB endpoint instead of using the development server.

See `../local-infrastructure/README.md` for service roles, backups and recovery.
