# Build stage
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
COPY apps/web/package.json apps/web/

# Install dependencies with pnpm store cache
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

# Copy source code (changes often → layer after install)
COPY packages packages
COPY apps/web apps/web

# Build args for Next.js client-side env vars (baked at build time)
ARG NEXT_PUBLIC_BASE_URL
ARG NEXT_PUBLIC_GOOGLE_CLIENT_ID
ARG NEXT_PUBLIC_GITHUB_CLIENT_ID
ARG NEXT_PUBLIC_GITHUB_REDIRECT_URI
ARG NEXT_PUBLIC_DOMAIN
ARG NEXT_PUBLIC_UMAMI_WEBSITE_ID

WORKDIR /app/apps/web
ENV NEXT_PUBLIC_BASE_URL=$NEXT_PUBLIC_BASE_URL
ENV NEXT_PUBLIC_GOOGLE_CLIENT_ID=$NEXT_PUBLIC_GOOGLE_CLIENT_ID
ENV NEXT_PUBLIC_GITHUB_CLIENT_ID=$NEXT_PUBLIC_GITHUB_CLIENT_ID
ENV NEXT_PUBLIC_GITHUB_REDIRECT_URI=$NEXT_PUBLIC_GITHUB_REDIRECT_URI
ENV NEXT_PUBLIC_DOMAIN=$NEXT_PUBLIC_DOMAIN
ENV NEXT_PUBLIC_UMAMI_WEBSITE_ID=$NEXT_PUBLIC_UMAMI_WEBSITE_ID
ENV SKIP_ENV_VALIDATION=true
RUN pnpm run build

# Production stage
FROM node:20-slim AS runner

ENV NODE_ENV=production

WORKDIR /app

# Copy standalone output (monorepo: standalone contains full path structure)
COPY --from=builder /app/apps/web/public ./apps/web/public
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static

WORKDIR /app/apps/web

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
