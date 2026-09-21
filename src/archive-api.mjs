import { DEMO_EMAIL, DEMO_ARCHIVES, demoList, demoDetail } from './fixtures.mjs';

/** Same-origin client. File preview uses ONLY an explicit synthetic transport, never an API-error fallback. */
export function createArchiveApi() {
  let csrf=''; let mode='unknown'; let session=null;
  const offline=globalThis.SOULTRACE_OFFLINE_PREVIEW===true || location.protocol==='file:';
  let offlineEmail='';let challenge=null;let lastRequest=0;
  const offlineAsset=file=>globalThis.SOULTRACE_EMBEDDED_ASSETS?.[file] || new URL(`../assets/${file}`,import.meta.url).href;
  const fail=(message,status=400,code='ERROR')=>Object.assign(new Error(message),{status,code});
  async function request(path,method='GET',data) {
    let response;
    try { response=await fetch(path,{method,credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(15_000),headers:method==='POST'?{'Content-Type':'application/json','X-CSRF-Token':csrf}:{},...(data?{body:JSON.stringify(data)}:{})}); }
    catch{throw fail('연결할 수 없어요. 서버 실행 상태를 확인하고 다시 시도해주세요.',503,'UNAVAILABLE');}
    let payload;try{payload=await response.json();}catch{throw fail('서버 응답을 확인할 수 없어요.',502,'UNAVAILABLE');}
    if(!response.ok){if(response.status===401)session=null;throw Object.assign(fail(payload.message||'처리하지 못했어요.',response.status,payload.error),{retryAfter:payload.retryAfter});}
    if(payload.csrfToken)csrf=payload.csrfToken;
    if('session' in payload)session=payload.session;
    return payload;
  }
  function checkOfflineSession(){if(!session||session.expiresAt<=Date.now()){session=null;offlineEmail='';throw fail('이메일을 다시 확인해주세요.',401,'AUTH_REQUIRED');}}
  async function bootstrap(){
    if(offline){mode='offline';if(session?.expiresAt<=Date.now()){session=null;offlineEmail='';}return {mode,session};}
    const result=await request('/api/session');mode=result.mode;return result;
  }
  async function requestCode(email){
    if(mode==='unknown')await bootstrap();
    if(offline){
      if(!/^[^\s@]+@example\.test$/.test(email))throw fail('데모에서는 bori@example.test 같은 예시 이메일만 사용해주세요.');
      if(Date.now()-lastRequest<5000)throw Object.assign(fail('잠시 후 다시 시도해주세요.',429),{retryAfter:5});
      lastRequest=Date.now();const bytes=new Uint32Array(1);crypto.getRandomValues(bytes);
      challenge={challengeId:Array.from(crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,'0')).join(''),email,code:String(bytes[0]%1000000).padStart(6,'0'),expiresAt:Date.now()+600000,attempts:0};
      return {...challenge,demoCode:challenge.code,resendAfterMs:5000};
    }
    return request('/api/auth/request-code','POST',{email});
  }
  async function verifyCode(challengeId,code){
    if(offline){
      if(!challenge||challenge.challengeId!==challengeId||challenge.expiresAt<=Date.now()||challenge.attempts>=5)throw fail('인증번호가 맞지 않거나 만료됐어요. 새 번호를 요청해주세요.');
      challenge.attempts++;
      if(code!==challenge.code)throw fail('인증번호가 맞지 않거나 만료됐어요. 새 번호를 요청해주세요.');
      offlineEmail=challenge.email;challenge=null;session={maskedEmail:offlineEmail[0]+'***@example.test',expiresAt:Date.now()+1800000};return {session};
    }
    return request('/api/auth/verify-code','POST',{challengeId,code});
  }
  async function list(cursor=null){if(offline){checkOfflineSession();return {archives:demoList(offlineEmail),nextCursor:null};}return request('/api/archives'+(cursor?'?cursor='+encodeURIComponent(cursor):''));}
  async function read(id){if(offline){checkOfflineSession();const archive=demoDetail(offlineEmail,id);if(!archive)throw fail('해당 기록을 불러올 수 없어요.',404);return {archive};}return request(`/api/archives/${encodeURIComponent(id)}`);}
  function photoUrl(id,photoId){
    if(offline){checkOfflineSession();const item=DEMO_ARCHIVES.find(x=>x.owner===offlineEmail&&x.id===id);const photo=item?.photos.find(p=>p.id===photoId);return photo?offlineAsset(photo.file):'';}
    return `/api/archives/${encodeURIComponent(id)}/photos/${encodeURIComponent(photoId)}`;
  }
  async function photoData(id,photoId){
    const url=photoUrl(id,photoId);if(!url)return '';
    let blob;
    if (offline && url.startsWith('data:')) { const match=url.match(/^data:(image\/(?:webp|jpeg|png));base64,(.*)$/s); if(!match)throw fail('예시 사진 형식을 확인해주세요.'); blob=new Blob([Uint8Array.from(atob(match[2]),c=>c.charCodeAt(0))],{type:match[1]}); }
    else { let response;try{response=await fetch(url,{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(15_000)});}catch{throw fail('사진을 불러오지 못했어요. 다시 시도해주세요.',503);}
    if(!response.ok)throw fail(response.status===401?'이메일을 다시 확인해주세요.':'사진을 불러오지 못했어요.',response.status);blob=await response.blob(); }
    if(!['image/jpeg','image/png','image/webp'].includes(blob.type)||blob.size>5*1024*1024)throw fail('미리보기 가능한 사진 형식이나 크기가 아닙니다.');
    // Re-encode to strip metadata. This is a preview, not the final print-resolution file.
    const image=await createImageBitmap(blob);
    try{
      if(image.width*image.height>40_000_000)throw fail('사진 해상도가 너무 커요. 작은 사진을 선택해주세요.');
      const scale=Math.min(1,1200/Math.max(image.width,image.height));const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale));
      canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);return canvas.toDataURL('image/jpeg',.87);
    }finally{image.close();}
  }
  async function logout(){if(!offline){await request('/api/auth/logout','POST',{});csrf='';}session=null;offlineEmail='';challenge=null;return {ok:true};}
  return {bootstrap,requestCode,verifyCode,list,read,photoUrl,photoData,logout,getMode:()=>mode,getSession:()=>session};
}
