# Deployment on push to main

`.github/workflows/deploy.yml` builds API, web and worker ARM64 images on a
GitHub-hosted runner, pushes them to the existing private ECR repositories,
then deploys their immutable digests to the existing EC2 host through SSM.
Every push to `main` triggers it; Actions also supports a manual run on `main`.
There are no path filters. A superseded commit is skipped before deployment.

## One-time AWS setup

The workflow needs `AWS_DEPLOY_ROLE_ARN`, a repository Actions **variable**.
It uses OIDC, so no AWS access keys or application secrets belong in GitHub.
The role can push only the three application repositories, write release
artifacts, describe the production stack, and run commands on the one host.
SSM execution is root-level deployment access on that host; protect writes
to `main` accordingly.

Setup completed on 21 November 2026. Stack `scoutalert-github-deploy` is
`CREATE_COMPLETE` in `eu-north-1`, and repository variable `AWS_DEPLOY_ROLE_ARN`
is set to
`arn:aws:iam::109837541388:role/scoutalert-github-deploy-DeployRole-LTVSg4ZTX26Y`.
The live role's trust policy matches the main-only subject below. The earlier
IAM access restriction no longer blocks this setup.

Production preflight passed: all seven services are running, API/web/PostgreSQL/
Redis report healthy, required deployment files exist, HTTPS succeeds through
the local Caddy edge, and the host has 23 GiB free. The workflow still needs to
be committed and pushed to `main`; its first successful Actions run is the
remaining end-to-end verification.

The following is the setup reference for recreating this access in a fresh
account or stack. Do not rerun the CREATE change set against the existing stack.

1. Check whether IAM already has the provider
   `arn:aws:iam::109837541388:oidc-provider/token.actions.githubusercontent.com`.
   If present, pass that ARN as `ExistingOidcProviderArn` below. Otherwise omit
   that parameter so this stack creates the provider.
2. Create a CloudFormation change set in `eu-north-1` using
   `github-deploy.yaml`, inspect the proposed IAM resources, then execute it:

   ```sh
   aws cloudformation create-change-set \
     --region eu-north-1 \
     --stack-name scoutalert-github-deploy \
     --change-set-name enable-main-deployment \
     --change-set-type CREATE \
     --template-body file://infrastructure/production/github-deploy.yaml \
     --capabilities CAPABILITY_IAM
   aws cloudformation wait change-set-create-complete \
     --region eu-north-1 --stack-name scoutalert-github-deploy \
     --change-set-name enable-main-deployment
   aws cloudformation describe-change-set \
     --region eu-north-1 --stack-name scoutalert-github-deploy \
     --change-set-name enable-main-deployment
   aws cloudformation execute-change-set \
     --region eu-north-1 --stack-name scoutalert-github-deploy \
     --change-set-name enable-main-deployment
   aws cloudformation wait stack-create-complete \
     --region eu-north-1 --stack-name scoutalert-github-deploy
   ```

   To reuse an existing provider, add
   `--parameters ParameterKey=ExistingOidcProviderArn,ParameterValue=arn:aws:iam::109837541388:oidc-provider/token.actions.githubusercontent.com`
   to `create-change-set`. This is a separate stack; it does not update the
   production EC2 instance, its runtime secrets, or its databases.

3. Save the resulting role ARN in GitHub:

   ```sh
   deploy_role_arn=$(aws cloudformation describe-stacks \
     --region eu-north-1 --stack-name scoutalert-github-deploy \
     --query 'Stacks[0].Outputs[?OutputKey==`DeployRoleArn`].OutputValue | [0]' \
     --output text)
   gh variable set AWS_DEPLOY_ROLE_ARN --repo VictorOluwaseun/scoutalert \
     --body "$deploy_role_arn"
   ```

The repository currently uses GitHub's immutable OIDC subject format, verified
through `GET /repos/VictorOluwaseun/scoutalert/actions/oidc/customization/sub`:
`repo:VictorOluwaseun@43085886/scoutalert@1393838694:ref:refs/heads/main`.
The role trusts that exact subject and audience `sts.amazonaws.com`. Do not add
a GitHub environment to the job without updating the trust policy, because it
changes the subject. See [GitHub's OIDC reference](https://docs.github.com/en/actions/reference/security/oidc).

## Release behavior

The workflow serializes releases and does not cancel an in-progress release.
The host also takes a lock. Images use commit/run/attempt tags so reruns work
with immutable ECR tags; the host receives digest references. Uploaded files
have SHA-256 checks checked before execution.

The initialized, full-beta host must already have `/opt/scoutalert/compose.yaml`,
`.env`, `host.env`, `backup.sh`, and runtime secret files. The API, web, Caddy,
PostgreSQL, Redis and Temporal must be running. This workflow does not launch
the beta from website-only mode or provision a fresh server.

Before downtime, the host validates the release, pulls images, and requires a
successful database backup. It records whether the worker was running, stops
it if necessary, stops API/web, runs application migrations, and starts the new
API/web images. A previously running worker is restarted; a paused worker stays
paused. The worker must emit its all-queues startup marker with zero restarts.
API/web health checks and an HTTPS request through Caddy must pass before SSM
and the GitHub job report success. This single-host sequence causes brief
downtime while migrations and startup run.

The host's runtime secrets, provider budgets, Compose configuration and data
services are not changed. Infrastructure changes (including Compose, Caddy,
Temporal schema and secret changes) still require an explicit host rollout.
Application database migrations ship in the API image and run automatically.

## Failures and recovery

Pull or backup failures leave running services alone. After downtime starts,
deployment errors attempt to restore the preceding application image settings
and restart the previous services. The GitHub run stays failed, even if recovery
works. Database migrations are never automatically reversed: use backward
compatible expand/contract migrations so the old application remains usable.

Check the Actions log for the SSM command ID, then its invocation output for
the failing step. Cancellation or SSM timeout can interrupt recovery; verify
the command and host status before retrying. Each release retains `previous.env`
and `candidate.env` in `/opt/scoutalert/releases/<commit>-<run>-<attempt>/`.
`/opt/scoutalert/current-release` records the last successful release. These
files contain image references and existing host settings, not copied runtime
secret files.

Retain enough disk space for current and new images. Image cleanup and ECR
retention remain an operational task; this workflow does not remove recovery
images or database volumes. Rerun the current `main` workflow to retry a failure;
revert a bad application change on `main` and push to produce a new release.

## Local validation

```sh
bash -n infrastructure/production/deploy.sh
python3 -m unittest discover -s infrastructure/production -p 'test_*.py'
```

Tests use disposable host directories and command doubles: they cover image
validation, backup/downtime ordering, paused workers, migration and health-check
failures, image restoration, and SSM terminal states. They make no cloud or
provider requests. The first actual Actions run remains the end-to-end check.
