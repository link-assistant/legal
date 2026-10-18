"""Recover file edits from our archived execution trace, without replaying shell actions."""
import json,re,subprocess,pathlib,sys
commands=json.load(open('ci-logs/recovered-commands.json'))
selected=[10,11,18,23,30,33,34,36,40,41,42,43,50,53,55,56,65,66,67,72,79,80,84,88,91,97,103,105,107,108,116,117,118,126]
for index in [i for i in selected if i>=103]:
 command=commands[index]
 actions=[]
 pattern=r"cat\s+(>>?)\s+(\S+)\s+<<'([A-Z]+)'\n(.*?)\n\3(?:\n|$)|python3 - <<'PY'\n(.*?)\nPY(?:\n|$)"
 for m in re.finditer(pattern,command,re.S):
  if m.group(5) is not None:
   code=m.group(5)
   # Read-only diagnostics do not need unavailable historical fixtures.
   if index==118: continue
   if index==116:
    code=code.replace("Path('experiments',name).unlink()","Path('experiments',name).unlink(missing_ok=True)")
   actions.append(('python',code))
  else:
   mode,path,_,content=m.group(1,2,3,4)
   actions.append(('write',(mode,path,content)))
 if index==103:
  p=pathlib.Path('tests/browser/legal-demo.spec.js')
  if p.exists(): p.rename('tests/browser/legal-demo.pw.js')
 for kind,data in actions:
  if kind=='write':
   mode,path,content=data
   if path.startswith('/tmp/'): continue
   p=pathlib.Path(path);p.parent.mkdir(parents=True,exist_ok=True)
   with p.open('a' if mode=='>>' else 'w') as f:f.write(content+'\n')
  else:
   result=subprocess.run([sys.executable,'-c',data],capture_output=True,text=True)
   if result.returncode: print(index,result.stderr);sys.exit(1)
 if index==34:
  raw=pathlib.Path('/tmp/formal-relative.mjs').read_text()
  match=re.search(r"cat >> /tmp/formal-relative-patched.mjs <<'EOF'\n(.*?)\nEOF",command,re.S)
  import difflib
  pathlib.Path('patches/formal-ai/legal-context.patch').write_text(''.join(difflib.unified_diff(raw.splitlines(True),(raw+match.group(1)+'\n').splitlines(True),fromfile='a/relative_meta_logic.mjs',tofile='b/relative_meta_logic.mjs')))
 for name in ['configure-legal-package','prepare-api','refactor-ingestion']:
  if name != 'prepare-api' and f'node experiments/{name}.mjs' in command:
   subprocess.run(['node',f'experiments/{name}.mjs'],check=True)
 # Original refactors were applied to Prettier's formatted source.
 if index in [50,56,79,80,84,88,91,97,103,108]:
  subprocess.run(['npx','prettier','--write','src/legal','bin','scripts/bootstrap-formal-ai.mjs','tests/legal-*.test.js','experiments/*.mjs','package.json'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
 print('Recovered edit group',index,flush=True)
