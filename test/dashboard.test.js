"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {createDashboardServer}=require("../src/emulator/dashboard-server.js");
test("local dashboard serves static panel and scenario bootstrap",async()=>{
  const app=createDashboardServer({port:0});const url=await app.listen();
  try{
    const html=await fetch(url);assert.equal(html.status,200);
    assert.match(await html.text(),/PEF Control Panel/);
    const result=await (await fetch(url+"api/bootstrap")).json();
    assert.ok(result.token.length>=32);
    assert.ok(result.scenarios.includes("wan-offline"));
    assert.equal(result.session.chart.type,"parallel");
    assert.equal(result.session.physicalValidated,false);
    const script=await fetch(url+"dashboard.js");
    assert.equal(script.status,200);
  }finally{await app.close();}
});
test("dashboard is bound to loopback and blocks host rewriting",async()=>{
  assert.throws(()=>createDashboardServer({host:"0.0.0.0"}),/LOCALHOST_ONLY/);
  const app=createDashboardServer({port:0});const url=await app.listen();
  try{
    // fetch/undici may normalize the Host header; exercise raw HTTP explicitly.
    const http=require("node:http");
    const status=await new Promise((resolve,reject)=>{
      const req=http.request(url,{headers:{Host:"malicious.invalid"}},res=>{
        res.resume();res.on("end",()=>resolve(res.statusCode));
      });req.on("error",reject);req.end();
    });
    assert.equal(status,403);
  }finally{await app.close();}
});
test("dashboard mutations require secret + correct origin + JSON",async()=>{
  const app=createDashboardServer({port:0});const url=await app.listen();
  try{
    const {token}=await (await fetch(url+"api/bootstrap")).json();
    const body=JSON.stringify({command:"enqueue",step:{action:"set_cloud",available:false}});
    async function post(headers){return fetch(url+"api/command",{method:"POST",headers,body});}
    assert.equal((await post({"content-type":"application/json"})).status,403);
    assert.equal((await post({"content-type":"application/json","x-pef-session":token,"origin":"https://outside.example"})).status,403);
    assert.equal((await post({"content-type":"text/plain","x-pef-session":token})).status,400);
    const ok=await post({"content-type":"application/json","x-pef-session":token});
    assert.equal(ok.status,200);
    assert.equal((await ok.json()).session.state.cloud,"CLOUD_DISCONNECTED");
  }finally{await app.close();}
});
test("dashboard loads existing scenario, steps, runs, rewinds and rejects unsafe commands",async()=>{
  const app=createDashboardServer({port:0});const url=await app.listen();
  try{
    const bootstrap=await (await fetch(url+"api/bootstrap")).json();
    async function send(body){
      const res=await fetch(url+"api/command",{method:"POST",headers:{"content-type":"application/json","x-pef-session":bootstrap.token},body:JSON.stringify(body)});
      return {status:res.status,body:await res.json()};
    }
    assert.equal((await send({command:"load",scenario:"wan-offline"})).status,200);
    assert.equal((await send({command:"next"})).body.session.cursor,1);
    const completed=await send({command:"run"});
    assert.equal(completed.body.session.cursor,completed.body.session.totalSteps);
    assert.equal(completed.body.session.halted,false);
    assert.equal((await send({command:"rewind",cursor:2})).body.session.cursor,2);
    assert.equal((await send({command:"enqueue",step:{action:"set_cloud",available:false}})).body.session.state.cloud,"CLOUD_DISCONNECTED");
    assert.equal((await send({command:"load",scenario:"../AGENTS"})).status,400);
    assert.equal((await send({command:"enqueue",step:{action:"shell",cmd:"ls"}})).status,400);
  }finally{await app.close();}
});
