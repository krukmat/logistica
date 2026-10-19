"use strict";
// Host adapter: scoped temporary releases only, not a system package manager.
// Atomic rename + fsync supports lab power-process interruption, not physical powercut.
const fs=require("node:fs"),path=require("node:path"),os=require("node:os");
const {createHash,randomUUID}=require("node:crypto");
const {nextInstallState,validVersion}=require("../core/install-policy.js");
const PROJECT=path.resolve(__dirname,"../..");
const INCLUDED=["bin/pef-edge.js","package.json"];
const DIRS=["src/core","src/runtime","src/adapters","src/workloads","src/emulator"];
const sha=data=>createHash("sha256").update(data).digest("hex");
const encode=v=>Buffer.from(JSON.stringify(v,null,2)+"\n");
function safeDir(p,{create=false}={}){
 if(typeof p!=="string"||!path.isAbsolute(p))throw Error("M5_ABSOLUTE_ROOT_REQUIRED");
 const anchor=path.resolve(os.tmpdir());
 const parent=fs.realpathSync(anchor);
 const absolute=path.resolve(p);
 // macOS commonly exposes os.tmpdir() below /var, whose canonical path is /private/var.
 // Accept the original tmpdir spelling OR its canonical spelling, but nothing else.
 // The platform-owned anchor is the only symlink alias allowed by this policy.
 const base=absolute.startsWith(anchor+path.sep)?anchor:
   absolute.startsWith(parent+path.sep)?parent:null;
 if(!base)throw Error("M5_TEMP_ROOT_ONLY");
 const suffix=path.relative(base,absolute).split(path.sep);
 let scope=base;
 for(const component of suffix){
   scope=path.join(scope,component);
   let stat;
   try{stat=fs.lstatSync(scope);}catch(e){if(e.code!=="ENOENT")throw e;}
   if(stat){
     if(stat.isSymbolicLink()||!stat.isDirectory())throw Error("M5_UNSAFE_ROOT");
   }else if(create)fs.mkdirSync(scope,{mode:0o700});
   else throw Error("M5_ROOT_NOT_FOUND");
 }
 const real=fs.realpathSync(absolute);
 if(real===parent||!real.startsWith(parent+path.sep))
   throw Error("M5_TEMP_ROOT_ONLY");
 // Reject any symbolic component, not only the terminal path.
 let cursor=real;
 while(cursor!==parent){
   if(fs.lstatSync(cursor).isSymbolicLink()||!fs.statSync(cursor).isDirectory())
     throw Error("M5_UNSAFE_ROOT");
   cursor=path.dirname(cursor);
 }
 return real;
}
function safeFile(file){
 const stat=fs.lstatSync(file);
 if(!stat.isFile()||stat.isSymbolicLink()||stat.size>2*1024*1024)
   throw Error("M5_UNSAFE_RELEASE_FILE");
 return fs.readFileSync(file);
}
function collect(){
 const entries=[];
 function add(rel){
   if(!/^[a-zA-Z0-9_./-]+$/.test(rel)||rel.split("/").includes(".."))
     throw Error("M5_UNSAFE_PACKAGE_PATH");
   const content=safeFile(path.join(PROJECT,rel));
   entries.push({path:rel,bytes:content.length,sha256:sha(content)});
 }
 function walk(dir){
   for(const e of fs.readdirSync(path.join(PROJECT,dir),{withFileTypes:true})){
     const rel=dir+"/"+e.name;
     if(e.isSymbolicLink())throw Error("M5_SYMLINK_IN_SOURCE");
     if(e.isDirectory())walk(rel);
     else if(e.isFile()&&e.name.endsWith(".js"))add(rel);
   }
 }
 INCLUDED.forEach(add);DIRS.forEach(walk);
 entries.sort((a,b)=>a.path.localeCompare(b.path,"en"));
 return entries;
}
const hashEntries=entries=>sha(encode(entries));
function fsyncDir(dir){
 const fd=fs.openSync(dir,fs.constants.O_RDONLY|(fs.constants.O_DIRECTORY||0));
 try{fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
}
function writeAtomic(root,filename,data){
 const file=path.join(root,filename),tmp=path.join(root,".state-"+randomUUID());
 const fd=fs.openSync(tmp,fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL,0o600);
 try{fs.writeFileSync(fd,data);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
 fs.renameSync(tmp,file);fsyncDir(root);
}
function readState(root){
 const file=path.join(root,"state.json");
 if(!fs.existsSync(file))return null;
 const state=JSON.parse(safeFile(file).toString("utf8"));
 if(state.kind!=="PEF_M5_LAB_INSTALL_STATE"||state.schemaVersion!==1||
   !validVersion(state.activeVersion)||!/^[a-f0-9]{64}$/.test(state.activeHash)||
   (state.previousVersion!==null&&!validVersion(state.previousVersion))||
   state.physicalValidated!==false||state.systemServiceInstalled!==false)
   throw Error("M5_STATE_INVALID");
 return state;
}
function releaseDir(root,version){return path.join(root,"releases",version);}
function verifyRelease(root,version){
 if(!validVersion(version))throw Error("M5_INVALID_VERSION");
 const dir=releaseDir(root,version);
 const releases=path.join(root,"releases");
 if(!fs.existsSync(releases)||fs.lstatSync(releases).isSymbolicLink()||
    !fs.lstatSync(releases).isDirectory())throw Error("M5_RELEASE_ROOT_UNSAFE");
 if(!fs.existsSync(dir)||fs.lstatSync(dir).isSymbolicLink()||!fs.statSync(dir).isDirectory())
   throw Error("M5_RELEASE_MISSING");
 const manifest=JSON.parse(safeFile(path.join(dir,"manifest.json")).toString("utf8"));
 if(manifest.kind!=="PEF_M5_RELEASE_MANIFEST_V1"||manifest.version!==version||
   !Array.isArray(manifest.files)||manifest.files.length<20||
   manifest.digest!==hashEntries(manifest.files)||manifest.physicalValidated!==false)
   throw Error("M5_MANIFEST_INVALID");
 const expected=new Set([...manifest.files.map(x=>x.path),"manifest.json"]);
 const actual=[];
 function collectFiles(dirNow,base=""){
   for(const e of fs.readdirSync(dirNow,{withFileTypes:true})){
     if(e.isSymbolicLink())throw Error("M5_RELEASE_SYMLINK");
     const rel=base?base+"/"+e.name:e.name;
     if(e.isDirectory())collectFiles(path.join(dirNow,e.name),rel);
     else if(e.isFile())actual.push(rel);
     else throw Error("M5_RELEASE_UNEXPECTED_TYPE");
   }
 }
 collectFiles(dir);
 if(actual.length!==expected.size||actual.some(x=>!expected.has(x)))
   throw Error("M5_RELEASE_FILE_SET_CHANGED");
 for(const entry of manifest.files){
   if(!entry||!(/^[a-zA-Z0-9_./-]+$/.test(entry.path))||
     entry.path.startsWith("/")||entry.path.split("/").includes(".."))
     throw Error("M5_RELEASE_PATH_INVALID");
   const data=safeFile(path.join(dir,entry.path));
   if(data.length!==entry.bytes||sha(data)!==entry.sha256)
     throw Error("M5_RELEASE_DIGEST_MISMATCH:"+entry.path);
 }
 return {version,digest:manifest.digest,files:manifest.files.length,dir};
}
function verifyInstall(rootInput){
 const root=safeDir(rootInput),state=readState(root);
 if(!state)throw Error("M5_INSTALL_MISSING");
 const release=verifyRelease(root,state.activeVersion);
 if(release.digest!==state.activeHash)throw Error("M5_ACTIVE_DIGEST_MISMATCH");
 if(state.previousVersion){
   const prev=verifyRelease(root,state.previousVersion);
   if(prev.digest!==state.previousHash)throw Error("M5_PREVIOUS_DIGEST_MISMATCH");
 }
 return {kind:"PEF_M5_LAB_INSTALL_VERIFIED_V1",ok:true,status:"LAB_PASS",
   root,activeVersion:state.activeVersion,previousVersion:state.previousVersion,
   digest:state.activeHash,releaseDir:release.dir,files:release.files,
   dataDir:path.join(root,"data"),physicalValidated:false,
   systemServiceInstalled:false,realRebootValidated:false};
}
function withLock(root,fn){
 const lock=path.join(root,".install-lock");
 try{fs.mkdirSync(lock,{mode:0o700});}
 catch(e){throw Error("M5_INSTALL_LOCKED");}
 try{return fn();}finally{fs.rmSync(lock,{recursive:true,force:true});}
}
function releaseCreate(root,version){
 const releases=path.join(root,"releases");
 if(!fs.existsSync(releases))fs.mkdirSync(releases,{mode:0o700});
 if(fs.lstatSync(releases).isSymbolicLink()||!fs.lstatSync(releases).isDirectory())
   throw Error("M5_RELEASE_ROOT_UNSAFE");
 const dest=releaseDir(root,version);
 if(fs.existsSync(dest))return verifyRelease(root,version);
 const tmp=path.join(releases,".stage-"+randomUUID());
 fs.mkdirSync(tmp,{mode:0o700});
 try{
   const files=collect();
   for(const entry of files){
     const target=path.join(tmp,entry.path);
     fs.mkdirSync(path.dirname(target),{recursive:true,mode:0o700});
     const fd=fs.openSync(target,fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL,0o600);
     try{fs.writeFileSync(fd,safeFile(path.join(PROJECT,entry.path)));fs.fsyncSync(fd);}
     finally{fs.closeSync(fd);}
   }
   const manifest={kind:"PEF_M5_RELEASE_MANIFEST_V1",version,digest:hashEntries(files),
     files,physicalValidated:false,systemServiceInstalled:false};
   const fd=fs.openSync(path.join(tmp,"manifest.json"),fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL,0o600);
   try{fs.writeFileSync(fd,encode(manifest));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
   fsyncDir(tmp);
   fs.renameSync(tmp,dest);fsyncDir(releases);
   return verifyRelease(root,version);
 }finally{if(fs.existsSync(tmp))fs.rmSync(tmp,{recursive:true,force:true});}
}
function applyRelease({root:givenRoot,version,mode,interruptBeforeActivation=false}){
 if(!["install","upgrade","rollback"].includes(mode)||!validVersion(version))
   throw Error("M5_INVALID_INSTALL_COMMAND");
 // Validate the path before creating anything outside the ephemeral lab tree.
 const root=safeDir(givenRoot,{create:true});
 return withLock(root,()=>{
   const current=readState(root);
   if(current)verifyInstall(root);
   if(mode==="install"&&current?.activeVersion===version){
     const installed=verifyRelease(root,version);
     const original=collect();
     if(installed.digest!==hashEntries(original))throw Error("M5_VERSION_IMMUTABLE");
     return {...verifyInstall(root),idempotent:true,changed:false};
   }
   if(mode==="rollback"&&(!current||current.previousVersion!==version))
     throw Error("M5_ROLLBACK_TARGET_DENIED");
   if(mode==="upgrade"&&!current)throw Error("M5_NOT_INSTALLED");
   if(mode==="install"&&current)throw Error("M5_ALREADY_INSTALLED");
   const release=mode==="rollback"?verifyRelease(root,version):releaseCreate(root,version);
   if(mode!=="rollback"&&release.digest!==hashEntries(collect()))
     throw Error("M5_PACKAGE_SOURCE_CHANGED");
   // Trusted in-process lab fault; never exposed as CLI config or privileged action.
   if(interruptBeforeActivation===true)throw Error("M5_INJECTED_BEFORE_ACTIVATION");
   const decision=nextInstallState(current,version,release.digest,mode);
   if(decision.changed){
     const dataPath=path.join(root,"data");
     if(!fs.existsSync(dataPath))fs.mkdirSync(dataPath,{mode:0o700});
     if(fs.lstatSync(dataPath).isSymbolicLink()||!fs.lstatSync(dataPath).isDirectory())
       throw Error("M5_DATA_DIR_UNSAFE");
     writeAtomic(root,"state.json",encode(decision.state));
   }
   return {...verifyInstall(root),idempotent:!decision.changed,changed:decision.changed};
 });
}
module.exports={applyRelease,verifyInstall,verifyRelease,collect,hashEntries,safeDir};
