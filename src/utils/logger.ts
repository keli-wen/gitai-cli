import chalk from "chalk";

export type LogLevel = "quiet" | "normal" | "verbose";

const order: Record<LogLevel, number> = {
    quiet: 0,
    normal: 1,
    verbose: 2,
};

function current(): LogLevel {
    return (process.env.GITAI_LOG_LEVEL as LogLevel) || "normal";
}

function ok(level: LogLevel) {
    return order[level] <= order[current()];
}

export const logger = {
    debug: (...a: unknown[]) => ok("verbose") && console.error(chalk.gray("[debug]"), ...a),
    info: (...a: unknown[]) => ok("normal") && console.error(chalk.blue("[info]"), ...a),
    warn: (...a: unknown[]) => ok("normal") && console.error(chalk.yellow("[warn]"), ...a),
    error: (...a: unknown[]) => console.error(chalk.red("[error]"), ...a),
};