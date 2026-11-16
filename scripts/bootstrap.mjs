// Password is accepted only through stdin; output must remain outside Git and dist.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {hashPassword} from '../server/worker.mjs';
import {parseCSV,prepareContacts} from './contacts.mjs';
const [csvPath,outputPath]=process.argv.slice(2);
if(!csvPath||!outputPath)throw Error('Uso: node scripts/bootstrap.mjs arquivo.csv private/bootstrap.seed.sql (JSON com username/password em stdin)');
const output=resolve(outputPath);if(output.includes(resolve('dist'))||!output.endsWith('.seed.sql'))throw Error('Use um destino privado .seed.sql fora de dist.');
let input='';for await(const chunk of process.stdin)input+=chunk;
const {username,password}=JSON.parse(input);
if(!username||password?.length<8)throw Error('Informe login e senha com pelo menos oito caracteres.');
const {contacts,summary}=prepareContacts(parseCSV(await readFile(csvPath,'utf8')));
const quote=s=>"'"+String(s).replaceAll("'","''")+"'";
const schema=await readFile('migrations/0001_campanhas.sql','utf8');
const lines=[schema,`INSERT INTO users(id,username,name,password_hash,role) VALUES('admin-inicial',${quote(username.toLowerCase())},${quote(username)},${quote(await hashPassword(password))},'admin');`,"INSERT INTO campaigns(id,name,message,created_by) VALUES('primeiro-reencontro','Reencontro na Fazenda Curió','Olá, {nome}! Aqui é da Fazenda Curió. Que tal viver novos momentos em meio à natureza? Posso te contar sobre nossas próximas datas?','admin-inicial');"];
for(const c of contacts)lines.push(`INSERT INTO contacts(id,name,phone,city,state,active,source_key) VALUES(${[c.id,c.name,c.phone,c.city,c.state].map(quote).join(',')},${c.active?1:0},${quote(c.source_key)});`);
await mkdir(dirname(output),{recursive:true});await writeFile(output,lines.join('\n'),'utf8');
console.log(JSON.stringify(summary));
