(function(root){
 'use strict';
 // Label the existing cells, keeping forms, event handlers and table data intact.
 function enhance(table){
  const head=table.querySelector('thead');
  const headRows=head?Array.from(head.children).filter(row=>row.tagName==='TR'):[];
  if(headRows.length!==1)return;
  const cells=row=>Array.from(row.children).filter(cell=>cell.tagName==='TH'||cell.tagName==='TD');
  const span=(cell,name='colspan')=>Number(cell.getAttribute(name)||1);
  const headers=cells(headRows[0]);
  if(headers.some(cell=>span(cell)>1||span(cell,'rowspan')>1))return;
  table.classList.add('adaptive-table');table.setAttribute('role','table');
  head.setAttribute('role','rowgroup');headRows[0].setAttribute('role','row');
  headers.forEach(cell=>cell.setAttribute('role','columnheader'));
  for(const body of Array.from(table.children).filter(el=>['TBODY','TFOOT'].includes(el.tagName))){
   body.setAttribute('role','rowgroup');
   for(const row of Array.from(body.children).filter(el=>el.tagName==='TR')){
    row.setAttribute('role','row');let column=0;
    const group=cells(row).length===1&&span(cells(row)[0])>1;
    row.classList.toggle('adaptive-group',group);
    for(const cell of cells(row)){
     const label=(headers[column]?.textContent||'Ações').replace(/\s+/g,' ').trim()||'Ações';
     cell.setAttribute('role',cell.tagName==='TH'?'rowheader':'cell');
     cell.dataset.label=label;
     cell.classList.toggle('adaptive-wide',span(cell)>1||group);
     cell.classList.toggle('adaptive-empty',span(cell)>1&&!cell.textContent.trim()&&!cell.querySelector('input,select,button,a'));
     column+=span(cell);
    }
   }
  }
 }
 function start(doc){
  const area=doc.querySelector('.workspace');if(!area)return;
  area.querySelectorAll('table').forEach(enhance);
  const pending=new Set();let scheduled=false;
  const flush=()=>{scheduled=false;for(const table of pending)if(area.contains(table))enhance(table);pending.clear()};
  const observer=new root.MutationObserver(mutations=>{
   for(const mutation of mutations){
    // Ignore text-only edits (typing/projection calculations need no relabelling).
    if(![...mutation.addedNodes,...mutation.removedNodes].some(node=>node.nodeType===1))continue;
    const table=mutation.target.closest?.('table');if(table)pending.add(table);
    for(const node of mutation.addedNodes)if(node.nodeType===1){const owner=node.closest('table');if(owner)pending.add(owner);node.querySelectorAll('table').forEach(t=>pending.add(t))}
   }
   if(pending.size&&!scheduled){scheduled=true;root.queueMicrotask(flush)}
  });
  observer.observe(area,{childList:true,subtree:true});return observer;
 }
 root.AdaptiveTables={enhance,start};
 if(root.document){if(root.document.readyState==='loading')root.document.addEventListener('DOMContentLoaded',()=>start(root.document),{once:true});else start(root.document)}
})(globalThis);
