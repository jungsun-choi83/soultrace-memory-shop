/** All three product prices are user-supplied. Product-to-price mapping and variants are draft.
 * In production the SERVER must own prices, inventory, promotions and delivery costs.
 */
export const SHOP = Object.freeze({
  brand: 'SOUL TRACE',
  mode: 'demo', // This is not a live-payment switch. Production needs a real adapter/backend.
  currency: 'KRW',
  locale: 'ko-KR',
  shippingFee: null, // Unknown is not zero/free shipping.
  maxQuantity: 9,
  maxCartLines: 20,
  cartKey: 'soultrace-shop:cart:v1',
  langKey: 'soultrace-shop:lang:v1', // Language only. Never store names, photos, letters or addresses.
  supportEmail: null,
  legalOperator: null,
});

export const PRODUCTS = Object.freeze([
  {
    id: 'nfc', sku: 'ST-NFC', price: 9900, category: 'nfc',
    name: 'NFC 메모리카드', english: 'A Memory You Can Open', tag: 'THE NFC CARD',
    short: '편지와 사진을, 손에 닿는 카드로.',
    description: 'NFC가 내장된 포토카드입니다. 소울트레이스에서 생성된 편지 또는 사진을 액션으로 담아 보내는 방향의 작은 카드입니다. 현재 스토어 시안에서는 실제 NFC 쓰기·전송·앱 연동을 하지 않습니다.',
    art: 'nfc', image: 'nfc-memory-card.webp', showsLetter: true, photoRule: 'letter-or-photo',
    variants: [{ id: 'ivory', name: '클래식 아이보리', color: '#e2d5bc' }],
    details: [['구성 방향', 'NFC 내장 포토카드'], ['담는 내용', '생성된 편지 또는 사진'], ['안내', '편지 세트의 NFC 인식표와는 다른 별도 상품입니다.'], ['확인 예정', '칩 종류 · 액션 종류 · 규격 · 내구성']],
  },
  {
    id: 'letter', sku: 'ST-LETTER', price: 24900, category: 'paper',
    name: '마음을 담은 편지 세트', english: 'A Letter, Kept Forever', tag: 'THE LETTER',
    short: '화면 속 편지를, 오래 간직할 한 장으로.',
    description: '소울트레이스에 남긴 마음을 천천히 다시 읽어보세요. 편지, 엽서, NFC 인식표로 구성된 컬렉션입니다.',
    art: 'letter', image: 'letter-suite.webp', showsLetter: true, photoRule: 'optional',
    variants: [
      { id: 'sage', name: '세이지 그린', color: '#7a8270' },
      { id: 'blue', name: '더스티 블루', color: '#71858e' },
    ],
    details: [['구성', '편지 · 엽서 · NFC 인식표'], ['NFC 인식표', '제공된 가죽 포토 키링 시안'], ['맞춤 항목', '아이 이름 · 남기고 싶은 문장 · 사진'], ['확인 예정', '용지 · 인쇄 방식 · 구성 수량 · 칩 사양 · 제작 일정']],
  },
  {
    id: 'minibook', sku: 'ST-MINIBOOK', price: 49900, category: 'carry',
    name: '미니 메모리북 키링', english: 'Always, a Little Closer', tag: 'THE MINI BOOK',
    short: '가방 한켠에 달아두는, 우리만의 작은 책.',
    description: '첫 만남부터 좋아했던 순간까지. 작은 페이지에 아이의 이야기를 담아, 손이 닿는 가까운 곳에 간직하세요.',
    art: 'book', image: 'mini-book-front.webp', showsLetter: false, photoRule: 'required',
    variants: [
      { id: 'cream', name: '크림 베이지', color: '#e8dcc5' },
      { id: 'mocha', name: '모카 브라운', color: '#998065' },
      { id: 'sage', name: '세이지 그린', color: '#8d9070' },
    ],
    details: [['시안 크기', '약 7 × 5.5 × 2 cm'], ['시안 소재', '벨벳 느낌의 커버 · 투명 포켓 내지'], ['시안 구성', '미니북 · 키링 · 전용 파우치'], ['확인 예정', '최종 소재 · 포켓 및 사진 수량 · QR 연동 범위']],
  },
]);

export const SAMPLE_ARCHIVE = Object.freeze({
  id: 'demo-bori', name: '보리', label: '보리와 함께한 작은 순간들',
  message: '너와 함께한 평범한 하루가, 나에게는 가장 특별한 기억이야.',
  photos: ['pet-bori.webp', 'pet-bori-two.webp', 'pet-bori-three.webp'],
  letter: '보리에게.\n\n햇살이 드는 창가에서, 우리가 나란히 앉아 있던 오후를 기억해. 특별한 일을 하지 않아도 함께 있다는 것만으로 충분했던 시간.\n\n너와 함께한 평범한 하루들을 오래 간직하고 싶어. 내 곁에 와줘서 고마워.\n\n언제나 사랑을 담아.',
});

export const FAQS = [
  ['소울트레이스에서 만든 편지를 가져올 수 있나요?', '네. 소울트레이스에서 편지를 만들 때 쓴 이메일을 그대로 입력하고 확인하면, 그 계정에 쌓인 이야기를 불러와 굿즈로 제작할 수 있는 흐름입니다. 같은 이메일 아카이브는 이터널빔에서도 이어서 볼 수 있도록 설계합니다. 지금 공개 데모는 예시 주소(bori@example.test)로만 체험할 수 있고, 실제 계정 연동은 SoulTrace 서버 연결 후 가능합니다.'],
  ['사진이나 문구를 직접 바꿀 수 있나요?', '네. 상품 상세에서 이름과 문구를 입력하고, JPG·PNG·WEBP 사진 한 장을 선택해 맞춤 미리보기를 볼 수 있습니다. 사진은 이 브라우저 안에서만 처리됩니다. 최종 인쇄 영역과 여러 장 편집 기능은 제작 사양에 맞춰 확정해야 합니다.'],
  ['NFC 인식표와 메모리카드는 어떻게 다른가요?', '마음을 담은 편지 세트(24,900원) 구성은 편지, 엽서, NFC 인식표입니다. NFC 인식표는 제공된 가죽 포토 키링 시안입니다. NFC 메모리카드(9,900원)는 1번 상품으로, NFC가 내장된 포토카드이며 생성된 편지 또는 사진을 액션으로 담아 보내는 방향입니다. 현재 버전에서는 실제 NFC 쓰기·전송·앱 연동을 하지 않으며, 칩 사양과 액션 범위는 확인 예정입니다.'],
  ['지금 결제하거나 실제 상품을 주문할 수 있나요?', '현재는 스토어 시안입니다. 장바구니와 주문 미리보기까지 이용할 수 있지만 결제, 주문 접수, 제작 요청은 발생하지 않습니다. 결제대행사와 주문 서버를 연결하고 상품 정책을 확정한 뒤 실판매를 시작할 수 있습니다.'],
  ['제작·배송과 교환은 어떻게 진행되나요?', '제작 기간, 배송비, 교환·취소 정책은 아직 확정되지 않았습니다. 이 화면에서는 배송비를 무료로 가정하지 않고 별도 확인 항목으로 표시합니다. 맞춤 제작 상품이라는 이유만으로 교환·환불이 일괄 제한된다고 안내하지 않습니다.'],
  ['해외에서도 주문할 수 있나요?', '화면은 한/영으로 바꿀 수 있으며 가격은 원화입니다. 해외 배송 가능 국가, 관세·세금, 결제 통화는 아직 설정되지 않았습니다. 일본·미국·유럽 판매는 국가별 배송 및 결제 정책을 확정한 뒤 연결해야 합니다.'],
];
