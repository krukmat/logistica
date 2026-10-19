"use strict";
// Optional local-only TLSv1.3 transport: no insecure HTTP fallback on TLS failure.
const https=require("node:https");
const {verifyCloudLiteAck}=require("./cloud-lite-ack-proof.js");
function createM73MtlsTransport({baseUrl,ca,cert,key,deviceToken,timeoutMs=1800}={}){
 let url;
 try{url=new URL(baseUrl);}catch{throw Error("M73_URL_INVALID");}
 if(url.protocol!=="https:"||url.hostname!=="127.0.0.1"||
   !/^[0-9]+$/.test(url.port)||url.pathname!=="/"||url.search||url.hash||
   url.username||url.password)throw Error("M73_HTTPS_LOOPBACK_ONLY");
 if(!Buffer.isBuffer(ca)||!Buffer.isBuffer(cert)||!Buffer.isBuffer(key)||
   typeof deviceToken!=="string"||!/^[a-f0-9]{64}$/.test(deviceToken)||
   !Number.isSafeInteger(timeoutMs)||timeoutMs<100||timeoutMs>5000)
    throw Error("M73_TLS_MATERIAL_REQUIRED");
 const agent=new https.Agent({ca,cert,key,rejectUnauthorized:true,minVersion:"TLSv1.3",
   maxVersion:"TLSv1.3",keepAlive:false,maxSockets:2});
 const endpoint=url.origin+"/v1/device/ingest";
 return Object.freeze({kind:"PEF_M73_MUTUAL_TLS_TRANSPORT_V1",scope:"LOOPBACK_MTLS",
  secureTransport:true,verifyAck:ack=>verifyCloudLiteAck(ack,deviceToken),
  async ingest(event){
   const payload=Buffer.from(JSON.stringify(event));
   const response=await new Promise((resolve,reject)=>{
     const request=https.request(endpoint,{agent,method:"POST",timeout:timeoutMs,
       headers:{"content-type":"application/json","content-length":payload.length,
         "x-pef-device-token":deviceToken}},res=>{
       const chunks=[];let length=0;res.on("data",chunk=>{
         length+=chunk.length;if(length>20000){request.destroy(Error("M73_RESPONSE_TOO_LARGE"));return;}
         chunks.push(chunk);
       });
       res.on("error",reject);res.on("end",()=>resolve({
         status:res.statusCode,text:Buffer.concat(chunks).toString("utf8")}));
     });
     request.on("timeout",()=>request.destroy(Error("M73_TLS_TIMEOUT")));
     request.on("error",reject);request.end(payload);
   });
   let body;
   try{body=JSON.parse(response.text);}catch{throw Error("M73_RESPONSE_NOT_JSON");}
   if(!body||typeof body!=="object")throw Error("M73_RESPONSE_INVALID");
   if(response.status!==200||body.ok!==true)return {ok:false,durable:false,
     error:body.error||"M73_HTTP_"+response.status};
   return body;
  }
 });
}
module.exports={createM73MtlsTransport};
