export function configuration(env=process.env){
 const required=['APP_ORIGIN','DATABASE_URL','OIDC_ISSUER','OIDC_CLIENT_ID','OIDC_CLIENT_SECRET'];
 for(const key of required)if(!env[key]||env[key].includes('CHANGE_ME'))throw Error('Configure '+key);
 const origin=new URL(env.APP_ORIGIN),issuer=new URL(env.OIDC_ISSUER);
 const loopback=u=>['localhost','127.0.0.1','[::1]'].includes(u.hostname),development=env.NODE_ENV!=='production'&&env.ALLOW_HTTP_LOOPBACK==='true';
 for(const url of [origin,issuer])if(url.protocol!=='https:'&&!(development&&url.protocol==='http:'&&loopback(url)))throw Error('HTTPS is required for application and OIDC issuer');
 if(origin.origin!==env.APP_ORIGIN||origin.username||origin.password||issuer.username||issuer.password||issuer.search||issuer.hash)throw Error('Invalid application origin or issuer');
 const port=Number(env.PORT||3000);if(!Number.isInteger(port)||port<1||port>65535)throw Error('Invalid PORT');
 return {origin:origin.origin,issuer:issuer.href.replace(/\/$/,''),clientId:env.OIDC_CLIENT_ID,clientSecret:env.OIDC_CLIENT_SECRET,port,host:env.HOST||'0.0.0.0',secure:origin.protocol==='https:',allowLoopback:development,sessionMaxMs:8*60*60*1000};
}
