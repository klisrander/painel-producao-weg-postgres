export const DEFAULT_COSTS={hourly:0,premium:2,charges:1.7445,dsm:1.2,hours:8.8,food:0,people:0,volume:0,daily_extra:0};
export function validDate(value){return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T12:00:00Z'))&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value}
export function addDate(date,n=1){return new Date(Date.parse(date+'T12:00:00Z')+n*86400000).toISOString().slice(0,10)}
export function integer(value,label,{nullable=false,signed=false}={}){if(nullable&&(value==null||value===''))return null;if(value==null||value===''||!Number.isSafeInteger(Number(value))||Math.abs(Number(value))>1000000000||(!signed&&Number(value)<0))throw Error(label+': informe um número inteiro '+(signed?'válido.':'não negativo.'));return Number(value)}
const text=(v,max=500)=>String(v??'').trim().slice(0,max);
const decimal=(v,label,max=1000000)=>{const n=Number(v);if(v==null||v===''||!Number.isFinite(n)||n<0||n>max)throw Error(label+': informe um valor válido.');return n};
export function normalizeCosts(input={}){const out={};for(const k of Object.keys(DEFAULT_COSTS))out[k]=['people','volume','daily_extra'].includes(k)?integer(input[k]??DEFAULT_COSTS[k],k):decimal(input[k]??DEFAULT_COSTS[k],k,k==='hours'?24:1000000);if(out.people>10000)throw Error('Quantidade máxima: 10.000 colaboradores.');return out}
export function heCosts(input){const c=normalizeCosts(input),hour=c.hourly*c.premium*c.charges*c.dsm,person_day=hour*c.hours+c.food,day=person_day*c.people,days=c.daily_extra?c.volume/c.daily_extra:c.volume?null:0,whole_days=days==null?null:Math.ceil(days);return {hour,person_day,day,days,whole_days,proportional:days==null?null:days*day,total:whole_days==null?null:whole_days*day}}
export function normalizePlan(input,config,previous=null,{preview=false}={}){
 const name=text(input.name,100)||(preview?'Plano em edição':''),stage=text(input.stage,50),start_date=input.start_date,initial_backlog=Math.abs(integer(input.initial_backlog,'Atraso inicial',{signed:true}));
 if(!name||!config.stages.includes(stage)||!validDate(start_date))throw Error('Informe nome, etapa e data inicial válidos.');
 const source=input.data||{},line=text(source.line,80);if(line&&!(config.partsByLine?.[line]||[]).includes(stage))throw Error('Linha e etapa não pertencem à seção.');
 if(!Array.isArray(source.rows)||source.rows.length<1||source.rows.length>366)throw Error('Cadastre entre 1 e 366 datas.');
 const dates=new Set(),rows=source.rows.map(r=>{
  if(!validDate(r.date)||r.date<start_date||r.date>addDate(start_date,730)||dates.has(r.date))throw Error('Datas inválidas, repetidas ou fora do intervalo de dois anos.');dates.add(r.date);
  const adjustment=integer(r.adjustment??0,'Ajuste',{signed:true}),adjustment_note=text(r.adjustment_note),actual=integer(r.actual,'Realizado',{nullable:true}),actual_reason=text(r.actual_reason)||(actual!=null?'Informado no planejamento':'');
  if(!preview&&adjustment&&!adjustment_note)throw Error('Explique o motivo dos ajustes de saldo.');
  return {date:r.date,demand:integer(r.demand,'Programado',{nullable:true}),forecast:integer(r.forecast,'Previsão',{nullable:true}),actual,actual_reason,adjustment,adjustment_note,note:text(r.note),closed:r.closed===true,...(r.recovery_day===true?{recovery_day:true}:{})};
 }).sort((a,b)=>a.date.localeCompare(b.date));
 if(rows[0].date!==start_date)throw Error('A primeira data deve ser igual à data inicial do plano.');
 const actions=(source.actions||[]);if(!Array.isArray(actions)||actions.length>100)throw Error('Limite de 100 ações por plano.');
 const cleanActions=actions.map((a,i)=>{const start=a.start,end=a.end||start;if(!validDate(start)||!validDate(end)||end<start||end>addDate(start,730))throw Error('Intervalo inválido no plano de ações.');const actionLine=text(a.line,80);if(actionLine&&!config.lines.includes(actionLine))throw Error('Linha inválida no plano de ações.');return {id:text(a.id||'acao-'+i,80),title:text(a.title,150)||'Ação de recuperação',kind:['HE','Capacidade','Material','Pessoas','Manutenção','Outro'].includes(a.kind)?a.kind:'Outro',line:actionLine,start,end,schedule:['todos','uteis','sabados'].includes(a.schedule)?a.schedule:'todos',responsible:text(a.responsible,100),status:['Planejada','Em andamento','Concluída','Cancelada'].includes(a.status)?a.status:'Planejada',extra_units:integer(a.extra_units??0,'Peças extras por dia'),daily_cost:Math.round(decimal(a.daily_cost??0,'Custo diário')*100)/100,include:a.include===true,note:text(a.note)}});
 return {name,stage,start_date,initial_backlog,data:{line,quantity_mode:source.quantity_mode==='good'?'good':'total',rows,actions:cleanActions,costs:normalizeCosts(source.costs),archived:source.archived===true,source:previous?.data?.source||null}};
}
export function scheduled(action,date){if(date<action.start||date>action.end)return false;const d=new Date(date+'T12:00:00Z').getUTCDay();return action.schedule==='uteis'?d>0&&d<6:action.schedule==='sabados'?d===6:true}
// Extra recovery production must also enter plans that omit the Saturday.
// Build a view of the plan; reading it never rewrites saved plans or revisions.
export function includeRecoveryDates(plan,panel={}){
 const existing=new Set(plan.data.rows.map(r=>r.date)),end=plan.data.rows.at(-1).date;
 const added=Object.entries(panel).filter(([date,value])=>validDate(date)&&date>=plan.start_date&&date<=end&&!existing.has(date)&&value.recoveryCount>0).map(([date])=>({date,demand:0,forecast:0,actual:null,actual_reason:'',adjustment:0,adjustment_note:'',note:'Produção extra para recuperação do atraso; sem programação adicional.',closed:false,recovery_day:true}));
 return added.length?{...plan,data:{...plan.data,rows:[...plan.data.rows,...added].sort((a,b)=>a.date.localeCompare(b.date))}}:plan;
}
export function project(plan,panel={},today){
 const initial=-Math.abs(plan.initial_backlog)||0;let balance=initial,zero_date=null,current=initial,knownCurrent=true,totalCost=0;
 const issues=[],actions=plan.data.actions.filter(a=>a.include&&a.status!=='Cancelada'),end=plan.data.rows.at(-1).date;
 for(let d=plan.start_date;d<=end;d=addDate(d))for(const a of actions)if(scheduled(a,d))totalCost+=a.daily_cost;
 const rows=plan.data.rows.map(r=>{
  const live=panel[r.date],production=r.recovery_day?live?.recoveryProduction:live?.production,defects=r.recovery_day?live?.recoveryDefects:live?.defects,present=r.recovery_day?live?.recoveryCount>0:!!live,actual=r.actual!=null?r.actual:present?(plan.data.quantity_mode==='good'?Math.max(0,production-defects):production):null,past=r.date<today||(r.date===today&&(r.actual!=null||r.closed===true)),partial_today=r.date===today&&!past&&actual!=null;
  const extra=actions.filter(a=>scheduled(a,r.date)).reduce((n,a)=>n+a.extra_units,0),forecast=r.forecast==null?null:r.forecast+extra,used=past?actual:forecast;
  const source=past?(r.actual!=null?'Realizado informado':present?(r.recovery_day?'Produção extra de recuperação':'Painel de produção'):'Realizado ausente'):r.date===today?(partial_today?'Hoje · realizado parcial; projeção usa previsão':'Hoje · planejamento'):'Planejamento';
  const opening=balance;if(r.demand==null||used==null||balance==null)balance=null;else balance=balance+used-r.demand-r.adjustment;
  if(r.demand==null)issues.push(r.date+': demanda não informada.');if(used==null)issues.push(r.date+': '+(past?'realizado':'previsão')+' não informado.');
  if(r.date<today){current=balance;knownCurrent=balance!=null}
  if(balance!=null&&balance>=0&&!zero_date)zero_date=r.date;
  return {...r,past,partial_today,actual,actual_shifts:live?.shifts||'',actual_source:r.actual!=null?r.actual_reason:present?(r.recovery_day?'Recuperação · '+live.recoveryCount+' lançamento(s)':'Painel · '+live.count+' lançamento(s) · turnos '+live.shifts):'Sem lançamento',forecast_total:forecast,extra,used,source,opening,closing:balance,backlog:balance==null?null:Math.max(0,-balance),advance:balance==null?null:Math.max(0,balance)};
 });
 const future=rows.filter(r=>!r.past).length,final=rows.at(-1).closing,returns=zero_date&&rows.some(r=>r.date>zero_date&&r.closing<0);
 const lastKnown=[...rows].reverse().find(r=>r.closing!=null);return {initial,rows,today,current:knownCurrent?current:null,final,last_known:lastKnown?{date:lastKnown.date,balance:lastKnown.closing}:null,zero_date,returns:Boolean(returns),issues,complete:issues.length===0,cost:Math.round(totalCost*100)/100,extra_per_day:final==null?null:future?Math.ceil(Math.max(0,-final)/future):null,he:heCosts(plan.data.costs)};
}
export function csvRows(csv){
 if(typeof csv!=='string'||csv.length>131072)throw Error('CSV muito grande.');const delimiter=csv.split(/\r?\n/,1)[0].includes(';')?';':',';let rows=[],row=[],field='',quoted=false;
 for(let i=0;i<csv.length;i++){const c=csv[i];if(c==='"'){if(quoted&&csv[i+1]==='"'){field+='"';i++}else if(quoted||field==='')quoted=!quoted;else field+=c}else if(c===delimiter&&!quoted){row.push(field);field=''}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&csv[i+1]==='\n')i++;row.push(field);if(row.some(x=>x.trim()))rows.push(row);row=[];field=''}else field+=c}
 if(quoted)throw Error('CSV com aspas não fechadas.');row.push(field);if(row.some(x=>x.trim()))rows.push(row);if(rows.length<2||rows.length>367)throw Error('CSV deve conter cabeçalho e até 366 datas.');
 const key=s=>s.replace(/^\uFEFF/,'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase().replace(/^previsao da producao$/,'previsto').replace(/^observacoes$/,'observacao'),headers=rows.shift().map(key),idx=k=>headers.indexOf(k);
 if(idx('data')<0||idx('programado')<0||idx('previsto')<0)throw Error('Use as colunas Data;Programado;Previsao da producao;Realizado;Observacoes.');
 const n=(s,label,signed=false)=>{s=String(s??'').trim();if(!s)return null;if(/^\d{1,3}(\.\d{3})+$/.test(s))s=s.replace(/\./g,'');return integer(s,label,{signed})};
 const used=new Set();return rows.map((r,i)=>{const get=k=>r[idx(k)]??'';let date=get('data').trim();if(/^\d{2}\/\d{2}\/\d{4}$/.test(date))date=date.split('/').reverse().join('-');if(!validDate(date)||used.has(date))throw Error('Data inválida ou repetida na linha '+(i+2));used.add(date);const actual=n(get('realizado'),'Realizado');return {date,demand:n(get('programado'),'Programado'),forecast:n(get('previsto'),'Previsto'),actual,actual_reason:actual==null?'':'Importado de CSV',adjustment:n(get('ajuste'),'Ajuste',true)??0,adjustment_note:text(get('motivo ajuste')),note:text(get('observacao')),closed:false}});
}
export function exportCsv(plan,projection){const cell=v=>{let s=String(v??'');if(typeof v==='string'&&/^[\s]*[=+\-@]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"'};return '\uFEFF'+[['Data','Saldo estimado','Programado','Previsao da producao','Realizado','Observacoes'],...projection.rows.map(r=>[r.date,r.opening,r.demand,r.forecast,r.actual,r.note+(r.adjustment?' · Correção anterior registrada: '+r.adjustment+' peças. '+r.adjustment_note:'')])].map(r=>r.map(cell).join(';')).join('\r\n')}
