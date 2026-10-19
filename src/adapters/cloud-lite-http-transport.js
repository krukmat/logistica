"use strict";
// M6.3 PEF Core syncJournal transport adapter. Only explicit loopback HTTP lab service.
const {verifyCloudLiteAck}=require("./cloud-lite-ack-proof.js");
function createCloudLiteHttpTransport({baseUrl,deviceToken,timeoutMs=2000}={}){
 if(typeof baseUrl!=="string"||typeof deviceToken!=="string"||
   !/^[a-f0-9]{64}$/.test(deviceToken)||
   !Number.isSafeInteger(timeoutMs)||timeoutMs<100||timeoutMs>5000)
   throw Error("CLOUD_LITE_TRANSPORT_CONFIG_DENIED");
 let url;
 try{url=new URL(baseUrl);}catch{throw Error("CLOUD_LITE_URL_INVALID");}
 if(url.protocol!=="http:"||url.hostname!=="127.0.0.1"||
   !/^[0-9]+$/.test(url.port)||url.pathname!=="/"||url.search||url.hash||
   url.username||url.password)
   throw Error("CLOUD_LITE_LOOPBACK_ONLY");
 const endpoint=url.origin+"/v1/device/ingest";
 return Object.freeze({
   kind:"PEF_CLOUD_LITE_HTTP_TRANSPORT_V1",
   scope:"LOOPBACK_ONLY",
   verifyAck:ack=>verifyCloudLiteAck(ack,deviceToken),
   async ingest(event){
     const response=await fetch(endpoint,{method:"POST",redirect:"error",
       headers:{"content-type":"application/json","x-pef-device-token":deviceToken},
       body:JSON.stringify(event),signal:AbortSignal.timeout(timeoutMs)});
     let data;
     try{data=await response.json();}
     catch{throw Error("CLOUD_LITE_RESPONSE_NOT_JSON");}
     if(!data||typeof data!=="object")throw Error("CLOUD_LITE_RESPONSE_INVALID");
     if(!response.ok||!data.ok)return {ok:false,durable:false,
       error:typeof data.error==="string"?data.error:"CLOUD_LITE_HTTP_"+response.status};
     return data;
   }
 });
}
module.exports={createCloudLiteHttpTransport};
