# 개인 소비 기록 콘솔 업로드

2026-09-08 사용자의 콘솔 배포 요청으로 업로드했다. 검토 요청과 공개 출시는 실행하지 않았다.

- 앱: `savelog`
- deploymentId: `01a07f23-bdbd-7855-bd93-c32732108095`
- 콘솔 조회: HTTP 200, `reviewStatus: CREATED`
- 아티팩트: `savelog.ait`
- SHA256: `c0246c9ef191ea189e3d09703362d34f8bfae44ef4420e58316095e388d7b360`
- 검증: `npm run build` 성공. dist의 61개 파일과 아카이브 sources 파일의 SHA256 전부 일치. 아카이브에 환경 파일·인증서·키 파일 없음.
- 업로드: 설치된 framework 3.0.5의 `bin/ait.js deploy`, default 프로필 사용. CLI 성공 후 배포 조회 API로 별도 확인.

테스트 스킴: `intoss-private://savelog?_deploymentId=01a07f23-bdbd-7855-bd93-c32732108095&host=appsInTossHost`

신규 개인 기록에는 포인트 지급이 없다. ‘기존 기록·포인트’의 이전 공간에는 매일 첫 기록 3원 적립·광고 후 수령과 주간 순위 광고 후 수령 경로가 남아 있다. 기존 잔액 수령만 보존한 상태가 아니며, 이전 공간에서 신규 적립도 가능하다. 실제 포인트 지급 테스트는 실행하지 않았다.
