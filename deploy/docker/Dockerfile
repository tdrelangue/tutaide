# Tutellia — organisation server image (TUTELLIA_MODE=server).
# Build from web/:  docker build -f deploy/docker/Dockerfile -t tutellia-server:<version> .
# No secret is ever baked in: .env is excluded (.dockerignore) and the server's
# secrets are generated at install time (deploy/server/init.*).

FROM node:22-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY prisma ./prisma
# --ignore-scripts: skip the desktop-only postinstall steps; Prisma is generated explicitly.
RUN npm ci --ignore-scripts && npx prisma generate

FROM deps AS build
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1 TUTELLIA_SKIP_ENV=1
RUN npx next build && node scripts/prepare-standalone.mjs

FROM node:22-bookworm-slim AS runner
ARG PRISMA_VERSION=6.19.2
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && npm install -g "prisma@${PRISMA_VERSION}" && npm cache clean --force
WORKDIR /app
ARG TUTELLIA_VERSION=dev
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    TUTELLIA_MODE=server \
    TUTELLIA_STORAGE_DIR=/data/documents \
    TUTELLIA_VERSION=${TUTELLIA_VERSION} \
    PORT=3000 \
    HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/prisma ./prisma
COPY --chown=node:node deploy/docker/entrypoint.sh deploy/docker/setup.mjs ./
RUN chmod +x entrypoint.sh && mkdir -p /data/documents && chown -R node:node /data
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["./entrypoint.sh"]
