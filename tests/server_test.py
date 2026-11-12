import importlib.util
import io
import json
import os
from pathlib import Path
import sys
import tempfile
import threading
import unittest
from unittest.mock import patch
from openpyxl import load_workbook

temporary=tempfile.TemporaryDirectory()
os.environ['AI_SOURCE_DATA']=temporary.name
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'server'))
spec=importlib.util.spec_from_file_location('source_app',Path(__file__).parents[1]/'server'/'app.py')
app=importlib.util.module_from_spec(spec);spec.loader.exec_module(app)

class ServerTests(unittest.TestCase):
 def task(self,kind='article'):
  return app.create_task({'keyword':'测试关键词','sources':[{'url':'https://example.com/article','title':'测试标题','type':kind}]})
 def png(self,color,width=20,height=20):
  import base64
  from PIL import Image
  buffer=io.BytesIO();Image.new('RGB',(width,height),color).save(buffer,format='PNG');return {'png':base64.b64encode(buffer.getvalue()).decode()}
 def test_custom_folder_exports_optional_copies_and_keeps_existing_files(self):
  task=self.task();task.update(origin='https://www.doubao.com/chat/export-test',answer='测试回答');app.save_task(task)
  task=app.save_screenshot({'taskId':task['id'],'origin':task['origin'],'answer':task['answer'],'frames':[self.png('blue')]})
  shot=task['screenshots'][0];original=app.screenshot_paths(task)[0]
  with tempfile.TemporaryDirectory(prefix='导出资料-') as target, patch.dict(app.SETTINGS):
   folder=str(Path(target).resolve())
   with self.assertRaisesRegex(ValueError,'资料库'):
    app.set_export_folder(str(app.DATA/'tasks'))
   app.set_export_folder(folder)
   self.assertEqual(list(Path(folder).iterdir()),[])
   with self.assertRaisesRegex(ValueError,'导出目录已更改'):
    app.save_task_exports(task['id'],{'kind':'md','folder':'stale'})
   md=app.save_task_exports(task['id'],{'kind':'md','folder':folder})
   output=Path(md['directory'])
   self.assertEqual(output.parent,Path(folder))
   self.assertEqual([p.suffix for p in output.iterdir()],['.md'])
   self.assertIn(shot['files'][0],(output/md['files'][0]).read_text(encoding='utf-8'))
   png=app.save_task_exports(task['id'],{'kind':'screenshots','folder':folder,'shotIds':[shot['id']]})
   self.assertEqual(png['directory'],md['directory'])
   self.assertEqual((output/png['files'][0]).read_bytes(),original.read_bytes())
   self.assertEqual(app.save_task_exports(task['id'],{'kind':'screenshots','folder':folder}),png)
   edited=output/md['files'][0];edited.write_text('用户已编辑',encoding='utf-8')
   second=app.save_task_exports(task['id'],{'kind':'md','folder':folder})
   self.assertNotEqual(second['files'],md['files'])
   self.assertEqual(edited.read_text(encoding='utf-8'),'用户已编辑')
   with patch.object(app.export_folder,'open_folder') as open_folder:
    app.open_saved_folder('export')
    open_folder.assert_called_once_with(Path(folder))
   self.assertTrue(original.is_file())
 def test_browsing_folders_leaves_settings_unchanged_and_does_not_list_files(self):
  with tempfile.TemporaryDirectory(prefix='浏览目录-') as temporary_folder, patch.dict(app.SETTINGS,{'exportFolder':'original'}):
   folder=Path(temporary_folder).resolve()
   child=folder/'中文目录';child.mkdir()
   (folder/'private.txt').write_text('content',encoding='utf-8')
   listed=app.export_folder.list_folders(str(folder))
   self.assertEqual(listed['path'],str(folder))
   self.assertEqual(listed['folders'],[{'name':child.name,'path':str(child)}])
   self.assertEqual(app.export_folder.list_folders(str(child))['parent'],str(folder))
   with self.assertRaisesRegex(ValueError,'请选择|请先选择'):
    app.set_export_folder('')
   with patch.object(app.tempfile,'TemporaryFile',side_effect=PermissionError):
    with self.assertRaisesRegex(ValueError,'权限'):
     app.set_export_folder(str(child))
   self.assertEqual(app.clean_settings()['exportFolder'],'original')
 def test_answer_screenshot_stitches_and_links_to_matching_task(self):
  from PIL import Image
  task=self.task();task.update(origin='https://www.doubao.com/chat/1',answer='真实回答\n正文');app.save_task(task)
  updated=app.save_screenshot({'taskId':task['id'],'origin':task['origin'],'answer':'真实回答 正文','frames':[self.png('blue'),self.png('green')]})
  self.assertEqual(updated['id'],task['id']);shot=updated['screenshots'][0]
  with Image.open(app.screenshot_paths(updated)[0]) as image:
   self.assertEqual(image.size,(20,40));self.assertEqual(image.getpixel((0,5)),(0,0,255));self.assertEqual(image.getpixel((0,25)),(0,128,0))
  book=load_workbook(io.BytesIO(app.spreadsheet(updated)));context=book['搜索回答']
  self.assertTrue(any(str(row[0].value).endswith('图片') and row[1].hyperlink for row in context));self.assertIn('![回答截图]',app.markdown_document(updated).decode())
  wrong=app.save_screenshot({'taskId':task['id'],'origin':task['origin'],'keyword':'另一轮回答','answer':'不同的回答','frames':[self.png('white')]})
  self.assertNotEqual(wrong['id'],task['id']);self.assertEqual(wrong['items'],[])
 def test_screenshot_rejects_invalid_frames_and_keeps_existing_tasks(self):
  task=self.task();before=len(app.list_tasks())
  with self.assertRaises(ValueError):app.save_screenshot({'origin':'https://www.doubao.com/chat/1','answer':'回答','frames':[{'png':'not an image'}]})
  with self.assertRaises(ValueError):app.save_screenshot({'origin':'https://www.doubao.com/chat/1','answer':'回答','frames':[self.png('blue'),self.png('green',width=30)]})
  self.assertEqual(len(app.list_tasks()),before);self.assertEqual(app.get_task(task['id'])['id'],task['id'])
 def test_question_answer_screenshot_retains_question_and_exports_scope(self):
  task=self.task();task.update(origin='https://www.doubao.com/chat/question',answer='完整回答');app.save_task(task)
  updated=app.save_screenshot({'taskId':task['id'],'origin':task['origin'],'answer':'完整回答','question':'上海家用电梯怎么选？','scope':'question-answer','frames':[self.png('blue')]})
  self.assertEqual(updated['id'],task['id']);shot=updated['screenshots'][-1]
  self.assertEqual(shot['scope'],'question-answer');self.assertEqual(shot['question'],'上海家用电梯怎么选？');self.assertIn('-问答截图',shot['files'][0])
  context=load_workbook(io.BytesIO(app.spreadsheet(updated)))['搜索回答']
  self.assertTrue(any('提问' in str(row[0].value) and row[1].value=='上海家用电梯怎么选？' for row in context))
  self.assertTrue(any(str(row[0].value).startswith('问答截图') and str(row[0].value).endswith('图片') and row[1].hyperlink for row in context))
  markdown=app.markdown_document(updated).decode();self.assertIn('截图范围：本轮提问与回答',markdown);self.assertIn('上海家用电梯怎么选？',markdown);self.assertIn('![问答截图]',markdown)
  with self.assertRaises(ValueError):app.save_screenshot({'origin':task['origin'],'answer':'完整回答','scope':'question-answer','frames':[self.png('blue')]})
 def test_very_long_screenshot_splits_without_missing_pixels(self):
  from PIL import Image
  task=app.save_screenshot({'origin':'https://chat.deepseek.com/a/chat/1','keyword':'长图','answer':'长回答','frames':[self.png('blue',height=5000),self.png('green',height=4000)]})
  self.assertEqual(task['screenshots'][0]['height'],9000);paths=app.screenshot_paths(task);self.assertEqual(len(paths),2)
  with Image.open(paths[0]) as first,Image.open(paths[1]) as last:
   self.assertEqual(first.height+last.height,9000);self.assertEqual(first.getpixel((1,4999)),(0,0,255));self.assertEqual(first.getpixel((1,5000)),(0,128,0));self.assertEqual(last.getpixel((1,0)),(0,128,0))
  task_id=task['id'];app.manage_records('trash',{'ids':[task_id]});app.manage_records('restore',{'ids':[task_id]});self.assertTrue(paths[0].is_file())
 def test_cleanup_restores_files_and_purge_frees_only_selected_record(self):
  task=self.task();other=self.task();folder=app.task_dir(task['id']);(folder/'正文.txt').write_text('保留全文',encoding='utf-8')
  info=app.library_info();self.assertGreater(next(t for t in info['tasks'] if t['id']==task['id'])['bytes'],0)
  app.manage_records('trash',{'ids':[task['id']]})
  self.assertNotIn(task['id'],[t['id'] for t in app.list_tasks()])
  self.assertEqual((app.record_dir('trash',task['id'])/'正文.txt').read_text(encoding='utf-8'),'保留全文')
  app.manage_records('restore',{'ids':[task['id']]})
  self.assertEqual((folder/'正文.txt').read_text(encoding='utf-8'),'保留全文');self.assertNotIn('deletedAt',app.get_task(task['id']))
  app.manage_records('trash',{'ids':[task['id']]});result=app.manage_records('purge',{'ids':[task['id']]})
  self.assertGreater(result['bytes'],0);self.assertFalse(app.record_dir('trash',task['id']).exists());self.assertEqual(app.get_task(other['id'])['id'],other['id'])
 def test_cleanup_rejects_running_and_invalid_batch_without_partial_change(self):
  idle=self.task();running=self.task();app.update_item(running['id'],running['items'][0]['id'],status='processing')
  with self.assertRaisesRegex(ValueError,'仍在处理'):app.manage_records('trash',{'ids':[idle['id'],running['id']]})
  self.assertEqual(app.get_task(idle['id'])['id'],idle['id'])
  with self.assertRaises(ValueError):app.manage_records('purge',{'ids':['../settings.json']})
  self.assertTrue(app.TOKEN_PATH.exists());app.update_item(running['id'],running['items'][0]['id'],status='pending')
 def test_task_summaries_reuse_cache_and_rename_updates_export(self):
  task=self.task();app.list_tasks()
  with patch.object(app,'load_json',side_effect=AssertionError('unchanged JSON should not be re-read')):app.list_tasks()
  updated=app.rename_task(task['id'],{'keyword':'上海家用电梯推荐'});self.assertEqual(updated['keyword'],'上海家用电梯推荐')
  self.assertTrue(app.export_filename(updated).startswith('上海家用电梯推荐-'))
  self.assertEqual(next(t for t in app.list_tasks() if t['id']==task['id'])['keyword'],'上海家用电梯推荐')
 def test_http_exports_supply_chinese_filenames_and_authenticated_cleanup(self):
  from urllib.parse import unquote
  server=app.ThreadingHTTPServer(('127.0.0.1',0),app.Handler);threading.Thread(target=server.serve_forever,daemon=True).start()
  url=f'http://127.0.0.1:{server.server_port}';headers={'Authorization':'Bearer '+app.TOKEN}
  try:
   task=self.task();task['origin']='https://www.doubao.com/chat/1';task['createdAt']=1791936000;app.save_task(task)
   for format in ('xlsx','md'):
    response=app.requests.get(f'{url}/tasks/{task["id"]}/{format}',headers=headers)
    self.assertEqual(response.status_code,200);self.assertIn(f'测试关键词-20261014-Doubao.{format}',unquote(response.headers['Content-Disposition']))
   response=app.requests.post(url+'/library/trash',json={'ids':[task['id']]});self.assertEqual(response.status_code,401)
   response=app.requests.post(url+'/library/trash',headers=headers,json={'ids':[task['id']]});self.assertEqual(response.status_code,200)
   self.assertIn(task['id'],[t['id'] for t in app.requests.get(url+'/library',headers=headers).json()['trash']])
   app.manage_records('restore',{'ids':[task['id']]})
  finally:server.shutdown();server.server_close()
 def test_markdown_preserves_long_text_and_semantic_queries(self):
  task=self.task();task['origin']='https://yuanbao.tencent.com/chat/test';task['answer']='原回答';task['semanticQueries']=['语义词一','语义词二']
  task['items'][0]['text']='长正文'*12000
  value=app.markdown_document(task).decode('utf-8')
  self.assertIn(task['items'][0]['text'],value);self.assertIn('语义词一',value);self.assertIn('搜索平台：元宝',value)
  self.assertIn('### 视频口播转写\n\n未取得或未启用',value)
 def test_new_platform_export_names(self):
  for host,label in [('yuanbao.tencent.com','元宝'),('wenxin.baidu.com','文心一言'),('www.kimi.com','Kimi'),('www.qianwen.com','千问')]:
   self.assertEqual(app.task_platform({'origin':'https://'+host+'/chat'}),label)
 def test_rejects_private_media(self):
  for url in ('http://127.0.0.1/x','http://169.254.169.254/latest','http://[::1]/a','file:///C:/secret'):
   with self.assertRaises(ValueError):app.public_url(url)
 def test_ids_and_paths_are_constrained(self):
  with self.assertRaises(ValueError):app.task_dir('../secrets')
  self.assertEqual(app.safe_name('CON'),'_CON')
 def test_api_secrets_are_redacted_and_blank_preserves_key(self):
  app.set_settings({'analysis':{'apiKey':'test-secret'}})
  result=app.set_settings({'analysis':{'apiKey':''}})
  self.assertTrue(result['analysis']['hasApiKey']);self.assertEqual(result['analysis']['apiKey'],'')
  app.set_settings({'analysis':{'clearApiKey':True}})
  self.assertFalse(app.clean_settings()['analysis']['hasApiKey'])
 def test_article_processing_saves_original_without_fake_analysis(self):
  task=self.task();item=task['items'][0]
  app.process_item(task['id'],item['id'],{'title':'原始标题','text':'这是完整正文。'*20},{'downloadVideo':False,'transcribe':False,'analyze':False})
  updated=app.get_task(task['id'])['items'][0]
  self.assertEqual(updated['status'],'complete');self.assertIsNone(updated['analysis']);self.assertIn('正文.txt',updated['files'])
 def test_source_extraction_ignores_legacy_ai_settings_and_saves_media_only_on_request(self):
  legacy={**app.DEFAULTS,'downloadVideo':True,'autoProcess':True,'analyze':True,'transcribe':True}
  task=app.create_task({'sources':[{'url':'https://www.douyin.com/video/456','type':'video'}]})
  item_id=task['items'][0]['id']
  page={'description':'原视频发布文案','media':[{'url':'https://cdn.example/video.mp4','kind':'video'}]}
  def save_media(url,path,referer):
   path.write_bytes(b'media fixture')
  with patch.object(app,'SETTINGS',legacy), patch.object(app.POOL,'submit',side_effect=lambda fn,*args:fn(*args)), patch.object(app,'download_media',side_effect=save_media) as download, patch.object(app,'ffmpeg'), patch.object(app,'transcribe_file') as transcribe, patch.object(app,'analyze_content') as analyze:
   self.assertFalse(any(app.clean_settings()[k] for k in ('downloadVideo','autoProcess','analyze','transcribe')))
   for extra in ({},{'downloadVideo':'true'}):
    app.begin_processing(task['id'],item_id,{'page':page,'analyze':True,'transcribe':True,**extra})
    updated=app.get_task(task['id'])['items'][0]
    self.assertEqual(updated['status'],'complete')
    self.assertEqual(updated['files'],['发布文案.txt'])
    download.assert_not_called()
   app.begin_processing(task['id'],item_id,{'page':page,'downloadVideo':True})
   self.assertIn('视频.mp4',app.get_task(task['id'])['items'][0]['files'])
   download.assert_called_once()
   transcribe.assert_not_called()
   analyze.assert_not_called()
 def test_unconfigured_analysis_retains_text_and_reports_partial(self):
  task=self.task();item=task['items'][0]
  app.process_item(task['id'],item['id'],{'text':'正文内容。'*20},{'downloadVideo':False,'transcribe':False,'analyze':True,'analysis':{'baseUrl':'','model':''}})
  updated=app.get_task(task['id'])['items'][0]
  self.assertEqual(updated['status'],'partial');self.assertIn('内容分析服务尚未配置',updated['warnings'])
 def test_failed_download_does_not_claim_success(self):
  task=app.create_task({'sources':[{'url':'https://www.douyin.com/video/123','type':'video'}]});item=task['items'][0]
  app.process_item(task['id'],item['id'],{}, {'downloadVideo':True,'transcribe':False,'analyze':False})
  updated=app.get_task(task['id'])['items'][0]
  self.assertEqual(updated['status'],'failed');self.assertNotIn('视频.mp4',updated['files'])
 def test_audio_url_is_not_saved_as_a_video(self):
  task=app.create_task({'sources':[{'url':'https://www.douyin.com/video/456','type':'video'}]});item=task['items'][0]
  with patch.object(app,'download_media') as download:
   app.process_item(task['id'],item['id'],{'media':[{'url':'https://cdn.example/music.mp3','kind':'video'}]}, {'downloadVideo':True,'transcribe':False,'analyze':False})
  download.assert_not_called();self.assertNotIn('视频.mp4',app.get_task(task['id'])['items'][0]['files'])
 def test_restart_preserves_files_and_marks_interrupted(self):
  task=self.task();item=task['items'][0]
  app.update_item(task['id'],item['id'],status='processing',files=['正文.txt'])
  app.recover();self.assertEqual(app.get_task(task['id'])['items'][0]['status'],'partial')
 def test_excel_stores_untrusted_text_as_literal(self):
  task=self.task();task['items'][0]['title']='=HYPERLINK("https://evil.example")';task['items'][0]['text']='hello\x01world'
  workbook=load_workbook(io.BytesIO(app.spreadsheet(task)))
  self.assertEqual(workbook.active['B2'].data_type,'s');self.assertEqual(workbook.active['H2'].value,'helloworld')
 def test_export_omits_service_keys(self):
  import zipfile
  task=self.task();archive=zipfile.ZipFile(io.BytesIO(app.material_zip(task)))
  exported=archive.read('任务.json').decode()
  self.assertNotIn('apiKey',exported);self.assertIn('信源汇总.xlsx',archive.namelist())
 def test_mock_analysis_structured_response(self):
  class Reply:
   ok=True
   def json(self):return {'choices':[{'message':{'content':'{"summary":"仅用于接口测试","keyPoints":["观点"],"titleAnalysis":"匹配"}'}}], 'usage':{'prompt_tokens':10}}
  with patch.object(app.requests,'post',return_value=Reply()) as request:
   result,usage=app.analyze_content({'title':'标题','text':'真实原文。'*20,'type':'article'},'关键词',{'baseUrl':'https://api.example/v1','model':'test','apiKey':'test-key'})
  self.assertEqual(result['basis'],'网页正文');self.assertEqual(usage['prompt_tokens'],10)
  self.assertEqual(request.call_args.kwargs['headers']['Authorization'],'Bearer test-key')
 def test_http_auth_origin_upload_and_transcription(self):
  server=app.ThreadingHTTPServer(('127.0.0.1',0),app.Handler)
  threading.Thread(target=server.serve_forever,daemon=True).start()
  address=f'http://127.0.0.1:{server.server_port}'
  try:
   self.assertEqual(app.requests.get(address+'/tasks').status_code,401)
   headers={'Authorization':'Bearer '+app.TOKEN}
   self.assertEqual(app.requests.get(address+'/tasks',headers={**headers,'Origin':'https://evil.example'}).status_code,403)
   task=app.create_task({'sources':[{'url':'https://www.douyin.com/video/123','type':'video'}]});item=task['items'][0]
   video=Path(temporary.name)/'fixture.mp4'
   app.ffmpeg(['-f','lavfi','-i','color=c=blue:s=160x120:r=10:d=1','-f','lavfi','-i','sine=frequency=440:duration=1','-c:v','libx264','-c:a','aac','-shortest',str(video)])
   response=app.requests.post(f'{address}/tasks/{task["id"]}/items/{item["id"]}/upload',headers=headers,data=video.read_bytes())
   self.assertEqual(response.status_code,200)
   class Reply:
    ok=True
    def json(self):return {'text':'这是模拟转写接口返回的测试文字，仅验证上传协议。'}
   with patch.object(app.requests,'post',return_value=Reply()) as request:
    app.process_item(task['id'],item['id'],{}, {'downloadVideo':False,'transcribe':True,'analyze':False,'transcription':{'mode':'api','baseUrl':'https://api.example/v1','model':'test','apiKey':'test'}})
   updated=app.get_task(task['id'])['items'][0]
   self.assertEqual(updated['status'],'complete');self.assertIn('口播转写.txt',updated['files']);self.assertIn('模拟转写',updated['transcript'])
   self.assertEqual(request.call_args.args[0],'https://api.example/v1/audio/transcriptions')
  finally:server.shutdown();server.server_close()
 def test_backend_corrects_stale_plugin_share_classification(self):
  task=app.create_task({'sources':[{'url':'https://www.iesdouyin.com/share/video/123','type':'article'},{'url':'https://www.douyin.com/video/123','type':'video'}]})
  self.assertEqual(len(task['items']),1);self.assertEqual(task['items'][0]['type'],'video')
  self.assertEqual(task['items'][0]['originalUrl'],'https://www.iesdouyin.com/share/video/123')
 def test_export_filename_and_complete_fields(self):
  task=self.task();task['origin']='https://www.doubao.com/chat/1';task['createdAt']=1791936000
  self.assertEqual(app.export_filename(task),'测试关键词-20261014-Doubao.xlsx')
  item=task['items'][0];item.update(publishedAt='2026-10-01',analysis={'summary':'摘要','limitations':'限制','customField':'也需保留'},analysisUsage={'prompt_tokens':3},page={'images':['https://example.com/image.jpg'],'media':[{'url':'https://example.com/a.mp4','kind':'video'}]})
  book=load_workbook(io.BytesIO(app.spreadsheet(task)))
  sheet=book['信源分析'];columns={c.value:c.column for c in sheet[1]}
  self.assertIn('https://example.com/a.mp4',sheet.cell(2,columns['视频地址']).value)
  self.assertIn('customField',sheet.cell(2,columns['分析原始结果']).value)
  self.assertIn('images',sheet.cell(2,columns['网页解析记录']).value)
  self.assertEqual(book['搜索回答']['B5'].value,task['origin'])
 def test_long_text_is_preserved_in_same_row(self):
  task=self.task();original='长文😀'*17000;task['items'][0]['text']=original
  book=load_workbook(io.BytesIO(app.spreadsheet(task)));sheet=book['信源分析']
  columns=[c.column for c in sheet[1] if c.value=='正文' or c.value.startswith('正文（续')]
  self.assertEqual(''.join(sheet.cell(2,c).value or '' for c in columns),original)
  self.assertGreater(len(columns),1);self.assertEqual(sheet.max_row,2)
  for c in columns:self.assertLessEqual(len(sheet.cell(2,c).value.encode('utf-16-le'))//2,32000)
 def test_semantic_queries_are_preserved_without_source_assignment(self):
  task=self.task();task['origin']='https://www.doubao.com/chat/1';task['semanticQueries']=['搜索词一','搜索词二']
  payload=app.spreadsheet_payload(task);column=payload['headers'].index('本次语义分析搜索词')
  self.assertEqual(payload['rows'][0][column],'搜索词一\n搜索词二')
  self.assertIn(['豆包语义分析','搜索词一\n搜索词二'],payload['contextRows'])
  self.assertNotIn('semanticQuery',task['items'][0])

if __name__=='__main__':
 unittest.main()
