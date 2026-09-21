# 포인트 제거 버전 콘솔 업로드

2026-09-09 사용자 배포 요청으로 업로드 완료. CLI 성공 후 조회 API HTTP 200으로 확인했다. 검토 요청·공개 출시는 실행하지 않았다.

- 버전: `20260909-332`
- deploymentId: `01a0868a-ecf4-7287-809e-b518d2634b87`
- 상태: `CREATED`, `deployed: false`, `isTested: false`
- SDK: `3.0.5`
- 아티팩트: `savelog.ait`
- SHA256: `6d836e5cce12fd7a9dc2f15b728b3492d83003ca6b839669ac1ff6831ecab12d`

포인트 일일 적립·주간 지급·수령 버튼·전용 보상형 광고를 제거했다. 기존 공개 기록과 젤리를 유지한다. 기존 로컬 잔액·수령 이력, 서버 데이터, 콘솔 프로모션 설정은 변경하지 않았다.

이번 업로드 전 `npm run build` 성공, dist의 61개 파일과 아카이브 sources의 바이트 일치, 기존 프로모션 코드·전용 광고 ID 부재, 환경·키·인증서 파일 미포함을 확인했다. 기능 정리 시 단위 9개 및 브라우저 12개 검증을 통과했다.

테스트 스킴: `intoss-private://savelog?_deploymentId=01a0868a-ecf4-7287-809e-b518d2634b87&host=appsInTossHost`
