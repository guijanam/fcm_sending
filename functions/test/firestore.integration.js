import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {initializeApp,deleteApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {createFirestoreStore} from '../store.js';
import {createService} from '../service.js';

const host=process.env.FIRESTORE_EMULATOR_HOST;
const enabled=Boolean(host);
test('real Firestore emulator: durable concurrency, replay, mismatch, cooldown, history', {skip:!enabled}, async () => {
  assert.match(host,/^(127\.0\.0\.1|localhost):\d+$/, 'Integration tests only permit a local emulator.');
  const app=initializeApp({projectId:'demo-fcm-admin'},`integration-${randomUUID()}`);
  const db=getFirestore(app,'fcm-admin');
  const auth={uid:'admin',token:{email:'admin@example.com',email_verified:true,firebase:{sign_in_provider:'google.com'}}};
  const config=()=>({adminEmail:'admin@example.com',adminUid:''});
  const make=(now,sendMessage)=>createService({getConfig:config,store:createFirestoreStore(db),now:()=>now,sendMessage});
  const base=1700000000000;
  let calls=0;
  // This injected transport is confined to this separate test process; no FCM SDK imported.
  const transport=async ()=>{calls++;return 'test-only-message-id';};
  const data={title:'Hello',body:'Body',requestId:randomUUID(),dryRun:false};
  try {
    await db.recursiveDelete(db.collection('fcm_admin_announcements'));
    await db.recursiveDelete(db.collection('fcm_admin_state'));
    const a=make(base,transport);const b=make(base,transport);
    const results=await Promise.all([a.send({auth,data}),b.send({auth,data})]);
    assert.equal(calls,1);
    assert.equal(results.filter(r=>r.duplicate).length,1);
    assert.equal((await a.send({auth,data})).status,'accepted');
    await assert.rejects(a.send({auth,data:{...data,body:'Changed'}}),{code:'already-exists'});
    await assert.rejects(b.send({auth,data:{...data,requestId:randomUUID()}}),{code:'resource-exhausted'});
    assert.equal((await db.collection('fcm_admin_announcements').doc(data.requestId).get()).data().status,'accepted');
    const later=make(base+30000,transport);
    const distinct=await Promise.allSettled([later.send({auth,data:{...data,requestId:randomUUID()}}),later.send({auth,data:{...data,requestId:randomUUID()}})]);
    assert.equal(distinct.filter(r=>r.status==='fulfilled').length,1);
    assert.equal(distinct.find(r=>r.status==='rejected').reason.code,'resource-exhausted');
    assert.equal(calls,2);
    const pending={...data,requestId:randomUUID(),mode:'live',status:'pending',createdAt:base+60000};
    await createFirestoreStore(db).reserve(pending);
    assert.deepEqual(await make(base+90000,transport).send({auth,data:{...data,requestId:pending.requestId}}),{requestId:pending.requestId,status:'pending',duplicate:true});
    assert.equal(calls,2);
    const batch=db.batch();
    for(let i=0;i<25;i++) {
      const id=randomUUID();batch.set(db.collection('fcm_admin_announcements').doc(id),{...data,requestId:id,status:'validated',mode:'dry-run',createdAt:base+120000+i});
    }
    await batch.commit();
    const history=(await later.list({auth,data:{}})).items;
    assert.equal(history.length,20);
    assert.ok(history.every((r,i)=>i===0 || r.createdAt<=history[i-1].createdAt));
  } finally {
    await db.recursiveDelete(db.collection('fcm_admin_announcements'));
    await db.recursiveDelete(db.collection('fcm_admin_state'));
    await db.terminate();await deleteApp(app);
  }
});
