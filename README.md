# cheese-auth

This repository is a standalone Authorization/Authentication library extracted from the cheese project. It offers a comprehensive, ready-to-use authentication solution that not only provides basic features such as email-based registration and password reset but also includes advanced functionalities like user avatars and mutual following between users.

The repository consists of two parts: the first is an Auth Server simplified from [cheese-backend](https://github.com/SageSeekerSociety/cheese-backend), and the second is an Auth library separated from [cheese-backend-nt](https://github.com/SageSeekerSociety/cheese-backend-nt), which can be used with the first Auth Server in any SpringBoot project. 

# OAuth Provider Plugin System

Cheese-Auth supports dynamically loading OAuth providers through a flexible plugin system, which allows you to easily add new OAuth providers without modifying the core code.

## Configuration

Configure the following environment variables in your `.env` file:

```
# Enabled OAuth providers (comma-separated list)
OAUTH_ENABLED_PROVIDERS=provider1,provider2

# Search paths for provider implementations (comma-separated list)
OAUTH_PLUGIN_PATHS=plugins/oauth,dist/oauth-providers

# Configuration for each provider
OAUTH_PROVIDER1_CLIENT_ID=your-client-id
OAUTH_PROVIDER1_CLIENT_SECRET=your-client-secret 
OAUTH_PROVIDER1_REDIRECT_URL=your-redirect-url
```

## Creating OAuth Provider Plugins

You can implement OAuth providers in several ways:

### Option 1: Single File Plugin

Create a JavaScript file in the `plugins/oauth` directory:

```javascript
// plugins/oauth/provider1.js (CommonJS) or provider1.mjs (ES Module)

// CommonJS format
function createProvider(clientId, clientSecret, redirectUrl) {
  // Return provider instance
  return new YourProviderImplementation(clientId, clientSecret, redirectUrl);
}

module.exports = { 
  createProvider,
  id: 'provider1' // Optional, helps with factory function discovery
};

// OR ES Module format:
export function createProvider(clientId, clientSecret, redirectUrl) {
  return new YourProviderImplementation(clientId, clientSecret, redirectUrl);
}
export default createProvider;
```

### Option 2: Directory Structure

Organize your provider in a directory with an index file:

```
plugins/oauth/provider1/
├── index.js     # Main entry point
├── api.js       # API implementation
└── utils.js     # Helper functions
```

### Option 3: Pre-built Distribution

For Docker environments or when distributing pre-built providers:

1. Build your provider implementation
2. Copy the compiled files to `dist/oauth-providers/provider1/`
3. Ensure there's an `index.js` file that exports the provider factory

## Provider Discovery

The system will search for providers in multiple locations:

1. First in all configured paths in `OAUTH_PLUGIN_PATHS` 
2. If not found, as a fallback it will try to load from npm packages

For each provider, it looks for a factory function in this order:
1. `default` export
2. `createProvider` export
3. `create` export
4. `createXxxOAuthProvider` function (where Xxx is the capitalized provider ID)

## Examples

See the following examples for reference:
- `plugins/oauth/ruc.js` - Simple CommonJS implementation
- `plugins/oauth/ruc.mjs` - ES Module implementation
- `dist/oauth-providers/ruc/` - Pre-built provider example
