"use strict";
// OpenSSL is a lab prerequisite; never opens a listener or provisions a system CA.
const fs=require("node:fs"),path=require("node:path");
const {execFileSync}=require("node:child_process");
const {X509Certificate}=require("node:crypto");
const {checkCertificateWindow,certificateScope}=require("../core/m73-tls-identity.js");
const LABEL=/^[a-zA-Z0-9_-]{1,64}$/;
function generateM73LabPki(root,{siteId="m73-site",deviceId="m73-property"}={}){
 if(!LABEL.test(siteId)||!LABEL.test(deviceId))throw Error("M73_SCOPE_INVALID");
 const run=(...args)=>execFileSync("openssl",args,{cwd:root,stdio:["ignore","pipe","pipe"],timeout:12000});
 const file=name=>path.join(root,name);
 const caCert=file("ca.crt"),caKey=file("ca.key");
 run("req","-x509","-newkey","ed25519","-nodes","-keyout",caKey,
   "-out",caCert,"-days","2","-subj","/CN=PEF M73 lab CA");
 function issue(label,san,usage){
   const key=file(label+".key"),csr=file(label+".csr"),crt=file(label+".crt");
   run("req","-newkey","ed25519","-nodes","-keyout",key,"-out",csr,
     "-subj","/CN=pef-"+label);
   const ext=file(label+".ext");
   fs.writeFileSync(ext,["basicConstraints=critical,CA:FALSE",
     "keyUsage=critical,digitalSignature","extendedKeyUsage="+usage,
     "subjectAltName="+san].join("\n")+"\n",{mode:0o600});
   run("x509","-req","-in",csr,"-CA",caCert,"-CAkey",caKey,"-CAcreateserial",
     "-out",crt,"-days","2","-extfile",ext);
   fs.chmodSync(key,0o600);
   return {key:fs.readFileSync(key),cert:fs.readFileSync(crt)};
 }
 const server=issue("server","IP:127.0.0.1,DNS:localhost","serverAuth");
 const admin=issue("admin","URI:spiffe://pef/admin","clientAuth");
 const device=issue("device","URI:spiffe://pef/device/"+siteId+"/"+deviceId,"clientAuth");
 const host=issue("host","URI:spiffe://pef/device/"+siteId+"/m73-host","clientAuth");
 const rotated=issue("rotated","URI:spiffe://pef/device/"+siteId+"/"+deviceId,"clientAuth");
 const foreign=issue("foreign","URI:spiffe://pef/device/"+siteId+"/other","clientAuth");
 const ca=fs.readFileSync(caCert);
 const cert=new X509Certificate(device.cert);
 if(certificateScope(cert)!=="device/"+siteId+"/"+deviceId||
   !checkCertificateWindow(cert)||checkCertificateWindow(cert,new Date(Date.now()+5*86400000)))
   throw Error("M73_CERT_LIFETIME_OR_SCOPE_INVALID");
 return {ca,server,admin,device,host,rotated,foreign,expires:cert.validTo,
   labOnly:true,systemTrustStoreChanged:false};
}
module.exports={generateM73LabPki};
