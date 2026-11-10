import {timingSafeEqual} from 'node:crypto';
import type {NextRequest} from 'next/server';

export function proxy(request: NextRequest) {
 const password = process.env.OPTIONS_LAB_PASSWORD;
 if (!password) return new Response('Set OPTIONS_LAB_PASSWORD on Render.', {status:503});
 const expected = Buffer.from('Basic '+Buffer.from('options:'+password).toString('base64'));
 const actual = Buffer.from(request.headers.get('authorization') || '');
 if (actual.length === expected.length && timingSafeEqual(actual, expected)) return;
 return new Response('Sign in to Options Lab.', {
  status:401,
  headers:{'WWW-Authenticate':'Basic realm="Options Lab", charset="UTF-8"', 'Cache-Control':'no-store'},
 });
}

export const config = {matcher:['/((?!_next/static|_next/image|favicon.ico).*)']};
