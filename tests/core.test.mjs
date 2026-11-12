import test from 'node:test';
import assert from 'node:assert/strict';
import {canonicalUrl,classifyUrl,dedupeSources,safeName,exportFilename} from '../extension/core.js';
test('dedupe removes tracking but keeps meaningful article parameters',()=>{
 const sources=dedupeSources([{url:'https://news.example/a?id=591&utm_source=doubao#x',title:'1'},{url:'https://news.example/a?utm_campaign=test&id=591',title:'文章标题'},{url:'https://news.example/a?id=592'}]);
 assert.equal(sources.length,2);assert.equal(sources[0].url,'https://news.example/a?id=591');assert.equal(sources[0].title,'文章标题');
});
test('Douyin canonicalization keeps video and gallery distinct',()=>{assert.equal(canonicalUrl('https://www.douyin.com/video/123?share_app_id=1'),'https://www.douyin.com/video/123');assert.equal(classifyUrl('https://www.douyin.com/note/123'),'gallery');assert.equal(classifyUrl('https://v.douyin.com/abc/'),'video');assert.equal(classifyUrl('https://notdouyin.com/a'),'article');});
test('rejects unsafe schemes and credentials even inside redirects',()=>{for(const url of ['javascript:alert(1)','file:///C:/a','https://user:secret@example.org/a','https://example.org/redirect?url=https://user:secret@target.org'])assert.equal(canonicalUrl(url),null);});
test('unsupported video platforms are not mislabeled as articles',()=>{assert.equal(classifyUrl('https://www.bilibili.com/video/BV1'),'unsupported-video');assert.equal(classifyUrl('https://example.org/a'),'article');});
test('download names cannot escape the folder',()=>{assert.equal(safeName('../a\\b.mp4'),'.._a_b.mp4');assert.equal(safeName('   '),'信源');});
test('Windows reserved names and emoji are safe without cutting export suffixes',()=>{assert.equal(safeName('CON'),'_CON');const filename=exportFilename({keyword:'😀'.repeat(80),origin:'https://wenxin.baidu.com/',createdAt:1791936000});assert.equal([...filename.split('-')[0]].length,44);assert.ok(filename.endsWith('-20261014-文心一言.xlsx'));});
test('Doubao iesdouyin share links become video URLs while retaining the original',()=>{
 const sources=dedupeSources([{url:'https://www.iesdouyin.com/share/video/7245190498338622735',title:'视频'},{url:'https://www.douyin.com/video/7245190498338622735?utm_source=share'}]);
 assert.equal(sources.length,1);assert.equal(sources[0].type,'video');assert.equal(sources[0].url,'https://www.douyin.com/video/7245190498338622735');assert.match(sources[0].originalUrl,/iesdouyin/);
});
test('formal reference card titles take precedence over repeated inline labels',()=>{
 const sources=dedupeSources([{url:'https://example.org/a',title:'1',titlePriority:1},{url:'https://example.org/a?utm_source=copy',title:'重复引用',titlePriority:1},{url:'https://example.org/a',title:'正式文章标题',titlePriority:3}]);
 assert.equal(sources.length,1);assert.equal(sources[0].title,'正式文章标题');
});
test('export names contain Chinese keyword, China date and platform',()=>{
 const task={keyword:'家用电梯',origin:'https://www.doubao.com/chat/1',createdAt:Date.parse('2026-10-13T20:00:00Z')/1000};
 assert.equal(exportFilename(task),'家用电梯-20261014-Doubao.xlsx');
 assert.equal(exportFilename({...task,origin:'https://chat.deepseek.com/a/chat/1'}),'家用电梯-20261014-DeepSeek.xlsx');
 assert.ok(exportFilename({...task,keyword:'很长的关键词'.repeat(30)}).endsWith('-Doubao.xlsx'));
});
