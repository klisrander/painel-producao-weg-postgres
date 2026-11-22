/* History filtering and SpreadsheetML export. The workbook is generated locally
   from the authenticated records already displayed in the panel. */
export const HistoryTools=(() => {
  'use strict';
  const NS='http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  const REL='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const XML='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  const isDay=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+'T12:00:00Z'))&&new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v;
  const day=v=>v?v.split('-').reverse().join('/'):'';
  const shiftOf=r=>String(r.data.turno||(r.kind==='producao'?'3':''));
  function query(input){
    const q={type:input.type,line:String(input.line||''),from:String(input.from||''),to:String(input.to||''),shift:String(input.shift||'')};
    if(!['producao','perturbacao'].includes(q.type))throw Error('Selecione a consulta de produção ou perturbações.');
    if([q.from,q.to].some(v=>v&&!isDay(v)))throw Error('Informe datas válidas para o período.');
    if(q.from&&q.to&&q.from>q.to)throw Error('A data final deve ser igual ou posterior à data inicial.');
    if(q.line&&!(/^(Linha 0[1-6]|Mini Motor|WT|WT-25|Pré Montagem)$/.test(q.line)))throw Error('Selecione uma linha válida.');
    if(!['','1','2','3','unknown'].includes(q.shift))throw Error('Selecione um turno válido.');
    return q;
  }
  function filter(all,input){
    const q=query(input);
    return all.filter(r=>r.kind===q.type&&r.data&&(!q.line||r.data.linha===q.line)&&(!(q.from||q.to)||isDay(r.data.data))&&(!q.from||r.data.data>=q.from)&&(!q.to||r.data.data<=q.to)&&(!q.shift||(q.shift==='unknown'?!['1','2','3'].includes(shiftOf(r)):shiftOf(r)===q.shift)))
      .sort((a,b)=>String(a.data.linha||'').localeCompare(String(b.data.linha||''),'pt-BR',{numeric:true})||String(b.data.data||'').localeCompare(String(a.data.data||''))||String(b.data.inicio||b.created||'').localeCompare(String(a.data.inicio||a.created||''))||b.id-a.id);
  }
  function period(input){const q=query(input);return q.from&&q.to?(q.from===q.to?'Dia '+day(q.from):day(q.from)+' a '+day(q.to)):q.from?'A partir de '+day(q.from):q.to?'Até '+day(q.to):'Todos os dias'}
  const escape=v=>String(v??'').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
  function column(i){let s='';for(i++;i;i=Math.floor((i-1)/26))s=String.fromCharCode(65+(i-1)%26)+s;return s}
  function dateNumber(value){
    if(!value)return null;const text=String(value).replace(' ','T');
    if(!/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?)?$/.test(text)||!isDay(text.slice(0,10)))return null;
    const parts=text.slice(11).split(':').map(Number);if(parts.some((v,i)=>!Number.isFinite(v)||v<0||v>(i===0?23:59)))return null;
    return Date.parse(text.length===10?text+'T00:00:00Z':text+'Z')/86400000+25569;
  }
  const number=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))?Number(v):null;
  const text=(ref,value,style=4)=>`<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${escape(value)}</t></is></c>`;
  const numeric=(ref,value,style=5)=>value===null?`<c r="${ref}" s="${style}"/>`:`<c r="${ref}" s="${style}"><v>${value}</v></c>`;
  const formula=(ref,f,value)=>`<c r="${ref}" s="8"><f>${escape(f)}</f><v>${value}</v></c>`;
  const styles=XML+`<styleSheet xmlns="${NS}"><numFmts count="2"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/><numFmt numFmtId="165" formatCode="dd/mm/yyyy hh:mm:ss"/></numFmts><fonts count="4"><font><sz val="11"/><color rgb="FF20384F"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font><font><b/><sz val="20"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font><font><sz val="10"/><color rgb="FF647891"/><name val="Calibri"/></font></fonts><fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF00579D"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF1F6FB"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left/><right/><top/><bottom style="thin"><color rgb="FFE1E8F0"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="9"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="2" fillId="2" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="center"/></xf><xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment wrapText="1" vertical="center"/></xf><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyAlignment="1"><alignment wrapText="1" vertical="center"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf><xf numFmtId="3" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="right" vertical="top"/></xf><xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment vertical="top"/></xf><xf numFmtId="165" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment vertical="top"/></xf><xf numFmtId="3" fontId="1" fillId="2" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment wrapText="1" vertical="center"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles><tableStyles count="0" defaultTableStyle="TableStyleMedium2" defaultPivotStyle="PivotStyleLight16"/></styleSheet>`;
  const crcTable=Uint32Array.from({length:256},(_,i)=>{let c=i;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0});
  function zip(files,date){
    const encoder=new TextEncoder();let length=0;
    const entries=Object.entries(files).map(([name,xml])=>{const n=encoder.encode(name),data=encoder.encode(xml);let crc=0xffffffff;for(const byte of data)crc=crcTable[(crc^byte)&255]^(crc>>>8);const e={n,data,crc:(crc^0xffffffff)>>>0,offset:length};length+=30+n.length+data.length;return e});
    const central=length;length+=entries.reduce((sum,e)=>sum+46+e.n.length,0)+22;if(length>0xffffffff)throw Error('O arquivo ficou muito grande. Selecione um período menor.');
    const out=new Uint8Array(length),view=new DataView(out.buffer),time=(date.getHours()<<11)|(date.getMinutes()<<5)|(date.getSeconds()>>1),dosDate=((Math.max(1980,Math.min(2107,date.getFullYear()))-1980)<<9)|((date.getMonth()+1)<<5)|date.getDate();let at=0;
    const u16=v=>{view.setUint16(at,v,true);at+=2},u32=v=>{view.setUint32(at,v,true);at+=4},bytes=v=>{out.set(v,at);at+=v.length};
    for(const e of entries){u32(0x04034b50);u16(20);u16(0x800);u16(0);u16(time);u16(dosDate);u32(e.crc);u32(e.data.length);u32(e.data.length);u16(e.n.length);u16(0);bytes(e.n);bytes(e.data)}
    for(const e of entries){u32(0x02014b50);u16(20);u16(20);u16(0x800);u16(0);u16(time);u16(dosDate);u32(e.crc);u32(e.data.length);u32(e.data.length);u16(e.n.length);u16(0);u16(0);u16(0);u16(0);u32(0);u32(e.offset);bytes(e.n)}
    const size=at-central;u32(0x06054b50);u16(0);u16(0);u16(entries.length);u16(entries.length);u32(size);u32(central);u16(0);return out;
  }
  function workbook(all,input,options={}){
    const q=query(input),rows=filter(all,q),production=q.type==='producao';if(!rows.length)throw Error('Não há registros para os filtros selecionados.');if(rows.length>1048500)throw Error('Selecione um período menor para exportar ao Excel.');
    const sheet=production?'Produção':'Perturbações',title='Histórico de '+(production?'produção':'perturbações'),tableName=production?'HistoricoProducao':'HistoricoPerturbacoes';
    const columns=production?[
      ['ID',8,'number',r=>r.id],['Data do lançamento',15,'date',r=>r.data.data],['Linha',13,'text',r=>r.data.linha],['Turno',16,'text',r=>shiftOf(r)?shiftOf(r)+'º turno':'Não informado'],['Etapa',17,'text',r=>r.data.etapa],['Produção',16,'number',r=>r.data.producao],['Peças defeituosas',18,'number',r=>r.data.defeitos],['Meta registrada',18,'number',r=>r.data.meta],['Autor',20,'text',r=>r.username],['Criado em',23,'datetime',r=>r.created],['Atualizado em',23,'datetime',r=>r.updated]
    ]:[
      ['ID',8,'number',r=>r.id],['Data do lançamento',15,'date',r=>r.data.data],['Linha',13,'text',r=>r.data.linha],['Turno',17,'text',r=>shiftOf(r)?shiftOf(r)+'º turno':'Não informado'],['Centro de trabalho',19,'text',r=>r.data.ct],['Descrição do equipamento',43,'text',r=>r.data.descricao],['Código do equipamento',23,'text',r=>r.data.codigo],['Patrimônio',17,'text',r=>r.data.patrimonio],['Motivo',30,'text',r=>r.data.motivo],['Problema / comentários',55,'text',r=>r.data.comentario],['Início da parada',23,'datetime',r=>r.data.inicio],['Fim da parada',23,'datetime',r=>r.data.fim],['Duração (min)',17,'number',r=>r.data.duracao],['Autor',20,'text',r=>r.username],['Criado em',23,'datetime',r=>r.created],['Atualizado em',23,'datetime',r=>r.updated]
    ];
    if(production&&rows.some(r=>r.data.capacity!=null))columns.push(['CAP registrada',18,'number',r=>r.data.capacity],['Eficiência (%)',18,'number',r=>r.data.capacity>0?r.data.producao/r.data.capacity*100:null],['Meta de eficiência (%)',23,'number',r=>r.data.efficiency_target]);
    if(!production&&rows.some(r=>r.data.etapa))columns.push(['Parte / etapa',23,'text',r=>r.data.etapa||'Não informada']);
    const now=options.now?new Date(options.now):new Date();if(!Number.isFinite(now.getTime()))throw Error('Data de geração inválida.');
    const generated=new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(now);
    const last=column(columns.length-1),firstData=7,lastData=6+rows.length,merges=['A1:'+last+'1','A2:'+last+'2','A3:'+last+'3','A4:'+last+'4'];
    const top=(row,value,style,height)=>`<row r="${row}" ht="${height}" customHeight="1">${text('A'+row,value,style)}</row>`;
    const content=[top(1,title,1,34),top(2,period(q)+' · '+(q.line||'Todas as linhas')+' · '+(q.shift==='unknown'?'Sem turno informado':q.shift?q.shift+'º turno':'Todos os turnos'),2,29),top(3,rows.length+' registros · Gerado em '+generated+' (Brasília)'+(options.author?' · '+options.author:''),2,23),top(4,production?'Valores e metas registrados em cada lançamento; os totais de cada etapa estão separados ao final.':'Filtro pela data do lançamento. No 3º turno, considera o dia de início do turno. Paradas simultâneas podem se sobrepor.',2,30),'<row r="6" ht="32" customHeight="1">'+columns.map((c,i)=>text(column(i)+'6',c[0],3)).join('')+'</row>'];
    rows.forEach((r,index)=>{const row=index+firstData;let height=21;const cells=columns.map(([name,width,type,get],i)=>{const value=get(r),ref=column(i)+row;if(type==='number')return numeric(ref,number(value));if(type==='date'||type==='datetime'){const n=dateNumber(value);return n===null?(value?text(ref,value):numeric(ref,null,type==='date'?6:7)):numeric(ref,n,type==='date'?6:7)}const s=String(value??'');if(s.length>32767)throw Error('Um texto do registro '+r.id+' excede o limite de uma célula do Excel.');height=Math.max(height,Math.min(220,(Math.ceil(s.length/(width*1.1))+(s.match(/\n/g)||[]).length)*14+7));return text(ref,s)});content.push(`<row r="${row}" ht="${height}" customHeight="1">${cells.join('')}</row>`)});
    let bottom=lastData+2;
    if(production){for(const stage of [...new Set(rows.map(r=>r.data.etapa))]){const selected=rows.filter(r=>r.data.etapa===stage),sum=k=>selected.reduce((n,r)=>n+(number(r.data[k])||0),0);merges.push('A'+bottom+':E'+bottom);content.push(`<row r="${bottom}" ht="27" customHeight="1">${text('A'+bottom,'TOTAL '+stage.toUpperCase(),3)}${formula('F'+bottom,`SUMIF(E${firstData}:E${lastData},"${stage}",F${firstData}:F${lastData})`,sum('producao'))}${formula('G'+bottom,`SUMIF(E${firstData}:E${lastData},"${stage}",G${firstData}:G${lastData})`,sum('defeitos'))}</row>`);bottom++}}
    else{merges.push('A'+bottom+':L'+bottom);content.push(`<row r="${bottom}" ht="29" customHeight="1">${text('A'+bottom,'MINUTOS REGISTRADOS · SOMA DAS OCORRÊNCIAS',3)}${formula('M'+bottom,`SUM(M${firstData}:M${lastData})`,rows.reduce((n,r)=>n+(number(r.data.duracao)||0),0))}</row>`)}
    const tableRange='A6:'+last+lastData;
    const worksheet=XML+`<worksheet xmlns="${NS}" xmlns:r="${REL}"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><dimension ref="A1:${last}${bottom}"/><sheetViews><sheetView workbookViewId="0" showGridLines="0"><pane ySplit="6" topLeftCell="A7" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A7" sqref="A7"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="20"/><cols>${columns.map((c,i)=>`<col min="${i+1}" max="${i+1}" width="${c[1]}" customWidth="1"/>`).join('')}</cols><sheetData>${content.join('')}</sheetData><mergeCells count="${merges.length}">${merges.map(ref=>`<mergeCell ref="${ref}"/>`).join('')}</mergeCells><pageMargins left="0.3" right="0.3" top="0.5" bottom="0.5" header="0.2" footer="0.2"/><pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/><tableParts count="1"><tablePart r:id="rId1"/></tableParts></worksheet>`;
    const relationship=(type,target,id)=>`<Relationship Id="${id}" Type="${type}" Target="${target}"/>`;
    const packageRel='http://schemas.openxmlformats.org/package/2006/relationships';
    const files={
      '[Content_Types].xml':XML+'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>'+[['/xl/workbook.xml','spreadsheetml.sheet.main'],['/xl/worksheets/sheet1.xml','spreadsheetml.worksheet'],['/xl/styles.xml','spreadsheetml.styles'],['/xl/tables/table1.xml','spreadsheetml.table']].map(([part,type])=>`<Override PartName="${part}" ContentType="application/vnd.openxmlformats-officedocument.${type}+xml"/>`).join('')+'<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>',
      '_rels/.rels':XML+`<Relationships xmlns="${packageRel}">${relationship(REL+'/officeDocument','xl/workbook.xml','rId1')}${relationship('http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties','docProps/core.xml','rId2')}${relationship(REL+'/extended-properties','docProps/app.xml','rId3')}</Relationships>`,
      'docProps/core.xml':XML+`<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${escape(title)}</dc:title><dc:creator>Painel de Produção</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${now.toISOString()}</dcterms:created></cp:coreProperties>`,
      'docProps/app.xml':XML+'<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Painel de Produção</Application></Properties>',
      'xl/workbook.xml':XML+`<workbook xmlns="${NS}" xmlns:r="${REL}"><bookViews><workbookView/></bookViews><sheets><sheet name="${sheet}" sheetId="1" r:id="rId1"/></sheets><definedNames><definedName name="_xlnm.Print_Area" localSheetId="0">'${sheet}'!$A$1:$${last}$${bottom}</definedName><definedName name="_xlnm.Print_Titles" localSheetId="0">'${sheet}'!$6:$6</definedName></definedNames><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`,
      'xl/_rels/workbook.xml.rels':XML+`<Relationships xmlns="${packageRel}">${relationship(REL+'/worksheet','worksheets/sheet1.xml','rId1')}${relationship(REL+'/styles','styles.xml','rId2')}</Relationships>`,
      'xl/styles.xml':styles,
      'xl/worksheets/sheet1.xml':worksheet,
      'xl/worksheets/_rels/sheet1.xml.rels':XML+`<Relationships xmlns="${packageRel}">${relationship(REL+'/table','../tables/table1.xml','rId1')}</Relationships>`,
      'xl/tables/table1.xml':XML+`<table xmlns="${NS}" id="1" name="${tableName}" displayName="${tableName}" ref="${tableRange}" totalsRowShown="0"><autoFilter ref="${tableRange}"/><tableColumns count="${columns.length}">${columns.map((c,i)=>`<tableColumn id="${i+1}" name="${escape(c[0])}"/>`).join('')}</tableColumns><tableStyleInfo name="TableStyleMedium2" showFirstColumn="0" showLastColumn="0" showRowStripes="1" showColumnStripes="0"/></table>`
    };
    const dates=rows.map(r=>r.data.data).filter(isDay).sort(),start=q.from||dates[0],end=q.to||dates.at(-1);
    return {bytes:zip(files,now),filename:'historico_'+q.type+'_'+start+'_a_'+end+'.xlsx',count:rows.length,mime:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'};
  }
  return Object.freeze({query,filter,period,workbook});
})();
