// Cocoa test child. No imports of engine, app metadata, CDP, or user profiles.
import {launcherChannel} from '../../macos/launcher-channel.mjs';
const mode=process.env.SANDRONE_FIXTURE_MODE;let channel;
channel=launcherChannel({token:process.env.SANDRONE_LAUNCHER_TOKEN,onDisconnect:()=>process.exit(0),onAction:async action=>{if(action==='disable')channel.emit('status',{state:'disabled',cleanup:'confirmed'});if(action==='enable')channel.emit('status',{state:'ready'});if(action==='stop'){channel.emit('status',{state:'stopped',cleanup:mode==='stop-unconfirmed'?'unconfirmed':'confirmed'});setTimeout(()=>{channel.close();process.exit(0);},30);}}});
if(!channel)throw Error('Fixture requires private launcher token');
if(mode==='child-error'){channel.emit('status',{state:'failed',message:'Simulated startup failure',cleanup:'not-needed'});channel.close();process.exitCode=1;}
else if(mode==='unconfirmed'){channel.emit('status',{state:'stopped',cleanup:'unconfirmed'});channel.close();}
else {process.stderr.write('x'.repeat(128*1024)+'\n');setTimeout(()=>channel.emit('status',{state:'ready'}),100);}
