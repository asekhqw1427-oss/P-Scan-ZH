#!/usr/bin/env python3
"""Build Traditional Chinese portable package from v1.5 runtime and metadata-edited EXE."""
from pathlib import Path
import sys,zipfile,hashlib,json
here=Path(__file__).resolve().parent
base,exe,out=map(Path,sys.argv[1:4]);out.mkdir(parents=True,exist_ok=True)
root='P-Scan-Defect-1.5.1-zh-TW';sha=lambda b:hashlib.sha256(b).hexdigest()
runtime={}
with zipfile.ZipFile(base) as z:
 for n in z.namelist():
  rel=n.split('/',1)[1] if '/' in n else ''
  if rel and not n.endswith('/') and ('/' not in rel and (rel.endswith(('.exe','.dll','.bin','.pak')) or rel in ['LICENSE','LICENSES.chromium.html','version','icudtl.dat','vk_swiftshader_icd.json']) or rel.startswith('locales/') and rel.endswith('.pak')):runtime[rel]=z.read(n)
assert len(runtime)==72,len(runtime)
assert runtime['version'].decode().strip()=='45.0.0'
original=runtime['P-Scan-Defect.exe'];runtime['P-Scan-Defect.exe']=exe.read_bytes()
source={str(p.relative_to(here)):p.read_bytes() for p in sorted(here.rglob('*')) if p.is_file() and 'node_modules' not in p.parts and '__pycache__' not in p.parts and p.suffix!='.zip'}
files=dict(runtime)
files.update({'developer/'+n:b for n,b in source.items()})
files.update({'resources/'+n:b for n,b in source.items() if n.startswith('app/')})
files['README.md']=source['README.md']
for n in ['使用說明-繁體中文.md','驗證報告.md']:files[n]=source['docs/'+n]
files['READ-FIRST.txt']=('P-Scan Defect 1.5.1 繁體中文版\r\n發行者：Agent-QW1427\r\n\r\n請先從系統匣結束舊版，將整個 ZIP 解壓縮到新資料夾，再開啟 P-Scan-Defect.exe。\r\n請閱讀 README.md 與使用說明-繁體中文.md。\r\n此程式未簽署，SmartScreen 仍可能顯示 Unknown publisher。\r\n').encode('utf-8-sig')
manifest={'version':'1.5.1','locale':'zh-TW','publisherMetadata':'Agent-QW1427','signed':False,'windowsTested':False,'runtimeVersion':'45.0.0','unchangedRuntimeFiles':71,'exeChange':'version resource only; non-resource sections verified unchanged','baseSha256':sha(base.read_bytes()),'originalExeSha256':sha(original),'files':{n:sha(b) for n,b in sorted(files.items())}}
files['PACKAGE-SHA256.json']=json.dumps(manifest,ensure_ascii=False,indent=2).encode()
outputs=[]
for filename,prefix,items in [(root+'-Windows-x64.zip',root,files),(root+'-Source.zip',root+'-Source',source)]:
 p=out/filename
 with zipfile.ZipFile(p,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=6) as z:
  for n,b in sorted(items.items()):z.writestr(prefix+'/'+n,b)
 with zipfile.ZipFile(p) as z:
  assert z.testzip() is None
  for n,b in items.items():assert sha(z.read(prefix+'/'+n))==sha(b)
 outputs.append({'name':filename,'bytes':p.stat().st_size,'sha256':sha(p.read_bytes())})
(out/(root+'-Guide.md')).write_bytes(source['docs/使用說明-繁體中文.md'])
(out/(root+'-SHA256.json')).write_text(json.dumps(outputs,indent=2)+'\n')
print(json.dumps(outputs,indent=2))
