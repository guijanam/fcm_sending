import test from 'node:test';
import assert from 'node:assert/strict';
import * as module from '../service.js';
const auth = {uid:'admin-uid',token:{email:' ADMIN@EXAMPLE.COM ',email_verified:true,firebase:{sign_in_provider:'google.com'}}};
const config = {adminEmail:'admin@example.com',adminUid:''};
const service = (options={}) => module.createService({getConfig:()=>config,...options});

test('status authenticates exact verified Google administrator, fails closed', async () => {
  assert.equal(typeof module.createService, 'function');
  assert.deepEqual(await service().status({auth,data:{}}), {topic:'documents',projectId:'mydia-29ac2',email:'admin@example.com'});
  const bad = [undefined, {...auth,token:{...auth.token,email:'other@example.com'}}, {...auth,token:{...auth.token,email_verified:false}}, {...auth,token:{...auth.token,firebase:{sign_in_provider:'password'}}}];
  for (const a of bad) await assert.rejects(service().status({auth:a,data:{}}), e=>['unauthenticated','permission-denied'].includes(e.code));
  await assert.rejects(service({getConfig:()=>({adminEmail:''})}).status({auth,data:{}}), {code:'failed-precondition'});
  await assert.rejects(service({getConfig:()=>({...config,adminUid:'another'})}).status({auth,data:{}}), {code:'permission-denied'});
});
const payload = {title:'Hello',body:'Announcement',requestId:'11111111-1111-4111-8111-111111111111',dryRun:false};

test('payload validates before storage, rejects unknown keys, types, lengths and oversized UTF-8', async () => {
  const s = service();
  assert.equal(typeof s.send, 'function');
  for (const data of [null, [], {}, {...payload,topic:'other'}, {...payload,title:' '}, {...payload,body:''}, {...payload,title:1}, {...payload,title:'a'.repeat(81)}, {...payload,body:'a'.repeat(1001)}, {...payload,requestId:'../id'}, {...payload,dryRun:'false'}, {...payload,body:'😀'.repeat(1000)}]) {
    await assert.rejects(s.send({auth,data}), {code:'invalid-argument'});
  }
  for (const data of [null,[],{extra:true}]) await assert.rejects(s.status({auth,data}), {code:'invalid-argument'});
});

function fixture(options={}) {
  const records = new Map();
  const calls = [];
  const store = {
    async reserve(record) { records.set(record.requestId, {...record}); return {fresh:true,record}; },
    async settle(id, update) { Object.assign(records.get(id), update); },
  };
  return {records,calls,store,s:service({store,sendMessage:async (...args)=>{calls.push(args);return 'projects/mydia-29ac2/messages/accepted';},now:()=>1700000000000,...options})};
}
for (const bytes of [2048, 2049]) {
  test(`full ASCII JSON topic payload boundary at ${bytes} bytes`, async () => {
    const f = fixture();
    // JSON-escaped ASCII newlines exercise the byte limit within 1000 characters.
    const data = {...payload,title:'a',body:'\n'.repeat(965) + (bytes === 2048 ? 'aa' : 'aaa')};
    const message = {topic:'documents',notification:{title:data.title,body:data.body},android:{notification:{channelId:'fcm_messages'}}};
    assert.equal(Buffer.byteLength(JSON.stringify(message), 'utf8'), bytes);
    if (bytes === 2048) {
      assert.equal((await f.s.send({auth,data})).status, 'accepted');
      assert.equal(f.calls.length, 1);
    } else {
      await assert.rejects(f.s.send({auth,data}), {code:'invalid-argument'});
      assert.equal(f.records.size, 0);
      assert.equal(f.calls.length, 0);
    }
  });
}
test('Korean text under 1000 characters exceeds the topic byte limit before storage or transport', async () => {
  const f = fixture();
  await assert.rejects(f.s.send({auth,data:{...payload,body:'가'.repeat(700)}}), {code:'invalid-argument'});
  assert.equal(f.records.size, 0);
  assert.equal(f.calls.length, 0);
});

test('send persists reservation before fixed-topic FCM and reports accepted, never delivered', async () => {
  const f = fixture();
  const original = f.store.reserve;
  let reserved = false;
  f.store.reserve = async r => {const result = await original(r); reserved = true; return result;};
  const result = await f.s.send({auth,data:payload});
  assert.equal(reserved,true);
  assert.deepEqual(result,{requestId:payload.requestId,status:'accepted',messageId:'projects/mydia-29ac2/messages/accepted'});
  assert.deepEqual(f.calls, [[{topic:'documents',notification:{title:'Hello',body:'Announcement'},android:{notification:{channelId:'fcm_messages'}}},false]]);
  assert.equal(f.records.get(payload.requestId).status,'accepted');
  assert.equal(f.records.get(payload.requestId).createdAt,1700000000000);
});

test('dry-run forwards true and reports validated; emulator blocks both modes before reservation', async () => {
  const f = fixture();
  assert.equal((await f.s.send({auth,data:{...payload,dryRun:true}})).status,'validated');
  assert.equal(f.calls[0][1],true);
  for (const dryRun of [true,false]) {
    const e = fixture({emulator:true});
    await assert.rejects(e.s.send({auth,data:{...payload,dryRun}}), {code:'failed-precondition'});
    assert.equal(e.records.size,0);
    assert.equal(e.calls.length,0);
  }
});

test('replay returns original pending/unknown/settled result without resending; conflicting contents rejected', async () => {
  for (const status of ['pending','unknown','accepted','failed','validated']) {
    const f = fixture();
    f.store.reserve = async record => ({fresh:false,record:{...record,status,messageId:'original'}});
    assert.deepEqual(await f.s.send({auth,data:payload}),{requestId:payload.requestId,status,messageId:'original',duplicate:true});
    assert.equal(f.calls.length,0);
  }
  for (const changes of [{body:'different'},{title:'different'},{dryRun:true}]) {
    const f = fixture();
    f.store.reserve = async record => ({fresh:false,record:{...record,...changes}});
    await assert.rejects(f.s.send({auth,data:payload}),{code:'already-exists'});
    assert.equal(f.calls.length,0);
  }
});

test('known FCM rejection settles failed; ambiguous errors settle unknown without leaking errors', async () => {
  for (const [code,status] of [['messaging/invalid-argument','failed'],['messaging/mismatched-credential','failed'],['messaging/payload-size-limit-exceeded','failed'],['messaging/server-unavailable','unknown'],[undefined,'unknown']]) {
    const f = fixture({sendMessage:async ()=>{throw Object.assign(new Error('SECRET credentials'),{code});}});
    assert.deepEqual(await f.s.send({auth,data:payload}),{requestId:payload.requestId,status});
    assert.equal(f.records.get(payload.requestId).status,status);
    assert.equal(JSON.stringify([...f.records.values()]).includes('SECRET'),false);
  }
  const f = fixture();
  f.store.settle = async ()=>{throw new Error('database unavailable');};
  assert.deepEqual(await f.s.send({auth,data:payload}),{requestId:payload.requestId,status:'unknown'});
  assert.equal(f.records.get(payload.requestId).status,'pending');
});

test('history authorizes and validates, returns bounded public audit fields with ISO dates', async () => {
  const f = fixture();
  f.store.list = async limit => {assert.equal(limit,20); return [{...payload,status:'accepted',createdAt:1700000000000,mode:'live',messageId:'id',privateField:'hidden'}];};
  assert.equal(typeof f.s.list,'function');
  await assert.rejects(f.s.list({data:{}}),{code:'unauthenticated'});
  await assert.rejects(f.s.list({auth,data:{limit:100}}),{code:'invalid-argument'});
  assert.deepEqual(await f.s.list({auth,data:{}}),{items:[{requestId:payload.requestId,title:payload.title,body:payload.body,status:'accepted',createdAt:'2023-11-14T22:13:20.000Z',mode:'live',messageId:'id'}]});
  for (const method of ['send','list','status']) {
    await assert.rejects(f.s[method]({auth:{...auth,token:{...auth.token,email:'intruder@example.com'}},data:method==='send'?payload:{}}),{code:'permission-denied'});
  }
});

test('Unicode code-point limits allow 80 emoji title and 1000 ASCII body', async () => {
  const f=fixture();
  const data={...payload,title:'😀'.repeat(80),body:'a'.repeat(1000)};
  assert.equal((await f.s.send({auth,data})).status,'accepted');
});
test('all endpoints deny each invalid authentication variant', async () => {
  for(const method of ['send','list','status']) {
    const requests=[undefined,{...auth,token:{...auth.token,email:'attacker@example.com'}},{...auth,token:{...auth.token,email_verified:false}},{...auth,token:{...auth.token,firebase:{sign_in_provider:'password'}}}];
    for(const a of requests) await assert.rejects(service()[method]({auth:a,data:method==='send'?payload:{}}),e=>['unauthenticated','permission-denied'].includes(e.code));
    await assert.rejects(service({getConfig:()=>({adminEmail:' '})})[method]({auth,data:method==='send'?payload:{}}),{code:'failed-precondition'});
  }
});
test('transport observes durable pending record, reservation failure prevents all transport calls', async () => {
  const f=fixture();
  const s=service({store:f.store,sendMessage:async ()=>{assert.equal(f.records.get(payload.requestId).status,'pending');return 'id';}});
  assert.equal((await s.send({auth,data:payload})).status,'accepted');
  const failed=fixture();failed.store.reserve=async ()=>{throw new Error('database offline');};
  await assert.rejects(failed.s.send({auth,data:payload}));assert.equal(failed.calls.length,0);
});
