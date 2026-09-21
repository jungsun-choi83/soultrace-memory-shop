import test from 'node:test';
import assert from 'node:assert/strict';
import { PRODUCTS } from '../src/catalog.mjs';
import { formatMoney } from '../src/core.mjs';
import { COPY, normalizeLang, copyFor, localizedProduct, localizedFaqs, localizeError, allProductIdsHaveEnglish } from '../src/i18n.mjs';

test('language defaults to Korean and only accepts ko/en', () => {
  assert.equal(normalizeLang(), 'ko');
  assert.equal(normalizeLang('en'), 'en');
  assert.equal(normalizeLang('ja'), 'ko');
  assert.equal(copyFor('en').heroCta, 'Choose a memory');
  assert.equal(copyFor('ko').heroCta, '우리 아이의 기억 고르기');
});

test('every catalog product has English copy', () => {
  assert.ok(allProductIdsHaveEnglish());
  const letter = localizedProduct(PRODUCTS.find(p => p.id === 'letter'), 'en');
  assert.equal(letter.name, 'A Letter, Kept Forever');
  assert.match(letter.details[0][1], /NFC tag/);
  assert.equal(localizedProduct(PRODUCTS[0], 'ko').name, PRODUCTS[0].name);
});

test('Korean and English copy share the same keys', () => {
  assert.deepEqual(Object.keys(COPY.ko).sort(), Object.keys(COPY.en).sort());
  assert.equal(localizedFaqs('ko').length, localizedFaqs('en').length);
});

test('English errors stay mapped and KRW is not USD', () => {
  assert.equal(localizeError('이 상품에는 사진이 필요해요. 저장된 사진 또는 내 사진을 선택해주세요.', 'en'), 'This item needs a photo. Choose a saved photo or your own.');
  assert.equal(localizeError('이 상품에는 사진이 필요해요. 저장된 사진 또는 내 사진을 선택해주세요.', 'ko'), '이 상품에는 사진이 필요해요. 저장된 사진 또는 내 사진을 선택해주세요.');
  assert.equal(formatMoney(24900, 'en'), '₩24,900');
});
