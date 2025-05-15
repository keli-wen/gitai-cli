export interface LLMProviderConfig {
    provider?: string;
    baseUrl?: string;
    baseUrlEnvVar?: string;
    apiKey?: string; // User may hard-code in the config (not recommended)
    apiKeyEnvVar?: string; // Read from which environment variable
    model?: string; // Provider-specific default model
    ollamaBaseUrl?: string; // Ollama-specific config
    temperature?: number;
}

export interface LLMConfig {
    default: LLMProviderConfig;
    commands?: Record<string, LLMProviderConfig>;
}

export interface CommitConfig {
    suggestions: number;
    prompt_template?: string;
    systemPrompt?: string; // Fill after loading
}

export interface PRConfig {
    base_branch?: string;
    include_file_tree?: boolean;
    include_unstaged?: boolean;
    max_lines_per_file?: number;
    warn_on_conflict?: boolean;
    prompt_template?: string;
    systemPrompt?: string; // Fill after loading
}

export interface AppConfig {
    llm: LLMConfig;
    commit: CommitConfig;
    pr: PRConfig;
}

// This interface defines the structure of the commit message object returned by LLM
export interface CommitMessageObject {
    message: string;
}

// This interface defines the structure of the LLM configuration returned by
// the config processing function
export interface ResolvedLLMConfig {
    provider: string;
    model: string;
    apiKey?: string;
    baseUrl?: string;
    temperature: number;
}

export enum GITAI_COMMAND {
    COMMIT = 'commit',
    PR = 'pr'
}