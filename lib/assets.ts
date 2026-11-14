export const VENUES = ['Deribit', 'OKX', 'Bybit', 'Binance'] as const;
export type Venue = typeof VENUES[number];
export const ASSETS = {
 BTC: {name:'Bitcoin', bucket:2500, decimals:0, venues:VENUES},
 ETH: {name:'Ethereum', bucket:50, decimals:0, venues:VENUES},
 AVAX: {name:'Avalanche', bucket:1, decimals:2, venues:['Deribit']},
 HYPE: {name:'Hyperliquid', bucket:2, decimals:2, venues:['Deribit','OKX','Bybit']},
 SOL: {name:'Solana', bucket:5, decimals:2, venues:VENUES},
 TRX: {name:'TRON', bucket:0.01, decimals:4, venues:['Deribit']},
 XRP: {name:'XRP', bucket:0.1, decimals:3, venues:['Deribit','Bybit','Binance']},
} as const;
export type Asset = keyof typeof ASSETS;
export function isAsset(value:string):value is Asset {return Object.hasOwn(ASSETS,value)}
export function supportsVenue(asset:Asset,venue:string) {return (ASSETS[asset].venues as readonly string[]).includes(venue)}
