"use strict";
// M6.1 local-only durable registry. No production secrets/certificates, no cloud hosting.
const fs=require("node:fs"),os=require("node:os"),path=require("node:path");
const {createHash,randomUUID}=require("node:crypto");
const {acquireEdgeLock}=require("../runtime/single-writer.js");
const {checkedIdentity,keyOf,MAX_DEVICES}=require("../core/cloud-lite-registry-policy.js");
const FILE="pef-cloud-lite-registry-v1.json";
const HEX=/^[a-f0-9]{64}$/;
function safeRoot(dir){
 if(typeof dir!=="string"||!path.isAbsolute(dir))throw Error("CLOUD_LITE_ABSOLUTE_ROOT_REQUIRED");
 const anchor=path.resolve(os.tmpdir()),canonical=fs.realpathSync(anchor),absolute=path.resolve(dir);
 const base=absolute.startsWith(anchor+path.sep)?anchor:
   absolute.startsWith(canonical+path.sep)?canonical:null;
 if(!base)throw Error("CLOUD_LITE_TEMP_LAB_ONLY");
 let cursor=base;
 for(const part of path.relative(base,absolute).split(path.sep)){
   cursor=path.join(cursor,part);
   const st=fs.lstatSync(cursor);
   if(st.isSymbolicLink()||!st.isDirectory())throw Error("CLOUD_LITE_UNSAFE_DIRECTORY");
 }
 const real=fs.realpathSync(absolute);
 if(real===canonical||!real.startsWith(canonical+path.sep))throw Error("CLOUD_LITE_TEMP_LAB_ONLY");
 const st=fs.statSync(real);
 if((st.mode&0o077)!==0)throw Error("CLOUD_LITE_DIRECTORY_PERMISSIONS");
 return real;
}
function readDevices(dir){
 const file=path.join(dir,FILE);
 if(!fs.existsSync(file))return [];
 const st=fs.lstatSync(file);
 if(!st.isFile()||st.isSymbolicLink()||(st.mode&0o077)!==0||st.size>65536)
   throw Error("CLOUD_LITE_REGISTRY_FILE_UNSAFE");
 let doc;
 try{doc=JSON.parse(fs.readFileSync(file,"utf8"));}
 catch{throw Error("CLOUD_LITE_REGISTRY_CORRUPT");}
 if(!doc||doc.kind!=="PEF_CLOUD_LITE_REGISTRY_V1"||doc.schemaVersion!==1||
    !Array.isArray(doc.devices)||doc.devices.length>MAX_DEVICES)
   throw Error("CLOUD_LITE_REGISTRY_SCHEMA_INVALID");
 const seen=new Set();
 for(const item of doc.devices){
   if(!item||Object.keys(item).sort().join(",")!=="configRevision,credentialHash,deviceId,siteId"||
      !HEX.test(item.credentialHash))throw Error("CLOUD_LITE_REGISTRY_RECORD_INVALID");
   const id=checkedIdentity({siteId:item.siteId,deviceId:item.deviceId,
     configRevision:item.configRevision}),key=keyOf(id);
   if(seen.has(key))throw Error("CLOUD_LITE_REGISTRY_DUPLICATE");
   seen.add(key);
 }
 return doc.devices;
}
function digestCredential(token){
 if(typeof token!=="string"||!HEX.test(token))return null;
 return createHash("sha256").update("PEF_CLOUD_LITE_DEVICE_TOKEN_V1\0"+token).digest("hex");
}
function syncDirectory(dir){
 const fd=fs.openSync(dir,fs.constants.O_RDONLY|(fs.constants.O_DIRECTORY||0));
 try{fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
}
function createFileRegistryStore({dir}={}){
 const root=safeRoot(dir),owner=acquireEdgeLock(root);
 let closed=false;
 const ensure=()=>{if(closed)throw Error("CLOUD_LITE_STORE_CLOSED");};
 try{readDevices(root);}catch(e){owner.release();throw e;}
 return {
   root,
   read(){ensure();return readDevices(root);},
   append(record){
     ensure();
     const current=readDevices(root),id=checkedIdentity({
       siteId:record.siteId,deviceId:record.deviceId,configRevision:record.configRevision});
     if(!HEX.test(record.credentialHash))throw Error("CLOUD_LITE_REGISTRY_HASH_INVALID");
     if(current.some(x=>keyOf(x)===keyOf(id)))throw Error("DEVICE_ALREADY_ENROLLED");
     if(current.length>=MAX_DEVICES)throw Error("REGISTRY_CAPACITY_REACHED");
     const devices=[...current,{...id,credentialHash:record.credentialHash}];
     const content=JSON.stringify({kind:"PEF_CLOUD_LITE_REGISTRY_V1",schemaVersion:1,devices})+"\n";
     const tmp=path.join(root,".cloud-lite-stage-"+randomUUID());
     let fd;
     try{
       fd=fs.openSync(tmp,fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL|(fs.constants.O_NOFOLLOW||0),0o600);
       fs.writeFileSync(fd,content);fs.fsyncSync(fd);fs.closeSync(fd);fd=null;
       fs.renameSync(tmp,path.join(root,FILE));syncDirectory(root);
     }finally{if(fd!==undefined)fs.closeSync(fd);if(fs.existsSync(tmp))fs.unlinkSync(tmp);}
     return {persisted:true,fsyncCompleted:true,registered:devices.length};
   },
   close(){if(closed)return;closed=true;owner.release();}
 };
}
module.exports={createFileRegistryStore,digestCredential,readDevices,safeRoot};
