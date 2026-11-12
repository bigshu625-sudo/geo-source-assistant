import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
const root=path.resolve(import.meta.dirname,'..');
for(const name of fs.readdirSync(path.join(root,'extension')).filter(n=>n.endsWith('.js')))execFileSync(process.execPath,['--check',path.join(root,'extension',name)],{stdio:'inherit'});
const manifest=JSON.parse(fs.readFileSync(path.join(root,'extension/manifest.json')));
for(const [file,pattern]of [['background.js',/const BUILD='([^']+)'/],['panel.js',/const EXPECTED_BUILD='([^']+)'/],['panel-bootstrap.js',/const expectedBuild='([^']+)'/],['screenshot.js',/const captureBuild='([^']+)'/]]){
 const version=fs.readFileSync(path.join(root,'extension',file),'utf8').match(pattern)?.[1];
 if(version!==manifest.version)throw new Error(`${file} version ${version} does not match manifest ${manifest.version}`);
}
for(const file of [manifest.background.service_worker,manifest.side_panel.default_path,...manifest.content_scripts.flatMap(c=>c.js)])if(!fs.existsSync(path.join(root,'extension',file)))throw new Error('Missing '+file);
console.log('All extension scripts and manifest paths are valid.');
