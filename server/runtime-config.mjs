import {readFileSync} from 'node:fs';
export function readRuntimeJson(name,fallback){if(!process.env[name])return fallback;return JSON.parse(readFileSync(process.env[name],'utf8'))}
export function validateCatalog(value){if(!Array.isArray(value)||value.length>10000||value.some(x=>!x||typeof x.id!=='string'||typeof x.linha!=='string'||typeof x.descricao!=='string')||new Set(value.map(x=>x.id)).size!==value.length)throw Error('Invalid equipment catalog');return value}
