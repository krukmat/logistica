"use strict";
// Local simulation-only control panel. Never modifies host network interfaces.
const http=require("node:http"),fs=require("node:fs"),path=require("node:path");
const {randomBytes,timingSafeEqual}=require("node:crypto");
const {createSession}=require("./session.js");
const root=path.resolve(__dirname,"../../");
function createDashboardServer({host="127.0.0.1",port=8787,scenarioDir=path.join(root,"scenarios")}={}){
  if(host!=="127.0.0.1"&&host!=="localhost")throw Error("LOCALHOST_ONLY");
  if(!Number.isSafeInteger(port)||port<0||port>65535)throw Error("INVALID_PORT");
  const secret=randomBytes(32).toString("hex");
  const session=createSession();
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
    if(req.method==="GET"){
      const asset=assets[url.pathname];
      if(asset){send(res,200,fs.readFileSync(asset.file,"utf8"),asset.type);return;}
      if(url.pathname==="/api/bootstrap"){send(res,200,{token:secret,scenarios:listScenarios(),session:session.snapshot()});return;}
      if(url.pathname==="/api/state"){send(res,200,session.snapshot());return;}
      denied(res,404,"NOT_FOUND");return;
    }
    if(req.method!=="POST"||url.pathname!=="/api/command"){denied(res,404,"NOT_FOUND");return;}
    if(!auth(req)){denied(res,403,"SESSION_DENIED");return;}
    let body;
    try{body=await readBody(req);}catch(e){denied(res,400,String(e.message||e));return;}
    try{
      let result;
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
      send(res,200,{ok:true,result,session:session.snapshot()});
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
  function close(){return new Promise((resolve,reject)=>instance.close(e=>e?reject(e):resolve()));}
  return {listen,close,server:instance,snapshot:()=>session.snapshot()};
}
module.exports={createDashboardServer};
