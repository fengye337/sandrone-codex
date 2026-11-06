// Private stdio link to the owning Cocoa launcher; no socket or app access.
import {createInterface} from 'node:readline';
export function launcherChannel({token,input=process.stdin,output=process.stdout,onAction=async()=>{},onDisconnect=()=>{}}={}){
 if(!/^[a-f0-9-]{36}$/i.test(token||''))return null;
 let closed=false,disconnected=false,queue=Promise.resolve();const seen=new Set();
 const disconnect=()=>{if(!closed&&!disconnected){disconnected=true;onDisconnect();}};
 output.on('error',disconnect);
 const emit=(type,details={})=>{if(!closed&&!disconnected&&!output.destroyed)output.write('SANDRONE_LAUNCHER:'+token+':'+JSON.stringify({type,...details})+'\n');};
 const lines=createInterface({input,crlfDelay:Infinity});
 lines.on('line',line=>{
  if(line.length>2048)return;
  let value;try{value=JSON.parse(line);}catch{return;}
  if(value.token!==token||!['disable','enable','replay','stop'].includes(value.action)||!/^[a-f0-9-]{36}$/i.test(value.id||'')||seen.has(value.id))return;
  seen.add(value.id);if(seen.size>256)seen.delete(seen.values().next().value);
  queue=queue.then(async()=>{try{const result=await onAction(value.action,value.id);emit('command',{id:value.id,action:value.action,pass:true,...result});}catch(error){emit('command',{id:value.id,action:value.action,pass:false,message:String(error.message).slice(0,800)});}});
 });
 lines.on('close',disconnect);
 return {emit,close(){closed=true;lines.close();},settled:()=>queue};
}
