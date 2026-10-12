"use strict";
// Local simulation-only control panel. Never modifies host network interfaces.
const http=require("node:http"),fs=require("node:fs"),path=require("node:path");
const {randomBytes,timingSafeEqual}=require("node:crypto");
const {createSession}=require("./session.js");
const {createDashboardLab}=require("./dashboard-lab.js");
const root=path.resolve(__dirname,"../../");
function createDashboardServer({host="127.0.0.1",port=8787,scenarioDir=path.join(root,"scenarios"),runtimeLab=null}={}){
  if(host!=="127.0.0.1"&&host!=="localhost")throw Error("LOCALHOST_ONLY");
  if(!Number.isSafeInteger(port)||port<0||port>65535)throw Error("INVALID_PORT");
  const secret=randomBytes(32).toString("hex");
  const session=createSession();
  // Inject an externally owned runtime for dashboard restarts without stopping PEF.
  const ownsLab=runtimeLab===null;
  const lab=runtimeLab||createDashboardLab();
  if(!lab||["snapshot","command","listReceipts","close"].some(m=>typeof lab[m]!=="function"))
    throw Error("INVALID_DASHBOARD_RUNTIME_PORT");
  let mode="sim";
  const view=()=>({mode,session:session.snapshot(),lab:lab.snapshot()});
  let boundPort=null;
  const assets={
    "/":{file:path.join(root,"public/dashboard.html"),type:"text/html; charset=utf-8"},
    "/dashboard.css":{file:path.join(root,"public/dashboard.css"),type:"text/css; charset=utf-8"},
    "/dashboard.js":{file:path.join(root,"public/dashboard.js"),type:"text/javascript; charset=utf-8"}
  };
  function listScenarios(){return fs.readdirSync(scenarioDir).filter(s=>/^[a-z0-9-]+\.json$/.test(s)).sort().map(s=>s.slice(0,-5));}
  function send(res,status,data,contentType="application/json; charset=utf-8"){
    res.writeHead(status,{"Content-Type":contentType,"X-Content-Type-Options":"nosniff",
      "Cache-Control":"no-store","X-Frame-Options":"DENY",
      "Content-Security-Policy":"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; base-uri 'none'; frame-ancestors 'none'"});
    res.end(typeof data==="string"?data:JSON.stringify(data));
  }
  function denied(res,code,error){send(res,code,{ok:false,error});}
  function auth(req){
    const token=req.headers["x-pef-session"];
    if(typeof token!=="string"||token.length!==secret.length||
      !timingSafeEqual(Buffer.from(token),Buffer.from(secret)))return false;
    const origin=req.headers.origin;
    if(origin){
      const allowed=[`http://127.0.0.1:${boundPort}`,`http://localhost:${boundPort}`];
      if(!allowed.includes(origin))return false;
    }
    return true;
  }
  async function readBody(req){
    if(!/^application\/json(?:\s*;|\s*$)/i.test(req.headers["content-type"]||""))throw Error("JSON_CONTENT_TYPE_REQUIRED");
    const chunks=[];let bytes=0;
    for await(const chunk of req){bytes+=chunk.length;if(bytes>65536)throw Error("BODY_TOO_LARGE");chunks.push(chunk);}
    let decoded;
    try{decoded=JSON.parse(Buffer.concat(chunks).toString("utf8"));}
    catch{throw Error("INVALID_JSON");}
    if(!decoded||typeof decoded!=="object"||Array.isArray(decoded))throw Error("INVALID_COMMAND");
    return decoded;
  }
  async function handle(req,res){
    const portNow=boundPort||port;
    if(![`127.0.0.1:${portNow}`,`localhost:${portNow}`].includes(req.headers.host)){
      denied(res,403,"HOST_DENIED");return;
    }
    const url=new URL(req.url,"http://127.0.0.1");
    if(url.pathname==="/api/local/receipts"&&req.method==="GET"){
      if(!auth(req)){denied(res,403,"SESSION_DENIED");return;}
      if(mode!=="lab"){denied(res,409,"LAB_MODE_REQUIRED");return;}
      send(res,200,{kind:"PEF_LOCAL_RECEIPTS_API",receipts:lab.listReceipts(),
        physicalValidated:false,remoteAuthenticated:false});
      return;
    }
    if(req.method==="GET"){
      const asset=assets[url.pathname];
      if(asset){send(res,200,fs.readFileSync(asset.file,"utf8"),asset.type);return;}
      if(url.pathname==="/api/bootstrap"){send(res,200,{token:secret,scenarios:listScenarios(),...view()});return;}
      if(url.pathname==="/api/state"){send(res,200,view());return;}
      denied(res,404,"NOT_FOUND");return;
    }
    if(req.method==="POST"&&url.pathname==="/api/local/receipts"){
      if(!auth(req)){denied(res,403,"SESSION_DENIED");return;}
      if(mode!=="lab"){denied(res,409,"LAB_MODE_REQUIRED");return;}
      let receipt;
      try{receipt=await readBody(req);}catch(e){denied(res,400,String(e.message||e));return;}
      try{
        const result=await lab.command({action:"receipt",receiptId:receipt.receiptId,
          packageId:receipt.packageId});
        const status=result.ok?(result.duplicate?200:201):
          result.error==="STORAGE_FULL_OR_UNSAFE"?507:
          result.error==="EVENT_ID_CONFLICT"?409:400;
        send(res,status,{ok:result.ok,result,...view()});return;
      }catch(e){denied(res,400,String(e.message||e));return;}
    }
    if(req.method!=="POST"||url.pathname!=="/api/command"){denied(res,404,"NOT_FOUND");return;}
    if(!auth(req)){denied(res,403,"SESSION_DENIED");return;}
    let body;
    try{body=await readBody(req);}catch(e){denied(res,400,String(e.message||e));return;}
    try{
      let result;
      if(body.command==="mode"){
        if(!["sim","lab"].includes(body.mode))throw Error("INVALID_DASHBOARD_MODE");
        mode=body.mode;
        result={ok:true,mode};
      }else if(body.command==="lab"){
        if(mode!=="lab")throw Error("LAB_MODE_REQUIRED");
        result=await lab.command(body);
      }else{
        if(mode!=="sim")throw Error("SIM_MODE_REQUIRED");
        switch(body.command){
        case "load":{
          if(typeof body.scenario!=="string"||!listScenarios().includes(body.scenario))throw Error("UNKNOWN_SCENARIO");
          const spec=JSON.parse(fs.readFileSync(path.join(scenarioDir,body.scenario+".json"),"utf8"));
          session.load(spec);result={ok:true};break;
        }
        case "next":result=session.next();break;
        case "run":result=session.run();break;
        case "reset":result=session.reset();break;
        case "rewind":result=session.rewind(body.cursor);break;
        case "enqueue":session.enqueue(body.step);result=session.next();break;
        default:throw Error("UNKNOWN_COMMAND");
        }
      }
      send(res,200,{ok:true,result,...view()});
    }catch(e){denied(res,400,String(e.message||e));}
  }
  const instance=http.createServer((req,res)=>{
    handle(req,res).catch(err=>{if(!res.headersSent)denied(res,500,"SERVER_ERROR");else res.destroy();});
  });
  async function listen(){
    if(instance.listening)throw Error("ALREADY_LISTENING");
    await new Promise((resolve,reject)=>{
      instance.once("error",reject);
      instance.listen(port,host,()=>{instance.off("error",reject);resolve();});
    });
    boundPort=instance.address().port;
    return `http://127.0.0.1:${boundPort}/`;
  }
  async function close(){
    try{if(instance.listening)await new Promise((resolve,reject)=>instance.close(e=>e?reject(e):resolve()));}
    finally{if(ownsLab)lab.close();}
  }
  return {listen,close,server:instance,snapshot:view};
}
module.exports={createDashboardServer};
