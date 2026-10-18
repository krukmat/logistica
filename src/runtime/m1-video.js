"use strict";
// Optional Playwright visualization of the SAME report + trace. No rerun or forged test.
const fs=require("node:fs"),path=require("node:path"),{createHash}=require("node:crypto");
const {verifyBundle}=require("./m1-evidence-bundle.js");
function sha(data){return createHash("sha256").update(data).digest("hex");}
function verifyVideo(dir){
 const base=verifyBundle(dir),file=path.join(dir,"m1-demo.webm");
 const manifest=JSON.parse(fs.readFileSync(path.join(dir,"video-manifest.json"),"utf8"));
 const video=fs.readFileSync(file);
 if(manifest.kind!=="PEF_M1_VIDEO_MANIFEST_V1"||manifest.runId!==base.runId||
  manifest.commit!==base.commit||manifest.file!=="m1-demo.webm"||
  manifest.sha256!==sha(video)||manifest.bytes!==video.length||
  video.length<16384||!video.subarray(0,4).equals(Buffer.from([0x1a,0x45,0xdf,0xa3]))||
  manifest.source!=="SAME_RUN_EVIDENCE_HTML_PLAYWRIGHT"||
  JSON.stringify(manifest.framesFromStages)!==JSON.stringify(
    fs.readFileSync(path.join(dir,"trace.ndjson"),"utf8").trim().split("\n").map(x=>JSON.parse(x).id))||
  manifest.physicalValidated!==false||manifest.realCloudValidated!==false)
   throw Error("M1_VIDEO_INTEGRITY_OR_SCOPE_FAILED");
 return {kind:"PEF_M1_VIDEO_VERIFIED_V1",ok:true,runId:base.runId,
  commit:base.commit,bytes:video.length,sha256:manifest.sha256,physicalValidated:false};
}
async function recordVideo(dir){
 const base=verifyBundle(dir),report=JSON.parse(fs.readFileSync(path.join(dir,"report.json"),"utf8"));
 const trace=fs.readFileSync(path.join(dir,"trace.ndjson"),"utf8").trim().split("\n").map(x=>JSON.parse(x));
 // Playwright is a pinned, OPTIONAL dev-only dependency: core CI never installs a browser.
 let playwright;
 try{playwright=require("playwright");}
 catch{throw Error("M1_VIDEO_NEEDS_PLAYWRIGHT: npm install && npx playwright install chromium");}
 const browser=await playwright.chromium.launch({headless:true});
 let ctx=null;
 try{
  ctx=await browser.newContext({viewport:{width:1280,height:900},
   recordVideo:{dir,size:{width:1280,height:900}},deviceScaleFactor:1});
  const page=await ctx.newPage();
  const video=page.video();
  await page.goto("file://"+path.join(dir,"m1-evidence.html"),{waitUntil:"load"});
  if(await page.locator("main").getAttribute("data-run-id")!==base.runId)
    throw Error("M1_VIDEO_RUN_ID_MISMATCH");
  if(await page.locator(".step").count()!==trace.length)
    throw Error("M1_VIDEO_STAGE_COUNT_MISMATCH");
  await page.evaluate(()=>document.querySelectorAll(".step").forEach(x=>x.classList.add("hidden-step")));
  await page.waitForTimeout(3200);
  for(let i=0;i<trace.length;i++){
   // Only reveal real source stages; never animate success derived from a separate run.
   await page.evaluate(index=>{
    document.querySelectorAll(".step").forEach((x,j)=>{
     x.classList.toggle("hidden-step",j>index);
     x.classList.toggle("active",j===index);
    });
   },i);
   await page.waitForTimeout(7000);
  }
  await page.evaluate(()=>document.querySelectorAll(".step").forEach(x=>x.classList.remove("active")));
  await page.waitForTimeout(3200);
  await ctx.close();ctx=null;
  await video.saveAs(path.join(dir,"m1-demo.webm"));
 }finally{if(ctx)await ctx.close().catch(()=>{});await browser.close();}
 const output=path.join(dir,"m1-demo.webm"),bytes=fs.readFileSync(output);
 const manifest={kind:"PEF_M1_VIDEO_MANIFEST_V1",schemaVersion:1,
  runId:base.runId,commit:base.commit,file:"m1-demo.webm",bytes:bytes.length,
  sha256:sha(bytes),source:"SAME_RUN_EVIDENCE_HTML_PLAYWRIGHT",
  framesFromStages:trace.map(e=>e.id),physicalValidated:false,realCloudValidated:false,
  note:"Animated read-only evidence replay, NOT real footage of physical WAN or Cloud"};
 fs.writeFileSync(path.join(dir,"video-manifest.json"),JSON.stringify(manifest,null,2)+"\n",
  {mode:0o600});
 return verifyVideo(dir);
}
module.exports={recordVideo,verifyVideo};
