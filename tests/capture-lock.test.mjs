import {test} from 'node:test';
import assert from 'node:assert/strict';
import {captureAnswer,captureRunning} from '../extension/screenshot.js';

test('capture lock is held before tab query resolves, rejecting simultaneous panels',async()=>{
 let release,queries=0,attempts=0;
 const tab={id:1,windowId:1,url:'https://www.doubao.com/chat/fixture'};
 globalThis.chrome={tabs:{query:()=>++queries===1?new Promise(resolve=>release=resolve):Promise.resolve([tab]),captureVisibleTab:async()=>{attempts++;throw new Error('activeTab permission required');}},scripting:{executeScript:async()=>[{result:null}]}};
 try{
  const first=captureAnswer({},()=>{throw new Error('must not save');});
  assert.equal(captureRunning(),true);
  await assert.rejects(captureAnswer({},()=>{}),/已有截图/);
  assert.equal(queries,1,'second panel never queries or modifies page');
  release([tab]);await assert.rejects(first,error=>error.code==='CAPTURE_PERMISSION_REQUIRED');
  assert.equal(attempts,1);assert.equal(captureRunning(),false);
 }finally{delete globalThis.chrome;}
});
test('invalid tab releases capture lock without attempting a screenshot',async()=>{
 globalThis.chrome={tabs:{query:async()=>[]}};
 try{
  await assert.rejects(captureAnswer({},()=>{}),/切换到/);assert.equal(captureRunning(),false);
  await assert.rejects(captureAnswer({},()=>{}),/切换到/);assert.equal(captureRunning(),false);
 }finally{delete globalThis.chrome;}
});
