import { getStagedDiff, commit as gitCommit } from '../utils/git.js';
import { generateCommitMessagesAI, buildCommitPrompt } from '../utils/llm.js';
import { getResolvedLLMConfig } from '../utils/configLoader.js';
import { AppConfig, GITAI_COMMAND } from '../types/index.js';
import { logger } from '../utils/logger.js';
import inquirer from 'inquirer';
import ora from 'ora';
import chalk from 'chalk';

interface CommitCommandOptions {
    prompt?: string; // From -p or --prompt
    suggestions?: number; // From -n or --suggestions or load prompt from config
    printPrompt?: boolean; // From --print-prompt
}

export async function handleCommitCommand(options: CommitCommandOptions, config: AppConfig): Promise<void> {
    try {
        // Create a loading animation
        const fetchSpinner = ora({
            text: chalk.blue('Fetching staged changes...'),
            spinner: 'dots',
            color: 'blue'
        }).start();
        
        const diff = await getStagedDiff();
        
        fetchSpinner.succeed(chalk.green('Staged changes fetched successfully!'));

        if (!diff) {
            console.log(chalk.yellow('No staged changes found. Please use "git add" to stage your changes.'));
            return;
        }

        const K = options.suggestions || config.commit.suggestions;
        const curAI = await getResolvedLLMConfig(config, GITAI_COMMAND.COMMIT).model;

        if (!K) {
            logger.error("Number of suggestions is not configured.");
            return;
        }

        if (options.printPrompt) {
            const fullPrompt = await buildCommitPrompt(
                diff, options.prompt, K, config, GITAI_COMMAND.COMMIT
            );
            if (!fullPrompt) {
                logger.error("Failed to build prompt.");
                return;
            }
            console.log(chalk.blue(fullPrompt));
            return;
        }

        // Create a loading animation for AI generation
        const aiSpinner = ora({
            text: chalk.cyan(`Generating ${K} commit messages with ${curAI}... (estimated time: ~20s)`),
            spinner: 'aesthetic',
            color: 'cyan'
        }).start();

        // Setup timer
        const startTime = Date.now();
        const timer = setInterval(() => {
            const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
            const minutes = Math.floor(elapsedSeconds / 60);
            const seconds = elapsedSeconds % 60;
            aiSpinner.text = chalk.cyan(`Generating ${K} commit messages with ${curAI}... (${minutes}:${seconds.toString().padStart(2, '0')} elapsed, ≈20s)`);
        }, 1000);

        const commitSuggestions = await generateCommitMessagesAI(
            diff, options.prompt, K, config, GITAI_COMMAND.COMMIT
        );

        // Clear the timer
        clearInterval(timer);

        const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
        aiSpinner.succeed(chalk.green(`AI suggestions generated successfully (${totalTime}s)`));

        if (!commitSuggestions || commitSuggestions.length === 0) {
            console.log(chalk.red('AI did not return any suggestions. You might want to try again or adjust your prompt/config.'));
            return;
        }
        if (commitSuggestions.length === 0) {
            console.error(chalk.red(`Error from AI`));
            return;
        }

        // Add color markers to options
        const choices = commitSuggestions.map((s, index) => ({
            name: `${chalk.green(`(${index + 1})`)} ${s.message}`,
            value: s.message,
        }));

        choices.push({ name: chalk.gray('---'), value: '' });
        choices.push({ name: chalk.yellow('📝 Edit selected message (TODO)'), value: 'edit' });
        choices.push({ name: chalk.red('❌ Skip (do not commit)'), value: 'skip' });

        const { selectedMessageValue } = await inquirer.prompt([
            {
                type: 'list',
                name: 'selectedMessageValue',
                message: chalk.blue('Choose a commit message:'),
                choices: choices,
                pageSize: commitSuggestions.length + 3,
            },
        ]);

        if (selectedMessageValue && selectedMessageValue !== 'skip' && selectedMessageValue !== 'edit') {
            const finalMessage = selectedMessageValue as string;
            const { confirm } = await inquirer.prompt({
                type: 'confirm',
                name: 'confirm',
                message: `${chalk.blue('Commit with the following message?')}\n\n  ${chalk.green(finalMessage)}\n`,
                default: true,
            });

            if (confirm) {
                const commitSpinner = ora({
                    text: chalk.cyan('Creating commit...'),
                    spinner: 'bouncingBall',
                    color: 'green'
                }).start();
                
                await gitCommit(finalMessage);
                
                commitSpinner.succeed(chalk.green('Changes committed successfully! 🎉'));
            } else {
                console.log(chalk.yellow('Commit cancelled.'));
            }
        } else if (selectedMessageValue === 'skip') {
            console.log(chalk.yellow('Commit skipped.'));
        } else if (selectedMessageValue === 'edit') {
            console.log(chalk.yellow('Edit functionality is not yet implemented.'));
        }
    } catch (error: any) {
        if (error.isTtyError) {
            console.error(chalk.red("Prompt couldn't be rendered in the current environment."));
        } else {
            console.error(chalk.red('An unexpected error occurred during the commit process.'));
        }
    }
}