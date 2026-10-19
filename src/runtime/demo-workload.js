"use strict";
function demoManifest(){return {
  manifest_version:1,workload_id:"pef-receiver",compatibility:"pef-core-v0.1",
  connectivity_mode:"LOCAL_ONLY_CAPABLE",priority:"optional",
  resources:{cpu_request_millicores:80,cpu_limit_millicores:150,
    memory_request_mib:24,memory_limit_mib:64,storage_request_mib:4,
    storage_limit_mib:16,storage_class:"P2"},
  network_intents:[],
  health:{liveness:"ipc-heartbeat",readiness:"ipc-ready",
    restart_policy:{strategy:"bounded",max_attempts:2,window_seconds:60,backoff_seconds:1}}
};}
function propertyManifest(){return {
  manifest_version:1,workload_id:"pef-property",compatibility:"pef-core-v0.1",
  connectivity_mode:"LOCAL_ONLY_CAPABLE",priority:"optional",
  resources:{cpu_request_millicores:80,cpu_limit_millicores:150,
    memory_request_mib:24,memory_limit_mib:64,storage_request_mib:4,
    storage_limit_mib:16,storage_class:"P2"},
  network_intents:[],
  health:{liveness:"ipc-heartbeat",readiness:"ipc-ready",
    restart_policy:{strategy:"bounded",max_attempts:2,window_seconds:60,backoff_seconds:1}}
};}
module.exports={demoManifest,propertyManifest};
