"""Offline Chromium interaction tests. Optional: pip install playwright; chromium installed.
Runs the standalone artifact via set_content; no live backend is exercised.
The harness supplies a localStorage test double because this runner blocks all navigations.
"""
from pathlib import Path
import json
import os
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
HTML = (ROOT / 'preview.html').read_text()
OUT = ROOT / 'docs' / 'screenshots'
OUT.mkdir(parents=True, exist_ok=True)
passed = []
errors = []
network = []

def ok(name):
    passed.append(name)
    print(f'PASS {name}')

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'), headless=True, args=['--no-sandbox'])
    def make_page(width=1440, height=1000, stored=None):
        page = browser.new_page(viewport={'width':width,'height':height}, reduced_motion='reduce')
        page.set_default_timeout(5000)
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.on('request', lambda r: network.append(r.url) if r.url.startswith(('http:','https:')) else None)
        page.evaluate('''value => {
          const entries = new Map(Object.entries(value || {}));
          Object.defineProperty(window, 'localStorage', { configurable: true, value: {
            getItem(k){ return entries.has(k) ? entries.get(k) : null; },
            setItem(k,v){ entries.set(k,String(v)); }, removeItem(k){ entries.delete(k); },
            clear(){entries.clear();}, key(i){return [...entries.keys()][i] || null;}, get length(){return entries.size;}
          }});
        }''', stored or {})
        page.set_content(HTML, wait_until='load')
        expect(page.locator('[data-product-card]')).to_have_count(3)
        return page

    page = make_page()
    for text in ['24,900원','49,900원','9,900원']:
        expect(page.locator('#product-grid').get_by_text(text, exact=False)).to_be_visible()
    assert page.evaluate('Array.from(document.images).every(i => i.complete && i.naturalWidth > 0)')
    ok('home: 3 exact prices, all images loaded, zero remote assets')
    page.locator('[data-filter="carry"]').click()
    expect(page.locator('[data-product-card]')).to_have_count(1)
    expect(page.locator('[data-product-card="minibook"]')).to_be_visible()
    page.locator('[data-filter="paper"]').click()
    expect(page.locator('[data-product-card]')).to_have_count(1)
    expect(page.locator('[data-product-card="letter"]')).to_be_visible()
    page.locator('[data-filter="nfc"]').click()
    expect(page.locator('[data-product-card="nfc"]')).to_be_visible()
    page.locator('[data-filter="all"]').click()
    ok('catalog category filters')
    page.locator('.archive-link').click()
    expect(page.locator('#shop-dialog')).to_contain_text('실제 로그인이나 개인정보 조회는 하지 않습니다')
    page.locator('[data-action="connect-sample"]').click()
    expect(page.locator('#archive-header-label')).to_have_text('보리의 이야기')
    ok('explicit demo archive connect')
    page.locator('[data-product-card="letter"] [data-action="product"]').first.click()
    expect(page.locator('input[name="petName"]')).to_have_value('보리')
    page.locator('input[name="petName"]').fill('나비')
    page.locator('textarea[name="message"]').fill('<img src=x onerror="alert(1)"> 고마워')
    assert page.locator('#personalization-message img').count() == 0
    expect(page.locator('#personalization-message')).to_contain_text('<img')
    page.locator('[data-action="variant"][data-variant="blue"]').click()
    page.locator('[data-scope="detail"][data-delta="1"]').click()
    expect(page.locator('#detail-total')).to_have_text('49,800원')
    page.locator('[data-scope="detail"][data-delta="-1"]').click()
    page.locator('#personalize-form button[type="submit"]').click()
    expect(page.locator('.cart-line')).to_have_count(1)
    expect(page.locator('.cart-line')).to_contain_text('더스티 블루')
    expect(page.locator('.cart-line')).to_contain_text('나비의 기억')
    stored = page.evaluate('localStorage.getItem("soultrace-shop:cart:v1")')
    assert not any(x in stored for x in ['나비','고마워','personalization','photo','message'])
    ok('letter personalization, escaping, variants, quantity and storage privacy')
    page.locator('[data-scope="cart"][data-delta="1"]').click()
    expect(page.locator('.cart-footer')).to_contain_text('49,800원')
    page.locator('[data-scope="cart"][data-delta="-1"]').click()
    expect(page.locator('.cart-footer')).to_contain_text('24,900원')
    ok('cart quantity recalculates from catalog')
    page.locator('[data-action="close"]').click()
    for product in ['nfc','minibook']:
        page.locator(f'[data-product-card="{product}"] [data-action="product"]').first.click()
        if product == 'minibook':
            page.locator('[data-action="variant"][data-variant="mocha"]').click()
            page.screenshot(path=str(OUT/'desktop-product.png'))
        page.locator('#personalize-form button[type="submit"]').click()
        if product == 'nfc': page.locator('[data-action="close"]').click()
    expect(page.locator('.cart-line')).to_have_count(3)
    expect(page.locator('.cart-footer')).to_contain_text('84,700원')
    expect(page.locator('.cart-footer')).to_contain_text('정책 확정 전')
    page.screenshot(path=str(OUT/'desktop-cart.png'))
    ok('all 3 products: 84,700 KRW subtotal, shipping remains unknown')
    stored = page.evaluate('localStorage.getItem("soultrace-shop:cart:v1")')
    page.locator('[data-action="checkout"]').click()
    page.locator('[data-action="fill-test"]').click()
    page.locator('input[name="email"]').fill('invalid-email')
    page.locator('#checkout-form button[type="submit"]').click()
    expect(page.locator('#checkout-form')).to_be_visible()
    page.locator('input[name="email"]').fill('sample@example.test')
    page.locator('input[name="reviewed"]').check()
    page.locator('input[name="demoAcknowledged"]').check()
    page.screenshot(path=str(OUT/'desktop-checkout.png'))
    page.locator('#checkout-form button[type="submit"]').click()
    expect(page.locator('.preview-result')).to_contain_text('실제 결제·주문 접수·제작 요청은 발생하지 않았습니다')
    expect(page.locator('.preview-result')).to_contain_text('84,700원')
    assert page.locator('input[name="email"]').count() == 0
    assert 'sample@example.test' not in page.evaluate('localStorage.getItem("soultrace-shop:cart:v1")')
    ok('checkout validation, explicit demo confirmation, no charge/order/network/PII persistence')
    page.keyboard.press('Escape')
    assert not page.locator('#shop-dialog').evaluate('(d) => d.open')
    assert page.evaluate('document.body.style.overflow') == ''
    ok('Escape closes native dialog and releases scroll lock')
    reloaded = make_page(stored={'soultrace-shop:cart:v1':stored})
    reloaded.locator('.cart-trigger').click()
    expect(reloaded.locator('.cart-line')).to_have_count(3)
    expect(reloaded.locator('.cart-body')).to_contain_text('새로고침으로 맞춤 내용이 지워졌어요')
    reloaded.locator('[data-action="checkout"]').click()
    expect(reloaded.locator('#personalize-form')).to_be_visible()
    expect(reloaded.locator('input[name="petName"]')).to_have_value('')
    ok('restoration rehydrates cart metadata only and blocks checkout until personalized')
    upload = make_page(width=390,height=844)
    upload.locator('[data-product-card="minibook"] [data-action="product"]').first.click()
    upload.locator('input[name="petName"]').fill('테스트펫')
    upload.locator('#personalize-form button[type="submit"]').click()
    expect(upload.locator('#product-error')).to_contain_text('사진이 필요해요')
    upload.locator('#photo-input').set_input_files({'name':'not-image.svg','mimeType':'image/svg+xml','buffer':b'<svg></svg>'})
    expect(upload.locator('#product-error')).to_contain_text('JPG, PNG, WEBP')
    upload.locator('#photo-input').set_input_files(str(ROOT/'assets/pet-bori.webp'))
    expect(upload.locator('#photo-upload-label')).to_contain_text('내 사진 선택됨')
    assert upload.locator('#photo-upload-visual img').get_attribute('src').startswith('data:image/jpeg;base64,')
    upload.locator('#personalize-form button[type="submit"]').click()
    expect(upload.locator('.cart-line')).to_contain_text('테스트펫')
    upload.screenshot(path=str(OUT/'mobile-cart.png'))
    ok('photo required for mini book, invalid type rejected, local photo preview/add works')
    upload.locator('[data-action="remove"]').click()
    expect(upload.locator('.empty-state')).to_be_visible()
    ok('remove last item shows empty cart')
    for width in [320,390,768,1024,1440]:
        view = make_page(width=width,height=900)
        assert view.evaluate('document.documentElement.scrollWidth <= innerWidth'), f'overflow at {width}'
        view.locator('[data-product-card="nfc"] [data-action="product"]').first.click()
        assert view.locator('#shop-dialog').evaluate('(d) => d.scrollWidth <= d.clientWidth + 1'), f'dialog overflow at {width}'
        view.keyboard.press('Escape')
        view.close()
    ok('responsive home and product dialog: 320/390/768/1024/1440px without horizontal overflow')
    privacy = make_page(stored={'soultrace-shop:cart:v1':stored})
    privacy.locator('[data-action="info"][data-info="privacy"]').click()
    privacy.locator('[data-action="clear-local"]').click()
    assert privacy.evaluate('localStorage.getItem("soultrace-shop:cart:v1")') is None
    privacy.locator('.cart-trigger').click()
    expect(privacy.locator('.empty-state')).to_be_visible()
    ok('clear local demo data removes persisted cart')
    expect(page.locator('.faq-list details')).to_have_count(6)
    page.locator('.faq-list summary').first.click()
    assert page.locator('.faq-list details').first.get_attribute('open') is not None
    ok('FAQ disclosures expand accessibly')
    assert not errors, errors
    assert not network, network
    ok('zero JavaScript exceptions and zero HTTP(S) requests in standalone interaction run')
    browser.close()

report={'passed':len(passed),'failed':0,'tests':passed,'runtime_errors':errors,'external_requests':network,'mode':'Chromium offline set_content; localStorage test double; real backend/payment not exercised'}
(ROOT/'docs/browser-test-results.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
print(json.dumps(report,ensure_ascii=False,indent=2))
