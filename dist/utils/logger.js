import chalk from "chalk";
const order = {
    quiet: 0,
    normal: 1,
    verbose: 2,
};
function current() {
    return process.env.GITAI_LOG_LEVEL || "normal";
}
function ok(level) {
    return order[level] <= order[current()];
}
export const logger = {
    debug: (...a) => ok("verbose") && console.error(chalk.gray("[debug]"), ...a),
    info: (...a) => ok("normal") && console.error(chalk.blue("[info]"), ...a),
    warn: (...a) => ok("normal") && console.error(chalk.yellow("[warn]"), ...a),
    error: (...a) => console.error(chalk.red("[error]"), ...a),
};
