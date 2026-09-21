# 배포 범위 / 운영 전환

## 로컬 (지금 실행 가능)

Node 22.13 이상. `npm run dev`. demo는 loopback 호스트만 허용합니다.
.local/의 SQLite와 데모용 키는 첫 실행 때 자동 생성되고 ZIP/Git에는 포함하지 않습니다.
`preview.html`은 독립 가상 데모이며 실인증을 하지 않습니다.

## live 어댑터 통합

1. 실제 SoulTrace 저장소를 조사하고 docs/SOULTRACE_BRIDGE.md의 소유권 확인 경로를 구현.
2. `.env.example`을 `.env`로 복사. 원 서비스 bridge 주소, 최소권한 키, 검증된 Resend 발신자와 키 등록.
3. `npm run keygen`으로 32바이트 base64 키 생성. DB와 키를 같은 공개 스토리지에 두지 않음.
4. HTTPS APP_ORIGIN, SHOP_MODE=live, LIVE_DATA_FLOW_REVIEWED=yes 등 실제 값을 설정.
5. `npm run build && npm start`. 실제 고객 이용 전 테스트 계정만으로 확인.

live는 **실제 메일 발송·기록 연동 코드를 선택하는 모드**이지 완전한 판매 준비/보안 승인 스위치가 아닙니다.
데모 OTP를 화면/콘솔에 노출하는 기능은 live 응답에 없습니다. 키가 없으면 기동을 거절합니다.
메일 발송·실제 SoulTrace 조회를 이 패키지 생성 과정에서 실행하지 않았습니다.

## 현재 서버의 배포 가정

- 단일 Node 서버 + 사설 영구 디스크(SQLite). 파일 저장이 없는 serverless 함수에 그대로 배포 불가.
- 여러 인스턴스에 독립 SQLite를 생성하면 세션/요청제한/일회성 검증이 공유되지 않습니다.
  규모 확장 시 Postgres/Redis 등 공유 저장소로 transaction 의미를 보존하여 교체하세요.
- `HOST`는 외부에 직접 공개하는 주소가 아니라 reverse proxy의 upstream bind입니다.
- APP_ORIGIN의 Host를 보존하고 외부의 임의 Origin/Host를 허용하지 마세요.
- 이 샘플은 X-Forwarded-For를 신뢰하지 않습니다. 프록시 뒤에서는 socket IP가 공통 IP여서
  IP당 20회/시간 요청 제한이 전체 사용자에게 걸릴 수 있습니다. 운영 전 신뢰 가능한 proxy만
  헤더를 덮어쓰도록 하고 trusted-client-IP 해석을 추가하거나 edge의 사용자 IP별 제한과 함께 정책을 조정하세요.
  무조건 X-Forwarded-For[0] 사용으로 해결하면 안 됩니다. 원 서비스에도 발송 한도/예산 경보를 두세요.
- API Cookie는 HttpOnly/SameSite=Strict/host-only, HTTPS일 때 Secure 및 __Host- 접두사를 사용합니다.
- `dist/`는 정적 페이지/JS만 담습니다. 서버 디렉터리·.env·SQLite·문서는 정적 공개 대상이 아닙니다.
- private 응답은 no-store. CDN에서 `/api/*`를 캐시하지 마세요.
- HTML의 index/follow와 robots.txt는 검색 수집을 허용합니다. 결제·주문 접근제어가 아닙니다.

## 남은 실제 판매 업무

주문 DB, 서버 견적, PG 검증/웹훅, 배송·세금, 인쇄용 원본 업로드, 시안 승인,
법정 보관, 환불, 기업 정보, 수탁사/국외이전/보관 정책, 국제 접근성·현지어를 확정해야 합니다.
주문 제출 시 브라우저의 sourceArchiveId/price/photo를 신뢰하지 말고 서버에서 소유권과 금액을 다시 검증합니다.
고객이 승인한 인쇄본은 최소한의 별도 스냅샷으로 보관하고 원 아카이브를 덮어쓰지 않습니다.

## 참고한 공식 문서 (2026-09-17)

- Node SQLite: https://nodejs.org/download/release/latest-v24.x/docs/api/sqlite.html
- Resend send API: https://resend.com/docs/api-reference/emails/send-email
- Resend idempotency: https://resend.com/docs/dashboard/emails/idempotency-keys
- OWASP single-use recovery/code guidance: https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html

이 참고자료를 읽었다는 사실이 운영 서버의 안전성을 검증했다는 의미는 아닙니다.
