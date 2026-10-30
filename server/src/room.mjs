import{DurakRules}from'./rules.mjs';
import{randomId}from'./auth.mjs';
import{inviteUrl}from'./telegram-app.mjs';
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json;charset=utf-8','cache-control':'no-store'}}),clone=v=>JSON.parse(JSON.stringify(v));
const EMOJIS=['❤️','😂','😎','👍','🤝','👏','😈','😤','😡','👎','💩','🤬','😭','😱','🙄','💔','💀','🤡'];
export class Room{
 constructor(ctx,env){this.ctx=ctx;this.env=env;this.data=null;this.rules=new DurakRules();ctx.blockConcurrencyWhile(async()=>{this.data=await ctx.storage.get('room')||null;if(this.data?.game)Object.assign(this.rules,this.data.game)})}
 async fetch(request){return this.ctx.blockConcurrencyWhile(async()=>{try{
  const path=new URL(request.url).pathname,user=JSON.parse(request.headers.get('x-redo-user')||'null'),now=Date.now();
  if(path==='/quota'){let times=await this.ctx.storage.get('quota')||[];times=times.filter(t=>now-t<60000);if(times.length>=6)return json({error:'Слишком много приглашений. Попробуйте через минуту'},429);times.push(now);await this.ctx.storage.put('quota',times);await this.ctx.storage.setAlarm(now+65000);return json({ok:true})}
  if(path==='/create'){
   if(this.data)return json({error:'Комната уже существует'},409);const{code,launchUrl}=await request.json();this.data={code,launchUrl:launchUrl||'https://t.me/'+this.env.BOT_USERNAME,createdAt:now,expiresAt:now+180000,players:[{...user,ready:false}],revision:0,gameId:0,clock:null,animation:null,emojiNext:[0,0],emojiCount:[0,0],handled:[[],[]],tickets:{},lastTouch:now};await this.save();await this.schedule();return json(this.lobby(0));
  }
  if(!this.data)return json({error:'Приглашение не найдено'},404);
  await this.advance();
  if(path==='/join'){
   let seat=this.seat(user?.id);if(seat<0){if(this.rules.started||now>=this.data.expiresAt)return json({error:'Ссылка истекла. Попросите новое приглашение'},410);if(this.data.players.length>=2)return json({error:'В комнате уже два игрока'},409);this.data.players.push({...user,ready:false});seat=1;await this.save();this.publish()}
   return json(this.lobby(seat));
  }
  if(path==='/ticket'){
   const seat=this.seat(user?.id);if(seat<0)return json({error:'Вы не участник комнаты'},403);if(!this.rules.started&&now>=this.data.expiresAt)return json({error:'Срок приглашения истёк'},410);
   const ticket=randomId(24);for(const[k,v]of Object.entries(this.data.tickets))if(v.expiresAt<now||v.seat===seat)delete this.data.tickets[k];this.data.tickets[ticket]={seat,expiresAt:now+30000};await this.save();return json({ticket});
  }
  if(path==='/socket'){
   const ticket=new URL(request.url).searchParams.get('ticket'),entry=this.data.tickets[ticket];delete this.data.tickets[ticket];await this.save();if(!entry||entry.expiresAt<now)return json({error:'Билет подключения истёк'},401);
   const pair=new WebSocketPair(),client=pair[0],server=pair[1];for(const ws of this.ctx.getWebSockets())if(ws.deserializeAttachment()?.seat===entry.seat)ws.close(4001,'Подключено другое устройство');this.ctx.acceptWebSocket(server);server.serializeAttachment({seat:entry.seat,tokens:16,last:now});server.send(JSON.stringify(this.message(entry.seat,'snapshot')));this.publish();return new Response(null,{status:101,webSocket:client});
  }
  return json({error:'Не найдено'},404);
 }catch(e){return json({error:e.message||'Ошибка комнаты'},400)}})}
 seat(id){return this.data.players.findIndex(p=>p.id===id)}
 lobby(seat){return{code:this.data.code,seat,expiresAt:this.data.expiresAt,inviteUrl:inviteUrl(this.data.launchUrl||'https://t.me/'+this.env.BOT_USERNAME,this.data.code)}}
 view(seat){const s=this.rules.snapshot();return{started:s.started,trump:s.trump,hand:s.hands[seat],opponentCount:s.hands[1-seat].length,stockCount:s.stock.length,table:s.table,discardCount:s.discard.length,attacker:s.attacker,limit:s.limit,pending:s.pending,result:this.data.animation?null:s.result}}
 message(seat,type='state',extra={}){return{type,serverNow:Date.now(),revision:this.data.revision,gameId:this.data.gameId,...this.lobby(seat),players:this.data.players.map((p,i)=>({name:p.name,ready:p.ready,connected:this.ctx.getWebSockets().some(w=>w.deserializeAttachment()?.seat===i)})),view:this.view(seat),busy:!!this.data.animation,clock:this.data.clock,...extra}}
 publish(type='state',extra={}){for(const ws of this.ctx.getWebSockets()){try{const seat=ws.deserializeAttachment().seat;ws.send(JSON.stringify(this.message(seat,type,typeof extra==='function'?extra(seat):extra)))}catch{}}}
 async save(){if(!this.data)return;this.data.game=clone(this.rules);await this.ctx.storage.put('room',this.data)}
 async schedule(){if(!this.data)return;const now=Date.now(),at=!this.rules.started?this.data.expiresAt:this.data.animation?.until||(this.rules.result?this.data.lastTouch+3600000:this.data.clock?.deadline||now+60000);await this.ctx.storage.setAlarm(Math.max(now+1,at))}
 pause(){const c=this.data.clock;if(c?.deadline){c.left=Math.max(0,c.deadline-Date.now());c.deadline=null}}
 phase(){if(!this.rules.started||this.rules.result)return null;const r=this.rules,s=r.attacker+':'+r.table.map(p=>p.id+'='+p.cover).join(',');if(r.pending)return{key:'ack:'+r.pending.type+':'+s,seat:1-r.pending.seat,kind:'ack',duration:12000};if(!r.table.length)return{key:'start:'+s,seat:r.attacker,kind:'start',duration:21000};if(!r.allCovered)return{key:'defend:'+r.attacker+':'+r.table.filter(p=>p.cover).map(p=>p.id+'='+p.cover).join(','),seat:1-r.attacker,kind:'defend',duration:26000};return{key:'continue:'+s,seat:r.attacker,kind:'continue',duration:12000}}
 resume(){const next=this.phase(),old=this.data.clock;if(!next){this.data.clock=null;return}if(!old||old.key!==next.key){this.data.clock={...next,deadline:Date.now()+next.duration,left:next.duration};if(next.kind==='start')this.data.notice=(this.data.notice||0)+1}else if(old.deadline===null)old.deadline=Date.now()+old.left}
 animate(kind,until){this.pause();this.data.animation={kind,until};this.data.revision++}
 shuffled(){const deck=['hearts','diamonds','clubs','spades'].flatMap(s=>['6','7','8','9','10','J','Q','K','A'].map(r=>'card-'+r+'-'+s));const rnd=n=>{const a=new Uint32Array(1),limit=Math.floor(4294967296/n)*n;do{crypto.getRandomValues(a)}while(a[0]>=limit);return a[0]%n};for(let i=35;i>0;i--){const j=rnd(i+1);[deck[i],deck[j]]=[deck[j],deck[i]]}return{deck,trump:['hearts','diamonds','clubs','spades'][rnd(4)],first:rnd(2)}}
 async begin(){const{deck,trump,first}=this.shuffled();this.rules.start(deck,trump,first);this.data.gameId++;this.data.clock=null;this.data.emojiNext=[0,0];this.data.emojiCount=[0,0];const at=Date.now()+220;this.animate('deal',at+5500);await this.save();await this.schedule();this.publish('begin',{at})}
 async play(seat,card,target){if(this.data.animation||this.rules.reason(seat,card,target))throw Error(this.rules.reason(seat,card,target)||'Дождитесь анимации');const reshow=this.rules.pending?.type==='take',move=this.rules.play(seat,card,target),at=Date.now()+180;move.actionId='net-'+this.data.gameId+'-'+(this.data.revision+1);move.startAt=at+(reshow?820:0);this.animate('play',move.startAt+(reshow?2450:1100));await this.save();await this.schedule();this.publish('play',{move,at,reshow})}
 async signal(seat,type){if(this.data.animation||!this.rules.canSignal(seat,type))throw Error('Это действие сейчас недоступно');this.rules.signal(seat,type);const at=Date.now()+150;
  if(type==='ok'){const take=this.rules.pending.type==='take';this.animate('resolve',at+2500+(take?2050:0))}else this.animate('sign',at+1400);
  await this.save();await this.schedule();this.publish('signal',{actor:seat,signal:type,at});
 }
 async resolve(){const resolution=this.rules.resolve();if(!resolution)throw Error('Ошибка завершения боя');const at=Date.now()+180;this.animate('refill',at+1300);await this.save();await this.schedule();this.publish('refill',seat=>({at,attacker:resolution.attacker,nextTurn:resolution.nextTurn,drawn:resolution.drawn[seat],otherDrawn:resolution.drawn[1-seat].length}));}
 async automaticTake(seat){this.rules.signal(seat,'take');this.rules.signal(1-seat,'ok');const at=Date.now()+180;this.animate('resolve',at+2100);await this.save();await this.schedule();this.publish('take',{actor:seat,at,actionId:'auto-'+this.data.gameId+'-'+this.data.revision})}
 async advance(){if(!this.data)return;const now=Date.now();if(!this.rules.started){if(now>=this.data.expiresAt){this.publish('expired');return}return}
  if(this.rules.result&&!this.data.animation){if(now-this.data.lastTouch>=3600000){for(const ws of this.ctx.getWebSockets())ws.close(1000,'Комната закрыта');await this.ctx.storage.deleteAll();this.data=null}return}
  const anim=this.data.animation;if(anim){if(now<anim.until)return;this.data.animation=null;if(anim.kind==='resolve'){await this.resolve();return}this.resume();await this.save();await this.schedule();this.publish('state',{notice:this.data.notice});return}
  const c=this.data.clock;if(!c?.deadline||now<c.deadline)return;
  if(c.kind==='start'){if(!c.waiting){c.waiting=true;c.deadline+=4000;c.left=Math.max(0,c.deadline-now);await this.save();await this.schedule();this.publish();if(c.deadline<=now)await this.advance();return}this.rules.forfeit(c.seat);this.data.clock=null;this.data.lastTouch=now;await this.save();await this.schedule();this.publish();return}
  if(c.kind==='defend'){await this.automaticTake(c.seat);return}await this.signal(c.seat,c.kind==='continue'?'bita':'ok');
 }
 async webSocketMessage(ws,message){return this.ctx.blockConcurrencyWhile(async()=>{try{
  if(typeof message!=='string'||message.length>2048)throw Error('Некорректное сообщение');const a=ws.deserializeAttachment(),now=Date.now();a.tokens=Math.min(16,a.tokens+(now-a.last)/300);a.last=now;if(a.tokens<1)throw Error('Слишком частые действия');a.tokens--;ws.serializeAttachment(a);
  if(!this.data)throw Error('Комната закрыта');await this.advance();if(!this.data)throw Error('Комната закрыта');const m=JSON.parse(message),seat=a.seat;
  if(m.type==='ping'){ws.send(JSON.stringify({type:'pong',serverNow:now,echo:m.at}));return}
  if(typeof m.id!=='string'||m.id.length>80)throw Error('Нет номера действия');if(this.data.handled[seat].includes(m.id)){ws.send(JSON.stringify(this.message(seat)));return}this.data.handled[seat].push(m.id);this.data.handled[seat]=this.data.handled[seat].slice(-80);this.data.lastTouch=now;
  if(!this.rules.started&&now>=this.data.expiresAt)throw Error('Приглашение истекло');
  if(m.type==='ready'){
   if(this.rules.started&&!this.rules.result)throw Error('Игра уже идёт');if(this.rules.result){this.data.players.forEach(p=>p.ready=false);this.rules=new DurakRules();this.data.animation=null;this.data.clock=null;this.data.expiresAt=now+180000}
   this.data.players[seat].ready=true;if(this.data.players.length===2&&this.data.players.every(p=>p.ready)){await this.begin();return}await this.save();await this.schedule();this.publish();return;
  }
  if(m.type==='play')return await this.play(seat,m.card,m.target);
  if(m.type==='signal')return await this.signal(seat,m.signal);
  if(m.type==='emoji'){
   if(!this.rules.started||this.data.animation?.kind==='deal'||now<this.data.emojiNext[seat]||!EMOJIS.includes(m.symbol))throw Error('Эмодзи пока недоступно');const side=this.data.emojiCount[seat]++%2?'left':'right';this.data.emojiNext[seat]=now+3000;await this.save();this.publish('emoji',{reaction:{type:'emoji:send',id:'emoji-'+randomId(8),actor:seat,symbol:m.symbol,side,startAt:now,duration:6000},nextAt:this.data.emojiNext});return;
  }
  throw Error('Неизвестное действие');
 }catch(e){try{ws.send(JSON.stringify({type:'error',error:e.message,serverNow:Date.now()}))}catch{}}})}
 async webSocketClose(){if(this.data)this.publish()}
 async webSocketError(ws){try{ws.close(1011,'Соединение прервано')}catch{}}
 async alarm(){return this.ctx.blockConcurrencyWhile(async()=>{if(!this.data){await this.ctx.storage.deleteAll();return}if(!this.rules.started&&Date.now()>=this.data.expiresAt){this.publish('expired');for(const ws of this.ctx.getWebSockets())ws.close(4004,'Приглашение истекло');await this.ctx.storage.deleteAll();this.data=null;return}await this.advance();if(this.data)await this.schedule()})}
}
