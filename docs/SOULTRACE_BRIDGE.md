# 실제 SoulTrace 연결 계약 — 제안 API, 기존 API 아님

**실제 SoulTrace 저장소·DB·스토리 저장 여부를 이 작업에서 확인하지 않았습니다.**
아래를 기존 백엔드에 맞게 구현하거나 `server/adapters/archive.mjs`를 실제 API 계약에 맞춰 수정해야 합니다.
특정 Supabase 테이블이나 기존 user_id를 임의로 가정하지 않았습니다.

## 가장 먼저 확인할 것

| 질문 | 없을 경우 |
|---|---|
| 생성한 편지 원문과 사진이 서버에 저장되는가? | 과거 이메일에서 자동 복구 불가. 직접 입력/재업로드 또는 새 결과 저장 |
| 이메일과 안정적 소유자 ID의 검증된 연결이 있는가? | 문자열 일치로 전부 공개 금지. 소유권 확정 절차부터 설계 |
| 서술된 이메일은 단순 전달받을 주소인가, 로그인 소유자 주소인가? | 선물 수신자/오입력 주소를 저작자·소유자로 자동 취급 금지 |
| 기존 계정에 MFA나 조직/가족별 접근권한이 있는가? | 새 이메일 OTP가 기존 강한 인증을 우회하지 않도록 통합 |
| 삭제/탈퇴/공유 해제/사진 만료를 확인할 수 있는가? | 현재 접근 가능한 항목만 반환하도록 경로 보완 |

**현재 메일함 소유권 확인과 과거 콘텐츠의 적법한 소유권 확인은 별개입니다.**
이메일 주소 재할당·공용 메일함·미인증 과거 주소 등 정책을 검토해야 합니다.
원본 소유권을 확인할 수 없는 옛 기록은 새 OTP만으로 자동 공개하지 말고 별도 검증 또는 직접 입력을 안내하세요.

## 공통 요청

Shop 서버 → 고정 HTTPS SOULTRACE_BRIDGE_ORIGIN. 요청에는 서버 전용 Bearer key를 사용합니다.
이 키는 상점 콘텐츠 조회에만 제한하고, 광범위한 DB 관리 키를 브라우저에 전달하지 않습니다.

```http
POST /internal/memory-shop/list
Authorization: Bearer SERVER_ONLY_SCOPED_KEY
Content-Type: application/json

{"verifiedEmail":"owner@example.com","cursor":null}
```

`verifiedEmail`을 신뢰할 수 있는 이유는 **서버 전용 인증키를 검증한 요청만** 받기 때문입니다.
인터넷 공개 폼에서 동일 JSON을 받는다고 신뢰해서는 안 됩니다. 본문/키는 로그에 남기지 마세요.
서버 간 인증 이후에도 기존 시스템에서 검증된 subject와 허용된 기록만 해석해 반환해야 합니다.

### 1. list

소유권 확인된 항목만 반환. 사진 bytes, 원본 설문 전체, 공개 이미지 URL은 필요하지 않습니다.

```json
{
  "archives": [{
    "id": "archive_opaque_id",
    "petName": "보리",
    "title": "보리의 생일에 남긴 편지",
    "createdAt": "2026-09-16T03:00:00Z",
    "photoCount": 1
  }],
  "nextCursor": null
}
```

페이지당 최대 100개, cursor는 최대 128자. nextCursor가 있으면 프런트에서 더 보기를 제공합니다.
API 수신자가 원 서비스의 전체 기록을 임의 잘라버리지 않도록 실제 페이지네이션을 구현하세요.

### 2. read

```http
POST /internal/memory-shop/read

{"verifiedEmail":"owner@example.com","archiveId":"archive_opaque_id"}
```

```json
{
  "archive": {
    "id":"archive_opaque_id",
    "petName":"보리",
    "title":"보리의 생일에 남긴 편지",
    "createdAt":"2026-09-16T03:00:00Z",
    "message":"올해도 네 생일을 함께해서 좋아.",
    "letter":"보리에게.\n\n생일 축하해.",
    "photos":[{"id":"photo_opaque_id","label":"생일의 보리"}]
  }
}
```

ID: 영문·숫자·_·- 최대128자. petName 20자, title120, message120, letter20000자.
상품 편집기의 편지는 2000자 한도이며, 긴 원문은 자동 삭제/잘라내지 않고 사용자 수정이 필요합니다.
실제 데이터가 이 계약보다 길면 어댑터/상품 입력 규격을 함께 검토하세요. 원문을 몰래 축약하지 마세요.

### 3. photo

```http
POST /internal/memory-shop/photo

{"verifiedEmail":"owner@example.com","archiveId":"archive_opaque_id","photoId":"photo_opaque_id"}
```

200: `image/jpeg`, `image/png`, `image/webp` binary, 최대5MB. 공개 URL 문자열을 반환하지 않습니다.
원본이 크면 원 서비스가 비공개 미리보기 파생본을 반환합니다. 인쇄 원본은 이후 주문 서버에서 별도 취급합니다.
archiveId 소유권과 photoId가 해당 기록에 속하는지 모두 매번 확인합니다.

## 공통 오류

- 소유권 없음/삭제/존재하지 않음: 404(또는403). 다른 사람의 기록 존재 여부를 자세히 알리지 않음.
- 인증키 없음/잘못됨: 401 또는403. 내부 로그에 키/사진/편지 저장 금지.
- 장애: 5xx. Shop은 성공/empty/demo로 바꾸지 않고 오류로 처리.
- 미검증 과거 기록: list에서 미포함, read/photo는 거절. 개인정보 없는 안내를 별도로 제공 가능.

## 기존 기록 마이그레이션

이 패키지는 운영 DB를 변경하지 않습니다. 이메일만 적힌 모든 행에 같은 owner를 자동 지정하지 마세요.
기존 기록/소유확인 증거를 읽고, 검증된 subject로 매핑 가능한 경우만 단계적으로 연결하세요.
검증 방법과 이용자 통지·동의 필요성을 운영·법률 담당자와 확정하고 백업/롤백 뒤 진행합니다.
