# 최초 연결 및 배포

## 1. Firebase 웹 앱 등록

Firebase 콘솔 → `mydia-29ac2` → 프로젝트 설정 → 일반 → **앱 추가 → 웹 (`</>`)**.

이름은 예를 들어 `내근무 알림 관리자`. Firebase Hosting은 선택하지 않아도 됩니다. 화면은 GitHub Pages에서 제공합니다. 표시되는 `firebaseConfig`의 **객체 값만 유효한 JSON**으로 저장합니다. Android용 `google-services.json`이나 서비스 계정 JSON이 아닙니다.

예시 (가짜 키/앱 ID를 실제 값으로 교체):

```json
{
  "apiKey": "Firebase에서_복사한_웹_API_키",
  "authDomain": "mydia-29ac2.firebaseapp.com",
  "projectId": "mydia-29ac2",
  "messagingSenderId": "188406916055",
  "appId": "1:188406916055:web:실제웹앱ID",
  "backendReady": false
}
```

- GitHub 저장소 → Settings → Secrets and variables → Actions → **Variables** → `FIREBASE_WEB_CONFIG`에 위 JSON을 저장합니다.
- 이 값은 웹 빌드에 공개됩니다. **`private_key`, `client_email`, 서비스 계정 키는 절대 넣지 않습니다.** 빌드 유틸리티가 서비스 계정/다른 프로젝트/Android 앱 ID를 거부합니다.
- 로컬에서는 실제 공개 설정을 `public/firebase-config.json`에 넣거나, 환경변수 `FIREBASE_WEB_CONFIG`를 지정하고 `node scripts/prepare-config.mjs`를 실행합니다. API 키 사용 제한을 설정했다면 운영 호스트/로컬 호스트와 필요한 Firebase API가 허용되어야 합니다.

## 2. Google 로그인

Firebase Authentication → Sign-in method → **Google 활성화**. 프로젝트 지원 이메일도 지정합니다.

Authentication → Settings → Authorized domains에 다음 호스트를 추가합니다 (경로/스킴 제외):

```text
guijanam.github.io
localhost
```

실서비스 로그인은 GitHub Pages에서 Google 팝업 로그인을 사용합니다. 팝업을 차단하는 인앱 브라우저에서는 휴대폰 기본 Chrome/Safari로 열고 팝업을 허용하세요. `authDomain`은 Firebase의 원래 `mydia-29ac2.firebaseapp.com`을 유지합니다.

다른 사람이 Google 로그인을 해 Firebase Auth 사용자 목록에 생성될 수는 있지만, **서버의 관리자 검증을 통과하지 않으면 작성/발송/기록 접근은 불가능**합니다.

## 3. 서버 리소스 준비 — 한 번만

**이 단계는 결제/클라우드 리소스와 IAM 권한을 변경합니다. 소유자가 확인 후 실행하세요.** Blaze 요금제, 예산 알림, Google Cloud CLI(`gcloud`) 및 프로젝트 관리 권한이 필요합니다. 기존 Android 앱의 Firebase 설정/기본 Firestore DB/규칙은 변경하지 않습니다.

```sh
gcloud auth login
gcloud config set project mydia-29ac2

gcloud services enable cloudfunctions.googleapis.com run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com firestore.googleapis.com firebaserules.googleapis.com fcm.googleapis.com iamcredentials.googleapis.com sts.googleapis.com

# 이미 있다면 새로 만들지 않아도 됩니다.
gcloud iam service-accounts create fcm-web-runtime --display-name="FCM web runtime"

gcloud projects add-iam-policy-binding mydia-29ac2 --member="serviceAccount:fcm-web-runtime@mydia-29ac2.iam.gserviceaccount.com" --role="roles/firebasecloudmessaging.admin"
gcloud projects add-iam-policy-binding mydia-29ac2 --member="serviceAccount:fcm-web-runtime@mydia-29ac2.iam.gserviceaccount.com" --role="roles/datastore.user" --condition='expression=resource.name=="projects/mydia-29ac2/databases/fcm-admin",title=FcmAdminDatabaseOnly'

# 전용 named database. 기존 (default) DB를 삭제/변경하지 않습니다.
gcloud firestore databases create --database=fcm-admin --location=asia-northeast3 --type=firestore-native
```

이미 `fcm-admin` DB가 있으면 위치/용도를 확인한 뒤 재사용합니다. 별도 DB를 만들 수 없는 프로젝트 정책이 있다면 먼저 정책을 해결하세요. 보안상 기존 앱 DB를 임의로 대신 사용하지 마세요.

Firestore 역할에는 위의 **데이터베이스별 IAM 조건**을 유지해야 합니다. 이 서버 계정에 기존의 무조건부 `roles/datastore.user` 또는 더 넓은 Owner/Editor 권한을 추가하지 마세요. 이미 무조건부 `datastore.user`를 부여했다면 조건부 권한을 추가하는 것만으로 범위가 줄어들지 않습니다. 먼저 아래 명령으로 해당 서버 계정의 무조건부 바인딩을 제거한 뒤 위 조건부 권한만 유지하세요 (다른 계정/앱의 권한은 변경하지 않음).

```sh
gcloud projects remove-iam-policy-binding mydia-29ac2 \
  --member="serviceAccount:fcm-web-runtime@mydia-29ac2.iam.gserviceaccount.com" \
  --role="roles/datastore.user" --condition=None
```

## 4. 첫 서버 배포 — 로컬에서 가장 간단한 경로

```sh
cd /Users/sonbummini/Desktop/fcm_web
npm ci
npm ci --prefix functions
npx firebase login
```

`functions/.env.mydia-29ac2` 파일을 준비합니다 (`.gitignore`에 포함):

```dotenv
ADMIN_EMAIL=본인Google계정이메일
ADMIN_UID=
```

`ADMIN_EMAIL`은 원하는 **단 하나의 Google 계정**입니다. 이 작업 시 로컬 파일과 GitHub Secret `ADMIN_EMAIL`은 요청한 계정으로 설정했습니다. 변경할 때 양쪽을 함께 수정하세요. `ADMIN_UID`는 첫 Google 로그인 후 Firebase Authentication 사용자 목록의 UID를 복사해 추가하면 계정을 더 엄격하게 고정할 수 있습니다.

```sh
# 오직 전용 named DB 규칙과 이 저장소의 functions codebase만 배포
npx firebase deploy --project mydia-29ac2 --only firestore:rules,functions:fcm-admin
npx firebase functions:list --project mydia-29ac2
```

`firebase.json`의 Firestore 대상은 **`fcm-admin` DB만** 포함합니다. 기본 DB 규칙은 배포하지 않습니다. 함수 삭제를 제안하는 CLI 경고가 나온다면 범위/codebase를 다시 확인하고 동의하지 마세요. 이 저장소의 함수는 `fcmAdminStatus`, `fcmSendAnnouncement`, `fcmListAnnouncements`입니다.

Google Cloud IAM 정책으로 인해 함수 공개 호출을 허용하지 못하면 프로젝트 관리자의 확인이 필요합니다. Firebase callable은 인프라에서 접근 가능한 엔드포인트여야 하고 **실제 관리자 권한은 함수 내부에서 검증**합니다. 조직 정책을 임의로 완화하지 마세요.

## 5. GitHub Pages

저장소 Settings → Pages → Source를 **GitHub Actions**로 설정합니다. 이후 `main` push 또는 Actions의 `Verify and deploy GitHub Pages` → Run workflow.

```text
https://guijanam.github.io/fcm_sending/
```

`FIREBASE_WEB_CONFIG` 변수를 추가/수정했다면 **워크플로를 다시 실행**해야 반영됩니다. 설정이 없으면 배포 자체는 성공하되 잠긴 초기 설정 화면을 보여 줍니다.

### 요금제 전환을 나중에 할 때

웹 설정만 먼저 연결하고 `backendReady: false`를 유지하세요. 사이트에는 **발송 서버 배포 대기**가 표시되고, 로그인·발송·기록 조회가 비활성화됩니다. 이 값이 없으면 빌드 유틸리티가 기본값 `false`를 추가합니다. 웹 설정 연결은 서버 배포나 관리자 인증 성공을 뜻하지 않습니다.

나중에 Google 로그인 설정, 전용 데이터베이스/런타임 계정, 함수 배포를 완료한 뒤 GitHub 변수 `FIREBASE_WEB_CONFIG` JSON의 **`backendReady`를 `true`로 변경하고 Pages 워크플로를 다시 실행**하세요. 이 표시는 UI 운영 상태를 위한 것이며, 서버의 관리자 권한 검증을 대신하지 않습니다.

Firebase Authentication이 아직 초기화되지 않아 `CONFIGURATION_NOT_FOUND`가 반환되면 Firebase 콘솔 → Authentication → 시작하기 → Google 로그인을 설정하세요. 결제를 요구하는 Identity Platform 초기화/업그레이드 API로 우회하지 마세요. 승인된 도메인에는 기존 값을 유지하면서 `guijanam.github.io`와 필요 시 `localhost`를 추가합니다.

## 6. 서버도 GitHub에서 배포하기 (선택, 최초 준비 이후)

GitHub에서 Firebase 장기 비밀키를 저장하지 않도록 **OIDC / Workload Identity Federation**을 사용합니다. 이 단계는 프로젝트 IAM 관리자가 진행합니다.

### 6-A. 배포 계정과 권한

```sh
gcloud iam service-accounts create fcm-web-deployer --display-name="GitHub FCM deployment"
```

배포 계정 `fcm-web-deployer@mydia-29ac2.iam.gserviceaccount.com`에는 작업 범위에 맞춰 다음 역할이 필요합니다. 조직의 제한이 있으면 관리자에게 최소 권한 구성을 요청하세요. **프로젝트 Owner/Editor를 편의상 부여하지 마세요.**

- `roles/cloudfunctions.admin`
- `roles/run.admin`
- `roles/artifactregistry.admin`
- `roles/cloudbuild.builds.editor`
- `roles/serviceusage.serviceUsageConsumer`
- `roles/firebase.viewer`
- `roles/firebaserules.admin`

추가로 `fcm-web-runtime` 런타임 서비스 계정과 실제 Cloud Build에 사용하는 서비스 계정에 대해 배포 계정이 `roles/iam.serviceAccountUser`를 가져야 합니다. Cloud Build 빌드 계정에는 `roles/cloudbuild.builds.builder` 등 필요한 빌드 권한이 있어야 합니다. 프로젝트 생성 시점/조직 정책에 따라 기본 빌드 계정이 다르므로 Google Cloud Build의 실제 계정을 확인하세요. CLI의 권한 오류를 보고 Owner 역할로 우회하지 마세요.

### 6-B. WIF provider

```sh
gcloud iam workload-identity-pools create github-fcm --location=global --display-name="GitHub FCM"

gcloud iam workload-identity-pools providers create-oidc github \
  --location=global --workload-identity-pool=github-fcm \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository_id=assertion.repository_id" \
  --attribute-condition="assertion.repository_id=='1441762874' && assertion.repository_owner_id=='150688612' && assertion.ref=='refs/heads/main'"
```

프로젝트 번호를 `gcloud projects describe mydia-29ac2 --format='value(projectNumber)'`로 확인합니다. 아래 `PROJECT_NUMBER`는 그 숫자로 교체합니다.

```sh
gcloud iam service-accounts add-iam-policy-binding \
  fcm-web-deployer@mydia-29ac2.iam.gserviceaccount.com \
  --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/github-fcm/attribute.repository_id/1441762874"
```

GitHub Actions **Variables**:

| 이름 | 값 |
|---|---|
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | `projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/github-fcm/providers/github` |
| `GCP_SERVICE_ACCOUNT` | `fcm-web-deployer@mydia-29ac2.iam.gserviceaccount.com` |

GitHub Actions **Secrets**:

| 이름 | 값 |
|---|---|
| `ADMIN_EMAIL` | 허용할 Google 계정 이메일 (이미 등록) |
| `ADMIN_UID` | 선택: Firebase Authentication의 해당 사용자 UID |

GitHub의 `firebase-production` Environment에 Required reviewers를 두는 것을 권장합니다. 설정 후 `Deploy Firebase backend (manual)` 워크플로를 **main 브랜치에서 수동 실행**합니다. 서버 배포는 자동 push에 연결하지 않아 실수로 운영 권한을 바꾸지 않습니다.

## 7. 실제 연결 점검 — 전체 발송 없이 먼저

1. 웹 접속 → 본인 Google 계정 로그인 → 서버의 관리자 확인 통과.
2. 다른 계정은 접근 거절되는지 확인.
3. 제목/내용 입력 → **실제 발송 없는 검증** 실행.
4. 서버 기록이 `validated`로 표시되는지 확인. 이는 FCM 요청 형식 검증이며 기기 수신 테스트가 아닙니다.
5. 최종 공지 전송은 운영자가 직접 확인한 후 실행. `accepted`는 **FCM 접수**이지 모든 기기 도착 보장이 아닙니다.
6. 네트워크 끊김/결과 불명확 시 동일 공지를 새 요청으로 다시 보내지 말고 먼저 서버 기록을 확인.

## 참고 공식 문서

- [Firebase callable functions](https://firebase.google.com/docs/functions/callable)
- [Google 로그인](https://firebase.google.com/docs/auth/web/google-signin)
- [토픽 메시지](https://firebase.google.com/docs/cloud-messaging/send-topic-messages)
- [Functions 환경 설정](https://firebase.google.com/docs/functions/config-env)
- [Firestore 여러 데이터베이스](https://firebase.google.com/docs/firestore/manage-databases)
- [GitHub Pages Actions 배포](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
- [Google GitHub Actions 인증](https://github.com/google-github-actions/auth)
