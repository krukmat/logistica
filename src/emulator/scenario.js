"use strict";
const {openBackend}=require("./backends.js");
function getPath(value,path){return String(path).split(".").reduce((v,k)=>v==null?undefined:v[k],value);}
function equal(a,b){return JSON.stringify(a)===JSON.stringify(b);}
function runScenario(spec){
  if(!spec||typeof spec.scenario_id!=="string"||!Array.isArray(spec.steps))throw Error("INVALID_SCENARIO");
  const selected=openBackend(spec.backend||"sim",spec.config||{});
  if(!selected.ok)return {kind:"PEF_LOGICAL_EMULATION",schema_version:1,scenario_id:spec.scenario_id,
    backend:selected.kind,status:selected.error==="BACKEND_NOT_IMPLEMENTED"?"SIM_BLOCKED":"SIM_FAIL",
    hardware_validated:false,physical_network_validated:false,physical_storage_validated:false,
    steps:[],issues:[{error:selected.error}],trace:[],final_state:null};
  const simulator=selected.engine;
  const steps=[],issues=[];
  const allowed=new Set(["tick","set_wan","set_cloud","set_remote_trust","append","prepare_append","sync","admit","write_workload","crash_workload","apply_config","power_cut","status","assert"]);
  for(let i=0;i<spec.steps.length;i++){
    const step=spec.steps[i],action=step.action;
    if(!allowed.has(action)){issues.push({index:i,error:"UNKNOWN_ACTION",action});break;}
    try{
      if(action==="assert"){
        const actual=getPath(simulator.status(),step.path);
        const ok=equal(actual,step.equals);
        steps.push({index:i,action,ok,path:step.path,expected:step.equals,observed:actual===undefined?null:actual});
        if(!ok){issues.push({index:i,path:step.path,expected:step.equals,observed:actual===undefined?null:actual});break;}
      }else{
        const args={...step};delete args.action;delete args.expect;
        const response=simulator.act(action,args);
        const explicit=step.expect||null;
        const mismatch=explicit&&Object.keys(explicit).some(key=>!equal(getPath(response,key),explicit[key]));
        const ok=!mismatch&&(explicit!==null||response.ok!==false);
        steps.push({index:i,action,ok,response});
        if(!ok){issues.push({index:i,action,expected:explicit,observed:response});break;}
      }
    }catch(e){issues.push({index:i,action,error:String(e.message||e)});steps.push({index:i,action,ok:false});break;}
  }
  return {kind:"PEF_LOGICAL_EMULATION",schema_version:1,scenario_id:spec.scenario_id,
    profile:spec.config?.profile||"BASE",backend:selected.kind,status:issues.length?"SIM_FAIL":"SIM_PASS",
    hardware_validated:false,physical_network_validated:false,physical_storage_validated:false,
    steps,issues,final_state:simulator.status(),trace:simulator.trace(),
    limitations:["No real WAN/NIC/dataplane traffic","No physical fsync or actual power-cut guarantee",
      "No CPU/thermal/watt measurements","Logical time is not measured recovery latency"]};
}
module.exports={runScenario};
