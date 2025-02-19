/*
 *  Description: This file implements the UsersService class.
 *               It is responsible for the business logic of users.
 *
 *  Author(s):
 *      Nictheboy Li    <nictheboy@outlook.com>
 *
 */

import { Inject, Injectable, Logger, forwardRef } from '@nestjs/common';
import {
  User,
  UserFollowingRelationship,
  UserProfile,
  UserRegisterLogType,
  UserResetPasswordLogType,
} from '@prisma/client';
import bcrypt from 'bcryptjs';
import { isEmail } from 'class-validator';
import assert from 'node:assert';
import { PermissionDeniedError, TokenExpiredError } from '../auth/auth.error';
import { AuthService } from '../auth/auth.service';
import { Authorization } from '../auth/definitions';
import { SessionService } from '../auth/session.service';
import { AvatarNotFoundError } from '../avatars/avatars.error';
import { AvatarsService } from '../avatars/avatars.service';
import { PageDto } from '../common/DTO/page-response.dto';
import { PageHelper } from '../common/helper/page.helper';
import { PrismaService } from '../common/prisma/prisma.service';
import { EmailRuleService } from '../email/email-rule.service';
import { EmailService } from '../email/email.service';
import { UserDto } from './DTO/user.dto';
import { UsersPermissionService } from './users-permission.service';
import { UsersRegisterRequestService } from './users-register-request.service';
import {
  CodeNotMatchError,
  EmailAlreadyRegisteredError,
  EmailNotFoundError,
  EmailSendFailedError,
  FollowYourselfError,
  InvalidEmailAddressError,
  InvalidEmailSuffixError,
  InvalidNicknameError,
  InvalidPasswordError,
  InvalidUsernameError,
  PasswordNotMatchError,
  UserAlreadyFollowedError,
  UserIdNotFoundError,
  UserNotFollowedYetError,
  UsernameAlreadyRegisteredError,
  UsernameNotFoundError,
} from './users.error';

@Injectable()
export class UsersService {
  constructor(
    private readonly emailService: EmailService,
    private readonly emailRuleService: EmailRuleService,
    private readonly authService: AuthService,
    private readonly sessionService: SessionService,
    private readonly usersPermissionService: UsersPermissionService,
    private readonly usersRegisterRequestService: UsersRegisterRequestService,
    private readonly avatarsService: AvatarsService,
    private readonly prismaService: PrismaService,
  ) {}

  private readonly passwordResetEmailValidSeconds = 10 * 60; // 10 minutes

  private generateVerifyCode(): string {
    let code: string = '';
    for (let i = 0; i < 6; i++) {
      code += Math.floor(Math.random() * 10).toString()[0];
    }
    return code;
  }

  get emailSuffixRule(): string {
    return this.emailRuleService.emailSuffixRule;
  }

  async isEmailRegistered(email: string): Promise<boolean> {
    return (
      (await this.prismaService.user.count({
        where: {
          email,
        },
      })) > 0
    );
  }

  async findUserRecordOrThrow(userId: number): Promise<User> {
    const user = await this.prismaService.user.findUnique({
      where: {
        id: userId,
      },
    });
    if (user != undefined) {
      return user;
    } else {
      throw new UserIdNotFoundError(userId);
    }
  }

  async findUserRecordByUsernameOrThrow(username: string): Promise<User> {
    const user = await this.prismaService.user.findUnique({
      where: {
        username,
      },
    });
    if (user != undefined) {
      return user;
    } else {
      throw new UsernameNotFoundError(username);
    }
  }

  async findUserRecordAndProfileRecordOrThrow(
    userId: number,
  ): Promise<[User, UserProfile]> {
    const userPromise = this.findUserRecordOrThrow(userId);
    const profilePromise = this.prismaService.userProfile.findUnique({
      where: {
        userId: userId,
      },
    });
    const [user, profile] = await Promise.all([userPromise, profilePromise]);
    /* istanbul ignore if */
    // Above is a hint for istanbul to ignore the following line.
    if (profile == undefined) {
      throw new Error(`User '${user.username}' DO NOT has a profile!`);
    }
    return [user, profile];
  }

  async isUsernameRegistered(username: string): Promise<boolean> {
    return (
      (await this.prismaService.user.count({
        where: {
          username,
        },
      })) > 0
    );
  }

  private async createUserRegisterLog(
    type: UserRegisterLogType,
    email: string,
    ip: string,
    userAgent: string | undefined,
  ): Promise<void> {
    await this.prismaService.userRegisterLog.create({
      data: {
        type,
        email,
        ip,
        userAgent,
      },
    });
  }

  private async createPasswordResetLog(
    type: UserResetPasswordLogType,
    userId: number | undefined,
    ip: string,
    userAgent: string | undefined,
  ): Promise<void> {
    await this.prismaService.userResetPasswordLog.create({
      data: {
        type,
        userId,
        ip,
        userAgent,
      },
    });
  }

  async sendRegisterEmailCode(
    email: string,
    ip: string,
    userAgent: string | undefined,
  ): Promise<void> {
    if (isEmail(email) == false) {
      await this.createUserRegisterLog(
        UserRegisterLogType.RequestFailDueToInvalidOrNotSupportedEmail,
        email,
        ip,
        userAgent,
      );
      throw new InvalidEmailAddressError(email);
    }
    if ((await this.emailRuleService.isEmailSuffixSupported(email)) == false) {
      await this.createUserRegisterLog(
        UserRegisterLogType.RequestFailDueToInvalidOrNotSupportedEmail,
        email,
        ip,
        userAgent,
      );
      throw new InvalidEmailSuffixError(email, this.emailSuffixRule);
    }

    // TODO: Add logic to determain whether code is sent too frequently.

    // Determine whether the email is registered.
    if (await this.isEmailRegistered(email)) {
      await this.createUserRegisterLog(
        UserRegisterLogType.RequestFailDueToAlreadyRegistered,
        email,
        ip,
        userAgent,
      );
      throw new EmailAlreadyRegisteredError(email);
    }

    // Now, email is valid, supported and not registered.
    // We can send the verify code.
    const code = this.generateVerifyCode();
    try {
      await this.emailService.sendRegisterCode(email, code);
    } catch (e) {
      await this.createUserRegisterLog(
        UserRegisterLogType.RequestFailDueToSendEmailFailure,
        email,
        ip,
        userAgent,
      );
      throw new EmailSendFailedError(email);
    }
    await this.usersRegisterRequestService.createRequest(email, code);
    await this.createUserRegisterLog(
      UserRegisterLogType.RequestSuccess,
      email,
      ip,
      userAgent,
    );
  }

  private isValidUsername(username: string): boolean {
    return /^[a-zA-Z0-9_-]{4,32}$/.test(username);
  }

  get usernameRule(): string {
    return 'Username must be 4-32 characters long and can only contain letters, numbers, underscores and hyphens.';
  }

  private isValidNickname(nickname: string): boolean {
    return /^[a-zA-Z0-9_\u4e00-\u9fa5]{1,16}$/.test(nickname);
  }

  get nicknameRule(): string {
    return 'Nickname must be 1-16 characters long and can only contain letters, numbers, underscores, hyphens and Chinese characters.';
  }

  private isValidPassword(password: string): boolean {
    // Password should contains at least one letter, one special character and one number.
    // It should contain at least 8 chars.
    // ? should \x00 be used in password?
    // todo: we should only use visible special characters
    // eslint-disable-next-line no-control-regex
    return /^(?=.*[a-zA-Z])(?=.*\d)(?=.*[\x00-\x2F\x3A-\x40\x5B-\x60\x7B-\x7F]).{8,}$/.test(
      password,
    );
  }

  get passwordRule(): string {
    return 'Password must be at least 8 characters long and must contain at least one letter, one special character and one number.';
  }

  get defaultIntro(): string {
    return 'This user has not set an introduction yet.';
  }

  async register(
    username: string,
    nickname: string,
    password: string,
    email: string,
    emailCode: string,
    ip: string,
    userAgent: string | undefined,
  ): Promise<UserDto> {
    // todo: validate username, nickname, password, email, emailCode
    if (this.isValidUsername(username) == false) {
      throw new InvalidUsernameError(username, this.usernameRule);
    }
    if (this.isValidNickname(nickname) == false) {
      throw new InvalidNicknameError(nickname, this.nicknameRule);
    }
    if (this.isValidPassword(password) == false) {
      throw new InvalidPasswordError(this.passwordRule);
    }
    if (isEmail(email) == false) {
      throw new InvalidEmailAddressError(email);
    }
    if ((await this.emailRuleService.isEmailSuffixSupported(email)) == false) {
      throw new InvalidEmailSuffixError(email, this.emailSuffixRule);
    }

    if (
      await this.usersRegisterRequestService.verifyRequest(email, emailCode)
    ) {
      // Verify whether the email is registered.
      /* istanbul ignore if */
      if (await this.isEmailRegistered(email)) {
        throw new Error(
          `In a register attempt, the email is verified, but the email is already registered!` +
            `There are 4 possible reasons:\n` +
            `1. The user send two register email and verified them after that.\n` +
            `2. There is a bug in the code.\n` +
            `3. The database is corrupted.\n` +
            `4. We are under attack!`,
        );
      }
      // Verify whether the username is registered.
      if (await this.isUsernameRegistered(username)) {
        await this.createUserRegisterLog(
          UserRegisterLogType.FailDueToUserExistence,
          email,
          ip,
          userAgent,
        );
        throw new UsernameAlreadyRegisteredError(username);
      }

      // Now, the request is valid, email is not registered, username is not registered.
      // We can register the user.
      const avatarId = await this.avatarsService.getDefaultAvatarId();
      const profile = {
        nickname,
        intro: this.defaultIntro,
        avatarId,
      };
      const salt = bcrypt.genSaltSync(10);
      const result = await this.prismaService.user.create({
        data: {
          username,
          hashedPassword: bcrypt.hashSync(password, salt),
          email,
          userProfile: {
            create: profile,
          },
        },
      });
      await this.createUserRegisterLog(
        UserRegisterLogType.Success,
        email,
        ip,
        userAgent,
      );
      return {
        id: result.id,
        username: result.username,
        nickname: profile.nickname,
        avatarId: profile.avatarId,
        intro: profile.intro,
        follow_count: 0,
        fans_count: 0,
        is_follow: false,
      };
    } else {
      await this.createUserRegisterLog(
        UserRegisterLogType.FailDueToWrongCodeOrExpired,
        email,
        ip,
        userAgent,
      );
      throw new CodeNotMatchError(email, emailCode);
    }
  }

  async toUserDto(
    user: User,
    profile: UserProfile,
    viewerId: number | undefined, // optional
  ): Promise<UserDto> {
    const followCountPromise = this.getFollowingCount(user.id);
    const fansCountPromise = this.getFollowedCount(user.id);
    const ifFollowPromise = this.isUserFollowUser(viewerId, user.id);
    const [followCount, fansCount, isFollow] = await Promise.all([
      followCountPromise,
      fansCountPromise,
      ifFollowPromise,
    ]);
    return {
      id: user.id,
      username: user.username,
      nickname: profile.nickname,
      avatarId: profile.avatarId,
      intro: profile.intro,
      follow_count: followCount,
      fans_count: fansCount,
      is_follow: isFollow,
    };
  }

  async getUserDtoById(
    userId: number,
    viewerId: number | undefined, // optional
    ip: string,
    userAgent: string | undefined, // optional
  ): Promise<UserDto> {
    const [user, profile] =
      await this.findUserRecordAndProfileRecordOrThrow(userId);
    const vieweeId = user.id;
    await this.prismaService.userProfileQueryLog.create({
      data: {
        viewerId,
        vieweeId,
        ip,
        userAgent,
      },
    });
    return await this.toUserDto(user, profile, viewerId);
  }

  // Returns:
  //     [userDto, refreshToken]
  async login(
    username: string,
    password: string,
    ip: string,
    userAgent: string | undefined,
  ): Promise<[UserDto, string]> {
    const user = await this.findUserRecordByUsernameOrThrow(username);
    if (bcrypt.compareSync(password, user.hashedPassword) == false) {
      throw new PasswordNotMatchError(username);
    }
    // Login successfully.
    await this.prismaService.userLoginLog.create({
      data: {
        userId: user.id,
        ip,
        userAgent,
      },
    });
    return [
      await this.getUserDtoById(user.id, user.id, ip, userAgent),
      await this.createSession(user.id),
    ];
  }

  private async createSession(userId: number): Promise<string> {
    const authorization: Authorization =
      await this.usersPermissionService.getAuthorizationForUser(userId);
    return this.sessionService.createSession(userId, authorization);
  }

  async sendResetPasswordEmail(
    email: string,
    ip: string,
    userAgent: string | undefined,
  ): Promise<void> {
    // Check email.
    if (isEmail(email) == false) {
      throw new InvalidEmailAddressError(email);
    }
    if ((await this.emailRuleService.isEmailSuffixSupported(email)) == false) {
      throw new InvalidEmailSuffixError(email, this.emailSuffixRule);
    }
    const user = await this.prismaService.user.findUnique({
      where: {
        email,
      },
    });
    if (user == undefined) {
      await this.createPasswordResetLog(
        UserResetPasswordLogType.RequestFailDueToNoneExistentEmail,
        undefined,
        ip,
        userAgent,
      );
      throw new EmailNotFoundError(email);
    }
    const token = this.authService.sign(
      {
        userId: user.id,
        permissions: [
          {
            authorizedActions: ['modify'],
            authorizedResource: {
              ownedByUser: user.id,
              types: ['users/password:reset'],
              resourceIds: undefined,
              data: Date.now(),
            },
          },
        ],
      },
      this.passwordResetEmailValidSeconds,
    );
    try {
      await this.emailService.sendPasswordResetEmail(
        email,
        user.username,
        token,
      );
    } catch {
      throw new EmailSendFailedError(email);
    }
    await this.createPasswordResetLog(
      UserResetPasswordLogType.RequestSuccess,
      user.id,
      ip,
      userAgent,
    );
  }

  async verifyAndResetPassword(
    token: string,
    newPassword: string,
    ip: string,
    userAgent: string | undefined,
  ): Promise<void> {
    // Here, we do not need to check whether the token is valid.
    // If we check, then, if the token is invalid, it won't be logged.
    const userId = this.authService.decode(token).authorization.userId;
    try {
      await this.authService.audit(
        token,
        'modify',
        userId,
        'users/password:reset',
        undefined,
      );
    } catch (e) {
      if (e instanceof PermissionDeniedError) {
        await this.createPasswordResetLog(
          UserResetPasswordLogType.FailDueToInvalidToken,
          userId,
          ip,
          userAgent,
        );
        Logger.warn(
          `Permission denied when reset password: token = "${token}", ip = "${ip}", userAgent = "${userAgent}"`,
        );
      }
      if (e instanceof TokenExpiredError) {
        await this.createPasswordResetLog(
          UserResetPasswordLogType.FailDueToExpiredRequest,
          userId,
          ip,
          userAgent,
        );
      }
      throw e;
    }

    // Operation permitted.

    // Check password.
    if (this.isValidPassword(newPassword) == false) {
      throw new InvalidPasswordError(this.passwordRule);
    }

    const user = await this.prismaService.user.findUnique({
      where: {
        id: userId,
      },
    });
    /* istanbul ignore if */
    if (user == undefined) {
      await this.createPasswordResetLog(
        UserResetPasswordLogType.FailDueToNoUser,
        userId,
        ip,
        userAgent,
      );
      throw new Error(
        `In an password reset attempt, the operation ` +
          `is permitted, but the user is not found! There are 4 possible reasons:\n` +
          `1. The user is deleted right after a password reset request.\n` +
          `2. There is a bug in the code.\n` +
          `3. The database is corrupted.\n` +
          `4. We are under attack!`,
      );
    }
    const salt = bcrypt.genSaltSync(10);
    await this.prismaService.user.update({
      where: {
        id: userId,
      },
      data: {
        hashedPassword: bcrypt.hashSync(newPassword, salt),
      },
    });
    await this.createPasswordResetLog(
      UserResetPasswordLogType.Success,
      userId,
      ip,
      userAgent,
    );
  }

  async updateUserProfile(
    userId: number,
    nickname: string,
    intro: string,
    avatarId: number,
  ): Promise<void> {
    const [, profile] =
      await this.findUserRecordAndProfileRecordOrThrow(userId);
    if ((await this.avatarsService.isAvatarExists(avatarId)) == false) {
      throw new AvatarNotFoundError(avatarId);
    }
    await this.avatarsService.plusUsageCount(avatarId);
    await this.avatarsService.minusUsageCount(profile.avatarId);
    await this.prismaService.userProfile.update({
      where: {
        userId,
      },
      data: {
        nickname,
        intro,
        avatarId,
      },
    });
  }

  async getUsers(
    firstUserId: number | undefined, // undefined if from start
    pageSize: number,
    viewerId: number | undefined, // optional
    ip: string,
    userAgent: string | undefined, // optional
  ): Promise<[UserDto[], PageDto]> {
    if (firstUserId == undefined) {
      const relations = await this.prismaService.user.findMany({
        take: pageSize + 1,
        orderBy: { id: 'asc' },
        include: {
          userProfile: true,
        },
      });
      const DTOs = await Promise.all(
        relations.map((u) => {
          return this.toUserDto(u, u.userProfile!, viewerId);
        }),
      );
      return PageHelper.PageStart(DTOs, pageSize, (item) => item.id);
    } else {
      const prevRelationshipsPromise = this.prismaService.user.findMany({
        where: {
          id: { lt: firstUserId },
        },
        take: pageSize,
        orderBy: { id: 'desc' },
        include: {
          userProfile: true,
        },
      });
      const queriedRelationsPromise = this.prismaService.user.findMany({
        where: {
          id: { gte: firstUserId },
        },
        take: pageSize + 1,
        orderBy: { id: 'asc' },
        include: {
          userProfile: true,
        },
      });
      const DTOs = await Promise.all(
        (await queriedRelationsPromise).map((u) => {
          return this.toUserDto(u, u.userProfile!, viewerId);
        }),
      );
      const prev = await prevRelationshipsPromise;
      return PageHelper.PageMiddle(
        prev,
        DTOs,
        pageSize,
        (i) => i.id,
        (i) => i.id,
      );
    }
  }

  async getUniqueFollowRelationship(
    followerId: number,
    followeeId: number,
  ): Promise<UserFollowingRelationship | undefined> {
    let relationships =
      await this.prismaService.userFollowingRelationship.findMany({
        where: {
          followerId,
          followeeId,
        },
      });
    /* istanbul ignore if */
    if (relationships.length > 1) {
      Logger.warn(
        `There are more than one follow relationship between user ${followerId} and user ${followeeId}. Automaticly clean them up...`,
      );
      await this.prismaService.userFollowingRelationship.updateMany({
        where: {
          followerId,
          followeeId,
        },
        data: {
          deletedAt: new Date(),
        },
      });
      const result = await this.prismaService.userFollowingRelationship.create({
        data: {
          followerId,
          followeeId,
        },
      });
      relationships = [result];
    }
    return relationships.length == 0 ? undefined : relationships[0];
  }

  async addFollowRelationship(
    followerId: number,
    followeeId: number,
  ): Promise<void> {
    if (followerId == followeeId) {
      throw new FollowYourselfError();
    }
    if ((await this.isUserExists(followerId)) == false) {
      throw new UserIdNotFoundError(followerId);
    }
    if ((await this.isUserExists(followeeId)) == false) {
      throw new UserIdNotFoundError(followeeId);
    }
    const oldRelationship = await this.getUniqueFollowRelationship(
      followerId,
      followeeId,
    );
    if (oldRelationship != null) {
      throw new UserAlreadyFollowedError(followeeId);
    }
    await this.prismaService.userFollowingRelationship.create({
      data: {
        followerId,
        followeeId,
      },
    });
  }

  async deleteFollowRelationship(
    followerId: number,
    followeeId: number,
  ): Promise<void> {
    const relationship = await this.getUniqueFollowRelationship(
      followerId,
      followeeId,
    );
    if (relationship == undefined) {
      throw new UserNotFollowedYetError(followeeId);
    }
    await this.prismaService.userFollowingRelationship.updateMany({
      where: {
        followerId,
        followeeId,
      },
      data: {
        deletedAt: new Date(),
      },
    });
  }

  async getFollowers(
    followeeId: number,
    firstFollowerId: number | undefined, // undefined if from start
    pageSize: number,
    viewerId: number | undefined, // optional
    ip: string,
    userAgent: string | undefined, // optional
  ): Promise<[UserDto[], PageDto]> {
    if (firstFollowerId == undefined) {
      const relations =
        await this.prismaService.userFollowingRelationship.findMany({
          where: {
            followeeId,
          },
          take: pageSize + 1,
          orderBy: { followerId: 'asc' },
        });
      const DTOs = await Promise.all(
        relations.map((r) => {
          return this.getUserDtoById(r.followerId, viewerId, ip, userAgent);
        }),
      );
      return PageHelper.PageStart(DTOs, pageSize, (item) => item.id);
    } else {
      const prevRelationshipsPromise =
        this.prismaService.userFollowingRelationship.findMany({
          where: {
            followeeId,
            followerId: { lt: firstFollowerId },
          },
          take: pageSize,
          orderBy: { followerId: 'desc' },
        });
      const queriedRelationsPromise =
        this.prismaService.userFollowingRelationship.findMany({
          where: {
            followeeId,
            followerId: { gte: firstFollowerId },
          },
          take: pageSize + 1,
          orderBy: { followerId: 'asc' },
        });
      const DTOs = await Promise.all(
        (await queriedRelationsPromise).map((r) => {
          return this.getUserDtoById(r.followerId, viewerId, ip, userAgent);
        }),
      );
      const prev = await prevRelationshipsPromise;
      return PageHelper.PageMiddle(
        prev,
        DTOs,
        pageSize,
        (i) => i.followerId,
        (i) => i.id,
      );
    }
  }

  async getFollowees(
    followerId: number,
    firstFolloweeId: number | undefined, // undefined if from start
    pageSize: number,
    viewerId: number | undefined, // optional
    ip: string, // optional
    userAgent: string | undefined, // optional
  ): Promise<[UserDto[], PageDto]> {
    if (firstFolloweeId == undefined) {
      const relations =
        await this.prismaService.userFollowingRelationship.findMany({
          where: {
            followerId,
          },
          take: pageSize + 1,
          orderBy: { followeeId: 'asc' },
        });
      const DTOs = await Promise.all(
        relations.map((r) => {
          return this.getUserDtoById(r.followeeId, viewerId, ip, userAgent);
        }),
      );
      return PageHelper.PageStart(DTOs, pageSize, (item) => item.id);
    } else {
      const prevRelationshipsPromise =
        this.prismaService.userFollowingRelationship.findMany({
          where: {
            followerId,
            followeeId: { lt: firstFolloweeId },
          },
          take: pageSize,
          orderBy: { followeeId: 'desc' },
        });
      const queriedRelationsPromise =
        this.prismaService.userFollowingRelationship.findMany({
          where: {
            followerId,
            followeeId: { gte: firstFolloweeId },
          },
          take: pageSize + 1,
          orderBy: { followeeId: 'asc' },
        });
      const DTOs = await Promise.all(
        (await queriedRelationsPromise).map((r) => {
          return this.getUserDtoById(r.followeeId, viewerId, ip, userAgent);
        }),
      );
      const prev = await prevRelationshipsPromise;
      return PageHelper.PageMiddle(
        prev,
        DTOs,
        pageSize,
        (i) => i.followeeId,
        (i) => i.id,
      );
    }
  }

  async isUserExists(userId: number): Promise<boolean> {
    return (await this.prismaService.user.count({ where: { id: userId } })) > 0;
  }

  async getFollowingCount(followerId: number): Promise<number> {
    return await this.prismaService.userFollowingRelationship.count({
      where: {
        followerId,
      },
    });
  }

  async getFollowedCount(followeeId: number): Promise<number> {
    return await this.prismaService.userFollowingRelationship.count({
      where: {
        followeeId,
      },
    });
  }

  async isUserFollowUser(
    followerId: number | undefined,
    followeeId: number | undefined,
  ): Promise<boolean> {
    if (followerId == undefined || followeeId == undefined) return false;
    const result = await this.prismaService.userFollowingRelationship.count({
      where: {
        followerId,
        followeeId,
      },
    });
    assert(result == 0 || result == 1);
    return result > 0;
  }
}
