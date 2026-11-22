import exampleBob from '../config/equipment-catalog.example.json' with {type:'json'};
import {readRuntimeJson,validateCatalog} from '../server/runtime-config.mjs';
const bobCatalog=validateCatalog(readRuntimeJson('EQUIPMENT_CATALOG_FILE',exampleBob));
for(const equipment of bobCatalog)if(equipment.ct)CTS[equipment.linha]=equipment.ct;
import exampleAssembly from '../config/assembly-catalog.example.json' with {type:'json'};
const assemblyCatalog=validateCatalog(readRuntimeJson('ASSEMBLY_CATALOG_FILE',exampleAssembly));
import {BASE_METAS,CTS} from './production-policy.mjs';
export const SECTIONS=[{id:'bobinagem',label:'Bobinagem'},{id:'montagem',label:'Montagem'},{id:'montagem-ib',label:'Montagem IB'}];
const ibCatalog=assemblyCatalog.filter(x=>['Mini Motor','WT'].includes(x.linha)).map(x=>({...x,linha:x.linha==='WT'?'WT-25':x.linha}));
const iaCatalog=assemblyCatalog.filter(x=>!['Mini Motor','WT'].includes(x.linha));
const assemblyLines=[...new Set(iaCatalog.map(x=>x.linha))];
function emptyGoals(parts){
 return Object.fromEntries(['1','2','3'].map(turno=>{
  const goals={};for(const [line,stages] of Object.entries(parts))for(const stage of stages){goals[stage]??={};goals[stage][line]=null}
  return [turno,goals];
 }));
}
const assemblyParts=Object.fromEntries(assemblyLines.map(line=>[line,['Montagem']]));
const ibParts={'Mini Motor':['Bobinagem','Montagem'],'WT-25':['Estator bobinado','Rotor']};
const assemblyMetas=emptyGoals(assemblyParts),ibMetas=emptyGoals(ibParts);
export function sectionConfig(section){
 let config;
 if(section==='bobinagem')config={section,label:'Bobinagem',lines:Object.keys(CTS),stages:['Bobinagem','Inserção'],metas:BASE_METAS,cts:CTS,catalog:bobCatalog,publicPath:'/acompanhamento/bobinagem',partsByLine:Object.fromEntries(Object.keys(CTS).map(line=>[line,['Bobinagem','Inserção'].filter(stage=>line in BASE_METAS['1'][stage])]))};
 else if(section==='montagem')config={section,label:'Montagem',lines:assemblyLines,stages:['Montagem'],metas:assemblyMetas,cts:{},catalog:iaCatalog,partsByLine:assemblyParts,publicPath:'/acompanhamento/montagem'};
 else if(section==='montagem-ib')config={section,label:'Montagem IB',lines:Object.keys(ibParts),stages:['Bobinagem','Montagem','Estator bobinado','Rotor'],metas:ibMetas,cts:{},catalog:ibCatalog,partsByLine:ibParts,publicPath:'/acompanhamento/montagem-ib',partsRequiredForStops:true};
 else throw Error('Seção inválida.');
 config.stageLabels=Object.fromEntries(config.stages.map(stage=>[stage,section==='montagem-ib'?(Object.keys(ibParts).find(line=>ibParts[line].includes(stage))+' · '+stage):stage]));
 return config;
}
export function sectionView(config){const {section,label,lines,stages,cts,partsByLine,stageLabels,publicPath,partsRequiredForStops}=config;return {section,label,lines,stages,cts,partsByLine,stageLabels,publicPath,partsRequiredForStops:!!partsRequiredForStops}}
export function generalAdmin(u){return u?.role==='admin'&&Number(u.general_admin)===1}
export function sectionFor(u,req){
 const url=new URL(req.url),header=req.headers.get('X-WEG-Section'),query=url.searchParams.get('section');
 for(const value of [header,query])if(value&&(!SECTIONS.some(s=>s.id===value)||(!generalAdmin(u)&&value!==u.section)))throw Error('Acesso negado à seção.');
 if(header&&query&&header!==query)throw Error('Seção divergente na solicitação.');
 return header||query||u.section;
}
