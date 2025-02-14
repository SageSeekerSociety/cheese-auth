import { Module, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { ServeStaticModule } from '@nestjs/serve-static';
import { AvatarsModule } from './avatars/avatars.module';
import configuration from './common/config/configuration';
import { BaseErrorExceptionFilter } from './common/error/error-filter';
import { EnsureGuardInterceptor } from './common/interceptor/ensure-guard.interceptor';
import { TokenValidateInterceptor } from './common/interceptor/token-validate.interceptor';
import { UsersModule } from './users/users.module';
import { StatusModule } from './common/status/status.module';
@Module({
  imports: [
    ConfigModule.forRoot({ load: [configuration] }),
    UsersModule,
    AvatarsModule,
    ServeStaticModule.forRoot({
      rootPath: process.env.FILE_UPLOAD_PATH,
      serveRoot: '/static',
    }),
    StatusModule,
  ],
  controllers: [],
  providers: [
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({
        transform: true,
        disableErrorMessages: false,
      }),
    },
    {
      provide: APP_FILTER,
      useClass: BaseErrorExceptionFilter,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: TokenValidateInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: EnsureGuardInterceptor,
    },
  ],
})
export class AppModule {}
