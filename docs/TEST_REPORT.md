# 구현 및 테스트 결과

검증일: 2026-09-17. 테스트는 첨부한 소스/생성 HTML을 대상으로 실제 실행했습니다.

## 실행 환경

- Node.js v22.16.0, npm 10.9.2.
- Python Playwright 1.57.0 및 설치된 Chromium(헤드리스).
- npm 의존성이 없는 HTML/CSS/JavaScript ES Modules 프로젝트.

## 결과

- Node 핵심 로직 단위 테스트: **27 / 27 통과**.
- JS 구문 검사: app.mjs / core.mjs / catalog.mjs 통과.
- 정적 빌드 및 standalone HTML 생성: 통과.
- Chromium 상호작용 시나리오: **15 / 15 통과**.
- 반응형 폭: **320 / 390 / 768 / 1024 / 1440px**에서 홈·상품 모달 가로 넘침 없음.
- 상호작용 테스트의 JS 런타임 예외: **0건**.
- standalone 실행의 HTTP(S) 요청: **0건**.

핵심 검증: 세 가격(24,900 / 49,900 / 9,900), 옵션, 수량 경계, 84,700원 상품 합계, 미정 배송비의 null 처리,
가격 변조 방어(클라이언트 카탈로그 재계산), 입력 이스케이프, 사진 타입/용량,
최소 개인화 입력, 로컬 저장의 개인 정보 제외, 장바구니 복원 후 재입력,
주문 미리보기 폼 검증 및 결제 미발생, 키보드 닫기, 삭제/초기화.

## 정확한 브라우저 검증 범위

이 실행 환경에서는 브라우저의 HTTP 및 file:// 직접 탐색이 관리자 정책으로 차단되어,
빌드된 standalone HTML을 Playwright `set_content`로 렌더링했습니다.
로컬 저장소는 격리된 테스트 대역을 주입해 저장/복원 UI를 검증했고,
직렬화·복원 순수 함수는 Node 테스트에서도 별도로 검증했습니다.

따라서 일반 브라우저에서의 native localStorage 영속성, 실제 호스팅 네트워크,
Safari/Firefox, 로그인·결제·배송 API 통합이나 실제 주문 처리를 검증했다는 의미가 아닙니다.
로컬 정적 서버는 curl로 응답 및 POST 거부를 별도로 확인했습니다.

스크린샷은 테스트 대상 웹페이지의 실제 렌더링 결과이며 생성형 이미지가 아닙니다.
전체 시나리오 목록은 browser-test-results.json에 있습니다.

## 재현

```bash
npm run check
# 선택: Python Playwright와 Chromium이 있는 환경
python tests/browser_test.py
```

디자인 전달용 preview.html의 변경은 `npm run build`로 다시 생성해야 합니다.
