# 내근무 · 알림 센터

모바일에서 제목과 내용을 입력해 기존 Android 앱의 `documents` 토픽으로 공지를 보내는 개인 관리자 웹입니다.

- 프로젝트: `mydia-29ac2`
- Android 패키지: `com.sonbum.diacalendar2`
- 웹 배포: GitHub Pages (`https://guijanam.github.io/fcm_sending/`)
- 서버: Firebase Cloud Functions 2세대 / 서울 `asia-northeast3`
- 감사 기록: **별도의 Firestore 데이터베이스 `fcm-admin`** (기존 앱의 기본 데이터베이스와 분리)

## 중요한 현재 상태

소스만 올려도 발송 권한이 생기지는 않습니다. **Firebase 웹 앱 설정·Google 로그인·서버 배포가 끝나기 전에는 잠긴 초기 설정 화면만 표시**됩니다. 공개 웹 설정을 연결한 뒤 서버 배포를 미루는 경우 `backendReady: false`로 **발송 서버 배포 대기** 화면을 표시하며 로그인과 발송을 중지합니다. 서버 준비 후에는 GitHub 변수의 해당 값을 `true`로 바꾸고 Pages를 재배포해야 합니다. 관리자 이메일은 공개 소스에 넣지 않으며 서버의 `ADMIN_EMAIL` 환경변수와 GitHub Secret으로 설정합니다. Firebase 비밀키나 서비스 계정 JSON을 웹페이지/저장소에 올리지 마세요.

**GitHub Pages는 화면만 호스팅합니다.** FCM 발송 권한과 로그인 검증은 Firebase 서버에서 처리합니다. 서버 배포에는 프로젝트의 Blaze 요금제와 필요한 Google Cloud 권한이 필요합니다. 이 저장소는 결제 활성화를 자동 실행하지 않습니다.

## 기능

- Google 로그인 + 서버에서 관리자 이메일/이메일 인증/Google 로그인 제공자 확인 (선택적으로 UID까지 고정)
- 고정 발송 대상 `documents` — 웹에서 다른 토픽으로 변경 불가
- 제목/내용 작성, Android 알림 미리보기
- 제목 최대 80자 / 내용 최대 1,000자 및 토픽 메시지 전체 UTF-8 2,048바이트 제한 (한글·이모지 사용 시 입력 가능한 글자 수가 더 줄어듭니다)
- 체크박스를 포함한 최종 확인 후 발송
- **실제 발송 없는 FCM 검증** (`dryRun=true`)
- 서버 발송 기록 최신 20개
- Firestore 트랜잭션 기반 요청 중복 방지와 30초 간격 제한
- FCM 접수와 실제 기기 도착을 명확히 구분
- 결과가 불명확한 요청을 새 요청으로 자동 재전송하지 않음
- 모바일 반응형 레이아웃, 홈 화면 추가용 manifest (개인정보 캐싱 서비스 워커 없음)

> 전체 대상은 앱 설치 수가 아니라 **`documents` 토픽 구독에 성공한 기기**입니다. Android의 알림 권한, 오프라인 상태, 구버전 앱 등에 따라 표시 여부는 달라집니다.

## 로컬 실행

Node.js **24 LTS** 권장 (`.nvmrc`).

```sh
npm ci
npm ci --prefix functions
npm run dev
```

Firebase 연결 전에는 초기 설정 화면이 정상입니다. 공개 웹 앱 설정을 연결하려면 [배포 안내](docs/DEPLOY.md)를 따르세요. 로컬 개발에서도 Firebase Auth의 승인된 도메인에 `localhost`를 추가해야 합니다. 로그인된 계정에 서버 권한이 없으면 작성 화면에 접근할 수 없습니다.

## 검증

```sh
npm run test:config
npm test
npm run test:server
npm run test:emulator # Java 21 필요, 실제 Firebase에는 접속하지 않음
npm run build
npx playwright install chromium
npm run test:e2e
npm audit --omit=dev
npm audit --prefix functions --omit=dev
```

단위 테스트에서 Firebase/FCM 어댑터를 대체한 것은 테스트에만 해당합니다. 프로덕션 빌드에 가짜 로그인, 샘플 발송 성공, 관리자 우회 모드는 없습니다. 브라우저 테스트는 실제 초기 설정 페이지를 확인하며, **실제 Google 로그인 및 FCM 전달 완료를 증명하지 않습니다.** 실제 Firebase 접속 권한이 있는 환경에서 별도 검증이 필요합니다.

## 배포

자세한 순서는 **[docs/DEPLOY.md](docs/DEPLOY.md)** 참고.

1. Firebase에 웹 앱을 등록하고 Google 로그인을 켭니다.
2. GitHub Repository Variable `FIREBASE_WEB_CONFIG`에 공개 웹 앱 설정 JSON을 저장합니다.
3. 전용 서버 계정과 `fcm-admin` Firestore 데이터베이스를 준비하고 서버를 배포합니다.
4. GitHub Pages 워크플로는 `main`에 push할 때 테스트·빌드 후 자동 배포합니다.
5. 이후 서버 코드도 GitHub에서 배포하려면 키 없는 Workload Identity Federation 설정 후 수동 `Deploy Firebase backend (manual)` 워크플로를 사용합니다.

웹 화면만 먼저 배포해도 Firebase 연결 전에는 **안전하게 발송 불가능한 상태**를 유지합니다.

## 보안 / 범위

- 프론트엔드 파일은 공개될 수 있습니다. Firebase 웹 API 키는 클라이언트 설정이며 발송용 관리자 비밀키가 아닙니다.
- 모든 callable은 서버에서 권한을 검사합니다. 다른 Google 계정이 Firebase Auth 로그인/가입에 성공하더라도 관리자 기능은 사용할 수 없습니다.
- 본인 계정의 MFA를 켜고 Firebase/GCP 프로젝트 권한도 제한하세요.
- 서버의 기본 자격증명만 사용합니다. 별도 장기 서비스 계정 키는 불필요합니다.
- 전용 `fcm-admin` DB의 클라이언트 읽기/쓰기는 모두 금지합니다. 기존 앱의 기본 Firestore 규칙을 바꾸지 않습니다.
- 공개 callable의 인프라 요청 비용은 인증 검사만으로 완전히 막을 수 없습니다. 출시 후 Firebase App Check와 Cloud Billing 예산 알림을 추가로 구성하세요.
- 이 서비스는 즉시 공지만 지원합니다. 예약 발송, 사용자별 타기팅, 수신자 수/도착률 통계는 포함하지 않습니다.
