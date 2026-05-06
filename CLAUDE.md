# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트 개요

한국지방재정공제회(LOFA) 사내근로복지기금 직원용 복지신청 시스템.
Next.js 16 App Router (정적 export) + Firebase (Auth / Firestore / Storage / Functions / Hosting).
사이트: `https://lofawelfare-3ae73.web.app`. GitHub: `yjhyjh8411-ctrl/lofawelfare`.

## 자주 쓰는 명령

| 작업 | 명령 |
|---|---|
| 개발 서버 | `npm run dev` |
| 정적 빌드 | `npm run build` (출력 `out/`) |
| Functions 빌드 | `npm --prefix functions run build` (deploy 직전 자동 실행됨) |
| Hosting+Functions 배포 | `firebase deploy --only hosting,functions` |
| Firestore 룰 배포 | `firebase deploy --only firestore:rules` |
| 일괄 ship (build → deploy → commit → push) | `~/.claude/skills/welfare-ship/scripts/ship.sh "<커밋 메시지>"` 또는 사용자가 "ship" / "배포해줘" |

린트/테스트 스크립트는 `package.json` 에 정의되어 있지 **않다**. 새로 추가할 때는 사용자에게 먼저 확인.

## 아키텍처 핵심 (멀티 파일 읽지 않으면 알기 힘든 것)

### 정적 export + 동적 라우트 회피 트릭

`next.config.ts` 가 `output: 'export'` 라서 `app/apply/[formId]/page.tsx` 같은 catch-all 은 빌드 시 단일 fallback HTML 로 떨어진다. 그 갭을 `firebase.json` rewrites 가 메꾼다:

- `/apply/**` → `/apply/_/index.html`
- `/admin/forms/**/edit` → `/admin/forms/_/edit/index.html`

**새 동적 라우트를 추가하면 `firebase.json` 의 rewrites 에 같은 패턴을 추가해야 한다.** 안 하면 새로고침 시 404.

### 백엔드가 둘이다

1. **Firebase Functions (Express)** — `functions/src/index.ts` 안의 `app: express` 가 `onRequest` 로 export 되어 `/api/**` 전체를 받는다. 이쪽이 사실상 메인 API.
2. **Next.js API route** — `src/lib/api-auth.ts` 의 `requireAuth` / `requireAdmin` 헬퍼는 Next 서버 컴포넌트/route 에서 쓰지만, 정적 export 모드에선 거의 안 쓰임. 신규 엔드포인트는 **Functions 쪽에 추가**가 기본.

두 백엔드 모두 같은 인증 모델을 쓴다: 클라이언트가 Firebase ID Token 을 `Authorization: Bearer <token>` 으로 보내면 서버가 `auth.verifyIdToken` 으로 검증하고 `users/{uid}.isAdmin` 으로 관리자 판정.

### Firestore 스키마는 **한글 필드명** 이다

`users` 컬렉션은 `사번`, `성명`, `부서`, `직급`, `이메일`, `구글이메일`, `입사일`, `전화번호` 같은 한글 키를 쓴다. `applications.applicant['사번']` 처럼 중첩도 한글. 영어 필드명 (`employeeId`, `name`, `department`...) 는 `auth-context.tsx` 에서 fallback 으로만 매핑된다 — 새로 쓸 때는 **한글 필드명을 정본으로 두고 영어를 fallback** 패턴을 따라야 한다.

`isAdmin` 판정은 두 경로: `users/{uid}.isAdmin === true` **또는** `uid === 'admin'` (`firestore.rules` 와 백엔드 코드 모두 동일).

### 중복 가입 방지 3계층

최근 커밋 시리즈 (`dcad424`, `7b499c8`, `479117b`, `4c49b4f`) 가 보여주듯 Google 로그인 우회로 같은 사람이 두 계정을 만드는 사고가 있었다. 현재 가드는:

1. 사번 사전 확인 모달 (Google 로그인 직전)
2. 이메일 case-insensitive 매칭
3. Functions `/api/lookup-email` — `users.이메일`, `users.구글이메일`, `auth.getUserByEmail` 3단 조회

**auth 흐름을 손댈 때 이 3계층을 모두 유지하는지 확인.**

### 민감정보 암호화

`functions/src/index.ts` 의 `encrypt/decrypt` 는 AES-256-GCM 사용, `process.env.ENCRYPTION_KEY` (64-hex = 32 byte) 필수. 포맷은 `enc:<iv>:<authTag>:<ciphertext>`. 클라이언트에서 평문을 받아 암호화해 Firestore 에 저장하는 흐름이라 **이 prefix 를 깨면 기존 데이터를 못 읽는다**. 민감 필드를 추가할 때는 같은 포맷 유지.

### AuthProvider 캐싱

`src/lib/auth-context.tsx` 는 프로필을 `sessionStorage` 에 5분 TTL 로 캐싱. 사용자 정보를 갱신했는데 화면이 안 바뀌면 `refreshProfile()` 호출 또는 세션 종료가 필요하다 — Firestore 만 업데이트해도 같은 탭 안에선 즉시 안 보일 수 있음.

### OAuth 콜백 URL 은 하드코딩

`functions/src/index.ts` 상단 `BASE_URL = 'https://lofawelfare-3ae73.web.app'` 이 Google/Solapi OAuth redirect 에 그대로 쓰인다. 다른 도메인에 배포하면 OAuth 콘솔 redirect URI 도 바꿔야 함.

## 기존 가이드 문서

- `GEMINI.md` — Gemini AI 협업 규칙 (Firebase Studio 환경 가정, blueprint.md 갱신 의무 등). Claude 작업에는 강제는 아니지만 디자인/UX 기조 (modern, bold, accessibility 강조) 는 참고할 만함.
- `blueprint.md` — 기능 변천 기록. 새 기능 추가하면 Gemini 가 갱신하던 문서지만 Claude 가 항상 갱신할 필요는 없음.
- `docs/` — 보안보고서, 신청자/관리자 매뉴얼. 변경 시 같이 업데이트하는 게 좋다.

## 작업 시 주의

- `firestore.rules` 를 수정했으면 deploy 시 `--only firestore:rules` 도 같이. `welfare-ship` 스킬은 staged 변경에 rules 가 있으면 자동으로 포함시킨다.
- 정적 export 라 서버 컴포넌트의 런타임 동작에 의존하면 안 된다 — 모든 데이터는 클라이언트에서 Firebase SDK 로 가져오거나 Functions API 를 호출.
- `node_modules`, `out/`, `functions/lib/`, `.next/` 는 빌드 산출물 — 커밋 금지 (이미 `.gitignore` 처리).
- 상위 디렉토리 `/Users/maegtti/클로드코드(claude)/CLAUDE.md` 는 Lofa **메일 처리** 파이프라인용 가이드라서 이 프로젝트와 직접 관계 없음. 둘을 혼동하지 말 것.
