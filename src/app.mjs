import { createArchiveApi } from './archive-api.mjs';
import { createArchiveFlow } from './archive-flow.mjs';
import { PRODUCTS, SHOP } from './catalog.mjs';
import { getProduct, getVariant, formatMoney, createLine, addLine, changeQuantity, calculateCart, serializeCart, restoreCart, validateDelivery, validateFileMetadata, escapeHtml, meetsContentRule } from './core.mjs';
import { readLang, persistLang, normalizeLang, copyFor, localizedProduct, localizedFaqs, localizeError } from './i18n.mjs';

const h = escapeHtml;
const icon = (name, className = '') => `<svg class="icon ${className}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const asset = name => globalThis.SOULTRACE_EMBEDDED_ASSETS?.[name] ?? new URL(`../assets/${name}`, import.meta.url).href;
const $ = selector => document.querySelector(selector);
const dialog = $('#shop-dialog');
const state = { cart: [], archive: null, filter: 'all', modal: null, infoKey: null, draft: null, productId: null, variantId: null, quantity: 1, editId: null, photoBusy: false, uploadToken: 0, previousFocus: null, result: null, lang: readLang() };
let toastTimer;
let archiveReturn = null;
let archiveFlow;
const archiveApi = createArchiveApi();
const privacyChannel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('soultrace-shop-privacy-v2') : null;
try { state.cart = restoreCart(localStorage.getItem(SHOP.cartKey)); } catch { /* Storage disabled: keep a functional in-memory cart. */ }
const t = key => copyFor(state.lang)[key];
const money = value => formatMoney(value, state.lang);
const err = message => localizeError(message, state.lang);
const productView = product => localizedProduct(product, state.lang);
function applyStaticCopy() {
  const copy = copyFor(state.lang);
  document.documentElement.lang = state.lang === 'en' ? 'en' : 'ko';
  document.title = copy.title;
  document.querySelector('meta[name="description"]')?.setAttribute('content', copy.metaDescription);
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const value = copy[el.dataset.i18n];
    if (typeof value !== 'string') return;
    if (el.dataset.i18nHtml === 'true') el.innerHTML = value;
    else el.textContent = value;
  });
  document.querySelectorAll('[data-i18n-aria]').forEach(el => {
    const value = copy[el.dataset.i18nAria];
    if (typeof value === 'string') el.setAttribute('aria-label', value);
  });
  document.querySelectorAll('[data-i18n-alt]').forEach(el => {
    const value = copy[el.dataset.i18nAlt];
    if (typeof value === 'string') el.setAttribute('alt', value);
  });
  document.querySelectorAll('[data-action="lang"]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.lang === state.lang)));
}
function renderFaqs() {
  $('#faq-list').innerHTML = localizedFaqs(state.lang).map(([question, answer]) => `<details><summary>${h(question)}${icon('plus')}</summary><p>${h(answer)}</p></details>`).join('');
}
function refreshOpenModal() {
  if (state.modal === 'product') renderProductDialog();
  else if (state.modal === 'cart') renderCart();
  else if (state.modal === 'archive') renderArchive();
  else if (state.modal === 'checkout') renderCheckout();
  else if (state.modal === 'result') renderOrderResult();
  else if (state.modal === 'info') renderInfo(state.infoKey);
}
function setLang(lang) {
  const next = normalizeLang(lang);
  if (state.modal === 'product') syncDraftFromFields();
  state.lang = next;
  persistLang(next);
  applyStaticCopy();
  renderProducts();
  renderFaqs();
  updateHeader();
  refreshOpenModal();
}

function productArt(product, thumbnail = false) {
  const view = productView(product);
  if (product.art === 'letter') return `<div class="product-art art-letter"><img src="${asset('letter-suite.webp')}" alt="${h(t('letterArtAlt'))}" loading="lazy" width="657" height="652"><img class="nfc-tag-cutout" src="${asset('photo-keyring.png')}" alt="${h(t('tagArtAlt'))}" loading="lazy" width="330" height="614"></div>`;
  if (product.art === 'book') return `<div class="product-art art-book"><img src="${asset('mini-book-front.webp')}" alt="${h(t('bookArtAlt'))}" loading="lazy" width="380" height="401"></div>`;
  return `<div class="product-art art-nfc" role="img" aria-label="${h(t('nfcArtAria'))}"><div class="nfc-card"><img src="${asset('pet-bori.webp')}" alt="" loading="lazy"><div class="nfc-card-meta"><span class="nfc-mark">${icon('spark')} NFC</span><strong>${thumbnail ? 'OPEN' : 'A MEMORY TO OPEN'}</strong><small>SOUL TRACE</small></div></div>${thumbnail ? '' : `<p class="nfc-card-caption">${h(t('nfcCaption'))}</p>`}</div>`;
}

function renderProducts() {
  const visible = PRODUCTS.filter(product => state.filter === 'all' || product.category === state.filter);
  $('#product-grid').innerHTML = visible.map(product => {
    const view = productView(product);
    return `<article class="product-card" data-product-card="${product.id}">
    <button type="button" class="product-visual-button" data-action="product" data-product="${product.id}" aria-label="${h(t('productDetailAria')(view.name))}"><span class="product-badge">${h(product.tag)}</span>${productArt(product)}<span class="product-quick">${h(t('makeMine'))} ${icon('plus')}</span></button>
    <div class="product-info"><div class="product-overline"><span>${h(product.english.toUpperCase())}</span><div class="color-dots" aria-label="${h(view.variants.map(v => v.name).join(', '))}">${view.variants.map(v => `<span class="color-dot" style="--swatch:${v.color}"></span>`).join('')}</div></div><h3 class="product-title"><button type="button" data-action="product" data-product="${product.id}">${h(view.name)}</button></h3><p class="product-short">${h(view.short)}</p><p class="product-price">${money(product.price)}<span>${h(t('madeToOrder'))}</span></p></div>
  </article>`;
  }).join('');
  $('#collection-count').textContent = t('collectionCount')(visible.length);
  document.querySelectorAll('[data-filter]').forEach(button => { const active = button.dataset.filter === state.filter; button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active)); });
}
function updateHeader() {
  const { quantity } = calculateCart(state.cart);
  $('#cart-count').textContent = String(quantity);
  $('#cart-count').hidden = quantity === 0;
  $('.cart-trigger').setAttribute('aria-label', t('cartAria')(quantity));
  $('#archive-header-label').textContent = state.archive ? t('storyOf')(state.archive.name) : t('myStory');
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
  return `<div class="dialog-header"><div><p class="eyebrow">${h(eyebrow)}</p><h2 id="dialog-title" tabindex="-1">${h(title)}</h2></div><button class="icon-button dialog-close" type="button" data-action="close" aria-label="${h(t('close'))}">${icon('close')}</button></div>`;
}
function openDialog(kind, markup, className = '') {
  if (!dialog.open) state.previousFocus = document.activeElement;
  state.modal = kind;
  if (kind !== 'archive') delete dialog.dataset.flow;
  dialog.className = className;
  dialog.innerHTML = markup;
  if (!dialog.open) dialog.showModal();
  document.body.style.overflow = 'hidden';
  dialog.scrollTop = 0;
  $('#dialog-title')?.focus({ preventScroll: true });
}
function closePlainDialog() {
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
function closeDialog() {
  if (state.modal === 'archive') {
    archiveFlow?.cancel();
    if (archiveReturn) { restoreProduct(); return; }
  }
  closePlainDialog();
}
function emptyDraft() { return { name: '', message: '', letter: '', photo: '', sample: false }; }
function defaultDraft() {
  return state.archive ? { name: state.archive.name, message: state.archive.message, letter: state.archive.letter,
    photo: state.archive.photo || '', sample: state.archive.sample === true, sourceArchiveId: state.archive.id,
    sourcePhotoId: state.archive.photoId || '', sourceTitle: state.archive.title } : emptyDraft();
}
function restoreProduct(selection = null, manual = false) {
  const saved = archiveReturn; archiveReturn = null;
  if (saved) {
    Object.assign(state, saved);
    if (selection) state.draft = defaultDraft();
    else if (manual) state.draft = saved.draft || emptyDraft();
    state.photoBusy = false; state.uploadToken += 1;
    renderProductDialog();
  } else if (selection) { closePlainDialog(); document.querySelector('#collection').scrollIntoView({ behavior: 'smooth' }); }
  else if (manual) { state.archive = null; updateHeader(); closePlainDialog(); openProduct('letter'); }
  else closePlainDialog();
}
function clearPrivateContent(reason = 'expired', broadcast = false) {
  state.archive = null;
  state.cart = state.cart.map(line => (reason !== 'unauthenticated' || line.personalization?.sourceArchiveId) ? { ...line, personalization: null } : line);
  if (state.draft && (reason !== 'unauthenticated' || state.draft.sourceArchiveId)) state.draft = emptyDraft();
  if (archiveReturn?.draft && (reason !== 'unauthenticated' || archiveReturn.draft.sourceArchiveId)) archiveReturn.draft = emptyDraft();
  state.result = null; state.uploadToken += 1; state.photoBusy = false;
  persistCart();
  if (state.modal === 'product' && state.draft) renderProductDialog();
  else if (state.modal === 'cart') renderCart();
  else if (['checkout','result'].includes(state.modal)) closePlainDialog();
  if (broadcast) privacyChannel?.postMessage({ type: 'clear-private' });
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
  return `<div class="stepper" aria-label="${h(t('qtyAria'))}"><button type="button" data-action="quantity" data-scope="${scope}" data-id="${h(id)}" data-delta="-1" aria-label="${h(t('qtyDown'))}" ${value <= 1 ? 'disabled' : ''}>${icon('minus')}</button><output aria-live="polite">${value}</output><button type="button" data-action="quantity" data-scope="${scope}" data-id="${h(id)}" data-delta="1" aria-label="${h(t('qtyUp'))}" ${value >= SHOP.maxQuantity ? 'disabled' : ''}>${icon('plus')}</button></div>`;
}
function draftPhoto() { return state.draft?.photo || (state.draft?.sample ? asset('pet-bori.webp') : ''); }
function renderProductDialog() {
  const product = getProduct(state.productId);
  const view = productView(product);
  const draft = state.draft;
  const photo = draftPhoto();
  const photoHint = product.photoRule === 'required' ? t('photoRequired') : product.photoRule === 'letter-or-photo' ? t('photoEither') : t('photoOptional');
  const letterHint = product.photoRule === 'letter-or-photo' ? t('letterOrPhoto') : t('letterOptional');
  const variantNote = product.id === 'minibook' ? t('variantBook') : product.id === 'nfc' ? t('variantNfc') : t('variantLetter');
  const markup = `${dialogHeader(t('dialogPersonalize'), 'PERSONALIZE YOUR MEMORY')}<div class="dialog-body product-detail"><div class="detail-visual">${productArt(product)}<div class="detail-gallery-note">${h(t('galleryNote'))}<br><span id="variant-note">${h(variantNote)}</span></div></div><div class="detail-info"><p class="eyebrow">${h(product.english.toUpperCase())}</p><h3>${h(view.name)}</h3><p class="product-price">${money(product.price)}</p><p class="detail-description">${h(view.description)}</p><p class="option-label">${h(t('colorLabel'))} <span class="field-help">${h(t('optionDraft'))}</span></p><div class="variant-buttons">${view.variants.map(variant => `<button type="button" class="variant-button" data-action="variant" data-variant="${variant.id}" aria-pressed="${state.variantId === variant.id}"><span class="swatch" style="--swatch:${variant.color}"></span>${h(variant.name)}</button>`).join('')}</div>
    <form id="personalize-form" class="detail-form"><div class="form-heading"><strong>${h(t('storyHeading'))}</strong><button class="mini-link" type="button" data-action="fill-archive">${h(t('loadSample'))}</button></div>${draft.sourceArchiveId ? `<div class="source-letter-badge">✉ ${h(draft.sourceTitle || t('selectedLetter'))}<small>${h(t('sourceLetterNote'))}</small></div>` : ''}<label class="field"><span>${h(t('petName'))} <small>${h(t('required20'))}</small></span><input name="petName" value="${h(draft.name)}" maxlength="20" required placeholder="${h(t('namePlaceholder'))}" autocomplete="off"></label><label class="field"><span>${h(t('oneSentence'))} <small><span id="message-count">${draft.message.length}</span>/120</small></span><textarea name="message" maxlength="120" rows="3" placeholder="${h(t('messagePlaceholder'))}">${h(draft.message)}</textarea></label>
    ${product.showsLetter ? `<label class="field"><span>${h(t('letterLabel'))} <small>${h(letterHint)}</small></span><textarea name="letter" maxlength="2000" rows="5" placeholder="${h(t('letterPlaceholder'))}">${h(draft.letter)}</textarea></label>` : ''}
    <span class="field-label">${h(t('photoLabel'))} <small>${h(photoHint)}</small></span><label class="photo-upload"><span id="photo-upload-visual">${photo ? `<img src="${h(photo)}" alt="${h(t('photoSelectedAlt'))}">` : icon('photo')}</span><span><p id="photo-upload-label">${photo ? (draft.sample ? t('photoSample') : t('photoMine')) : t('photoChoose')}</p><small>JPG · PNG · WEBP / 5MB</small></span><input id="photo-input" type="file" accept="image/jpeg,image/png,image/webp" aria-label="${h(t('photoAria'))}"></label><p class="field-help">${t('photoHelp')}</p>
    <div class="personalized-preview">${icon('heart')}<div><p id="personalization-title">${h(t('memoryOf')(draft.name))}</p><small id="personalization-message">${h(draft.message || t('memoryFallback'))}</small></div></div><div class="detail-quantity"><span>${h(t('quantity'))}</span><div id="detail-stepper">${stepper(state.quantity, 'detail')}</div></div><p id="product-error" class="form-error" role="alert"></p><button type="submit" class="button button-dark detail-submit"><span>${h(state.editId ? t('editCart') : t('addCart'))}</span><span id="detail-total">${money(product.price * state.quantity)}</span></button><p class="field-help">${h(t('payHelp'))}</p></form>
    <dl class="detail-specs">${view.details.map(([key, value]) => `<div><dt>${h(key)}</dt><dd>${h(value)}</dd></div>`).join('')}</dl></div></div>`;
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
  $('#personalization-title').textContent = t('memoryOf')(draft.name);
  $('#personalization-message').textContent = draft.message || t('memoryFallback');
}
async function choosePhoto(file) {
  const error = validateFileMetadata(file);
  if (error) { $('#product-error').textContent = err(error); return; }
  const token = ++state.uploadToken;
  state.photoBusy = true;
  $('#product-error').textContent = '';
  $('#photo-upload-label').textContent = t('photoPreparing');
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
    $('#photo-upload-visual').innerHTML = `<img src="${h(data)}" alt="${h(t('photoMineAlt'))}">`;
    $('#photo-upload-label').textContent = t('photoMine');
  } catch (error) {
    if (token === state.uploadToken && state.modal === 'product') {
      $('#product-error').textContent = err(error instanceof Error ? error.message : '이미지를 읽지 못했습니다.');
      $('#photo-upload-label').textContent = draftPhoto() ? t('photoKeep') : t('photoRetry');
    }
  } finally {
    bitmap?.close();
    if (token === state.uploadToken) state.photoBusy = false;
  }
}
function renderCart() {
  const { subtotal, quantity } = calculateCart(state.cart);
  if (!state.cart.length) {
    openDialog('cart', `${dialogHeader(t('cartTitle'))}<div class="empty-state">${icon('bag')}<h3>${h(t('emptyTitle'))}</h3><p>${t('emptyBody')}</p><button type="button" class="button button-dark" data-action="browse">${h(t('browse'))} ${icon('arrow')}</button></div>`, 'drawer');
    return;
  }
  const markup = state.cart.map(line => {
    const product = getProduct(line.productId);
    const view = productView(product);
    const variant = getVariant(view, line.variantId);
    return `<article class="cart-line" data-cart-line="${h(line.id)}"><div class="cart-thumbnail">${productArt(product, true)}</div><div><div class="cart-line-head"><h3>${h(view.name)}</h3><button type="button" class="remove-line" data-action="remove" data-id="${h(line.id)}" aria-label="${h(t('removeAria')(view.name))}">${icon('close')}</button></div><p>${h(variant.name)}</p>${line.personalization ? `<p>${h(t('memoryOf')(line.personalization.name))}${line.personalization.sample ? h(t('samplePhotoNote')) : ''}</p>` : `<p class="cart-warning">${h(t('lostPersonalization'))}</p>`}<button type="button" class="mini-link" data-action="edit" data-id="${h(line.id)}">${h(line.personalization ? t('editPersonalization') : t('reenterPersonalization'))}</button><div class="cart-line-bottom">${stepper(line.quantity, 'cart', line.id)}<strong>${money(product.price * line.quantity)}</strong></div></div></article>`;
  }).join('');
  openDialog('cart', `${dialogHeader(t('cartTitleN')(quantity))}<div class="cart-body">${markup}<p class="disclosure">${h(t('cartDisclosure'))}</p></div><div class="cart-footer"><div class="amount-row"><span>${h(t('subtotal'))}</span><strong>${money(subtotal)}</strong></div><div class="amount-row muted"><span>${h(t('shippingTotal'))}</span><span>${h(t('policyPending'))}</span></div><button type="button" class="button button-dark" data-action="checkout">${h(t('checkoutCta'))} ${icon('arrow')}</button><p>${h(t('previewOnly'))}</p></div>`, 'drawer');
}
function renderArchive() {
  if (state.modal === 'product' && state.draft) {
    syncDraftFromFields();
    archiveReturn = { productId: state.productId, variantId: state.variantId, quantity: state.quantity,
      editId: state.editId, draft: { ...state.draft }, infoKey: state.infoKey };
    state.uploadToken += 1; state.photoBusy = false;
  } else archiveReturn = null;
  archiveFlow.open();
}
function orderSummaryLines(lines) {
  return lines.map(line => {
    const product = getProduct(line.productId);
    const view = productView(product);
    return `<div class="summary-line"><p>${h(view.name)} × ${line.quantity}</p><small>${h(getVariant(view, line.variantId).name)} · ${h(line.personalization?.name || t('missingPersonalization'))}</small><strong>${money(product.price * line.quantity)}</strong></div>`;
  }).join('');
}
function renderCheckout() {
  if (!state.cart.length) { renderCart(); return; }
  const missing = state.cart.find(line => !line.personalization);
  if (missing) { openProduct(missing.productId, missing.id); toast(t('toastNeedPersonalization')); return; }
  const { subtotal } = calculateCart(state.cart);
  openDialog('checkout', `${dialogHeader(t('checkoutTitle'), 'REVIEW YOUR MEMORIES')}<div class="dialog-body checkout-grid"><form id="checkout-form" class="checkout-form"><div class="checkout-heading"><h3>${h(t('checkoutHeading'))}</h3><button type="button" class="mini-link" data-action="fill-test">${h(t('fillTest'))}</button></div><p class="disclosure">${h(t('checkoutDisclosure'))}</p><div class="two-fields"><label class="field"><span>${h(t('recipient'))}</span><input name="recipient" maxlength="50" required autocomplete="off" placeholder="${h(t('recipientPh'))}"></label><label class="field"><span>${h(t('phone'))}</span><input name="phone" maxlength="25" required autocomplete="off" inputmode="tel" placeholder="010-0000-0000"></label></div><label class="field"><span>${h(t('email'))}</span><input type="email" name="email" maxlength="254" required autocomplete="off" placeholder="sample@example.test"></label><div class="two-fields"><label class="field"><span>${h(t('country'))}</span><select name="country" aria-label="${h(t('countryAria'))}"><option value="KR">${h(t('countryOption'))}</option></select></label><label class="field"><span>${h(t('postal'))}</span><input name="postal" maxlength="5" pattern="[0-9]{5}" required autocomplete="off" inputmode="numeric" placeholder="00000"></label></div><label class="field"><span>${h(t('address'))}</span><input name="address" maxlength="200" required autocomplete="off" placeholder="${h(t('addressPh'))}"></label><label class="field"><span>${h(t('addressDetail'))} <small>${h(t('optional'))}</small></span><input name="addressDetail" maxlength="150" autocomplete="off" placeholder="${h(t('addressDetailPh'))}"></label><label class="checkbox-row"><input name="reviewed" type="checkbox" required><span>${h(t('reviewed'))}</span></label><label class="checkbox-row"><input name="demoAcknowledged" type="checkbox" required><span>${h(t('demoAck'))}</span></label><p id="checkout-error" class="form-error" role="alert"></p><button type="submit" class="button button-dark">${h(t('makePreview'))} ${icon('arrow')}</button><button type="button" class="mini-link" data-action="cart">${h(t('backCart'))}</button></form><aside class="checkout-side"><h3>${h(t('chosen'))}</h3>${orderSummaryLines(state.cart)}<div class="amount-row"><span>${h(t('subtotal'))}</span><strong>${money(subtotal)}</strong></div><div class="amount-row muted"><span>${h(t('shipping'))}</span><span>${h(t('policyPending'))}</span></div><div class="amount-row muted"><span>${h(t('payable'))}</span><span>${h(t('notPriced'))}</span></div><p class="disclosure">${h(t('checkoutSideNote'))}</p></aside></div>`);
}
function renderOrderResult() {
  const result = state.result;
  openDialog('result', `${dialogHeader(t('resultTitle'), 'ORDER PREVIEW · NOT A PURCHASE')}<div class="dialog-body"><div class="preview-result"><div class="success-mark">${icon('check')}</div><h3>${h(t('resultHeading'))}</h3><p>${t('resultBody')}</p><div class="preview-reference">${h(result.reference)}</div>${orderSummaryLines(state.cart)}<div class="amount-row"><span>${h(t('subtotal'))}</span><strong>${money(result.subtotal)}</strong></div><div class="amount-row muted"><span>${h(t('finalPay'))}</span><span>${h(t('unpaid'))}</span></div><button type="button" class="button button-dark" data-action="browse">${h(t('keepBrowsing'))} ${icon('arrow')}</button></div></div>`, 'compact');
}
function renderInfo(key) {
  state.infoKey = key;
  const titles = { privacy: t('privacyTitle'), terms: t('termsTitle'), support: t('supportTitle') };
  const bodies = { privacy: t('privacyBody'), terms: t('termsBody'), support: t('supportBody') };
  if (!titles[key]) return;
  const extra = key === 'privacy' ? `<button type="button" class="button button-outline" data-action="clear-local">${h(t('clearLocal'))}</button>` : '';
  openDialog('info', `${dialogHeader(titles[key])}<div class="dialog-body info-copy">${bodies[key]}${extra}</div>`, 'compact');
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
          $('#detail-total').textContent = money(getProduct(state.productId).price * state.quantity);
        } else {
          const line = state.cart.find(item => item.id === id);
          if (!line) break;
          state.cart = changeQuantity(state.cart, id, line.quantity + Number(delta)); persistCart(); renderCart();
        }
      } catch (error) { toast(err(error.message)); }
      break;
    case 'remove': state.cart = state.cart.filter(line => line.id !== id); persistCart(); renderCart(); break;
    case 'edit': { const line = state.cart.find(item => item.id === id); if (line) openProduct(line.productId, id); break; }
    case 'lang': setLang(button.dataset.lang); break;
    case 'fill-archive': renderArchive(); break;
    case 'disconnect': renderArchive(); break;
    case 'checkout': renderCheckout(); break;
    case 'fill-test': {
      const form = $('#checkout-form');
      Object.entries({ recipient: t('testRecipient'), phone: '010-0000-0000', email: 'sample@example.test', postal: '00000', address: t('testAddress'), addressDetail: t('testAddressDetail') }).forEach(([key, value]) => { form.elements[key].value = value; });
      break;
    }
    case 'info': renderInfo(info); break;
    case 'clear-local':
      state.cart = []; clearPrivateContent('logout', true); archiveApi.bootstrap().then(() => archiveApi.logout()).catch(() => toast(t('toastLogoutFail'))); updateHeader();
      try { localStorage.removeItem(SHOP.cartKey); } catch { /* No storage permission. */ }
      closeDialog(); toast(t('toastCleared')); break;
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
      if (state.photoBusy) throw new Error(t('photoBusy'));
      syncDraftFromFields();
      const contentError = meetsContentRule(getProduct(state.productId), state.draft);
      if (contentError) throw new Error(contentError);
      const line = createLine(state.productId, state.variantId, state.quantity, state.draft);
      if (state.editId) state.cart = state.cart.map(item => item.id === state.editId ? { ...line, id: state.editId } : item);
      else state.cart = addLine(state.cart, line);
      persistCart(); state.draft = null; state.uploadToken += 1; renderCart(); toast(t('toastAdded'));
    } catch (error) { $('#product-error').textContent = err(error.message); }
  }
  if (event.target.id === 'checkout-form') {
    event.preventDefault();
    const form = event.target;
    const delivery = { name: form.elements.recipient.value, phone: form.elements.phone.value, email: form.elements.email.value, postal: form.elements.postal.value, address: form.elements.address.value };
    const error = validateDelivery(delivery);
    if (error) { $('#checkout-error').textContent = err(error); return; }
    if (!form.elements.reviewed.checked || !form.elements.demoAcknowledged.checked) { $('#checkout-error').textContent = t('checkoutNeedAck'); return; }
    if (!state.cart.length || state.cart.some(line => !line.personalization)) { $('#checkout-error').textContent = t('checkoutNeedCart'); return; }
    // Deliberately does NOT fetch, post, charge, create an order, or retain delivery fields.
    state.result = { reference: `PREVIEW-${new Date().toISOString().slice(0,10).replaceAll('-','')}-${Math.random().toString(36).slice(2,6).toUpperCase()}`, subtotal: calculateCart(state.cart).subtotal };
    form.reset(); renderOrderResult();
  }
});
dialog.addEventListener('cancel', event => { event.preventDefault(); closeDialog(); });
dialog.addEventListener('click', event => { if (event.target !== dialog) return; const rect = dialog.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeDialog(); });
// Clear ephemeral personalization on back-forward cache entry as well, without altering cart metadata.
window.addEventListener('pagehide', () => { archiveReturn = null; archiveFlow?.cancel(); state.archive = null; state.cart = state.cart.map(({ id, productId, variantId, quantity }) => ({ id, productId, variantId, quantity, personalization: null })); state.draft = null; state.result = null; if (dialog.open) closePlainDialog(); });
window.addEventListener('pageshow', event => { if (event.persisted) { updateHeader(); } });
document.querySelectorAll('[data-asset]').forEach(image => { image.src = asset(image.dataset.asset); });
applyStaticCopy();
renderFaqs();
archiveFlow = createArchiveFlow({ api: archiveApi, openDialog, closeDialog: closePlainDialog, dialogHeader,
  onSelected(selection) { state.archive = selection; updateHeader(); restoreProduct(selection); toast(t('toastStorySelected')(selection.name)); },
  onCleared(reason) { clearPrivateContent(reason, reason === 'logout'); },
  onCancelled(manual) { restoreProduct(null, manual); }, notify: toast });
privacyChannel?.addEventListener('message', event => { if (event.data?.type === 'clear-private') { archiveFlow.cancel(); clearPrivateContent('logout'); if (state.modal === 'archive') closePlainDialog(); } });
renderProducts();
updateHeader();
