import fs from 'fs/promises';
import path from 'path';
import { execSync } from 'child_process';
import { logger } from '../utils/logger.js';
import { listFilesAsTree, getMergeBase, getDiff, hasMergeConflicts, getCommitSummaries } from '../utils/git.js';
import { generatePrDocAI, buildPrPrompt } from '../utils/llm.js';
import { AppConfig, GITAI_COMMAND } from '../types/index.js';
import logSymbols from 'log-symbols';
import chalk from 'chalk';
import ora from 'ora';
import { getResolvedLLMConfig } from '../utils/configLoader.js';

export interface PrCommandOptions {
    prompt?: string;
    target?: string;
    unstaged?: boolean;
    tree?: boolean;
    printPrompt?: boolean;
}

const CMD: GITAI_COMMAND = GITAI_COMMAND.PR;

export async function handlePrCommand(opts: PrCommandOptions, appConfig: AppConfig) {
    logger.debug(`pr commands opts: ${JSON.stringify(opts)}`);
    const cwd = process.cwd();
    const branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd }).toString().trim();

    // 1. Resolve target branch
    const target = opts.target || appConfig.pr?.base_branch || 'main';
    logger.info(`Comparing branch ${chalk.green(branch)} → ${chalk.blue(target)}`);

    // 2. merge-base & diff
    const mergeBase = await getMergeBase(target);
    if (!mergeBase) {
        logger.error(`${chalk.red(logSymbols.error)} Merge base for branch '${target}' not found`);
        return;
    }

    const diff = await getDiff({
        from: mergeBase,
        to: 'HEAD',
        includeUnstaged: opts.unstaged ?? false,
        maxLinesPerFile: appConfig.pr?.max_lines_per_file
    });

    // 3. File Tree (Determined by config or command line argument)
    const includeTree = opts.tree !== false && 
        (opts.tree !== true || appConfig.pr?.include_file_tree !== false);
    const tree = includeTree ? await listFilesAsTree() : '';

    // 4. commit Summaries
    const commits = await getCommitSummaries(mergeBase, 'HEAD');

    // 5. Conflict Detection
    if (appConfig.pr?.warn_on_conflict !== false && await hasMergeConflicts(target)) {
        logger.warn(`⚠️ Merging ${branch} into ${target} will cause conflicts. PR description will still be generated, but please resolve conflicts before committing.`);
    }

    // 6. Assemble Prompt
    const prompt = await buildPrPrompt({
        branch,
        target,
        diff,
        tree,
        commits,
        userPrompt: opts.prompt,
        appConfig,
    });

    if (!prompt) return;

    if (opts.printPrompt) {
        console.log(prompt);
        return;
    }

    const curAI = await getResolvedLLMConfig(appConfig, CMD).model;

    // 7. Call LLM
    const aiSpinner = ora({
        text: chalk.cyan(`Using ${curAI} to generate PR description... (estimated time: ~1 minute)`),
        spinner: 'aesthetic',
        color: 'cyan'
    }).start();
    
    // Setup timer
    const startTime = Date.now();
    const timer = setInterval(() => {
        const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
        const minutes = Math.floor(elapsedSeconds / 60);
        const seconds = elapsedSeconds % 60;
        aiSpinner.text = chalk.cyan(`Using ${curAI} to generate PR description... (${minutes}:${seconds.toString().padStart(2, '0')} elapsed, ≈1 minute)`);
    }, 1000);
    
    const prJson = await generatePrDocAI(prompt, appConfig, CMD);
    
    // Clear the timer
    clearInterval(timer);
    
    if (!prJson) {
        aiSpinner.fail(chalk.red('Failed to generate PR description'));
        return;
    }
    
    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
    aiSpinner.succeed(chalk.green(`PR description generated successfully (${totalTime}s)`));

    // 8. Write to disk .gitai/pr_docs
    const prDir = path.join(cwd, '.gitai', 'pr_docs');
    await fs.mkdir(prDir, { recursive: true });
    const fname = `${new Date().toISOString().slice(0, 16).replace(/[-T:]/g, '')}-${branch}.md`;
    const outfile = path.join(prDir, fname);

    const md = `## ${prJson.title}\n\n${prJson.body}\n`;
    await fs.writeFile(outfile, md, 'utf-8');
    console.log(chalk.green(`✅ PR draft written to ${path.relative(cwd, outfile)}`));
}