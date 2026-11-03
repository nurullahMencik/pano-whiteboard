# syntax=docker/dockerfile:1
# Build context: repository root (npm workspaces share one lockfile).
#   docker build -f server/Dockerfile -t pano-server .

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci --workspace server --include-workspace-root=false --ignore-scripts
COPY server/tsconfig.json server/tsconfig.build.json server/
COPY server/src server/src
RUN npm run build --workspace server

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci --workspace server --include-workspace-root=false --omit=dev --ignore-scripts && npm cache clean --force

FROM node:22-alpine
ENV NODE_ENV=production \
    PORT=10000 \
    HOST=0.0.0.0 \
    DB_PATH=/data/pano.db
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/server/dist ./server/dist
COPY server/package.json ./server/
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 10000
# Render injects $PORT; /health answers as soon as the HTTP server listens.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD wget -qO- "http://127.0.0.1:${PORT}/health" || exit 1
CMD ["node", "--disable-warning=ExperimentalWarning", "server/dist/index.js"]
