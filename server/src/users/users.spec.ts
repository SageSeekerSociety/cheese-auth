/*
 *  Description: This file provide additional tests to users module.
 *
 *  Author(s):
 *      Nictheboy Li    <nictheboy@outlook.com>
 *
 */

import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '../app.module';
import { UsersService } from '../users/users.service';
import { UserIdNotFoundError } from './users.error';

describe('Users Module', () => {
  let app: TestingModule;
  let usersService: UsersService;
  beforeAll(async () => {
    app = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    usersService = app.get<UsersService>(UsersService);
  });
  afterAll(async () => {
    await app.close();
  });

  it('should wait until user with id 1 exists', async () => {
    /* eslint-disable no-constant-condition */
    while (true) {
      try {
        await usersService.getUserDtoById(1, 1, '127.0.0.1', 'some user agent');
      } catch (e) {
        // wait one second
        await new Promise((resolve) => setTimeout(resolve, 1000));
        continue;
      }
      break;
    }
  });

  it('should return UserIdNotFoundError', async () => {
    await expect(usersService.addFollowRelationship(-1, 1)).rejects.toThrow(
      new UserIdNotFoundError(-1),
    );
    await expect(usersService.addFollowRelationship(1, -1)).rejects.toThrow(
      new UserIdNotFoundError(-1),
    );
  });

  it('should return UserIdNotFoundError', async () => {
    await expect(
      usersService.updateUserProfile(-1, 'nick', 'int', 1),
    ).rejects.toThrow(new UserIdNotFoundError(-1));
  });

  it('should return zero', async () => {
    // expect(await usersService.getFollowingCount(undefined)).toBe(0);
    // expect(await usersService.getFollowedCount(undefined)).toBe(0);
    // expect(await usersService.getAnswerCount(undefined)).toBe(0);
    // expect(await usersService.getQuestionCount(undefined)).toBe(0);
    expect(await usersService.isUserFollowUser(undefined, 1)).toBe(false);
    expect(await usersService.isUserFollowUser(1, undefined)).toBe(false);
  });
});
