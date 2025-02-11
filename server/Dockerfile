FROM node:23-slim
RUN apt-get update -y && apt-get install -y openssl curl

WORKDIR /app
COPY . ./

ENV COREPACK_HOME=/app/corepack
ENV PNPM_HOME=/app/.pnpm
ENV PNPM_CACHE=/app/.pnpm-cache
ENV PATH="${PNPM_HOME}:$PATH"
RUN corepack enable pnpm

RUN pnpm install --frozen-lockfile
RUN pnpm prisma generate

ENV PORT=8080
EXPOSE 8080

CMD ["bash", "-c", "if [ ! -f \"FLAG_INIT\" ]; then touch FLAG_INIT \n pnpm prisma db push \n fi \n pnpm start"]
