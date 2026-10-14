# 수내역 점심 룰렛 — TRD

## 기술 스택

프론트는 React + Vite + TypeScript, 백엔드는 별도 서버 없이 Supabase(Postgres, Auth, Realtime, Edge Functions)로 간다. 서버를 직접 운영하지 않아도 DB·로그인·실시간 투표를 모두 쓸 수 있고, 무료 플랜으로 시작할 수 있다.

| 영역 | 선택 | 이유 |
| --- | --- | --- |
| 프레임워크 | React 18 + Vite + TypeScript | 학습 중인 React를 그대로 쓰고, 빌드가 빠르다 |
| 라우팅 | React Router | 화면 6개 수준이라 충분하다 |
| 서버 상태 | TanStack Query (+ localStorage 영속화) | 식당·기록 조회 캐싱, 저장 후 자동 갱신, 오프라인에서도 캐시로 룰렛 동작 |
| 클라이언트 상태 | Zustand | 필터, 룰렛 세션(다시 돌린 목록)처럼 가벼운 상태만 |
| 스타일 | Tailwind CSS | 모바일 화면을 빠르게 맞출 수 있다 |
| 룰렛 애니메이션 | CSS transform + Framer Motion | 휠 회전과 결과 카드 등장 |
| 통계 차트 | 라이브러리 없이 CSS 막대 | 카테고리 비율 막대 정도라 충분하고, 번들 200KB 제한을 지킨다 |
| DB / 인증 | Supabase Postgres + Auth | 익명 로그인으로 시작해 나중에 계정 연결 가능 |
| 실시간 (v2) | Supabase Realtime (Postgres Changes) | 투표·방 상태 변경을 구독해 득표 바와 확정 결과 갱신 |
| 서버 함수 | Supabase Edge Functions (Deno) | 카카오 API 키를 숨기는 프록시, 동기화, 방 생성 |
| 예약 작업 | pg\_cron (+ pg\_net) | 주 1회 식당 재동기화(pg\_net으로 함수 호출), 1분마다 마감된 방 확정(SQL 함수) |
| 배포 | Vercel (프론트) | GitHub 푸시로 자동 배포, 프리뷰 URL |
| 테스트 | Vitest + Testing Library, Playwright | 추천 로직 단위 테스트, 룰렛·투표 E2E |

**주의할 제약.** [Supabase 무료 플랜](https://supabase.com/pricing)은 1주일 동안 활동이 없으면 프로젝트가 일시정지된다. 매일 쓰는 앱이라 대체로 문제없지만, 휴가 기간 후에는 대시보드에서 다시 켜야 할 수 있다.

## 외부 API: 카카오 로컬

식당 목록은 [카카오 로컬 API](https://developers.kakao.com/docs/ko/local/dev-guide)의 "카테고리로 장소 검색"으로 가져온다. 핵심 제약은 **한 번의 검색으로 최대 45곳까지만 받을 수 있다**는 점이다 (size 최대 15 × 노출 가능 문서 최대 45). 수내역 주변 음식점은 이보다 훨씬 많으므로 영역을 잘게 나눠 여러 번 조회한다.

**약관 확인 (확인 필요).** 응답을 자체 DB에 저장하고 주 1회 재동기화하는 방식이 카카오 개발자 약관에 맞는지 구현 착수 전에 확인한다. 허용되지 않으면 수집 방식을 다시 설계한다.

**사용할 엔드포인트**

| 용도 | 엔드포인트 | 주요 파라미터 |
| --- | --- | --- |
| 기준 좌표 찾기 (최초 1회) | `GET /v2/local/search/keyword.json` | `query=수내역`, `category_group_code=SW8` |
| 식당 수집 | `GET /v2/local/search/category.json` | `category_group_code=FD6`, `rect`, `page`, `size=15` (노출 한도 45건이라 실질 3페이지) |
| 식당 직접 추가 검색 | `GET /v2/local/search/keyword.json` | `query`, `category_group_code=FD6`, 기준 좌표 `x`·`y` |

카페(CE7)는 v1에서 수집하지 않는다.

인증은 `Authorization: KakaoAK ${REST_API_KEY}` 헤더다. REST 키는 브라우저에 노출하지 않고 Edge Function 환경 변수에만 둔다.

**수집 알고리즘 (사분할 타일링)**

1. `app_config`의 기준 좌표를 중심으로 반경(기본 500m)을 덮는 사각형을 만든다. 호출자가 좌표를 넘길 수 없고, 항상 `app_config` 값을 쓴다.
2. 사각형을 `rect` 파라미터로 조회한다. 응답의 `meta.total_count`가 45를 넘으면 그 사각형을 4등분해 각각 다시 조회한다.
3. `total_count`가 45 이하가 될 때까지 반복하고, `is_end`가 true가 될 때까지 페이지를 넘긴다. 단, 분할 깊이가 6에 이르거나 타일 한 변이 30m보다 작아지면 더 나누지 않고, 받을 수 있는 45건만 저장한 뒤 `sync_logs`에 경고를 남긴다 (한 건물에 식당이 몰린 경우).
4. 결과를 장소 `id`로 중복 제거하고, 기준 좌표에서 반경 밖인 곳과 카테고리가 "술집"인 곳은 버린다.
5. `kakao_id`로 upsert하며 `last_seen_at`을 갱신하고 `miss_count`를 0으로 되돌린다. 이미 `source='manual'`로 직접 추가된 행이 수집되면 `source`를 `kakao`로 바꾼다.
6. 이번 수집에 없는 기존 식당은 바로 지우지 않는다. `source='kakao'`이고 반경 안에 있는 행만 `miss_count`를 1 올리고, 2가 되면 `is_active=false`로 바꾼다. 직접 추가한 식당은 이 판정에서 제외한다.

**응답 필드 매핑**

| 카카오 필드 | 저장 컬럼 | 비고 |
| --- | --- | --- |
| `id` | `places.kakao_id` | 고유 키, 중복 제거 기준 |
| `place_name` | `places.name` |  |
| `category_name` | `places.category_path`, `places.category` | "음식점 > 한식 > 국밥"에서 두 번째 단계(한식)를 대분류로 저장. 두 번째 단계가 "술집"이면 저장하지 않음 |
| `x`, `y` | `places.lng`, `places.lat` | 문자열 → 숫자 변환 |
| `road_address_name` | `places.address` |  |
| `place_url` | `places.kakao_url` | 결과 카드의 "카카오맵에서 보기" 링크 |
| `phone` | `places.phone` |  |

**도보 시간.** 직선거리 × 1.3(경로 보정) ÷ 분당 67m(시속 4km)로 근사한다. 반경 500m 끝은 약 10분, 필터 "도보 5분"은 직선 약 250m에 해당한다. 거리는 브라우저에서 `app_config` 기준 좌표와 식당 좌표로 계산한다(`lib/geo.ts`). 정확한 도보 경로는 v1에서 다루지 않는다.

## 데이터 모델

테이블은 v1 6개, v2 4개다. 식당(`places`)은 모든 사용자가 공유하고, 즐겨찾기·숨기기·태그 같은 개인 설정은 `user_place_prefs`로 분리한다. 기준 위치는 사용자마다 두지 않고 `app_config` 한 행으로 관리한다.

| 테이블 | 역할 | 주요 컬럼 | 버전 |
| --- | --- | --- | --- |
| `app_config` | 전역 설정 (1행) | `id`(=1), `base_name`, `base_lat`, `base_lng`, `radius_m` | v1 |
| `profiles` | 사용자 설정 | `id`(= auth uid), `nickname`, `cooldown_days`(3\~10, 영업일) | v1 |
| `places` | 식당 마스터 | `id`, `kakao_id`(unique), `name`, `category`, `category_path`, `lat`, `lng`, `address`, `kakao_url`, `phone`, `source`(kakao/manual), `created_by`, `is_active`, `last_seen_at`, `miss_count` | v1 |
| `user_place_prefs` | 개인별 식당 설정 | `user_id`(기본값 `auth.uid()`), `place_id`, `is_favorite`, `is_hidden`, `tags`(혼밥, 가격대 등) — (`user_id`, `place_id`)가 PK | v1 |
| `meals` | 식사 기록 | `id`, `user_id`, `place_id`, `eaten_on`, `room_id`(nullable), `spin_count`, `decision_seconds` | v1 |
| `sync_logs` | 동기화 결과 | `id`, `started_at`, `finished_at`, `status`, `added`, `updated`, `deactivated`, `message` | v1 |
| `rooms` | 점심 방 | `id`, `code`(8자리 unique), `host_id`, `deadline_at`, `status`(open/closed), `winner_place_id` | v2 |
| `room_members` | 방 입장자 | `room_id`, `user_id`, `nickname`, `joined_at` — (`room_id`, `user_id`)가 PK | v2 |
| `room_candidates` | 방의 후보 식당 | `id`, `room_id`, `place_id`, `added_by`, `position`, `weight`(생성 시점 가중치) | v2 |
| `votes` | 투표 | `room_id`, `voter_id`, `candidate_id` — (`room_id`, `voter_id`)가 PK라 1인 1표, 다시 누르면 변경 | v2 |

```sql
create table app_config (
  id smallint primary key default 1 check (id = 1),
  base_name text not null default '수내역',
  base_lat double precision not null,
  base_lng double precision not null,
  radius_m integer not null default 500
);

create table places (
  id uuid primary key default gen_random_uuid(),
  kakao_id text unique,
  name text not null,
  category text not null,          -- 한식, 일식, 중식 ...
  category_path text,
  lat double precision not null,
  lng double precision not null,
  address text,
  kakao_url text,
  phone text,
  source text not null default 'kakao' check (source in ('kakao','manual')),
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  is_active boolean not null default true,
  last_seen_at timestamptz,
  miss_count integer not null default 0
);

create table meals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  place_id uuid not null references places(id),
  eaten_on date not null default (now() at time zone 'Asia/Seoul')::date,
  room_id uuid,                    -- v2 마이그레이션에서 rooms(id) FK 추가
  spin_count integer,              -- 확정까지 돌린 횟수, 팀 확정 기록은 null
  decision_seconds integer,        -- 첫 돌리기부터 저장까지 걸린 초, 팀 확정 기록은 null
  created_at timestamptz not null default now(),
  unique (user_id, eaten_on)       -- 하루 점심 1회
);
```

`user_id`, `created_by`, `voter_id`처럼 본인을 가리키는 컬럼은 기본값을 `auth.uid()`로 둔다. 클라이언트는 이 값을 보내지 않고, upsert의 충돌 판정에도 기본값이 그대로 쓰인다.

**v2 테이블**

```sql
create table rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-HJKMNP-Z2-9]{8}$'),  -- 0·O·1·I·L 제외
  host_id uuid not null references auth.users(id),
  deadline_at timestamptz not null,
  status text not null default 'open' check (status in ('open','closed')),
  winner_place_id uuid references places(id),
  created_at timestamptz not null default now()
);

create table room_members (
  room_id uuid not null references rooms(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id),
  nickname text not null,
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

create table room_candidates (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete cascade,
  place_id uuid not null references places(id),
  added_by uuid references auth.users(id),
  position smallint not null,
  weight double precision not null,   -- 생성 시점 가중치, 동점 처리용. 제안 후보(F-11)는 0
  unique (room_id, id),
  unique (room_id, place_id)
);

create table votes (
  room_id uuid not null,
  voter_id uuid not null default auth.uid(),
  candidate_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (room_id, voter_id),
  foreign key (room_id, voter_id) references room_members (room_id, user_id) on delete cascade,
  foreign key (room_id, candidate_id) references room_candidates (room_id, id) on delete cascade
);

alter table meals add foreign key (room_id) references rooms(id) on delete set null;
```

복합 FK 때문에 방에 입장한 사람만 투표할 수 있고, 다른 방의 후보에는 투표할 수 없다.

날짜는 모두 `Asia/Seoul` 기준으로 저장한다. "영업일"은 월\~금이고, 공휴일은 v1에서 고려하지 않는다. 쿨다운·가중치의 기간은 모두 영업일 단위다.

## API 명세와 서버 함수

단순 조회·저장은 Supabase 클라이언트로 테이블에 직접 접근하고(권한은 RLS가 막는다), 비밀 키나 여러 사용자 데이터를 합쳐야 하는 작업은 Edge Function이나 `security definer` DB 함수로 만든다.

**추천 로직의 위치.** v1 추천은 브라우저에서 돈다. 후보가 수백 곳 수준이라 전부 받아와 계산해도 충분히 빠르다. 로직은 순수 함수 `recommend(places, meals, prefs, filters, rng)`로 `packages/core`에 두고, v2의 `create-room` 함수가 같은 코드를 가져다 쓴다. 난수 함수를 인자로 받아서 테스트에서 결과를 고정할 수 있다.

**`packages/core`를 Deno에서 쓰기 위한 제약.** 외부 패키지에 의존하지 않는 순수 TypeScript로 작성하고, 상대 import에는 `.ts` 확장자를 붙인다(Vite 쪽은 `allowImportingTsExtensions`). Edge Function은 `supabase/functions/deno.json`의 import map으로 `packages/core`를 참조한다. 함수 디렉터리 밖의 파일이 배포 번들에 포함되는지는 v2 착수 전에 시험 배포로 확인한다 (확인 필요). 포함되지 않으면 빌드 단계에서 `packages/core`를 `supabase/functions/_shared/`로 복사한다.

**클라이언트 직접 호출 (supabase-js)**

| 동작 | 호출 | 비고 |
| --- | --- | --- |
| 전역 설정 | `from('app_config').select().single()` | 기준 좌표·반경, 거리 계산과 설정 화면 표시용 |
| 식당 목록 | `from('places').select().eq('is_active', true)` | 앱 시작 시 1회, 캐시 1시간 |
| 식당 직접 추가 | `from('places').upsert({ kakao_id, ..., source: 'manual' }, { onConflict: 'kakao_id', ignoreDuplicates: true })` 후 `kakao_id`로 다시 조회 | 이미 있는 식당이면 새로 만들지 않고 기존 행을 쓴다 |
| 개인 설정 | `from('user_place_prefs').select()` / `.upsert()` | 즐겨찾기·숨기기·태그 |
| 최근 기록 | `from('meals').select().gte('eaten_on', 30일 전)` | 쿨다운·통계 계산용 |
| 식사 저장 | `from('meals').upsert({ place_id, eaten_on, spin_count, decision_seconds }, { onConflict: 'user_id,eaten_on' })` | 같은 날 다시 저장하면 교체 |
| 방 입장 (v2) | `rpc('join_room', { code, nickname })` | 방·후보·입장자 반환. 코드로 방을 찾는 유일한 경로 |
| 투표 (v2) | `from('votes').upsert({ room_id, candidate_id }, { onConflict: 'room_id,voter_id' })` | 마감 전만 허용 (RLS) |
| 실시간 구독 (v2) | `channel('room:{id}')`에 `postgres_changes`를 `votes`·`room_members`(`room_id=eq.{id}`), `rooms`(`id=eq.{id}`)로 등록 | 득표 재집계, 입장자 목록, 확정 결과 표시 |

**Edge Functions**

| 함수 | 메서드 | 입력 → 출력 | 호출 주체 |
| --- | --- | --- | --- |
| `sync-places` | POST | 입력 없음(`app_config` 기준) → 추가·갱신·비활성 건수 | pg\_cron이 pg\_net으로 호출 (매주 월 06:00). 수동 실행은 개발자가 service role 키로 직접 호출. 함수는 service role 요청만 받는다 |
| `search-place` | GET | 검색어 → 카카오 키워드 검색 결과 상위 15건 (술집 제외) | 식당 직접 추가 화면 (로그인 사용자) |
| `create-room` (v2) | POST | `{ preview: true, exclude_place_ids? }` → 후보 3곳 미리보기 / `{ place_ids, deadline_at? }` → `{ code, candidates }` | 진행자 |

`create-room`은 저장할 때 진행자를 `room_members`에 넣고, 후보마다 생성 시점의 `weight`를 기록한다. `deadline_at`을 생략하면 11:40으로 정하고, 11:30이 지났으면 현재 시각 + 10분으로 정한다. 후보 계산의 쿨다운은 진행자의 기록과 최근 30일 안에 진행자의 방에서 투표한 사람들의 기록을 합쳐서 쓴다.

**DB 함수 (v2)**

| 함수 | 종류 | 동작 | 호출 주체 |
| --- | --- | --- | --- |
| `join_room(code, nickname)` | RPC, security definer | 코드로 열린 방을 찾아 `room_members`에 upsert하고 방·후보·입장자를 반환. 없는 코드는 같은 오류로 응답 | 투표 화면 |
| `is_room_member(room_id)` | security definer | 본인이 방 입장자인지 반환. RLS 정책에서 `room_members`를 다시 조회하면 재귀가 생기므로 이 함수로 확인 | RLS 정책 |
| `propose_candidate(room_id, place_id)` | RPC, security definer | 입장자이고 방이 열려 있으며 후보가 6곳 미만일 때 후보 추가 (`weight` 0) | 투표 화면 (F-11, P2) |
| `close_due_rooms()` | SQL 함수 | 아래 확정 규칙 실행 | pg\_cron (1분마다) |

**방 확정 규칙 (`close_due_rooms`)**

1. `status='open'`이고 `deadline_at <= now()`인 방을 고른다.
2. 후보별 득표를 센다. 최다 득표 후보가 여럿이면 `weight`가 큰 후보, 그래도 같으면 `position`이 작은 후보를 고른다.
3. 표가 하나도 없으면 `winner_place_id`를 비운 채 `closed`로 바꾸고 기록을 남기지 않는다.
4. 투표한 사람마다 `meals`에 (`place_id`, `eaten_on`=마감일, `room_id`)를 넣는다. 그날 이미 기록이 있으면 `on conflict do nothing`으로 본인 기록을 유지한다.
5. 방을 `closed`로 바꾸고 `winner_place_id`를 저장한다. 이 변경이 Realtime으로 참여자 화면에 전달된다.

pg\_cron의 1분 주기 때문에 확정은 마감 후 최대 1분 늦을 수 있다. 화면은 카운트다운이 0이 되면 "집계 중"을 보여주고 `rooms` 변경을 기다린다.

**오류 처리.** 카카오 API가 429나 5xx를 주면 지수 백오프로 3회 재시도하고, 실패하면 기존 식당 목록을 그대로 유지한다(`miss_count`도 올리지 않는다). 동기화 결과는 `sync_logs` 테이블에 남긴다.

## 보안·권한, 비기능 요구사항, 테스트

**인증.** 첫 방문 시 Supabase 익명 로그인으로 uid를 받는다. 기록을 다른 기기로 옮기고 싶을 때만 이메일 매직 링크로 계정을 연결한다. 투표 참여자도 익명 로그인 uid로 1인 1표를 구분한다. 같은 휴대폰 브라우저에서 앱과 투표 링크를 열면 uid가 같으므로 팀 확정 기록이 개인 기록에 이어진다. [익명 가입은 IP당 시간당 30회로 제한](https://supabase.com/docs/guides/deployment/going-into-prod)되므로, 사무실 한 IP에서 팀원 8명이 들어와도 문제없지만 테스트할 때는 주의한다.

**RLS 정책**

| 테이블 | 읽기 | 쓰기 |
| --- | --- | --- |
| `app_config` | 로그인한 누구나 | service role만 |
| `places` | 로그인한 누구나 | 추가: `source='manual'`이고 `created_by = auth.uid()`일 때. 수정·삭제: 본인이 추가한 `manual` 행만. 나머지는 service role만 |
| `user_place_prefs`, `meals`, `profiles` | 본인 행만 (`user_id = auth.uid()`) | 본인 행만. upsert를 쓰므로 insert와 update 정책을 모두 둔다 |
| `sync_logs` | 없음 (대시보드에서 확인) | service role만 |
| `rooms`, `room_candidates`, `room_members` | `is_room_member(room_id)`가 참일 때 | 직접 쓰기 금지. `create-room`, `join_room`, `propose_candidate`로만 |
| `votes` | `is_room_member(room_id)`가 참일 때 | 본인 `voter_id`이고, `rooms.status='open'`이며 `deadline_at > now()`일 때만 (insert·update) |

방 코드 일치 여부는 RLS가 확인할 수 없다. 그래서 `rooms`를 코드로 직접 조회하지 못하게 막고, `join_room`으로 입장한 사람만 방을 읽게 한다. Realtime의 Postgres Changes도 이 읽기 정책을 따르므로 입장자에게만 변경이 전달된다. `votes`, `rooms`, `room_members`는 `supabase_realtime` publication에 추가한다.

**비밀 관리.** 카카오 REST 키와 Supabase service role 키는 Edge Function 환경 변수에만 둔다. pg\_cron이 `sync-places`를 호출할 때 쓰는 키는 Supabase Vault에 저장한다. 프론트 번들에는 Supabase URL과 anon 키만 들어간다.

**비기능 요구사항**

| 항목 | 기준 |
| --- | --- |
| 첫 화면 표시 | 4G 모바일에서 2초 이내 (JS 번들 200KB gzip 이하, 차트 라이브러리 미사용) |
| 룰렛 결과 | 버튼 후 애니메이션 포함 3초 이내 |
| 투표 반영 | 다른 참여자 화면에 1초 이내 |
| 방 확정 | 마감 후 1분 이내 |
| 접근성 | 버튼 터치 영역 44px 이상, 룰렛 결과를 텍스트로도 읽어줌(`aria-live`) |
| 오프라인 | 쿼리 캐시를 localStorage에 영속화해 새로고침 후에도 룰렛 동작. 기록 저장은 일시정지된 mutation으로 남겼다가 온라인 복귀 후 재시도 |

**테스트 계획**

| 대상 | 방법 | 대표 케이스 |
| --- | --- | --- |
| `recommend()` | Vitest 단위 테스트, 고정 난수 | 쿨다운 안 식당 제외(영업일 계산, 월요일 포함), 직전 식사 카테고리 ×0.3, 카테고리 감점 중복 미적용, 후보 0곳일 때 쿨다운 완화, 세션 소진 시 결과 구분, 가중치 분포가 1만 회 시뮬레이션에서 기대 확률 ±1%p |
| 타일링 수집 | Vitest + 카카오 응답 목(mock) | `total_count` 46일 때 4분할, 중복 id 제거, 분할 깊이 한도에서 중단, 술집 제외, `miss_count` 2회 시 비활성, manual 행 비활성 제외 |
| RLS | Supabase 로컬(`supabase start`) + SQL 테스트 | 남의 `meals` 조회 불가, 입장 없이 `rooms` 조회 불가, 다른 방 후보 투표 거부, 마감 후 투표 거부, 남이 추가한 식당 수정 불가 |
| 방 확정 | SQL 테스트 | 동점 시 weight 우선, 0표 방 처리, 기존 개인 기록 유지 |
| 화면 흐름 | Playwright | 돌리기 → 여기 갈래 → 기록 화면에 표시, 두 브라우저 동시 투표와 확정 결과 표시 |

## 변경 이력

- 2026-10-14: 문서 검토 결과 반영. `app_config`로 기준 위치 전역화, 동기화 범위·비활성 판정(`miss_count`)·타일링 깊이 한도·술집 제외, `created_by`와 `auth.uid()` 기본값, `sync_logs`·지표 컬럼 추가, v2 `room_members`·`join_room` 기반 권한 모델, 복합 FK, `close-room` 함수를 SQL 함수 `close_due_rooms()`로 대체, Realtime 구독 대상 보강, 오프라인 영속화, 테스트 기준 보강.
