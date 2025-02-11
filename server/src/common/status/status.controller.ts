/*
 *  Description: This file implements the status controller.
 *               It is responsible for handling the requests to /status/...
 *
 *  Author(s):
 *      Nictheboy Li    <nictheboy@outlook.com>
 *
 */

import {
  Controller,
  Get,
} from '@nestjs/common';
import { NoAuth } from '../interceptor/token-validate.interceptor';

@Controller('/status')
export class StatusController {
  @Get('/')
  @NoAuth()
  async sendRegisterEmailCode(
  ) {
    return {
      code: 200,
      message: 'OK',
    };
  }
}
