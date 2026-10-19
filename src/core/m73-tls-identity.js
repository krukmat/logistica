"use strict";
// URI SAN scope is authorization, not proof of hardware-backed device identity.
const {X509Certificate}=require("node:crypto");
const PATTERN=/^URI:spiffe:\/\/pef\/(admin|device\/[a-zA-Z0-9_-]{1,64}\/[a-zA-Z0-9_-]{1,64})$/;
function certificateScope(cert){
 if(!(cert instanceof X509Certificate))throw Error("M73_CERTIFICATE_REQUIRED");
 const san=cert.subjectAltName;
 if(typeof san!=="string"||!PATTERN.test(san))
   throw Error("M73_UNTRUSTED_CERT_SCOPE");
 return san.slice("URI:spiffe://pef/".length);
}
function checkCertificateWindow(cert,time=new Date()){
 if(!(cert instanceof X509Certificate)||!(time instanceof Date)||!Number.isFinite(time.getTime()))
   return false;
 const start=Date.parse(cert.validFrom),end=Date.parse(cert.validTo);
 return Number.isFinite(start)&&Number.isFinite(end)&&time.getTime()>=start&&time.getTime()<end;
}
module.exports={certificateScope,checkCertificateWindow};
