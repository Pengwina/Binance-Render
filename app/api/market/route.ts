import {loadFeed} from '../../../lib/market';

export async function GET(req: Request) {
 const {searchParams} = new URL(req.url);
 const venue = searchParams.get('venue') || 'Deribit';
 const asset = searchParams.get('asset') ?? 'BTC';
 if (asset !== 'BTC' && asset !== 'ETH') {
  return Response.json({error: 'Unsupported asset'}, {status: 400});
 }
 try {
  return Response.json(await loadFeed(venue, asset), {headers: {'Cache-Control': 'private, max-age=45'}});
 } catch (error) {
  return Response.json({venue, error: error instanceof Error ? error.message : 'Feed unavailable', time: Date.now()}, {status: 502, headers: {'Cache-Control': 'no-store'}});
 }
}
