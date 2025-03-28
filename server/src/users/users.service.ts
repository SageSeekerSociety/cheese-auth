/*
 * Description: Implements the UsersService class, handling business logic related to users.
 * Author(s):
 *     Nictheboy Li    <nictheboy@outlook.com>
 */

import { Inject, Injectable, Logger } from '@nestjs/common';
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
import crypto from 'node:crypto';
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
import { OAuthUserInfo } from '@sageseekersociety/cheese-auth-oauth-types';

/**
 * Service responsible for user-related business logic, including registration,
 * authentication, profile management, following relationships, and OAuth integration.
 */
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

  /** Duration (in seconds) for which a password reset email token is valid. */
  private readonly passwordResetEmailValidSeconds = 10 * 60; // 10 minutes

  /**
   * Generates a 6-digit verification code using a cryptographically secure random number generator.
   * @returns A string representing the 6-digit code.
   */
  private generateVerifyCode(): string {
    let code: string = '';
    for (let i = 0; i < 6; i++) {
      // Generate a cryptographically secure random integer between 0 (inclusive) and 10 (exclusive)
      code += crypto.randomInt(0, 10).toString();
    }
    return code;
  }

  /**
   * Rule description for allowed email suffixes.
   */
  get emailSuffixRule(): string {
    return this.emailRuleService.emailSuffixRule;
  }

  /**
   * Checks if an email address is already registered in the system.
   * @param email - The email address to check.
   * @returns True if the email is registered, false otherwise.
   */
  async isEmailRegistered(email: string): Promise<boolean> {
    return (
      (await this.prismaService.user.count({
        where: {
          email,
          deletedAt: null, // Consider only active users
        },
      })) > 0
    );
  }

  /**
   * Finds an active user record by its ID. Throws UserIdNotFoundError if not found or soft-deleted.
   * @param userId - The ID of the user to find.
   * @returns The User record.
   * @throws UserIdNotFoundError
   */
  async findUserRecordOrThrow(userId: number): Promise<User> {
    const user = await this.prismaService.user.findUnique({
      where: {
        id: userId,
        deletedAt: null, // Ensure user is active
      },
    });
    if (user != undefined) {
      return user;
    } else {
      throw new UserIdNotFoundError(userId);
    }
  }

  /**
   * Finds an active user record by its username. Throws UsernameNotFoundError if not found or soft-deleted.
   * @param username - The username of the user to find.
   * @returns The User record.
   * @throws UsernameNotFoundError
   */
  async findUserRecordByUsernameOrThrow(username: string): Promise<User> {
    const user = await this.prismaService.user.findUnique({
      where: {
        username,
        deletedAt: null, // Ensure user is active
      },
    });
    if (user != undefined) {
      return user;
    } else {
      throw new UsernameNotFoundError(username);
    }
  }

  /**
   * Finds an active user record and their associated profile record by user ID.
   * Throws an error if the user or profile is not found.
   * @param userId - The ID of the user.
   * @returns A tuple containing the User record and UserProfile record.
   * @throws UserIdNotFoundError
   * @throws Error if the profile is missing for an existing user (internal inconsistency).
   */
  async findUserRecordAndProfileRecordOrThrow(
    userId: number,
  ): Promise<[User, UserProfile]> {
    // Ensure user exists and is active first
    const user = await this.findUserRecordOrThrow(userId);
    const profile = await this.prismaService.userProfile.findUnique({
      where: {
        userId: userId,
      },
    });

    /* istanbul ignore if */ // Should not happen based on DB constraints/logic if user exists.
    if (profile == undefined) {
      Logger.error(`User '${user.username}' (ID: ${userId}) exists but has no profile!`);
      throw new Error(`User '${user.username}' does not have a profile record.`);
    }
    return [user, profile];
  }

  /**
   * Checks if a username is already registered by an active user.
   * @param username - The username to check.
   * @returns True if the username is registered, false otherwise.
   */
  async isUsernameRegistered(username: string): Promise<boolean> {
    return (
      (await this.prismaService.user.count({
        where: {
          username,
          deletedAt: null, // Consider only active users
        },
      })) > 0
    );
  }

  /**
   * Creates a log entry for a user registration attempt.
   * @param type - The type of the registration log event.
   * @param email - The email used in the attempt.
   * @param ip - The IP address of the requester.
   * @param userAgent - The user agent of the requester (optional).
   */
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

  /**
   * Creates a log entry for a password reset attempt.
   * @param type - The type of the password reset log event.
   * @param userId - The ID of the user involved (if known).
   * @param ip - The IP address of the requester.
   * @param userAgent - The user agent of the requester (optional).
   */
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

  /**
   * Sends a registration verification code to the specified email address after validation.
   * @param email - The target email address.
   * @param ip - The IP address of the requester.
   * @param userAgent - The user agent of the requester (optional).
   * @throws InvalidEmailAddressError
   * @throws InvalidEmailSuffixError
   * @throws EmailAlreadyRegisteredError
   * @throws EmailSendFailedError
   */
  async sendRegisterEmailCode(
    email: string,
    ip: string,
    userAgent: string | undefined,
  ): Promise<void> {
    if (!isEmail(email)) {
      await this.createUserRegisterLog( UserRegisterLogType.RequestFailDueToInvalidOrNotSupportedEmail, email, ip, userAgent );
      throw new InvalidEmailAddressError(email);
    }
    if (!(await this.emailRuleService.isEmailSuffixSupported(email))) {
      await this.createUserRegisterLog( UserRegisterLogType.RequestFailDueToInvalidOrNotSupportedEmail, email, ip, userAgent );
      throw new InvalidEmailSuffixError(email, this.emailSuffixRule);
    }

    // TODO: Implement rate limiting for sending verification codes.

    // Check if the email is already registered by an active user.
    if (await this.isEmailRegistered(email)) {
      await this.createUserRegisterLog( UserRegisterLogType.RequestFailDueToAlreadyRegistered, email, ip, userAgent );
      throw new EmailAlreadyRegisteredError(email);
    }

    // Email is valid, supported, and not registered. Send the code.
    const code = this.generateVerifyCode();
    try {
      await this.emailService.sendRegisterCode(email, code);
    } catch (e) {
      await this.createUserRegisterLog( UserRegisterLogType.RequestFailDueToSendEmailFailure, email, ip, userAgent );
      // Log the underlying error for debugging
      Logger.error(`Failed to send registration code to ${email}: ${e instanceof Error ? e.message : e}`, e instanceof Error ? e.stack : undefined);
      throw new EmailSendFailedError(email);
    }
    await this.usersRegisterRequestService.createRequest(email, code);
    await this.createUserRegisterLog( UserRegisterLogType.RequestSuccess, email, ip, userAgent );
  }

  /**
   * Validates if a string is a valid username according to the defined rules.
   * @param username - The username string to validate.
   * @returns True if valid, false otherwise.
   */
  private isValidUsername(username: string): boolean {
    return /^[a-zA-Z0-9_-]{4,32}$/.test(username);
  }

  /**
   * Rule description for valid usernames.
   */
  get usernameRule(): string {
    return 'Username must be 4-32 characters long and can only contain letters, numbers, underscores and hyphens.';
  }

  /**
   * Validates if a string is a valid nickname according to the defined rules.
   * @param nickname - The nickname string to validate.
   * @returns True if valid, false otherwise.
   */
  private isValidNickname(nickname: string): boolean {
    // Allows letters, numbers, underscore, and common CJK Unified Ideographs
    return /^[a-zA-Z0-9_\u4e00-\u9fa5]{1,16}$/.test(nickname);
  }

  /**
   * Rule description for valid nicknames.
   */
  get nicknameRule(): string {
    return 'Nickname must be 1-16 characters long and can only contain letters, numbers, underscores, and Chinese characters.';
  }

  /**
   * Validates if a string is a valid password according to the defined rules.
   * @param password - The password string to validate.
   * @returns True if valid, false otherwise.
   */
  private isValidPassword(password: string): boolean {
    // Password requires: >= 8 chars, >= 1 letter, >= 1 digit, >= 1 special char.
    // Special chars defined broadly here (ASCII symbols/punctuation). Excludes control chars.
    // eslint-disable-next-line no-control-regex
    return /^(?=.*[a-zA-Z])(?=.*\d)(?=.*[\x21-\x2F\x3A-\x40\x5B-\x60\x7B-\x7E]).{8,}$/.test(
      password,
    );
    // Note: The original regex included \x00-\x2F... which allows NULL bytes and control chars.
    // Changed to \x21-\x2F... to only include printable ASCII symbols/punctuation.
  }

  /**
   * Rule description for valid passwords.
   */
  get passwordRule(): string {
    return 'Password must be at least 8 characters long and must contain at least one letter, one digit, and one special character.';
  }

  /**
   * Default introduction text for new user profiles.
   */
  get defaultIntro(): string {
    return 'This user has not set an introduction yet.';
  }

  /**
   * Registers a new user after validating input and verifying the email code.
   * @param username - The desired username.
   * @param nickname - The desired nickname.
   * @param password - The desired password.
   * @param email - The user's email address.
   * @param emailCode - The verification code sent to the email.
   * @param ip - The IP address of the registration attempt.
   * @param userAgent - The user agent of the registration attempt (optional).
   * @returns The newly created user's DTO.
   * @throws InvalidUsernameError, InvalidNicknameError, InvalidPasswordError, InvalidEmailAddressError, InvalidEmailSuffixError, CodeNotMatchError, UsernameAlreadyRegisteredError
   */
  async register(
    username: string,
    nickname: string,
    password: string,
    email: string,
    emailCode: string,
    ip: string,
    userAgent: string | undefined,
  ): Promise<UserDto> {
    // Input validation
    if (!this.isValidUsername(username)) {
      throw new InvalidUsernameError(username, this.usernameRule);
    }
    if (!this.isValidNickname(nickname)) {
      throw new InvalidNicknameError(nickname, this.nicknameRule);
    }
    if (!this.isValidPassword(password)) {
      throw new InvalidPasswordError(this.passwordRule);
    }
    if (!isEmail(email)) {
      throw new InvalidEmailAddressError(email);
    }
    if (!(await this.emailRuleService.isEmailSuffixSupported(email))) {
      throw new InvalidEmailSuffixError(email, this.emailSuffixRule);
    }

    // Verify email code
    if (await this.usersRegisterRequestService.verifyRequest(email, emailCode)) {
      // Double-check email and username registration status just before creation
      // to mitigate potential race conditions.
      /* istanbul ignore if */ // Should ideally not happen if checks are done correctly before code generation.
      if (await this.isEmailRegistered(email)) {
        // This indicates a potential issue or race condition. Log and throw generic error?
        Logger.error(`Registration attempt for already registered email ${email} passed code verification.`);
        await this.createUserRegisterLog( UserRegisterLogType.FailDueToEmailRaceCondition, email, ip, userAgent ); // Assuming this type exists
        throw new EmailAlreadyRegisteredError(email); // Or a more generic server error
      }
      if (await this.isUsernameRegistered(username)) {
        await this.createUserRegisterLog( UserRegisterLogType.FailDueToUserExistence, email, ip, userAgent );
        throw new UsernameAlreadyRegisteredError(username);
      }

      // All checks passed, create the user record.
      const avatarId = await this.avatarsService.getDefaultAvatarId();
      const profileData = {
        nickname,
        intro: this.defaultIntro,
        avatarId,
      };
      const salt = bcrypt.genSaltSync(10);
      const hashedPassword = bcrypt.hashSync(password, salt);

      const newUser = await this.prismaService.user.create({
        data: {
          username,
          hashedPassword,
          email,
          userProfile: {
            create: profileData,
          },
        },
        // No need to include profile here, we have the data
      });

      await this.createUserRegisterLog( UserRegisterLogType.Success, email, ip, userAgent );

      // Manually construct DTO as profile data is already available
      return {
        id: newUser.id,
        username: newUser.username,
        nickname: profileData.nickname,
        avatarId: profileData.avatarId,
        intro: profileData.intro,
        follow_count: 0, // New user has 0 follows/fans
        fans_count: 0,
        is_follow: false, // Cannot follow self or anyone yet
      };
    } else {
      // Code verification failed
      await this.createUserRegisterLog( UserRegisterLogType.FailDueToWrongCodeOrExpired, email, ip, userAgent );
      throw new CodeNotMatchError(email, emailCode);
    }
  }

  /**
   * Converts User and UserProfile records into a UserDto.
   * Fetches additional data like follow counts and viewer's follow status.
   * @param user - The User record.
   * @param profile - The UserProfile record.
   * @param {number} [viewerId] - The ID of the user viewing the profile (optional). Used to determine `is_follow`.
   * @returns A Promise resolving to the UserDto object.
   */
  async toUserDto(
    user: User,
    profile: UserProfile,
    viewerId?: number,
  ): Promise<UserDto> {
    const followCountPromise = this.getFollowingCount(user.id);
    const fansCountPromise = this.getFollowedCount(user.id);
    // Only check follow status if a viewer is specified and is different from the user
    const ifFollowPromise = (viewerId && viewerId !== user.id)
        ? this.isUserFollowUser(viewerId, user.id)
        : Promise.resolve(false);

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

  /**
   * Retrieves a user's profile as a UserDto by their ID. Logs the profile view.
   * @param userId - The ID of the user whose profile is requested.
   * @param {number} [viewerId] - The ID of the user viewing the profile (optional).
   * @param ip - The IP address of the viewer.
   * @param {string} [userAgent] - The user agent of the viewer (optional).
   * @returns The UserDto for the requested user.
   * @throws UserIdNotFoundError
   */
  async getUserDtoById(
    userId: number,
    ip: string,
    viewerId?: number,
    userAgent?: string,
  ): Promise<UserDto> {
    const [user, profile] = await this.findUserRecordAndProfileRecordOrThrow(userId);

    // Log the profile view attempt
    await this.prismaService.userProfileQueryLog.create({
      data: {
        viewerId, // Can be null if viewer is not logged in
        vieweeId: user.id,
        ip,
        userAgent,
      },
    });

    return await this.toUserDto(user, profile, viewerId);
  }

  /**
   * Authenticates a user with username and password. Creates a session on success.
   * Logs the login attempt.
   * @param username - The username.
   * @param password - The password.
   * @param ip - The IP address of the login attempt.
   * @param {string} [userAgent] - The user agent of the login attempt (optional).
   * @returns A Promise resolving to a tuple containing the UserDto and a refresh token.
   * @throws UsernameNotFoundError
   * @throws PasswordNotMatchError
   */
  async login(
    username: string,
    password: string,
    ip: string,
    userAgent?: string,
  ): Promise<[UserDto, string]> {
    const user = await this.findUserRecordByUsernameOrThrow(username);

    if (!bcrypt.compareSync(password, user.hashedPassword)) {
       // Log failed login attempt
       await this.prismaService.userLoginLog.create({
          data: { userId: user.id, ip, userAgent },
       });
      throw new PasswordNotMatchError(username);
    }

    // Login successful. Log success.
    await this.prismaService.userLoginLog.create({
      data: {
        userId: user.id,
        ip,
        userAgent,
      },
    });

    // Fetch DTO and create session concurrently
    const userDtoPromise = this.getUserDtoById(user.id, ip, user.id, userAgent); // viewerId is self
    const refreshTokenPromise = this.createSession(user.id);

    const [userDto, refreshToken] = await Promise.all([userDtoPromise, refreshTokenPromise]);

    return [userDto, refreshToken];
  }

  /**
   * Creates a new session (refresh token) for a given user ID.
   * @param userId - The ID of the user for whom to create the session.
   * @returns A Promise resolving to the generated refresh token.
   */
  private async createSession(userId: number): Promise<string> {
    const authorization: Authorization =
      await this.usersPermissionService.getAuthorizationForUser(userId);
    return this.sessionService.createSession(userId, authorization);
  }

  /**
   * Sends a password reset email containing a time-limited token to the user's email address.
   * Logs the request attempt.
   * @param email - The email address to send the reset link to.
   * @param ip - The IP address of the requester.
   * @param {string} [userAgent] - The user agent of the requester (optional).
   * @throws InvalidEmailAddressError
   * @throws InvalidEmailSuffixError
   * @throws EmailNotFoundError
   * @throws EmailSendFailedError
   */
  async sendResetPasswordEmail(
    email: string,
    ip: string,
    userAgent: string | undefined,
  ): Promise<void> {
    if (!isEmail(email)) {
      // No user ID known yet, log without it
      await this.createPasswordResetLog( UserResetPasswordLogType.RequestFailDueToNoneExistentEmail, undefined, ip, userAgent );
      throw new InvalidEmailAddressError(email);
    }
    if (!(await this.emailRuleService.isEmailSuffixSupported(email))) {
       await this.createPasswordResetLog( UserResetPasswordLogType.RequestFailDueToNoneExistentEmail, undefined, ip, userAgent );
      throw new InvalidEmailSuffixError(email, this.emailSuffixRule);
    }

    // Find active user by email
    const user = await this.prismaService.user.findUnique({
      where: { email, deletedAt: null },
    });

    if (user == undefined) {
      await this.createPasswordResetLog( UserResetPasswordLogType.RequestFailDueToNoneExistentEmail, undefined, ip, userAgent );
      throw new EmailNotFoundError(email);
    }

    // Generate a specific, short-lived token for password reset action
    const token = this.authService.sign(
      {
        userId: user.id,
        permissions: [
          {
            authorizedActions: ['modify'],
            authorizedResource: {
              ownedByUser: user.id,
              types: ['users/password:reset'], // Specific resource type for reset
              resourceIds: undefined, // Not tied to specific resource ID
              data: Date.now(), // Include timestamp to help prevent reuse (optional)
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
      await this.createPasswordResetLog( UserResetPasswordLogType.RequestSuccess, user.id, ip, userAgent );
    } catch (e) {
       await this.createPasswordResetLog( UserResetPasswordLogType.RequestFailDueToSendEmailFailure, user.id, ip, userAgent );
       Logger.error(`Failed to send password reset email to ${email}: ${e instanceof Error ? e.message : e}`, e instanceof Error ? e.stack : undefined);
      throw new EmailSendFailedError(email);
    }
  }

  /**
   * Verifies a password reset token and updates the user's password if the token is valid and authorized.
   * Logs the attempt status.
   * @param token - The password reset token received via email.
   * @param newPassword - The new password to set.
   * @param ip - The IP address of the requester.
   * @param {string} [userAgent] - The user agent of the requester (optional).
   * @throws PermissionDeniedError (if token invalid/permissions wrong)
   * @throws TokenExpiredError (if token expired)
   * @throws InvalidPasswordError (if new password invalid)
   * @throws Error (if user associated with valid token not found - internal error)
   */
  async verifyAndResetPassword(
    token: string,
    newPassword: string,
    ip: string,
    userAgent: string | undefined,
  ): Promise<void> {
    let userId: number | undefined = undefined;
    try {
      // Decode user ID first for logging purposes, even if token validation fails later.
      userId = this.authService.decode(token).authorization.userId;

      // Audit the token for permission ('modify'), target user (userId), resource type, and validity.
      await this.authService.audit(
        token,
        'modify',
        userId,
        'users/password:reset',
        undefined, // No specific resource ID
      );
    } catch (e) {
      // Log specific failures based on error type
      if (e instanceof PermissionDeniedError) {
        await this.createPasswordResetLog( UserResetPasswordLogType.FailDueToInvalidToken, userId, ip, userAgent );
        Logger.warn( `Permission denied during password reset: token = "${token}", ip = "${ip}", userAgent = "${userAgent}"` );
      } else if (e instanceof TokenExpiredError) {
        await this.createPasswordResetLog( UserResetPasswordLogType.FailDueToExpiredRequest, userId, ip, userAgent );
      } else {
         // Log unexpected errors during token validation
         await this.createPasswordResetLog( UserResetPasswordLogType.FailDueToInvalidToken, userId, ip, userAgent ); // Or a more generic error type
         Logger.error(`Unexpected error during password reset token audit: ${e instanceof Error ? e.message : e}`, e instanceof Error ? e.stack : undefined);
      }
      throw e; // Re-throw the error after logging
    }

    // Token is valid and authorized, proceed with password reset.
    if (!this.isValidPassword(newPassword)) {
      // Log failure due to invalid password format
      await this.createPasswordResetLog( UserResetPasswordLogType.FailDueToInvalidPassword, userId, ip, userAgent ); // Assuming this type exists
      throw new InvalidPasswordError(this.passwordRule);
    }

    // Re-fetch user to ensure they still exist and are active (though audit should imply existence)
    const user = await this.prismaService.user.findUnique({
      where: { id: userId, deletedAt: null },
    });

    /* istanbul ignore if */ // Should not happen if token validation passed and user wasn't deleted concurrently.
    if (user == undefined) {
      await this.createPasswordResetLog( UserResetPasswordLogType.FailDueToNoUser, userId, ip, userAgent );
      Logger.error(`Password reset authorized for user ${userId}, but user not found or inactive.`);
      throw new Error( `User associated with the valid reset token (ID: ${userId}) could not be found or is inactive.` );
    }

    // Hash the new password and update the user record
    const salt = bcrypt.genSaltSync(10);
    const hashedPassword = bcrypt.hashSync(newPassword, salt);

    await this.prismaService.user.update({
      where: { id: userId },
      data: { hashedPassword },
    });

    // Log successful password reset
    await this.createPasswordResetLog( UserResetPasswordLogType.Success, userId, ip, userAgent );
  }

  /**
   * Updates an active user's profile information (nickname, intro, avatar).
   * Handles avatar usage counts atomically.
   * @param userId - The ID of the user whose profile is being updated.
   * @param nickname - The new nickname.
   * @param intro - The new introduction text.
   * @param avatarId - The ID of the new avatar.
   * @throws UserIdNotFoundError (if user doesn't exist or is inactive)
   * @throws AvatarNotFoundError (if the new avatarId doesn't exist)
   * @throws InvalidNicknameError
   */
  async updateUserProfile(
    userId: number,
    nickname: string,
    intro: string,
    avatarId: number,
  ): Promise<void> {
     if (!this.isValidNickname(nickname)) {
      throw new InvalidNicknameError(nickname, this.nicknameRule);
    }

    // Use transaction to ensure atomicity of profile update and avatar counts
    await this.prismaService.$transaction(async (prisma) => {
      // Find existing profile and verify user/avatar concurrently
      const profilePromise = prisma.userProfile.findUnique({ where: { userId } });
      const avatarExistsPromise = this.avatarsService.isAvatarExists(avatarId); // Use non-prisma instance here
      const userExistsPromise = this.isUserExists(userId); // Use non-prisma instance here

      const [profile, avatarExists, userExists] = await Promise.all([
          profilePromise,
          avatarExistsPromise,
          userExistsPromise
      ]);

      if (!userExists) {
          throw new UserIdNotFoundError(userId); // Throw before profile check
      }
      if (profile == null) {
          // This case implies data inconsistency if userExists is true
          Logger.error(`User ${userId} exists but profile is missing during update attempt.`);
          throw new Error(`Profile not found for user ${userId}.`);
      }
      if (!avatarExists) {
        throw new AvatarNotFoundError(avatarId);
      }

      // Update profile data
      await prisma.userProfile.update({
        where: { userId },
        data: { nickname, intro, avatarId },
      });

      // Update avatar usage counts if the avatar changed
      if (profile.avatarId !== avatarId) {
        // Use non-prisma AvatarsService instance for these operations
        // Note: These operations might ideally be part of the transaction if AvatarsService used the prisma client instance.
        // For simplicity here, we call them outside the direct transaction scope but after checks.
        // Consider passing the `prisma` client instance to AvatarsService methods if strict atomicity is needed.
        await this.avatarsService.plusUsageCount(avatarId);
        await this.avatarsService.minusUsageCount(profile.avatarId);
      }
    });
  }

  /**
   * Retrieves a paginated list of active users. Uses cursor-based pagination based on user ID.
   * @param {number} [firstUserId] - The ID of the first user on the current page (cursor). Undefined to start from the beginning.
   * @param pageSize - The maximum number of users to retrieve per page.
   * @param {number} [viewerId] - The ID of the user viewing the list (optional), used for `is_follow` status.
   * @param ip - The IP address of the requester (used for logging/auditing, though not explicitly logged here).
   * @param {string} [userAgent] - The user agent of the requester (optional).
   * @returns A Promise resolving to a tuple containing an array of UserDto objects for the current page and pagination metadata (PageDto).
   */
  async getUsers(
    firstUserId?: number,
    pageSize: number = 10, // Default page size
    viewerId?: number,
    ip?: string, // Mark as optional if not always used/required
    userAgent?: string,
  ): Promise<[UserDto[], PageDto]> {

    const commonWhere = { deletedAt: null }; // Filter for active users

    if (firstUserId === undefined) {
      // Fetch initial page
      const users = await this.prismaService.user.findMany({
        where: commonWhere,
        take: pageSize + 1, // Fetch one extra to check for next page
        orderBy: { id: 'asc' },
        include: { userProfile: true }, // Include profile for DTO conversion
      });
      const DTOs = await Promise.all(
        users.map((u) => {
          assert(u.userProfile, `User ${u.id} is missing profile in getUsers query.`);
          return this.toUserDto(u, u.userProfile, viewerId);
        }),
      );
      // TODO: Log user list access if needed
      return PageHelper.PageStart(DTOs, pageSize, (item) => item.id);
    } else {
      // Fetch middle page using cursor
      const prevUsersPromise = this.prismaService.user.findMany({
        where: { ...commonWhere, id: { lt: firstUserId } },
        take: pageSize, // Max needed for prev check
        orderBy: { id: 'desc' },
        select: { id: true }, // Only need ID for PageHelper's prev check
      });
      const currentAndNextUsersPromise = this.prismaService.user.findMany({
        where: { ...commonWhere, id: { gte: firstUserId } },
        take: pageSize + 1, // Fetch one extra for next page check
        orderBy: { id: 'asc' },
        include: { userProfile: true }, // Include profile for DTO conversion
      });

      const [prevUsers, currentAndNextUsers] = await Promise.all([
          prevUsersPromise,
          currentAndNextUsersPromise
      ]);

      const DTOs = await Promise.all(
        currentAndNextUsers.map((u) => {
           assert(u.userProfile, `User ${u.id} is missing profile in getUsers query.`);
          return this.toUserDto(u, u.userProfile, viewerId);
        }),
      );
      // TODO: Log user list access if needed
      return PageHelper.PageMiddle(
        prevUsers, // Pass only the IDs needed by PageHelper
        DTOs,
        pageSize,
        (i) => i.id, // For prev items (User IDs)
        (i) => i.id, // For DTO items (User IDs)
      );
    }
  }

  /**
   * Finds the single active following relationship between two users.
   * Handles potential data inconsistencies by cleaning up duplicate active relationships.
   * @param followerId - The ID of the follower.
   * @param followeeId - The ID of the user being followed.
   * @returns A Promise resolving to the active UserFollowingRelationship record, or undefined if none exists.
   */
  async getUniqueFollowRelationship(
    followerId: number,
    followeeId: number,
  ): Promise<UserFollowingRelationship | undefined> {
    // Find active relationships (deletedAt is null)
    let relationships = await this.prismaService.userFollowingRelationship.findMany({
      where: {
        followerId,
        followeeId,
        deletedAt: null, // Ensure we only get active relationships
      },
    });

    /* istanbul ignore if */ // Handles data inconsistency: multiple active follow records shouldn't exist.
    if (relationships.length > 1) {
      Logger.warn( `Found ${relationships.length} active follow relationships between user ${followerId} and user ${followeeId}. Cleaning up duplicates.` );
      // Keep the latest relationship (assume highest ID is latest) and mark others as deleted.
      const latestRelationship = relationships.sort((a, b) => b.id - a.id)[0];
      await this.prismaService.userFollowingRelationship.updateMany({
        where: {
          followerId,
          followeeId,
          id: { not: latestRelationship.id }, // Target all except the latest
          deletedAt: null, // Only target active duplicates
        },
        data: { deletedAt: new Date() },
      });
      relationships = [latestRelationship]; // Return only the one we kept
    }
    return relationships.length === 0 ? undefined : relationships[0];
  }

  /**
   * Creates an active following relationship between two users.
   * @param followerId - The ID of the user initiating the follow.
   * @param followeeId - The ID of the user being followed.
   * @throws FollowYourselfError
   * @throws UserIdNotFoundError (if either user doesn't exist or is inactive)
   * @throws UserAlreadyFollowedError (if already actively following)
   */
  async addFollowRelationship(
    followerId: number,
    followeeId: number,
  ): Promise<void> {
    if (followerId === followeeId) {
      throw new FollowYourselfError();
    }

    // Use Promise.all for concurrent user existence checks.
    const [followerExists, followeeExists] = await Promise.all([
      this.isUserExists(followerId),
      this.isUserExists(followeeId),
    ]);

    if (!followerExists) throw new UserIdNotFoundError(followerId);
    if (!followeeExists) throw new UserIdNotFoundError(followeeId);

    // Check if an active relationship already exists.
    const existingRelationship = await this.getUniqueFollowRelationship( followerId, followeeId );
    if (existingRelationship) {
      throw new UserAlreadyFollowedError(followeeId);
    }

    // If no active relationship exists, create a new one.
    // Note: This doesn't explicitly reactivate previously deleted records,
    // it always adds a new entry for a new follow action. Consider upsert if reactivation is desired.
    await this.prismaService.userFollowingRelationship.create({
      data: { followerId, followeeId },
    });
    // TODO: Consider emitting an event or notification here.
  }

  /**
   * Deletes (soft deletes) an active following relationship.
   * @param followerId - The ID of the follower.
   * @param followeeId - The ID of the user being unfollowed.
   * @throws UserNotFollowedYetError (if no active relationship exists between the users)
   * @throws UserIdNotFoundError (if either user doesn't exist - checked implicitly by UserNotFollowedYetError logic)
   */
  async deleteFollowRelationship(
    followerId: number,
    followeeId: number,
  ): Promise<void> {
     if (followerId === followeeId) {
        // Technically not possible to follow self based on addFollowRelationship logic, but good practice to check.
        throw new UserNotFollowedYetError(followeeId); // Or a different error?
    }

    // Find the specific active relationship to delete.
    const relationship = await this.getUniqueFollowRelationship( followerId, followeeId );

    if (relationship === undefined) {
      // Before throwing, quickly check if users exist to provide a slightly better context, though not strictly necessary.
      // const [followerExists, followeeExists] = await Promise.all([this.isUserExists(followerId), this.isUserExists(followeeId)]);
      // if (!followerExists) throw new UserIdNotFoundError(followerId);
      // if (!followeeExists) throw new UserIdNotFoundError(followeeId);
      // If users exist but relationship doesn't, it means they weren't following.
      throw new UserNotFollowedYetError(followeeId);
    }

    // Soft delete the specific active relationship found.
    await this.prismaService.userFollowingRelationship.update({
      where: { id: relationship.id }, // Target the specific relationship ID
      data: { deletedAt: new Date() },
    });
     // TODO: Consider emitting an event or notification here.
  }

  /**
   * Retrieves a paginated list of active users who follow a given user (followers).
   * Uses cursor-based pagination based on the follower's user ID.
   * @param followeeId - The ID of the user whose followers are being requested.
   * @param {number} [firstFollowerId] - The ID of the first follower on the current page (cursor). Undefined for the first page.
   * @param pageSize - The maximum number of followers per page.
   * @param {number} [viewerId] - The ID of the user viewing the list (optional), for `is_follow` status in DTOs.
   * @param ip - The IP address of the requester (for logging/auditing).
   * @param {string} [userAgent] - The user agent of the requester (optional).
   * @returns A Promise resolving to a tuple containing an array of UserDto objects (followers) and pagination metadata.
   * @throws UserIdNotFoundError (if followee user doesn't exist or is inactive)
   */
  async getFollowers(
    followeeId: number,
    ip: string,
    firstFollowerId?: number,
    pageSize: number = 10,
    viewerId?: number,
    userAgent?: string,
  ): Promise<[UserDto[], PageDto]> {
    // Ensure the followee user exists and is active.
    if (!(await this.isUserExists(followeeId))) {
      throw new UserIdNotFoundError(followeeId);
    }

    const commonWhere = { followeeId, deletedAt: null }; // Base query for active followers

    // TODO: Log follower list access attempt here if needed, including followeeId, viewerId, ip.

    if (firstFollowerId === undefined) {
      // Fetch initial page
      const relations = await this.prismaService.userFollowingRelationship.findMany({
        where: commonWhere,
        take: pageSize + 1,
        orderBy: { followerId: 'asc' },
      });
      const DTOs = await Promise.all(
        relations.map((r) => {
          return this.getUserDtoById(r.followerId, ip, viewerId, userAgent);
        }),
      );
      return PageHelper.PageStart(DTOs, pageSize, (item) => item.id);
    } else {
      // Fetch middle page using cursor
      const prevRelationsPromise = this.prismaService.userFollowingRelationship.findMany({
        where: { ...commonWhere, followerId: { lt: firstFollowerId } },
        take: pageSize,
        orderBy: { followerId: 'desc' },
        select: { followerId: true }, // Only need ID for PageHelper
      });
      const currentAndNextRelationsPromise = this.prismaService.userFollowingRelationship.findMany({
        where: { ...commonWhere, followerId: { gte: firstFollowerId } },
        take: pageSize + 1,
        orderBy: { followerId: 'asc' },
      });

      const [prevRelations, currentAndNextRelations] = await Promise.all([
          prevRelationsPromise,
          currentAndNextRelationsPromise
      ]);

      const DTOs = await Promise.all(
        currentAndNextRelations.map((r) => {
          return this.getUserDtoById(r.followerId, ip, viewerId, userAgent);
        }),
      );
      return PageHelper.PageMiddle(
        prevRelations,
        DTOs,
        pageSize,
        (i) => i.followerId, // ID from prev items
        (i) => i.id,         // User ID from DTO items
      );
    }
  }

  /**
   * Retrieves a paginated list of active users whom a given user follows (followees).
   * Uses cursor-based pagination based on the followee's user ID.
   * @param followerId - The ID of the user whose followees are being requested.
   * @param {number} [firstFolloweeId] - The ID of the first followee on the current page (cursor). Undefined for the first page.
   * @param pageSize - The maximum number of followees per page.
   * @param {number} [viewerId] - The ID of the user viewing the list (optional), for `is_follow` status in DTOs.
   * @param ip - The IP address of the requester (for logging/auditing).
   * @param {string} [userAgent] - The user agent of the requester (optional).
   * @returns A Promise resolving to a tuple containing an array of UserDto objects (followees) and pagination metadata.
   * @throws UserIdNotFoundError (if follower user doesn't exist or is inactive)
   */
  async getFollowees(
    followerId: number,
    ip: string,
    firstFolloweeId?: number,
    pageSize: number = 10,
    viewerId?: number,
    userAgent?: string,
  ): Promise<[UserDto[], PageDto]> {
    // Ensure the follower user exists and is active.
    if (!(await this.isUserExists(followerId))) {
      throw new UserIdNotFoundError(followerId);
    }

    const commonWhere = { followerId, deletedAt: null }; // Base query for active followees

     // TODO: Log followee list access attempt here if needed, including followerId, viewerId, ip.

    if (firstFolloweeId === undefined) {
      // Fetch initial page
      const relations = await this.prismaService.userFollowingRelationship.findMany({
        where: commonWhere,
        take: pageSize + 1,
        orderBy: { followeeId: 'asc' },
      });
      const DTOs = await Promise.all(
        relations.map((r) => {
          return this.getUserDtoById(r.followeeId, ip, viewerId, userAgent);
        }),
      );
      return PageHelper.PageStart(DTOs, pageSize, (item) => item.id);
    } else {
      // Fetch middle page using cursor
      const prevRelationsPromise = this.prismaService.userFollowingRelationship.findMany({
        where: { ...commonWhere, followeeId: { lt: firstFolloweeId } },
        take: pageSize,
        orderBy: { followeeId: 'desc' },
        select: { followeeId: true }, // Only need ID for PageHelper
      });
      const currentAndNextRelationsPromise = this.prismaService.userFollowingRelationship.findMany({
        where: { ...commonWhere, followeeId: { gte: firstFolloweeId } },
        take: pageSize + 1,
        orderBy: { followeeId: 'asc' },
      });

       const [prevRelations, currentAndNextRelations] = await Promise.all([
          prevRelationsPromise,
          currentAndNextRelationsPromise
      ]);

      const DTOs = await Promise.all(
        currentAndNextRelations.map((r) => {
          return this.getUserDtoById(r.followeeId, ip, viewerId, userAgent);
        }),
      );
      return PageHelper.PageMiddle(
        prevRelations,
        DTOs,
        pageSize,
        (i) => i.followeeId, // ID from prev items
        (i) => i.id,         // User ID from DTO items
      );
    }
  }

  /**
   * Checks if a user exists and is not soft-deleted.
   * @param userId - The ID of the user to check.
   * @returns A Promise resolving to true if the user exists and `deletedAt` is null, false otherwise.
   * @suggestion Consider adding caching if this check is frequent and user deletion is rare.
   */
  async isUserExists(userId: number): Promise<boolean> {
    // Assumes soft delete via deletedAt field
    return (await this.prismaService.user.count({ where: { id: userId, deletedAt: null } })) > 0;
  }

  /**
   * Gets the number of active users a given user is following.
   * @param followerId - The ID of the user whose following count is needed.
   * @returns A Promise resolving to the count of active follow relationships where the user is the follower.
   */
  async getFollowingCount(followerId: number): Promise<number> {
    return await this.prismaService.userFollowingRelationship.count({
      where: { followerId, deletedAt: null }, // Only count active relationships
    });
  }

  /**
   * Gets the number of active users who are following a given user.
   * @param followeeId - The ID of the user whose followed count (fans) is needed.
   * @returns A Promise resolving to the count of active follow relationships where the user is the followee.
   */
  async getFollowedCount(followeeId: number): Promise<number> {
    return await this.prismaService.userFollowingRelationship.count({
      where: { followeeId, deletedAt: null }, // Only count active relationships
    });
  }

  /**
   * Checks if a user is actively following another user.
   * @param {number} [followerId] - The ID of the potential follower (optional).
   * @param {number} [followeeId] - The ID of the potential followee (optional).
   * @returns A Promise resolving to true if followerId is actively following followeeId, false otherwise (including if IDs are undefined or the same).
   */
  async isUserFollowUser(
    followerId?: number,
    followeeId?: number,
  ): Promise<boolean> {
    if (followerId === undefined || followeeId === undefined || followerId === followeeId) {
      return false;
    }
    const result = await this.prismaService.userFollowingRelationship.count({
      where: { followerId, followeeId, deletedAt: null }, // Check only active relationships
    });
    return result > 0;
  }

  /**
   * Handles user login or registration via an OAuth provider.
   * Flow:
   * 1. Check for existing OAuth connection (providerId + providerUserId).
   * 2. If found & linked user is active -> Login user.
   * 3. If not found/linked user deleted -> Check for active user by email from OAuth info.
   * 4. If active user found by email -> Link OAuth connection to this user & Login user.
   * 5. If no user found -> Create new user, profile, link OAuth connection & Login user.
   * Handles potential username conflicts during new user creation.
   * Logs the login attempt and creates a session.
   *
   * @param providerId - The identifier of the OAuth provider (e.g., 'google', 'github').
   * @param userInfo - User information obtained from the OAuth provider (`id` is required).
   * @param ip - The IP address of the user.
   * @param {string} [userAgent] - The user agent of the user (optional).
   * @returns A Promise resolving to a tuple containing the UserDto and a refresh token.
   * @throws Error if an internal error occurs (e.g., profile missing for existing user).
   */
  async loginWithOAuth(
    providerId: string,
    userInfo: OAuthUserInfo,
    ip: string,
    userAgent: string | undefined,
  ): Promise<[UserDto, string]> {
    let user: User;
    let profile: UserProfile;

    // 1. Check for existing OAuth connection to an active user
    const oauthConnection = await this.prismaService.userOAuthConnection.findUnique({
      where: {
        providerId_providerUserId: { providerId, providerUserId: userInfo.id },
      },
      include: { user: { include: { userProfile: true } } }, // Include linked user and profile
    });

    // 2. If connection exists and user is active, use this user
    if (oauthConnection?.user && !oauthConnection.user.deletedAt) {
      user = oauthConnection.user;
      if (!oauthConnection.user.userProfile) {
        // Handle edge case: user exists but profile is missing
        Logger.error(`OAuth Login: User ${user.id} found via connection but missing profile! Recreating default.`);
        const avatarId = await this.avatarsService.getDefaultAvatarId();
        profile = await this.prismaService.userProfile.upsert({ // Use upsert just in case it was created concurrently
            where: { userId: user.id },
            update: {}, // No update needed if found
            create: { userId: user.id, nickname: user.username, intro: this.defaultIntro, avatarId }
        });
      } else {
        profile = oauthConnection.user.userProfile;
      }
      // Optional: Consider updating nickname/avatar from OAuth info here if desired.
      // Be cautious about overwriting user's explicit choices.
    } else {
      // 3. No valid connection found. Try finding an active user by email.
      let existingUserByEmail: (User & { userProfile: UserProfile | null }) | null = null;
      if (userInfo.email) {
        existingUserByEmail = await this.prismaService.user.findUnique({
          where: { email: userInfo.email, deletedAt: null }, // Must be active
          include: { userProfile: true },
        });
      }

      // 4. If active user found by email, link OAuth and use this user
      if (existingUserByEmail) {
        user = existingUserByEmail;
        if (!existingUserByEmail.userProfile) {
          // Handle edge case: user exists but profile is missing
           Logger.error(`OAuth Login: User ${user.id} found via email but missing profile! Recreating default.`);
           const avatarId = await this.avatarsService.getDefaultAvatarId();
           profile = await this.prismaService.userProfile.upsert({
                where: { userId: user.id }, update: {},
                create: { userId: user.id, nickname: user.username, intro: this.defaultIntro, avatarId }
            });
        } else {
          profile = existingUserByEmail.userProfile;
        }
        // Create or update the OAuth connection link for this user
        await this.prismaService.userOAuthConnection.upsert({
          where: { providerId_providerUserId: { providerId, providerUserId: userInfo.id } },
          update: { userId: user.id, rawProfile: userInfo }, // Update link if it pointed elsewhere
          create: { providerId, providerUserId: userInfo.id, userId: user.id, rawProfile: userInfo },
        });
         Logger.log(`OAuth Login: Linked existing user ${user.id} (found by email) to ${providerId} ID ${userInfo.id}.`);
      } else {
        // 5. No existing active user found, create a new one
        // Generate a unique username based on OAuth info, handling conflicts
        let baseUsername = userInfo.preferredUsername || userInfo.name || `user_${userInfo.id}`;
        baseUsername = baseUsername.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase(); // Sanitize
        if (baseUsername.length < 4) baseUsername = `user_${baseUsername}`; // Ensure min length
        if (baseUsername.length > 32) baseUsername = baseUsername.substring(0, 32); // Ensure max length

        let finalUsername = baseUsername;
        let suffix = 1;
        while (await this.isUsernameRegistered(finalUsername)) {
          const suffixStr = `_${suffix++}`;
          const maxBaseLength = 32 - suffixStr.length;
          finalUsername = baseUsername.substring(0, maxBaseLength) + suffixStr;
        }
        const uniqueUsername = finalUsername;

        // Generate a secure random password for the new account (user likely won't use it directly)
        const randomPassword = this.generateRandomPassword();
        const salt = bcrypt.genSaltSync(10);
        const hashedPassword = bcrypt.hashSync(randomPassword, salt);
        const avatarId = await this.avatarsService.getDefaultAvatarId();

        // Create user, profile, and OAuth connection within a transaction
        try {
            const newUser = await this.prismaService.$transaction(async (prisma) => {
              const createdUser = await prisma.user.create({
                data: {
                  username: uniqueUsername,
                  email: userInfo.email || '', // Use email from OAuth or empty string
                  hashedPassword,
                  userProfile: {
                    create: {
                      nickname: userInfo.name || uniqueUsername, // Use OAuth name or generated username
                      intro: this.defaultIntro,
                      avatarId,
                    },
                  },
                },
                include: { userProfile: true }, // Include the created profile
              });

              // Create the OAuth connection link
              await prisma.userOAuthConnection.create({
                data: { providerId, providerUserId: userInfo.id, userId: createdUser.id, rawProfile: userInfo },
              });

              return createdUser;
            });

            user = newUser;
            assert(newUser.userProfile, "User profile should have been created in transaction");
            profile = newUser.userProfile;

            // Log successful OAuth registration
            await this.createUserRegisterLog( UserRegisterLogType.SuccessViaOAuth, user.email || 'N/A', ip, userAgent ); // Assuming this type exists
            Logger.log(`OAuth Login: Created new user ${user.id} (${user.username}) via ${providerId}.`);

        } catch (error) {
             Logger.error(`OAuth Login: Failed to create new user via transaction: ${error instanceof Error ? error.message : error}`, error instanceof Error ? error.stack : undefined);
             // Rethrow a generic error or handle appropriately
             throw new Error("Failed to register user via OAuth.");
        }
      }
    }

    // Log the successful login event
    await this.prismaService.userLoginLog.create({
      data: {
        userId: user.id,
        ip,
        userAgent,
      },
    });

    // Create session (refresh token)
    const refreshToken = await this.createSession(user.id);

    // Convert to DTO for response
    const userDto = await this.toUserDto(user, profile, user.id); // viewerId is self

    return [userDto, refreshToken];
  }

  /**
   * Generates a random password string using cryptographically secure methods.
   * Suitable for generating initial passwords for accounts created via OAuth.
   * @returns A randomly generated password string (16 characters).
   */
  private generateRandomPassword(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()';
    const passwordLength = 16;
    let password = '';

    // Use crypto.randomInt for secure random index generation
    for (let i = 0; i < passwordLength; i++) {
      const randomIndex = crypto.randomInt(0, chars.length);
      password += chars[randomIndex];
    }

    // Note: While highly likely, this doesn't strictly guarantee the password meets
    // the isValidPassword complexity rules (e.g., must have digit, special char).
    // For internally generated passwords not exposed to users, this is usually acceptable.
    // If strict compliance is needed, add a check and regenerate if necessary.

    return password;
  }
}
