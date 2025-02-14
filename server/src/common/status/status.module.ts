/*
 *  Description: This file defines the status module.
 *
 *  Author(s):
 *      Nictheboy Li    <nictheboy@outlook.com>
 *
 */

import { Module } from '@nestjs/common';
import { StatusController } from './status.controller';

@Module({
  controllers: [StatusController],
})
export class StatusModule { }
