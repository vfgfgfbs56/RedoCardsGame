let cached=null;
// Derive the bot's actual username from its token; a copied example username
// must never send an invitation to somebody else's bot.
export async function telegramApp(env,fetcher=fetch){
 if(cached&&cached.token===env.BOT_TOKEN&&cached.until>Date.now())return cached.value;
 const response=await fetcher('https://api.telegram.org/bot'+env.BOT_TOKEN+'/getMe');let data;try{data=await response.json()}catch{throw Error('Не удалось проверить Mini App в Telegram')}
 if(!response.ok||!data.ok||!data.result?.username)throw Error('Не удалось проверить Telegram-бота. Проверьте BOT_TOKEN');
 const username=data.result.username;
 if(!data.result.has_main_web_app)throw Error('В BotFather включите Main Mini App: /mybots → ваш бот → Bot Settings → Configure Mini App. Укажите адрес игры GitHub Pages');
 const value={username,launchUrl:'https://t.me/'+username};cached={token:env.BOT_TOKEN,until:Date.now()+300000,value};return value;
}
export function inviteUrl(launchUrl,code){const url=new URL(launchUrl);url.searchParams.set('startapp',code);url.searchParams.set('mode','compact');return url.href}
