# Backend verification

Run from `functions/`, using Node 22:

```sh
npm ci
npm test
npm audit --omit=dev
```

Real transaction integration (Java 21+ and Firebase CLI required):

```sh
firebase emulators:exec --config test/firebase.integration.json \
  --project demo-fcm-admin --only firestore \
  "node --test test/firestore.integration.js"
```

The integration suite only accepts a loopback `FIRESTORE_EMULATOR_HOST`, uses
project `demo-fcm-admin` and named database `fcm-admin`, clears only that demo
project's two dedicated collections, and injects its transport in a separate
Node test process. It never imports the FCM SDK or sends a real message.
`npm run test:integration` skips explicitly when the emulator host is absent.

Verified on Node 22.23.4: 15 unit/callable tests passed; the real Firestore
emulator integration passed; production dependency audit reported zero
vulnerabilities after updating transitive lockfile dependencies. The exact
firebase-admin 14.5.0 and firebase-functions 7.4.0 pins are unchanged.
The emulator SDK emitted a harmless metadata lookup warning on this host;
the transaction tests still completed successfully without credentials.

## Design and deployment contract

- `index.js` exposes only the three v2 callable functions in Seoul; production
  runtime identity is `fcm-web-runtime@mydia-29ac2.iam.gserviceaccount.com`.
  Emulator execution omits this identity and rejects both live and dry-run
  sends before storing reservations or calling messaging.
- Admin authorization checks configured `ADMIN_EMAIL`, optional `ADMIN_UID`,
  verified email, and the Google sign-in provider on every callable. No admin
  email or UID comes from the request. Missing email configuration fails closed.
- Production audit storage is exclusively `getFirestore('fcm-admin')`;
  provision that named database and deploy deny-all client rules separately.
  No existing app collection or default database is used.
- Only application default credentials are used. Keep `.env.mydia-29ac2`
  private and ignored; never check in keys. Runtime requires FCM send and
  Firestore permissions. Project provisioning, IAM and deployment are owned
  by the root project configuration, not this package.
- `accepted` means FCM accepted the request, not delivery to devices.
  `validated` is FCM's real dry-run validation, not an emulated result.
- A pending audit record and a shared 30-second cooldown are reserved atomically
  before FCM is called outside the transaction. Same-ID replays never resend;
  changed content/mode is rejected. Crashes can leave `pending` indefinitely.
  Ambiguous transport or settlement failures report `unknown` and must not be
  retried automatically with a new request ID.
- The history callable returns only the latest 20 public audit records. The
  server fixes topic `documents` and Android channel `fcm_messages`. There is
  no document-routing data or custom click action.

## TDD evidence

Each implementation slice was preceded by a failing `npm test` run and then
verified green: administrator status/authentication; strict payload validation;
reservation-before-send and acceptance semantics; dry-run/emulator guard;
replay/mismatch handling; safe failed/unknown settlement; bounded history;
atomic Firestore cooldown/reservation; one-time settlement; bounded store
query; v2 callable runtime wiring. Later regression cases expanded Unicode,
all-endpoint authorization, durable-before-transport ordering and emulator
callable safety. Integration then exercised the adapter against a real local
Firestore emulator. No deployment, commit, real FCM or credentialed production
Firestore operation was performed.
