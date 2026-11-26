# Why: the keeper has to run all day on a server (Railway, Render, Fly, any VPS),
#      the same way on every host.
# How: installs exact dependencies from package-lock.json and runs src/ with tsx.
#      Secrets (RPC_URL, KEYPAIR_JSON) come from the host's env vars, never the image.
FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY tsconfig.json ./
COPY src ./src
ENV NODE_OPTIONS=--enable-source-maps
CMD ["npx", "tsx", "src/index.ts"]
