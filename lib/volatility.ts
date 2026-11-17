export const DAY = 86400000;
export const LOOKBACKS = [7, 30, 90] as const;
export type Close = {time:number; price:number};
export type History = {asset:string; fetched:number; source:string; closes:Close[]};

// Candle timestamps mark the start; store the close boundary and omit unfinished days.
export function completedCloses(rows:unknown[], now:number):Close[] {
 const closes=new Map<number,number>();
 for(const row of rows){
  if(!Array.isArray(row))continue;
  const start=Number(row[0]),price=Number(row[4]);
  if(Number.isFinite(start)&&start%DAY===0&&start+DAY<=now&&Number.isFinite(price)&&price>0)closes.set(start+DAY,price);
 }
 return [...closes].map(([time,price])=>({time,price})).sort((a,b)=>a.time-b.time);
}

export function historicalVolatility(closes:Close[], days:number, asOf:number):number|null {
 if(!Number.isInteger(days)||days<2)return null;
 const rows=closes.filter(c=>c.time<=asOf).slice(-days-1);
 // No shortened windows, gaps or old history presented as a current estimate.
 if(rows.length!==days+1||asOf-rows.at(-1)!.time>=DAY)return null;
 const returns:number[]=[];
 for(let i=1;i<rows.length;i++){
  if(rows[i].time-rows[i-1].time!==DAY||rows[i].price<=0||rows[i-1].price<=0)return null;
  const r=Math.log(rows[i].price/rows[i-1].price);
  if(!Number.isFinite(r))return null;
  returns.push(r);
 }
 const mean=returns.reduce((a,b)=>a+b,0)/days;
 return Math.sqrt(returns.reduce((a,b)=>a+(b-mean)**2,0)/(days-1)*365.25);
}

export function blendedVolatility(iv:number|null,hv:number|null,ivWeight:number):number|null {
 if(iv===null||hv===null||!Number.isFinite(iv)||!Number.isFinite(hv)||iv<0||hv<0||ivWeight<0||ivWeight>1)return null;
 return Math.sqrt(ivWeight*iv**2+(1-ivWeight)*hv**2);
}

export function priceRange(spot:number,vol:number|null,expiry:number,asOf:number) {
 if(!(spot>0)||vol===null||!Number.isFinite(vol)||vol<0||expiry<=asOf)return null;
 const move=spot*vol*Math.sqrt((expiry-asOf)/(365.25*DAY));
 return {lower:Math.max(0,spot-move),upper:spot+move,move};
}
