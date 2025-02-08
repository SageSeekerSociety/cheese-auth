/*
 *  Description: This file defines the users module.
 *
 *  Author(s):
 *      Nictheboy Li    <nictheboy@outlook.com>
 *
 */

import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AvatarsModule } from '../avatars/avatars.module';
import { PrismaModule } from '../common/prisma/prisma.module';
import { EmailModule } from '../email/email.module';
import { UsersPermissionService } from './users-permission.service';
import { UsersRegisterRequestService } from './users-register-request.service';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { RolePermissionService } from './role-permission.service';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [PrismaModule, ConfigModule, EmailModule, AuthModule, AvatarsModule],
  controllers: [UsersController],
  providers: [
    UsersService,
    UsersPermissionService,
    UsersRegisterRequestService,
    RolePermissionService,
  ],
  exports: [UsersService],
})
export class UsersModule {}
