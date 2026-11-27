import { mkdir,copyFile,writeFile } from 'node:fs/promises';
await mkdir('dist/campanhas',{recursive:true});
await mkdir('dist/painel',{recursive:true});
for(const path of ['reservar','reservarquarto','clientes','retorno','cadastro']) await mkdir('dist/'+path,{recursive:true});
await mkdir('dist/assets',{recursive:true});
await mkdir('dist/assets/quartos',{recursive:true});
for (const id of ['anexo-3','anexo-4','anexo-5','arvore','manga-rosa','sede-3','sede-4'])
  await copyFile('assets/quartos/'+id+'.jpg','dist/assets/quartos/'+id+'.jpg');
for(const file of ["curio-quartos-v1.mp4","curio-quartos-v1.jpg","curio-capela-v1.mp4","curio-capela-v1.jpg","curio-casa-arvore-v1.mp4","curio-casa-arvore-v1.jpg"]) await copyFile('assets/'+file,'dist/assets/'+file);
await copyFile('assets/campanhas-compartilhamento-v1.png','dist/assets/campanhas-compartilhamento-v1.png');
await copyFile('assets/campanhas-compartilhamento-v2.png','dist/assets/campanhas-compartilhamento-v2.png');
await copyFile('assets/cadastro-compartilhamento-v4-quadrado.jpg','dist/assets/cadastro-compartilhamento-v4-quadrado.jpg');
for(const f of ['index.html','logo.jpg','curio-aquarela.jpg']) await copyFile(f,`dist/${f}`);
for(const f of ['index.html','app.js','style.css','csv.js','nav.js','password.js','age.js']) await copyFile(`campanhas/${f}`,`dist/campanhas/${f}`);
for(const f of ['index.html','app.js'])await copyFile(`painel/${f}`,`dist/painel/${f}`);
for(const f of ['index.html','app.js','common.js','identity.js','style.css']) await copyFile('reserva/'+f,'dist/reservar/'+f);
for(const f of ['index.html','app.js']) await copyFile('reservas/'+f,'dist/reservarquarto/'+f);
await mkdir('dist/reservarquarto/mapa',{recursive:true});
await copyFile('reservas/mapa.html','dist/reservarquarto/mapa/index.html');
await copyFile('reservas/mapa.js','dist/reservarquarto/mapa/app.js');
await copyFile('reservas/mapa.css','dist/reservarquarto/mapa/style.css');
await mkdir('dist/reservarquarto/quartos',{recursive:true});
await copyFile('reservas/quartos.html','dist/reservarquarto/quartos/index.html');
await copyFile('reservas/quartos.js','dist/reservarquarto/quartos/app.js');
for(const f of ['index.html','app.js'])await copyFile('clientes/'+f,'dist/clientes/'+f);
for(const f of ['index.html','app.js','form.js','style.css','flores.svg'])await copyFile('cadastro/'+f,'dist/cadastro/'+f);
for(const f of ['index.html','app.js','style.css'])await copyFile('retorno/'+f,'dist/retorno/'+f);
for(const f of ['disponibilidade.js','disponibilidade.css','phone-mask.js','date-mask.js'])await copyFile('assets/'+f,'dist/assets/'+f);
await copyFile('metricas.js','dist/metricas.js');
const {readFile}=await import('node:fs/promises');
const csv=await readFile('campanhas/csv.js','utf8');
const worker=await readFile('server/worker.mjs','utf8');
const age=await readFile('campanhas/age.js','utf8');
const identity=await readFile('reserva/identity.js','utf8');
await writeFile('dist/_worker.js',[csv,age,identity,worker.replace(/^import .*;\r?\n/gm,'')].map(source=>source.replaceAll('export function','function')).join('\n'));
await writeFile('dist/_routes.json',JSON.stringify({version:1,include:['/api/*',...['retorno','campanhas','painel','usuarios','mensagens','reserva','reservas','reservar','gestaodereservaaa','reservarquarto','clientes'].flatMap(path=>['/'+path,'/'+path+'/*'])],exclude:[]}));
console.log('Build concluído em dist. Nenhum dado pessoal ou credencial incluído.');

// Home-screen identity shared by every public and protected HTML page.
const iconHead='<link rel="apple-touch-icon" sizes="180x180" href="/assets/site-icon-black-180.png"><link rel="icon" type="image/png" sizes="192x192" href="/assets/site-icon-black-192.png"><link rel="manifest" href="/site.webmanifest"><meta name="apple-mobile-web-app-title" content="Fazenda Curió"><meta name="application-name" content="Fazenda Curió">';
for(const size of [180,192,512])await copyFile('assets/site-icon-black-'+size+'.png','dist/assets/site-icon-black-'+size+'.png');
await copyFile('assets/site-icon-black-180.png','dist/apple-touch-icon.png');
await copyFile('assets/site-icon-black-180.png','dist/apple-touch-icon-precomposed.png');
await writeFile('dist/site.webmanifest',JSON.stringify({name:'Fazenda Curió',short_name:'Fazenda Curió',display:'standalone',background_color:'#fcfaf5',theme_color:'#254937',icons:[192,512].map(size=>({src:'/assets/site-icon-black-'+size+'.png',sizes:size+'x'+size,type:'image/png',purpose:'any'}))}));
const {readdir}=await import('node:fs/promises');
async function addHomeIcons(dir){for(const entry of await readdir(dir,{withFileTypes:true})){const file=dir+'/'+entry.name;if(entry.isDirectory())await addHomeIcons(file);else if(entry.name.endsWith('.html')){const html=await readFile(file,'utf8');await writeFile(file,html.replace('</head>',iconHead+'</head>'));}}}
await addHomeIcons('dist');
