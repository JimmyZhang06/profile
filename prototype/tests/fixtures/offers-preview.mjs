// Disposable, memory-only UI verification. Does not open the user's database or send mail.
import {createServer} from 'vite';
import {createCloudApp} from '../../server/cloud/app.mjs';
import {query} from '../../server/cloud/database.mjs';
import {opportunityData} from '../../server/cloud/opportunities.mjs';
const port=4199,apiPort=4200;
const app=await createCloudApp({memory:true,origin:`http://127.0.0.1:${port}`,authSecret:'offers-ui-fixture-only-test-secret-at-least-32',credentialKey:Buffer.alloc(32,8).toString('base64'),adminEmail:'fixture@example.test'});
const data=opportunityData({title:'虚构产品实习 · Offer 验收',company:'虚构测试公司',regionCode:'HK',city:'香港',jd:'仅用于本地界面验收的虚构职位，不是真实招聘。',sourceType:'official',daysPerWeek:4,durationMonths:6,compensation:{currency:'HKD',unit:'day',min:500,max:700}});
await query(app.db,"INSERT INTO opportunities(id,status,verified_at) VALUES('offer-ui-fixture','open',NOW())");
await query(app.db,"INSERT INTO opportunity_submissions(id,opportunity_id,status,data) VALUES('offer-ui-submission','offer-ui-fixture','published',$1::jsonb)",[JSON.stringify(data)]);
await query(app.db,"INSERT INTO opportunity_releases(opportunity_id,version,submission_id,data) VALUES('offer-ui-fixture',1,'offer-ui-submission',$1::jsonb)",[JSON.stringify(data)]);
await query(app.db,"UPDATE opportunities SET published_version=1 WHERE id='offer-ui-fixture'");
await new Promise(resolve=>app.server.listen(apiPort,'127.0.0.1',resolve));
process.env.LULI_API_ORIGIN=`http://127.0.0.1:${apiPort}`;
const vite=await createServer({server:{host:'127.0.0.1',port,strictPort:true}});
await vite.listen();
console.log(`Offer memory-only fixture: http://127.0.0.1:${port}/offers`);
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{await vite.close();await app.close();process.exit(0);});
