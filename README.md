# savelog

로그인 없이 오늘 쓴 금액 또는 0원을 남기는 개인 소비 기록 앱입니다. 메모는 선택이며, 이번 주와 날짜별 기록을 볼 수 있습니다.

저장 뒤 ‘이번 주 돌아보기’에서 날짜별 메모와 금액을 다시 읽고, 지난 주 기록으로 이동할 수 있습니다. 합계는 기록한 날짜만 포함합니다.

새 개인 기록은 **현재 기기에만 저장**됩니다. 공개 피드에 업로드하지 않습니다. 내 기록 화면에서 JSON 백업을 내보내고 가져올 수 있습니다. 기존 공개 기록·커뮤니티는 `/legacy`에서 유지됩니다. 토스포인트 적립·지급 기능은 제거했으며, 젤리와 꾸미기는 유지합니다.

## 실행

```sh
npm install
npm run dev
npm test
npm run build
npm run preview
```

Node 22.6 이상이 단위 테스트의 TypeScript type stripping을 지원합니다. 테스트는 서버나 인증정보 없이 실행됩니다.

기존 공개 기능은 `.env.example`에 명시된 Supabase 설정을 사용합니다. 개인 기록은 Supabase 없이 동작합니다. 배포 빌드는 `.env.production` 등 Vite 환경 설정을 따릅니다. `npm run build`는 `.ait` 파일을 만들며 실제 배포와 심사 제출은 별도입니다.

## 브라우저 검증

프로덕션 프리뷰를 5188 포트에 실행합니다. Playwright 및 Chrome 설치 경로는 환경에 맞게 지정합니다. 브라우저 테스트는 모든 Supabase 요청을 가로채며 운영 데이터에 쓰지 않습니다.

```sh
npm run preview -- --host 127.0.0.1 --port 5188
# 별도 터미널. playwright가 현재 프로젝트에서 resolve되면 MODULE_PATH는 생략 가능.
PLAYWRIGHT_MODULE_PATH=/absolute/path/to/playwright/index.mjs \
CHROME_EXECUTABLE=/absolute/path/to/chrome npm run test:browser
```

`JOURNAL_TEST_URL`로 프리뷰 주소를 변경할 수 있습니다. 캡처는 `.impeccable/review/`에 생성됩니다.

## 제품과 검증 범위

- [제품 원칙](PRODUCT.md)
- [디자인 방향](docs/journal-direction.md)

이 저장소의 테스트는 개인 기록·백업·이벤트 비민감성·공개 공간의 프런트엔드 읽기 전용 경계를 검증합니다. 운영 데이터·DB 스키마 스냅샷·DB 권한 변경은 포함하지 않습니다.

신규 경험의 `journal_*` 행동 이벤트는 프로덕션에서 Toss Analytics로 보냅니다. 앱은 금액·메모·날짜·계정 ID를 이벤트에 포함하지 않으며, 플랫폼 SDK는 자체 익명 키를 붙일 수 있습니다. 전송 실패는 저장을 방해하지 않습니다.
