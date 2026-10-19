"use strict";
// M5.4: deterministic OS-service unit composition. Rendering never activates a service.
const path=require("node:path");
const SAFE_ABS=/^\/[a-zA-Z0-9_.\/-]+$/;
const SAFE_USER=/^[a-z_][a-z0-9_-]{0,31}$/;
function renderLabServiceUnit({nodePath,releaseDir,configFile,envFile,dataDir,user,group}={}){
  const values=[nodePath,releaseDir,configFile,envFile,dataDir];
  if(values.some(v=>typeof v!=="string"||!path.posix.isAbsolute(v)||
    !SAFE_ABS.test(v)||v.split("/").includes(".."))||
    !SAFE_USER.test(user||"")||!SAFE_USER.test(group||""))
    throw Error("M54_UNSAFE_SERVICE_PARAMETERS");
  return ["# M5.4 lab-only service: no physical device, no real reboot proof",
    "[Unit]","Description=PEF Edge service (Linux lab only)",
    "After=local-fs.target","StartLimitIntervalSec=120","StartLimitBurst=4",
    "","[Service]","Type=exec","User="+user,"Group="+group,
    "WorkingDirectory="+releaseDir,"EnvironmentFile="+envFile,
    "ExecStart="+nodePath+" "+releaseDir+"/bin/pef-edge.js --config "+configFile,
    "Restart=on-failure","RestartSec=1","TimeoutStopSec=15",
    "KillMode=control-group","UMask=0077","NoNewPrivileges=true",
    "ProtectSystem=strict","ProtectHome=false","PrivateTmp=false",
    "ReadWritePaths="+dataDir,"CapabilityBoundingSet=",
    "RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6",
    "","[Install]","WantedBy=multi-user.target",""].join("\n");
}
function checkLabServiceUnit(unit){
 if(typeof unit!=="string"||!unit.includes("Type=exec")||
   !unit.includes("Restart=on-failure")||!unit.includes("NoNewPrivileges=true")||
   !unit.includes("ProtectSystem=strict")||
   !unit.includes("WantedBy=multi-user.target")||
   unit.includes("network-online.target"))
   throw Error("M54_SERVICE_CONTRACT_INVALID");
 return {kind:"PEF_M54_SYSTEMD_CONTRACT_V1",status:"LAB_PASS",ok:true,
   unitLines:unit.split("\n").length,
   activation:"NOT_RUN",vmRebootValidated:false,deviceValidated:false,
   kernelIsolationPropertyHostValidated:false};
}
function runM54ServiceContract(){
 const unit=renderLabServiceUnit({nodePath:"/usr/bin/node",
   releaseDir:"/var/lib/pef-lab/releases/v1",configFile:"/etc/pef-lab/edge.json",
   envFile:"/etc/pef-lab/edge.env",dataDir:"/var/lib/pef-lab/data",
   user:"pef_edge",group:"pef_edge"});
 return {...checkLabServiceUnit(unit),unit,serviceManager:"systemd",
   note:"STATIC_CONTRACT_ONLY_EXPLICIT_CI_OR_LIMA_ACTIVATION_REQUIRED"};
}
module.exports={renderLabServiceUnit,checkLabServiceUnit,runM54ServiceContract};
