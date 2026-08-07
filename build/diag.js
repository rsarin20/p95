const {chromium}=require('playwright');
(async()=>{
 const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
 const pg=await (await b.newContext({viewport:{width:430,height:900}})).newPage();
 await pg.goto('file:///home/user/p95/stratechery-stack.html');
 await pg.waitForTimeout(300);
 const out=await pg.evaluate(()=>{
   const vw=document.documentElement.clientWidth, bad=[];
   document.querySelectorAll('*').forEach(el=>{
     const r=el.getBoundingClientRect();
     if(r.width>vw+2 || r.right>vw+2) bad.push({tag:el.tagName,cls:el.className&&String(el.className).slice(0,44),w:Math.round(r.width),right:Math.round(r.right)});
   });
   return {vw, bad:bad.slice(0,14)};
 });
 console.log(JSON.stringify(out,null,1));
 await b.close();
})();
