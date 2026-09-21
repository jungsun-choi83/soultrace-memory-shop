import { escapeHtml } from './core.mjs';
import { DEMO_EMAIL } from './fixtures.mjs';

/** Accessible email -> code -> record picker. Callbacks integrate with the existing product editor. */
export function createArchiveFlow({api,openDialog,closeDialog,dialogHeader,onSelected,onCleared,onCancelled,notify}) {
  const esc=escapeHtml;
  let step='email',email='',challenge=null,items=[],record=null,selectedPhoto=null,error='',busy=false,epoch=0,nextCursor=null;
  let resendAt=0,expiryTimer=null,tickTimer=null;
  const dialog=document.querySelector('#shop-dialog');
  const isOpen=()=>dialog.open&&dialog.dataset.flow==='archive';
  const explainOnly=true;
  const modeLabel=()=>api.getMode()==='live'
    ? '이메일 확인으로 소울트레이스에 남긴 이야기만 안전하게 불러와요.'
    : '지금은 안내만 보여 드려요. 실제 불러오기는 소울트레이스 연동 후 열립니다.';
  function banner(){return `<div class="archive-mode ${api.getMode()==='live'?'is-live':''}">${esc(modeLabel())}</div>`;}
  function progress(){const index=step==='email'?0:step==='code'?1:2;return `<ol class="archive-progress" aria-label="이야기 연결 순서">${['이메일 입력','이메일 확인','이야기 선택'].map((label,i)=>`<li class="${i===index?'current':i<index?'complete':''}" ${i===index?'aria-current="step"':''}><span>${i<index?'✓':i+1}</span>${label}</li>`).join('')}</ol>`;}
  function status(){return `<p id="archive-error" class="form-error" role="alert">${esc(error)}</p>`;}
  function endActions(){return `<div class="archive-secondary"><button type="button" class="mini-link" data-archive="manual">사진과 문구 직접 넣기</button>${api.getSession()?'<button type="button" class="mini-link" data-archive="logout">연결 해제 · 내 정보 지우기</button>':''}</div>`;}
  function shell(title,content){
    openDialog('archive',`${dialogHeader(title,'FROM YOUR SOUL TRACE')}<div class="dialog-body archive-v2">${banner()}${progress()}${content}${status()}${endActions()}</div>`,'compact');dialog.dataset.flow='archive';
  }
  function render(){
    if(explainOnly||step==='explain'){
      openDialog('archive',`${dialogHeader('내 이야기를 굿즈로','FROM YOUR SOUL TRACE')}<div class="dialog-body archive-v2">
        <div class="archive-mode">연동 준비 중 · 실제 편지 불러오기는 곧 연결됩니다</div>
        <p class="archive-intro">소울트레이스에서 편지를 만들 때 쓴 <strong>같은 이메일</strong>을 입력하면,<br>그때 남긴 편지와 사진을 그대로 불러와 메모리 상품으로 만들 수 있습니다.</p>
        <ol class="archive-explain">
          <li><span>01</span><div><strong>소울트레이스에서 남긴 이야기</strong><p>편지를 만들 때 사용한 이메일이 그 이야기의 열쇠입니다.</p></div></li>
          <li><span>02</span><div><strong>굿즈샵에서 불러와 제작</strong><p>같은 이메일을 확인하면 생성된 편지를 골라 NFC 카드, 편지 세트, 키링에 담을 수 있습니다.</p></div></li>
          <li><span>03</span><div><strong>이터널빔까지 이어지는 아카이브</strong><p>그 이메일에 이야기가 쌓입니다. 나중에 이터널빔에서도 같은 이메일을 입력하면 소울트레이스와 이 샵에서 만든 기록이 함께 보여집니다.</p></div></li>
        </ol>
        <p class="field-help">지금은 이메일 확인을 준비하고 있어요. 연동이 끝나면 이 화면에서 바로 불러올 수 있습니다.</p>
        <button type="button" class="button button-dark archive-primary" data-archive="manual">사진과 문구로 먼저 만들기 <span>→</span></button>
      </div>`,'compact');
      dialog.dataset.flow='archive';
      return;
    }
    if(step==='loading'){shell('내 이야기를 확인하고 있어요',`<div class="archive-loading" role="status"><span class="loading-ring"></span><p>잠시만 기다려주세요.</p></div>`);return;}
    if(step==='email'){
      shell('전에 남긴 이야기가 있나요?',`<p class="archive-intro">소울트레이스에서 편지를 만들 때 쓴 이메일을 그대로 입력하면,<br>그 편지와 사진을 불러와 굿즈로 만들 수 있어요.<br>같은 이메일 아카이브는 이터널빔에서도 이어집니다.</p><form id="archive-email-form"><label class="field"><span>이야기를 남겼던 이메일</span><input name="archiveEmail" type="email" maxlength="254" required autocomplete="email" placeholder="your@email.com" value="${esc(email)}" ${busy?'disabled':''}></label><p class="field-help">이메일 확인 후 그 계정에 쌓인 이야기만 보여드려요.<br>마케팅 수신 신청이 아닙니다.</p><button class="button button-dark archive-primary" type="submit" ${busy?'disabled':''}>${busy?'확인 메일 요청 중…':'인증번호 받기'} <span>→</span></button></form>${api.getMode()!=='live'?`<div class="demo-entry"><strong>지금은 데모로 확인하세요</strong><p>실제 소울트레이스 이메일은 아직 서버에 연결되지 않았어요.<br>아래 예시 주소로 불러오기 → 굿즈 제작 흐름을 먼저 체험해주세요.</p><button class="demo-chip" type="button" data-archive="demo-email" data-email="${DEMO_EMAIL}">보리 · 이야기 2개</button><button class="demo-chip" type="button" data-archive="demo-email" data-email="nabi@example.test">나비 · 사진 없는 이야기</button><button class="demo-chip" type="button" data-archive="demo-email" data-email="empty@example.test">저장된 이야기 없음</button></div>`:''}`);
    }else if(step==='code'){
      shell('메일함을 확인해주세요',`<p class="archive-intro"><strong>${esc(email)}</strong>로 요청한<br>6자리 인증번호를 입력해주세요.</p><form id="archive-code-form"><label class="field"><span>인증번호 <small>발급 후 10분 동안 유효</small></span><input class="otp-input" name="archiveCode" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" minlength="6" maxlength="6" required placeholder="000000" ${busy?'disabled':''}></label>${challenge?.demoCode?`<div class="demo-otp"><span>데모 인증번호 · 실제 메일 발송 없음</span><strong id="demo-code">${esc(challenge.demoCode)}</strong><button type="button" class="mini-link" data-archive="fill-code">번호 넣기</button></div>`:''}<button type="submit" class="button button-dark archive-primary" ${busy?'disabled':''}>${busy?'확인 중…':'확인하고 편지 찾기'} <span>→</span></button></form><div class="archive-resend"><button type="button" class="mini-link" data-archive="resend" ${busy?'disabled':''}>인증번호 다시 받기</button><span id="resend-count"></span><button type="button" class="mini-link" data-archive="change-email">이메일 수정</button></div><p class="field-help">메일이 보이지 않으면 스팸함도 확인해주세요. 새 번호를 받으면 이전 번호는 사용할 수 없어요.</p>`);updateCountdown();
    }else if(step==='list'){
      const session=api.getSession();
      shell(items.length?'어떤 이야기를 담을까요?':'저장된 이야기를 찾지 못했어요',`<p class="archive-account">${esc(session?.maskedEmail||'')} <span>이메일 확인 완료</span></p>${items.length?`<p class="archive-intro">한 이메일로 만든 이야기가 여러 개라면,<br>이번 상품에 담을 이야기를 골라주세요.</p><div class="archive-records">${items.map(item=>`<button type="button" class="archive-record" data-archive="select" data-id="${esc(item.id)}"><span class="record-glyph">✉</span><span><small>${esc(item.petName)}</small><strong>${esc(item.title)}</strong><em>${esc(formatDate(item.createdAt))} · 사진 ${Number(item.photoCount)||0}장</em></span><span class="record-arrow">↗</span></button>`).join('')}</div>${nextCursor?'<button type="button" class="button button-outline archive-primary" data-archive="more">이야기 더 보기</button>':''}`:`<div class="archive-empty"><span>✉</span><p>다른 이메일로 만들었거나,<br>기존 기록이 저장되지 않았을 수 있어요.</p><p>아직 소유 확인이 연결되지 않은 예전 기록도<br>여기에 표시되지 않습니다.</p></div><button type="button" class="button button-outline archive-primary" data-archive="logout">다른 이메일로 다시 찾기</button>`}`);
    }else if(step==='detail'){
      shell('이 이야기로 만들어볼까요?',`<button type="button" class="mini-link" data-archive="back-list">← 다른 이야기 고르기</button><div class="selected-record-heading"><p>${esc(record.petName)}의 이야기</p><h3>${esc(record.title)}</h3><small>${esc(formatDate(record.createdAt))}</small></div><div class="real-letter-preview">${esc(record.letter||record.message||'저장된 편지 내용이 없습니다.')}</div>${record.letter.length>2000?'<p class="field-help">원문이 2,000자를 넘습니다. 자동으로 자르지 않으며, 상품 편집 화면에서 인쇄용 내용을 직접 정리해주세요.</p>':''}<p class="option-label">대표 사진 선택 <span class="field-help">${record.photos.length?'· 다른 사진으로 바꿀 수 있어요':'· 저장된 사진 없음'}</span></p>${record.photos.length?`<div class="archive-photo-grid">${record.photos.map(p=>`<button class="archive-photo-choice" type="button" data-archive="photo" data-id="${esc(p.id)}" aria-pressed="${selectedPhoto===p.id}"><img src="${esc(api.photoUrl(record.id,p.id))}" alt="${esc(p.label||'아이 사진')}" loading="lazy"><span>${esc(p.label||'사진')}</span></button>`).join('')}</div><button type="button" class="mini-link" data-archive="no-photo">사진은 나중에 직접 넣기</button>`:'<p class="disclosure">편지는 그대로 불러오고, 사진은 상품 화면에서 직접 넣을 수 있어요. 예시 사진으로 자동 대체하지 않습니다.</p>'}<button type="button" class="button button-dark archive-primary" data-archive="apply" ${busy?'disabled':''}>${busy?'사진 준비 중…':'이 이야기로 상품 만들기'} <span>→</span></button><p class="field-help">선택한 내용은 현재 탭에서만 사용합니다.<br>원본 편지는 수정하지 않으며 실제 제작·결제는 아직 연결되지 않았어요.</p>`);
    }else if(step==='error'){
      shell('잠시 연결할 수 없어요',`<p class="archive-intro">실제 기록을 확인하지 못했어요.<br>예시 데이터로 바꾸어 보여드리지 않습니다.</p><button type="button" class="button button-outline archive-primary" data-archive="retry">다시 시도하기</button>`);
    }
  }
  function formatDate(value){const d=new Date(value);return Number.isNaN(d.getTime())?'날짜 미확인':d.toLocaleDateString('ko-KR',{year:'numeric',month:'long',day:'numeric'});}
  function updateCountdown(){
    if(!isOpen()||step!=='code')return;const seconds=Math.max(0,Math.ceil((resendAt-Date.now())/1000));const button=dialog.querySelector('[data-archive="resend"]');if(button)button.disabled=busy||seconds>0;const output=document.querySelector('#resend-count');if(output)output.textContent=seconds?`${seconds}초 후 재전송`:'';
  }
  function scheduleExpiry(){clearTimeout(expiryTimer);const s=api.getSession();if(!s)return;expiryTimer=setTimeout(()=>{epoch++;record=null;items=[];onCleared('expired');step='email';error='이메일 확인 시간이 끝났어요. 다시 확인해주세요.';if(isOpen())render();notify('보호를 위해 불러온 편지와 맞춤 내용을 지웠어요.');},Math.max(1,s.expiresAt-Date.now()));}
  async function handleError(e){if(e.status===401){onCleared('expired');step='email';record=null;items=[];error=e.message;}else error=e.message||'다시 시도해주세요.';busy=false;if(isOpen())render();}
  async function run(action){if(busy)return;busy=true;error='';const version=++epoch;render();try{await action(version);}catch(e){if(version===epoch)await handleError(e);}finally{if(version===epoch){busy=false;if(isOpen())render();}}}
  async function loadList(more=false, version=epoch){const result=await api.list(more?nextCursor:null);if(version!==epoch)return;items=more?[...items,...result.archives.filter(x=>!items.some(i=>i.id===x.id))]:result.archives;nextCursor=result.nextCursor;step='list';scheduleExpiry();}
  async function open(){
    ++epoch;record=null;error='';busy=false;
    if(explainOnly){step='explain';render();return;}
    step='loading';render();const version=epoch;
    try{const status=await api.bootstrap();if(version!==epoch)return;if(status.session){await loadList();}else{onCleared('unauthenticated');step='email';}if(version===epoch&&isOpen())render();}
    catch(e){if(version===epoch){error=e.message;step='error';render();}}
    clearInterval(tickTimer);tickTimer=setInterval(updateCountdown,500);
  }
  async function submitEmail(){await run(async(version)=>{challenge=await api.requestCode(email);if(version!==epoch)return;resendAt=Date.now()+challenge.resendAfterMs;step='code';});}
  async function disconnect(){await run(async()=>{await api.logout();clearTimeout(expiryTimer);onCleared('logout');record=null;items=[];email='';challenge=null;await api.bootstrap();step='email';notify('연결을 해제했어요. 상품과 수량만 유지됩니다.');});}
  document.addEventListener('submit',event=>{
    if(event.target.id==='archive-email-form'){event.preventDefault();email=event.target.elements.archiveEmail.value.trim();submitEmail();}
    if(event.target.id==='archive-code-form'){event.preventDefault();const code=event.target.elements.archiveCode.value.trim();run(async(version)=>{await api.verifyCode(challenge.challengeId,code);if(version!==epoch)return;await loadList();});}
  });
  document.addEventListener('click',event=>{
    const button=event.target.closest('[data-archive]');if(!button||button.disabled||!isOpen())return;
    const action=button.dataset.archive;
    if(action==='demo-email'){email=button.dataset.email;render();dialog.querySelector('input')?.focus();}
    else if(action==='fill-code'){const input=dialog.querySelector('[name="archiveCode"]');if(input)input.value=challenge.demoCode;}
    else if(action==='change-email'){epoch++;busy=false;step='email';error='';render();}
    else if(action==='resend')submitEmail();
    else if(action==='logout')disconnect();
    else if(action==='retry')open();
    else if(action==='select')run(async(version)=>{const data=await api.read(button.dataset.id);if(version!==epoch)return;record=data.archive;selectedPhoto=record.photos[0]?.id||null;step='detail';});
    else if(action==='more')run(async()=>loadList(true));
    else if(action==='back-list'){step='list';error='';render();}
    else if(action==='photo'){selectedPhoto=button.dataset.id;render();}
    else if(action==='no-photo'){selectedPhoto=null;render();}
    else if(action==='apply')run(async(version)=>{
      const photo=selectedPhoto?await api.photoData(record.id,selectedPhoto):'';if(version!==epoch)return;
      const selection={id:record.id,name:record.petName,title:record.title,message:record.message,letter:record.letter,photo,photoId:selectedPhoto,sample:false,source:'soultrace'};
      // clear marker before returning to the product editor; no stale completion can reopen the picker.
      delete dialog.dataset.flow;onSelected(selection);record=null;
    });
    else if(action==='manual'){epoch++;busy=false;delete dialog.dataset.flow;closeDialog();onCancelled(true);}
  });
  // In-flight work must not reopen a dismissed dialog.
  dialog.addEventListener('close',()=>{epoch++;busy=false;delete dialog.dataset.flow;record=null;clearInterval(tickTimer);});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&api.getSession()?.expiresAt<=Date.now()){onCleared('expired');if(isOpen())open();}});
  return {open,cancel(){epoch++;busy=false;record=null;clearInterval(tickTimer);delete dialog.dataset.flow;},async logout(){await disconnect();},scheduleExpiry};
}
