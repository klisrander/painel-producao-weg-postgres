(function(root){
 'use strict';
 const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const num=n=>Number(n).toLocaleString('pt-BR'),day=d=>d.split('-').reverse().join('/');
 const sum=values=>values.every(Number.isFinite)?values.reduce((a,b)=>a+b,0):null;
 function create(stage,lines,rows,dates,history,policy,performance=[]){
  const lookup=new Map(),totals=new Map();
  for(const row of rows)if(row.etapa===stage){lookup.set(row.data+'|'+row.linha+'|'+row.turno,row.producao);totals.set(row.data,(totals.get(row.data)||0)+row.producao)}
  const metrics=(date,line,turn)=>policy.performanceFor?policy.performanceFor(date,stage,line,turn,performance,history):{configured:false,target:policy.targetFor(date,stage,line,turn,history)},goal=(date,line,turn)=>metrics(date,line,turn).target;
  function renderDay(date){return lines.map(line=>{
   const values=[1,2,3].map(turn=>lookup.get(date+'|'+line+'|'+turn)),goals=[1,2,3].map(turn=>goal(date,line,turn));
   const found=values.filter(Number.isFinite),total=found.reduce((a,b)=>a+b,0),target=sum(goals);
   if([1,2,3].some(turn=>metrics(date,line,turn).configured))return `<article class="mobile-production-line"><h3>${esc(line)}</h3>${[1,2,3].map((turn,i)=>{const m=metrics(date,line,turn),eff=m.capacity>0&&Number.isFinite(values[i])?values[i]/m.capacity*100:null;return `<div class="mobile-performance-shift"><h4>${turn}º turno</h4><dl><div><dt>Produção</dt><dd>${Number.isFinite(values[i])?num(values[i]):'—'}</dd></div><div><dt>CAP</dt><dd>${m.off?'N/O':m.capacity==null?'—':num(m.capacity)}</dd></div><div><dt>Eficiência</dt><dd class="${eff==null?'':eff>=m.efficiencyTarget?'met':'below'}">${eff==null?'—':eff.toLocaleString('pt-BR',{maximumFractionDigits:1})+'%'}</dd></div><div><dt>Meta de eficiência</dt><dd>${m.efficiencyTarget==null||m.off?'—':num(m.efficiencyTarget)+'%'}</dd></div></dl></div>`}).join('')}<p class="mobile-performance-total">Total: ${found.length?num(total):'—'} peças</p></article>`;
   return `<article class="mobile-production-line"><h3>${esc(line)}</h3><table aria-label="${esc(stage+' · '+line+' · '+day(date))}"><thead><tr><th>Turno</th><th>Produção</th><th>Meta</th></tr></thead><tbody>${[1,2,3].map((turn,i)=>{
    const off=turn===3&&(!policy.policyFor(date,stage,line,history).thirdEnabled||!policy.shiftSpec('3',date)),present=Number.isFinite(values[i]),state=present&&Number.isFinite(goals[i])?(values[i]>=goals[i]?'met':'below'):'';
    return `<tr><th scope="row">${turn}º turno</th><td class="${state}">${present?num(values[i]):'—'}</td><td>${off?'N/O':Number.isFinite(goals[i])?num(goals[i]):'—'}</td></tr>`;
   }).join('')}<tr class="mobile-production-total"><th scope="row">Total</th><td>${found.length?num(total):'—'}</td><td>${target==null?'—':num(target)}</td></tr></tbody></table></article>`;
  }).join('')}
  const html=dates.length?`<div class="mobile-production">${dates.slice().reverse().map((date,i)=>`<details data-production-day="${esc(date)}" ${i===0?'open':''}><summary><strong>${day(date)}</strong><span>${totals.has(date)?num(totals.get(date))+' peças':'Sem lançamentos'}</span><span class="mobile-day-toggle" aria-hidden="true">⌄</span></summary><div class="mobile-production-lines">${i===0?renderDay(date):''}</div></details>`).join('')}</div>`:'<p class="empty">Nenhum lançamento neste período.</p>';
  return {html,fill(details){const body=details.querySelector('.mobile-production-lines');if(details.open&&body&&!body.children.length)body.innerHTML=renderDay(details.dataset.productionDay)}};
 }
 root.MobileProduction={create};
})(globalThis);
