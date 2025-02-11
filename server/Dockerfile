FROM node:23-slim

ENV PNPM_HOME="/pnpm"
ENV PATH="${PNPM_HOME}:$PATH"
RUN corepack enable pnpm
RUN apt-get update -y && apt-get install -y openssl

WORKDIR /app
COPY . ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
RUN pnpm prisma generate

ENV PORT=8080
EXPOSE 8080

# Setup an app user so the container doesn't run as the root user
RUN useradd app
USER app
CMD ["bash", "-c", "if [ ! -f \"FLAG_INIT\" ]; then touch FLAG_INIT \n pnpm prisma db push \n fi \n pnpm start"]
