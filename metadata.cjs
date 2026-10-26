const fs=require('fs'),assert=require('node:assert/strict'),PE=require('pe-library'),R=require('resedit');
const input=fs.readFileSync(process.argv[2]),exe=PE.NtExecutable.from(input),res=PE.NtExecutableResource.from(exe);
const vs=R.Resource.VersionInfo.fromEntries(res.entries);assert.ok(vs.length);
for(const v of vs){
 for(const l of v.getAvailableLanguages())v.setStringValues(l,{CompanyName:'Agent-QW1427',FileDescription:'P-Scan Defect 繁體中文版',ProductName:'P-Scan Defect 繁體中文版',InternalName:'P-Scan-Defect',OriginalFilename:'P-Scan-Defect.exe'});
 v.setFileVersion(1,5,1,0,1033);v.setProductVersion(1,5,1,0,1033);v.outputToResourceEntries(res.entries);
}
res.outputResource(exe);const output=Buffer.from(exe.generate());fs.writeFileSync(process.argv[3],output);
const reread=PE.NtExecutable.from(output),vr=R.Resource.VersionInfo.fromEntries(PE.NtExecutableResource.from(reread).entries);
for(const v of vr)for(const l of v.getAvailableLanguages())assert.equal(v.getStringValues(l).CompanyName,'Agent-QW1427');
const old=PE.NtExecutable.from(input);
let unchanged=[];for(const s of old.getAllSections()){if(s.info.name==='.rsrc')continue;const n=reread.getAllSections().find(t=>t.info.name===s.info.name);assert.ok(n);assert.deepEqual(Buffer.from(n.data||[]),Buffer.from(s.data||[]));unchanged.push(s.info.name);}
const report={companyName:'Agent-QW1427',fileVersion:'1.5.1.0',signed:false,unchangedSections:unchanged,versionInfo:vr.map(v=>v.getAvailableLanguages().map(l=>v.getStringValues(l)))};
fs.writeFileSync(process.argv[4],JSON.stringify(report,null,2));console.log(report);
