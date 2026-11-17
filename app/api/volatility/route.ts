import {isAsset,type Asset} from '../../../lib/assets';
import {completedCloses,historicalVolatility,type History} from '../../../lib/volatility';

const cache=new Map<Asset,History>();
const pending=new Map<Asset,Promise<History>>();
async function loadHistory(asset:Asset):Promise<History>{
 const now=Date.now(),old=cache.get(asset);
 if(old&&now-old.fetched<900000&&historicalVolatility(old.closes,30,now)!==null)return old;
 if(pending.has(asset))return pending.get(asset)!;
 const request=(async()=>{
  const response=await fetch(`https://api.bybit.com/v5/market/kline?category=spot&symbol=${asset}USDT&interval=D&limit=100`,{signal:AbortSignal.timeout(12000),cache:'no-store'});
  if(!response.ok)throw Error(`Historical prices returned HTTP ${response.status}`);
  const body=await response.json();
  if(body.retCode!==0||!Array.isArray(body.result?.list))throw Error('Historical prices unavailable');
  const fetched=Date.now(),closes=completedCloses(body.result.list,fetched);
  if(historicalVolatility(closes,7,fetched)===null)throw Error('Not enough recent, consecutive daily closes');
  const history={asset,fetched,source:`Bybit ${asset}/USDT spot · completed UTC daily closes`,closes};
  cache.set(asset,history);return history;
 })().finally(()=>pending.delete(asset));
 pending.set(asset,request);return request;
}
export async function GET(req:Request){
 const asset=new URL(req.url).searchParams.get('asset')??'BTC';
 if(!isAsset(asset))return Response.json({error:'Unsupported asset'},{status:400});
 try{return Response.json(await loadHistory(asset),{headers:{'Cache-Control':'private, max-age=60'}})}
 catch(error){return Response.json({error:error instanceof Error?error.message:'History unavailable'},{status:502,headers:{'Cache-Control':'no-store'}})}
}
