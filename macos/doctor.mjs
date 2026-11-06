import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';

export async function inspectApp(appPath) {
  try {
    const plist = path.join(appPath, 'Contents/Info.plist');
    await fs.access(plist);
    const read = key => execFileSync('/usr/libexec/PlistBuddy', ['-c', `Print :${key}`, plist], {encoding:'utf8', stdio:['ignore','pipe','pipe']}).trim();
    const id = read('CFBundleIdentifier');
    const executable = read('CFBundleExecutable');
    if (!executable || path.basename(executable) !== executable) throw new Error('Invalid executable name');
    await fs.access(path.join(appPath, 'Contents/MacOS', executable), fs.constants.X_OK);
    const exists=p=>fs.access(path.join(appPath,p)).then(()=>true,()=>false);
    const electron=(await exists('Contents/Frameworks/Electron Framework.framework') || await exists('Contents/Frameworks/Codex Framework.framework')) && await exists('Contents/Resources/app.asar');
    return {path:appPath, id, version:read('CFBundleShortVersionString'), executable, electron};
  } catch (error) { return {path:appPath, error:error.code==='ENOENT'?'APP_NOT_FOUND':error.message}; }
}

export async function diagnose(explicitPath) {
  const candidates = [...new Set((explicitPath?[explicitPath]:['/Applications/ChatGPT.app','/Applications/Codex.app',path.join(os.homedir(),'Applications/Codex.app')]))];
  const apps = await Promise.all(candidates.map(inspectApp));
  const app = apps.find(a=>!a.error && /codex/i.test(a.id) && a.electron);
  return {platform:process.platform, arch:process.arch, node:process.versions.node,
    websocket:typeof WebSocket==='function', apps, app:app??null,
    status:app?'CLIENT_FOUND_INJECTION_UNVERIFIED':'CODEX_APP_NOT_FOUND',
    next:app?'Verify loopback debugging and macOS window layout in a test session.':'Supply the Electron client path using --app /path/to/ChatGPT.app.'};
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args=process.argv.slice(2);
  if (args.length && (args.length!==2 || args[0]!=='--app' || !path.isAbsolute(args[1]))) {
    console.error('Usage: node macos/doctor.mjs [--app /absolute/path/Codex.app]');
    process.exitCode=1;
  } else {
    console.log(JSON.stringify(await diagnose(args[1]),null,2));
  }
}
