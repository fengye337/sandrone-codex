// Pure file analysis; never opens an app or debugger connection.
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {dataRoot} from './paths.mjs';
import {summarizeStartup} from '../engine/macos-startup-trace.mjs';
const args=process.argv.slice(2);let file;
if(!args.length){const record=JSON.parse(await readFile(path.join(dataRoot,'state/macos-session.json'),'utf8'));if(!/^startup-[a-zA-Z0-9-]+\.jsonl$/.test(record.traceFile||''))throw new Error('No instrumented startup record');file=path.join(dataRoot,'logs',record.traceFile);}
else if(args.length===2&&args[0]==='--file')file=args[1];else throw new Error('Usage: node macos/startup-report.mjs [--file /path/to/startup.jsonl]');
const bytes=await readFile(file,'utf8');if(bytes.length>20*1024*1024)throw new Error('Trace too large');
const complete=bytes.endsWith('\n')?bytes:bytes.slice(0,bytes.lastIndexOf('\n')+1);
const events=complete.split('\n').filter(Boolean).map(line=>JSON.parse(line));if(!events.length)throw new Error('No complete timing records yet');
console.log(JSON.stringify(summarizeStartup(events),null,2));
