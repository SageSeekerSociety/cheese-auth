import { OAuthUserInfo } from './user-info';

/**
 * OAuth Provider Configuration Interface
 */
export interface OAuthProviderConfig {
  /** Unique identifier, e.g. 'ruc', 'google', etc. */
  id: string;
  
  /** Display name */
  name: string;
  
  /** OAuth client ID */
  clientId: string;
  
  /** OAuth client secret */
  clientSecret: string;
  
  /** Authorization URL */
  authorizationUrl: string;
  
  /** Token URL for retrieving access tokens */
  tokenUrl: string;
  
  /** Redirect URL for OAuth callbacks */
  redirectUrl: string;
  
  /** Required permission scopes */
  scope: string[];
  
  /** Other custom configurations */
  [key: string]: any;
}

/**
 * OAuth Provider Interface
 */
export interface OAuthProvider {
  /**
   * Get provider configuration
   */
  getConfig(): OAuthProviderConfig;
  
  /**
   * Generate authorization URL
   * @param state Optional state parameter for CSRF protection
   * @param accessType Optional access type, used for mobile/desktop apps requiring offline access
   */
  getAuthorizationUrl(state?: string, accessType?: string): string;
  
  /**
   * Handle OAuth callback and exchange authorization code for access token
   * @param code Authorization code
   * @param state State parameter for verification
   */
  handleCallback(code: string, state?: string): Promise<string>;
  
  /**
   * Get user information using access token
   * @param accessToken Access token
   */
  getUserInfo(accessToken: string): Promise<OAuthUserInfo>;
}

/**
 * OAuth Authentication Result
 */
export interface OAuthAuthenticationResult {
  /** User information */
  userInfo: OAuthUserInfo;
  
  /** Access token */
  accessToken: string;
  
  /** Provider ID */
  providerId: string;
}

/**
 * OAuth Error Types
 */
export enum OAuthErrorType {
  /** Authorization denied by user */
  ACCESS_DENIED = 'access_denied',
  
  /** Invalid request */
  INVALID_REQUEST = 'invalid_request',
  
  /** Server error */
  SERVER_ERROR = 'server_error',
  
  /** Unknown error */
  UNKNOWN = 'unknown'
}

/**
 * OAuth Error
 */
export interface OAuthError {
  /** Error type */
  type: OAuthErrorType;
  
  /** Error message */
  message: string;
  
  /** Original error object */
  originalError?: any;
} 