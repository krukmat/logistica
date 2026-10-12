"use strict";
// Static allowlisted receiver worker. CI faults are gated behind explicit sandbox env.
const fs=require("node:fs"),net=require("node:net");
const RECEIPT=/^[A-Za-z0-9][A-Za-z0-9_-]{0,47}$/;
const PACKAGE=/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const ci=process.env.PEF_ALLOW_FAULT_INJECTION==="CI_ISOLATED_WORKER";
function reply(m,other){process.send?.({type:"REPLY",id:m.id,...other});}
process.on("message",async m=>{
  if(!m||typeof m!=="object")return;
  if(m.type==="HEALTH")reply(m,{ok:true});
  else if(m.type==="RECEIPT"){
    const valid=typeof m.receiptId==="string"&&RECEIPT.test(m.receiptId)&&
      typeof m.packageId==="string"&&PACKAGE.test(m.packageId);
    reply(m,{ok:valid,error:valid?null:"INVALID_RECEIPT_INPUT"});
  }else if(m.type==="CRASH"){
    reply(m,{ok:true});setImmediate(()=>process.exit(42));
  }else if(ci&&m.type==="ISOLATION"){
    const hostCanaryInaccessible=!fs.existsSync(process.env.PEF_HOST_SENTINEL||"/__host__");
    const networkDenied=await new Promise(resolve=>{
      const socket=net.connect({host:"203.0.113.42",port:8765});
      const finish=value=>{socket.destroy();resolve(value);};
      socket.setTimeout(350,()=>finish(false));
      socket.once("connect",()=>finish(false));socket.once("error",()=>finish(true));
    });
    reply(m,{ok:true,uid:process.getuid?.(),hostCanaryInaccessible,networkDenied});
  }else if(ci&&m.type==="CPU_BURN"){
    const end=Date.now()+1000;
    let n=1;while(Date.now()<end){n=(n*1103515245+12345)|0;}
    reply(m,{ok:true,stressed:true});
  }else if(ci&&m.type==="MEMORY_PRESSURE"){
    reply(m,{ok:true,pressureBytes:128*1048576});
    setImmediate(()=>{
      // Intentionally retain and dirty actual resident pages under an isolated CI-only cgroup.
      globalThis.__pefIsolatedMemoryPressure=Buffer.alloc(192*1048576,1);
      const page=globalThis.__pefIsolatedMemoryPressure;
      for(let i=0;i<page.length;i+=4096)page[i]=1;
      setInterval(()=>{
        const active=globalThis.__pefIsolatedMemoryPressure;
        if(active)for(let i=0;i<active.length;i+=4096)active[i]=(active[i]+1)&255;
      },40);
    });
  }
});
process.send?.({type:"READY",id:"pef-receiver",pid:process.pid});
