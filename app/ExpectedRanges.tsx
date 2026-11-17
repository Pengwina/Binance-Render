'use client';
import {useEffect,useState} from 'react';
import type {Asset} from '../lib/assets';
import {LOOKBACKS,historicalVolatility,blendedVolatility,priceRange,type History} from '../lib/volatility';

type Anchor={spot:number;iv:number|null;expiry:number;captured:number};
type Props={asset:Asset;spot:number;iv:number|null;expiry:number|undefined;now:number;opening:Anchor|null;stale:boolean};
const price=(n:number)=>'$'+n.toLocaleString('en-US',{maximumFractionDigits:n<10?4:n<1000?2:0});
const percent=(n:number|null)=>n===null?'—':(n*100).toFixed(1)+'%';
const stamp=(n:number)=>new Date(n).toISOString().replace('T',' ').slice(0,16)+' UTC';

export default function ExpectedRanges({asset,spot,iv,expiry,now,opening,stale}:Props){
 const [history,setHistory]=useState<History|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const [days,setDays]=useState(30),[weight,setWeight]=useState(.75),[reference,setReference]=useState('live');
 const [retry,setRetry]=useState(0);
 useEffect(()=>{
  let stopped=false;let controller:AbortController|null=null;
  const load=async()=>{
   controller?.abort();controller=new AbortController();setBusy(true);
   const timeout=setTimeout(()=>controller?.abort(),15000);
   try{
    const response=await fetch('/api/volatility?asset='+asset,{signal:controller.signal});
    const data=await response.json();
    if(!response.ok||data.error)throw Error(data.error||'History unavailable');
    if(data.asset!==asset||!Array.isArray(data.closes))throw Error('Invalid history response');
    if(!stopped){setHistory(data);setError('')}
   }catch(e){if(!stopped)setError(e instanceof Error?e.message:'History unavailable')}
   finally{clearTimeout(timeout);if(!stopped)setBusy(false)}
  };
  void load();
  const interval=setInterval(()=>{if(document.visibilityState==='visible')void load()},900000);
  return()=>{stopped=true;controller?.abort();clearInterval(interval)};
 },[asset,retry]);
 const anchor=reference==='rollover'?opening:expiry?{spot,iv,expiry,captured:now}:null;
 const hv=history&&anchor?historicalVolatility(history.closes,days,anchor.captured):null;
 const blended=blendedVolatility(anchor?.iv??null,hv,weight);
 const rows=[{name:'Options-implied',vol:anchor?.iv??null},{name:'Historical only',vol:hv},{name:'Blended estimate',vol:blended}];
 const exportRanges=()=>{
  if(!anchor)return;
  const data={asset,reference,anchor,lookbackDays:days,ivVarianceWeight:weight,historySource:history?.source,lastClose:history?.closes.filter(c=>c.time<=anchor.captured).at(-1)?.time,annualizationDays:365.25,method:'Sample standard deviation of daily log returns; blend variances; symmetric 1-sigma expiry ranges',ranges:rows.map(row=>({...row,...priceRange(anchor.spot,row.vol,anchor.expiry,anchor.captured)}))};
  const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download=asset.toLowerCase()+'-volatility-ranges.json';a.click();URL.revokeObjectURL(url);
 };
 return <section className="panel expected-ranges" aria-label="Volatility-based price ranges">
  <div className="panel-head"><div><h2>Volatility-based price ranges</h2><p>Compare options pricing with realised price movement · same reference and expiry for every row.</p></div><button onClick={exportRanges} disabled={!anchor}>↓ Export ranges</button></div>
  <div className="filters range-controls">
   <label>Reference <select aria-label="Range reference" value={reference} onChange={e=>setReference(e.target.value)}><option value="live">Live spot & IV</option><option value="rollover" disabled={!opening}>Saved daily rollover</option></select></label>
   <label>Historical lookback <select aria-label="Historical volatility lookback" value={days} onChange={e=>setDays(Number(e.target.value))}>{LOOKBACKS.map(d=><option key={d} value={d}>{d} days</option>)}</select></label>
   <label>Blend <select aria-label="Volatility blend weight" value={weight} onChange={e=>setWeight(Number(e.target.value))}><option value="0.75">75% IV / 25% historical</option><option value="0.5">50% IV / 50% historical</option><option value="0.25">25% IV / 75% historical</option></select></label>
   <button onClick={()=>setRetry(n=>n+1)} disabled={busy}>{busy?'Loading history…':'↻ Refresh history'}</button>
  </div>
  <div className="chart-footer">{anchor?`Reference ${price(anchor.spot)} · ${stamp(anchor.captured)} · expires ${stamp(anchor.expiry)}`:'Waiting for options data.'}</div>
  {reference==='live'&&stale&&<p className="range-note">Options data includes a saved or stale feed. These are snapshot ranges, not current market levels.</p>}
  {reference==='rollover'&&<p className="range-note">Spot, IV and remaining time are fixed at your saved capture. Historical volatility uses only daily closes ending at or before that capture. Changing lookback or blend recalculates the range.</p>}
  <div className="table-scroll"><table><thead><tr><th>Range model</th><th>Annual volatility</th><th>Lower bound</th><th>Upper bound</th><th>± Move</th></tr></thead><tbody>{rows.map(row=>{
   const range=anchor?priceRange(anchor.spot,row.vol,anchor.expiry,anchor.captured):null;
   return <tr key={row.name}><td>{row.name}</td><td>{percent(row.vol)}</td><td>{range?price(range.lower):'—'}</td><td>{range?price(range.upper):'—'}</td><td>{range?price(range.move):'—'}</td></tr>;
  })}</tbody></table></div>
  {error&&<p className="range-note">Historical feed: {error}. {history?'Showing the last available history where the selected window is still valid.':'IV-only remains available; historical and blended estimates need price history.'}</p>}
  {history&&<div className="chart-footer">{history.source} · last included close {anchor&&history.closes.filter(c=>c.time<=anchor.captured).length?stamp(history.closes.filter(c=>c.time<=anchor.captured).at(-1)!.time):'—'} · fetched {stamp(history.fetched)}{hv===null&&anchor?' · Selected historical window unavailable or incomplete.':''}</div>}
  <details className="range-method"><summary>How these ranges are calculated</summary><p>Historical volatility is the sample standard deviation of the last {days} daily log returns, annualised with √365.25. It requires {days+1} consecutive completed UTC daily closes. The unfinished day is excluded. Prices are from one spot market, not a consolidated historical index; USDT is treated as USD.</p><p>Blended variance = {Math.round(weight*100)}% × IV² + {Math.round((1-weight)*100)}% × historical volatility². Range = reference spot ± spot × volatility × √(time to expiry / 365.25 days), with the lower bound floored at zero. The selected blend is an experimental weighting, not a statistically calibrated forecast.</p><p>These are approximate 1σ expiry ranges, not hard walls, intraday limits or guaranteed support/resistance. Adding history has not been shown to improve accuracy. No historical estimate is substituted when the requested window is missing.</p></details>
 </section>;
}
