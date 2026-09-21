import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createArchiveAdapter } from '../server/adapters/archive.mjs';
import { createMailer } from '../server/adapters/mail.mjs';
const root=fileURLToPath(new URL('..',import.meta.url));
const config={root,mode:'live',bridgeOrigin:'https://source.example',bridgeKey:'scoped-test-key',resendKey:'test-key',emailFrom:'SoulTrace <test@example.com>'};
async function mocked(fetcher,fn){const old=globalThis.fetch;globalThis.fetch=fetcher;try{return await fn();}finally{globalThis.fetch=old;}}
const archive={id:'one',petName:'보리',title:'예시',createdAt:'2026-09-17',message:'고마워',letter:'우리의 편지',photos:[{id:'p1',label:'사진'}]};
test('live bridge sends verified email only server-to-server and returns allowed summary fields',async()=>{
 await mocked(async(url,opts)=>{assert.equal(url.href,'https://source.example/internal/memory-shop/list');assert.equal(opts.headers.Authorization,'Bearer scoped-test-key');assert.equal(JSON.parse(opts.body).verifiedEmail,'a@example.com');assert.equal(opts.redirect,'error');return Response.json({archives:[{...archive,photoCount:1,privateAnswers:'MUST_NOT_FORWARD'}],nextCursor:null});},async()=>{const result=await createArchiveAdapter(config).list('a@example.com');assert.equal(result.archives.length,1);assert.ok(!JSON.stringify(result).includes('MUST_NOT_FORWARD'));assert.equal(result.archives[0].letter,undefined);});
});
test('live detail requests exact record and does not accept a different record ID',async()=>{
 await mocked(async()=>Response.json({archive:{...archive,id:'other'}}),async()=>{await assert.rejects(createArchiveAdapter(config).read('a@example.com','one'),e=>e.status===502);});
});
test('live upstream 404/403 maps to non-disclosing not-found',async()=>{
 for(const status of [403,404])await mocked(async()=>new Response('provider private diagnostic',{status}),async()=>{await assert.rejects(createArchiveAdapter(config).read('a@example.com','one'),e=>e.status===404&&!e.message.includes('diagnostic'));});
});
test('live upstream outage never returns synthetic archives',async()=>{
 await mocked(async()=>{throw new Error('secret path');},async()=>{await assert.rejects(createArchiveAdapter(config).list('a@example.com'),e=>e.status===502&&!e.message.includes('secret'));});
});
test('live bridge validates response shape and size instead of accepting arbitrary JSON',async()=>{
 for(const body of [{archives:'not-array'},{archives:[{...archive,petName:'x'.repeat(21)}]},{archives:Array(101).fill(archive)}])await mocked(async()=>Response.json(body),async()=>{await assert.rejects(createArchiveAdapter(config).list('a@example.com'),e=>e.status===502);});
});
test('live bridge preserves full letter up to contract limit, without slicing to product limit',async()=>{
 await mocked(async()=>Response.json({archive:{...archive,letter:'문'.repeat(3000)}}),async()=>{const result=await createArchiveAdapter(config).read('a@example.com','one');assert.equal(result.letter.length,3000);});
});
test('photo request includes both ownership scope and photo ID; response remains binary',async()=>{
 const photo=readFileSync(new URL('../assets/pet-bori.webp',import.meta.url));
 await mocked(async(url,opts)=>{assert.equal(url.href,'https://source.example/internal/memory-shop/photo');assert.deepEqual(JSON.parse(opts.body),{verifiedEmail:'a@example.com',archiveId:'one',photoId:'p1'});return new Response(photo,{headers:{'Content-Type':'image/webp'}});},async()=>{const result=await createArchiveAdapter(config).photo('a@example.com','one','p1');assert.equal(result.type,'image/webp');assert.deepEqual(result.bytes,photo);});
});
test('photo rejects SVG/non-image and oversized claimed content length',async()=>{
 for(const headers of [{'Content-Type':'image/svg+xml'},{'Content-Type':'image/png'},{'Content-Type':'image/webp','Content-Length':'9000000'}])await mocked(async()=>new Response('<svg/>',{headers}),async()=>{await assert.rejects(createArchiveAdapter(config).photo('a@example.com','one','p1'),e=>e.status===502);});
});
test('Resend adapter uses correct endpoint, scoped payload and idempotency key',async()=>{
 await mocked(async(url,opts)=>{assert.equal(url,'https://api.resend.com/emails');assert.equal(opts.headers.Authorization,'Bearer test-key');assert.equal(opts.headers['Idempotency-Key'],'shop-otp-challenge');const data=JSON.parse(opts.body);assert.deepEqual(data.to,['a@example.com']);assert.match(data.text,/012345/);assert.ok(!('tags' in data));return Response.json({id:'mock-mail'});},async()=>{await createMailer(config).send({email:'a@example.com',code:'012345',challengeId:'challenge'});});
});
test('Resend error never exposes response diagnostics or claims delivery',async()=>{
 await mocked(async()=>new Response('secret vendor details',{status:429}),async()=>{await assert.rejects(createMailer(config).send({email:'a@example.com',code:'012345',challengeId:'c'}),e=>e.status===503&&e.code==='MAIL_UNAVAILABLE'&&!e.message.includes('secret'));});
});
test('demo mail adapter never calls any external endpoint',async()=>{
 await mocked(async()=>{throw new Error('Network forbidden');},async()=>{await createMailer({...config,mode:'demo'}).send({email:'a@example.test',code:'012345',challengeId:'c'});});
});
