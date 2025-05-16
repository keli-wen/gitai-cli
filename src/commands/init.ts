import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';
import logSymbols from 'log-symbols';

interface InitOpts {
    force?: boolean;
    fromGlobal?: boolean;
    fromDefault?: boolean;
}

const GLOBAL_DIR = path.join(os.homedir(), '.gitai');
const TEMPLATE_DIR = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../templates/default'
);

export async function handleInitCommand(opts: InitOpts) {
    const target = path.join(process.cwd(), '.gitai');

    // (1) The target directory already exists
    try {
        await fs.access(target);
        if (!opts.force) {
            console.log(`${logSymbols.warning} ${chalk.yellow('.gitai already exists. Use --force to overwrite.')}`);
            return;
        }
        
        const bak = `${target}.bak-${Date.now()}`;
        await fs.rename(target, bak);
        
        console.log(`${logSymbols.success} ${chalk.green(`Backup created: ${path.relative(process.cwd(), bak)}`)}`);
    } catch {}

    // (2) Parse source directory
    let src: string;
    if (opts.fromGlobal) src = GLOBAL_DIR;
    else if (opts.fromDefault) src = TEMPLATE_DIR;
    else src = (await dirExists(GLOBAL_DIR)) ? GLOBAL_DIR : TEMPLATE_DIR;

    // (3) Copy
    console.log(`${logSymbols.info} ${chalk.blue(`Creating GitAI CLI configuration from ${src} ...`)}`);
    
    await fs.cp(src, target, { recursive: true });
    
    console.log(`${logSymbols.success} ${chalk.green(`GitAI CLI configuration created successfully in ${path.relative(process.cwd(), target)}`)}`);

    // (4) Copy .env-example to current directory
    await copyEnvExample(opts.force);

    // (5) Check if .git already exists
    const gitDir = path.join(process.cwd(), '.git');
    try {
        await fs.access(gitDir);
    } catch {
        console.log(`${logSymbols.warning} ${chalk.yellow('No .git directory found. GitAI requires a git repository to function properly.')}`);
        console.log(`${logSymbols.warning} ${chalk.yellow('Please run "git init" to initialize a git repository first.')}`);
        return;
    }
}

async function dirExists(p: string) {
    try { await fs.access(p); return true; } catch { return false; }
}

async function copyEnvExample(force?: boolean) {
    const sourceEnvFile = path.join(
        path.dirname(fileURLToPath(import.meta.url)),
        '../../.env-example'
    );
    const targetEnvFile = path.join(process.cwd(), '.env-example');
    
    try {
        // Check if .env-example already exists in current directory
        await fs.access(targetEnvFile);
        
        if (!force) {
            console.log(`${logSymbols.info} ${chalk.blue('.env-example already exists, skipping.')}`);
            return;
        }
        
        // Backup existing .env-example if force is true
        const bak = `${targetEnvFile}.bak-${Date.now()}`;
        await fs.rename(targetEnvFile, bak);
        console.log(`${logSymbols.success} ${chalk.green(`Backup created: ${path.relative(process.cwd(), bak)}`)}`);
    } catch {}
    
    // Copy .env-example to current directory
    try {
        await fs.copyFile(sourceEnvFile, targetEnvFile);
        console.log(`${logSymbols.success} ${chalk.green('Created .env-example file in current directory.')}`);
    } catch (err) {
        console.log(`${logSymbols.error} ${chalk.red(`Failed to copy .env-example: ${err}`)}`);
    }
}