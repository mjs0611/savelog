# savelog Code Audit Report

## Session: 2026-05-31

---

### Issues Found & Fixed

#### [FIX] HomeScreen.tsx — bannerRef 이중 참조 버그 (광고 미노출)

**심각도: HIGH**

`useBannerAd`가 반환하는 `bannerRef`를 두 개의 DOM 노드에 동시에 연결하고 있음 (상단 배너 div + 하단 div). React ref는 마지막으로 마운트된 노드만 가리키므로, 상단 배너 광고가 실제로는 표시되지 않음.

```
src/screens/HomeScreen.tsx:101  const bannerRef = useBannerAd(BANNER_TEXT_AD_ID);
src/screens/HomeScreen.tsx:305  <div ref={bannerRef} .../>  ← 상단 (광고 미노출)
src/screens/HomeScreen.tsx:1071 <div ref={bannerRef} .../>  ← 하단 (ref 덮어씀)
```

**수정:** 상단 배너용 별도 ref 추가.

---

#### [FIX] HomeScreen.tsx — localStorage 접근 try/catch 누락

**심각도: MEDIUM**

버킷리스트 state 초기값 계산 시 localStorage를 try/catch 없이 직접 호출. 프라이빗 브라우징 환경에서 SecurityError 발생 → 앱 화이트 스크린.

```
src/screens/HomeScreen.tsx:171  localStorage.getItem('savelog_bucket_goal_name')
src/screens/HomeScreen.tsx:172  localStorage.getItem('savelog_bucket_goal_price')
src/screens/HomeScreen.tsx:173  localStorage.getItem('savelog_bucket_saved')
```

**수정:** try/catch 래핑.

---

#### [DOC] HomeScreen.tsx — MOCK_ONLINE_USERS personaKey 불일치

**심각도: MEDIUM — 수정 보류 (사이드 이펙트 큼)**

MOCK_ONLINE_USERS의 personaKey가 `'unicorn'`, `'robot'`으로 설정되어 있으나 PERSONAS 객체에는 해당 키 없음. `PERSONAS[u.personaKey]`가 항상 `undefined` 반환 → 아이콘 이미지 깨짐, 궁합 분석 모달에서 이름/색상 미노출.

```
src/screens/HomeScreen.tsx:95  { personaKey: 'unicorn', ... }  ← PERSONAS에 없음
src/screens/HomeScreen.tsx:96  { personaKey: 'robot', ... }    ← PERSONAS에 없음
```

올바른 키: `'flexer'`, `'cost_ai'`. 소셜 기능 전반 재설계와 함께 수정 권장.

---

#### [DOC] HomeScreen.tsx — 버킷 절약액 매 렌더마다 합성값으로 덮어씀

**심각도: MEDIUM**

```
src/screens/HomeScreen.tsx:189
const totalSavings = 185000 + (streak.streak * 1200) + (daily.recorded ? 5000 : 0);
localStorage.setItem('savelog_bucket_saved', String(totalSavings));
```

실제 누적 절약액이 아니라 streak과 recorded 여부로 계산한 가짜 값을 저장. 사용자가 직접 편집한 값도 다음 렌더에서 덮어씌워짐. 실제 Supabase 지출 합계 기반으로 교체 필요.

---

#### [DOC] HomeScreen.tsx — IIFE 내부 localStorage 호출 try/catch 누락

```
src/screens/HomeScreen.tsx:503
const alreadyHealed = localStorage.getItem(`savelog_pet_healed_${today}`) === 'true';
```

JSX 렌더 중 예외 발생 시 전체 화면 크래시. try/catch 또는 storage 래퍼 함수로 교체 권장.

---

#### [DOC] storage.ts — 메시지 ID 충돌 가능성

```
src/lib/storage.ts:293
id: Math.random().toString(),
```

`Math.random()`은 충분히 고유하지 않음. `crypto.randomUUID()` 사용 권장.

---

### Outstanding Issues (미수정)

| 파일 | 이슈 | 우선순위 |
|------|------|---------|
| HomeScreen.tsx:95-97 | MOCK_ONLINE_USERS personaKey 불일치 | HIGH |
| HomeScreen.tsx:189 | 버킷 절약액 합성값 덮어쓰기 | MEDIUM |
| storage.ts:293 | 메시지 ID Math.random() | LOW |
| HomeScreen.tsx:503 | JSX 내 localStorage unchecked | MEDIUM |

---

### Code Health Score: **5.5 / 10**

기능 범위 대비 코드량이 과도히 많음 (HomeScreen.tsx 1,423줄). 실제 소셜 데이터 없이 mock으로 채워진 부분이 광범위하며, 이는 코드 버그가 아닌 아키텍처 문제. 핵심 기능(localStorage 안전성, ref 관리)은 부분적으로 누락됨.
