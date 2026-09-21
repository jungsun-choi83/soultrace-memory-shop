import { PRODUCTS, SHOP } from './catalog.mjs';

export function getProduct(id) {
  return PRODUCTS.find(product => product.id === id) ?? null;
}
export function getVariant(product, variantId) {
  return product?.variants.find(variant => variant.id === variantId) ?? null;
}
export function formatMoney(value, lang = 'ko') {
  if (!Number.isSafeInteger(value) || value < 0) throw new TypeError('금액은 0 이상의 안전한 정수여야 합니다.');
  const amount = new Intl.NumberFormat(lang === 'en' ? 'en-US' : 'ko-KR').format(value);
  return lang === 'en' ? `₩${amount}` : `${amount}원`;
}
export function validQuantity(value) {
  return Number.isSafeInteger(value) && value >= 1 && value <= SHOP.maxQuantity;
}
export function validatePersonalization(value) {
  if (!value || typeof value !== 'object') return '맞춤 내용을 입력해주세요.';
  if (typeof value.name !== 'string' || !value.name.trim()) return '아이 이름을 입력해주세요.';
  if (value.name.trim().length > 20) return '아이 이름은 20자 이내로 입력해주세요.';
  if (typeof value.message !== 'string' || value.message.length > 120) return '메시지는 120자 이내로 입력해주세요.';
  if (typeof value.letter !== 'string' || value.letter.length > 2000) return '편지는 2,000자 이내로 입력해주세요.';
  return null;
}
export function safePhotoSource(value) {
  if (typeof value !== 'string') return '';
  // No arbitrary third-party image URLs: images can only be predefined assets or local re-encoded data.
  if (/^data:image\/(?:jpeg|png|webp);base64,[a-zA-Z0-9+/=]+$/.test(value) && value.length <= 5_000_000) return value;
  return '';
}
export function hasPhoto(personalization) {
  return Boolean(safePhotoSource(personalization?.photo) || personalization?.sample === true);
}
export function meetsContentRule(product, personalization) {
  if (product?.photoRule === 'required' && !hasPhoto(personalization)) {
    return '이 상품에는 사진이 필요해요. 저장된 사진 또는 내 사진을 선택해주세요.';
  }
  if (product?.photoRule === 'letter-or-photo' && !hasPhoto(personalization) && !String(personalization?.letter || '').trim()) {
    return '편지 내용 또는 사진 중 하나를 담아주세요.';
  }
  return null;
}
export function makeId() {
  return globalThis.crypto?.randomUUID?.() ?? `line-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
export function createLine(productId, variantId, quantity, personalization) {
  const product = getProduct(productId);
  if (!product || !getVariant(product, variantId)) throw new Error('유효하지 않은 상품 옵션입니다.');
  if (!validQuantity(quantity)) throw new Error('수량은 1~9개로 선택해주세요.');
  const error = validatePersonalization(personalization) || meetsContentRule(product, personalization);
  if (error) throw new Error(error);
  return {
    id: makeId(), productId, variantId, quantity,
    personalization: {
      name: personalization.name.trim(), message: personalization.message.trim(),
      letter: personalization.letter.trim(), photo: safePhotoSource(personalization.photo),
      sample: personalization.sample === true,
      sourceArchiveId: /^[a-zA-Z0-9_-]{1,128}$/.test(personalization.sourceArchiveId || '') ? personalization.sourceArchiveId : '',
      sourcePhotoId: /^[a-zA-Z0-9_-]{1,128}$/.test(personalization.sourcePhotoId || '') ? personalization.sourcePhotoId : '',
      sourceTitle: typeof personalization.sourceTitle === 'string' ? personalization.sourceTitle.slice(0, 120) : '',
    },
  };
}
export function addLine(cart, line) {
  if (!Array.isArray(cart) || cart.length >= SHOP.maxCartLines) throw new Error('장바구니에는 최대 20개 항목을 담을 수 있어요.');
  return [...cart, line];
}
export function changeQuantity(cart, lineId, quantity) {
  if (!validQuantity(quantity)) throw new Error('수량은 1~9개로 선택해주세요.');
  return cart.map(line => line.id === lineId ? { ...line, quantity } : line);
}
export function calculateCart(cart) {
  let subtotal = 0;
  let quantity = 0;
  for (const line of cart) {
    const product = getProduct(line.productId);
    if (!product || !getVariant(product, line.variantId) || !validQuantity(line.quantity)) throw new Error('장바구니 항목이 유효하지 않습니다.');
    // Never trust an amount/price stored in a browser cart.
    subtotal += product.price * line.quantity;
    quantity += line.quantity;
  }
  return { subtotal, quantity, shipping: null, payableTotal: null };
}
export function serializeCart(cart) {
  // Intentionally exclude pet names, messages, letters, photos, addresses and authentication data.
  return JSON.stringify({ version: 1, lines: cart.map(({ id, productId, variantId, quantity }) => ({ id, productId, variantId, quantity })) });
}
export function restoreCart(raw) {
  if (typeof raw !== 'string' || raw.length > 20_000) return [];
  try {
    const data = JSON.parse(raw);
    if (data?.version !== 1 || !Array.isArray(data.lines)) return [];
    const ids = new Set();
    return data.lines.slice(0, SHOP.maxCartLines).filter(line => {
      if (!line || typeof line.id !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(line.id) || ids.has(line.id)) return false;
      const product = getProduct(line.productId);
      if (!product || !getVariant(product, line.variantId) || !validQuantity(line.quantity)) return false;
      ids.add(line.id);
      return true;
    }).map(({ id, productId, variantId, quantity }) => ({ id, productId, variantId, quantity, personalization: null }));
  } catch { return []; }
}
export function validateDelivery(data) {
  if (!data.name || data.name.trim().length > 50) return '수령인 이름을 확인해주세요.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email ?? '') || data.email.length > 254) return '이메일 형식을 확인해주세요.';
  if (!/^[+\d() .-]{7,25}$/.test(data.phone ?? '')) return '연락처 형식을 확인해주세요.';
  if (!/^\d{5}$/.test(data.postal ?? '')) return '우편번호 5자리를 입력해주세요.';
  if (!data.address || data.address.trim().length < 5 || data.address.length > 200) return '주소를 확인해주세요.';
  return null;
}
export function validateFileMetadata(file) {
  if (!file) return '사진을 선택해주세요.';
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return 'JPG, PNG, WEBP 파일만 사용할 수 있어요.';
  if (file.size <= 0 || file.size > 5 * 1024 * 1024) return '사진은 5MB 이하로 선택해주세요.';
  return null;
}
export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}
