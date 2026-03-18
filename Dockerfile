# Stage 1 — build the custom node
FROM node:20-alpine AS builder
WORKDIR /build
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json index.ts ./
COPY nodes/ nodes/
COPY credentials/ credentials/
RUN npm run build && npm pack

# Stage 2 — n8n with the custom node installed
FROM n8nio/n8n:latest
USER root
COPY --from=builder /build/n8n-nodes-kong-ai-gateway-*.tgz /tmp/kong-node.tgz
RUN cd /usr/local/lib && npm install /tmp/kong-node.tgz && rm /tmp/kong-node.tgz
USER node
