import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createCaptureReader} from '../extension/capture-visible.js';

function clock(){let time=0;return {now:()=>time,delay:async ms=>{time+=ms;}};}
test('failed captures are spaced and do not exhaust Chrome quota on rapid retry',async()=>{
 const timing=clock(),attempts=[];
 const read=createCaptureReader(async()=>{attempts.push(timing.now());throw new Error('activeTab permission required');},timing);
 await Promise.all(Array.from({length:4},()=>assert.rejects(read(1),/permission/)));
 assert.deepEqual(attempts,[0,600,1200,1800]);
});
test('capture quota backs off and retries, while other failures are not retried',async()=>{
 const timing=clock(),attempts=[];let count=0;
 const read=createCaptureReader(async()=>{attempts.push(timing.now());if(count++<2)throw new Error('MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND quota');return 'png';},timing);
 assert.equal(await read(1),'png');assert.deepEqual(attempts,[0,1100,2200]);
 let denied=0;const permission=createCaptureReader(async()=>{denied++;throw new Error('permission required');},clock());
 await assert.rejects(permission(1),/permission/);assert.equal(denied,1);
});
test('repeated quota failures stop after a bounded number of attempts',async()=>{
 let count=0;const read=createCaptureReader(async()=>{count++;throw new Error('MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND quota');},clock());
 await assert.rejects(read(1),error=>{
  assert.deepEqual(error.captureAttempts.map(a=>a.at),[0,1100,2200]);
  return /quota/.test(error.message);
 });assert.equal(count,3);
});
test('tab verification runs after throttle and after capture, rejecting switched tabs',async()=>{
 const timing=clock();let captured=0,selected=true;
 const read=createCaptureReader(async()=>{captured++;return 'png';},timing);
 const verify=async()=>{if(!selected)throw new Error('switched tab');};
 await read(1,undefined,verify);
 selected=false;await assert.rejects(read(1,undefined,verify),/switched/);assert.equal(captured,1);
 selected=true;const during=createCaptureReader(async()=>{selected=false;return 'wrong tab';},clock());
 await assert.rejects(during(1,undefined,verify),/switched/);
});
