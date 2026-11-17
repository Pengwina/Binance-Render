import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DAY,completedCloses,historicalVolatility,blendedVolatility,priceRange} from '../lib/volatility.ts';

test('drops unfinished/invalid candles and sorts daily closes',()=>{
 const now=10.5*DAY;
 const closes=completedCloses([[10*DAY,0,0,0,120],[9*DAY,0,0,0,110],[8*DAY,0,0,0,100],[7*DAY,0,0,0,0]],now);
 assert.deepEqual(closes,[{time:9*DAY,price:100},{time:10*DAY,price:110}]);
});
test('sample standard deviation of log returns is annualised correctly',()=>{
 const closes=[{time:DAY,price:100},{time:2*DAY,price:100*Math.exp(.1)},{time:3*DAY,price:100}];
 assert.ok(Math.abs(historicalVolatility(closes,2,3.5*DAY)-Math.sqrt(.02*365.25))<1e-12);
});
test('flat prices produce zero rather than missing historical volatility',()=>{
 const closes=Array.from({length:8},(_,i)=>({time:(i+1)*DAY,price:100}));
 assert.equal(historicalVolatility(closes,7,8.5*DAY),0);
 assert.ok(Math.abs(blendedVolatility(.4,0,.75)-Math.sqrt(.75*.16))<1e-12);
});
test('missing dates, insufficient samples, old data and nonfinite prices are rejected',()=>{
 const closes=Array.from({length:8},(_,i)=>({time:(i+1)*DAY,price:100+i}));
 assert.equal(historicalVolatility(closes,30,8.5*DAY),null);
 assert.equal(historicalVolatility(closes.filter(c=>c.time!==3*DAY),7,8.5*DAY),null);
 assert.equal(historicalVolatility(closes,7,9*DAY),null);
 assert.equal(historicalVolatility(closes.map((c,i)=>i===4?{...c,price:NaN}:c),7,8.5*DAY),null);
});
test('rollover reference excludes every later close and remains fixed',()=>{
 const closes=Array.from({length:10},(_,i)=>({time:(i+1)*DAY,price:100+i}));
 const before=historicalVolatility(closes.slice(0,8),7,8.5*DAY);
 assert.equal(historicalVolatility([...closes,{time:11*DAY,price:10000}],7,8.5*DAY),before);
});
test('blend averages variance, honours endpoints and does not silently substitute missing inputs',()=>{
 assert.ok(Math.abs(blendedVolatility(.4,.6,.75)-Math.sqrt(.75*.16+.25*.36))<1e-12);
 assert.equal(blendedVolatility(.4,.6,1),.4);
 assert.equal(blendedVolatility(.4,.6,0),.6);
 assert.equal(blendedVolatility(.4,null,.75),null);
 assert.equal(blendedVolatility(null,.6,.75),null);
});
test('range uses actual expiry time, supports zero volatility and refuses expired horizons',()=>{
 const r=priceRange(100,.4,365.25*DAY,0);
 assert.deepEqual(r,{lower:60,upper:140,move:40});
 assert.deepEqual(priceRange(100,0,DAY,0),{lower:100,upper:100,move:0});
 assert.equal(priceRange(100,.4,DAY,DAY),null);
 assert.equal(priceRange(100,null,DAY,0),null);
});
