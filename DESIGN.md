---
name: savelog personal journal
description: 한국어 개인 소비 기록을 위한 담백한 주간 플래너
colors:
  journal-ink: "#253b39"
  journal-muted: "#63706b"
  journal-green: "#216554"
  journal-rule: "#d8dfd7"
  daylight: "#f4f5f1"
  surface: "#fff"
  selected: "#eaf1ec"
typography:
  headline:
    fontFamily: "Pretendard, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "30px"
    fontWeight: 700
    lineHeight: 1.35
    letterSpacing: "-.035em"
  title:
    fontFamily: "Pretendard, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "18px"
    fontWeight: 650
    lineHeight: 1.5
    letterSpacing: "-.025em"
  body:
    fontFamily: "Pretendard, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "15px"
    lineHeight: 1.55
  label:
    fontFamily: "Pretendard, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "13px"
    lineHeight: 1.55
rounded:
  field: "8px"
  cell: "10px"
  control: "12px"
spacing:
  tight: "8px"
  control: "12px"
  section: "16px"
components:
  button-primary:
    backgroundColor: "{colors.journal-green}"
    textColor: "{colors.surface}"
    rounded: "{rounded.control}"
    padding: "12px"
    width: "100%"
  button-text:
    textColor: "{colors.journal-green}"
    padding: "8px 0"
  choice:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.journal-ink}"
    rounded: "{rounded.control}"
    padding: "18px 8px 17px"
  choice-selected:
    backgroundColor: "{colors.selected}"
    textColor: "{colors.journal-ink}"
    rounded: "{rounded.control}"
    padding: "18px 8px 17px"
---

# Design System: savelog personal journal

## Overview

**Creative North Star: "주간 책상 플래너"**

따뜻한 밝은 바탕, 녹색을 머금은 먹색 글자, 실제 기록이 채우는 날짜 칸이 중심입니다. 종이 질감을 모사하지 않고 플래너의 날짜 구조와 짧은 기록 동작을 가져옵니다. 한국어 문장과 금액을 먼저 읽을 수 있도록 그림보다 글자와 여백을 사용합니다.

이 문서는 현재 구현된 개인 기록 화면의 시각 규칙입니다. 기존 공개 피드 공간에는 별도 디자인이 있으며 이 토큰을 소급 적용하지 않습니다. 제품 흐름과 저장 범위는 PRODUCT.md, 이 화면의 구성 계약은 docs/journal-direction.md를 참고합니다. 배포 여부나 기록·재방문 개선 효과를 증명하는 문서가 아닙니다.

**Key Characteristics:**
- 따뜻한 회백색 바탕과 흰 기록 면
- 같은 크기로 제시하는 두 소비 선택지
- 선·채움·짧은 문구로 구분하는 날짜 상태
- 고정된 글자 위계와 정렬된 금액

## Colors

녹색은 행동과 기록 상태를 연결하고 중립색은 읽기 순서와 경계를 만듭니다. 값의 정본은 위 frontmatter입니다.

### Primary
- **Journal Green:** 기본 저장 버튼, 선택 테두리, SVG 아이콘, 기록된 날짜의 채움에 사용합니다.
- **Selected:** 선택 중인 소비 버튼의 옅은 면입니다. 저장 완료 날짜의 진한 채움과 구별합니다.

### Neutral
- **Journal Ink:** 본문과 금액의 기본 잉크입니다.
- **Journal Muted:** 설명, 날짜, 보조 문구에 사용합니다.
- **Journal Rule:** 날짜 칸, 입력 경계와 섹션 구분선입니다.
- **Daylight / Surface:** 화면 바탕과 기록 입력 면을 구분합니다.

**The State Before Decoration Rule.** 색은 선택·기록·행동을 설명합니다. 미기록 날짜를 완료 색으로 채우지 않습니다.

## Typography

**Display Font / Body Font:** Pretendard. 로딩 실패 시 플랫폼 글꼴로 대체합니다. 별도 장식용 디스플레이 글꼴은 없습니다.

**Character:** 제목은 짧고 약간 조밀하며 본문은 편안한 행간을 유지합니다. 무게와 크기로 질문·섹션·설명을 구분합니다.

### Hierarchy
- **Headline:** 첫 질문과 기록 목록 제목. 기본 토큰에서 넓은 화면은 36px, 359px 이하에서는 27px로 바뀝니다.
- **Title:** 주간 기록·백업 같은 섹션 제목입니다.
- **Body:** 설명과 기록 메모의 기본 크기입니다. 보조 설명은 12–14px를 사용합니다.
- **Label:** 버튼과 날짜별 설명의 중간 크기입니다. 필드 이름은 14px, 선택지 이름은 17px입니다.
- **Amount:** 입력은 34px, 저장 결과는 38px이며 금액과 날짜 숫자는 tabular-nums로 정렬합니다. 이 크기는 금액 전용이며 새 제목 토큰이 아닙니다.

**The Numeric Alignment Rule.** 금액과 날짜는 고정 폭 숫자로 읽기 위치를 유지합니다. 긴 저장 금액·메모는 영역 안에서 줄바꿈합니다.

## Layout

최대 너비 940px의 중앙 컨테이너입니다. 기본 좌우 여백은 24px, 359px 이하에서는 16px입니다. 720px부터 여백은 44px로 넓어지고 기록 면과 주간 영역이 1.1fr / 1fr, 간격 40px의 두 열로 놓입니다. 작은 화면은 한 열입니다. 기록 목록과 백업은 넓은 화면에서도 최대 680px입니다.

두 소비 선택지는 같은 폭의 두 열을 유지합니다. 한 주는 항상 일곱 열이며 날짜마다 요일·칸·상태 문구가 세로로 정렬됩니다. 반복 간격은 8px·12px·16px를 쓰되 페이지 전체를 단일 배수 격자로 강제하지 않습니다.

아래쪽 두 메뉴는 화면에 고정되며 너비는 min(100% - 40px, 410px)입니다. 하단 안전 영역을 반영하고 본문에는 112px와 안전 영역만큼 아래 여백을 둡니다. 날짜·경고·백업 동작은 좁아지면 줄바꿈합니다.

## Elevation & Depth

기록 면과 목록은 그림자 없이 배경색과 가는 경계로 나눕니다. 떠 있는 하단 메뉴와 알림에만 부드러운 그림자가 있습니다. 종이 질감, 광택, 그라데이션은 이 개인 기록 구현에 없습니다.

### Shadow Vocabulary
- **Navigation:** `0 5px 24px #253b3914` — 고정 메뉴와 스크롤 본문의 층을 구분합니다.
- **Status:** `0 5px 20px #253b391a` — 메뉴 위 상태 알림을 분리합니다.

**The Quiet Surface Rule.** 일반 기록 면은 평평하게 유지하고 떠 있는 UI에만 깊이를 줍니다.

## Shapes

입력은 작은 둥근 모서리, 소비 선택과 저장 버튼은 중간 모서리입니다. 날짜와 기록 아이콘 바탕은 작은 칸 형태를 공유합니다. 기록 면은 16px, 하단 메뉴는 24px로 구분합니다. 가는 테두리는 선택과 입력 경계를 전달하는 실제 구조입니다.

아이콘은 24×24 viewBox, 1.8px 선, 둥근 끝과 연결부의 인라인 SVG입니다. 기본 크기는 22px이며 배치에 맞춰 조절합니다. 의미는 한국어 라벨과 함께 전달합니다.

## Components

### Buttons

저장은 녹색으로 채운 전폭 버튼이며 최소 높이는 54px입니다. 포인터 hover에서는 더 짙은 녹색으로 바뀝니다. 백업은 투명 바탕과 테두리, 최소 높이 46px의 보조 버튼입니다. 수정·취소·날짜 이동은 밑줄과 최소 높이 44px를 가진 텍스트 버튼입니다. 비활성 상태는 탁한 색 또는 낮은 불투명도로 표시합니다.

### Choices

두 소비 선택은 동일한 크기·타이포·아이콘 무게를 씁니다. 선택하면 옅은 녹색 배경과 녹색 테두리, aria-pressed가 함께 바뀝니다. 선택 자체는 저장 완료를 뜻하지 않습니다.

### Cards / Containers

흰 기록 면 안에 선택·입력·저장 결과를 담습니다. 기본 패딩은 22px 20px 18px이며 넓은 화면은 26px입니다. 기록 목록은 카드 반복 대신 아래 경계가 있는 행이며 날짜·메모·금액을 정렬합니다.

### Inputs / Fields

금액은 밑줄과 원 단위를 가진 큰 숫자 입력입니다. 메모는 밝은 면과 가는 테두리의 한 줄 입력이며 입력 글자 크기는 16px입니다. 모든 포커스 가능 요소는 3px 녹색 외곽선과 4px 간격을 사용합니다. 금액 입력은 추가로 밑줄색을 바꿉니다. 오류는 입력 곁에 붉은 글자와 옅은 붉은 면, role=alert로 노출하며 작성 내용을 유지합니다.

### Navigation

‘오늘’과 ‘내 기록’ 두 메뉴에 SVG와 문구가 같이 있습니다. 활성 메뉴는 진한 중립 잉크와 글자 무게로 표시합니다. 기존 공개 공간은 헤더 링크와 기록 목록 아래 설명으로 따로 진입합니다.

### Weekly Record

미기록 날짜는 날짜 숫자와 빈 테두리, 선택 날짜는 녹색 테두리, 저장된 날짜는 녹색 채움과 체크·상태 문구로 나타냅니다. 미래 날짜는 비활성입니다. 저장 표시와 합계는 성공적으로 저장한 데이터에 따릅니다. 선택지와 저장 버튼에도 체크 아이콘이 있으므로 체크 모양만을 저장 성공의 독점 표식으로 취급하지 않습니다.

기록 칸의 등장 애니메이션은 240ms ease-out이며 opacity와 scale을 사용합니다. 버튼 상태 전환은 180ms ease-out입니다. prefers-reduced-motion에서는 전환과 애니메이션을 제거합니다. 알림은 메뉴 위에서 5초간 노출되며 aria-live=polite로 전달합니다.

## Do's and Don'ts

### Do:
- **Do** 선택·미기록·저장 상태를 문구와 형태로도 구분합니다.
- **Do** 소비한 날과 0원인 날에 같은 선택 면적과 글자 무게를 줍니다.
- **Do** 긴 금액, 한국어 메모, 하단 안전 영역을 레이아웃 안에 수용합니다.
- **Do** 기기 저장 설명과 공개 공간 안내를 해당 동작 가까이에 유지합니다.

### Don't:
- **Don't** 미기록 날짜를 0원 또는 실패 상태로 시각화합니다.
- **Don't** 저장 완료색을 저장 실패 상태에 적용합니다.
- **Don't** 장식용 종이 질감·그라데이션·벌점형 연속 기록 이미지를 이 개인 기록 화면에 추가합니다.
- **Don't** 기존 공개 공간의 시각 규칙을 이 개인 기록 화면에 자동으로 혼합합니다.
