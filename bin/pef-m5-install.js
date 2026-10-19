#!/usr/bin/env node
"use strict";
const path=require("node:path");
const {applyRelease,verifyInstall}=require("../src/runtime/m5-install.js");
try{
 const args=process.argv.slice(2);
 const mode=args.shift();
 if(!["install","upgrade","verify","rollback"].includes(mode))throw Error("M5_USAGE_ACTION");
 const opts={};
 while(args.length){
   const name=args.shift();
   if(!["--root","--version"].includes(name)||!args.length||Object.hasOwn(opts,name))
     throw Error("M5_USAGE_OPTIONS");
   opts[name]=args.shift();
 }
 if(!opts["--root"]||mode!=="verify"&&!opts["--version"]||
    mode==="verify"&&opts["--version"])throw Error("M5_USAGE_OPTIONS");
 const root=path.resolve(opts["--root"]);
 const result=mode==="verify"?verifyInstall(root):
   applyRelease({root,version:opts["--version"],mode});
 console.log(JSON.stringify(result,null,2));
}catch(e){console.error("M5_INSTALL_BLOCKED:"+String(e.message||e));process.exitCode=1;}
