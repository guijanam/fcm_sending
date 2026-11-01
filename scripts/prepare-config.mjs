import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export function publicConfig(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Firebase 웹 앱 설정 객체가 필요합니다.');
  if (value.private_key || value.private_key_id || value.client_email || value.type === 'service_account') throw new Error('서비스 계정 키는 웹 설정으로 사용할 수 없습니다.');
  for (const key of ['apiKey', 'authDomain', 'projectId', 'appId', 'messagingSenderId']) {
    if (typeof value[key] !== 'string' || !value[key].trim()) throw new Error(`Firebase 웹 설정 ${key} 필드가 필요합니다.`);
  }
  if (value.projectId !== 'mydia-29ac2' || value.authDomain !== 'mydia-29ac2.firebaseapp.com' || value.messagingSenderId !== '188406916055' || !/^1:188406916055:web:[a-zA-Z0-9]+$/.test(value.appId)) {
    throw new Error('mydia-29ac2 프로젝트에 등록한 웹 앱의 설정을 사용하세요. Android 앱 설정은 사용할 수 없습니다.');
  }
  if (value.backendReady !== undefined && typeof value.backendReady !== 'boolean') throw new Error('backendReady는 true 또는 false여야 합니다.');
  return {
    backendReady: value.backendReady === true,
    apiKey: value.apiKey,
    authDomain: value.authDomain,
    projectId: value.projectId,
    appId: value.appId,
    messagingSenderId: value.messagingSenderId,
    functionsRegion: 'asia-northeast3',
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const raw = process.env.FIREBASE_WEB_CONFIG?.trim();
  if (raw) {
    const config = publicConfig(JSON.parse(raw));
    writeFileSync(new URL('../public/firebase-config.json', import.meta.url), `${JSON.stringify(config, null, 2)}\n`);
    console.log('Public Firebase web configuration prepared. No server credentials are bundled.');
  } else {
    console.log('FIREBASE_WEB_CONFIG is not set: publishing the locked setup screen.');
  }
}
