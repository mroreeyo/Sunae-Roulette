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
| 룰렛 애니메이션 | Motion(`motion/react`, `LazyMotion` + `m.*`) | 휠 회전과 결과 카드 등장. 필요한 기능만 번들에 넣는다 |
| 배경 잔상 효과 | three.js (`AfterimagePass`), 지연 로딩 | 수내역 사진을 휠 뒤에 깔고 돌리는 동안 잔상을 남긴다. 첫 화면 번들과 분리된 별도 파일(gzip 약 122KB)로 화면이 뜬 뒤 불러온다 |
| 통계 차트 | 라이브러리 없이 CSS 막대 | 카테고리 비율 막대 정도라 충분하고, 번들 200KB 제한을 지킨다 |
| DB / 인증 | Supabase Postgres + Auth | 익명 로그인으로 시작해 나중에 계정 연결 가능 |
| 식당 데이터 | 공공데이터포털 일반음식점·휴게음식점 인허가 CSV + 가져오기 스크립트(Node) | 저장·가공이 허용된 데이터라 DB에 둘 수 있고, API 키와 쿼터가 필요 없다 |
| 좌표 변환 | proj4 (가져오기 스크립트 전용 개발 의존성) | 원본 좌표계(EPSG:5174)를 위경도로 바꾼다. 앱 번들에는 포함되지 않는다 |
| 지도 연결 | 카카오맵·네이버 지도 URL 링크 | API 호출이 아니라 일반 링크라 키·쿼터·저장 제한이 없다 |
| 실시간 (v2) | Supabase Realtime (Postgres Changes) | 투표·방 상태 변경을 구독해 득표 바와 확정 결과 갱신 |
| 서버 함수 (v2) | Supabase Edge Functions (Deno) | 방 생성(여러 사용자 기록을 합쳐 후보 계산) |
| 예약 작업 (v2) | pg\_cron | 1분마다 마감된 방 확정(SQL 함수) |
| 배포 | Vercel (프론트) | GitHub 푸시로 자동 배포, 프리뷰 URL |
| 테스트 | Vitest + Testing Library, Playwright | 추천 로직 단위 테스트, 룰렛·투표 E2E |

**주의할 제약.** [Supabase 무료 플랜](https://supabase.com/pricing)은 1주일 동안 활동이 없으면 프로젝트가 일시정지된다. 매일 쓰는 앱이라 대체로 문제없지만, 휴가 기간 후에는 대시보드에서 다시 켜야 할 수 있다.

## 식당 데이터: 공공데이터

**지도 API를 쓰지 않는 이유 (2026-10-14 확인).**

- 카카오맵 API FAQ는 "로컬 API 등을 호출하여 응답받은 결과 데이터를 별도로 저장하여 사용하는 것은 허용하지 않습니다"라고 안내한다(실시간 호출만 허용, 20분 임시 저장도 불가).
- 네이버 지역 검색은 검색 한 번에 결과가 5건 수준이라 반경 안의 식당을 모두 모을 수 없다. 2026-09-07 개정 특약에서 저장·캐싱도 금지 행위에 포함된 것으로 보도되었다(원문 미확인).
- 그래서 식당 목록은 저장과 가공이 허용된 공공데이터로 만들고, 지도 서비스는 링크로만 연결한다.

**데이터셋**

| 데이터 | 제공 | 형식·좌표계 | 이용 조건 |
| --- | --- | --- | --- |
| [행정안전부\_식품\_일반음식점](https://www.data.go.kr/data/15045016/fileData.do) | 공공데이터포털 (행정안전부) | CSV, EPSG:5174 | 이용허락범위 제한 없음 |
| 행정안전부\_식품\_휴게음식점 | 공공데이터포털 (행정안전부) | 위와 같음 | 확인 필요 |

휴게음식점은 버거·토스트·김밥처럼 점심으로 자주 가는 업소가 있어서 함께 가져온다. 단, 커피숍·편의점·아이스크림 등은 제외한다.

**실제 파일로 확인한 사항 (2026-10-14, 성남시 파일).**

- 공공데이터포털에서 로그인 후 **시군구 단위 파일**을 받을 수 있다(`식품_일반음식점_경기성남시.csv` 9.5MB, `식품_휴게음식점_경기성남시.csv` 3.6MB). 기존 LOCALDATA 파일 주소는 403을 반환한다(2026년 4월 이관).
- 인코딩은 **CP949**이고, 두 파일 모두 같은 39개 컬럼이다. 사용 컬럼: 관리번호, 사업장명, 업태구분명, 영업상태명(`영업/정상`·`폐업`), 도로명주소, 지번주소, 전화번호, 좌표정보(X)·(Y).
- 분당구에서 영업 중인 업소는 일반음식점 4,483곳, 휴게음식점 1,556곳이다. 이 가운데 좌표가 없는 곳은 64곳이다.
- **업태만으로는 카페를 거를 수 없다.** 일반음식점의 "기타"와 휴게음식점의 "패스트푸드"·"기타 휴게음식점"에 커피 전문점이 섞여 있다. 그래서 상호명에 커피·카페·디저트 관련 단어나 주요 카페 브랜드가 들어 있으면 제외한다.
- 좌표 변환 정의는 EPSG:5174 + 표준 Bessel→WGS84 데이텀 변환(`towgs84=-115.80,474.99,674.11,1.16,-2.31,-1.63,6.43`)을 쓴다. 상호에 수내·정자·서현역이 들어간 113곳을 변환해 보니 역까지 거리의 중앙값이 170\~240m였다. 데이텀 변환을 빼면 390\~490m, EPSG:2097로 계산하면 250\~430m로 더 멀어졌다.
- 갱신을 자동화할 수 있는 OpenAPI가 있는지는 아직 확인하지 않았다 (확인 필요).

**가져오기 스크립트 (`scripts/import-places`)**

개발자 PC에서 내려받은 CSV를 넣어 실행한다. 원본은 "수시 갱신"이므로 v1에서는 월 1회 수동으로 실행한다.

```bash
pnpm import:places "$PWD/data/raw/식품_일반음식점_경기성남시.csv" "$PWD/data/raw/식품_휴게음식점_경기성남시.csv"
```

1. CSV를 CP949로 읽는다. 필요한 컬럼이 없으면 바로 중단한다.
2. 주소에 "성남시 분당구"가 들어 있는 행만 남긴다. 폐업 행은 관리번호만 모아 두고, 영업 중이 아니거나 좌표가 비어 있는 행은 건너뛰고 건수를 기록한다.
3. 업태 매핑표와 상호명 규칙으로 앱 카테고리를 정하고, 제외 대상은 버린다. 매핑표에 없는 업태는 "기타"로 넣고 건수를 출력한다.
4. 좌표를 WGS84 위경도로 변환하고, `app_config`의 기준 좌표에서 반경(기본 500m) 밖인 행을 버린다.
5. DB 함수 `import_places(records, closed_ids, file_name)`를 한 번 호출한다. 이 함수는 한 트랜잭션 안에서 다음을 처리한다.
   - 관리번호(`source_id`)로 upsert하고, `last_seen_at`을 갱신하며 `miss_count`를 0으로 되돌린다.
   - 폐업으로 나온 공공데이터 행은 바로 비활성화한다.
   - 이번 가져오기에 없는 공공데이터 행은 `miss_count`를 1 올리고, 2가 되면 비활성화한다. 직접 추가한 식당은 이 판정에서 제외한다.
   - 결과를 `import_logs`에 남긴다.

스크립트는 service role 키로 DB에 쓴다. 키는 `scripts/import-places/.env`(git 제외)에 둔다. `import_places`는 `anon`과 `authenticated`에서 실행 권한을 회수한다.

**업태 → 앱 카테고리 매핑 (2026-10 성남시 파일의 실제 값 기준)**

| 앱 카테고리 | 업태구분명 |
| --- | --- |
| 한식 | 한식, 식육(숯불구이), 탕류(보신용), 냉면집 |
| 중식 | 중국식 |
| 일식 | 일식, 횟집, 복어취급 |
| 양식 | 경양식, 패밀리레스트랑 (원본 표기 그대로) |
| 분식 | 분식, 김밥(도시락) |
| 아시안 | 외국음식전문점(인도,태국등) |
| 패스트푸드 | 통닭(치킨), 패스트푸드 |
| 뷔페 | 뷔페식 |
| 기타 | 기타, 일반조리판매, 기타 휴게음식점, 매핑표에 없는 값 |
| (제외) | 호프/통닭, 정종/대포집/소주방, 감성주점, 라이브카페, 까페, 키즈카페, 출장조리, 이동조리, 커피숍, 편의점, 아이스크림, 떡카페, 과자점, 전통찻집, 다방, 백화점, 철도역구내, 푸드트럭 |

업태와 상관없이 상호명이 다음에 해당하면 제외한다. 규칙은 `scripts/import-places/src/categories.ts`에 있다.

- 카페·디저트: 커피, 카페, cafe, coffee, 에스프레소, 디저트, 베이커리, 베이킹, 제과, 젤라또, 아이스크림, 요거트, 빙수, 호두, 주요 카페 브랜드(스타벅스, 투썸, 이디야, 빽다방, 컴포즈, 메가엠지씨, 할리스, 폴바셋, 공차, 바나프레소, 배스킨라빈스)
- 점심 식당이 아닌 업소: PC방(pc방, 피씨, PC-), 홀덤, 펍·pub, 비어·beer, 와인·wine, 술바·혼술, 노래, 당구, 볼링, 스크린. 2026-10 데이터의 "기타"에 PC방, 홀덤펍, 술집이 섞여 있어 추가했다.

제외 규칙에 걸린 행은 폐업 행과 함께 비활성화 목록으로 보낸다. 그래서 규칙을 바꾸면 다음 가져오기에서 바로 반영된다(누락 2회를 기다리지 않는다).

**지도 링크.** 결과 카드에 링크 두 개를 둔다. 둘 다 API가 아닌 일반 URL이다. URL 형식은 구현할 때 실제로 열어서 확인한다 (확인 필요).

| 링크 | 위치가 있을 때 | 위치가 없을 때 (직접 추가) |
| --- | --- | --- |
| 카카오맵 | 길찾기 `https://map.kakao.com/link/to/{이름},{위도},{경도}` | 검색 `https://map.kakao.com/link/search/{이름 주소}` |
| 네이버 지도 | 검색 `https://map.naver.com/p/search/{이름 주소}` | 같음 |

**도보 시간.** 직선거리 × 1.3(경로 보정) ÷ 분당 67m(시속 4km)로 근사한다. 반경 500m 끝은 약 10분, 필터 "도보 5분"은 직선 약 250m에 해당한다. 거리는 `app_config` 기준 좌표와 식당 좌표로 계산하며, 계산 함수는 브라우저·Edge Function·가져오기 스크립트가 함께 쓰도록 `packages/core/src/geo.ts`에 둔다. 위치가 없는 식당은 도보 시간을 "알 수 없음"으로 표시하고, 거리 필터를 켜면 후보에서 뺀다. 정확한 도보 경로는 v1에서 다루지 않는다.

## 데이터 모델

테이블은 v1 6개, v2 4개다. 식당(`places`)은 모든 사용자가 공유하고, 즐겨찾기·숨기기·태그 같은 개인 설정은 `user_place_prefs`로 분리한다. 기준 위치는 사용자마다 두지 않고 `app_config` 한 행으로 관리한다.

| 테이블 | 역할 | 주요 컬럼 | 버전 |
| --- | --- | --- | --- |
| `app_config` | 전역 설정 (1행) | `id`(=1), `base_name`, `base_lat`, `base_lng`, `radius_m` | v1 |
| `profiles` | 사용자 설정 | `id`(= auth uid), `nickname`, `cooldown_days`(3\~10, 영업일) | v1 |
| `places` | 식당 마스터 | `id`, `source`(public/manual), `source_id`(관리번호, unique), `name`, `category`, `category_raw`, `lat`, `lng`, `address`, `phone`, `created_by`, `is_active`, `last_seen_at`, `miss_count` | v1 |
| `user_place_prefs` | 개인별 식당 설정 | `user_id`(기본값 `auth.uid()`), `place_id`, `is_favorite`, `is_hidden`, `tags`(혼밥, 가격대 등) — (`user_id`, `place_id`)가 PK | v1 |
| `meals` | 식사 기록 | `id`, `user_id`, `place_id`, `eaten_on`, `room_id`(nullable), `spin_count`, `decision_seconds` | v1 |
| `import_logs` | 가져오기 결과 | `id`, `file_name`, `started_at`, `finished_at`, `rows_read`, `added`, `updated`, `deactivated`, `skipped`, `message` | v1 |
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
  source text not null check (source in ('public','manual')),
  source_id text unique,           -- 공공데이터 관리번호, 직접 추가는 null
  name text not null,
  category text not null,          -- 앱 카테고리: 한식, 중식, 일식 ...
  category_raw text,               -- 원본 업태구분명
  lat double precision,            -- 직접 추가는 위치 없이 등록할 수 있다
  lng double precision,
  address text,
  phone text,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  is_active boolean not null default true,
  last_seen_at timestamptz,
  miss_count integer not null default 0,
  check (source = 'manual' or (source_id is not null and lat is not null and lng is not null))
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

`user_id`, `created_by`, `voter_id`처럼 본인을 가리키는 컬럼은 기본값을 `auth.uid()`로 둔다. 클라이언트는 이 값을 보내지 않고, upsert의 충돌 판정에도 기본값이 그대로 쓰인다. 가져오기 스크립트는 service role로 쓰므로 `created_by`가 null이 된다.

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

단순 조회·저장은 Supabase 클라이언트로 테이블에 직접 접근하고(권한은 RLS가 막는다), 여러 사용자 데이터를 합쳐야 하는 작업은 Edge Function이나 `security definer` DB 함수로 만든다. v1에는 Edge Function이 없다.

**추천 로직의 위치.** v1 추천은 브라우저에서 돈다. 후보가 수백 곳 수준이라 전부 받아와 계산해도 충분히 빠르다. 로직은 순수 함수 `recommend(places, meals, prefs, filters, rng)`로 `packages/core`에 두고, v2의 `create-room` 함수가 같은 코드를 가져다 쓴다. 난수 함수를 인자로 받아서 테스트에서 결과를 고정할 수 있다.

**`packages/core`를 Deno에서 쓰기 위한 제약.** 외부 패키지에 의존하지 않는 순수 TypeScript로 작성하고, 상대 import에는 `.ts` 확장자를 붙인다(Vite 쪽은 `allowImportingTsExtensions`). Edge Function은 `supabase/functions/deno.json`의 import map으로 `packages/core`를 참조한다. 함수 디렉터리 밖의 파일이 배포 번들에 포함되는지는 v2 착수 전에 시험 배포로 확인한다 (확인 필요). 포함되지 않으면 빌드 단계에서 `packages/core`를 `supabase/functions/_shared/`로 복사한다.

**클라이언트 직접 호출 (supabase-js)**

| 동작 | 호출 | 비고 |
| --- | --- | --- |
| 전역 설정 | `from('app_config').select().single()` | 기준 좌표·반경, 거리 계산과 설정 화면 표시용 |
| 식당 목록 | `from('places').select().eq('is_active', true)` | 앱 시작 시 1회, 캐시 1시간 |
| 식당 직접 추가 | `from('places').insert({ source: 'manual', name, category, address? })` | 이름·카테고리 필수, 주소 선택. 위치는 비워 둔다 |
| 개인 설정 | `from('user_place_prefs').select()` / `.upsert()` | 즐겨찾기·숨기기·태그 |
| 최근 기록 | `from('meals').select('place_id, eaten_on, places(category)').gte('eaten_on', 30일 전)` | 쿨다운·통계 계산용. 비활성화된 식당의 기록도 카테고리 감점에 반영되도록 카테고리를 함께 받는다 |
| 식사 저장 | `from('meals').upsert({ place_id, eaten_on, spin_count, decision_seconds }, { onConflict: 'user_id,eaten_on' })` | 같은 날 다시 저장하면 교체 |
| 방 입장 (v2) | `rpc('join_room', { code, nickname })` | 방·후보·입장자 반환. 코드로 방을 찾는 유일한 경로 |
| 투표 (v2) | `from('votes').upsert({ room_id, candidate_id }, { onConflict: 'room_id,voter_id' })` | 마감 전만 허용 (RLS) |
| 실시간 구독 (v2) | `channel('room:{id}')`에 `postgres_changes`를 `votes`·`room_members`(`room_id=eq.{id}`), `rooms`(`id=eq.{id}`)로 등록 | 득표 재집계, 입장자 목록, 확정 결과 표시 |

**Edge Functions (v2)**

| 함수 | 메서드 | 입력 → 출력 | 호출 주체 |
| --- | --- | --- | --- |
| `create-room` | POST | `{ preview: true, exclude_place_ids? }` → 후보 3곳 미리보기 / `{ place_ids, deadline_at? }` → `{ code, candidates }` | 진행자 |

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

**오류 처리.** 가져오기 스크립트는 한 번의 실행을 하나의 트랜잭션으로 처리한다. 중간에 실패하면 기존 식당 목록을 그대로 유지하고(`miss_count`도 올리지 않는다), 실패 내용을 `import_logs`에 남긴다.

## 보안·권한, 비기능 요구사항, 테스트

**인증.** 첫 방문 시 Supabase 익명 로그인으로 uid를 받는다. 기록을 다른 기기로 옮기고 싶을 때만 이메일 매직 링크로 계정을 연결한다. 연결은 `auth.updateUser({ email })`로 익명 사용자에게 이메일을 붙이는 방식이라 uid와 기록이 그대로 유지된다. 다른 기기에서는 `signInWithOtp({ shouldCreateUser: false })`로 같은 uid에 로그인하며, 그 기기에 쌓였던 익명 기록은 옮겨지지 않는다. 운영 프로젝트는 Confirm email을 켜서 남의 이메일을 확인 없이 붙이지 못하게 한다(로컬은 확인이 꺼져 있어 즉시 연결된다). 투표 참여자도 익명 로그인 uid로 1인 1표를 구분한다. 같은 휴대폰 브라우저에서 앱과 투표 링크를 열면 uid가 같으므로 팀 확정 기록이 개인 기록에 이어진다. [익명 가입은 IP당 시간당 30회로 제한](https://supabase.com/docs/guides/deployment/going-into-prod)되므로, 사무실 한 IP에서 팀원 8명이 들어와도 문제없지만 테스트할 때는 주의한다.

**RLS 정책**

| 테이블 | 읽기 | 쓰기 |
| --- | --- | --- |
| `app_config` | 로그인한 누구나 | service role만 |
| `places` | 로그인한 누구나 | 추가: `source='manual'`이고 `created_by = auth.uid()`일 때. 수정: 본인이 추가한 `manual` 행만. 삭제는 기록이 참조할 수 있어 `is_active=false`로 처리한다. `public` 행은 service role(가져오기 스크립트)만 |
| `user_place_prefs`, `meals`, `profiles` | 본인 행만 (`user_id = auth.uid()`) | 본인 행만. upsert를 쓰므로 insert와 update 정책을 모두 둔다 |
| `import_logs` | 없음 (대시보드에서 확인) | service role만 |
| `rooms`, `room_candidates`, `room_members` | `is_room_member(room_id)`가 참일 때 | 직접 쓰기 금지. `create-room`, `join_room`, `propose_candidate`로만 |
| `votes` | `is_room_member(room_id)`가 참일 때 | 본인 `voter_id`이고, `rooms.status='open'`이며 `deadline_at > now()`일 때만 (insert·update) |

방 코드 일치 여부는 RLS가 확인할 수 없다. 그래서 `rooms`를 코드로 직접 조회하지 못하게 막고, `join_room`으로 입장한 사람만 방을 읽게 한다. Realtime의 Postgres Changes도 이 읽기 정책을 따르므로 입장자에게만 변경이 전달된다. `votes`, `rooms`, `room_members`는 `supabase_realtime` publication에 추가한다.

**비밀 관리.** Supabase service role 키는 Edge Function 환경 변수(v2)와 가져오기 스크립트를 실행하는 PC의 git 제외 `.env`에만 둔다. 프론트 번들에는 Supabase URL과 anon 키만 들어간다. 지도 링크와 공공데이터 파일에는 비밀 키가 필요 없다.

**출처 표시.** 식당 목록 화면 하단에 "식당 정보: 행정안전부 공공데이터"를 표시한다. 이용허락범위에 제한이 없더라도 데이터의 출처와 기준일을 사용자가 알 수 있게 한다.

**배경 사진.** 위키미디어 공용의 [View from Sunae Overpass.jpg](https://commons.wikimedia.org/wiki/File:View_from_Sunae_Overpass.jpg)(작성자 Semtall, CC BY-SA 4.0)를 960px로 줄여 `apps/web/public/images/sunae-overpass.jpg`에 둔다. CC BY-SA 4.0 조건에 따라 홈 화면 하단에 제목·작성자·라이선스 링크와 변경 사항(크기 축소, 잔상 효과)을 표시한다. 사진을 바꾸면 이 표시도 함께 바꾼다.

**비기능 요구사항**

| 항목 | 기준 |
| --- | --- |
| 첫 화면 표시 | 4G 모바일에서 2초 이내 (첫 화면 JS 번들 200KB gzip 이하, 차트 라이브러리 미사용). three.js 배경 효과는 지연 로딩 파일이라 이 예산에 넣지 않는다 |
| 배경 효과 | 평상시에는 정지 화면 한 장만 그리고, 돌리는 동안과 멈춘 뒤 1.5초만 연속 렌더링한다. 모션 줄이기 설정이면 정지 화면만 그린다. 사진을 불러오지 못하면 효과 없이 동작한다 |
| 룰렛 결과 | 버튼 후 애니메이션 포함 3초 이내 |
| 투표 반영 | 다른 참여자 화면에 1초 이내 |
| 방 확정 | 마감 후 1분 이내 |
| 접근성 | 버튼 터치 영역 44px 이상, 룰렛 결과를 텍스트로도 읽어줌(`aria-live`) |
| 오프라인 | 쿼리 캐시를 localStorage에 24시간 영속화한다(세션 쿼리는 제외). 앱을 연 채 연결이 끊기거나 API에 닿지 않는 상태로 새로고침해도 마지막 데이터로 룰렛이 동작한다. 오프라인에서 누른 "여기 갈래"는 대기했다가 연결되면 저장한다. 인터넷이 완전히 끊긴 상태의 새로고침은 앱 코드를 받을 수 없어 지원하지 않는다. 필요하면 PWA 서비스 워커를 따로 검토한다 |
| 캐시 소유자 | 캐시를 만든 사용자 ID를 localStorage에 함께 저장한다. 이메일 링크로 다른 사용자로 로그인하면 캐시를 비우고 다시 받는다(남의 기록이 잠깐이라도 보이지 않게) |

**테스트 계획**

| 대상 | 방법 | 대표 케이스 |
| --- | --- | --- |
| `recommend()` | Vitest 단위 테스트, 고정 난수 | 쿨다운 안 식당 제외(영업일 계산, 월요일 포함), 직전 식사 카테고리 ×0.3, 카테고리 감점 중복 미적용, 후보 0곳일 때 쿨다운 완화, 세션 소진 시 결과 구분, 위치 없는 식당의 거리 필터 처리, 가중치 분포가 1만 회 시뮬레이션에서 기대 확률 ±1.5%p (p=0.5 기준 약 3σ) |
| 좌표 변환 | Vitest | 실제 파일의 수내역 인근 업소 좌표가 검증된 위경도로 변환됨 (회귀 고정) |
| 가져오기 변환 | Vitest + CSV 픽스처 | 분당구·영업 중 행만 통과, 폐업 관리번호 수집, 좌표 없는 행 건너뜀, 반경 밖 제외, 업태 매핑·제외 업태·상호명 카페 제외, 필수 컬럼 누락 시 중단 |
| RLS·가져오기 함수 | Supabase 로컬 + pgTAP(`supabase test db`) | 남의 `meals` 조회 불가, 하루 1회 기록, 사용자가 `public` 행 추가·수정 불가, 남이 추가한 식당 수정 불가, 비로그인 조회 불가, 사용자가 `import_places` 실행 불가, 누락 2회 시 비활성, 폐업 즉시 비활성. v2: 입장 없이 `rooms` 조회 불가, 다른 방 후보 투표 거부, 마감 후 투표 거부 |
| 방 확정 | SQL 테스트 | 동점 시 weight 우선, 0표 방 처리, 기존 개인 기록 유지 |
| 화면 흐름 | Playwright | 돌리기 → 여기 갈래 → 기록 화면에 표시, 두 브라우저 동시 투표와 확정 결과 표시 |

## 변경 이력

- 2026-10-14: 문서 검토 결과 반영. `app_config`로 기준 위치 전역화, 동기화 범위·비활성 판정(`miss_count`)·타일링 깊이 한도·술집 제외, `created_by`와 `auth.uid()` 기본값, `sync_logs`·지표 컬럼 추가, v2 `room_members`·`join_room` 기반 권한 모델, 복합 FK, `close-room` 함수를 SQL 함수 `close_due_rooms()`로 대체, Realtime 구독 대상 보강, 오프라인 영속화, 테스트 기준 보강.
- 2026-10-14: `packages/core` 구현에 맞춰 수정. 거리 계산을 `packages/core/src/geo.ts`로 이동, 최근 기록 조회에 카테고리 포함, 분포 테스트 허용 오차를 ±1.5%p로 조정(±1%p는 약 2σ라 우연한 실패 가능).
- 2026-10-14: 식당 데이터 출처를 카카오 로컬 API에서 공공데이터(일반음식점·휴게음식점 인허가)로 변경. 카카오는 응답 저장을 금지하고, 네이버 지역 검색은 전체 수집이 불가능하기 때문이다. `sync-places`·`search-place` Edge Function, 카카오 키, pg\_net·Vault를 제거하고 가져오기 스크립트와 `import_logs`로 대체했다. `places`를 `source`(public/manual)·`source_id` 구조로 바꾸고, 직접 추가 식당은 위치 없이 등록할 수 있게 했다. 지도는 카카오맵·네이버 지도 링크로만 연결한다.
- 2026-10-14: 성남시 실제 파일로 확정. CP949·39개 컬럼 확인, 업태 매핑을 실제 값으로 수정(횟집, 패밀리레스트랑, 휴게음식점 업태 추가), 상호명 기반 카페 제외 규칙 추가, 좌표 변환 정의를 실측으로 검증, 갱신 처리를 DB 함수 `import_places`로 일원화, 식당 삭제를 비활성화로 처리.
- 2026-10-14: 오프라인 캐시 영속화(범위와 한계 명시), 캐시 소유자 확인, 이메일 계정 연결 구현. 배포는 README의 절차로 진행하고, Vercel은 `apps/web/vercel.json`의 SPA 재작성 규칙을 쓴다.
- 2026-10-14: v1 정식 범위 구현. 상호명 기반 비식당 제외 규칙(PC방, 홀덤펍, 술집 등)을 추가하고 제외 행을 바로 비활성화하도록 했다(로컬 데이터 기준 15곳 비활성화, 활성 252곳). 기록 통계는 `packages/core`의 `mealStats()`로 계산하고, 필터는 Zustand `persist`로 localStorage에 기억한다.
- 2026-10-14: 홈 화면 배경에 수내역 사진 잔상 효과 추가(three.js `AfterimagePass`, 지연 로딩). 첫 화면 번들 예산에서 지연 로딩 파일을 분리하고, 배경 효과의 렌더링·접근성 기준과 사진 라이선스 표시를 정의했다. Motion은 `LazyMotion` 방식으로 바꿔 첫 화면 번들을 176.6KB에서 163.1KB로 줄였다.
