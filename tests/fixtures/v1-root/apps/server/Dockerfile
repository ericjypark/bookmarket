# Build stage (runs natively on x86 = fast)
FROM --platform=$BUILDPLATFORM node:20-slim AS builder

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

WORKDIR /app

# Copy dependency manifests first (changes rarely → cached layer)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/eslint-config/package.json packages/eslint-config/
COPY packages/prettier-config/package.json packages/prettier-config/
COPY packages/typescript-config/package.json packages/typescript-config/
COPY apps/server/package.json apps/server/

# Install dependencies with pnpm store cache
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

# Copy source code (changes often → layer after install)
COPY packages packages
COPY apps/server apps/server

# Build
WORKDIR /app/apps/server
RUN pnpm run build

# ARM64 production dependencies (parallel with builder, QEMU only for native modules)
FROM node:20-slim AS arm-deps

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages packages
COPY apps/server/package.json apps/server/

RUN --mount=type=cache,id=pnpm-arm,target=/pnpm/store pnpm install --frozen-lockfile --prod

# Production stage (zero RUN commands = zero QEMU)
FROM node:20-slim AS runner

ENV NODE_ENV=production

WORKDIR /app

COPY --from=arm-deps /app/node_modules ./node_modules
COPY --from=arm-deps /app/packages ./packages
COPY --from=arm-deps /app/apps/server/node_modules ./apps/server/node_modules
COPY --from=builder /app/apps/server/dist ./apps/server/dist
COPY --from=builder /app/apps/server/package.json ./apps/server/package.json
COPY --from=builder /app/package.json ./package.json

WORKDIR /app/apps/server

USER 1001
EXPOSE 8000

CMD ["node", "dist/main"]
