import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
const GLOBAL_DIR = path.join(os.homedir(), '.gitai');
const TEMPLATE_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../templates/default');
(async () => {
    try {
        await fs.access(GLOBAL_DIR);
        return;
    }
    catch { }
    await fs.cp(TEMPLATE_DIR, GLOBAL_DIR, { recursive: true });
})();
