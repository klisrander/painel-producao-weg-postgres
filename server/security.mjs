import {randomBytes} from 'node:crypto';
export async function secureResponse(request,response){
 const headers=new Headers(response.headers),html=(headers.get('content-type')||'').includes('text/html');
 headers.set('X-Content-Type-Options','nosniff');headers.set('Referrer-Policy','strict-origin-when-cross-origin');headers.set('Permissions-Policy','camera=(), microphone=(), geolocation=(), payment=(), usb=()');
 if(new URL(request.url).protocol==='https:')headers.set('Strict-Transport-Security','max-age=31536000');
 if(html){const nonce=randomBytes(18).toString('base64');headers.set('Cache-Control','no-store');headers.set('Content-Security-Policy',`default-src 'self'; base-uri 'self'; object-src 'none'; connect-src 'self'; script-src 'self' 'nonce-${nonce}'; script-src-attr 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; frame-ancestors 'self'; form-action 'self'`);headers.delete('Content-Length');return new Response((await response.text()).replace(/<script\b/gi,`<script nonce="${nonce}"`),{status:response.status,headers})}
 return new Response(response.body,{status:response.status,headers});
}
