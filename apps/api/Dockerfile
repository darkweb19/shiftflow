FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile --filter @shiftflow/api...

FROM base AS build
COPY --from=deps /app .
COPY apps/api/ apps/api/
RUN pnpm --filter @shiftflow/api build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/apps/api/dist ./dist
COPY --from=deps /app/node_modules ./node_modules

EXPOSE 3001
CMD ["node", "dist/index.js"]
