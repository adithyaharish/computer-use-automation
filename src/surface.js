'use strict';
const path=require('node:path');
const {FlowError}=require('./schema');
/** Browser implementation of Surface. The engine never imports Playwright. */
class BrowserSurface {
  static async create(policy,evidence,headed=false) {
    const {chromium}=require('playwright');
    const browser=await chromium.launch({headless:!headed,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH}:{})});
    const context=await browser.newContext({viewport:{width:1280,height:900},serviceWorkers:'block',acceptDownloads:false});
    const surface=new BrowserSurface(await context.newPage(),policy,evidence,browser);
    await context.route('**/*',async route=>{
      try {policy.url(route.request().url());await route.continue();}
      catch {surface.blocked=true;evidence.event('network_blocked');await route.abort('blockedbyclient');}
    });
    await context.routeWebSocket('**/*',ws=>{surface.blocked=true;ws.close();});
    context.on('page',p=>{if(p!==surface.page){surface.blocked=true;p.close().catch(()=>{});}});
    surface.page.on('dialog',async d=>{surface.dialog=true;await d.dismiss().catch(()=>{});});
    surface.page.on('download',async d=>{surface.blocked=true;await d.cancel();});
    surface.page.setDefaultTimeout(2500);
    return surface;
  }
  constructor(page,policy,evidence,browser) {this.page=page;this.policy=policy;this.evidence=evidence;this.browser=browser;this.blocked=false;this.dialog=false;}
  async open() {
    const url=this.policy.profile.origin+this.policy.profile.entry;this.policy.url(url);
    await this.page.goto(url,{waitUntil:'domcontentloaded',timeout:10000});
    const [vendor,version]=await Promise.all(['app-vendor','app-version'].map(n=>this.page.locator(`meta[name="${n}"]`).getAttribute('content')));
    if(vendor!==this.policy.profile.vendor||version!==this.policy.profile.appVersion) throw new FlowError('APP_VERSION_MISMATCH');
    await this.page.frameLocator('iframe[name="workspace"]').getByRole('heading',{name:'Member lookup',exact:true}).waitFor({state:'visible'});
  }
  scope() {return this.page.frameLocator('iframe[name="workspace"]');}
  locator(target) {
    const t=this.policy.profile.targets[target];if(!t) throw new FlowError('UNKNOWN_TARGET');
    const scope=this.scope();
    if(t.strategy==='role') return scope.getByRole(t.role,{name:t.value,exact:true});
    if(t.strategy==='label') return scope.getByLabel(t.value,{exact:true});
    return scope.locator(t.value);
  }
  async guard() {
    this.policy.url(this.page.url());
    for(const frame of this.page.frames()) if(frame.url() && frame.url()!=='about:blank') this.policy.url(frame.url());
    if(this.blocked) throw new FlowError('NETWORK_POLICY_BLOCK');
    if(this.dialog) throw new FlowError('UNEXPECTED_DIALOG');
  }
  async signal() {
    await this.guard();
    for(const s of this.policy.profile.signals) if(await this.scope().getByText(s.text,{exact:true}).isVisible()) return s;
    if(await this.scope().locator('dialog[open]').count()) return {kind:'human',code:'UNEXPECTED_DIALOG'};
    return null;
  }
  async available(target) {
    await this.guard();const loc=this.locator(target);const count=await loc.count();
    if(count>1) throw new FlowError('AMBIGUOUS_TARGET',{target,observed:'multiple_matches'});
    return count===1 && await loc.isVisible();
  }
  async perform(s,value,owner='automation') {
    await this.guard();this.policy.action(s,owner);const loc=this.locator(s.target);
    if(await loc.count()!==1) throw new FlowError('AMBIGUOUS_OR_MISSING_TARGET',{target:s.target});
    if(s.action==='click') await loc.click({timeout:2500});
    else if(s.action==='fill') await loc.fill(value,{timeout:2500});
    else if(s.action==='read') return await loc.innerText({timeout:2500});
    else if(s.action==='check') {
      if(!await loc.isVisible()) throw new FlowError('CHECKPOINT_FAILED');
      if(s.equalsInput && (await loc.innerText()).trim()!==value) throw new FlowError('IDENTITY_MISMATCH');
    }
    await this.guard();
  }
  async observe() {
    await this.guard();
    // Only approved labels and visibility reach the LLM. No raw DOM, field values, account data, or free text.
    const controls=[];
    for(const [target,definition] of Object.entries(this.policy.profile.targets)) {
      if(await this.available(target)) controls.push({target,label:definition.value,actions:this.policy.profile.grants[target]||[],operatorActions:this.policy.profile.operatorGrants[target]||this.policy.profile.grants[target]||[],risk:this.policy.profile.riskyTargets.includes(target)?'blocked':'policy-controlled'});
    }
    return {controls,signal:await this.signal()};
  }
  async evidenceOnFailure(step) {
    // Fail-closed allowlist DOM snapshot: richer than a step log, with actual control structure and states.
    const state=await this.observe();
    this.evidence.json(`state-${step}.json`,state);
    // Full-page screenshots only for this explicitly synthetic fixture, masked even so.
    if(this.policy.profile.id==='demo-bank-v1') {
      await this.page.screenshot({path:path.join(this.evidence.dir,`failure-${step}.png`),fullPage:true,
        mask:[this.scope().locator('[data-private], input, textarea')],maskColor:'#243b35'});
    }
  }
  async close(){await this.browser.close();}
}
module.exports={BrowserSurface};
