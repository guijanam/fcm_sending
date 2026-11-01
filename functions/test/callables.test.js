import test from 'node:test';
import assert from 'node:assert/strict';
process.env.ADMIN_EMAIL='admin@example.com';
process.env.ADMIN_UID='';
const functions = await import('../index.js');

test('callables use v2 Seoul bounded runtime and least-privilege service account', async () => {
  for (const name of ['fcmAdminStatus','fcmSendAnnouncement','fcmListAnnouncements']) {
    const f=functions[name];
    assert.equal(typeof f,'function');
    assert.equal(f.__endpoint.platform,'gcfv2');
    assert.deepEqual(f.__endpoint.region,['asia-northeast3']);
    assert.equal(f.__endpoint.availableMemoryMb,256);
    assert.equal(f.__endpoint.maxInstances,2);
    assert.equal(f.__endpoint.minInstances,0);
    assert.equal(f.__endpoint.serviceAccountEmail,'fcm-web-runtime@mydia-29ac2.iam.gserviceaccount.com');
    await assert.rejects(f.run({data:{}}),{code:'unauthenticated'});
  }
  assert.deepEqual(await functions.fcmAdminStatus.run({data:{},auth:{uid:'admin',token:{email:'admin@example.com',email_verified:true,firebase:{sign_in_provider:'google.com'}}}}),{topic:'documents',projectId:'mydia-29ac2',email:'admin@example.com'});
});

test('emulator callable wiring never sends live or dry-run and needs no production identity', async () => {
  const {execFileSync}=await import('node:child_process');
  const output=execFileSync(process.execPath,['--input-type=module','-e',`
    import assert from 'node:assert/strict';
    const functions=await import('./index.js');
    const auth={uid:'admin',token:{email:'admin@example.com',email_verified:true,firebase:{sign_in_provider:'google.com'}}};
    assert.notEqual(functions.fcmSendAnnouncement.__endpoint.serviceAccountEmail,'fcm-web-runtime@mydia-29ac2.iam.gserviceaccount.com');
    for(const dryRun of [true,false]) await assert.rejects(functions.fcmSendAnnouncement.run({auth,data:{title:'Hi',body:'Body',requestId:'11111111-1111-4111-8111-111111111111',dryRun}}),{code:'failed-precondition'});
    console.log('emulator-safe');
  `],{cwd:new URL('..',import.meta.url),env:{...process.env,FUNCTIONS_EMULATOR:'true',GCLOUD_PROJECT:'demo-fcm-admin',ADMIN_EMAIL:'admin@example.com'},encoding:'utf8'});
  assert.match(output,/emulator-safe/);
});
