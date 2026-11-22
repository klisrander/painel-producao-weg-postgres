(() => {
 'use strict';
 const IDLE=15*60*1000;
 function create({onExpire,onActivity,now=()=>Date.now(),doc=document,host=window,storage,delay=setTimeout,cancel=clearTimeout}){
  try{storage??=host.localStorage}catch{}
  let active=false,id='',offset=0,last=0,reported=0,timer,flushTimer,pending=false,generation=0;
  const key=()=> 'weg-idle:'+id;
  const write=value=>{try{storage?.setItem(key(),JSON.stringify(value))}catch{}};
  function stop(broadcast=false){if(active&&broadcast)write({at:last,closed:true});active=false;generation++;cancel(timer);cancel(flushTimer);timer=flushTimer=null;pending=false;id=''}
  function expire(reason='idle'){if(!active)return false;stop();onExpire(reason);return false}
  function check(){if(!active)return false;if(now()-last>=IDLE)return expire();return true}
  function arm(){cancel(timer);if(active)timer=delay(()=>{if(check())arm()},Math.max(1,last+IDLE-now()))}
  function queueFlush(wait=1000){if(active&&!flushTimer&&!pending&&last>reported)flushTimer=delay(flush,wait)}
  async function flush(){flushTimer=null;if(!check()||pending||last<=reported)return;const sent=last,gen=generation;pending=true;let retry=1000;try{await onActivity(sent+offset);if(gen===generation)reported=Math.max(reported,sent)}catch{retry=5000}finally{if(gen===generation){pending=false;queueFlush(retry===5000?retry:30000)}}}
  function activity(event){if(event?.isTrusted===false||doc.visibilityState==='hidden'||!check())return;const at=now();if(at-last<1000)return;last=at;write({at:last});arm();queueFlush(Math.max(0,reported+30000-now()))}
  function start(session){if(!session?.id||!Number.isFinite(session.expires))return;if(active&&id===session.id){if(check()){last=Math.max(last,session.expires-IDLE-offset);arm()}return}stop();id=session.id;active=true;offset=Number.isFinite(session.now)?session.now-now():0;reported=session.expires-IDLE-offset;last=reported;try{const saved=JSON.parse(storage?.getItem(key())||'null');if(saved?.closed)return expire('other-tab');if(Number.isFinite(saved?.at))last=Math.max(last,Math.min(now(),saved.at))}catch{}if(check()){arm();queueFlush()}}
  for(const name of ['pointerdown','keydown','touchstart','wheel','scroll','input','mousemove'])doc.addEventListener(name,activity,{capture:true,passive:true});
  doc.addEventListener('visibilitychange',()=>{if(active&&check())arm()});host.addEventListener('pageshow',()=>{if(active&&check())arm()});
  host.addEventListener('storage',event=>{if(!active||event.key!==key()||!check())return;try{const value=JSON.parse(event.newValue);if(value?.closed)return expire('other-tab');if(Number.isFinite(value?.at)){last=Math.max(last,Math.min(now(),value.at));arm()}}catch{}});
  return {start,stop,check};
 }
 globalThis.SessionIdle={create,IDLE};
})();
