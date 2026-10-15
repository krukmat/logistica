"use strict";
// C1 pre-device boot rehearsal only. An unkeyed OS journal is NOT a trusted production boot authority.
const {validateIdentity}=require("../core/event-envelope.js");
const EVENT_ID="pef.lab.boot-route-intent.v1";
const ROUTES=[null,"primary","backup"];
function ensure(journal){
 if(!journal||typeof journal.append!=="function"||typeof journal.retained!=="function")
   throw Error("C1_JOURNAL_REQUIRED");
}
function readLabBootIntent({journal,identity}={}){
 ensure(journal);
 const scope=validateIdentity(identity);
 const records=journal.retained().filter(e=>e.eventId===EVENT_ID);
 if(records.length!==1)throw Error("C1_BOOT_INTENT_MISSING_OR_AMBIGUOUS");
 const e=records[0],p=e.payload;
 if(e.category!=="O0"||p?.schemaVersion!==1||p?.kind!=="PEF_LAB_BOOT_ROUTE_INTENT"||
   p?.siteId!==scope.siteId||p?.deviceId!==scope.deviceId||
   p?.configRevision!==scope.configRevision||!ROUTES.includes(p.expectedRoute))
   throw Error("C1_BOOT_INTENT_SCOPE_OR_SCHEMA_MISMATCH");
 return {expectedRoute:p.expectedRoute,source:"UNSIGNED_LAB_FSYNC_JOURNAL",trustedForDevice:false};
}
function writeLabBootIntent({journal,identity,expectedRoute=null}={}){
 ensure(journal);
 const scope=validateIdentity(identity);
 if(!ROUTES.includes(expectedRoute))throw Error("C1_INVALID_BOOT_ROUTE");
 if(journal.retained().some(e=>e.eventId===EVENT_ID))
   throw Error("C1_BOOT_INTENT_ALREADY_PRESENT");
 const payload={schemaVersion:1,kind:"PEF_LAB_BOOT_ROUTE_INTENT",
   siteId:scope.siteId,deviceId:scope.deviceId,
   configRevision:scope.configRevision,expectedRoute};
 const r=journal.append({eventId:EVENT_ID,payload,category:"O0"});
 if(!(r.ack===true&&r.fsyncCompleted===true))
   throw Error("C1_BOOT_INTENT_NOT_DURABLE");
 return readLabBootIntent({journal,identity:scope});
}
module.exports={readLabBootIntent,writeLabBootIntent,EVENT_ID};
