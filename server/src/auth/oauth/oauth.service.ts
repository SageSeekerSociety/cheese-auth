/*
 *  Description: OAuth service for managing OAuth providers dynamically and securely.
 */

import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { OAuthProvider, OAuthProviderConfig } from '@sageseekersociety/cheese-auth-oauth-types';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';

// --- Constants for Configuration ---
const OAUTH_ENABLED_PROVIDERS_KEY = 'OAUTH_ENABLED_PROVIDERS';
const OAUTH_PLUGIN_PATHS_KEY = 'OAUTH_PLUGIN_PATHS';
const OAUTH_ALLOW_NPM_LOADING_KEY = 'OAUTH_ALLOW_NPM_LOADING';
const DEFAULT_OAUTH_PLUGIN_PATH = 'plugins/oauth'; // Default relative path

// --- Security Validation ---

/**
 * Validates if a provider ID is safe to use for path construction and package naming.
 * Allows alphanumeric characters, hyphens, and underscores. Prevents path traversal.
 * @param providerId The provider ID string.
 * @returns True if the provider ID is safe, false otherwise.
 */
function isValidProviderId(providerId: string): boolean {
  // Must not be empty and only contain safe characters.
  // ^[a-zA-Z0-9_-]+$ : Starts and ends with one or more allowed characters.
  return /^[a-zA-Z0-9_-]+$/.test(providerId);
}

/**
 * Checks if a given file path is safely contained within or is the same as a specified base directory.
 * Prevents resolving paths outside the intended directory (path traversal).
 * @param filePath The absolute path to check.
 * @param basePath The absolute base path it should be within or equal to.
 * @returns True if filePath is within or equal to basePath, false otherwise.
 */
function isPathWithinBase(filePath: string, basePath: string): boolean {
  const relative = path.relative(basePath, filePath);
  // The path is considered *not* safely within if:
  // 1. The relative path starts with '..' (indicates going up the directory tree).
  // 2. The relative path resolves to an absolute path (e.g., different drive on Windows),
  //    meaning filePath wasn't truly relative to basePath in the first place.
  // An empty string '' means filePath and basePath are the same, which is considered 'within'.
  // A relative path like 'subdir/file.txt' is also considered 'within'.
  const isOutsideOrInvalid = relative.startsWith('..') || path.isAbsolute(relative);
  return !isOutsideOrInvalid; // Return true if it's NOT outside or invalid
}


@Injectable()
export class OAuthService implements OnModuleInit {
  private providers: Map<string, OAuthProvider> = new Map();
  private readonly logger = new Logger(OAuthService.name);
  private allowNpmLoading = false; // Default to false for security
  private pluginBasePaths: string[] = []; // Store resolved absolute paths

  constructor(private configService: ConfigService) {}

  async onModuleInit() {
    this.resolvePluginPaths(); // Resolve paths once on init
    this.allowNpmLoading = this.configService.get<string>(OAUTH_ALLOW_NPM_LOADING_KEY, 'false').toLowerCase() === 'true';

    if (this.allowNpmLoading) {
      this.logger.warn(`NPM package loading for OAuth providers is enabled (${OAUTH_ALLOW_NPM_LOADING_KEY}=true). Ensure only trusted provider IDs are configured and regularly audit dependencies.`);
    }

    await this.loadProviders();
  }

  /**
   * Resolves and validates configured plugin paths.
   */
  private resolvePluginPaths(): void {
    const rawPaths = this.configService.get<string>(OAUTH_PLUGIN_PATHS_KEY, DEFAULT_OAUTH_PLUGIN_PATH)
      .split(',')
      .map(p => p.trim())
      .filter(p => p.length > 0);

    this.pluginBasePaths = rawPaths.map(p => path.resolve(p)); // Resolve to absolute paths

    this.logger.log(`Resolved OAuth plugin search paths: ${this.pluginBasePaths.join(', ')} (Working directory: ${process.cwd()})`);

    // Optional: Check if paths exist and are directories on startup
    this.pluginBasePaths.forEach(basePath => {
      if (!fs.existsSync(basePath) || !fs.statSync(basePath).isDirectory()) {
        this.logger.warn(`Configured plugin path does not exist or is not a directory: ${basePath}`);
      }
    });
  }

  /**
   * Load OAuth providers from configured sources.
   */
  async loadProviders(): Promise<void> {
    const enabledProviders = this.configService.get<string>(OAUTH_ENABLED_PROVIDERS_KEY, '')
      .split(',')
      .map(p => p.trim())
      .filter(p => p.length > 0);

    if (enabledProviders.length === 0) {
      this.logger.log('No OAuth providers enabled in configuration.');
      return;
    }

    this.logger.log(`Attempting to load enabled OAuth providers: ${enabledProviders.join(', ')}`);

    for (const providerId of enabledProviders) {
      // --- Security: Validate providerId format ---
      if (!isValidProviderId(providerId)) {
        this.logger.error(`Invalid characters detected in provider ID: "${providerId}". Skipping load. Provider IDs must contain only letters, numbers, hyphens, and underscores.`);
        continue; // Skip this potentially malicious providerId
      }

      const provider = await this.loadSingleProvider(providerId);

      if (provider) {
        this.registerProvider(provider);
        this.logger.log(`OAuth provider registered successfully: ${providerId}`);
      } else {
        // Warning already logged in loadSingleProvider if loading failed
        this.logger.warn(`Failed to load or initialize OAuth provider: ${providerId}`);
      }
    }
  }

  /**
   * Load a single provider by ID, searching configured sources.
   * @param providerId The validated provider ID to load.
   * @returns Provider instance or null if not found or failed to load.
   */
  private async loadSingleProvider(providerId: string): Promise<OAuthProvider | null> {
    // 1. Get provider credentials (required regardless of source)
    const clientId = this.configService.get<string>(`OAUTH_${providerId.toUpperCase()}_CLIENT_ID`);
    const clientSecret = this.configService.get<string>(`OAUTH_${providerId.toUpperCase()}_CLIENT_SECRET`);
    const redirectUrl = this.configService.get<string>(`OAUTH_${providerId.toUpperCase()}_REDIRECT_URL`);

    if (!clientId || !clientSecret || !redirectUrl) {
      this.logger.warn(`Missing required environment variables (CLIENT_ID, CLIENT_SECRET, REDIRECT_URL) for OAuth provider: ${providerId}`);
      return null;
    }

    // 2. Try loading from configured file system paths
    for (const basePath of this.pluginBasePaths) {
        const provider = await this.tryLoadFromFileSystem(providerId, basePath, clientId, clientSecret, redirectUrl);
        if (provider) {
            return provider; // Found and loaded successfully
        }
    }

    // 3. Try loading from npm package if allowed by configuration
    if (this.allowNpmLoading) {
        const provider = await this.tryLoadFromNpm(providerId, clientId, clientSecret, redirectUrl);
        if (provider) {
            return provider; // Found and loaded successfully
        }
    } else {
        this.logger.debug(`NPM loading is disabled, skipping check for provider: ${providerId}`);
    }

    // If not found in any source
    this.logger.warn(`Provider implementation for "${providerId}" not found in any configured plugin paths or allowed sources.`);
    return null;
  }

  /**
   * Attempts to load a provider implementation from the file system within a specific base path.
   * Includes security checks for path traversal.
   */
  private async tryLoadFromFileSystem(
    providerId: string,
    basePath: string,
    clientId: string,
    clientSecret: string,
    redirectUrl: string
  ): Promise<OAuthProvider | null> {
    // Potential locations relative to the basePath
    const potentialModulePaths = [
      path.join(basePath, providerId, 'index.js'),
      path.join(basePath, providerId, 'index.mjs'),
      path.join(basePath, `${providerId}.js`),
      path.join(basePath, `${providerId}.mjs`),
    ];

    for (const potentialPath of potentialModulePaths) {
      const absolutePotentialPath = path.resolve(potentialPath); // Resolve to absolute path

      // --- Security: Ensure the resolved path is within the allowed base path ---
      if (!isPathWithinBase(absolutePotentialPath, basePath)) {
        this.logger.warn(`Skipping potential path outside base directory: ${absolutePotentialPath} (Base: ${basePath})`);
        continue; // Path traversal attempt or misconfiguration, skip.
      }

      if (fs.existsSync(absolutePotentialPath)) {
        this.logger.debug(`Attempting to load provider "${providerId}" from file: ${absolutePotentialPath}`);
        try {
          // --- Security: Dynamically importing code ---
          // This assumes the code at absolutePotentialPath is trusted.
          // File system permissions should prevent unauthorized writes to plugin directories.
          const module = await import(absolutePotentialPath);
          const provider = this.createProviderFromModule(module, providerId, clientId, clientSecret, redirectUrl);
          if (provider) {
            this.logger.debug(`Successfully created provider "${providerId}" instance from module: ${absolutePotentialPath}`);
            return provider;
          } else {
             this.logger.warn(`Module found at ${absolutePotentialPath} for provider "${providerId}", but failed to find a valid factory function.`);
          }
        } catch (error: any) {
          this.logger.error(`Error loading or initializing provider "${providerId}" from ${absolutePotentialPath}: ${error.message}`, error.stack);
          // Continue searching in other locations or paths
        }
      }
    }
    return null; // Not found in this base path
  }

  /**
   * Attempts to load a provider implementation from an npm package.
   * Requires OAUTH_ALLOW_NPM_LOADING to be true.
   */
  private async tryLoadFromNpm(
    providerId: string, // Assumes providerId is already validated
    clientId: string,
    clientSecret: string,
    redirectUrl: string
  ): Promise<OAuthProvider | null> {
    const packageName = `@sageseekersociety/cheese-auth-${providerId}-oauth-provider`;
    this.logger.debug(`Attempting to load provider "${providerId}" from npm package: ${packageName}`);

    try {
      // --- Security: Dynamically importing code from NPM ---
      // This relies on the package being installed and trusted.
      // Use lockfiles (package-lock.json/yarn.lock) and dependency auditing (npm audit).
      const module = await import(packageName);
      const provider = this.createProviderFromModule(module, providerId, clientId, clientSecret, redirectUrl);
      if (provider) {
          this.logger.debug(`Successfully created provider "${providerId}" instance from npm package: ${packageName}`);
          return provider;
      } else {
          this.logger.warn(`NPM package ${packageName} loaded for provider "${providerId}", but failed to find a valid factory function.`);
      }
    } catch (error: any) {
      // Log specific import errors differently from "module not found"
      if (error.code === 'MODULE_NOT_FOUND') {
         this.logger.debug(`NPM package ${packageName} not found for provider "${providerId}".`);
      } else {
         this.logger.error(`Error loading or initializing provider "${providerId}" from npm package ${packageName}: ${error.message}`, error.stack);
      }
    }
    return null; // Not found or failed to load from npm
  }

  /**
   * Create a provider instance from a loaded module by finding a factory function.
   * @param module The imported module object.
   * @param providerId The ID of the provider (used for specific factory naming).
   * @param clientId OAuth client ID.
   * @param clientSecret OAuth client secret.
   * @param redirectUrl OAuth redirect URL.
   * @returns Provider instance or null if no suitable factory function found.
   */
  private createProviderFromModule(
    module: any,
    providerId: string, // Pass providerId for potential specific factory names
    clientId: string,
    clientSecret: string,
    redirectUrl: string
  ): OAuthProvider | null {
    // Standard factory function names to check
    const factoryFnCandidates = [
      module.default,           // export default function create(...)
      module.createProvider,    // export function createProvider(...)
      module.create,            // export function create(...)
      // Add other common patterns if necessary
    ];

    // Attempt a specific factory name like createGoogleOAuthProvider
    // Use the validated providerId passed into this function
    const specificFactoryName = `create${this.capitalizeFirst(providerId)}OAuthProvider`;
    if (typeof module[specificFactoryName] === 'function') {
      factoryFnCandidates.push(module[specificFactoryName]);
    }

    // Find the first valid factory function in the candidates list
    const factoryFn = factoryFnCandidates.find(fn => typeof fn === 'function');

    if (!factoryFn) {
      this.logger.debug(`No suitable factory function (e.g., createProvider, default export) found in the loaded module for provider "${providerId}". Module keys: ${Object.keys(module).join(', ')}`);
      return null;
    }

    try {
      // Call the factory function with credentials
      const provider = factoryFn(clientId, clientSecret, redirectUrl);
      // Basic validation: Check if it looks like a provider (has getConfig method)
      if (provider && typeof provider.getConfig === 'function') {
          return provider as OAuthProvider;
      } else {
          this.logger.warn(`Factory function found for "${providerId}" but did not return a valid OAuthProvider instance.`);
          return null;
      }
    } catch (error: any) {
        this.logger.error(`Error executing factory function for provider "${providerId}": ${error.message}`, error.stack);
        return null;
    }
  }

  /** Helper to capitalize the first letter */
  private capitalizeFirst(str: string): string {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  /** Register a valid provider instance */
  registerProvider(provider: OAuthProvider): void {
    try {
        const config = provider.getConfig();
        if (!config || !config.id) {
            this.logger.error(`Provider registration failed: Provider returned invalid config or missing ID.`);
            return;
        }
        if (this.providers.has(config.id)) {
            this.logger.warn(`Overwriting previously registered provider with ID: ${config.id}`);
        }
        this.providers.set(config.id, provider);
    } catch (error: any) {
        this.logger.error(`Error during provider registration (getConfig failed?): ${error.message}`, error.stack);
    }
  }

  /** Get all registered providers */
  getAllProviders(): OAuthProvider[] {
    return Array.from(this.providers.values());
  }

  /** Get a specific provider by ID */
  getProvider(providerId: string): OAuthProvider | undefined {
    return this.providers.get(providerId);
  }

  /** Get config summary (excluding secrets) */
  getProvidersConfig(): Omit<OAuthProviderConfig, 'clientSecret'>[] {
    return this.getAllProviders().map(provider => {
      try {
        // Destructure carefully in case getConfig throws or returns unexpected structure
        const { clientSecret, ...config } = provider.getConfig() || {};
        return config as Omit<OAuthProviderConfig, 'clientSecret'>; // Assert type after check
      } catch (error: any) {
        this.logger.error(`Failed to get config for provider (ID unknown at this point): ${error.message}`);
        return null; // Return null or an error object for problematic providers
      }
    }).filter(config => config !== null) as Omit<OAuthProviderConfig, 'clientSecret'>[]; // Filter out nulls
  }
}