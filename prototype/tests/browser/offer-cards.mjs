// Browser regression for a real scroll gesture and its effect on an edited offer.
// Run after npm run build. Uses Playwright and Chromium; an existing installation
// can be selected with LULI_PLAYWRIGHT_MODULE and LULI_CHROMIUM_CHANNEL.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { createCloudApp } from '../../server/cloud/app.mjs';

const require=createRequire(import.meta.url);
const {chromium}=require(process.env.LULI_PLAYWRIGHT_MODULE || 'playwright');
const config={memory:true,origin:'http://127.0.0.1',authSecret:'offer-deck-private-local-test-secret-value',credentialKey:Buffer.alloc(32,8).toString('base64')};
const app=await createCloudApp(config);
let browser;
try {
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+app.server.address().port;
  Object.assign(config,{production:true,staticRoot:resolve(process.env.LULI_TEST_CLIENT || 'dist/client'),origins:[base]});
  browser=await chromium.launch({headless:true,channel:process.env.LULI_CHROMIUM_CHANNEL || undefined});
  const ctx=await browser.newContext({viewport:{width:375,height:812},isMobile:true,hasTouch:true,locale:'zh-CN',colorScheme:'dark'});
  const page=await ctx.newPage(), errors=[];
  page.on('pageerror',e=>errors.push(e.message)); page.setDefaultTimeout(7000);
  await ctx.route('**/*',route=>route.request().url().startsWith(base+'/')?route.continue():route.abort());
  await page.goto(base+'/offers');
  const card=name=>page.getByRole('heading',{name,exact:true,level:3}).waitFor();
  const button=name=>page.getByRole('button',{name,exact:true});
  const field=name=>page.getByLabel(name,{exact:true});
  const gross=txt=>page.getByRole('region',{name:'收入测算结果'}).getByText(txt,{exact:true}).waitFor();
  const deck=page.locator('.offer-deck-viewport');
  await card('薪资报价');
  await page.getByText('香港 · HKD',{exact:true}).click();
  await page.getByText('实习',{exact:true}).click();
  await field('已确认税前报价（HKD）').fill('9000');
  await gross('HK$9,000.00');

  // Pause mid-gesture past the idle fallback: focus and card height must not
  // flip while the touch is down. This sends a platform touch, not scrollLeft.
  const touch=await ctx.newCDPSession(page);
  async function gesture(horizontal) {
    const head=page.locator('.offer-deck-card:not([inert]) .offer-card-head');
    await head.scrollIntoViewIfNeeded();
    const box=await head.boundingBox(), fromX=box.x+box.width*.83, toX=box.x+box.width*.12;
    const y=box.y+box.height*.65;
    const emit=(type,points)=>touch.send('Input.dispatchTouchEvent',{type,touchPoints:points});
    await emit('touchStart',[{x:fromX,y}]);
    for(let i=1;i<=9;i++){
      await emit('touchMove',[{x:horizontal?fromX+(toX-fromX)*i/9:fromX,y:horizontal?y:y-95*i/9}]);
      await new Promise(r=>setTimeout(r,22));
    }
    await new Promise(r=>setTimeout(r,220));
    if(horizontal)await card('薪资报价');
    await emit('touchEnd',[]);
  }
  await gesture(true);await card('合同与发薪');
  await button('入职日期').click();
  await button('手动输入').click();
  const dateEntry = page.getByRole('textbox', {name: '输入日期'});
  await dateEntry.fill('20260229');
  await dateEntry.press('Enter');
  await page.getByRole('alert').filter({hasText:'请输入有效的日期'}).waitFor();
  await dateEntry.fill('20260701');
  await dateEntry.press('Enter');
  assert.ok(await button('入职日期').evaluate(element => element === document.activeElement));
  // The empty end date opens in July, alongside the unchanged start trigger.
  await button('合同结束日期').click();
  await button('2026年7月1日').waitFor();
  await button('选择年月').click();
  await button('2026年9月').click();
  await button('2026年9月1日').press('PageDown');
  assert.ok(await button('2026年10月1日').evaluate(element => element === document.activeElement));
  await page.keyboard.press('Escape');
  assert.match(await button('合同结束日期').innerText(), /选择日期/);
  await button('合同结束日期').click();
  await button('选择年月').click();
  await button('2026年9月').click();
  await button('2026年9月30日').click();
  await gross('HK$27,000.00');
  await page.getByText(/待确认与计算假设 ·/).click();
  await button('去填写').first().click();await card('强积金与扣款');
  await page.waitForFunction(()=>document.activeElement?.closest('[data-card]')?.dataset.card==='contributions')
    .catch(async()=>{throw new Error('Missing-term focus did not reach contributions: '+await page.evaluate(()=>document.activeElement?.outerHTML.slice(0,280)));});
  await button('跳到逐月调整').click();await card('逐月调整');
  await button('选择计薪月份').click();
  assert.ok(await button('2026年6月').isDisabled());
  assert.ok(await button('2026年10月').isDisabled());
  await button('2026年8月').click();
  await field('2026-08 工资税前金额覆盖（不含补贴）').fill('9500');await gross('HK$27,500.00');
  const checkWidth=async()=>assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1 && document.querySelector('.page-scroll').scrollWidth<=innerWidth+1));
  await checkWidth();
  await page.getByRole('tab',{name:'方案 B'}).click();await card('薪资报价');
  assert.equal(await field('已确认税前报价（CNY）').inputValue(),'');
  await field('已确认税前报价（CNY）').fill('6000');
  await page.getByRole('tab',{name:'比较方案'}).click();
  await page.getByRole('heading',{name:'比较两份方案'}).waitFor();
  await page.getByText('使用共同到账窗口', {exact:true}).click();
  await button('共同结束日期').click();
  await button('清除').click();
  assert.match(await button('共同结束日期').innerText(), /选择日期/);
  await page.getByRole('tab',{name:'方案 A'}).click();await card('逐月调整');
  assert.equal(await field('2026-08 工资税前金额覆盖（不含补贴）').inputValue(),'9500');
  await gross('HK$27,500.00');
  await page.setViewportSize({width:320,height:680});await checkWidth();
  const scroll=page.locator('.page-scroll');
  await page.locator('.offer-deck-card:not([inert]) .offer-card-head').scrollIntoViewIfNeeded();
  const before=await scroll.evaluate(e=>e.scrollTop);
  await gesture(false);
  assert.ok(await scroll.evaluate((e,pos)=>e.scrollTop>pos+10,before),'a vertical pan on the card must scroll the page');
  await card('逐月调整');

  await page.setViewportSize({width:1280,height:800});
  await page.emulateMedia({reducedMotion:'reduce',colorScheme:'light'});
  await deck.focus();await page.keyboard.press('Home');await card('薪资报价');
  assert.equal(await field('已确认税前报价（HKD）').inputValue(),'9000');
  const handle=page.locator('.offer-deck-card:not([inert]) .offer-card-head');await handle.scrollIntoViewIfNeeded();
  const bounds=await handle.boundingBox(),x=bounds.x+bounds.width*.8,y=bounds.y+bounds.height/2;
  await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x-120,y,{steps:10});await page.mouse.up();
  await card('合同与发薪');
  await button('下一张录入卡片').click();await card('奖金与补贴');
  await button('添加额外薪酬').click();await field('条款名称').fill('虚构项目奖金');
  await button('下一张录入卡片').click();await card('强积金与扣款');
  await button('上一张录入卡片').click();await card('奖金与补贴');
  assert.equal(await field('条款名称').inputValue(),'虚构项目奖金');
  await page.getByRole('link',{name:'城市生活预算'}).click();
  const living = page.getByRole('region',{name:'月度收支'});
  const balance = expected => living.getByText(expected,{exact:true}).first().waitFor();
  const city = async name => {
    await page.getByRole('combobox',{name:'生活城市'}).click();
    await page.getByRole('option',{name,exact:true}).click();
  };
  await living.getByRole('heading',{name:/^扣缴前/}).waitFor();
  await city('深圳');
  await field('每月到手（CNY）').fill('8000');
  await page.getByText('调整开销与储蓄目标',{exact:true}).click();
  await field('我的月租').fill('1800');
  await field('每月日常开销').fill('2500');
  await field('其他固定支出').fill('500');
  await field('每月想存').fill('3000');
  await balance('¥3,200');
  await balance('能达到储蓄目标');
  assert.match(await living.innerText(),/月租可控制在 ¥2,000/);
  await living.getByRole('button',{name:'换成独居'}).click();
  await field('我的月租').fill('3500');
  await balance('¥1,500');
  await balance('离储蓄目标还差 ¥1,500');
  await page.getByRole('tab',{name:'方案 B'}).click();
  await living.getByRole('heading',{name:/^扣缴前/}).waitFor();
  await page.getByRole('tab',{name:'方案 A'}).click();
  await balance('¥1,500');
  await city('香港 · 港岛');
  await page.getByText('到手月薪',{exact:true}).click();
  assert.equal(await field('每月到手（HKD）').inputValue(),'');
  const cityInput = page.getByRole('combobox',{name:'生活城市'});
  await cityInput.click();await cityInput.fill('重庆');await cityInput.press('Enter');
  assert.equal(await cityInput.inputValue(),'重庆（主城区）');
  await cityInput.click();await cityInput.fill('虚构市');await cityInput.press('Enter');
  assert.equal(await cityInput.inputValue(),'虚构市');
  await living.getByText('待填写',{exact:true}).waitFor();
  await field('我的月租').fill('1300');
  await cityInput.click();await cityInput.fill('另一个测试市');await cityInput.press('Enter');
  assert.equal(await field('我的月租').inputValue(),'');
  await city('虚构市');assert.equal(await field('我的月租').inputValue(),'1300');
  await city('深圳');await balance('¥1,500');
  await page.reload();await balance('¥1,500');
  assert.equal(await field('每月到手（CNY）').inputValue(),'8000');
  assert.equal(new URL(page.url()).search,'?view=living');
  await page.getByRole('link',{name:'返回收入测算'}).click();
  await page.getByRole('heading',{name:'Offer 收入测算',exact:true}).waitFor();
  await page.goBack();await balance('¥1,500');
  for (const width of [320,390,1280]) {
    await page.setViewportSize({width,height:812});
    await checkWidth();
    const boxes = await Promise.all([page.locator('.living-inputs').boundingBox(),living.boundingBox()]);
    assert.ok(width<761 ? boxes[1].y>=boxes[0].y+boxes[0].height-1 : boxes[1].x>boxes[0].x+boxes[0].width-1);
  }
  await page.getByText('参考数据与估算方式',{exact:true}).click();
  assert.ok((await page.locator('.living-sources a').count())>=2);
  assert.deepEqual(errors,[]);
  console.log('Passed: offer card gestures, calendar and keyboard, city budget cash flow, rent and savings scenarios, independent plans/currencies, local restore, history and responsive layout.');
} finally {await browser?.close();await app.close();}
