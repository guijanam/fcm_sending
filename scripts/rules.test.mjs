import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';

let env;
before(async () => {
  assert.ok(process.env.FIRESTORE_EMULATOR_HOST, 'Run through Firebase emulators:exec; never contact a live database.');
  env = await initializeTestEnvironment({
    projectId: 'demo-fcm-admin',
    firestore: { rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8') },
  });
  await env.withSecurityRulesDisabled(async (context) => {
    await context.firestore().doc('fcm_admin_announcements/test').set({ title:'Rule test only' });
  });
});
after(async () => { await env?.cleanup(); });

test('only the isolated fcm-admin database is a deployment target', () => {
  const config = JSON.parse(readFileSync(new URL('../firebase.json', import.meta.url), 'utf8'));
  assert.deepEqual(config.firestore.map((db) => db.database), ['fcm-admin']);
  assert.equal(config.firestore[0].rules, 'firestore.rules');
});

test('the deployed rules deny unauthenticated reads and writes', async () => {
  const db = env.unauthenticatedContext().firestore();
  await assertFails(db.doc('fcm_admin_announcements/test').get());
  await assertFails(db.doc('fcm_admin_announcements/injected').set({ status:'accepted' }));
});

test('even authenticated clients cannot read or alter the private audit database', async () => {
  const db = env.authenticatedContext('rule-test-user', { email:'admin@example.com', email_verified:true, firebase:{ sign_in_provider:'google.com' } }).firestore();
  await assertFails(db.doc('fcm_admin_announcements/test').get());
  await assertFails(db.collection('fcm_admin_announcements').get());
  await assertFails(db.doc('fcm_admin_state/lock').set({ lastSentAt:0 }));
  await assertFails(db.doc('fcm_admin_announcements/test').delete());
});
