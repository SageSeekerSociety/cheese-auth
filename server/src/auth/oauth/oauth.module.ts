/*
 *  Description: OAuth module
 */

import { DynamicModule, Module } from '@nestjs/common';
import { OAuthService } from './oauth.service';
import { OAuthProvider } from '@sageseekersociety/cheese-auth-oauth-types';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [
    ConfigModule,
  ],
  controllers: [],
  providers: [OAuthService],
  exports: [OAuthService],
})
export class OAuthModule {
  /**
   * 使用静态方法注册OAuth提供程序
   * @param providers OAuth提供程序列表
   */
  static register(providers: OAuthProvider[] = []): DynamicModule {
    return {
      module: OAuthModule,
      imports: [
        ConfigModule,
      ],
      controllers: [],
      providers: [
        OAuthService,
        ...providers.map(provider => ({
          provide: `OAUTH_PROVIDER_${provider.getConfig().id.toUpperCase()}`,
          useValue: provider,
        })),
        {
          provide: 'OAUTH_PROVIDERS',
          useFactory: (oauthService: OAuthService, ...providerInstances: OAuthProvider[]) => {
            // 注册所有提供程序实例
            for (const provider of providerInstances) {
              oauthService.registerProvider(provider);
            }
            return providerInstances;
          },
          inject: [
            OAuthService,
            ...providers.map(
              provider => `OAUTH_PROVIDER_${provider.getConfig().id.toUpperCase()}`
            ),
          ],
        },
      ],
      exports: [OAuthService],
    };
  }
} 