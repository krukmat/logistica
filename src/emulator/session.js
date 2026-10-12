"use strict";
const {createSimulator}=require("./core.js");
const {statechart,changes}=require("./statechart.js");
const ACTIONS=new Set(["tick","set_wan","set_cloud","set_remote_trust","append",
  "prepare_append","sync","admit","write_workload","crash_workload","apply_config",
  "power_cut","status","assert"]);
const clone=x=>JSON.parse(JSON.stringify(x));
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const get=(object,key)=>String(key).split(".").reduce((v,k)=>v===undefined||v===null?undefined:v[k],object);
const MAX_STEPS=500;
function validateStep(step){
  if(!step||typeof step!=="object"||Array.isArray(step)||!ACTIONS.has(step.action))
    throw Error("UNSUPPORTED_SIM_ACTION");
  if(step.action==="assert"&&(typeof step.path!=="string"||!Object.prototype.hasOwnProperty.call(step,"equals")))
    throw Error("INVALID_ASSERTION");
  return clone(step);
}
function createSession({scenario_id="INTERACTIVE",config={},steps=[],backend="sim"}={}){
  let id,settings,plan,position,engine,timeline,halted;
  function load(spec){
    if(!spec||typeof spec.scenario_id!=="string"||!spec.scenario_id||!Array.isArray(spec.steps)||
       (spec.backend&&spec.backend!=="sim")||spec.steps.length>MAX_STEPS)throw Error("INVALID_SIM_SCENARIO");
    const newConfig=clone(spec.config||{});
    const newSteps=spec.steps.map(validateStep);
    const newEngine=createSimulator(newConfig);
    id=spec.scenario_id;settings=newConfig;plan=newSteps;position=0;
    engine=newEngine;timeline=[];halted=false;
    return snapshot();
  }
  function execute(step){
    const before=engine.status(),payload=clone(step);
    let response,ok,error=null;
    if(step.action==="assert"){
      const value=get(before,step.path);
      ok=equal(value,step.equals);
      response={ok,assertion:step.path,expected:step.equals,observed:value===undefined?null:value};
      if(!ok)error="ASSERTION_FAILED";
    }else{
      delete payload.action;delete payload.expect;
      try{
        response=engine.act(step.action,payload);
        if(step.expect){
          ok=Object.entries(step.expect).every(([key,value])=>equal(get(response,key),value));
          if(!ok)error="EXPECTATION_MISMATCH";
        }else{
          ok=response.ok!==false;
          if(!ok)error=response.error||"ACTION_REJECTED";
        }
      }catch(e){
        response={ok:false,error:String(e.message||e)};
        ok=false;error=response.error;
      }
    }
    const after=engine.status();
    return {index:position,action:step.action,step:clone(step),ok,
      error,response:clone(response),before:clone(before),after:clone(after),
      transitions:changes(before,after)};
  }
  function next(){
    if(halted)return {ok:false,error:"HALTED_REWIND_OR_RESET"};
    if(position>=plan.length)return {ok:false,error:"END_OF_SCENARIO"};
    const entry=execute(plan[position]);timeline.push(entry);position++;
    if(!entry.ok)halted=true;
    return clone(entry);
  }
  function run(){
    let count=0;
    while(position<plan.length&&!halted){next();count++;}
    return {executed:count,position,halted,complete:position===plan.length,
      ok:!halted,output:snapshot()};
  }
  function rewind(index){
    if(!Number.isSafeInteger(index)||index<0||index>position)throw Error("INVALID_CURSOR");
    const original=plan.slice(),savedId=id,savedSettings=clone(settings);
    load({scenario_id:savedId,config:savedSettings,steps:original});
    for(let i=0;i<index;i++){const entry=next();if(!entry.ok&&i+1<index)throw Error("REPLAY_MISMATCH");}
    return snapshot();
  }
  function enqueue(step){
    const validated=validateStep(step);
    if(plan.length>=MAX_STEPS&&position===plan.length)throw Error("SCENARIO_LIMIT");
    plan=plan.slice(0,position);
    plan.push(validated);
    halted=false;
    return snapshot();
  }
  function reset(){return load({scenario_id:id,config:settings,steps:plan});}
  function snapshot(){
    return clone({scenario_id:id,backend:"sim",cursor:position,totalSteps:plan.length,
      halted,complete:position===plan.length,steps:plan,history:timeline,
      state:engine.status(),chart:statechart(engine.status()),trace:engine.trace(),
      physicalValidated:false});
  }
  load({scenario_id,config,steps,backend});
  return {load,enqueue,next,run,rewind,reset,snapshot};
}
module.exports={createSession,ACTIONS,validateStep};
