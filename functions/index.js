import {initializeApp, getApps} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {getMessaging} from 'firebase-admin/messaging';
import {defineString} from 'firebase-functions/params';
import {onCall, HttpsError} from 'firebase-functions/v2/https';
import {createService, ServiceError} from './service.js';
import {createFirestoreStore} from './store.js';

const ADMIN_EMAIL = defineString('ADMIN_EMAIL');
const ADMIN_UID = defineString('ADMIN_UID', {default:''});
// No keys or user-supplied credentials: Cloud Functions uses its runtime identity.
if (!getApps().length) initializeApp();
const emulator = process.env.FUNCTIONS_EMULATOR === 'true' || Boolean(process.env.FIRESTORE_EMULATOR_HOST) || Boolean(process.env.FIREBASE_AUTH_EMULATOR_HOST);
const store = createFirestoreStore(getFirestore('fcm-admin'));
const service = createService({
  getConfig:()=>({adminEmail:ADMIN_EMAIL.value(),adminUid:ADMIN_UID.value()}),
  store,
  sendMessage:(message,dryRun)=>getMessaging().send(message,dryRun),
  emulator,
});
const options = {
  region:'asia-northeast3',maxInstances:2,minInstances:0,memory:'256MiB',
  // The emulator runs locally without looking up this production identity.
  ...(!emulator ? {serviceAccount:'fcm-web-runtime@mydia-29ac2.iam.gserviceaccount.com'} : {}),
};
function callable(method) {
  return onCall(options, async request => {
    try { return await service[method](request); }
    catch (error) {
      if (error instanceof ServiceError) throw new HttpsError(error.code,error.message);
      // Never surface SDK response bodies, access tokens, database paths or credentials.
      throw new HttpsError('internal','The operation could not be completed safely.');
    }
  });
}
export const fcmAdminStatus = callable('status');
export const fcmSendAnnouncement = callable('send');
export const fcmListAnnouncements = callable('list');
