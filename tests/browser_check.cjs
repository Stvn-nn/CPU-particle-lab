/* Optional browser integration checks. Requires playwright and a Chromium build.
   PARTICLE_BROWSER_EXECUTABLE may point to an existing test browser.
   PARTICLE_PYTHON may select a Python interpreter. */
const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs');
const {spawn}=require('node:child_process');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
async function main(){
 const server=spawn(process.env.PARTICLE_PYTHON||'python',[path.join(root,'app.py'),'--no-browser','--port','0']);
 let browser;const results=[];
 const url=await new Promise((resolve,reject)=>{server.stdout.on('data',d=>{const m=d.toString().match(/http:\/\/127\.0\.0\.1:\d+/);if(m)resolve(m[0]);});server.on('error',reject);server.on('exit',c=>reject(Error('Local server stopped: '+c)));});
 const check=(name,value)=>{assert.ok(value,name);results.push(name);};
 try{
  browser=await chromium.launch({headless:true,executablePath:process.env.PARTICLE_BROWSER_EXECUTABLE||undefined,args:process.env.PARTICLE_SOFTWARE_GL==='1'?['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']:[]});
  const page=await browser.newPage({viewport:{width:1440,height:1000},acceptDownloads:true});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(url);await page.waitForFunction(()=>window.particleLab?.model&&window.particleLab.samples.length>2&&document.querySelector('#live-error').textContent.includes('units'));
  check('bundled model loads and live comparison runs',(await page.locator('#live-error').innerText()).includes('units'));
  check('graphics shader pipeline reports no errors',await page.evaluate(()=>window.particleLab.engine.isCPU||window.particleLab.engine.gl.getError()===0));
  const firstPhase=await page.evaluate(()=>window.particleLab.phase);await page.waitForTimeout(200);check('motion advances',await page.evaluate(v=>window.particleLab.phase>v,firstPhase));
  await page.click('#pause');const phase=await page.evaluate(()=>window.particleLab.phase);await page.waitForTimeout(150);check('pause stops progression',await page.evaluate(v=>window.particleLab.phase===v,phase));await page.click('#pause');
  await page.locator('#moving').uncheck();const stationary=await page.evaluate(()=>window.particleLab.phase);await page.waitForTimeout(150);check('motion toggle holds formation',await page.evaluate(v=>window.particleLab.phase===v,stationary));await page.locator('#moving').check();
  for(const mode of ['gpu','cpu']){
   await page.selectOption('#backend',mode);await page.selectOption('#shape','0');
   await page.selectOption('#depth-mode','auto');check(mode+' auto disables manual slider',await page.locator('#depth').isDisabled());
   const box=await page.locator('#particles').boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);
   await page.waitForFunction(()=>{const p=window.particleLab.params();return p.toolVisible&&p.push.reduce((a,v,k)=>a+v*p.camera[k*3+2],0)<-.7;});
   check(mode+' auto targets front of sphere',true);
   await page.mouse.down();await page.waitForTimeout(400);await page.mouse.up();
   check(mode+' auto push changes particle state',await page.evaluate(()=>window.particleLab.engine.sample(6000).some(v=>Math.abs(v)>1e-5)));
   await page.mouse.move(box.x+15,box.y+box.height*.3);await page.waitForFunction(()=>!window.particleLab.params().toolVisible);check(mode+' empty space has no auto target',true);
   await page.selectOption('#depth-mode','manual');await page.locator('#depth').fill('60');await page.mouse.move(box.x+box.width/2,box.y+box.height/2);
   check(mode+' manual depth uses slider',await page.evaluate(()=>{const p=window.particleLab.params();return Math.abs(p.push.reduce((a,v,k)=>a+v*p.camera[k*3+2],0)-.72)<1e-6;}));
   await page.locator('#depth').fill('0');
  }
  check('depth mode round-trips and legacy setups stay manual',await page.evaluate(()=>{const lab=window.particleLab,s={...lab.settings(),depthMode:'auto'};lab.loadSettings(s);const kept=lab.settings().depthMode==='auto';delete s.depthMode;lab.loadSettings(s);return kept&&lab.settings().depthMode==='manual';}));
  await page.selectOption('#backend','gpu');
  for(const shape of ['0','1','2','3']){await page.selectOption('#shape',shape);await page.waitForTimeout(100);check('shape '+shape+' remains finite',await page.evaluate(()=>Array.from(window.particleLab.engine.sample()).every(Number.isFinite)));}
  await page.selectOption('#shape','1');const c=await page.locator('#particles').boundingBox();const x=c.x+c.width/2,y=c.y+c.height/2;await page.mouse.move(x,y);await page.mouse.down();await page.waitForTimeout(800);await page.mouse.move(x+20,y+10,{steps:10});await page.mouse.up();
  const pushed=await page.evaluate(()=>{const a=window.particleLab.engine.sample(6000);let sum=0;for(let i=0;i<a.length;i+=6)sum+=a[i]**2+a[i+1]**2+a[i+2]**2;return sum;});check('pusher displaces actual state',pushed>1e-5);
  await page.mouse.move(20,20);const recoveryStart=await page.evaluate(()=>window.particleLab.phase);await page.waitForFunction(v=>window.particleLab.phase>v+3,recoveryStart,{timeout:30000});const recovered=await page.evaluate(()=>{const a=window.particleLab.engine.sample(6000);let sum=0;for(let i=0;i<a.length;i+=6)sum+=a[i]**2+a[i+1]**2+a[i+2]**2;return sum;});check('unaffected particles recover toward moving paths',recovered<pushed*.25);
  // Shader and CPU one-step parity on nonzero state. GLSL transcendental
  // approximations differ from JS doubles; allow 1e-4 scene-state units.
  const parity=await page.evaluate(async()=>{const lab=window.particleLab,e=lab.engine;if(e.isCPU)return{skipped:true};const {cpuStep}=await import('./core.js');e.configure(128,414);const state=new Float32Array(128*6);for(let i=0;i<128;i++){state[i*6]=.12*Math.sin(i);state[i*6+1]=.08*Math.cos(i);state[i*6+3]=.2*Math.sin(i*.4);}let max=0,worst=null;for(let shape=0;shape<4;shape++){e.current=0;e.gl.bindBuffer(e.gl.ARRAY_BUFFER,e.buffers[0]);e.gl.bufferSubData(e.gl.ARRAY_BUFFER,0,state);e.gl.bindBuffer(e.gl.ARRAY_BUFFER,null);const expected=state.slice(),p={...lab.params(),shape,phase:2.4,push:[.2,0,0],radius:.65,strength:18,recovery:14,moving:true,toolVisible:true,pushing:true};cpuStep(e.seeds,expected,128,p);e.step(p);const got=e.sample(128);for(let i=0;i<got.length;i++){const error=Math.abs(got[i]-expected[i]);if(error>max){max=error;worst={shape,index:i,actual:got[i],expected:expected[i]};}}}lab.reset();return{max,worst};});check('GPU state matches CPU reference across all shapes',parity.skipped||parity.max<1e-4);
  await page.locator('#radius').fill('100');const radius=await page.evaluate(()=>{const r=window.particleLab.params();return r.radius*Math.min(document.querySelector('#particles').clientWidth,document.querySelector('#particles').clientHeight)*.36*r.zoom;});check('pusher indicator has a compact radius',radius<65);
  const oldWidth=(await page.locator('#controls').boundingBox()).width;const v=await page.locator('#v-divider').boundingBox();await page.mouse.move(v.x+3,v.y+300);await page.mouse.down();await page.mouse.move(v.x+53,v.y+300);await page.mouse.up();check('left menu divider resizes',(await page.locator('#controls').boundingBox()).width>oldWidth+35);
  const oldHeight=(await page.locator('#viewport').boundingBox()).height;await page.locator('#h-divider').focus();await page.keyboard.press('ArrowUp');check('lower divider supports keyboard resizing',(await page.locator('#viewport').boundingBox()).height<oldHeight);
  const simBefore=await page.locator('#viewport').boundingBox();await page.locator('#analysis').evaluate(e=>e.scrollTop=350);const simAfter=await page.locator('#viewport').boundingBox();check('analysis scroll leaves simulation fixed',simBefore.y===simAfter.y&&simBefore.height===simAfter.height);
  const grid=await page.locator('.ai-grid').evaluate(e=>({columns:getComputedStyle(e).gridTemplateColumns,width:e.clientWidth}));check('live feeds are side by side on desktop',grid.columns.split(' ').length===2);
  await page.locator('#analysis').evaluate(e=>e.scrollTop=0);const csvEvent=page.waitForEvent('download');await page.click('#export-csv');const csvFile=await csvEvent;check('performance CSV exports measured samples',fs.readFileSync(await csvFile.path(),'utf8').split('\n').length>2);const downloadEvent=page.waitForEvent('download');await page.click('#save-setup');const setupFile=await downloadEvent;const content=JSON.parse(fs.readFileSync(await setupFile.path(),'utf8'));check('saved setup is usable JSON',content.version===1&&content.count===6000);await page.selectOption('#shape','2');await page.locator('#import-file').setInputFiles({name:'saved-setup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(content))});await page.waitForFunction(v=>window.particleLab.settings().shape===v,content.shape);check('saved setup imports original controls',await page.evaluate(s=>{const a=window.particleLab.settings();return a.shape===s.shape&&a.seed===s.seed&&a.count===s.count&&a.radius===s.radius;},content));const invalid={...content,count:-1};await page.locator('#import-file').setInputFiles({name:'invalid-setup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(invalid))});await page.waitForFunction(()=>document.querySelector('#message').textContent.includes('Invalid setting'));check('invalid import leaves current setup intact',await page.evaluate(n=>window.particleLab.engine.count===n,content.count));
  const snap=page.waitForEvent('download');await page.click('#screenshot');const image=await snap;check('screenshot exports a nonempty PNG',fs.statSync(await image.path()).size>1000);
  await page.locator('#record-run').scrollIntoViewIfNeeded();await page.click('#record-run');check('experiment snapshot is recorded',await page.locator('.history-item').count()===1);
  await page.selectOption('#backend','cpu');await page.waitForFunction(()=>window.particleLab.engine.isCPU);check('CPU reference works',await page.evaluate(()=>window.particleLab.engine.label==='CPU reference'));
  await page.locator('#count').fill('90000');await page.click('#apply-count');check('CPU particle cap is enforced',await page.evaluate(()=>window.particleLab.engine.count===10000));await page.locator('#count').fill('6000');await page.click('#apply-count');
  await page.setViewportSize({width:390,height:844});await page.waitForTimeout(100);check('small viewport has no document overflow',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.setViewportSize({width:1440,height:1000});await page.selectOption('#backend','gpu');await page.selectOption('#shape','0');await page.locator('#controls').evaluate(e=>e.scrollTop=0);await page.locator('#analysis').evaluate(e=>e.scrollTop=0);await page.locator('#restore-layout').click();await page.locator('#controls').evaluate(e=>e.scrollTop=0);
  await page.waitForFunction(()=>window.particleLab.samples.length>20);if(process.env.PARTICLE_QA_SCREENSHOT)await page.screenshot({path:process.env.PARTICLE_QA_SCREENSHOT});
  check('no application errors',errors.length===0);
  const report={passed:results.length,checks:results,shader_cpu_max_error:parity.max??null,graphics_test_environment:process.env.PARTICLE_SOFTWARE_GL==='1'?'Software graphics backend; not a hardware performance benchmark':'Browser graphics backend',date:new Date().toISOString()};console.log(JSON.stringify(report,null,2));if(process.env.PARTICLE_QA_REPORT)fs.writeFileSync(process.env.PARTICLE_QA_REPORT,JSON.stringify(report,null,2));
 }finally{if(browser)await browser.close();server.kill();}
}
main().catch(e=>{console.error(e);process.exit(1)});
