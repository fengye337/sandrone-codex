import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {diagnose} from './doctor.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Produce argv, never a shell command. No process is launched by this module.
export function launchPlan(app, projectRoot=root) {
  const paths=path.posix;
  if (!app || app.error || !app.electron || !/codex/i.test(app.id??'')) throw new Error('A verified Codex Electron bundle is required');
  if (!paths.isAbsolute(app.path) || !app.executable || paths.basename(app.executable)!==app.executable) throw new Error('Invalid app executable');
  if (!paths.isAbsolute(projectRoot)) throw new Error('Absolute project directory required');
  return {
    executable:paths.join(app.path,'Contents/MacOS',app.executable),
    args:['--remote-debugging-address=127.0.0.1','--remote-debugging-port=19337',`--user-data-dir=${paths.join(projectRoot,'profile/macos')}`],
    profile:paths.join(projectRoot,'profile/macos'),
    status:'PLAN_ONLY',
    prerequisites:['Save work and manually quit existing Codex sessions.',
      'Verify that port 19337 is free before launch.',
      'After launch, verify the loopback listener belongs to the launched executable and pin its browser ID before injection.'],
  };
}

if (process.argv[1] && import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const args=process.argv.slice(2);
    if(args.length && (args.length!==2 || args[0]!=='--app' || !path.isAbsolute(args[1]))) throw new Error('Usage: node macos/launch-plan.mjs [--app /absolute/path/Codex.app]');
    const report=await diagnose(args[1]);
    if(!report.app) throw new Error(report.status+': '+report.next);
    console.log(JSON.stringify(launchPlan(report.app),null,2));
  } catch(error) { console.error(error.message);process.exitCode=1; }
}
