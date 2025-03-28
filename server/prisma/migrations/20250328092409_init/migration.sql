-- CreateEnum
CREATE TYPE "AvatarType" AS ENUM ('default', 'predefined', 'upload');

-- CreateEnum
CREATE TYPE "UserRegisterLogType" AS ENUM ('RequestSuccess', 'RequestFailDueToAlreadyRegistered', 'RequestFailDueToInvalidOrNotSupportedEmail', 'RequestFailDurToSecurity', 'RequestFailDueToSendEmailFailure', 'Success', 'SuccessViaOAuth', 'FailDueToUserExistence', 'FailDueToWrongCodeOrExpired', 'FailDueToEmailRaceCondition');

-- CreateEnum
CREATE TYPE "UserResetPasswordLogType" AS ENUM ('RequestSuccess', 'RequestFailDueToNoneExistentEmail', 'RequestFailDueToSecurity', 'RequestFailDueToSendEmailFailure', 'Success', 'FailDueToInvalidPassword', 'FailDueToInvalidToken', 'FailDueToExpiredRequest', 'FailDueToNoUser');

-- CreateTable
CREATE TABLE "user_o_auth_connection" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "provider_id" TEXT NOT NULL,
    "provider_user_id" TEXT NOT NULL,
    "raw_profile" JSONB,
    "refresh_token" TEXT,
    "token_expires" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_o_auth_connection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "id" SERIAL NOT NULL,
    "valid_until" TIMESTAMPTZ(6) NOT NULL,
    "revoked" BOOLEAN NOT NULL,
    "user_id" INTEGER NOT NULL,
    "authorization" TEXT NOT NULL,
    "last_refreshed_at" BIGINT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PK_f55da76ac1c3ac420f444d2ff11" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_refresh_log" (
    "id" SERIAL NOT NULL,
    "session_id" INTEGER NOT NULL,
    "old_refresh_token" TEXT NOT NULL,
    "new_refresh_token" TEXT NOT NULL,
    "access_token" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PK_f8f46c039b0955a7df6ad6631d7" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "avatar" (
    "id" SERIAL NOT NULL,
    "url" VARCHAR NOT NULL,
    "name" VARCHAR NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "avatar_type" "AvatarType" NOT NULL,
    "usage_count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "avatar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user" (
    "id" SERIAL NOT NULL,
    "username" VARCHAR NOT NULL,
    "hashed_password" VARCHAR NOT NULL,
    "email" VARCHAR NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "PK_cace4a159ff9f2512dd42373760" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_following_relationship" (
    "id" SERIAL NOT NULL,
    "followee_id" INTEGER NOT NULL,
    "follower_id" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "PK_3b0199015f8814633fc710ff09d" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_login_log" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "ip" VARCHAR NOT NULL,
    "user_agent" VARCHAR,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PK_f8db79b1af1f385db4f45a2222e" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_profile" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "nickname" VARCHAR NOT NULL,
    "avatar_id" INTEGER NOT NULL,
    "intro" VARCHAR NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "PK_f44d0cd18cfd80b0fed7806c3b7" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_profile_query_log" (
    "id" SERIAL NOT NULL,
    "viewer_id" INTEGER,
    "viewee_id" INTEGER NOT NULL,
    "ip" VARCHAR NOT NULL,
    "user_agent" VARCHAR,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PK_9aeff7c959703fad866e9ad581a" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_register_log" (
    "id" SERIAL NOT NULL,
    "email" VARCHAR NOT NULL,
    "type" "UserRegisterLogType" NOT NULL,
    "ip" VARCHAR NOT NULL,
    "user_agent" VARCHAR,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PK_3596a6f74bd2a80be930f6d1e39" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_register_request" (
    "id" SERIAL NOT NULL,
    "email" VARCHAR NOT NULL,
    "code" VARCHAR NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PK_cdf2d880551e43d9362ddd37ae0" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_reset_password_log" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER,
    "type" "UserResetPasswordLogType" NOT NULL,
    "ip" VARCHAR NOT NULL,
    "user_agent" VARCHAR,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PK_3ee4f25e7f4f1d5a9bd9817b62b" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_o_auth_connection_provider_id_provider_user_id_key" ON "user_o_auth_connection"("provider_id", "provider_user_id");

-- CreateIndex
CREATE INDEX "IDX_3d2f174ef04fb312fdebd0ddc5" ON "session"("user_id");

-- CreateIndex
CREATE INDEX "IDX_bb46e87d5b3f1e55c625755c00" ON "session"("valid_until");

-- CreateIndex
CREATE UNIQUE INDEX "IDX_78a916df40e02a9deb1c4b75ed" ON "user"("username");

-- CreateIndex
CREATE UNIQUE INDEX "IDX_e12875dfb3b1d92d7d7c5377e2" ON "user"("email");

-- CreateIndex
CREATE INDEX "IDX_868df0c2c3a138ee54d2a515bc" ON "user_following_relationship"("follower_id");

-- CreateIndex
CREATE INDEX "IDX_c78831eeee179237b1482d0c6f" ON "user_following_relationship"("followee_id");

-- CreateIndex
CREATE INDEX "IDX_66c592c7f7f20d1214aba2d004" ON "user_login_log"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "IDX_51cb79b5555effaf7d69ba1cff" ON "user_profile"("user_id");

-- CreateIndex
CREATE INDEX "IDX_1261db28434fde159acda6094b" ON "user_profile_query_log"("viewer_id");

-- CreateIndex
CREATE INDEX "IDX_ff592e4403b328be0de4f2b397" ON "user_profile_query_log"("viewee_id");

-- CreateIndex
CREATE INDEX "IDX_3af79f07534d9f1c945cd4c702" ON "user_register_log"("email");

-- CreateIndex
CREATE INDEX "IDX_c1d0ecc369d7a6a3d7e876c589" ON "user_register_request"("email");

-- AddForeignKey
ALTER TABLE "user_o_auth_connection" ADD CONSTRAINT "user_o_auth_connection_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_following_relationship" ADD CONSTRAINT "FK_868df0c2c3a138ee54d2a515bce" FOREIGN KEY ("follower_id") REFERENCES "user"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "user_following_relationship" ADD CONSTRAINT "FK_c78831eeee179237b1482d0c6fb" FOREIGN KEY ("followee_id") REFERENCES "user"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "user_login_log" ADD CONSTRAINT "FK_66c592c7f7f20d1214aba2d0046" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "user_profile" ADD CONSTRAINT "fk_user_profile_user_id" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "user_profile" ADD CONSTRAINT "fk_user_profile_avatar_id" FOREIGN KEY ("avatar_id") REFERENCES "avatar"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "user_profile_query_log" ADD CONSTRAINT "FK_1261db28434fde159acda6094bc" FOREIGN KEY ("viewer_id") REFERENCES "user"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "user_profile_query_log" ADD CONSTRAINT "FK_ff592e4403b328be0de4f2b3973" FOREIGN KEY ("viewee_id") REFERENCES "user"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
