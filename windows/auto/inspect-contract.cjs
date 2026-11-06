const fs=require('node:fs');
const path=require('node:path');
const root=process.argv[2];
const native=fs.readFileSync(path.join(root,'app/resources/native/windows-updater.node'));
if(native.readUInt16LE(0)!==0x5a4d) throw Error('Native updater is not a PE image');
const pe=native.readUInt32LE(0x3c);
if(native.readUInt32LE(pe)!==0x4550||native.readUInt16LE(pe+4)!==0x8664) throw Error('Native updater is not x64');
for(const symbol of ['napi_register_module_v1','node_api_module_get_api_version_v1'])
  if(!native.includes(Buffer.from(symbol+'\0'))) throw Error('Updater loading interface changed: '+symbol);
const asar=fs.readFileSync(path.join(root,'app/resources/app.asar'));
const header=JSON.parse(asar.subarray(16,16+asar.readUInt32LE(12)).toString());
const base=8+asar.readUInt32LE(4);let loader=false;
function walk(node,prefix=''){
 for(const [name,item] of Object.entries(node.files||{})){
  const key=prefix+name;
  if(item.files){walk(item,key+'/');continue;}
  if(!key.startsWith('.vite/build/')||!key.endsWith('.js')||item.unpacked||item.offset==null)continue;
  const text=asar.subarray(base+Number(item.offset),base+Number(item.offset)+item.size).toString();
  if(/process\.resourcesPath.{0,120}["'`]native["'`].{0,50}["'`]windows-updater\.node["'`]/s.test(text))loader=true;
 }
}
walk(header);
if(!loader) throw Error('Official native loading interface changed; manual repair required');
console.log(JSON.stringify({pass:true,scope:'static native loading contract; not a real startup test'}));
