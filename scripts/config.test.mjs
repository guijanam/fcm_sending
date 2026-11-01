import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';

test('build configuration utility exists and emits only safe public Firebase fields', async () => {
  assert.ok(existsSync(new URL('./prepare-config.mjs', import.meta.url)), 'missing safe Firebase build config utility');
  const { publicConfig } = await import('./prepare-config.mjs');
  assert.deepEqual(publicConfig({ apiKey:'public-key', authDomain:'mydia-29ac2.firebaseapp.com', projectId:'mydia-29ac2', appId:'1:188406916055:web:abc', messagingSenderId:'188406916055' }), {
    apiKey:'public-key', authDomain:'mydia-29ac2.firebaseapp.com', projectId:'mydia-29ac2', appId:'1:188406916055:web:abc', messagingSenderId:'188406916055', functionsRegion:'asia-northeast3'
  });
});

test('configuration refuses service account keys, another project, and incomplete web app configuration', async () => {
  const { publicConfig } = await import('./prepare-config.mjs');
  const valid = { apiKey:'public-key', authDomain:'mydia-29ac2.firebaseapp.com', projectId:'mydia-29ac2', appId:'1:188406916055:web:abc', messagingSenderId:'188406916055' };
  for (const invalid of [null, [], { ...valid, private_key:'NEVER_BUNDLE' }, { ...valid, type:'service_account' }, { ...valid, projectId:'another-project' }, { ...valid, authDomain:'evil.example' }, { ...valid, appId:'1:188406916055:android:abc' }, { ...valid, apiKey:'' }, { ...valid, messagingSenderId:'wrong' }]) {
    assert.throws(() => publicConfig(invalid));
  }
});
