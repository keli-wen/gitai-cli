import { AppConfig, CommitMessageObject, GITAI_COMMAND } from '../types/index.js';
import { logger } from './logger.js';
import { getResolvedLLMConfig } from './configLoader.js';
import { ProxyAgent } from 'undici';

interface LLMResponseChoice {
    message: {
        role: string;
        content: string;
    };
    // ... other fields like index, finish_reason
}

interface LLMChatCompletionResponse {
    id: string;
    object: string;
    created: number;
    model: string;
    choices: LLMResponseChoice[];
    usage?: { // Optional
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
}

interface BuildPrPromptArgs {
    branch: string;
    target: string;
    diff: string;
    tree: string;
    commits: string;
    userPrompt?: string;
    appConfig: AppConfig;
}

async function callGenericLLM(
    prompt: string,
    appConfig: AppConfig,
    command?: GITAI_COMMAND,
): Promise<string | null> {
    // Get fully resolved LLM config
    const llmConfig = getResolvedLLMConfig(appConfig, command);

    logger.debug(`command: ${command}`);
    logger.debug(`llmConfig: ${JSON.stringify(llmConfig)}`);

    const { provider, model, apiKey, baseUrl, temperature } = llmConfig;

    if (!baseUrl) {
        logger.error(`Base URL for LLM provider "${provider}" is not configured.`);
        return null;
    }
    if (!apiKey && provider !== 'ollama' && !baseUrl.includes('localhost')) {
        logger.error(`API Key for LLM provider "${provider}" is not configured.`);
        return null;
    }

    // Select endpoint based on provider
    let endpoint;
    let headers: Record<string, string> = {
        'Content-Type': 'application/json',
    };
    let body: any = {};

    if (provider === 'gemini') {
        endpoint = `${baseUrl}/v1beta/models/${model}:generateContent?key=${apiKey}`;
        body = {
            contents: [{
                parts: [{ text: prompt }]
            }],
            generationConfig: {
                temperature: temperature
            }
        };
    } else if (provider === 'ollama') {
        endpoint = `${baseUrl}/api/chat`;
        if (apiKey) {
            headers['Authorization'] = `Bearer ${apiKey}`;
        }
        body = {
            model: model,
            messages: [{ role: 'user', content: prompt }],
            temperature: temperature,
            stream: false,
        };
    } else {
        // OpenAI and compatible APIs
        endpoint = `${baseUrl}/chat/completions`;
        if (apiKey) {
            headers['Authorization'] = `Bearer ${apiKey}`;
        }
        body = {
            model: model,
            messages: [{ role: 'user', content: prompt }],
            temperature: temperature,
            stream: false,
            response_format: { type: 'json_object' },
        };
    }

    const options: RequestInit = {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(body),
    };

    const httpProxy = process.env.HTTP_PROXY || process.env.http_proxy;
    const httpsProxy = process.env.HTTPS_PROXY || process.env.https_proxy;
    const allProxy = process.env.ALL_PROXY || process.env.all_proxy;

    const proxyUrl = httpsProxy || httpProxy || allProxy;
    logger.debug("proxyUrl", proxyUrl);
    if (proxyUrl) {
        const proxy = new ProxyAgent(proxyUrl);
        // @ts-ignore
        options.dispatcher = proxy;
    }
    logger.debug("options", options);

    try {
        logger.debug(`\nSending request to ${provider} at ${endpoint} with model ${model}...`);
        const response = await fetch(endpoint, options);

        if (!response.ok) {
            const errorBody = await response.text();
            logger.error(`LLM API request to ${provider} failed with status ${response.status}: ${errorBody}`);
            return null;
        }

        const data = await response.json();
        logger.debug("data", data);
        
        // Handle different response formats based on provider
        if (provider === 'gemini') {
            if (data.candidates && data.candidates.length > 0) {
                const content = data.candidates[0].content;
                if (content && content.parts && content.parts.length > 0) {
                    return content.parts[0].text;
                }
            }
        } else if (data.choices && data.choices.length > 0 && data.choices[0].message) {
            // OpenAI compatible format
            return data.choices[0].message.content;
        } else if (data.message && typeof data.message.content === 'string') {
            // Ollama native /api/chat (non-streaming)
            return data.message.content;
        }
        
        logger.error("LLM response did not contain expected data structure:", data);
        return null;
    } catch (error: any) {
        logger.error(`Error calling LLM (${provider}):`, error.message);
        return null;
    }
}

export async function buildCommitPrompt(
    diff: string,
    userPromptSuffix: string | undefined,
    K: number,
    appConfig: AppConfig,
    command?: GITAI_COMMAND,
): Promise<string | null> {
    const { commit: commitConfig } = appConfig;

    if (!commitConfig.systemPrompt) {
        logger.error("System prompt for commit messages is not configured.");
        return null;
    }

    let systemPrompt = commitConfig.systemPrompt.replace('{{ suggestions }}', K.toString());

    let fullPrompt = `${systemPrompt}\n\nHere is the file diff:\n\`\`\`diff\n${diff}\n\`\`\`\n`;
    if (userPromptSuffix) {
        fullPrompt += `\nAdditional instructions from user: ${userPromptSuffix}\n`;
    }
    fullPrompt += `\nPlease provide ${K} commit message suggestions.`;
    return fullPrompt;
}

export async function generateCommitMessagesAI(
    diff: string,
    userPromptSuffix: string | undefined,
    K: number,
    appConfig: AppConfig,
    command?: GITAI_COMMAND,
): Promise<CommitMessageObject[] | null> {
    const fullPrompt = await buildCommitPrompt(diff, userPromptSuffix, K, appConfig, command);

    if (!fullPrompt) {
        return null;
    }

    logger.debug("--- Sending Prompt to LLM (first 500 chars) ---");
    logger.debug(fullPrompt.substring(0, 500) + "...");
    logger.debug("---------------------------------------------");


    const llmResponseContent = await callGenericLLM(fullPrompt, appConfig, command);

    if (!llmResponseContent) {
        return null;
    }

    logger.debug("--- LLM Raw Response ---");
    logger.debug(llmResponseContent);
    logger.debug("------------------------");

    try {
        // Attempt to clean up common markdown code block formatting if present
        const cleanedResponse = llmResponseContent.replace(/^```json\s*|```\s*$/g, '').trim();
        const messages: CommitMessageObject[] = JSON.parse(cleanedResponse);

        if (!Array.isArray(messages) || !messages.every(m => m.message)) {
            throw new Error("LLM did not return a valid array of commit message objects.");
        }
        return messages.slice(0, K); // Ensure not more than K suggestions
    } catch (e: any) {
        // Try to extract JSON using regex as fallback
        try {
            const jsonMatch = llmResponseContent.match(/\[[\s\S]*\]/);
            if (jsonMatch) {
                const messages: CommitMessageObject[] = JSON.parse(jsonMatch[0]);
                if (!Array.isArray(messages) || !messages.every(m => m.message)) {
                    throw new Error("LLM did not return a valid array of commit message objects.");
                }
                return messages.slice(0, K); // Ensure not more than K suggestions
            }
        } catch (regexError) {
            // Ignore regex extraction errors
        }
        logger.error("Failed to parse LLM response as JSON. Raw response was:", llmResponseContent);
        logger.error("Error:", e.message);
        return [];
    }
}

export async function buildPrPrompt({
    branch,
    target,
    diff,
    tree,
    commits,
    userPrompt,
    appConfig,
}: BuildPrPromptArgs): Promise<string | null> {
    if (!appConfig.pr?.systemPrompt) {
        logger.error("System prompt for PR is not configured.");
        return null;
    }

    // Simple template replacement
    let prompt = appConfig.pr?.systemPrompt
        .replace('{{ diff }}', diff)
        .replace('{{ branch }}', branch)
        .replace('{{ target }}', target)
        .replace('{{#if tree}}', '')
        .replace('{{/if}}', '')
        .replace('{{ tree }}', tree || 'No file tree')
        .replace('{{#if commits}}', '')
        .replace('{{/if}}', '')
        .replace('{{ commits }}', commits || 'No commit history');

    if (userPrompt) {
        prompt += `\n\nAdditional instructions: ${userPrompt}`;
    }

    return prompt;
}

export interface PrJson { title: string; body: string }

export async function generatePrDocAI(
    prompt: string,
    appConfig: AppConfig,
    command: GITAI_COMMAND,
): Promise<PrJson | null> {
    const content = await callGenericLLM(prompt, appConfig, command);
    if (!content) return null;

    try {
        const json = JSON.parse(content.replace(/^```json\s*|```\s*$/g, '').trim());
        if (!json.title || !json.body) throw new Error('Missing fields');
        return json as PrJson;
    } catch (e: any) {
        // Try to extract JSON using regex as fallback
        try {
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const json = JSON.parse(jsonMatch[0]);
                if (json.title && json.body) {
                    return json as PrJson;
                }
            }
        } catch (regexError) {
            // Ignore regex extraction errors
        }
        logger.error('Failed to parse PR JSON from LLM:', e.message);
        logger.debug('Returned content:', content);
        return null;
    }
}
