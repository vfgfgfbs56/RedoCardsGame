const enc=new TextEncoder();
export const randomId=(bytes=18)=>{const data=crypto.getRandomValues(new Uint8Array(bytes));return btoa(String.fromCharCode(...data)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','')};
const encode=s=>btoa(String.fromCharCode(...enc.encode(s))).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
const decode=s=>new TextDecoder().decode(Uint8Array.from(atob(s.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0)));
export async function hmac(key,message){const k=await crypto.subtle.importKey('raw',typeof key==='string'?enc.encode(key):key,{name:'HMAC',hash:'SHA-256'},false,['sign']);return new Uint8Array(await crypto.subtle.sign('HMAC',k,enc.encode(message)))}
const hex=a=>[...a].map(v=>v.toString(16).padStart(2,'0')).join('');
export function equal(a,b){if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;let n=0;for(let i=0;i<a.length;i++)n|=a.charCodeAt(i)^b.charCodeAt(i);return n===0}
export async function telegramUser(initData,botToken,now=Date.now()){
 if(typeof initData!=='string'||initData.length>16384)throw Error('Откройте игру из Telegram');
 const p=new URLSearchParams(initData),hash=p.get('hash');if(!hash||!/^[a-f0-9]{64}$/.test(hash)||[...p.keys()].some((key,i,keys)=>keys.indexOf(key)!==i))throw Error('Некорректные данные Telegram');
 p.delete('hash');const check=[...p.entries()].sort(([a],[b])=>a.localeCompare(b,'en')).map(([k,v])=>`${k}=${v}`).join('\n');
 const secret=await hmac('WebAppData',botToken),signature=hex(await hmac(secret,check));if(!equal(hash,signature))throw Error('Не удалось подтвердить вход в Telegram');
 const date=Number(p.get('auth_date'));if(!Number.isFinite(date)||date*1000>now+30000||now-date*1000>3600000)throw Error('Сессия Telegram устарела. Откройте мини-приложение заново');
 const user=JSON.parse(p.get('user')||'null');if(!user||!Number.isSafeInteger(user.id)||user.id<=0||typeof user.first_name!=='string')throw Error('Нет пользователя Telegram');
 return{id:String(user.id),name:user.first_name.slice(0,80),startParam:p.get('start_param')||''};
}
export async function sessionToken(user,secret,now=Date.now()){const body=encode(JSON.stringify({id:user.id,name:user.name,exp:now+6*3600000}));return body+'.'+hex(await hmac(secret,body))}
export async function readSession(token,secret,now=Date.now()){if(typeof token!=='string'||token.length>2048)throw Error('Нужен вход');const parts=token.split('.');if(parts.length!==2||!equal(parts[1],hex(await hmac(secret,parts[0]))))throw Error('Нужен вход');const data=JSON.parse(decode(parts[0]));if(!/^\d{1,18}$/.test(data.id)||data.exp<=now)throw Error('Сессия истекла');return{id:data.id,name:String(data.name).slice(0,80)}}
