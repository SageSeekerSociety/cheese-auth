# OAuth Provider Types

Type definitions for OAuth providers used in Cheese Auth project.

## Installation

```bash
npm install @sageseekersociety/cheese-auth-oauth-types
# or
yarn add @sageseekersociety/cheese-auth-oauth-types
# or
pnpm add @sageseekersociety/cheese-auth-oauth-types
```

## Usage

### Importing Types

```typescript
import { 
  OAuthProvider, 
  OAuthProviderConfig, 
  OAuthUserInfo,
  BaseOAuthProvider
} from '@sageseekersociety/cheese-auth-oauth-types';
```

### Implementing Custom OAuth Provider

```typescript
import { BaseOAuthProvider, OAuthProviderConfig, OAuthUserInfo } from '@sageseekersociety/cheese-auth-oauth-types';
import axios from 'axios';

export class CustomOAuthProvider extends BaseOAuthProvider {
  constructor(config: OAuthProviderConfig) {
    super(config);
  }

  async handleCallback(code: string, state?: string): Promise<string> {
    // Implement token retrieval logic
    const response = await axios.post(this.config.tokenUrl, {
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      grant_type: 'authorization_code',
      code
    });
    
    return response.data.access_token;
  }

  async getUserInfo(accessToken: string): Promise<OAuthUserInfo> {
    // Implement user info retrieval logic
    const userResponse = await axios.get('https://api.example.com/user', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    
    return {
      id: userResponse.data.id,
      name: userResponse.data.name,
      email: userResponse.data.email
    };
  }
}
```

## Type Definitions

### OAuthProviderConfig

OAuth provider configuration interface

```typescript
interface OAuthProviderConfig {
  id: string;              // Unique identifier, e.g. 'ruc', 'google'
  name: string;            // Display name
  clientId: string;        // OAuth client ID
  clientSecret: string;    // OAuth client secret
  authorizationUrl: string;// Authorization URL
  tokenUrl: string;        // Token URL
  redirectUrl: string;     // Redirect URL
  scope: string[];         // Required permission scopes
  [key: string]: any;      // Other custom configurations
}
```

### OAuthUserInfo

OAuth user information interface

```typescript
interface OAuthUserInfo {
  id: string;              // Unique identifier
  name?: string;           // User name
  email?: string;          // Email address
  avatarUrl?: string;      // Avatar URL
  preferredUsername?: string; // Preferred username
  // ... and other optional fields
}
```

## License

ISC 