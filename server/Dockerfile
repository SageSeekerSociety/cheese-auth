FROM node:23-slim

WORKDIR /app
ENV COREPACK_HOME=/app/corepack
ENV PNPM_HOME=/app/.pnpm
ENV PNPM_CACHE=/app/.pnpm-cache
ENV PATH="${PNPM_HOME}:$PATH"
EXPOSE ${PORT}

COPY . ./
RUN apt-get update -y && apt-get install -y openssl curl \
    && corepack enable pnpm \
    && pnpm install --frozen-lockfile \
    && pnpm prisma generate
CMD ["bash", "-c", "if [ ! -f \"FLAG_INIT\" ]; then touch FLAG_INIT \n pnpm prisma db push \n fi \n pnpm start"]
