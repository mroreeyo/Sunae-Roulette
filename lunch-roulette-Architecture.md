# 수내역 점심 룰렛 — 아키텍처

## 시스템 구성

서버를 직접 만들지 않고, 브라우저의 React 앱이 Supabase와만 통신하는 구조다. 카카오 API는 비밀 키가 필요해서 Edge Function만 호출한다.

```mermaid
flowchart LR
  B["브라우저 · React 앱<br/>Vercel 정적 배포<br/>recommend() 추천 계산<br/>TanStack Query 캐시 (localStorage 영속화)"]
  subgraph S[Supabase]
    DB["Postgres + RLS<br/>app_config, places, meals, prefs<br/>rooms, room_members, votes (v2)<br/>RPC: join_room, close_due_rooms (v2)"]
    AU["Auth<br/>익명 로그인 → uid"]
    RT["Realtime (v2)<br/>votes · rooms · room_members 변경 전달"]
    FN["Edge Functions<br/>sync-places, search-place<br/>create-room (v2)"]
    CR["pg_cron<br/>매주 월 06:00 sync-places 호출 (pg_net)<br/>1분마다 close_due_rooms() (v2)"]
  end
  K["카카오 로컬 API<br/>카테고리 검색 FD6<br/>키워드 검색"]
  B -- 조회·저장·RPC --> DB
  B -- 익명 로그인 --> AU
  RT -- 득표·확정 수신 --> B
  B -- 함수 호출 --> FN
  FN -- REST 키 인증 --> K
  FN -- service role 쓰기 --> DB
  CR -- pg_net HTTP 호출 --> FN
  CR -- SQL 함수 실행 --> DB
  style FN stroke-width:3px
```

> 강조된 Edge Functions가 카카오 REST 키를 가진 유일한 곳이다. (v2) = 팀 투표 단계에서 추가.

브라우저는 anon 키로 RLS가 허용한 범위만 읽고 쓴다. Edge Functions는 service role로 식당 목록을 갱신하고 방을 만든다. 마감된 방의 확정은 Edge Function을 거치지 않고 pg\_cron이 DB 안의 SQL 함수로 처리한다.

## 저장소와 프론트엔드 구조

저장소는 pnpm 워크스페이스 하나에 앱, 공용 로직, Supabase 설정을 함께 둔다. 추천 로직을 `packages/core`로 분리하는 이유는 브라우저와 Edge Function이 같은 코드를 쓰기 위해서다. 그래서 `packages/core`는 외부 의존성이 없는 순수 TypeScript로 작성하고, Deno에서도 읽을 수 있도록 상대 import에 `.ts` 확장자를 붙인다.

```
lunch-roulette/
├─ apps/web/                 # React + Vite
│  └─ src/
│     ├─ pages/              # Home, Places, History, Settings, RoomNew, RoomVote
│     ├─ features/
│     │  ├─ roulette/        # RouletteWheel, ResultCard, useRoulette
│     │  ├─ places/          # PlaceList, PlaceSearchAdd, usePlaces
│     │  ├─ history/         # MealList, CategoryBars, useMeals
│     │  └─ room/            # CandidateCard, VoteBar, useRoomRealtime (v2)
│     ├─ stores/             # filterStore, rouletteSessionStore (Zustand)
│     ├─ lib/                # supabase.ts, queryClient.ts(영속화 설정), geo.ts(거리·도보 시간)
│     └─ App.tsx
├─ packages/core/            # recommend.ts, cooldown.ts(영업일), weights.ts + 테스트
└─ supabase/
   ├─ migrations/            # 테이블, RLS, RPC(join_room 등), pg_cron·pg_net SQL
   └─ functions/
      ├─ deno.json           # packages/core import map
      └─ sync-places, search-place, create-room
```

**상태를 어디에 두는가**

| 상태 | 위치 | 예시 |
| --- | --- | --- |
| 서버 데이터 | TanStack Query 캐시 | 전역 설정, 식당 목록, 내 기록, 내 설정 |
| 화면을 넘나드는 UI 상태 | Zustand | 켜 둔 필터, 이번 세션에서 넘긴 식당, 첫 돌리기 시각과 돌린 횟수 |
| 한 컴포넌트 안 상태 | `useState` | 휠 회전 각도, 모달 열림 |
| URL | React Router | 방 코드(`/r/:code`), 카테고리 탭 |

이 구분이 React 학습 포인트이기도 하다. 서버에서 온 데이터를 전역 스토어에 복사하지 않고, 쿼리 캐시를 그대로 쓰는 것이 핵심이다.

## 핵심 흐름

**룰렛 (v1)** — 서버 호출은 처음 데이터를 받을 때와 기록을 저장할 때 두 번뿐이다.

1. 앱을 열면 TanStack Query가 `app_config`, `places`, `user_place_prefs`, 최근 30일 `meals`를 받아 캐시한다. 캐시는 localStorage에 남아 오프라인에서도 쓸 수 있다.
2. "돌리기"를 누르면 브라우저에서 `recommend()`가 걸러내기 → 가중치 → 가중 랜덤으로 1곳을 고른다. 휠에는 그 1곳과 가중치 상위 7곳(후보가 8곳보다 적으면 전부)을 표시하고, 결과 칸에서 멈추도록 회전 각도를 계산한다. 첫 돌리기 시각과 돌린 횟수는 Zustand 세션에 기록한다.
3. "다시 돌리기"는 그 식당을 Zustand의 세션 제외 목록에 넣고 2번을 반복한다. 후보를 모두 넘기면 "처음부터 다시"로 세션 제외 목록을 비운다.
4. "여기 갈래"는 `meals`에 `spin_count`, `decision_seconds`와 함께 upsert하고 쿼리 캐시를 무효화한 뒤, `kakao_url`을 연다. 오프라인이면 저장은 대기했다가 온라인 복귀 후 재시도한다.

**팀 투표 (v2)** — 팀원은 방에 입장한 뒤 DB에 투표 한 줄만 쓰고, 집계와 확정 결과는 Realtime이 갱신한다.

```mermaid
sequenceDiagram
  participant H as 진행자
  participant M as 팀원
  participant F as create-room
  participant D as Postgres
  participant R as Realtime
  participant C as pg_cron
  H->>F: 1. 방 만들기 (마감 기본 11:40)
  F->>D: 2. 방·후보 3곳(weight)·진행자 입장 저장
  H->>M: 3. 링크 공유
  M->>D: 4. join_room(code, 닉네임)
  M->>D: 5. 투표 (votes upsert)
  D->>R: 6. 변경 이벤트
  R->>M: 7. 득표 갱신 (입장자 전원)
  C->>D: 8. 마감 지나면 close_due_rooms()
  D->>R: 9. rooms 확정 변경
  R->>M: 10. 확정 결과 표시
```

마감을 진행자 화면에 맡기지 않고 pg\_cron이 처리하므로, 진행자가 브라우저를 닫아도 방은 제시각에 확정된다(최대 1분 지연). 동점이면 방을 만들 때 저장한 `weight`가 큰 후보를 고르고, 0표인 방은 확정 없이 닫는다. 확정 결과는 투표한 사람의 기록에 남고, 그날 이미 개인 기록이 있으면 그 기록을 유지한다.

## 배포·환경 변수·비용

개인·팀 규모에서는 월 0원으로 운영할 수 있다. 프론트는 Vercel, 백엔드는 Supabase 무료 플랜, 카카오 API는 주 1회 동기화라 호출량이 매우 적다.

**배포 흐름**

1. `main` 브랜치에 푸시하면 Vercel이 `apps/web`을 빌드해 배포한다. PR마다 프리뷰 URL이 생긴다.
2. DB 변경은 `supabase/migrations`에 SQL로 남기고 `supabase db push`로 반영한다. `pg_cron`, `pg_net` 확장 활성화와 `app_config` 초기값도 마이그레이션에 포함한다.
3. Edge Function은 `supabase functions deploy <이름>`으로 배포한다. v2 착수 전에 `packages/core`가 번들에 포함되는지 시험 배포로 확인한다.
4. 로컬 개발은 `supabase start`로 Postgres·Auth·Realtime을 도커에 띄우고 `pnpm dev`로 앱을 실행한다.

**환경 변수**

| 이름 | 위치 | 공개 여부 |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Vercel, `.env.local` | 공개 (번들 포함) |
| `VITE_SUPABASE_ANON_KEY` | Vercel, `.env.local` | 공개 (RLS로 보호) |
| `KAKAO_REST_API_KEY` | Supabase Edge Function secrets | 비공개 |
| `SUPABASE_SERVICE_ROLE_KEY` | Edge Function 기본 제공 | 비공개 |
| pg\_cron 호출용 키 | Supabase Vault | 비공개 (`sync-places` 호출 인증) |

기준 위치와 반경은 환경 변수가 아니라 `app_config` 테이블에 둔다. 브라우저가 거리 계산과 설정 화면 표시에 써야 하기 때문이다.

**예상 비용**

| 항목 | 사용량 추정 | 비용 |
| --- | --- | --- |
| Vercel Hobby | 정적 사이트 1개 | 0원 |
| Supabase Free | DB 수 MB, 사용자 수십 명 | 0원 (1주 비활성 시 일시정지) |
| 카카오 로컬 API | 동기화 1회당 수십 건 | 무료 쿼터 안 (쿼터 수치는 카카오 개발자 콘솔에서 확인) |

회사 밖으로 공개하거나 사용자가 크게 늘면 Supabase Pro로 올려 일시정지를 없앤다.

## 변경 이력

- 2026-10-14: TRD 개정에 맞춰 갱신. `close-room` 함수를 `close_due_rooms()` SQL 함수로 대체, `join_room` 입장 단계 추가, Realtime 구독 대상 확대, 기준 위치를 `app_config`로 이동, `packages/core`의 Deno 호환 제약, Vault 키, 오프라인 영속화 반영.
