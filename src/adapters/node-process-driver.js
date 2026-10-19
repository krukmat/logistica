"use strict";
// Static allowlisted Node worker driver. No shell, no user-supplied executable or args.
// This provides process separation, NOT Linux/cgroup/FS/network security isolation.
const {fork}=require("node:child_process");
const path=require("node:path");
const WORKERS=Object.freeze({
  "pef-receiver":path.resolve(__dirname,"../workloads/receiver-worker.js"),
  "pef-property":path.resolve(__dirname,"../workloads/site-operations-worker.js"),
  "pef-host":path.resolve(__dirname,"../workloads/site-operations-worker.js")
});
function createNodeProcessDriver(){
  return {
    async start(manifest,{onExit}={}){
      if(!Object.hasOwn(WORKERS,manifest?.workload_id)||
         manifest.connectivity_mode!=="LOCAL_ONLY_CAPABLE"||
         typeof onExit!=="function")throw Error("WORKLOAD_BINARY_NOT_ALLOWLISTED");
      const worker=WORKERS[manifest.workload_id];
      const child=fork(worker,[],{silent:true,execArgv:[],cwd:path.dirname(worker),
        env:{PATH:process.env.PATH||"/usr/bin",LANG:"C",
          ...(manifest.workload_id==="pef-property"||manifest.workload_id==="pef-host"?
            {PEF_SITE_PROFILE:manifest.workload_id==="pef-property"?"property":"host",
             PEF_WORKLOAD_ID:manifest.workload_id}:{})},serialization:"json"});
      let exited=false,stopping=false,nextId=0;
      const pending=new Map();
      function exit(reason){
        if(exited)return;exited=true;
        for(const [id,p] of pending){clearTimeout(p.timer);p.reject(Error("WORKER_EXITED"));pending.delete(id);}
        if(!stopping)onExit(reason||"PROCESS_EXITED");
      }
      child.once("exit",(code,signal)=>exit("EXIT_"+(signal||code)));
      child.once("error",e=>exit(String(e.code||e.message||e)));
      const request=(type,body={})=>new Promise((resolve,reject)=>{
        if(exited||!child.connected){reject(Error("WORKER_UNAVAILABLE"));return;}
        const id=String(++nextId);
        const timer=setTimeout(()=>{pending.delete(id);reject(Error("WORKER_IPC_TIMEOUT"));},800);
        pending.set(id,{resolve,reject,timer});
        try{child.send({type,id,...body},error=>{
          if(error&&pending.has(id)){clearTimeout(timer);pending.delete(id);reject(error);}
        });}catch(e){clearTimeout(timer);pending.delete(id);reject(e);}
      });
      let ready;
      try{
        ready=await new Promise((resolve,reject)=>{
          const timeout=setTimeout(()=>reject(Error("WORKER_START_TIMEOUT")),1500);
          const onMessage=m=>{
            if(m?.type==="READY"&&m.id===manifest.workload_id){clearTimeout(timeout);child.off("message",onMessage);resolve(m);}
          };
          child.on("message",onMessage);
          child.once("exit",()=>{clearTimeout(timeout);child.off("message",onMessage);reject(Error("WORKER_START_EXITED"));});
        });
      }catch(e){stopping=true;child.kill("SIGKILL");throw e;}
      child.on("message",m=>{
        if(m?.type!=="REPLY"||!pending.has(m.id))return;
        const job=pending.get(m.id);pending.delete(m.id);clearTimeout(job.timer);job.resolve(m);
      });
      return {
        pid:ready.pid,isolation:"NODE_PROCESS_ONLY",actualLimitsEnforced:false,
        async health(){return await request("HEALTH");},
        async processReceipt(input){
          if(manifest.workload_id!=="pef-receiver")return {ok:false,error:"OPERATION_NOT_ALLOWED"};
          return await request("RECEIPT",input);
        },
        async processOperation(operation,input){
          if(!((manifest.workload_id==="pef-property"&&operation==="PROPERTY")||
               (manifest.workload_id==="pef-host"&&operation==="HOST")))
            return {ok:false,error:"OPERATION_NOT_ALLOWED"};
          return await request("SITE_OPERATION",{input});
        },
        async injectCrash(){
          if(exited)return {ok:false,error:"WORKER_UNAVAILABLE"};
          child.send({type:"CRASH"});return {ok:true,expectedState:"BACKOFF"};
        },
        async stop(){
          stopping=true;
          if(!exited){
            const dead=new Promise(resolve=>{child.once("exit",resolve);});
            child.kill("SIGTERM");
            const timer=setTimeout(()=>child.kill("SIGKILL"),400);timer.unref?.();
            await dead;clearTimeout(timer);
          }
        }
      };
    }
  };
}
module.exports={createNodeProcessDriver};
