const {chromium}=require('playwright');
(async()=>{
 const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
 const errs=[];
 for(const [theme,w,h,name,acts] of [
   ['light',1440,1000,'01-stack-light',[]],
   ['dark',1440,1000,'02-stack-dark',[]],
   ['light',1440,1100,'03-concept',[['click','[data-conc]']]],
   ['light',1440,1200,'04-revisions',[['click','[data-tab="revisions"]']]],
   ['dark',1440,1100,'05-board',[['click','[data-tab="board"]'],['click','.cell:not(.z)']]],
   ['light',1440,1000,'06-index',[['click','[data-tab="index"]']]],
   ['light',1440,1000,'07-method',[['click','[data-tab="method"]']]],
   ['light',430,900,'08-mobile',[]],
 ]){
  const ctx=await b.newContext({colorScheme:theme,viewport:{width:w,height:h},deviceScaleFactor:2});
  const pg=await ctx.newPage();
  pg.on('console',m=>{if(m.type()==='error')errs.push(name+': '+m.text())});
  pg.on('pageerror',e=>errs.push(name+' PAGEERROR: '+e.message));
  await pg.goto('file:///home/user/p95/stratechery-stack.html');
  await pg.waitForTimeout(300);
  for(const [a,s] of acts){ await pg.click(s); await pg.waitForTimeout(350); }
  await pg.waitForTimeout(200);
  await pg.screenshot({path:`build/${name}.png`,fullPage:false});
  // horizontal overflow check
  const ov=await pg.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
  if(ov>2) errs.push(`${name}: HORIZONTAL OVERFLOW ${ov}px`);
  await ctx.close();
 }
 await b.close();
 console.log(errs.length?'ISSUES:\n'+errs.join('\n'):'no console errors, no overflow');
})();
