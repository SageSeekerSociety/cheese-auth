import { ConfigService } from '@nestjs/config';

export default () => {
  return {
    port: parseInt(process.env.PORT || '8080', 10),
    nodeEnv: process.env.NODE_ENV || 'development',
    jwt: {
      secret: process.env.JWT_SECRET,
      // expiresIn: process.env.JWT_EXPIRES_IN,
    },
    disableEmailVerification: process.env.DISABLE_EMAIL_VERIFICATION === 'true',
    cookieBasePath: process.env.COOKIE_BASE_PATH || '/',
    frontendBaseUrl: process.env.FRONTEND_BASE_URL || '',
    passwordResetPath:
      process.env.PASSWORD_RESET_PREFIX ||
      '/account/recover/password/verify?token=',
    frontendOAuthSuccessPath:
      process.env.FRONTEND_OAUTH_SUCCESS_PATH || '/oauth-success',
    frontendOAuthErrorPath:
      process.env.FRONTEND_OAUTH_ERROR_PATH || '/oauth-error',
  };
};
