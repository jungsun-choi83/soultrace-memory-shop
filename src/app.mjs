import { PRODUCTS, SHOP, SAMPLE_ARCHIVE, FAQS } from './catalog.mjs';
import { getProduct, getVariant, formatMoney, createLine, addLine, changeQuantity, calculateCart, serializeCart, restoreCart, validateDelivery, validateFileMetadata, escapeHtml, meetsContentRule } from './core.mjs';

const h = escapeHtml;
const icon = (name, className = '') => `<svg class="icon ${className}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const asset = name => globalThis.SOULTRACE_EMBEDDED_ASSETS?.[name] ?? new URL(`../assets/${name}`, import.meta.url).href;
const $ = selector => document.querySelector(selector);
const dialog = $('#shop-dialog');
const state = { cart: [], archive: null, filter: 'all', modal: null, draft: null, productId: null, variantId: null, quantity: 1, editId: null, photoBusy: false, uploadToken: 0, previousFocus: null, result: null };
let toastTimer;
try { state.cart = restoreCart(localStorage.getItem(SHOP.cartKey)); } catch { /* Storage disabled: keep a functional in-memory cart. */ }

function productArt(product, thumbnail = false) {
  if (product.art === 'letter') return `<div class="product-art art-letter"><img src="${asset('letter-suite.webp')}" alt="편지와 엽서 구성 디자인 시안" loading="lazy" width="657" height="652"><img class="nfc-tag-cutout" src="${asset('nfc-tag.png')}" alt="가죽 NFC 인식표 시안" loading="lazy" width="320" height="298"></div>`;
  if (product.art === 'book') return `<div class="product-art art-book"><img src="${asset('mini-book-front.webp')}" alt="크림 베이지 미니 메모리북 키링 정면 디자인 시안" loading="lazy" width="380" height="401"></div>`;
  return `<div class="product-art art-nfc" role="img" aria-label="NFC가 내장된 포토카드 디자인 시안"><div class="nfc-card"><img src="${asset('pet-bori.webp')}" alt="" loading="lazy"><div class="nfc-card-meta"><span class="nfc-mark">${icon('spark')} NFC</span><strong>${thumbnail ? 'OPEN' : 'A MEMORY TO OPEN'}</strong><small>SOUL TRACE</small></div></div>${thumbnail ? '' : '<p class="nfc-card-caption">편지 또는 사진을 담는 카드 시안</p>'}</div>`;
}

function renderProducts() {
  const visible = PRODUCTS.filter(product => state.filter === 'all' || product.category === state.filter);
  $('#product-grid').innerHTML = visible.map(product => `<article class="product-card" data-product-card="${product.id}">
    <button type="button" class="product-visual-button" data-action="product" data-product="${product.id}" aria-label="${h(product.name)} 상세 보기"><span class="product-badge">${h(product.tag)}</span>${productArt(product)}<span class="product-quick">우리 아이로 만들기 ${icon('plus')}</span></button>
    <div class="product-info"><div class="product-overline"><span>${h(product.english.toUpperCase())}</span><div class="color-dots" aria-label="${h(product.variants.map(v => v.name).join(', '))}">${product.variants.map(v => `<span class="color-dot" style="--swatch:${v.color}"></span>`).join('')}</div></div><h3 class="product-title"><button type="button" data-action="product" data-product="${product.id}">${h(product.name)}</button></h3><p class="product-short">${h(product.short)}</p><p class="product-price">${formatMoney(product.price)}<span>맞춤 제작 컬렉션</span></p></div>
  </article>`).join('');
  $('#collection-count').textContent = `${visible.length}개의 컬렉션`;
  document.querySelectorAll('[data-filter]').forEach(button => { const active = button.dataset.filter === state.filter; button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active)); });
}
function updateHeader() {
  const { quantity } = calculateCart(state.cart);
  $('#cart-count').textContent = String(quantity);
  $('#cart-count').hidden = quantity === 0;
  $('.cart-trigger').setAttribute('aria-label', `장바구니 ${quantity}개`);
  $('#archive-header-label').textContent = state.archive ? `${state.archive.name}의 이야기` : '내 이야기';
}
function persistCart() {
  try { localStorage.setItem(SHOP.cartKey, serializeCart(state.cart)); } catch { /* Privacy mode/quota: the cart continues in memory. */ }
  updateHeader();
}
function toast(text) {
  clearTimeout(toastTimer);
  $('#toast').textContent = text;
  $('#toast').classList.add('visible');
  toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 3400);
}
function dialogHeader(title, eyebrow = 'SOUL TRACE MEMORY SHOP') {
  return `<div class="dialog-header"><div><p class="eyebrow">${h(eyebrow)}</p><h2 id="dialog-title" tabindex="-1">${h(title)}</h2></div><button class="icon-button dialog-close" type="button" data-action="close" aria-label="닫기">${icon('close')}</button></div>`;
}
function openDialog(kind, markup, className = '') {
  if (!dialog.open) state.previousFocus = document.activeElement;
  state.modal = kind;
  dialog.className = className;
  dialog.innerHTML = markup;
  if (!dialog.open) dialog.showModal();
  document.body.style.overflow = 'hidden';
  dialog.scrollTop = 0;
  $('#dialog-title')?.focus({ preventScroll: true });
}
function closeDialog() {
  dialog.close();
  dialog.innerHTML = ''; // Remove transient form data and image data URLs from the dialog DOM.
  document.body.style.overflow = '';
  state.modal = null;
  state.draft = null;
  state.result = null;
  state.photoBusy = false;
  state.uploadToken += 1;
  if (state.previousFocus?.isConnected) state.previousFocus.focus({ preventScroll: true });
}
function defaultDraft() {
  return state.archive ? { name: SAMPLE_ARCHIVE.name, message: SAMPLE_ARCHIVE.message, letter: SAMPLE_ARCHIVE.letter, photo: '', sample: true } : { name: '', message: '', letter: '', photo: '', sample: false };
}
function openProduct(productId, editId = null) {
  const product = getProduct(productId);
  if (!product) return;
  const line = editId ? state.cart.find(item => item.id === editId) : null;
  state.productId = productId;
  state.variantId = line?.variantId ?? product.variants[0].id;
  state.quantity = line?.quantity ?? 1;
  state.editId = line?.id ?? null;
  state.draft = line?.personalization ? { ...line.personalization } : defaultDraft();
  state.photoBusy = false;
  state.uploadToken += 1;
  renderProductDialog();
}
function stepper(value, scope, id = '') {
  return `<div class="stepper" aria-label="수량 선택"><button type="button" data-action="quantity" data-scope="${scope}" data-id="${h(id)}" data-delta="-1" aria-label="수량 줄이기" ${value <= 1 ? 'disabled' : ''}>${icon('minus')}</button><output aria-live="polite">${value}</output><button type="button" data-action="quantity" data-scope="${scope}" data-id="${h(id)}" data-delta="1" aria-label="수량 늘리기" ${value >= SHOP.maxQuantity ? 'disabled' : ''}>${icon('plus')}</button></div>`;
}
function draftPhoto() { return state.draft?.photo || (state.draft?.sample ? asset('pet-bori.webp') : ''); }
function renderProductDialog() {
  const product = getProduct(state.productId);
  const draft = state.draft;
  const photo = draftPhoto();
  const photoHint = product.photoRule === 'required' ? '필수 · 예시 사진으로 체험 가능' : product.photoRule === 'letter-or-photo' ? '편지 또는 사진 중 하나' : '선택';
  const letterHint = product.photoRule === 'letter-or-photo' ? '편지 또는 사진 중 하나 · 2,000자 이내' : '선택 · 2,000자 이내';
  const markup = `${dialogHeader('우리 아이의 기억 만들기', 'PERSONALIZE YOUR MEMORY')}<div class="dialog-body product-detail"><div class="detail-visual">${productArt(product)}<div class="detail-gallery-note">제품 구성 디자인 시안 · 사진·문구는 예시입니다.<br><span id="variant-note">${product.id === 'minibook' ? '사진은 크림 베이지 시안입니다. 선택 색상은 옵션에 반영됩니다.' : product.id === 'nfc' ? '실제 NFC 쓰기·전송은 현재 시안에서 동작하지 않습니다.' : '선택한 사진과 문구는 아래 맞춤 내용에 반영됩니다.'}</span></div></div><div class="detail-info"><p class="eyebrow">${h(product.english.toUpperCase())}</p><h3>${h(product.name)}</h3><p class="product-price">${formatMoney(product.price)}</p><p class="detail-description">${h(product.description)}</p><p class="option-label">컬러 선택 <span class="field-help">· 옵션 시안</span></p><div class="variant-buttons">${product.variants.map(variant => `<button type="button" class="variant-button" data-action="variant" data-variant="${variant.id}" aria-pressed="${state.variantId === variant.id}"><span class="swatch" style="--swatch:${variant.color}"></span>${h(variant.name)}</button>`).join('')}</div>
    <form id="personalize-form" class="detail-form"><div class="form-heading"><strong>우리 아이의 이야기</strong><button class="mini-link" type="button" data-action="fill-archive">예시 이야기 불러오기 ↗</button></div><label class="field"><span>아이 이름 <small>필수 · 20자 이내</small></span><input name="petName" value="${h(draft.name)}" maxlength="20" required placeholder="아이의 이름을 적어주세요" autocomplete="off"></label><label class="field"><span>남기고 싶은 한 문장 <small><span id="message-count">${draft.message.length}</span>/120</small></span><textarea name="message" maxlength="120" rows="3" placeholder="함께한 순간에 마음을 더해주세요.">${h(draft.message)}</textarea></label>
    ${product.showsLetter ? `<label class="field"><span>편지 내용 <small>${h(letterHint)}</small></span><textarea name="letter" maxlength="2000" rows="5" placeholder="내 편지를 적거나 예시 이야기를 불러오세요.">${h(draft.letter)}</textarea></label>` : ''}
    <span class="field-label">아이의 사진 <small>${h(photoHint)}</small></span><label class="photo-upload"><span id="photo-upload-visual">${photo ? `<img src="${h(photo)}" alt="선택된 사진">` : icon('photo')}</span><span><p id="photo-upload-label">${photo ? (draft.sample ? '보리의 예시 사진 선택됨' : '내 사진 선택됨 · 눌러서 변경') : '사진 한 장 선택하기'}</p><small>JPG · PNG · WEBP / 최대 5MB</small></span><input id="photo-input" type="file" accept="image/jpeg,image/png,image/webp" aria-label="아이 사진 선택"></label><p class="field-help">사진과 맞춤 내용은 서버로 전송하지 않으며, 새로고침하면 지워집니다.<br>현재는 대표 사진 1장 미리보기입니다. 최종 다중 사진 편집은 미연동입니다.</p>
    <div class="personalized-preview">${icon('heart')}<div><p id="personalization-title">${h(draft.name || '우리 아이')}의 작은 기억</p><small id="personalization-message">${h(draft.message || '좋아하는 순간을, 좋아하는 방식으로.')}</small></div></div><div class="detail-quantity"><span>수량</span><div id="detail-stepper">${stepper(state.quantity, 'detail')}</div></div><p id="product-error" class="form-error" role="alert"></p><button type="submit" class="button button-dark detail-submit"><span>${state.editId ? '맞춤 내용 수정하기' : '장바구니에 담기'}</span><span id="detail-total">${formatMoney(product.price * state.quantity)}</span></button><p class="field-help">실제 결제·제작은 진행되지 않습니다. 배송비는 정책 확정 후 별도 안내됩니다.</p></form>
    <dl class="detail-specs">${product.details.map(([key, value]) => `<div><dt>${h(key)}</dt><dd>${h(value)}</dd></div>`).join('')}</dl></div></div>`;
  openDialog('product', markup);
}
function syncDraftFromFields() {
  if (!state.draft) return;
  const form = $('#personalize-form');
  if (!form) return;
  state.draft.name = form.elements.petName.value;
  state.draft.message = form.elements.message.value;
  if (form.elements.letter) state.draft.letter = form.elements.letter.value;
}
function updateDraftPreview() {
  const draft = state.draft;
  if (!draft) return;
  $('#message-count').textContent = String(draft.message.length);
  $('#personalization-title').textContent = `${draft.name || '우리 아이'}의 작은 기억`;
  $('#personalization-message').textContent = draft.message || '좋아하는 순간을, 좋아하는 방식으로.';
}
async function choosePhoto(file) {
  const error = validateFileMetadata(file);
  if (error) { $('#product-error').textContent = error; return; }
  const token = ++state.uploadToken;
  state.photoBusy = true;
  $('#product-error').textContent = '';
  $('#photo-upload-label').textContent = '사진을 브라우저에서 준비하고 있어요…';
  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
    if (bitmap.width * bitmap.height > 30_000_000) throw new Error('사진 해상도가 너무 큽니다. 3,000만 화소 이하 이미지를 선택해주세요.');
    const ratio = Math.min(1, 1000 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
    canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('사진 미리보기를 준비하지 못했습니다.');
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const data = canvas.toDataURL('image/jpeg', 0.87);
    if (token !== state.uploadToken || state.modal !== 'product') return;
    state.draft.photo = data;
    state.draft.sample = false;
    $('#photo-upload-visual').innerHTML = `<img src="${h(data)}" alt="선택한 내 사진">`;
    $('#photo-upload-label').textContent = '내 사진 선택됨 · 눌러서 변경';
  } catch (err) {
    if (token === state.uploadToken && state.modal === 'product') {
      $('#product-error').textContent = err instanceof Error ? err.message : '이미지를 읽지 못했습니다.';
      $('#photo-upload-label').textContent = draftPhoto() ? '이전 사진 유지됨 · 다시 선택' : '다른 사진을 선택해주세요';
    }
  } finally {
    bitmap?.close();
    if (token === state.uploadToken) state.photoBusy = false;
  }
}
function renderCart() {
  const { subtotal, quantity } = calculateCart(state.cart);
  if (!state.cart.length) {
    openDialog('cart', `${dialogHeader('나의 장바구니')}<div class="empty-state">${icon('bag')}<h3>어떤 기억을 담아볼까요?</h3><p>우리 아이의 이야기를 간직할<br>작은 컬렉션을 골라보세요.</p><button type="button" class="button button-dark" data-action="browse">기억 컬렉션 둘러보기 ${icon('arrow')}</button></div>`, 'drawer');
    return;
  }
  const markup = state.cart.map(line => {
    const product = getProduct(line.productId);
    const variant = getVariant(product, line.variantId);
    return `<article class="cart-line" data-cart-line="${h(line.id)}"><div class="cart-thumbnail">${productArt(product, true)}</div><div><div class="cart-line-head"><h3>${h(product.name)}</h3><button type="button" class="remove-line" data-action="remove" data-id="${h(line.id)}" aria-label="${h(product.name)} 삭제">${icon('close')}</button></div><p>${h(variant.name)}</p>${line.personalization ? `<p>${h(line.personalization.name)}의 기억${line.personalization.sample ? ' · 예시 사진' : ''}</p>` : '<p class="cart-warning">새로고침으로 맞춤 내용이 지워졌어요.</p>'}<button type="button" class="mini-link" data-action="edit" data-id="${h(line.id)}">${line.personalization ? '맞춤 내용 수정' : '맞춤 내용 다시 입력'}</button><div class="cart-line-bottom">${stepper(line.quantity, 'cart', line.id)}<strong>${formatMoney(product.price * line.quantity)}</strong></div></div></article>`;
  }).join('');
  openDialog('cart', `${dialogHeader(`나의 장바구니 (${quantity})`)}<div class="cart-body">${markup}<p class="disclosure">아이 이름·사진·편지는 이 탭의 메모리에만 남습니다. 새로고침 후에는 상품·옵션·수량만 복원되며 맞춤 내용을 다시 입력해야 합니다.</p></div><div class="cart-footer"><div class="amount-row"><span>상품 합계</span><strong>${formatMoney(subtotal)}</strong></div><div class="amount-row muted"><span>배송비 · 최종 결제 금액</span><span>정책 확정 전</span></div><button type="button" class="button button-dark" data-action="checkout">주문 미리보기 ${icon('arrow')}</button><p>미리보기 전용 · 실제 주문이나 결제가 발생하지 않습니다.</p></div>`, 'drawer');
}
function renderArchive() {
  openDialog('archive', `${dialogHeader('이야기에서 시작하는 선물', 'FROM YOUR SOUL TRACE')}<div class="dialog-body"><p class="disclosure">기존 계정 연동 전입니다. 아래는 디자인에 사용된 보리의 예시 아카이브이며 실제 로그인이나 개인정보 조회는 하지 않습니다.</p><p class="archive-intro">사진과 편지에 담긴 마음을 불러와<br>우리 아이만의 컬렉션을 만들어보세요.</p><div class="sample-archive"><div class="sample-archive-head"><img class="sample-avatar" src="${asset('pet-bori.webp')}" alt="예시 반려견 보리"><div><h3>보리의 이야기</h3><p>EXAMPLE ARCHIVE · 데모 데이터</p></div></div><div class="sample-gallery">${SAMPLE_ARCHIVE.photos.map(file => `<img src="${asset(file)}" alt="보리 예시 사진">`).join('')}</div><p class="sample-letter">“${h(SAMPLE_ARCHIVE.message)}”</p></div><div class="archive-actions"><button type="button" class="button button-dark" data-action="connect-sample">${state.archive ? '예시 이야기로 계속하기' : '예시 이야기로 둘러보기'} ${icon('arrow')}</button>${state.archive ? '<button type="button" class="button button-outline" data-action="disconnect">연결 해제</button>' : ''}</div></div>`, 'compact');
}
function orderSummaryLines(lines) {
  return lines.map(line => { const product = getProduct(line.productId); return `<div class="summary-line"><p>${h(product.name)} × ${line.quantity}</p><small>${h(getVariant(product, line.variantId).name)} · ${h(line.personalization?.name || '맞춤 내용 미입력')}</small><strong>${formatMoney(product.price * line.quantity)}</strong></div>`; }).join('');
}
function renderCheckout() {
  if (!state.cart.length) { renderCart(); return; }
  const missing = state.cart.find(line => !line.personalization);
  if (missing) { openProduct(missing.productId, missing.id); toast('주문 전에 지워진 맞춤 내용을 다시 입력해주세요.'); return; }
  const { subtotal } = calculateCart(state.cart);
  openDialog('checkout', `${dialogHeader('주문 미리보기', 'REVIEW YOUR MEMORIES')}<div class="dialog-body checkout-grid"><form id="checkout-form" class="checkout-form"><div class="checkout-heading"><h3>배송 정보 · 테스트 입력</h3><button type="button" class="mini-link" data-action="fill-test">테스트 정보로 채우기</button></div><p class="disclosure">실제 개인정보 대신 테스트 정보를 사용해주세요. 입력한 정보는 서버로 전송하거나 브라우저 저장소에 보관하지 않으며 이 화면을 닫으면 사라집니다.</p><div class="two-fields"><label class="field"><span>수령인</span><input name="recipient" maxlength="50" required autocomplete="off" placeholder="테스트 이름"></label><label class="field"><span>연락처</span><input name="phone" maxlength="25" required autocomplete="off" inputmode="tel" placeholder="010-0000-0000"></label></div><label class="field"><span>이메일</span><input type="email" name="email" maxlength="254" required autocomplete="off" placeholder="sample@example.test"></label><div class="two-fields"><label class="field"><span>국가</span><select name="country" aria-label="배송 국가"><option value="KR">대한민국 · UI 예시</option></select></label><label class="field"><span>우편번호</span><input name="postal" maxlength="5" pattern="[0-9]{5}" required autocomplete="off" inputmode="numeric" placeholder="00000"></label></div><label class="field"><span>주소</span><input name="address" maxlength="200" required autocomplete="off" placeholder="테스트 주소를 입력해주세요"></label><label class="field"><span>상세 주소 <small>선택</small></span><input name="addressDetail" maxlength="150" autocomplete="off" placeholder="테스트 상세 주소"></label><label class="checkbox-row"><input name="reviewed" type="checkbox" required><span>상품, 옵션과 맞춤 내용을 확인했습니다.</span></label><label class="checkbox-row"><input name="demoAcknowledged" type="checkbox" required><span>실제 주문·결제·제작 요청이 발생하지 않는 미리보기임을 확인합니다.</span></label><p id="checkout-error" class="form-error" role="alert"></p><button type="submit" class="button button-dark">주문 미리보기 만들기 ${icon('arrow')}</button><button type="button" class="mini-link" data-action="cart">장바구니로 돌아가기</button></form><aside class="checkout-side"><h3>내가 고른 기억</h3>${orderSummaryLines(state.cart)}<div class="amount-row"><span>상품 합계</span><strong>${formatMoney(subtotal)}</strong></div><div class="amount-row muted"><span>배송비</span><span>정책 확정 전</span></div><div class="amount-row muted"><span>결제할 금액</span><span>아직 산정되지 않음</span></div><p class="disclosure">온라인 결제, 배송비·세금 계산과 주문 저장은 미연동입니다. 카드번호나 계좌 정보는 입력받지 않습니다.</p></aside></div>`);
}
function renderOrderResult() {
  const result = state.result;
  openDialog('result', `${dialogHeader('마음을 담아 준비했어요', 'ORDER PREVIEW · NOT A PURCHASE')}<div class="dialog-body"><div class="preview-result"><div class="success-mark">${icon('check')}</div><h3>주문 미리보기가 완성됐어요.</h3><p>실제 결제·주문 접수·제작 요청은 발생하지 않았습니다.<br>배송 정보는 저장하지 않았으며 아래 번호는 임시 미리보기 식별자입니다.</p><div class="preview-reference">${h(result.reference)}</div>${orderSummaryLines(state.cart)}<div class="amount-row"><span>상품 합계</span><strong>${formatMoney(result.subtotal)}</strong></div><div class="amount-row muted"><span>최종 결제 금액</span><span>배송 정책 확정 전 · 미결제</span></div><button type="button" class="button button-dark" data-action="browse">계속 둘러보기 ${icon('arrow')}</button></div></div>`, 'compact');
}
const INFO = {
  privacy: { title: '미리보기 개인정보 안내', body: `<p>이 스토어는 로컬 프런트엔드 데모입니다. 실제 회원가입, 로그인, 외부 AI 처리, 주문 API 또는 결제 API에 연결되지 않습니다.</p><h3>브라우저에 남는 정보</h3><p>장바구니의 상품 ID, 옵션, 수량과 임의 항목 ID만 로컬 저장소에 저장합니다. 이름, 사진, 편지, 주소, 이메일은 저장하지 않습니다. 이름·사진·문구는 열린 탭의 메모리에서만 사용하며 새로고침하거나 탭을 닫으면 사라집니다.</p><h3>사진과 배송 정보</h3><p>선택한 사진은 브라우저 안에서 크기를 조정해 미리보기로 표시하며 서버에 업로드하지 않습니다. 배송 정보는 주문 미리보기 검증에만 사용하며 해당 창을 닫으면 제거됩니다.</p><h3>외부 서비스</h3><p>분석, 광고, 세션 녹화, 외부 웹폰트와 원격 사진 서버를 사용하지 않습니다. 다만 웹으로 배포하는 경우 호스팅 업체의 접속 로그·쿠키 등은 별도로 점검해야 합니다.</p><h3>실판매 전</h3><p>현재 내용은 실제 SoulTrace 전체 서비스의 개인정보처리방침을 대체하지 않습니다. 계정·결제·배송·AI 처리 연결 시 실제 수탁사, 국외이전, 보관·삭제 및 국가별 요구를 반영한 최종 방침과 필요한 동의 절차를 게시해야 합니다.</p><button type="button" class="button button-outline" data-action="clear-local">이 데모의 저장 정보 모두 지우기</button>` },
  terms: { title: '이용 및 구매 안내', body: `<p>현재 사이트는 디자인과 구매 흐름을 검토하는 스토어 미리보기입니다. 상품 가격은 NFC 메모리카드 9,900원, 편지 세트 24,900원, 키링 49,900원으로 설정되어 있으나 실제 구매 계약이나 결제는 이루어지지 않습니다.</p><h3>상품 이미지와 구성</h3><p>제공된 이미지에서 제작한 디자인 시안입니다. 편지 세트 구성은 편지 · 엽서 · NFC 인식표입니다. NFC 인식표는 제공된 가죽 홀더 시안이며, 칩 사양과 최종 소재는 확인 예정입니다. 상품별 수량, 용지, 인쇄 영역, 판매 가능 여부는 실제 제작 및 검수 후 확정해야 합니다.</p><h3>배송·취소·교환</h3><p>배송비, 배송 국가, 제작 일정, 취소·교환·환불 정책은 미확정입니다. 맞춤 제작이라는 이유만으로 모든 환불이 불가능하다고 고지하지 않습니다. 실제 판매 지역과 상품 조건에 맞는 정책을 연결해야 합니다.</p><h3>범위</h3><p>대표 사진 한 장과 문구 미리보기를 제공합니다. 최종 인쇄 시안 승인, 다중 사진 편집, 실제 NFC 쓰기·전송, 주문 조회와 자동 제작은 포함되어 있지 않습니다.</p>` },
  support: { title: '운영 및 문의 안내', body: `<p>SoulTrace · Eternal Beam 메모리 상품 스토어의 개발용 시안입니다.</p><h3>실판매 준비 중인 항목</h3><p>사업자 법인명, 사업자등록·통신판매 관련 정보, 고객센터 연락처, 운영 시간, 실제 문의 접수 경로는 판매 전 확인하여 등록해야 합니다. 확인되지 않은 주소나 연락처는 임의로 기재하지 않았습니다.</p><h3>개발 연결 위치</h3><p>상품명과 가격·옵션은 src/catalog.mjs, 실제 API 연결 설계는 docs/INTEGRATION.md에서 관리할 수 있습니다. 지금은 실제 고객 문의를 서버로 받지 않습니다.</p>` },
};
function renderInfo(key) {
  const info = INFO[key];
  if (!info) return;
  openDialog('info', `${dialogHeader(info.title)}<div class="dialog-body info-copy">${info.body}</div>`, 'compact');
}

document.addEventListener('click', event => {
  const filter = event.target.closest('[data-filter]');
  if (filter) { state.filter = filter.dataset.filter; renderProducts(); return; }
  const button = event.target.closest('[data-action]');
  if (!button || button.disabled) return;
  const { action, product, id, variant, info, scope, delta } = button.dataset;
  switch (action) {
    case 'product': openProduct(product); break;
    case 'archive': renderArchive(); break;
    case 'cart': renderCart(); break;
    case 'close': closeDialog(); break;
    case 'browse': closeDialog(); $('#collection').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' }); break;
    case 'variant':
      if (!getVariant(getProduct(state.productId), variant)) break;
      state.variantId = variant;
      dialog.querySelectorAll('[data-action="variant"]').forEach(el => el.setAttribute('aria-pressed', String(el.dataset.variant === variant)));
      break;
    case 'quantity':
      try {
        if (scope === 'detail') {
          state.quantity = Math.min(SHOP.maxQuantity, Math.max(1, state.quantity + Number(delta)));
          $('#detail-stepper').innerHTML = stepper(state.quantity, 'detail');
          $('#detail-total').textContent = formatMoney(getProduct(state.productId).price * state.quantity);
        } else {
          const line = state.cart.find(item => item.id === id);
          if (!line) break;
          state.cart = changeQuantity(state.cart, id, line.quantity + Number(delta)); persistCart(); renderCart();
        }
      } catch (err) { toast(err.message); }
      break;
    case 'remove': state.cart = state.cart.filter(line => line.id !== id); persistCart(); renderCart(); break;
    case 'edit': { const line = state.cart.find(item => item.id === id); if (line) openProduct(line.productId, id); break; }
    case 'fill-archive': state.archive = SAMPLE_ARCHIVE; state.draft = defaultDraft(); state.uploadToken += 1; state.photoBusy = false; updateHeader(); renderProductDialog(); toast('보리의 예시 편지와 사진을 불러왔어요.'); break;
    case 'connect-sample': state.archive = SAMPLE_ARCHIVE; updateHeader(); closeDialog(); toast('보리의 예시 이야기가 연결됐어요.'); break;
    case 'disconnect': state.archive = null; updateHeader(); renderArchive(); toast('새 상품에 대한 예시 연결을 해제했어요. 기존 장바구니는 유지돼요.'); break;
    case 'checkout': renderCheckout(); break;
    case 'fill-test': {
      const form = $('#checkout-form');
      Object.entries({ recipient: '테스트 수령인', phone: '010-0000-0000', email: 'sample@example.test', postal: '00000', address: '테스트용 가상 주소입니다', addressDetail: '미리보기 전용 · 발송하지 않음' }).forEach(([key, value]) => { form.elements[key].value = value; });
      break;
    }
    case 'info': renderInfo(info); break;
    case 'clear-local':
      state.cart = []; state.archive = null; state.draft = null; updateHeader();
      try { localStorage.removeItem(SHOP.cartKey); } catch { /* No storage permission. */ }
      closeDialog(); toast('이 데모의 장바구니와 연결 정보를 지웠어요.'); break;
  }
});
document.addEventListener('input', event => {
  if (event.target.closest('#personalize-form') && event.target.id !== 'photo-input') { syncDraftFromFields(); updateDraftPreview(); $('#product-error').textContent = ''; }
});
document.addEventListener('change', event => { if (event.target.id === 'photo-input' && event.target.files?.[0]) choosePhoto(event.target.files[0]); });
document.addEventListener('submit', event => {
  if (event.target.id === 'personalize-form') {
    event.preventDefault();
    try {
      if (state.photoBusy) throw new Error('사진 준비가 끝난 뒤 담아주세요.');
      syncDraftFromFields();
      const contentError = meetsContentRule(getProduct(state.productId), state.draft);
      if (contentError) throw new Error(contentError);
      const line = createLine(state.productId, state.variantId, state.quantity, state.draft);
      if (state.editId) state.cart = state.cart.map(item => item.id === state.editId ? { ...line, id: state.editId } : item);
      else state.cart = addLine(state.cart, line);
      persistCart(); state.draft = null; state.uploadToken += 1; renderCart(); toast('우리 아이의 기억을 장바구니에 담았어요.');
    } catch (err) { $('#product-error').textContent = err.message; }
  }
  if (event.target.id === 'checkout-form') {
    event.preventDefault();
    const form = event.target;
    const delivery = { name: form.elements.recipient.value, phone: form.elements.phone.value, email: form.elements.email.value, postal: form.elements.postal.value, address: form.elements.address.value };
    const error = validateDelivery(delivery);
    if (error) { $('#checkout-error').textContent = error; return; }
    if (!form.elements.reviewed.checked || !form.elements.demoAcknowledged.checked) { $('#checkout-error').textContent = '미리보기 안내와 맞춤 내용을 확인해주세요.'; return; }
    if (!state.cart.length || state.cart.some(line => !line.personalization)) { $('#checkout-error').textContent = '장바구니와 맞춤 내용을 다시 확인해주세요.'; return; }
    // Deliberately does NOT fetch, post, charge, create an order, or retain delivery fields.
    state.result = { reference: `PREVIEW-${new Date().toISOString().slice(0,10).replaceAll('-','')}-${Math.random().toString(36).slice(2,6).toUpperCase()}`, subtotal: calculateCart(state.cart).subtotal };
    form.reset(); renderOrderResult();
  }
});
dialog.addEventListener('cancel', event => { event.preventDefault(); closeDialog(); });
dialog.addEventListener('click', event => { if (event.target !== dialog) return; const rect = dialog.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeDialog(); });
// Clear ephemeral personalization on back-forward cache entry as well, without altering cart metadata.
window.addEventListener('pagehide', () => { state.archive = null; state.cart = state.cart.map(({ id, productId, variantId, quantity }) => ({ id, productId, variantId, quantity, personalization: null })); state.draft = null; state.result = null; if (dialog.open) closeDialog(); });
window.addEventListener('pageshow', event => { if (event.persisted) { updateHeader(); } });
document.querySelectorAll('[data-asset]').forEach(image => { image.src = asset(image.dataset.asset); });
$('#faq-list').innerHTML = FAQS.map(([question, answer]) => `<details><summary>${h(question)}${icon('plus')}</summary><p>${h(answer)}</p></details>`).join('');
renderProducts(); updateHeader();
