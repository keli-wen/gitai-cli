import { simpleGit, SimpleGit, DiffResult } from 'simple-git';
import { logger } from './logger.js';
import chalk from 'chalk';

const git: SimpleGit = simpleGit();


/**
 * Get git repository root
 * @returns The git repository root or null if not a git repository
 */
export async function getRepoRoot(): Promise<string | null> {
    try {
        const root = await git.revparse(['--show-toplevel']);
        return root.trim();
    } catch (error: any) {
        logger.error(`Error getting git repository root: ${error.message}`);
        return null;
    }
}


/**
 * Get the staged diff
 * @returns The staged diff or null if there are no staged changes
 */
export async function getStagedDiff(): Promise<string | null> {
    try {
        const diff: string = await git.diff(['--staged']);
        return diff || null; // If there are no staged changes, diff() may return an empty string
    } catch (error: any) {
        console.error('Error getting staged diff:', error.message);
        if (error.message.includes("not a git repository")) {
            console.error("This command must be run inside a Git repository.");
        } else if (error.message.includes("ambiguous argument 'HEAD'")) {
            console.error("No commits yet in this repository. Please make an initial commit.");
        }
        // In actual applications, you may want to throw an error instead of process.exit
        // process.exit(1);
        throw error; // Let the caller handle the error
    }
}


/**
 * Commit the staged changes
 * @param message The commit message
 */
export async function commit(message: string): Promise<void> {
    try {
        await git.commit(message);
        console.log('Successfully committed.');
    } catch (error: any) {
        console.error('Error committing:', error.message);
        // process.exit(1);
        throw error;
    }
}

/**
 * Get the merge base of the target branch and the current branch
 * @param target The target branch
 * @returns The merge base
 */
export async function getMergeBase(target: string): Promise<string | null> {
    try {
        // Check if target branch exists
        const branches = await git.branch();
        if (!branches.all.includes(target)) {
            throw new Error(`Target branch '${target}' does not exist`);
        }
    } catch (error: any) {
        logger.error(`Error checking target branch: ${error.message}`);
        return null;
    }
    const out = await git.raw(['merge-base', target, 'HEAD']);
    return out.trim();
}

/**
 * Get the diff between two commits
 * @param from The starting commit
 * @param to The ending commit
 * @param includeUnstaged Whether to include unstaged changes
 * @param maxLinesPerFile The maximum number of lines per file in the diff
 * @returns The diff
 */
interface DiffOpt { from: string; to: string; includeUnstaged: boolean; maxLinesPerFile?: number }
export async function getDiff({ from, to, includeUnstaged, maxLinesPerFile }: DiffOpt): Promise<string> {
    let diff = await git.diff([`${from}`, `${to}`]); // same as git diff from to
    logger.debug(`includeUnstaged: ${includeUnstaged}`);
    if (includeUnstaged) {
        logger.info("Including unstaged changes");
        diff += "\n\nThe following changes are unstaged:\n\n";
        diff += await git.diff(); // Worktree changes
    }
    logger.debug(`maxLinesPerFile: ${maxLinesPerFile}`);
    if (maxLinesPerFile && maxLinesPerFile > 0) {
        diff = limitDiffLines(diff, maxLinesPerFile);
    }
    return diff;
}

/**
 * List files as a tree
 * @param maxDepth The maximum depth of the tree
 * @returns The tree
 */
export async function listFilesAsTree(maxDepth?: number): Promise<string> {
    const out = await git.raw(['ls-files', '--cached', '--others', '--exclude-standard']);
    const files = out.split('\n').filter(Boolean);
    const treeLines: string[] = [];
    files.forEach(f => {
        const segments = f.split('/');
        const depth = maxDepth ? Math.min(segments.length, maxDepth) : segments.length;
        for (let i = 0; i < depth; i++) {
            const indent = '  '.repeat(i);
            const line = `${indent}${segments[i]}${i === depth - 1 && depth < segments.length ? '/...' : ''}`;
            if (!treeLines.includes(line)) treeLines.push(line);
        }
    });
    return treeLines.join('\n');
}

/**
 * Get the commit summaries between two commits
 * @param from The starting commit
 * @param to The ending commit
 * @returns The commit summaries
 */
export async function getCommitSummaries(from: string, to: string): Promise<string> {
    return git.raw(['log', '--oneline', `${from}..${to}`]);
}

/**
 * Check if there are merge conflicts
 * @param target The target branch
 * @returns Whether there are merge conflicts
 */
export async function hasMergeConflicts(target: string): Promise<boolean> {
    try {
        // Check if the target branch exists
        try {
            await git.raw(['rev-parse', '--verify', target]);
        } catch (err) {
            logger.warn(`Target branch "${target}" does not exist or is not accessible`);
            return false; // Target branch does not exist, cannot determine conflicts
        }
        
        const mergeBase = await getMergeBase(target);
        if (!mergeBase) {
            logger.warn(`Merge base for branch '${target}' not found`);
            return false;
        }
        // Use git-merge-tree to check, this will not change the working area
        const result = await git.raw([
            'merge-tree', 
            mergeBase, 
            'HEAD', 
            target
        ]);

        // Check if the output contains conflict markers
        return result.includes('<<<<<<< ') || result.includes('=======');
    } catch (err) {
        logger.debug(`Error checking for merge conflicts: ${err}`);
        // When an error occurs, conservatively do not report a conflict
        return false;
    }
}

// Helper function to limit the number of lines per file in the diff
function limitDiffLines(diffText: string, maxLines: number): string {
    const lines = diffText.split('\n');
    let result: string[] = [];
    let fileLines = 0;
    let inFile = false;
    let fileHeader = '';

    let isSomeFileTruncated = false;
    for (const line of lines) {
        // Detect file header
        if (line.startsWith('diff --git ')) {
            // Save the state of the previous file
            if (inFile && fileLines > maxLines) {
                result.push(`... (${fileLines - maxLines} more lines omitted) ...`);
                isSomeFileTruncated = true;
            }
            
            // Reset state
            fileHeader = line;
            fileLines = 0;
            inFile = true;
            result.push(line);
            continue;
        }

        // Accumulate line count (only count actual code lines, not metadata)
        if (inFile && !line.startsWith('---') && !line.startsWith('+++') && !line.startsWith('@@')) {
            fileLines++;
        }

        // Add line if not exceeding limit
        if (!inFile || fileLines <= maxLines) {
            result.push(line);
        }
    }

    // Handle the last file
    if (inFile && fileLines > maxLines) {
        result.push(`... (${fileLines - maxLines} more lines omitted) ...`);
        isSomeFileTruncated = true;
    }

    if (isSomeFileTruncated) {
        logger.info(chalk.yellow("Some files were truncated due to the max lines limit"));
    }

    return result.join('\n');
}