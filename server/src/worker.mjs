import{telegramUser,sessionToken,readSession,randomId}from'./auth.mjs';
import{telegramApp}from'./telegram-app.mjs';
export{Room}from'./room.mjs';
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json;charset=utf-8','cache-control':'no-store'}});
export default{async fetch(request,env){
 const url=new URL(request.url),origin=request.headers.get('Origin'),allowed=env.FRONTEND_ORIGIN;
 const cors=response=>{const headers=new Headers(response.headers);if(origin===allowed){headers.set('Access-Control-Allow-Origin',origin);headers.set('Vary','Origin');headers.set('Access-Control-Allow-Headers','Authorization, Content-Type');headers.set('Access-Control-Allow-Methods','GET, POST, OPTIONS')}return new Response(response.body,{status:response.status,headers})};
 if(request.method==='OPTIONS')return cors(new Response(null,{status:204}));
 if(url.pathname==='/health'&&request.method==='GET')return json({service:'Redo Cards',ok:true});
 if(!allowed||origin!==allowed)return json({error:'Недопустимый источник запроса'},403);
 try{
  if(!env.BOT_TOKEN||!env.SESSION_SECRET)throw Error('Сервер ещё не настроен');
  const match=url.pathname.match(/^\/api\/rooms\/([A-Za-z0-9_-]{24})\/(join|ticket|socket)$/);
  if(match?.[2]==='socket'){
   if(request.method!=='GET'||request.headers.get('Upgrade')?.toLowerCase()!=='websocket')return cors(json({error:'Нужен WebSocket'},400));
   const id=env.ROOMS.idFromName(match[1]);return env.ROOMS.get(id).fetch(new Request('https://room/socket?ticket='+encodeURIComponent(url.searchParams.get('ticket')||''),request));
  }
  if(request.method!=='POST')return cors(json({error:'Маршрут не найден'},404));
  if(Number(request.headers.get('Content-Length'))>20000)return cors(json({error:'Слишком большой запрос'},413));
  if(url.pathname==='/api/session'){
   const body=await request.json(),user=await telegramUser(body.initData,env.BOT_TOKEN);return cors(json({token:await sessionToken(user,env.SESSION_SECRET),user:{name:user.name},startParam:user.startParam}));
  }
  const user=await readSession((request.headers.get('Authorization')||'').replace(/^Bearer /,''),env.SESSION_SECRET),headers={'content-type':'application/json','x-redo-user':JSON.stringify(user)};
  if(url.pathname==='/api/rooms'){
   const quota=await env.ROOMS.get(env.ROOMS.idFromName('quota:'+user.id)).fetch(new Request('https://room/quota',{method:'POST',headers}));if(!quota.ok)return cors(quota);
   const app=await telegramApp(env),code=randomId(18),room=env.ROOMS.get(env.ROOMS.idFromName(code));return cors(await room.fetch(new Request('https://room/create',{method:'POST',headers,body:JSON.stringify({code,launchUrl:app.launchUrl})})));
  }
  if(match&&['join','ticket'].includes(match[2]))return cors(await env.ROOMS.get(env.ROOMS.idFromName(match[1])).fetch(new Request('https://room/'+match[2],{method:'POST',headers})));
  return cors(json({error:'Маршрут не найден'},404));
 }catch(error){return cors(json({error:error.message||'Ошибка запроса'},401))}
}};
