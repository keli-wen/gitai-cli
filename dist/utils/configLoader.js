import os from 'os';
import { cosmiconfig } from 'cosmiconfig';
import { readFile } from 'fs/promises';
import path from 'path';
import yaml from 'js-yaml'; // For .yaml file loading
import merge from 'lodash.merge';
import dotenv from 'dotenv';
import { logger } from './logger.js';
import { getRepoRoot } from './git.js';
import { defaultConfig } from '../config/default.js';
const MODULE_NAME = 'gitai';
// Define global config directory
export const GLOBAL_CONFIG_DIR = path.resolve(os.homedir(), '.gitai');
// Load environment variables from git-root.env file
dotenv.config({ path: path.resolve(await getRepoRoot() ?? '', '.env') });
// cosmiconfig loaders definition
const defaultLoaders = {
    '.yaml': (filepath, content) => yaml.load(content), // any for now
    '.yml': (filepath, content) => yaml.load(content),
};
// For searching in specific directory
function createExplorer(searchFrom) {
    return cosmiconfig(MODULE_NAME, {
        searchPlaces: [
            `.gitai/config.yaml`, // Add this line to ensure the config is found in the .gitai directory
            `.gitai/config.yml`, // Also support yml format
            `config.yaml`,
            `config.yml`,
            `config.json`,
            `.${MODULE_NAME}rc.yaml`,
            `.${MODULE_NAME}rc.yml`,
            `.${MODULE_NAME}rc.json`,
        ],
        loaders: defaultLoaders,
        stopDir: searchFrom,
    });
}
// Default explorer (used as fallback)
const explorer = createExplorer();
async function loadTextFile(filePath) {
    try {
        return await readFile(filePath, 'utf-8');
    }
    catch (error) {
        // logger.warn(`Warning: Could not load file from ${filePath}: ${(error as Error).message}`);
        return undefined;
    }
}
export async function getConfig() {
    // Deep copy default config
    let finalConfig = merge({}, defaultConfig);
    // 1. Try to find git repo root first
    const repoRoot = await getRepoRoot();
    let configDir = process.cwd(); // Default to current working directory
    let projectConfigResult = null;
    if (repoRoot) {
        // Create a repo-specific explorer that starts from git root
        const repoExplorer = createExplorer(repoRoot);
        projectConfigResult = await repoExplorer.search(repoRoot);
        if (projectConfigResult && projectConfigResult.config) {
            logger.debug("Found config in git repo root:", projectConfigResult.filepath);
            finalConfig = merge(finalConfig, projectConfigResult.config);
            if (projectConfigResult.filepath) {
                configDir = path.dirname(projectConfigResult.filepath);
            }
        }
        else {
            // 2. If not found in git repo root, try project config
            projectConfigResult = await explorer.search();
            if (projectConfigResult && projectConfigResult.config) {
                logger.debug("Found config in project directory:", projectConfigResult.filepath);
                finalConfig = merge(finalConfig, projectConfigResult.config);
                if (projectConfigResult.filepath) {
                    configDir = path.dirname(projectConfigResult.filepath);
                }
            }
            else {
                // 3. If still not found, try global config
                const globalConfigResult = await explorer.search(GLOBAL_CONFIG_DIR);
                if (globalConfigResult && globalConfigResult.config) {
                    logger.debug("Found config in global directory:", globalConfigResult.filepath);
                    finalConfig = merge(finalConfig, globalConfigResult.config);
                    if (globalConfigResult.filepath) {
                        configDir = path.dirname(globalConfigResult.filepath);
                    }
                }
                else {
                    logger.warn("No configuration found. Using default configuration.");
                }
            }
        }
    }
    else {
        // No git repo, fail
        throw new Error("No git repository found. Please run this command from a git repository.");
    }
    // 4. Load commit prompt template
    if (finalConfig.commit.prompt_template) {
        const promptFilePath = path.resolve(configDir, finalConfig.commit.prompt_template);
        logger.debug("promptFilePath", promptFilePath);
        const promptContent = await loadTextFile(promptFilePath);
        logger.debug("promptContent", promptContent);
        if (promptContent) {
            finalConfig.commit.systemPrompt = promptContent;
        }
        else {
            logger.warn(`Failed to load prompt from ${promptFilePath}. Using fallback or expecting direct systemPrompt.`);
            if (!finalConfig.commit.systemPrompt) {
                finalConfig.commit.systemPrompt = "Generate a commit message based on the diff.";
            }
        }
    }
    else if (!finalConfig.commit.systemPrompt) {
        finalConfig.commit.systemPrompt = "Generate a commit message based on the diff.";
    }
    // 5. Load PR prompt template
    if (finalConfig.pr && finalConfig.pr.prompt_template) {
        const prPromptFilePath = path.resolve(configDir, finalConfig.pr.prompt_template);
        const prPromptContent = await loadTextFile(prPromptFilePath);
        if (prPromptContent) {
            finalConfig.pr.systemPrompt = prPromptContent;
        }
        else {
            logger.warn(`Failed to load PR prompt from ${prPromptFilePath}.`);
            if (!finalConfig.pr.systemPrompt) {
                finalConfig.pr.systemPrompt = "Generate a PR description based on the changes.";
            }
        }
    }
    else if (finalConfig.pr && !finalConfig.pr.systemPrompt) {
        finalConfig.pr.systemPrompt = "Generate a PR description based on the changes.";
    }
    logger.debug("finalConfig", finalConfig);
    return finalConfig;
}
/**
 * Get LLM config for a specific command
 * @param config App config
 * @param command Command name (e.g. 'commit', 'pr')
 * @returns Command-specific config or default config
 */
export function getResolvedLLMConfig(config, command) {
    // Get base config (default or command-specific)
    const baseConfig = command && config.llm.commands?.[command]
        ? config.llm.commands[command]
        : config.llm.default;
    logger.debug("baseConfig", config.llm);
    logger.debug(`baseConfig for command ${command}: `, baseConfig);
    if (!baseConfig.provider) {
        logger.debug("No provider set for command", command);
    }
    // Process provider and model
    const provider = baseConfig.provider || 'openai';
    const model = baseConfig.model || 'gpt-4o-mini';
    const temperature = baseConfig.temperature ?? 0.7;
    // Process API Key
    let apiKey = baseConfig.apiKey;
    const apiKeyEnvVarName = baseConfig.apiKeyEnvVar;
    // Only set apiKey if it's not already set
    if (!apiKey && apiKeyEnvVarName && process.env[apiKeyEnvVarName]) {
        logger.debug("Setting apiKey from env var", apiKeyEnvVarName);
        apiKey = process.env[apiKeyEnvVarName];
    }
    else if (!apiKey && provider !== 'ollama') {
        const guessedEnvVar = `${provider.toUpperCase()}_API_KEY`;
        logger.debug("Setting apiKey from guessed env var", guessedEnvVar);
        if (process.env[guessedEnvVar]) {
            apiKey = process.env[guessedEnvVar];
        }
        else if (process.env.GIT_AI_API_KEY) {
            apiKey = process.env.GIT_AI_API_KEY;
        }
    }
    // Process Base URL
    let baseUrl = baseConfig.baseUrl;
    const baseUrlEnvVarName = baseConfig.baseUrlEnvVar;
    // Only set baseUrl if it's not already set
    if (!baseUrl && baseUrlEnvVarName && process.env[baseUrlEnvVarName]) {
        logger.debug("Setting baseUrl from env var", baseUrlEnvVarName);
        baseUrl = process.env[baseUrlEnvVarName];
    }
    logger.debug("baseUrl", baseUrl);
    // Set special baseUrl for Ollama
    if (provider === 'ollama' && !baseUrl) {
        baseUrl = baseConfig.ollamaBaseUrl || 'http://localhost:11434';
    }
    // No special processing needed to return fully resolved config
    return {
        provider,
        model,
        apiKey,
        baseUrl,
        temperature
    };
}
/**
 * Return raw (unmerged) config & its file path – for `gitai show-config`.
 */
export async function getConfigRaw() {
    // First try to find config in git repo root
    const repoRoot = await getRepoRoot();
    let res = null;
    if (repoRoot) {
        const repoExplorer = createExplorer(repoRoot);
        res = await repoExplorer.search(repoRoot);
    }
    // If not found in git repo root, try project config
    if (!res) {
        res = await explorer.search();
    }
    // If still not found, try global config
    if (!res) {
        console.log(`Try to load global config from ${GLOBAL_CONFIG_DIR}`);
        res = await explorer.search(GLOBAL_CONFIG_DIR);
    }
    return {
        path: res?.filepath ?? '(not found)',
        raw: res?.config ?? {},
    };
}
