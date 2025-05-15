import { AppConfig } from '../types/index.js';

export const defaultConfig: Partial<AppConfig> = {
    llm: {
        default: {
            provider: 'openai',
            model: 'gpt-4o-mini',
            baseUrl: 'https://api.openai.com/v1',
            temperature: 0.7,
        },
        commands: {
        },
    },
    commit: {
        suggestions: 3, // Define the number of suggestions to generate.
        prompt_template: '.gitai/prompts/commit_prompt.txt',
    },
    pr: {
        base_branch: 'main',
        include_file_tree: true,
        include_unstaged: false,
        max_lines_per_file: 300,
        warn_on_conflict: true,
        prompt_template: '.gitai/prompts/pr_prompt.txt',
    },
};