"use strict";
// W1.10.F2: 72h retention/pressure model from real bounded F1/E2 inputs.
// NEVER equate extrapolation with 518400-event retention or power-loss certification.
const EVENT_COUNT=72*3600*2,ONE_GIB=1073741824,CURRENT_EDGE_CAP_BYTES=100*1048576;
const ratio=(a,b)=>Math.round(a/b*1000)/1000;
function model({profile="r28s-1g",f1,e2Small,e2Large}={}){
 const checks=[],check=(name,pass)=>checks.push({name,pass:pass===true});
 const validF1=f1?.kind==="PEF_F1_JOURNAL_INDEX_SCALE_V1"&&f1.ok===true&&
  f1.profile===profile&&f1.stages?.length===3&&f1.safety?.physicalValidated===false;
 const valid1=e2Small?.kind==="PEF_E2_OFFLINE_STORAGE_ENVELOPE_V1"&&e2Small.ok===true&&
  e2Small.profile===profile&&e2Small.measured?.payloadKiB===1&&
  e2Small.model?.eventCount===EVENT_COUNT&&e2Small.decisions?.seventyTwoHourOfflineAcceptance===false;
 const valid4=e2Large?.kind==="PEF_E2_OFFLINE_STORAGE_ENVELOPE_V1"&&e2Large.ok===true&&
  e2Large.profile===profile&&e2Large.measured?.payloadKiB===4&&
  e2Large.model?.eventCount===EVENT_COUNT&&e2Large.decisions?.seventyTwoHourOfflineAcceptance===false;
 check("F2_F1_BOUNDED_MEASUREMENTS",validF1);
 check("F2_E2_1K_FSYNCHED_SAMPLE",valid1);
 check("F2_E2_4K_FSYNCHED_SAMPLE",valid4);
 check("F2_F1_REAL_1GB_100K",validF1&&f1.mode==="full"&&f1.guest?.profileEnforced===true&&
   f1.stages.at(-1)?.events===100000&&f1.error===null);
 const asEnvelope=(sample)=>{
  const avg=sample?.measured?.bytesPerEvent;
  if(!Number.isFinite(avg)||avg<=0)return null;
  const minRequiredBytes=Math.ceil(EVENT_COUNT*avg);
  // Disk operational margin is 25% plus minimum OS free space; no estimate of write amplification.
  const journalRequiredBytes=Math.ceil(minRequiredBytes*1.25);
  const fullDeviceReserveBytes=journalRequiredBytes+3*ONE_GIB;
  return {events:EVENT_COUNT,bytesPerRecordSampled:avg,
   estimatedJournalGiB:ratio(minRequiredBytes,ONE_GIB),
   recommendedJournalCapGiB:ratio(journalRequiredBytes,ONE_GIB),
   estimatedWholeDeviceWith3GiBReserveGiB:ratio(fullDeviceReserveBytes,ONE_GIB),
   currentEdgeCapMiB:100,
   currentEdgeCapSufficient:CURRENT_EDGE_CAP_BYTES>=journalRequiredBytes,
   estimatedHoursUntilCurrentEdgeCap:Math.floor(CURRENT_EDGE_CAP_BYTES/(2*avg)/3600*100)/100,
   physicalFlashEnduranceTested:false,projectedNotMeasured:true};
 };
 const projections={payload1KiB:valid1?asEnvelope(e2Small):null,
  payload4KiB:valid4?asEnvelope(e2Large):null};
 const first=f1?.stages?.[0],last=f1?.stages?.at(-1);
 const delta=validF1&&first&&last&&last.events>first.events?
  {fromEvents:first.events,toEvents:last.events,
   sampleProcessRssIncreaseMiB:Math.round((last.nodeRssMiB-first.nodeRssMiB)*100)/100,
   guestMemoryAtLastStageMiB:last.guestMemAvailableMiB,
   method:"sampled process RSS includes GC and OS noise; NOT an index memory-per-event bound"}:null;
 const enoughEvidence=checks.slice(0,3).every(x=>x.pass);
 return {kind:"PEF_F2_72H_RETENTION_POLICY_V1",schemaVersion:1,
  ok:enoughEvidence,status:enoughEvidence?"F2_CAPACITY_MODEL_AVAILABLE_72H_BLOCKED":"F2_INPUT_EVIDENCE_INCOMPLETE",
  profile,checks,projections,memoryTrend:delta,
  decision:{currentEdge100MiBCapBlocks72h:projections.payload1KiB?.currentEdgeCapSufficient===false||
      projections.payload4KiB?.currentEdgeCapSufficient===false,
   proposedPhysical72hAcceptance:false,
   physicalMicroSdDurabilityNotProven:true,missingActual518400Replay:true,
   requiresSeparateJournalIndexRedesignDecision:true,
   changeProductionJournalConfigAuthorized:false,
   noBackendDevice:true,procurementApproved:false},
  note:"Projection based on short bounded fsync sample; 1GiB memory at full target, SD endurance and unclean shutdown require further tests."};
}
module.exports={model};
