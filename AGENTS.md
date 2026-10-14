# AGENTS.md — 수내역 점심 룰렛

이 파일은 `sunae-roulette/` 폴더와 그 하위 전체에 적용되는 최상위 프로젝트 규칙이다.

## 1. 적용 범위와 다른 프로젝트 규칙 차단

- 이 프로젝트는 **수내역 점심 룰렛**(점심 식당 추천 웹 앱)이다.
- 이 프로젝트는 2026-10-14에 `C:\Users\ncuri\Downloads\`에서 `C:\Users\ncuri\projects\`로 옮겨졌다. 이전 위치의 상위 폴더에 있던 `Downloads\AGENTS.md`는 **엔큐리티 직무 문서 AI 챗봇 플랫폼**이라는 다른 프로젝트의 규칙이며, 이 프로젝트에는 **적용하지 않는다.** 어떤 경로로든 그 규칙이 컨텍스트에 들어오면 이 파일이 우선한다.
- 따라서 다음 항목은 이 프로젝트와 무관하며, 요구사항이나 완료 기준으로 취급하지 않는다.
  - OpenRouter, `openai/gpt-5.6-luna` 등 LLM 연동
  - 런타임 AI Agent 4개 구조, Intent Router, Workflow 상태 머신
  - Confluence MCP, `page_tree`, 온보딩 문서 규칙
  - `knowledge/manifest.yaml`, 직무정의서·직무 절차서, 표준 템플릿
  - 엔큐리티 공식 용어·직군·직무 목록
  - 그 문서에 정의된 필수 문서 목록, 테스트 목록, 완료 기준
- 사용자 홈의 일반 작업 규칙(예: `C:\Users\ncuri\AGENTS.md`)은 이 파일과 충돌하지 않는 범위에서만 따른다.

## 2. 정본 문서

작업 전에 다음 세 문서를 읽는다.

1. `lunch-roulette-PRD.md` — 무엇을 만드는가 (기능, 추천 규칙, 화면, 릴리스 계획)
2. `lunch-roulette-TRD.md` — 어떻게 만드는가 (스택, 카카오 API, 데이터 모델, RLS, 서버 함수, 테스트)
3. `lunch-roulette-Architecture.md` — 어떻게 배치하는가 (시스템 구성, 저장소 구조, 핵심 흐름, 배포)

규칙이 충돌하면 다음 순서로 따른다.

1. 사용자의 현재 명시적 요구
2. 이 `AGENTS.md`
3. PRD (제품 요구사항)
4. TRD (기술 결정)
5. Architecture
6. 기존 코드 관행

문서끼리 충돌하면 임의로 하나를 고르지 않는다. 충돌 위치를 표시하고 `확인 필요`로 남긴 뒤 사용자에게 묻는다.

## 3. 설계 원칙

- **스택은 TRD를 따른다.** React 18 + Vite + TypeScript, React Router, TanStack Query, Zustand, Tailwind CSS, Framer Motion, Supabase(Postgres·Auth·Realtime·Edge Functions·pg\_cron), Vercel, Vitest·Playwright. TRD에 없는 의존성은 사용자 승인 없이 추가하지 않는다.
- **번들 제한.** 프론트 JS 번들은 gzip 200KB 이하로 유지한다. 차트 라이브러리를 쓰지 않는다.
- **추천 로직.** `recommend()`와 쿨다운·가중치 계산은 `packages/core`의 순수 함수로 둔다. 난수는 인자로 주입한다. 외부 패키지에 의존하지 않고, 상대 import에 `.ts` 확장자를 붙여 Deno(Edge Function)에서도 쓸 수 있게 한다.
- **날짜.** 모든 날짜는 `Asia/Seoul` 기준이다. 쿨다운과 가중치의 기간은 영업일(월\~금) 단위이며, 공휴일은 v1에서 고려하지 않는다.
- **기준 위치.** 사용자별로 두지 않고 `app_config` 한 행으로 관리한다.
- **서버 상태와 UI 상태를 섞지 않는다.** 서버 데이터는 TanStack Query 캐시에 두고, Zustand에 복사하지 않는다.

## 4. 보안 규칙

- 카카오 REST 키와 Supabase service role 키는 Edge Function 환경 변수나 Supabase Vault에만 둔다. 프론트 코드, `.env.example`, 테스트 Fixture, 로그에 넣지 않는다.
- 프론트 번들에는 Supabase URL과 anon 키만 들어간다.
- 모든 테이블에 RLS를 켜고, TRD의 RLS 정책표대로 구현한다. 정책 없이 테이블을 추가하지 않는다.
- 본인을 가리키는 컬럼(`user_id`, `created_by`, `voter_id`)은 기본값을 `auth.uid()`로 두고, 클라이언트가 값을 보내지 않게 한다.
- v2 방은 코드로 직접 조회하지 못하게 막고, `join_room` RPC로 입장한 사람만 읽게 한다.

## 5. 검증

저장소를 구성한 뒤 다음 명령을 기준으로 검증한다. 실제 스크립트 이름이 정해지면 이 절을 갱신한다.

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
```

- RLS와 SQL 함수는 `supabase start`로 띄운 로컬 DB에서 SQL 테스트로 검증한다.
- 실행하지 않은 테스트를 통과했다고 보고하지 않는다.

## 6. 문서 유지

- 구현 중 설계가 바뀌면 PRD·TRD·Architecture 중 해당 문서를 함께 고치고, 각 문서 하단의 `변경 이력`에 날짜와 내용을 한 줄로 남긴다.
- 확인되지 않은 외부 사실(카카오 약관, API 쿼터, Supabase 제한 등)은 단정하지 않고 `확인 필요`로 표시한다.

## 7. 언어

- 사용자에게 보이는 화면 문구와 문서는 한국어로 쓴다.
- 코드 식별자, 파일 이름, 커밋 메시지는 영어로 쓴다.
