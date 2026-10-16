# 수내역 점심 룰렛

수내역 반경 500m 안의 식당 가운데 최근에 가지 않은 곳을 골라 주는 모바일 웹 앱입니다. 설계 문서는 [PRD](lunch-roulette-PRD.md), [TRD](lunch-roulette-TRD.md), [아키텍처](lunch-roulette-Architecture.md)에 있고, 작업 규칙은 [AGENTS.md](AGENTS.md)에 있습니다.

## 구성

| 경로 | 내용 |
| --- | --- |
| `apps/web` | React 18 + Vite 앱 (Vercel 배포 대상) |
| `packages/core` | 추천·쿨다운·통계 계산 (외부 의존성 없는 순수 TypeScript) |
| `scripts/import-places` | 공공데이터 CSV를 `places` 테이블에 넣는 스크립트 |
| `supabase` | 마이그레이션, RLS, pgTAP 테스트, 로컬 설정 |

## 로컬 실행

준비물: Node 22 이상, pnpm, Docker Desktop, Supabase CLI

1. 의존성을 설치합니다.

   ```bash
   pnpm install
   ```

2. Docker Desktop을 켠 뒤 로컬 Supabase를 띄웁니다. 처음에는 이미지를 받느라 몇 분 걸립니다. 마이그레이션도 이때 적용됩니다.

   ```bash
   supabase start
   ```

3. 환경 변수 파일을 만듭니다. 값은 `supabase status`에 나오는 로컬 주소와 키를 씁니다.
   - `apps/web/.env.example`을 `apps/web/.env.local`로 복사하고 publishable(anon) 키를 넣습니다.
   - `scripts/import-places/.env.example`을 `scripts/import-places/.env`로 복사하고 secret(service role) 키를 넣습니다.

4. 식당 데이터를 넣습니다. [공공데이터포털](https://www.data.go.kr/)에 로그인해 "식품_일반음식점"과 "식품_휴게음식점"의 성남시 CSV를 받아 `data/raw/`에 둡니다(git에서 제외됨). 경로는 절대 경로로 넘깁니다.

   ```bash
   pnpm import:places "$PWD/data/raw/식품_일반음식점_경기성남시.csv" "$PWD/data/raw/식품_휴게음식점_경기성남시.csv"
   ```

5. 앱을 실행하고 http://localhost:5173 을 엽니다.

   ```bash
   pnpm dev
   ```

6. 팀 투표 방을 쓰려면 다른 터미널에서 `create-room` Edge Function을 띄웁니다. `packages/core`를 함수 폴더로 복사한 뒤 실행합니다.

   ```bash
   pnpm functions:serve
   ```

로컬 인증 메일은 실제로 발송되지 않고 http://127.0.0.1:54324 (Mailpit)에 쌓입니다.

## 검사

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
supabase test db
```

`pnpm test:e2e`와 `supabase test db`는 로컬 Supabase가 떠 있고 식당 데이터를 넣은 상태에서 실행합니다. `pnpm test:e2e`의 팀 투표 테스트는 `pnpm functions:serve`도 떠 있어야 하고, 마감 확정을 pg_cron(1분 주기)으로 기다리므로 1분 남짓 걸립니다. 첫 E2E 실행 전에는 브라우저를 한 번 설치합니다.

```bash
pnpm --filter @lunch/web exec playwright install chromium
```

## 배포

클라우드 Supabase 프로젝트와 Vercel 프로젝트가 필요합니다. 팀 투표 방(v2)은 Edge Function 하나(`create-room`)와 pg_cron 작업 하나를 더 씁니다.

### 1. Supabase 클라우드 프로젝트

1. [supabase.com](https://supabase.com)에서 프로젝트를 만듭니다. 리전은 Northeast Asia (Seoul)를 권장합니다.
2. 로컬 저장소와 연결하고 마이그레이션을 적용합니다.

   ```bash
   supabase login
   ```

   ```bash
   supabase link --project-ref <프로젝트 ref>
   ```

   ```bash
   supabase db push
   ```

   v2 마이그레이션이 pg_cron 확장을 켜고 `close-due-rooms` 작업(1분마다)과 Realtime 발행 대상을 등록합니다.

   팀 투표 방의 Edge Function을 배포합니다.

   ```bash
   pnpm functions:deploy
   ```

3. 대시보드 Authentication 설정을 맞춥니다. 로컬 `supabase/config.toml`은 클라우드에 자동으로 반영되지 않습니다.
   - Anonymous sign-ins: 켜기
   - Confirm email: 켜기 (다른 사람의 이메일을 연결하지 못하게 하려면 필요)
   - Site URL: Vercel 주소. Redirect URLs에 `https://<배포 주소>/**` 추가
   - 이메일 발송: 기본 메일 서버는 발송량이 매우 적으므로, 실사용 전에 SMTP를 연결합니다 (확인 필요)
4. 식당 데이터를 넣습니다. `scripts/import-places/.env.cloud`(git 제외)에 클라우드 프로젝트의 `SUPABASE_URL`과 `SUPABASE_SERVICE_ROLE_KEY`를 적고 실행합니다. 로컬용 `.env`는 건드리지 않습니다.

   ```bash
   pnpm import:places:cloud "$PWD/data/raw/식품_일반음식점_경기성남시.csv" "$PWD/data/raw/식품_휴게음식점_경기성남시.csv"
   ```

### 2. Vercel

1. GitHub 저장소를 Vercel에 가져오고 Root Directory를 `apps/web`으로 지정합니다. pnpm 워크스페이스는 Vercel이 저장소 루트에서 설치합니다.
2. 환경 변수를 넣습니다.
   - `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`: 클라우드 프로젝트의 URL과 publishable(anon) 키
   - `ENABLE_EXPERIMENTAL_COREPACK=1`: 루트 `package.json`의 `packageManager`에 적힌 pnpm 버전으로 설치하게 합니다
3. 배포합니다. `apps/web/vercel.json`이 모든 경로를 `index.html`로 보내므로 `/history` 같은 주소로 바로 들어와도 열립니다.

### 배포 후 확인

- 첫 방문에 익명 로그인되고 식당 수가 표시되는지
- 돌리기 → 여기 갈래 → 기록 화면에 남는지
- 설정에서 이메일 연결 메일이 오는지

## 데이터와 사진 출처

- 식당 정보: 행정안전부 공공데이터(일반음식점·휴게음식점 인허가 정보)
- 배경 사진: [View from Sunae Overpass](https://commons.wikimedia.org/wiki/File:View_from_Sunae_Overpass.jpg), Semtall, [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/deed.ko). 크기를 줄이고 잔상 효과를 더해 사용합니다.
- 지도: 카카오맵·네이버 지도로 링크만 연결합니다. 두 서비스의 API 응답은 약관상 저장할 수 없어 쓰지 않습니다.
