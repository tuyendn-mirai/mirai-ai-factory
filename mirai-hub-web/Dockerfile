# syntax=docker/dockerfile:1

FROM node:22-alpine AS deps
WORKDIR /app
# Install deps first so this layer caches across code-only changes.
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Dummy build-time defaults so `next build` doesn't fail when no real
# backend/env is available — actual values come from the Deployment env
# at runtime (see infra/apps/mirai-hub-web/manifests/deployment.yaml).
ENV BACKEND_INTERNAL_URL=http://localhost:8000
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# node:22-alpine already ships a "node" system user/group at uid/gid
# 1000 — reuse it instead of creating a second one (would collide on
# gid 1000) to still land on the requested non-root uid 1000.
# next.config.ts sets output: "standalone" — this copies just the
# server bundle + its pruned node_modules, not the full dev tree.
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public

USER node

EXPOSE 3000

CMD ["node", "server.js"]
