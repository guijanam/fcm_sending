import test from 'node:test';
import assert from 'node:assert/strict';
import {createFirestoreStore} from '../store.js';

// Deterministic transactional adapter for unit tests; real emulator tested separately.
export function database() {
  const docs = new Map(); let tail = Promise.resolve();
  return {docs, collection(name) {return {doc(id) {return {path:`${name}/${id}`};}};},
    async runTransaction(fn) {
      const job = tail.then(async ()=> {
        const writes = []; const tx = {
          async get(ref) {const data=docs.get(ref.path);return {exists:data!==undefined,data:()=>structuredClone(data)};},
          create(ref,data) {assert.equal(docs.has(ref.path),false);writes.push(()=>docs.set(ref.path,structuredClone(data)));},
          set(ref,data) {writes.push(()=>docs.set(ref.path,structuredClone(data)));},
          update(ref,data) {writes.push(()=>docs.set(ref.path,{...docs.get(ref.path),...structuredClone(data)}));},
        };
        const result=await fn(tx); writes.forEach(f=>f()); return result;
      });
      tail=job.catch(()=>{});return job;
    },
  };
}
const record = {requestId:'11111111-1111-4111-8111-111111111111',title:'Hi',body:'Body',dryRun:false,mode:'live',status:'pending',createdAt:1700000000000};

test('Firestore reservation and global 30-second cooldown are atomic across instances', async () => {
  assert.equal(typeof createFirestoreStore,'function');
  const db=database();const a=createFirestoreStore(db);const b=createFirestoreStore(db);
  const results=await Promise.allSettled([a.reserve(record),b.reserve({...record,requestId:'22222222-2222-4222-8222-222222222222'})]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(results.find(r=>r.status==='rejected').reason.code,'resource-exhausted');
  assert.equal(db.docs.size,2);
  assert.equal(db.docs.get(`fcm_admin_announcements/${record.requestId}`).status,'pending');
  assert.equal((await b.reserve({...record,createdAt:record.createdAt+1})).fresh,false);
  await assert.rejects(b.reserve({...record,requestId:'three',createdAt:record.createdAt+29999}),{code:'resource-exhausted'});
  assert.equal((await b.reserve({...record,requestId:'three',createdAt:record.createdAt+30000})).fresh,true);
});

test('settlement only transitions pending reservation once and cannot create missing audit', async () => {
  const db=database();const store=createFirestoreStore(db);
  await store.reserve(record);
  assert.equal(typeof store.settle,'function');
  await store.settle(record.requestId,{status:'accepted',messageId:'id'});
  assert.equal(db.docs.get(`fcm_admin_announcements/${record.requestId}`).messageId,'id');
  await store.settle(record.requestId,{status:'failed'});
  assert.equal(db.docs.get(`fcm_admin_announcements/${record.requestId}`).status,'accepted');
  await assert.rejects(store.settle('missing',{status:'accepted'}),{code:'not-found'});
});

test('history query sorts latest first and caps at twenty', async () => {
  const db=database();const collection=db.collection.bind(db);
  db.collection=name=>({...collection(name),orderBy(field,direction) {
    assert.equal(name,'fcm_admin_announcements');assert.equal(field,'createdAt');assert.equal(direction,'desc');
    return {limit(n) {assert.equal(n,20);return {async get() {return {docs:[{data:()=>record}]};}};}};
  }});
  const store=createFirestoreStore(db);
  assert.equal(typeof store.list,'function');
  assert.deepEqual(await store.list(100),[record]);
});
