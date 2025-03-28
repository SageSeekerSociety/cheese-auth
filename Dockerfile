FROM node:23-slim

WORKDIR /app
ENV COREPACK_HOME=/app/corepack
ENV PNPM_HOME=/app/.pnpm
ENV PNPM_CACHE=/app/.pnpm-cache
ENV PATH="${PNPM_HOME}:$PATH"
EXPOSE ${PORT}

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./

COPY packages/oauth-provider-types/package.json packages/oauth-provider-types/
COPY packages/oauth-provider-types/tsconfig.json packages/oauth-provider-types/
COPY server/package.json server/

RUN apt-get update -y && apt-get install -y openssl curl \
    && corepack enable pnpm \
    && pnpm install --frozen-lockfile --ignore-scripts

COPY packages/oauth-provider-types/src/ packages/oauth-provider-types/src/
COPY server/ server/

WORKDIR /app/packages/oauth-provider-types
RUN pnpm run build

WORKDIR /app/server
RUN pnpm prisma generate

WORKDIR /app/server

CMD ["bash", "-c", "if [ ! -f \"FLAG_INIT\" ]; then touch FLAG_INIT \n pnpm prisma db push \n fi \n pnpm start"]