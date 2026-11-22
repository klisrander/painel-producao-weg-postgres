import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
// Run against a trusted checkout of the original private repository, outside
// this public checkout. Resulting files are private deployment configuration.
const args=process.argv.slice(2),get=k=>{const i=args.indexOf('--'+k);if(i<0||!args[i+1])throw Error('Required --'+k);return args[i+1]},source=resolve(get('source')),out=resolve(get('out'));
const root=resolve(new URL('..',import.meta.url).pathname);if(out===root||out.startsWith(root+'/'))throw Error('Choose a private destination outside the public repository');
await mkdir(out,{recursive:true,mode:0o700});
for(const name of ['equipment-catalog','assembly-catalog']){const data=JSON.parse(await readFile(join(source,'lib',name+'.json'),'utf8'));await writeFile(join(out,name+'.json'),JSON.stringify(data),{mode:0o600})}
const {BASE_METAS}=await import(pathToFileURL(join(source,'lib','production-policy.mjs')).href);await writeFile(join(out,'baseline-goals.json'),JSON.stringify(BASE_METAS),{mode:0o600});
console.log('Private catalogs and baseline goals exported outside the repository.');
