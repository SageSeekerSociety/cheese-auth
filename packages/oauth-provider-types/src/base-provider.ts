import { OAuthProvider, OAuthProviderConfig } from './provider';
import { OAuthUserInfo } from './user-info';

/**
 * Base OAuth Provider Abstract Class
 * 
 * Provides common OAuth flow implementation, subclasses only need to implement 
 * specific user information retrieval methods.
 */
export abstract class BaseOAuthProvider implements OAuthProvider {
  /**
   * Constructor
   * @param config OAuth provider configuration
   */
  protected constructor(protected readonly config: OAuthProviderConfig) {}

  /**
   * Get provider configuration
   * @returns Provider configuration
   */
  getConfig(): OAuthProviderConfig {
    return this.config;
  }

  /**
   * Generate authorization URL
   * @param state Optional state parameter for CSRF protection
   * @param accessType Optional access type, used for mobile/desktop apps requiring offline access
   * @returns Complete authorization URL
   */
  getAuthorizationUrl(state?: string, accessType?: string): string {
    const url = new URL(this.config.authorizationUrl);
    url.searchParams.append('client_id', this.config.clientId);
    url.searchParams.append('redirect_uri', this.config.redirectUrl);
    url.searchParams.append('response_type', 'code');
    url.searchParams.append('scope', this.config.scope.join(' '));
    
    if (state) {
      url.searchParams.append('state', state);
    }
    
    if (accessType) {
      url.searchParams.append('access_type', accessType);
    }
    
    return url.toString();
  }

  /**
   * Handle OAuth callback, exchange authorization code for access token
   * @param code Authorization code
   * @param state State parameter for verification
   * @returns Access token
   */
  abstract handleCallback(code: string, state?: string): Promise<string>;

  /**
   * Get user information
   * @param accessToken Access token
   * @returns User information
   */
  abstract getUserInfo(accessToken: string): Promise<OAuthUserInfo>;
} 