import http from 'node:http';
import { randomInt } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { AuthStore } from './store.mjs';
import { createMailer } from './adapters/mail.mjs';
import { createArchiveAdapter } from './adapters/archive.mjs';
import { token, digest, encrypt, decrypt, constantEqual, normalizeEmail, maskEmail, parseCookies, assertId, HttpError } from './security.mjs';

export function createApp(config, dependencies={}) {
  const now=dependencies.now||Date.now;
  const store=dependencies.store||new AuthStore(config.dbPath);
  const mailer=dependencies.mailer||createMailer(config);
  const archives=dependencies.archives||createArchiveAdapter(config);
  const hash=(purpose,value)=>digest(config.secret,purpose,value);
  const cookieName=config.secure?'__Host-st_shop':'st_shop';
  const browserCookie=config.secure?'__Host-st_browser':'st_browser';
  const cookies=(value,name,seconds)=>`${name}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${seconds}${config.secure?'; Secure':''}`;
  function setCookie(res,value,name,seconds) {const old=res.getHeader('Set-Cookie')||[];res.setHeader('Set-Cookie',[...(Array.isArray(old)?old:[old]),cookies(value,name,seconds)]);}
  const rawValid=value=>typeof value==='string'&&/^[a-zA-Z0-9_-]{43}$/.test(value);
  function context(req,res,ensureBrowser=false) {
    const c=parseCookies(req.headers.cookie);
    const rawSession=rawValid(c[cookieName])?c[cookieName]:'';
    const session=rawSession?store.getSession(hash('session',rawSession),now()):null;
    let browser=rawValid(c[browserCookie])?c[browserCookie]:'';
    if(!browser&&ensureBrowser){browser=token();setCookie(res,browser,browserCookie,1800);}
    // A session's CSRF is not reused after authentication/logout.
    const csrfBase=session?rawSession:browser;
    return {session,rawSession,browser,csrf:csrfBase?hash('csrf',csrfBase):'',email:session?decrypt(config.secret,session.email_cipher):null};
  }
  function auth(ctx){if(!ctx.session)throw new HttpError(401,'AUTH_REQUIRED','이메일 확인 시간이 끝났어요. 다시 확인해주세요.');}
  function json(res,status,data){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));}
  async function body(req){
    if(!(req.headers['content-type']||'').startsWith('application/json'))throw new HttpError(415,'JSON_REQUIRED','JSON 요청이 필요합니다.');
    let length=0;const parts=[];
    for await(const chunk of req){length+=chunk.length;if(length>8192)throw new HttpError(413,'BODY_LIMIT','요청 크기가 너무 큽니다.');parts.push(chunk);}
    try{const v=JSON.parse(Buffer.concat(parts).toString('utf8'));if(!v||Array.isArray(v)||typeof v!=='object')throw new Error();return v;}catch{throw new HttpError(400,'INVALID_JSON','요청 형식이 올바르지 않습니다.');}
  }
  const server=http.createServer(async(req,res)=>{
    res.setHeader('Cache-Control','no-store, private');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Frame-Options','DENY');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
    if(config.secure)res.setHeader('Strict-Transport-Security','max-age=31536000');
    try{
      const url=new URL(req.url,config.origin);
      if(req.headers.host!==new URL(config.origin).host)throw new HttpError(403,'HOST_REJECTED','허용되지 않은 요청입니다.');
      let path;try{path=decodeURIComponent(url.pathname);}catch{throw new HttpError(400,'BAD_PATH','잘못된 주소입니다.');}
      if(path.includes('\0')||path.includes('\\'))throw new HttpError(404,'NOT_FOUND','Not found');
      if(path.startsWith('/api/')){
        if(req.headers['sec-fetch-site']==='cross-site')throw new HttpError(403,'ORIGIN_REJECTED','허용되지 않은 요청입니다.');
        const ctx=context(req,res,req.method==='GET'&&path==='/api/session');
        if(req.method==='POST'){
          if(req.headers.origin!==config.origin||!ctx.csrf||!constantEqual(req.headers['x-csrf-token'],ctx.csrf))throw new HttpError(403,'CSRF_REJECTED','페이지를 새로고침한 뒤 다시 시도해주세요.');
        }
        if(req.method==='GET'&&path==='/api/session'){json(res,200,{mode:config.mode,csrfToken:ctx.csrf,session:ctx.session?{maskedEmail:maskEmail(ctx.email),expiresAt:ctx.session.expires}:null});return;}
        // IP budgets intentionally do not trust forwarded headers. Configure a rate-limited trusted proxy before public deployment.
        const ipKey=hash('ip',req.socket.remoteAddress||'unknown');
        if(req.method==='POST'&&path==='/api/auth/request-code'){
          const input=await body(req);const email=normalizeEmail(input.email);
          if(config.mode==='demo'&&!email.endsWith('@example.test'))throw new HttpError(400,'DEMO_EMAIL_ONLY','데모에서는 bori@example.test 같은 예시 이메일만 사용해주세요.');
          const emailKey=hash('email-rate',email.toLowerCase()); // Rate-limit aliases by case; never use this key for ownership.
          store.consumeLimits([{key:`request-global`,max:500,window:3600000},{key:`request-ip:${ipKey}`,max:20,window:3600000},{key:`request-email:${emailKey}`,max:5,window:3600000},{key:`cooldown:${emailKey}`,max:1,window:config.resendMs}],now());
          const id=token();const code=String(randomInt(0,1000000)).padStart(6,'0');const expires=now()+config.otpTtlMs;
          store.insertChallenge({id,browser:hash('browser',ctx.browser),emailKey,emailCipher:encrypt(config.secret,email),codeHash:hash('otp',`${id}:${code}`),expires});
          try{await mailer.send({email,code,challengeId:id});}catch(error){store.deleteChallenge(id);throw error;}
          // No archive lookup here: all valid addresses get the same response path whether records exist or not.
          json(res,200,{challengeId:id,expiresAt:expires,resendAfterMs:config.resendMs,message:'인증번호 발송을 요청했어요. 받은편지함과 스팸함을 확인해주세요.',...(config.mode==='demo'?{demoCode:code}: {})});return;
        }
        if(req.method==='POST'&&path==='/api/auth/verify-code'){
          const input=await body(req);
          store.consumeLimits([{key:`verify-ip:${ipKey}`,max:30,window:900000}],now());
          const id=typeof input.challengeId==='string'?input.challengeId:'';const code=typeof input.code==='string'?input.code:'';
          const raw=token();
          // Malformed attempts also consume a challenge attempt; avoid an alternate unlimited validation path.
          const session=store.verifyAndCreateSession({id,browser:hash('browser',ctx.browser),codeHash:hash('otp',`${id}:${code}`),maxAttempts:config.maxAttempts,now:now(),sessionHash:hash('session',raw),sessionExpires:now()+config.sessionTtlMs,oldSessionHash:ctx.rawSession?hash('session',ctx.rawSession):null});
          if(!session)throw new HttpError(400,'INVALID_CODE','인증번호가 맞지 않거나 만료됐어요. 새 번호를 요청해주세요.');
          setCookie(res,raw,cookieName,Math.floor(config.sessionTtlMs/1000));
          json(res,200,{csrfToken:hash('csrf',raw),session:{maskedEmail:maskEmail(decrypt(config.secret,session.emailCipher)),expiresAt:session.expires}});return;
        }
        if(req.method==='POST'&&path==='/api/auth/logout'){
          if(ctx.rawSession)store.revokeSession(hash('session',ctx.rawSession));
          setCookie(res,'',cookieName,0);setCookie(res,'',browserCookie,0);json(res,200,{ok:true});return;
        }
        if(req.method==='GET'&&path==='/api/archives'){
          auth(ctx);const cursor=url.searchParams.get('cursor');if(cursor&&cursor.length>128)throw new HttpError(400,'BAD_CURSOR','목록 요청이 올바르지 않습니다.');
          json(res,200,await archives.list(ctx.email,cursor));return;
        }
        const match=path.match(/^\/api\/archives\/([^/]+)(?:\/photos\/([^/]+))?$/);
        if(req.method==='GET'&&match){
          auth(ctx);const id=assertId(match[1]);
          if(match[2]){const photo=await archives.photo(ctx.email,id,assertId(match[2]));res.writeHead(200,{'Content-Type':photo.type,'Content-Length':photo.bytes.length,'Cross-Origin-Resource-Policy':'same-origin'});res.end(photo.bytes);}
          else json(res,200,{archive:await archives.read(ctx.email,id)});
          return;
        }
        throw new HttpError(404,'NOT_FOUND','API를 찾을 수 없습니다.');
      }
      if(!['GET','HEAD'].includes(req.method))throw new HttpError(405,'METHOD_NOT_ALLOWED','Not allowed');
      if(path==='/')path='/index.html';
      const types={'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml'};
      // Explicit public allowlist. NEVER expose .env, server, DB, docs or source maps.
      if(!(path==='/index.html'||path.startsWith('/src/')||path.startsWith('/assets/'))||!types[extname(path)])throw new HttpError(404,'NOT_FOUND','Not found');
      const root=resolve(config.staticRoot||config.root);const file=resolve(root,'.'+path);
      if(!file.startsWith(root+sep) || (path.startsWith('/src/') && !file.startsWith(resolve(root,'src')+sep)) || (path.startsWith('/assets/') && !file.startsWith(resolve(root,'assets')+sep)))throw new HttpError(404,'NOT_FOUND','Not found');
      try{if(!(await stat(file)).isFile())throw new Error();const bytes=await readFile(file);res.writeHead(200,{'Content-Type':types[extname(file)],'Content-Length':bytes.length});res.end(req.method==='HEAD'?undefined:bytes);}catch{throw new HttpError(404,'NOT_FOUND','Not found');}
    }catch(error){
      if(res.headersSent){res.end();return;}
      if(error.retryAfter)res.setHeader('Retry-After',String(error.retryAfter));
      // Never emit raw provider errors, emails, codes, request bodies or private contents in logs/responses.
      json(res,error instanceof HttpError?error.status:500,{error:error instanceof HttpError?error.code:'INTERNAL_ERROR',message:error instanceof HttpError?error.message:'요청을 완료하지 못했어요. 잠시 후 다시 시도해주세요.',...(error.retryAfter?{retryAfter:error.retryAfter}:{})});
    }
  });
  server.requestTimeout=15_000;server.headersTimeout=10_000;
  const timer=setInterval(()=>{try{store.prune(now());}catch{/* Expose operational health out-of-band without personal data. */}},60_000);timer.unref();
  server.on('close',()=>{clearInterval(timer);if(!dependencies.store)store.close();});
  store.prune(now());
  return {server,store};
}
