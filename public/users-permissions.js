let userDirectoryCache=[],userEditingId=null,userPermissionDraft=[],userPermissionsTouched=false,userSaveBusy=false;
function applyAccessNavigation(){
 const routes={dashboard:'dashboard','entry-producao':'production.create','entry-perturbacao':'disturbances.create','history-producao':'production.history','history-perturbacao':'disturbances.history',goals:'goals.manage',auditoria:'audit.view'};
 document.querySelectorAll('#nav [data-nav]').forEach(button=>{const key=routes[button.dataset.nav];if(key)button.classList.toggle('hide',!can(key))});
 $('#auditButton').classList.toggle('hide',!can('audit.view'));
 for(const option of $('#historyType').options)option.disabled=!can(ProductionPolicy.recordPermission(option.value,'history'));
 if($('#historyType').selectedOptions[0]?.disabled){const first=[...$('#historyType').options].find(o=>!o.disabled);if(first)$('#historyType').value=first.value}
 document.querySelectorAll('#impacts [onclick*="openStopHistory"],#impacts [onclick*="showHistory"]').forEach(b=>b.classList.toggle('hide',!can('disturbances.history')));
}
async function admin(){
 if(me?.role!=='admin')return;
 tab('administracao');
 try{const scope=scopeVersion,users=await api('/api/users');if(scope!==scopeVersion)return;userDirectoryCache=users;renderUserDirectory()}catch(e){$('#userDirectoryMessage').className='user-feedback error';$('#userDirectoryMessage').textContent=e.message}
}
function renderUserDirectory(){
 const query=$('#userSearch').value.trim().toLocaleLowerCase('pt-BR'),status=$('#userStatus').value;
 const users=userDirectoryCache.filter(u=>(status==='all'||!!u.active===(status==='active'))&&[u.name,u.username,u.job].join(' ').toLocaleLowerCase('pt-BR').includes(query));
 $('#userStats').innerHTML=[['Pessoas cadastradas',userDirectoryCache.length],['Contas ativas',userDirectoryCache.filter(u=>u.active).length],['Administradores',userDirectoryCache.filter(u=>u.active&&u.role==='admin').length]].map(([label,value])=>`<div><span>${label}</span><strong>${value}</strong></div>`).join('');
 $('#users').innerHTML=users.map(u=>`<tr><td><div class="user-identity"><span class="user-avatar" aria-hidden="true">${safe((u.name||u.username).split(/\s+/).filter(Boolean).slice(0,2).map(n=>n[0]).join('').toUpperCase())}</span><div><strong>${safe(u.name||u.username)}</strong><small>${safe(u.username)} · ${safe(u.job||'Função não informada')}</small></div></div></td><td><span class="user-badge ${u.role==='admin'?'admin-badge':''}">${u.general_admin?'Administrador geral':u.role==='admin'?'Administrador da seção':u.permissions_custom?'Personalizado':'Padrão da função'}</span><small class="user-cell-help">${safe(options.sections.find(s=>s.id===u.section)?.label||u.section)} · ${u.general_admin?'Todas as seções':u.role==='admin'?'Acesso completo na seção':u.permissions.length+' permissões'}</small></td><td>${ProductionPolicy.userShift(u)==='custom'?'Personalizado':ProductionPolicy.userShift(u)+'º turno'}<small class="user-cell-help">${safe(u.start)} às ${safe(u.end)}</small></td><td><span class="user-status ${u.active?'is-active':'is-inactive'}">${u.active?'Ativo':'Inativo'}</span></td><td><button type="button" class="secondary" onclick="openUserEditor(${u.id})" aria-label="Editar usuário ${safe(u.name||u.username)}">Editar</button></td></tr>`).join('')||'<tr><td colspan="5" class="user-empty">Nenhuma pessoa encontrada. Ajuste a busca ou cadastre um novo usuário.</td></tr>';
 $('#userResults').textContent=users.length+' de '+userDirectoryCache.length+' pessoas';
}
function openUserEditor(id){
 if(me?.role!=='admin')return;
 const person=id?userDirectoryCache.find(u=>u.id===id):null;if(id&&!person)return;
 const form=$('#userForm');form.reset();form.elements.section.innerHTML=options.sections.map(s=>`<option value="${s.id}">${s.label}</option>`).join('');form.elements.section.value=person?.section||activeSection;form.elements.section.disabled=!me.general_admin;$('#generalAdminField').hidden=!me.general_admin||(person?.role||'operador')!=='admin';form.elements.general_admin.value=person?.general_admin?'true':'false';userEditingId=person?.id??null;userPermissionsTouched=!!person?.permissions_custom;
 for(const key of ['name','username','oidc_subject','job','role','start','end'])if(person)form.elements[key].value=person[key]??'';
 form.elements.active.checked=person?!!person.active:true;form.elements.turno.value=person?ProductionPolicy.userShift(person):'1';
 form.elements.username.readOnly=!!person;form.elements.oidc_subject.readOnly=!!person;
 $('#usernameHelp').textContent=person?'A identificação é preservada para manter o histórico.':'Nome de exibição do cadastro corporativo.';
 $('#userEditorTitle').textContent=person?'Editar '+(person.name||person.username):'Novo usuário';$('#userEditorBadge').textContent=person?'Edição de cadastro':'Novo cadastro';$('#userSaveButton').textContent=person?'Salvar alterações':'Criar usuário';
 $('#userSaveHint').textContent=person?'Ao salvar, as sessões dessa pessoa serão encerradas para aplicar os novos acessos.':'Os acessos serão aplicados ao salvar o usuário.';
 $('#userError').textContent='';$('#userDirectoryMessage').textContent='';
 userPermissionDraft=person?[...person.permissions]:ProductionPolicy.defaultPermissions({job:form.elements.job.value});
 setUserShift(form);renderPermissionGroups();$('#userDirectory').hidden=true;$('#userEditor').hidden=false;$('#userEditor').scrollIntoView({block:'start',behavior:'smooth'});form.elements.name.focus({preventScroll:true});
}
function closeUserEditor(){$('#userEditor').hidden=true;$('#userDirectory').hidden=false;userEditingId=null;$('#userDirectory').scrollIntoView({block:'start',behavior:'smooth'})}
function setUserShift(form){const shift=ProductionPolicy.SHIFT_DEFS[form.elements.turno.value];form.elements.start.readOnly=form.elements.end.readOnly=!!shift;if(shift){form.elements.start.value=shift.start;form.elements.end.value=shift.end}$('#userShiftHelp').textContent=form.elements.turno.value==='3'?'Escala espanhola: domingos alternados das 22:24 às 05:00. O sistema considera a virada do dia.':shift?'Os horários são preenchidos conforme o turno selecionado.':'Defina os horários que serão usados para permitir correções durante a jornada.'}
function userJobChanged(){if(!userPermissionsTouched){userPermissionDraft=ProductionPolicy.defaultPermissions({job:$('#userForm').elements.job.value});renderPermissionGroups()}}
function userRoleChanged(){$('#generalAdminField').hidden=!me.general_admin||$('#userForm').elements.role.value!=='admin';if($('#userForm').elements.role.value!=='admin')$('#userForm').elements.general_admin.value='false';renderPermissionGroups()}
function renderPermissionGroups(){
 const adminProfile=$('#userForm').elements.role.value==='admin',selected=new Set(adminProfile?ProductionPolicy.PERMISSIONS.map(p=>p.key):userPermissionDraft);
 $('#permissionsAdminNotice').hidden=!adminProfile;$('#permissionPresets').hidden=adminProfile;
 document.querySelectorAll('.permission-selection button').forEach(b=>b.disabled=adminProfile);
 $('#permissionGroups').innerHTML=[...new Set(ProductionPolicy.PERMISSIONS.map(p=>p.group))].map(group=>`<fieldset class="permission-group ${['Visão geral','Gestão'].includes(group)?'permission-wide':''}"><legend>${safe(group)}</legend><div class="permission-items">${ProductionPolicy.PERMISSIONS.filter(p=>p.group===group).map(p=>`<label class="permission-option"><input type="checkbox" name="permissions" value="${safe(p.key)}" ${selected.has(p.key)?'checked':''} ${adminProfile?'disabled':''} onchange="permissionChanged(this)"><span><strong>${safe(p.label)}</strong><small>${safe(p.description)}</small></span></label>`).join('')}</div></fieldset>`).join('');
 $('#permissionCount').textContent=adminProfile?'Acesso completo do administrador':selected.size+' de '+ProductionPolicy.PERMISSIONS.length+' permissões selecionadas';
}
function permissionChanged(input){
 userPermissionsTouched=true;const selected=new Set(userPermissionDraft),item=ProductionPolicy.PERMISSIONS.find(p=>p.key===input.value);
 if(input.checked){selected.add(item.key);if(item.requires)selected.add(item.requires)}else{selected.delete(item.key);for(const child of ProductionPolicy.PERMISSIONS)if(child.requires===item.key)selected.delete(child.key)}
 userPermissionDraft=[...selected];renderPermissionGroups();document.querySelector('#permissionGroups input[value="'+item.key+'"]').focus({preventScroll:true});
}
function applyPermissionPreset(preset){
 if($('#userForm').elements.role.value==='admin')return;
 userPermissionsTouched=true;
 userPermissionDraft=preset==='read'?['dashboard','production.history','production.export','disturbances.history','disturbances.export']:preset==='management'?['dashboard','production.history','production.export','disturbances.history','disturbances.export','goals.manage','audit.view']:ProductionPolicy.defaultPermissions({job:''});renderPermissionGroups();
}
function selectAllPermissions(selected){if($('#userForm').elements.role.value==='admin')return;userPermissionsTouched=true;userPermissionDraft=selected?ProductionPolicy.PERMISSIONS.map(p=>p.key):[];renderPermissionGroups()}
async function submitUserForm(event){
 event.preventDefault();if(userSaveBusy)return;
 const form=event.currentTarget,button=$('#userSaveButton'),label=button.textContent;userSaveBusy=true;button.disabled=true;button.textContent='Salvando…';$('#userError').textContent='';
 try{
  const data=Object.fromEntries(new FormData(form));data.active=form.elements.active.checked;data.section=form.elements.section.value;data.general_admin=form.elements.role.value==='admin'&&form.elements.general_admin.value==='true';data.permissions=form.elements.role.value==='admin'?ProductionPolicy.PERMISSIONS.map(p=>p.key):[...userPermissionDraft];
  if(userEditingId)data.id=userEditingId;
  const ownAccount=userEditingId===me.id;
  await api(userEditingId?'/api/user-update':'/api/users',data);
  closeUserEditor();
  if(ownAccount){await load();$('#loginError').textContent='Cadastro atualizado. Entre novamente para continuar.';return}
  await admin();$('#userDirectoryMessage').className='user-feedback good';$('#userDirectoryMessage').textContent='Usuário salvo com sucesso. Os acessos foram atualizados e a alteração ficou registrada no log.';
 }catch(e){$('#userError').textContent=e.message}finally{userSaveBusy=false;button.disabled=false;button.textContent=label}
}
async function showAudit(){if(!can('audit.view'))return;tab('auditoria');$('#auditError').textContent='';try{const scope=scopeVersion,logs=await api('/api/audit');if(scope!==scopeVersion)return;$('#audit').innerHTML=logs.map(x=>`<tr><td>${safe(x.at.replace('T',' '))}</td><td>${safe(x.actor)}</td><td>${safe(x.action)}</td><td>${safe(x.record_id||'—')}</td><td><pre>${safe(x.before_data||'—')}</pre></td><td><pre>${safe(x.after_data||'—')}</pre></td></tr>`).join('')||'<tr><td colspan="6">Nenhum evento registrado.</td></tr>'}catch(e){$('#auditError').textContent=e.message}}
document.addEventListener('DOMContentLoaded',()=>{$('#userForm').addEventListener('submit',submitUserForm)});
