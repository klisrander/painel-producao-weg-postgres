(async()=>{
 const initial=await fetch('/api/me',{cache:'no-store'}).catch(()=>null);if(!initial?.ok)return;
 const idle=SessionIdle.create({onExpire:async()=>{await fetch('/api/logout',{method:'POST',headers:{'content-type':'application/json'},body:'{}'}).catch(()=>{});location.assign('/')},onActivity:async at=>{const response=await fetch('/api/session/activity',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({at})});if(!response.ok)throw Error('Sessão expirada')}});
 idle.start((await initial.json()).session);
})();
