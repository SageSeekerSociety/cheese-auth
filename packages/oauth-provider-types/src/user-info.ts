/**
 * OAuth User Information Interface
 */
export interface OAuthUserInfo {
  /** Unique identifier */
  id: string;
  
  /** User name */
  name?: string;
  
  /** Email address */
  email?: string;
  
  /** Avatar URL */
  avatarUrl?: string;
  
  /** Preferred username, generated or recommended by OAuth provider */
  preferredUsername?: string;
  
  /** Student ID (optional, specific to educational institutions) */
  studentId?: string;
  
  /** School (optional, specific to educational institutions) */
  school?: string;
  
  /** Department (optional, specific to educational institutions) */
  department?: string;
  
  /** Profile records (optional, raw data) */
  profiles?: any[];
  
  /** Raw user information (complete original response) */
  rawUserInfo?: any;
  
  /** Other custom fields */
  [key: string]: any;
}

/**
 * Authentication Method Enum
 */
export enum AuthenticationMethod {
  /** Password authentication */
  PASSWORD = 'password',
  
  /** OAuth authentication */
  OAUTH = 'oauth',
  
  /** Other authentication methods */
  OTHER = 'other'
}

/**
 * User Identity Interface
 */
export interface UserIdentity {
  /** Authentication method */
  method: AuthenticationMethod;
  
  /** Provider ID (if OAuth) */
  providerId?: string;
  
  /** External unique identifier in the provider system */
  externalId?: string;
  
  /** Last login timestamp */
  lastLoginAt?: Date;
  
  /** Creation timestamp */
  createdAt: Date;
  
  /** Last update timestamp */
  updatedAt: Date;
} 