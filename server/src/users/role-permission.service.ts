import { Injectable } from '@nestjs/common';
import { Authorization } from '../auth/definitions';

@Injectable()
export class RolePermissionService {
  async getAuthorizationForUserWithRole(
    userId: number,
    roleName: string,
  ): Promise<Authorization> {
    switch (roleName) {
      case 'standard-user':
        return await this.getAuthorizationForStandardUser(userId);
      /* istanbul ignore next */
      default:
        throw new Error(`Role ${roleName} is not supported.`);
    }
  }

  private async getAuthorizationForStandardUser(
    userId: number,
  ): Promise<Authorization> {
    return {
      userId: userId,
      permissions: [
        {
          authorizedActions: [
            'query',
            'follow',
            'unfollow',
            'enumerate',
            'enumerate-followers',
            'enumerate-answers',
            'enumerate-questions',
            'enumerate-followed-users',
            'enumerate-followed-questions',
          ],
          authorizedResource: {
            ownedByUser: undefined,
            types: ['user'],
            resourceIds: undefined,
          },
        },
        {
          authorizedActions: ['modify-profile'],
          authorizedResource: {
            ownedByUser: userId,
            types: ['user'],
            resourceIds: undefined,
          },
        },
        {
          authorizedActions: ['create', 'enumerate'],
          authorizedResource: {
            ownedByUser: undefined,
            types: ['avatar'],
            resourceIds: undefined,
          },
        },
      ],
    };
  }
}
