import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../server/config.mjs';
import { createApp } from '../server/app.mjs';
const root=fileURLToPath(new URL('..',import.meta.url));
if(existsSync(resolve(root,'.env')))process.loadEnvFile(resolve(root,'.env'));
try {
 const config=loadConfig(root);
 if(process.argv.includes('--dist'))config.staticRoot=resolve(root,'dist');
 const {server}=createApp(config);
 server.on('error',error=>{console.error(error.code||'SERVER_ERROR');process.exitCode=1;});
 server.listen(config.port,config.host,()=>console.log(`SoulTrace Memory Shop v2: ${config.origin}\nMode: ${config.mode}. ${config.mode==='demo'?'Local synthetic records only; no real email. Use bori@example.test.':'Resend + configured SoulTrace bridge. No payment API.'}\nCtrl+C to stop.`));
 for(const signal of ['SIGTERM','SIGINT'])process.once(signal,()=>server.close(()=>process.exit(0)));
}catch(error){console.error(error.message);process.exitCode=1;}
