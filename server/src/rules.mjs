// One authoritative, DOM-independent state. Seats are physical players, never views.
export class DurakRules {
 constructor(){this.started=false;this.hands=[[],[]];this.stock=[];this.table=[];this.discard=[];this.pending=null;this.result=null;this.sequence=0}
 static rank(id){return ['6','7','8','9','10','J','Q','K','A'].indexOf(id.split('-')[1])}
 static suit(id){return id.split('-')[2]}
 static beats(card,target,trump){return this.suit(card)===this.suit(target)?this.rank(card)>this.rank(target):this.suit(card)===trump&&this.suit(target)!==trump}
 start(deck,trump,randomSeat=0){
  const suits=['hearts','diamonds','clubs','spades'],ranks=['6','7','8','9','10','J','Q','K','A'];
  if(deck.length!==36||new Set(deck).size!==36||deck.some(c=>typeof c!=='string'||!/^card-(6|7|8|9|10|J|Q|K|A)-(hearts|diamonds|clubs|spades)$/.test(c))||!suits.includes(trump))throw Error('Некорректная колода');
  this.started=true;this.trump=trump;this.hands=[[],[]];deck.slice(0,12).forEach((c,i)=>this.hands[i%2].push(c));this.stock=deck.slice(12);this.table=[];this.discard=[];this.pending=null;this.result=null;this.sequence=0;
  const low=this.hands.map(h=>Math.min(...h.filter(c=>DurakRules.suit(c)===trump).map(DurakRules.rank)));
  this.attacker=low[0]===Infinity&&low[1]===Infinity?randomSeat:low[0]<low[1]?0:1;
  this.limit=Math.min(6,this.hands[1-this.attacker].length);return this;
 }
 get allCovered(){return this.table.length>0&&this.table.every(p=>p.cover)}
 reason(seat,card,targetId){
  if(!this.started)return 'Сначала начните партию';if(this.result)return 'Партия завершена';if(!this.hands[seat]?.includes(card))return 'Этой карты нет в руке';
  if(this.pending?.confirmedBy!==undefined)return 'Действие уже подтверждено';
  if(this.pending&&this.pending.type!=='take')return 'Сначала подтвердите биту';
  if(seat===this.attacker){
   if(this.table.length>=this.limit)return 'Лимит атаки: '+this.limit+' карт';
   if(this.table.length&&!this.table.some(p=>[p.card,p.cover].filter(Boolean).some(c=>DurakRules.rank(c)===DurakRules.rank(card))))return 'Подкинуть можно только достоинство, которое уже есть на столе';
   return null;
  }
  if(this.pending)return 'Вы уже объявили «ЗАБЕРУ»';
  const target=this.table.find(p=>p.id===targetId);if(!target)return 'Положите карту на ту, которую хотите отбить';if(target.cover)return 'Эта карта уже отбита';
  if(!DurakRules.beats(card,target.card,this.trump))return 'Нужна старшая карта той же масти или козырь';return null;
 }
 play(seat,card,targetId){const reason=this.reason(seat,card,targetId);if(reason)return{ok:false,reason};this.hands[seat].splice(this.hands[seat].indexOf(card),1);let move;
  if(seat===this.attacker){const pair={id:'table-game-'+(++this.sequence),card,cover:null};this.table.push(pair);move={type:'attack',seat,card,id:pair.id}}
  else{const pair=this.table.find(p=>p.id===targetId);pair.cover=card;move={type:'defense',seat,card,id:pair.id}}
  return{ok:true,...move,table:this.table.map(p=>({...p}))};
 }
 canSignal(seat,type){if(![0,1].includes(seat)||!this.started||this.result)return false;if(this.pending)return type==='ok'&&seat!==this.pending.seat&&this.pending.confirmedBy===undefined;
  return type==='take'?seat!==this.attacker&&this.table.length>0:type==='bita'?seat===this.attacker&&this.allCovered:false;
 }
 signal(seat,type){if(!this.canSignal(seat,type))return false;if(type==='ok'){this.pending.confirmedBy=seat;return{...this.pending}}this.pending={seat,type};return{...this.pending}}
 resolve(){if(!this.pending||this.pending.confirmedBy===undefined)return false;const oldAttacker=this.attacker,defender=1-oldAttacker,type=this.pending.type,cards=this.table.flatMap(p=>[p.card,p.cover].filter(Boolean));
  if(type==='take')this.hands[defender].push(...cards);else{this.discard.push(...cards);this.attacker=defender}
  this.table=[];this.pending=null;const drawn=[[],[]];for(const seat of [oldAttacker,defender])while(this.hands[seat].length<6&&this.stock.length){const card=this.stock.shift();this.hands[seat].push(card);drawn[seat].push(card)}
  this.limit=Math.min(6,this.hands[1-this.attacker].length);
  if(!this.stock.length){const empty=this.hands.map(h=>!h.length);if(empty[0]&&empty[1])this.result={draw:true};else if(empty[0]||empty[1])this.result={winner:empty[0]?0:1}}
  return{type,attacker:oldAttacker,nextTurn:this.attacker,drawn,result:this.result};
 }
 forfeit(seat,reason='turn-timeout'){if(!this.started||this.result||![0,1].includes(seat))return false;this.pending=null;this.result={winner:1-seat,loser:seat,reason};return{...this.result}}
 snapshot(){return JSON.parse(JSON.stringify({started:this.started,trump:this.trump,hands:this.hands,stock:this.stock,table:this.table,discard:this.discard,attacker:this.attacker,limit:this.limit,pending:this.pending,result:this.result}))}
}
