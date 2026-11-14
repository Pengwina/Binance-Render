import {supportsVenue, type Asset} from './assets';
export type {Asset} from './assets';
export type Option = {venue:string;symbol:string;expiry:number;strike:number;type:'C'|'P';oi:number;volume:number;iv:number|null;bid:number|null;ask:number|null;forward:number;time:number};
export type Feed = {venue:string;time:number;spot:number;options:Option[];warnings:string[];dvol?:number|null;dvolTime?:number|null};
const num=(v:any):number|null=>v===null||v===undefined||v===''||!Number.isFinite(Number(v))?null:Number(v);
const val=(v:any)=>num(v)??0;
async function json(url:string){const r=await fetch(url,{signal:AbortSignal.timeout(18000),headers:{Accept:'application/json'}});if(!r.ok)throw Error(`Exchange returned HTTP ${r.status}`);const j=await r.json() as any;if(j.error||j.retCode|| (j.code!==undefined&&j.code!=='0'&&j.code!==0))throw Error(j.error?.message||j.retMsg||j.msg||'Exchange rejected request');return j;}
function map(a:any[],key:string){return new Map(a.map(x=>[x[key],x]));}
export function expiryFromSymbol(s:string){const p=s.split('-');const d=p[p[1]==='USD'?2:1];if(/^\d{6}$/.test(d))return Date.UTC(2000+Number(d.slice(0,2)),Number(d.slice(2,4))-1,Number(d.slice(4,6)),8);const m=d.match(/^(\d{1,2})([A-Z]{3})(\d{2})$/);if(!m)return NaN;return Date.UTC(2000+Number(m[3]),['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'].indexOf(m[2]),Number(m[1]),8);}
function clean(f:Feed){const before=f.options.length;f.options=f.options.filter(x=>x.expiry>Date.now()&&x.strike>0&&x.oi>=0&&Number.isFinite(x.oi)&&x.forward>0);if(before!==f.options.length)f.warnings.push(`${before-f.options.length} expired or invalid instruments excluded.`);if(!f.options.length)throw Error('No active options returned');return f;}
async function deribit(asset: Asset):Promise<Feed>{
 const root='https://www.deribit.com/api/v2/public/';
 const inverseAsset=asset==='BTC'||asset==='ETH';
 const [inverse,linear,index,dvol]=await Promise.all([
  inverseAsset?json(root+'get_book_summary_by_currency?currency='+asset+'&kind=option').catch(()=>null):null,
  json(root+'get_book_summary_by_currency?currency=USDC&kind=option').catch(()=>null),
  json(root+'get_index_price?index_name='+asset.toLowerCase()+(inverseAsset?'_usd':'_usdc')),
  inverseAsset?json(root+`get_volatility_index_data?currency=${asset}&start_timestamp=${Date.now()-3600000}&end_timestamp=${Date.now()}&resolution=60`).catch(()=>null):null
 ]);
 const spot=val(index.result.index_price);
 const rows=[...(inverse?.result??[]),...(linear?.result??[])].filter((x:any)=>x.base_currency===asset||x.instrument_name.startsWith(asset+'-')||x.instrument_name.startsWith(asset+'_USDC-'));
 const dv=dvol?.result?.data?.at(-1);
 const warnings=['Deribit summary open interest is published with an 8-hour delay; GEX uses that positioning snapshot.'];
 if(!linear)warnings.push(`USDC-settled ${asset} options unavailable.`);
 if(inverseAsset&&!inverse)warnings.push(`Inverse ${asset} options unavailable.`);
 return clean({venue:'Deribit',spot,time:Date.now(),dvol:dv?.[4]??null,dvolTime:dv?.[0]??null,warnings,options:rows.map((x:any)=>{
  const p=x.instrument_name.split('-');const fx=p[0]===asset?spot:1;
  return {venue:'Deribit',symbol:x.instrument_name,expiry:expiryFromSymbol(x.instrument_name),strike:Number(p[2].replace('d','.')),type:p[3],oi:val(x.open_interest),volume:val(x.volume),iv:num(x.mark_iv)===null?null:val(x.mark_iv)/100,bid:num(x.bid_price)===null?null:val(x.bid_price)*fx,ask:num(x.ask_price)===null?null:val(x.ask_price)*fx,forward:val(x.underlying_price)||spot,time:val(x.creation_timestamp)||Date.now()}
 })});
}
async function bybit(asset: Asset):Promise<Feed>{const j=await json('https://api.bybit.com/v5/market/tickers?category=option&baseCoin='+asset);const rows=j.result.list.filter((x:any)=>x.symbol.startsWith(asset+'-'));const spot=val(rows[0]?.indexPrice);return clean({venue:'Bybit',time:val(j.time)||Date.now(),spot,warnings:[],options:rows.map((x:any)=>{const p=x.symbol.split('-');return {venue:'Bybit',symbol:x.symbol,expiry:expiryFromSymbol(x.symbol),strike:Number(p[2].replace('d','.')),type:p[3],oi:val(x.openInterest),volume:val(x.volume24h),iv:num(x.markIv),bid:num(x.bid1Price),ask:num(x.ask1Price),forward:val(x.underlyingPrice)||spot,time:val(j.time)||Date.now()}})});}
async function okx(asset: Asset):Promise<Feed>{const root='https://www.okx.com/api/v5/';const [ins,greeks,oi,ticks,index]=await Promise.all([json(root+'public/instruments?instType=OPTION&uly='+asset+'-USD'),Promise.all((asset==='BTC'||asset==='ETH'?[asset+'-USD',asset+'-USD_UM']:[asset+'-USD_UM']).map(f=>json(root+'public/opt-summary?instFamily='+f))).then(a=>({data:a.flatMap(j=>j.data)})),json(root+'public/open-interest?instType=OPTION&uly='+asset+'-USD'),Promise.all((asset==='BTC'||asset==='ETH'?[asset+'-USD',asset+'-USD_UM']:[asset+'-USD_UM']).map(f=>json(root+'market/tickers?instType=OPTION&instFamily='+f))).then(a=>({data:a.flatMap(j=>j.data)})),json(root+'market/index-tickers?instId='+asset+'-USD')]);const gm=map(greeks.data,'instId'),om=map(oi.data,'instId'),tm=map(ticks.data,'instId');const spot=val(index.data[0].idxPx);let missing=0;const options=ins.data.filter((x:any)=>x.state==='live').flatMap((x:any)=>{const g=gm.get(x.instId),o=om.get(x.instId),t=tm.get(x.instId);if(!o){missing++;return [];}const size=val(x.ctVal)*val(x.ctMult);return [{venue:'OKX',symbol:x.instId,expiry:Number(x.expTime),strike:Number(x.stk),type:x.optType,oi:num(o.oiCcy)??val(o.oi)*size,volume:val(t?.vol24h)*size,iv:num(g?.markVol),bid:num(t?.bidPx)===null?null:val(t.bidPx)*(x.settleCcy===asset?spot:1),ask:num(t?.askPx)===null?null:val(t.askPx)*(x.settleCcy===asset?spot:1),forward:val(g?.fwdPx)||spot,time:val(o.ts)||Date.now()}]});return clean({venue:'OKX',time:Date.now(),spot,options,warnings:missing?[`${missing} instruments missing open interest were excluded.`]:[]});}
async function binance(asset: Asset):Promise<Feed>{
 const primary='https://eapi.binance.com/eapi/v1/';
 try {
  return await loadBinance(primary, asset);
 } catch (error) {
  if (!(error instanceof Error) || error.message !== 'Exchange returned HTTP 403') throw error;
  return loadBinance('https://www.binance.com/eapi/v1/', asset);
 }
}
async function loadBinance(root:string, asset:Asset):Promise<Feed>{const [info,marks,tickers,index]=await Promise.all([json(root+'exchangeInfo'),json(root+'mark'),json(root+'ticker'),json(root+'index?underlying='+asset+'USDT')]);const instruments=info.optionSymbols.filter((x:any)=>x.underlying===asset+'USDT'&&x.expiryDate>Date.now());const dates=[...new Set<string>(instruments.map((x:any)=>x.symbol.split('-')[1]))];const warnings:string[]=[];const interests:any[]=[];for(let i=0;i<dates.length;i+=4){const results=await Promise.allSettled(dates.slice(i,i+4).map(d=>json(root+'openInterest?underlyingAsset='+asset+'&expiration='+d)));results.forEach((r,k)=>{if(r.status==='fulfilled')interests.push(...r.value);else warnings.push(`Open interest unavailable for ${dates[i+k]}.`)});}
 const mm=map(marks,'symbol'),tm=map(tickers,'symbol'),om=map(interests,'symbol'),spot=val(index.indexPrice);let missing=0;
 const options=instruments.flatMap((x:any)=>{const m=mm.get(x.symbol),t=tm.get(x.symbol),o=om.get(x.symbol);if(!o){missing++;return [];}return [{venue:'Binance',symbol:x.symbol,expiry:Number(x.expiryDate),strike:Number(x.strikePrice),type:x.side==='CALL'?'C':'P',oi:val(o.sumOpenInterest)*val(x.unit),volume:val(t?.volume)*val(x.unit),iv:num(m?.markIV),bid:num(t?.bidPrice),ask:num(t?.askPrice),forward:spot*Math.exp(val(m?.riskFreeInterest)*(x.expiryDate-Date.now())/31557600000),time:val(o.timestamp)||Date.now()}]});if(missing)warnings.push(`${missing} instruments missing open interest excluded.`);warnings.push('Bid/ask from exchange ticker; quote freshness is not independently guaranteed.');return clean({venue:'Binance',time:Date.now(),spot,options,warnings});
}
const loaders:Record<string,(asset:Asset)=>Promise<Feed>>={Deribit:deribit,OKX:okx,Bybit:bybit,Binance:binance};
const cache=new Map<string,Feed>();const pending=new Map<string,Promise<Feed>>();
export async function loadFeed(venue:string, asset:Asset='BTC'){if(!Object.hasOwn(loaders,venue))throw Error('Unknown venue');if(!supportsVenue(asset,venue))throw Error(`${venue} does not list ${asset} options in this dashboard`);const key=asset+":"+venue;const old=cache.get(key);if(old&&Date.now()-old.time<60000)return old;if(pending.has(key))return pending.get(key)!;const p=loaders[venue](asset).then(f=>{cache.set(key,f);return f}).finally(()=>pending.delete(key));pending.set(key,p);return p;}
