import { ConfigService } from '@nestjs/config';

export default () => {
  return {
    port: parseInt(process.env.PORT || '8080', 10),
    jwt: {
      secret: process.env.JWT_SECRET,
      // expiresIn: process.env.JWT_EXPIRES_IN,
    },
    cookieBasePath: process.env.COOKIE_BASE_PATH || '/',
    frontendBaseUrl: process.env.FRONTEND_BASE_URL || '',
    passwordResetPath:
      process.env.PASSWORD_RESET_PREFIX ||
      '/account/recover/password/verify?token=',
  };
};
