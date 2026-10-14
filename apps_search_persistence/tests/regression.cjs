const fs = require('fs');
const vm = require('vm');
const path = require('path');
const assert = require('assert/strict');
const source = fs.readFileSync(path.join(__dirname, '../static/src/js/apps_search_persistence.js'), 'utf8').replace(/^import .*;$/gm, '');
function create(storage = new Map(), current = {action:'apps',view_type:'list'}, uid=7) {
    const groups = {actions:new Map(),services:new Map()};
    const calls = [];
    function bus() {const listeners=new Map();return {addEventListener(n,fn){if(!listeners.has(n))listeners.set(n,[]);listeners.get(n).push(fn);},trigger(n,detail){for(const fn of listeners.get(n)||[])fn({detail});}};}
    const rpcBus=bus();
    groups.actions.set('reload',(env, action)=> {calls.push(action); return 'reload';});
    const router = {current, stateToUrl(s) {return '/odoo/'+s.action+'?view_type='+s.view_type;}, replaceState(s,o) {this.current=o?.replace?{...s}:{...this.current,...s};}};
    const context={rpcBus,browser:{sessionStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)}},router,registry:{category:n=>({get:k=>groups[n].get(k),add:(k,v)=>groups[n].set(k,v)})},user:{userId:uid},session:{db:'clean_test'},Date,WeakMap,JSON};
    vm.runInNewContext(source,context);
    const globalState = {searchModel:JSON.stringify({query:[{searchItemId:1,autocompleteValue:'Contract'}],searchItems:{1:{type:'field',fieldName:'name'},2:{type:'filter',domain:"[('application','=',True)]"}},sections:[],nextId:3})};
    const controller={action:{type:'ir.actions.act_window',res_model:'ir.module.module',path:'apps'},props:{type:current.view_type},getGlobalState:()=>globalState};
    const env={services:{},bus:bus()};let id=0;
    const action={currentController:controller,doActionButton:async(params)=>{
      const data={id:++id,params:{model:params.resModel,method:params.name}};
      rpcBus.trigger('RPC:REQUEST',{data});
      const result={type:'ir.actions.client',tag:'reload',params:{menu_id:99}};
      rpcBus.trigger('RPC:RESPONSE',{data,result});
      return groups.actions.get('reload')(env,result);
    }};env.services.action=action;
    groups.services.get('apps_search_persistence').start(env,{action});
    return {storage,router,action,env,controller,calls,globalState,groups,rpcBus};
}
const upgrade={resModel:'ir.module.module',type:'object',name:'button_immediate_upgrade'};
(async()=> {
 let count=0;
 for(const mode of ['list','kanban']) {
   const a=create(new Map(),{action:'apps',view_type:mode});
   await a.action.doActionButton(upgrade);
   assert.equal(a.calls.length,1);assert.equal(Object.keys(a.calls[0].params).length,0);
   const b=create(a.storage,{...a.router.current});
   assert.equal(b.router.current.globalState.searchModel,a.globalState.searchModel);
   assert.equal(b.router.current.view_type,mode); assert.equal(b.storage.size,0);count++;
 }
 for(const name of ['button_immediate_install','button_immediate_uninstall']) {
   const a=create(); await a.action.doActionButton({...upgrade,name});
   assert.equal(a.calls[0].params.menu_id,99);assert.equal(a.storage.size,0);count++;
 }
 {const a=create();a.controller.action.path='other'; await a.action.doActionButton(upgrade);assert.equal(a.storage.size,0);count++;}
 {const a=create();a.controller.props.type='form';await a.action.doActionButton(upgrade);assert.equal(a.storage.size,0);count++;}
 {const a=create();await a.action.doActionButton(upgrade);const b=create(a.storage,{action:'other',view_type:'list'});assert.equal(b.router.current.globalState,undefined);assert.equal(b.storage.size,0);count++;}
 {const a=create();await a.action.doActionButton(upgrade);const b=create(a.storage,{...a.router.current},99);assert.equal(b.router.current.globalState,undefined);count++;}
 {const a=create();await a.action.doActionButton(upgrade);const r={...a.router.current,globalState:{searchModel:'new search'}};const b=create(a.storage,r);assert.equal(b.router.current.globalState.searchModel,'new search');count++;}
 {const a=create();await a.action.doActionButton(upgrade);const b=create(a.storage,{...a.router.current});await b.action.doActionButton(upgrade);const c=create(b.storage,{...b.router.current,globalState:undefined});assert.equal(c.router.current.globalState.searchModel,b.globalState.searchModel);count++;}
 {const storage=new Map([['apps_search_persistence.v2','bad json']]);const a=create(storage);assert.equal(a.storage.size,0);count++;}
 {const a=create();await a.action.doActionButton(upgrade);const k='apps_search_persistence.v2', s=JSON.parse(a.storage.get(k));s.timestamp=0;a.storage.set(k,JSON.stringify(s));const b=create(a.storage,{...a.router.current});assert.equal(b.router.current.globalState,undefined);count++;}
 {
 const a=create(), data={id:100,params:{model:'ir.module.module',method:'button_immediate_upgrade'}};
 a.rpcBus.trigger('RPC:REQUEST',{data});a.rpcBus.trigger('RPC:RESPONSE',{data,error:new Error('upgrade failed')});
 a.groups.actions.get('reload')(a.env,{params:{menu_id:99}});assert.equal(a.calls[0].params.menu_id,99);assert.equal(a.storage.size,0);count++;
 }
 {
 const a=create(), data={id:101,params:{model:'ir.module.module',method:'button_immediate_upgrade'}};
 a.rpcBus.trigger('RPC:REQUEST',{data});a.rpcBus.trigger('RPC:RESPONSE',{data,result:{type:'ir.actions.act_window'}});
 a.groups.actions.get('reload')(a.env,{params:{menu_id:99}});assert.equal(a.calls[0].params.menu_id,99);count++;
 }
 {
 const a=create(), data={id:102,params:{model:'ir.module.module',method:'button_immediate_upgrade'}};
 a.rpcBus.trigger('RPC:REQUEST',{data});a.action.currentController={action:{path:'discuss'}};a.env.bus.trigger('ACTION_MANAGER:UI-UPDATED',{});
 a.rpcBus.trigger('RPC:RESPONSE',{data,result:{type:'ir.actions.client',tag:'reload'}});
 a.groups.actions.get('reload')(a.env,{params:{menu_id:99}});assert.equal(a.calls[0].params.menu_id,99);count++;
 }
 {
 const a=create();const alternateEnv={services:a.env.services};
 const data={id:103,params:{model:'ir.module.module',method:'button_immediate_upgrade'}};
 a.rpcBus.trigger('RPC:REQUEST',{data});a.rpcBus.trigger('RPC:RESPONSE',{data,result:{type:'ir.actions.client',tag:'reload'}});
 a.groups.actions.get('reload')(alternateEnv,{params:{menu_id:99}});assert.equal(Object.keys(a.calls[0].params).length,0);count++;
 }
 console.log(count+' isolated regression scenarios passed (mocked Odoo services; not live UI tests)');
})().catch(e=>{console.error(e);process.exit(1)});
