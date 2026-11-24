import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { saveSecret, readSecret, settingsStatus } from '../lib/service-settings';
test('개별 키는 응답에 노출되지 않고 동시 저장과 환경 폴백을 지원한다',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'scene-settings-'));
 try {await Promise.all([saveSecret('OPENAI_API_KEY','fake-secret-a',root),saveSecret('GEMINI_API_KEY','fake-secret-b',root)]);
 assert.equal(await readSecret('OPENAI_API_KEY',root),'fake-secret-a');
 const status=await settingsStatus(root); assert.ok(status.keys.OPENAI_API_KEY.configured);
 assert.doesNotMatch(JSON.stringify(status),/fake-secret/);
 await saveSecret('OPENAI_API_KEY',null,root); assert.equal(await readSecret('OPENAI_API_KEY',root),process.env.OPENAI_API_KEY?.trim()||'');
 }finally{await rm(root,{recursive:true,force:true});}
});
