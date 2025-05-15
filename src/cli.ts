#!/usr/bin/env node
import { Command, Option } from 'commander';
import { getConfig } from './utils/configLoader.js';
import { handleCommitCommand } from './commands/commit.js';
import { handleInitCommand } from './commands/init.js';
import { handleShowConfigCommand } from './commands/showConfig.js';
import { handlePrCommand } from './commands/pr.js';
import { AppConfig } from './types/index.js';
import chalk from 'chalk';
import Table from 'cli-table3';
import './scripts/bootstrapGlobal.js'; // Ensure global config is available

const program = new Command();

// program.version(version);

// Customize help output
program.configureHelp({
    helpWidth: 120,
    sortSubcommands: true,
    formatHelp: (cmd, helper) => {
        // Check if it is a help request for a subcommand.
        if (cmd.parent && cmd !== cmd.parent) {
            // This is a subcommand help request, use default formatting, or custom subcommand help formatting.
            const termWidth = helper.padWidth(cmd, helper);
            
            let output = `\n${chalk.bold.cyan(`GitAI CLI - ${cmd.name()}`)} ${chalk.italic(cmd.description())}\n\n`;
            
            // Usage section
            output += `${chalk.bold.yellow('USAGE')}\n\n`;
            output += `  ${chalk.green('$')} ${chalk.bold('gitai')} ${chalk.blue(cmd.name())} ${chalk.gray('[options]')}\n\n`;
            
            // Options section
            if (cmd.options && cmd.options.length > 0) {
                output += `${chalk.bold.yellow('OPTIONS')}\n\n`;
                const optionsTable = new Table({
                    chars: {
                        'top': '', 'top-mid': '', 'top-left': '', 'top-right': '',
                        'bottom': '', 'bottom-mid': '', 'bottom-left': '', 'bottom-right': '',
                        'left': '', 'left-mid': '', 'mid': '', 'mid-mid': '',
                        'right': '', 'right-mid': '', 'middle': ' '
                    },
                    style: { 'padding-left': 2, 'padding-right': 2 },
                    colWidths: [30, 80]
                });
                
                cmd.options.forEach(option => {
                    const flags = chalk.green(option.flags);
                    const desc = chalk.white(option.description || '');
                    optionsTable.push([flags, desc]);
                });
                
                output += optionsTable.toString() + '\n';
            }
            
            // Add examples section for subcommands
            output += `\n${chalk.bold.yellow('EXAMPLES')}\n\n`;
            
            // Command-specific examples
            if (cmd.name() === 'commit') {
                output += `  ${chalk.green('$')} ${chalk.bold('gitai')} ${chalk.blue('commit')}\n`;
                output += `  ${chalk.green('$')} ${chalk.bold('gitai')} ${chalk.blue('commit')} ${chalk.gray('-p')} ${chalk.yellow('"Use feat as commit type"')}\n`;
                output += `  ${chalk.green('$')} ${chalk.bold('gitai')} ${chalk.blue('commit')} ${chalk.gray('-n 5')}\n`;
                output += `  ${chalk.green('$')} ${chalk.bold('gitai')} ${chalk.blue('commit')} ${chalk.gray('--print-prompt')} | ${chalk.bold('pbcopy')} ${chalk.gray('# (macos) For Web AI Usage')}\n`;
            } else if (cmd.name() === 'pr') {
                output += `  ${chalk.green('$')} ${chalk.bold('gitai')} ${chalk.blue('pr')}\n`;
                output += `  ${chalk.green('$')} ${chalk.bold('gitai')} ${chalk.blue('pr')} ${chalk.gray('-t "Add user authentication feature"')}\n`;
                output += `  ${chalk.green('$')} ${chalk.bold('gitai')} ${chalk.blue('pr')} ${chalk.gray('--base main --head feature/auth')}\n`;
                output += `  ${chalk.green('$')} ${chalk.bold('gitai')} ${chalk.blue('pr')} ${chalk.gray('--print-prompt')} | ${chalk.bold('pbcopy')} ${chalk.gray('# (macos) For Web AI Usage')}\n`;
            }
            
            output += '\n';
            
            return output;
        }
        
        // Main command help.
        let output = `\n${chalk.bold.cyan('GitAI CLI')} - ${chalk.italic('AI-powered Git assistant')}\n\n`;
        
        // Usage section
        output += `${chalk.bold.yellow('USAGE')}\n\n`;
        output += `  ${chalk.green('$')} ${chalk.bold('gitai')} ${chalk.blue('[command]')} ${chalk.gray('[options]')}\n\n`;
        
        // Commands section
        output += `${chalk.bold.yellow('COMMANDS')}\n\n`;
        
        // Build commands table
        const commandsTable = new Table({
            chars: {
                'top': '', 'top-mid': '', 'top-left': '', 'top-right': '',
                'bottom': '', 'bottom-mid': '', 'bottom-left': '', 'bottom-right': '',
                'left': '', 'left-mid': '', 'mid': '', 'mid-mid': '',
                'right': '', 'right-mid': '', 'middle': ' '
            },
            style: { 'padding-left': 2, 'padding-right': 2 },
            colWidths: [30, 80]
        });
        
        cmd.commands.forEach(command => {
            const name = chalk.green(command.name());
            const args = command.usage().replace(command.name(), '').trim();
            const argsStr = args ? chalk.blue(` ${args}`) : '';
            const desc = chalk.white(command.description());
            
            commandsTable.push([`${name}${argsStr}`, desc]);
        });
        
        output += commandsTable.toString() + '\n\n';
        
        // Global options
        output += `${chalk.bold.yellow('GLOBAL OPTIONS')}\n\n`;
        
        // Extract global options (not command-specific)
        const optionsTable = new Table({
            chars: {
                'top': '', 'top-mid': '', 'top-left': '', 'top-right': '',
                'bottom': '', 'bottom-mid': '', 'bottom-left': '', 'bottom-right': '',
                'left': '', 'left-mid': '', 'mid': '', 'mid-mid': '',
                'right': '', 'right-mid': '', 'middle': ' '
            },
            style: { 'padding-left': 2, 'padding-right': 2 },
            colWidths: [30, 80]
        });
        
        const globalOptions = program.options.filter(option => !cmd.commands.some(c => c.options.includes(option)));
        globalOptions.forEach(option => {
            const flags = chalk.green(option.flags);
            const desc = chalk.white(option.description);
            optionsTable.push([flags, desc]);
        });
        
        output += optionsTable.toString() + '\n\n';
        
        // Examples section
        output += `${chalk.bold.yellow('EXAMPLES')}\n\n`;
        output += `  ${chalk.green('$')} ${chalk.bold('gitai')} ${chalk.blue('init')} ${chalk.gray('--force')}\n`;
        output += `  ${chalk.green('$')} ${chalk.bold('gitai')} ${chalk.blue('commit')} ${chalk.gray('-p "Use feat as commit type"')}\n`;
        output += `  ${chalk.green('$')} ${chalk.bold('gitai')} ${chalk.blue('pr')} ${chalk.gray('--target main')}\n`;
        output += '\n';
        
        return output;
    }
});

program
    .command('init')
    .description('Initialize GitAI CLI configuration in your project')
    .option('-f, --force', 'Overwrite existing configuration if it exists')
    .addOption(new Option('--from-global', 'Use configuration from your home directory (~/.gitai)').conflicts('fromDefault'))
    .addOption(new Option('--from-default', 'Use default template configuration').conflicts('fromGlobal'))
    .action(async (opts) => {
        await handleInitCommand(opts);
    });

program
    .option('-v, --verbose', 'enable verbose logging')
    .option('-q, --quiet', 'suppress non-error logs')
    .hook('preAction', (cmd) => {
        const { verbose, quiet } = cmd.opts();
        if (quiet) process.env.GITAI_LOG_LEVEL = 'quiet';
        else if (verbose) process.env.GITAI_LOG_LEVEL = 'verbose';
    });

program
    .command('commit')
    .description('Generate AI-powered commit messages for staged changes.')
    .option('-p, --prompt <message>', 'Additional instructions to guide the AI')
    .option('-n, --suggestions <number>', 'Number of suggestions to generate')
    .option('--print-prompt', 'print the AI prompt instead of calling the model')
    .action(async (options: { prompt?: string, suggestions?: number, printPrompt?: boolean }) => {
        try {
            const config: AppConfig = await getConfig();
            await handleCommitCommand(options, config);
        } catch (error: any) {
            console.error(`\n${chalk.red('Error:')} ${error.message}`);
            // process.exit(1); // Optionally exit with error code
        }
});

program
    .command('pr')
    .description('Generate a Pull-Request title & body from current branch diff')
    .option('-p, --prompt <text>', 'Additional instructions to guide the AI')
    .option('-t, --target <branch>', 'target branch to diff against')
    .option('-u, --unstaged', 'include unstaged changes')
    .option('--no-tree', 'exclude file tree snapshot')
    .option('--print-prompt', 'print the AI prompt instead of calling the model')
    .action(async (opts) => {
        const cfg: AppConfig = await getConfig();
        await handlePrCommand(opts, cfg);
    });


program
    .command('show-config')
    .description('Show resolved config path and content')
    .option('-p, --path-only', 'print current config path only')
    .action(async (opts) => {
        await handleShowConfigCommand(opts);
    });

async function main() {
    // commander's parseAsync is better for async actions
    await program.parseAsync(process.argv);

    // Show help if no command is given (or specific default behavior)
    if (!process.argv.slice(2).length) {
        program.outputHelp();
    }
}

main().catch(err => {
    console.error(chalk.red("A critical error occurred:"), err);
    process.exit(1);
});