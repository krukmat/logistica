"use strict";
// Host composition root; the domain Core itself never opens files or modifies routes.
// Swap journal/ports here for a device backend, not in the domain or the dashboard.
const {createEdgeRuntime}=require("../core/edge-runtime.js");
const {createFileJournal}=require("../emulator/lab/file-journal.js");
function openEdgeService({dir,journalOptions={},ports, ...options}={}){
  if(!ports||typeof ports.probe!=="function"||typeof ports.applyRoute!=="function")
    throw Error("INVALID_SERVICE_PORTS");
  const journal=createFileJournal({dir,...journalOptions});
  try{
    const runtime=createEdgeRuntime({journal,probe:ports.probe,applyRoute:ports.applyRoute,...options});
    let closed=false;
    return {...runtime,
      journalPath:journal.file,
      close(){if(closed)return;closed=true;try{runtime.close();}finally{journal.close();}}
    };
  }catch(e){journal.close();throw e;}
}
module.exports={openEdgeService};
