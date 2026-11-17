# syntax=docker/dockerfile:1.7
# Build from the repository root. Secrets are injected only when containers run.
FROM node:24-bookworm-slim AS dependencies
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /workspace
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ ca-certificates && \
    rm -rf /var/lib/apt/lists/*
RUN npm install --global pnpm@11.25.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/core/package.json packages/core/package.json
COPY packages/adapters/package.json packages/adapters/package.json
COPY packages/workflows/package.json packages/workflows/package.json
COPY packages/ui/package.json packages/ui/package.json
COPY packages/typescript-config/package.json packages/typescript-config/package.json
COPY packages/eslint-config/package.json packages/eslint-config/package.json
RUN --mount=type=cache,id=scoutalert-pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --store-dir=/pnpm/store

FROM dependencies AS application-build
COPY . .
RUN pnpm --filter api... --filter worker... -r build
RUN --mount=type=cache,id=scoutalert-pnpm,target=/pnpm/store \
    pnpm --filter api deploy --legacy --prod /release/api --store-dir=/pnpm/store
RUN --mount=type=cache,id=scoutalert-pnpm,target=/pnpm/store \
    pnpm --filter worker deploy --legacy --prod /release/worker --store-dir=/pnpm/store

FROM dependencies AS web-build
COPY . .
RUN pnpm --filter web build

FROM node:24-bookworm-slim AS api
ENV NODE_ENV=production
WORKDIR /app
COPY --from=application-build --chown=node:node /release/api ./
USER node
EXPOSE 4040
CMD ["node", "dist/main.js"]

FROM node:24-bookworm-slim AS worker
ENV NODE_ENV=production
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
WORKDIR /app
COPY --from=application-build --chown=node:node /release/worker ./
RUN node -e 'const {createRequire}=require("node:module"); const {dirname,join}=require("node:path"); const adapters=createRequire(require.resolve("@repo/adapters/discovery")); require("node:child_process").execFileSync(process.execPath,[join(dirname(adapters.resolve("playwright/package.json")),"cli.js"),"install","--with-deps","chromium","--only-shell"],{stdio:"inherit"});' && \
    rm -rf /var/lib/apt/lists/*
USER node
CMD ["node", "dist/main.js"]

FROM node:24-bookworm-slim AS web
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3030
WORKDIR /app
COPY --from=web-build --chown=node:node /workspace/apps/web/.next/standalone ./
COPY --from=web-build --chown=node:node /workspace/apps/web/.next/static ./apps/web/.next/static
COPY --from=web-build --chown=node:node /workspace/apps/web/public ./apps/web/public
USER node
EXPOSE 3030
CMD ["node", "apps/web/server.js"]
