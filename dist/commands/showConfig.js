import yaml from 'js-yaml';
import chalk from 'chalk';
import { getConfigRaw } from '../utils/configLoader.js';
export async function handleShowConfigCommand(opts) {
    const { path: cfgPath, raw } = await getConfigRaw();
    if (opts.pathOnly) {
        console.log(cfgPath);
        return;
    }
    console.log(chalk.cyan(`📃 Config path: ${cfgPath}`));
    console.log(chalk.gray('────────────────────────────────'));
    console.log(yaml.dump(raw));
}
