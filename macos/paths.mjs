import os from 'node:os';
import path from 'node:path';
// Only user-run launch/control/audit operations create files here.
export const dataRoot=process.env.SANDRONE_DATA_DIR?path.resolve(process.env.SANDRONE_DATA_DIR):path.join(os.homedir(),'Library/Application Support/SandroneMacDev');
