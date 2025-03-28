# OAuth Providers

This directory contains OAuth provider plugins for Cheese-Auth.

## Plugin Structure Options

Cheese-Auth provides multiple ways to implement and organize OAuth providers:

### 1. Single File Plugins

Create a single JavaScript file with the provider implementation:

```
plugins/
└── oauth/
    ├── provider1.js    # CommonJS format
    ├── provider2.mjs   # ES Module format
    └── ...
```

### 2. Directory-Based Plugins

Organize each provider as a directory with an index file:

```
plugins/
└── oauth/
    ├── provider1/
    │   ├── index.js    # Main entry point
    │   └── ... other files
    └── ...
```

### 3. Pre-Built Distribution

Use pre-built providers in a distribution directory:

```
dist/
└── oauth-providers/
    ├── provider1/
    │   └── index.js    # Pre-compiled provider
    └── ...
```

## Plugin Implementation

Regardless of structure, your plugin must export a function that creates the provider instance.

### CommonJS Format

```javascript
/**
 * Create example OAuth provider instance
 */
function createProvider(clientId, clientSecret, redirectUrl) {
  return new YourOAuthProvider(clientId, clientSecret, redirectUrl);
}

module.exports = {
  createProvider,
  id: 'your-provider-id' // Optional, helps with specific factory function naming
};
```

### ES Module Format

```javascript
/**
 * Create example OAuth provider instance
 */
export function createProvider(clientId, clientSecret, redirectUrl) {
  return new YourOAuthProvider(clientId, clientSecret, redirectUrl);
}

// Optional ID for factory function discovery
export const id = 'your-provider-id';

// Default export is also supported
export default createProvider;
```

## Provider Discovery

The system will look for a create function in the following order:
1. `default` export
2. `createProvider` export
3. `create` export
4. `createXxxOAuthProvider` where Xxx is the capitalized provider ID

## Configuration

In your `.env` file, configure the paths where the system should look for providers:

```
# Comma-separated list of paths to search for providers
OAUTH_PLUGIN_PATHS=plugins/oauth,dist/oauth-providers

# Enable specific providers
OAUTH_ENABLED_PROVIDERS=provider1,provider2
```

## Notes

- Only providers listed in the `OAUTH_ENABLED_PROVIDERS` environment variable will be loaded
- If a provider isn't found in any of the configured paths, the system will attempt to load it from npm packages as a fallback
- Files in this directory should be added to `.gitignore` to avoid committing private OAuth integrations to public repositories 