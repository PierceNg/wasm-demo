var pas = { $libimports: {}};

var rtl = {

  version: 20201,

  quiet: false,
  debug_load_units: false,
  debug_rtti: false,

  $res : {},

  debug: function(){
    if (rtl.quiet || !console || !console.log) return;
    console.log(arguments);
  },

  error: function(s){
    rtl.debug('Error: ',s);
    throw s;
  },

  warn: function(s){
    rtl.debug('Warn: ',s);
  },

  checkVersion: function(v){
    if (rtl.version != v) throw "expected rtl version "+v+", but found "+rtl.version;
  },

  hiInt: Math.pow(2,53),

  hasString: function(s){
    return rtl.isString(s) && (s.length>0);
  },

  isArray: function(a) {
    return Array.isArray(a);
  },

  isFunction: function(f){
    return typeof(f)==="function";
  },

  isModule: function(m){
    return rtl.isObject(m) && rtl.hasString(m.$name) && (pas[m.$name]===m);
  },

  isImplementation: function(m){
    return rtl.isObject(m) && rtl.isModule(m.$module) && (m.$module.$impl===m);
  },

  isNumber: function(n){
    return typeof(n)==="number";
  },

  isObject: function(o){
    var s=typeof(o);
    return (typeof(o)==="object") && (o!=null);
  },

  isString: function(s){
    return typeof(s)==="string";
  },

  getNumber: function(n){
    return typeof(n)==="number"?n:NaN;
  },

  getChar: function(c){
    return ((typeof(c)==="string") && (c.length===1)) ? c : "";
  },

  getObject: function(o){
    return ((typeof(o)==="object") || (typeof(o)==='function')) ? o : null;
  },

  isTRecord: function(type){
    return (rtl.isObject(type) && type.hasOwnProperty('$new') && (typeof(type.$new)==='function'));
  },

  isPasClass: function(type){
    return (rtl.isObject(type) && type.hasOwnProperty('$classname') && rtl.isObject(type.$module));
  },

  isPasClassInstance: function(type){
    return (rtl.isObject(type) && rtl.isPasClass(type.$class));
  },

  hexStr: function(n,digits){
    return ("000000000000000"+n.toString(16).toUpperCase()).slice(-digits);
  },

  m_loading: 0,
  m_loading_intf: 1,
  m_intf_loaded: 2,
  m_loading_impl: 3, // loading all used unit
  m_initializing: 4, // running initialization
  m_initialized: 5,

  module: function(module_name, intfuseslist, intfcode, impluseslist){
    if (rtl.debug_load_units) rtl.debug('rtl.module name="'+module_name+'" intfuses='+intfuseslist+' impluses='+impluseslist);
    if (!rtl.hasString(module_name)) rtl.error('invalid module name "'+module_name+'"');
    if (!rtl.isArray(intfuseslist)) rtl.error('invalid interface useslist of "'+module_name+'"');
    if (!rtl.isFunction(intfcode)) rtl.error('invalid interface code of "'+module_name+'"');
    if (!(impluseslist==undefined) && !rtl.isArray(impluseslist)) rtl.error('invalid implementation useslist of "'+module_name+'"');

    if (pas[module_name])
      rtl.error('module "'+module_name+'" is already registered');

    var r = Object.create(rtl.tSectionRTTI);
    var module = r.$module = pas[module_name] = {
      $name: module_name,
      $intfuseslist: intfuseslist,
      $impluseslist: impluseslist,
      $state: rtl.m_loading,
      $intfcode: intfcode,
      $implcode: null,
      $impl: null,
      $rtti: r
    };
    if (impluseslist) module.$impl = {
          $module: module,
          $rtti: r
        };
  },

  exitcode: 0,

  run: function(module_name){
    try {
      if (!rtl.hasString(module_name)) module_name='program';
      if (rtl.debug_load_units) rtl.debug('rtl.run module="'+module_name+'"');
      rtl.initRTTI();
      var module = pas[module_name];
      if (!module) rtl.error('rtl.run module "'+module_name+'" missing');
      rtl.loadintf(module);
      rtl.loadimpl(module);
      if ((module_name=='program') || (module_name=='library')){
        if (rtl.debug_load_units) rtl.debug('running $main');
        var r = pas[module_name].$main();
        if (rtl.isNumber(r)) rtl.exitcode = r;
      }
    } catch(re) {
      if (!rtl.showUncaughtExceptions) {
        throw re
      } else {  
        if (!rtl.handleUncaughtException(re)) {
          rtl.showException(re);
          rtl.exitcode = 216;
        }  
      }
    } 
    return rtl.exitcode;
  },
  
  showException : function (re) {
    var errMsg = rtl.hasString(re.$classname) ? re.$classname : '';
    errMsg +=  ((errMsg) ? ': ' : '') + (re.hasOwnProperty('fMessage') ? re.fMessage : re);
    alert('Uncaught Exception : '+errMsg);
  },

  handleUncaughtException: function (e) {
    if (rtl.onUncaughtException) {
      try {
        rtl.onUncaughtException(e);
        return true;
      } catch (ee) {
        return false; 
      }
    } else {
      return false;
    }
  },

  loadintf: function(module){
    if (module.$state>rtl.m_loading_intf) return; // already finished
    if (rtl.debug_load_units) rtl.debug('loadintf: "'+module.$name+'"');
    if (module.$state===rtl.m_loading_intf)
      rtl.error('unit cycle detected "'+module.$name+'"');
    module.$state=rtl.m_loading_intf;
    // load interfaces of interface useslist
    rtl.loaduseslist(module,module.$intfuseslist,rtl.loadintf);
    // run interface
    if (rtl.debug_load_units) rtl.debug('loadintf: run intf of "'+module.$name+'"');
    module.$intfcode(module.$intfuseslist);
    // success
    module.$state=rtl.m_intf_loaded;
    // Note: units only used in implementations are not yet loaded (not even their interfaces)
  },

  loaduseslist: function(module,useslist,f){
    if (useslist==undefined) return;
    var len = useslist.length;
    for (var i = 0; i<len; i++) {
      var unitname=useslist[i];
      if (rtl.debug_load_units) rtl.debug('loaduseslist of "'+module.$name+'" uses="'+unitname+'"');
      if (pas[unitname]==undefined)
        rtl.error('module "'+module.$name+'" misses "'+unitname+'"');
      f(pas[unitname]);
    }
  },

  loadimpl: function(module){
    if (module.$state>=rtl.m_loading_impl) return; // already processing
    if (module.$state<rtl.m_intf_loaded) rtl.error('loadimpl: interface not loaded of "'+module.$name+'"');
    if (rtl.debug_load_units) rtl.debug('loadimpl: load uses of "'+module.$name+'"');
    module.$state=rtl.m_loading_impl;
    // load interfaces of implementation useslist
    rtl.loaduseslist(module,module.$impluseslist,rtl.loadintf);
    // load implementation of interfaces useslist
    rtl.loaduseslist(module,module.$intfuseslist,rtl.loadimpl);
    // load implementation of implementation useslist
    rtl.loaduseslist(module,module.$impluseslist,rtl.loadimpl);
    // Note: At this point all interfaces used by this unit are loaded. If
    //   there are implementation uses cycles some used units might not yet be
    //   initialized. This is by design.
    // run implementation
    if (rtl.debug_load_units) rtl.debug('loadimpl: run impl of "'+module.$name+'"');
    if (rtl.isFunction(module.$implcode)) module.$implcode(module.$impluseslist);
    // run initialization
    if (rtl.debug_load_units) rtl.debug('loadimpl: run init of "'+module.$name+'"');
    module.$state=rtl.m_initializing;
    if (rtl.isFunction(module.$init)) module.$init();
    // unit initialized
    module.$state=rtl.m_initialized;
  },

  createCallback: function(scope, fn){
    var cb;
    if (typeof(fn)==='string'){
      if (!scope.hasOwnProperty('$events')) scope.$events = {};
      cb = scope.$events[fn];
      if (cb) return cb;
      scope.$events[fn] = cb = function(){
        return scope[fn].apply(scope,arguments);
      };
    } else {
      cb = function(){
        return fn.apply(scope,arguments);
      };
    };
    cb.scope = scope;
    cb.fn = fn;
    return cb;
  },

  createSafeCallback: function(scope, fn){
    var cb;
    if (typeof(fn)==='string'){
      if (!scope.hasOwnProperty('$events')) scope.$events = {};
      cb = scope.$events[fn];
      if (cb) return cb;
      scope.$events[fn] = cb = function(){
        try{
          return scope[fn].apply(scope,arguments);
        } catch (err) {
          if (!rtl.handleUncaughtException(err)) throw err;
        }
      };
    } else {
      cb = function(){
        try{
          return fn.apply(scope,arguments);
        } catch (err) {
          if (!rtl.handleUncaughtException(err)) throw err;
        }
      };
    };
    cb.scope = scope;
    cb.fn = fn;
    return cb;
  },

  eqCallback: function(a,b){
    // can be a function or a function wrapper
    if (a===b){
      return true;
    } else {
      return (a!=null) && (b!=null) && (a.fn) && (a.scope===b.scope) && (a.fn===b.fn);
    }
  },

  initStruct: function(c,parent,name){
    if ((parent.$module) && (parent.$module.$impl===parent)) parent=parent.$module;
    c.$parent = parent;
    if (rtl.isModule(parent)){
      c.$module = parent;
      c.$name = name;
    } else {
      c.$module = parent.$module;
      c.$name = parent.$name+'.'+name;
    };
    return parent;
  },

  initClass: function(c,parent,name,initfn,rttiname){
    parent[name] = c;
    c.$class = c; // Note: o.$class === Object.getPrototypeOf(o)
    c.$classname = rttiname?rttiname:name;
    parent = rtl.initStruct(c,parent,name);
    c.$fullname = parent.$name+'.'+name;
    // rtti
    if (rtl.debug_rtti) rtl.debug('initClass '+c.$fullname);
    var t = c.$module.$rtti.$Class(c.$classname,{ "class": c });
    c.$rtti = t;
    if (rtl.isObject(c.$ancestor)) t.ancestor = c.$ancestor.$rtti;
    if (!t.ancestor) t.ancestor = null;
    // init members
    initfn.call(c);
  },

  createClass: function(parent,name,ancestor,initfn,rttiname){
    // create a normal class,
    // ancestor must be null or a normal class,
    // the root ancestor can be an external class
    var c = null;
    if (ancestor != null){
      c = Object.create(ancestor);
      c.$ancestor = ancestor;
      // Note:
      // if root is an "object" then c.$ancestor === Object.getPrototypeOf(c)
      // if root is a "function" then c.$ancestor === c.__proto__, Object.getPrototypeOf(c) returns the root
    } else {
      c = { $ancestor: null };
      c.$create = function(fn,args){
        if (args == undefined) args = [];
        var o = Object.create(this);
        o.$init();
        try{
          if (typeof(fn)==="string"){
            o[fn].apply(o,args);
          } else {
            fn.apply(o,args);
          };
          o.AfterConstruction();
        } catch($e){
          // do not call BeforeDestruction
          if (o.Destroy) o.Destroy();
          o.$final();
          throw $e;
        }
        return o;
      };
      c.$destroy = function(fnname){
        this.BeforeDestruction();
        if (this[fnname]) this[fnname]();
        this.$final();
      };
    };
    rtl.initClass(c,parent,name,initfn,rttiname);
  },

  createClassExt: function(parent,name,ancestor,newinstancefnname,initfn,rttiname){
    // Create a class using an external ancestor.
    // If newinstancefnname is given, use that function to create the new object.
    // If exist call BeforeDestruction and AfterConstruction.
    var isFunc = rtl.isFunction(ancestor);
    var c = null;
    if (isFunc){
      // create pascal class descendent from JS function
      c = Object.create(ancestor.prototype);
      c.$ancestorfunc = ancestor;
      c.$ancestor = null; // no pascal ancestor
    } else if (ancestor.$func){
      // create pascal class descendent from a pascal class descendent of a JS function
      isFunc = true;
      c = Object.create(ancestor);
      c.$ancestor = ancestor;
    } else {
      c = Object.create(ancestor);
      c.$ancestor = null; // no pascal ancestor
    }
    c.$create = function(fn,args){
      if (args == undefined) args = [];
      var o = null;
      if (newinstancefnname.length>0){
        o = this[newinstancefnname](fn,args);
      } else if(isFunc) {
        o = new this.$func(args);
      } else {
        o = Object.create(c);
      }
      if (o.$init) o.$init();
      try{
        if (typeof(fn)==="string"){
          this[fn].apply(o,args);
        } else {
          fn.apply(o,args);
        };
        if (o.AfterConstruction) o.AfterConstruction();
      } catch($e){
        // do not call BeforeDestruction
        if (o.Destroy) o.Destroy();
        if (o.$final) o.$final();
        throw $e;
      }
      return o;
    };
    c.$destroy = function(fnname){
      if (this.BeforeDestruction) this.BeforeDestruction();
      if (this[fnname]) this[fnname]();
      if (this.$final) this.$final();
    };
    rtl.initClass(c,parent,name,initfn,rttiname);
    if (isFunc){
      function f(){}
      f.prototype = c;
      c.$func = f;
    }
  },

  createHelper: function(parent,name,ancestor,initfn,rttiname){
    // create a helper,
    // ancestor must be null or a helper,
    var c = null;
    if (ancestor != null){
      c = Object.create(ancestor);
      c.$ancestor = ancestor;
      // c.$ancestor === Object.getPrototypeOf(c)
    } else {
      c = { $ancestor: null };
    };
    parent[name] = c;
    c.$class = c; // Note: o.$class === Object.getPrototypeOf(o)
    c.$classname = rttiname?rttiname:name;
    parent = rtl.initStruct(c,parent,name);
    c.$fullname = parent.$name+'.'+name;
    // rtti
    var t = c.$module.$rtti.$Helper(c.$classname,{ "helper": c });
    c.$rtti = t;
    if (rtl.isObject(ancestor)) t.ancestor = ancestor.$rtti;
    if (!t.ancestor) t.ancestor = null;
    // init members
    initfn.call(c);
  },

  tObjectDestroy: "Destroy",

  free: function(obj,name){
    if (obj[name]==null) return null;
    obj[name].$destroy(rtl.tObjectDestroy);
    obj[name]=null;
  },

  freeLoc: function(obj){
    if (obj==null) return null;
    obj.$destroy(rtl.tObjectDestroy);
    return null;
  },

  hideProp: function(o,p,v){
    Object.defineProperty(o,p, {
      enumerable: false,
      configurable: true,
      writable: true
    });
    if(arguments.length>2){ o[p]=v; }
  },

  recNewT: function(parent,name,initfn,full){
    // create new record type
    var t = {};
    if (parent) parent[name] = t;
    var h = rtl.hideProp;
    if (full){
      rtl.initStruct(t,parent,name);
      t.$record = t;
      h(t,'$record');
      h(t,'$name');
      h(t,'$parent');
      h(t,'$module');
      h(t,'$initSpec');
    }
    initfn.call(t);
    if (!t.$new){
      t.$new = function(){ return Object.create(t); };
    }
    t.$clone = function(r){ return t.$new().$assign(r); };
    h(t,'$new');
    h(t,'$clone');
    h(t,'$eq');
    h(t,'$assign');
    return t;
  },

  is: function(instance,type){
    return type.isPrototypeOf(instance) || (instance===type);
  },

  isExt: function(instance,type,mode){
    // mode===1 means instance must be a Pascal class instance
    // mode===2 means instance must be a Pascal class
    // Notes:
    // isPrototypeOf and instanceof return false on equal
    // isPrototypeOf does not work for Date.isPrototypeOf(new Date())
    //   so if isPrototypeOf is false test with instanceof
    // instanceof needs a function on right side
    if (instance == null) return false; // Note: ==null checks for undefined too
    if ((typeof(type) !== 'object') && (typeof(type) !== 'function')) return false;
    if (instance === type){
      if (mode===1) return false;
      if (mode===2) return rtl.isPasClass(instance);
      return true;
    }
    if (type.isPrototypeOf && type.isPrototypeOf(instance)){
      if (mode===1) return rtl.isPasClassInstance(instance);
      if (mode===2) return rtl.isPasClass(instance);
      return true;
    }
    if ((typeof type == 'function') && (instance instanceof type)) return true;
    return false;
  },

  Exception: null,
  EInvalidCast: null,
  EAbstractError: null,
  ERangeError: null,
  EIntOverflow: null,
  EPropWriteOnly: null,

  raiseE: function(typename){
    var t = rtl[typename];
    if (t==null){
      var mod = pas.SysUtils;
      if (!mod) mod = pas.sysutils;
      if (mod){
        t = mod[typename];
        if (!t) t = mod[typename.toLowerCase()];
        if (!t) t = mod['Exception'];
        if (!t) t = mod['exception'];
      }
    }
    if (t){
      if (t.Create){
        throw t.$create("Create");
      } else if (t.create){
        throw t.$create("create");
      }
    }
    if (typename === "EInvalidCast") throw "invalid type cast";
    if (typename === "EAbstractError") throw "Abstract method called";
    if (typename === "ERangeError") throw "range error";
    throw typename;
  },

  as: function(instance,type){
    if((instance === null) || rtl.is(instance,type)) return instance;
    rtl.raiseE("EInvalidCast");
  },

  asExt: function(instance,type,mode){
    if((instance === null) || rtl.isExt(instance,type,mode)) return instance;
    rtl.raiseE("EInvalidCast");
  },

  createInterface: function(module, name, guid, fnnames, ancestor, initfn){
    //console.log('createInterface name="'+name+'" guid="'+guid+'" names='+fnnames);
    var i = ancestor?Object.create(ancestor):{};
    module[name] = i;
    i.$module = module;
    i.$name = name;
    i.$fullname = module.$name+'.'+name;
    i.$guid = guid;
    i.$guidr = null;
    i.$names = fnnames?fnnames:[];
    if (rtl.isFunction(initfn)){
      // rtti
      if (rtl.debug_rtti) rtl.debug('createInterface '+i.$fullname);
      var t = i.$module.$rtti.$Interface(name,{ "interface": i, module: module });
      i.$rtti = t;
      if (ancestor) t.ancestor = ancestor.$rtti;
      if (!t.ancestor) t.ancestor = null;
      initfn.call(i);
    }
    return i;
  },

  strToGUIDR: function(s,g){
    var p = 0;
    function n(l){
      var h = s.substr(p,l);
      p+=l;
      return parseInt(h,16);
    }
    p+=1; // skip {
    g.D1 = n(8);
    p+=1; // skip -
    g.D2 = n(4);
    p+=1; // skip -
    g.D3 = n(4);
    p+=1; // skip -
    if (!g.D4) g.D4=[];
    g.D4[0] = n(2);
    g.D4[1] = n(2);
    p+=1; // skip -
    for(var i=2; i<8; i++) g.D4[i] = n(2);
    return g;
  },

  guidrToStr: function(g){
    if (g.$intf) return g.$intf.$guid;
    var h = rtl.hexStr;
    var s='{'+h(g.D1,8)+'-'+h(g.D2,4)+'-'+h(g.D3,4)+'-'+h(g.D4[0],2)+h(g.D4[1],2)+'-';
    for (var i=2; i<8; i++) s+=h(g.D4[i],2);
    s+='}';
    return s;
  },

  createTGUID: function(guid){
    var TGuid = (pas.System)?pas.System.TGuid:pas.system.tguid;
    var g = rtl.strToGUIDR(guid,TGuid.$new());
    return g;
  },

  getIntfGUIDR: function(intfTypeOrVar){
    if (!intfTypeOrVar) return null;
    if (!intfTypeOrVar.$guidr){
      var g = rtl.createTGUID(intfTypeOrVar.$guid);
      if (!intfTypeOrVar.hasOwnProperty('$guid')) intfTypeOrVar = Object.getPrototypeOf(intfTypeOrVar);
      g.$intf = intfTypeOrVar;
      intfTypeOrVar.$guidr = g;
    }
    return intfTypeOrVar.$guidr;
  },

  addIntf: function (aclass, intf, map){
    function jmp(fn){
      if (typeof(fn)==="function"){
        return function(){ return fn.apply(this.$o,arguments); };
      } else {
        return function(){ rtl.raiseE('EAbstractError'); };
      }
    }
    if(!map) map = {};
    var t = intf;
    var item = Object.create(t);
    if (!aclass.hasOwnProperty('$intfmaps')) aclass.$intfmaps = {};
    aclass.$intfmaps[intf.$guid] = item;
    do{
      var names = t.$names;
      if (!names) break;
      for (var i=0; i<names.length; i++){
        var intfname = names[i];
        var fnname = map[intfname];
        if (!fnname) fnname = intfname;
        //console.log('addIntf: intftype='+t.$name+' index='+i+' intfname="'+intfname+'" fnname="'+fnname+'" old='+typeof(item[intfname]));
        item[intfname] = jmp(aclass[fnname]);
      }
      t = Object.getPrototypeOf(t);
    }while(t!=null);
  },

  getIntfG: function (obj, guid, query){
    if (!obj) return null;
    //console.log('getIntfG: obj='+obj.$classname+' guid='+guid+' query='+query);
    // search
    var maps = obj.$intfmaps;
    if (!maps) return null;
    var item = maps[guid];
    if (!item) return null;
    // check delegation
    //console.log('getIntfG: obj='+obj.$classname+' guid='+guid+' query='+query+' item='+typeof(item));
    if (typeof item === 'function') return item.call(obj); // delegate. Note: COM contains _AddRef
    // check cache
    var intf = null;
    if (obj.$interfaces){
      intf = obj.$interfaces[guid];
      //console.log('getIntfG: obj='+obj.$classname+' guid='+guid+' cache='+typeof(intf));
    }
    if (!intf){ // intf can be undefined!
      intf = Object.create(item);
      intf.$o = obj;
      if (!obj.$interfaces) obj.$interfaces = {};
      obj.$interfaces[guid] = intf;
    }
    if (typeof(query)==='object'){
      // called by queryIntfT
      var o = null;
      if (intf.QueryInterface(rtl.getIntfGUIDR(query),
          {get:function(){ return o; }, set:function(v){ o=v; }}) === 0){
        return o;
      } else {
        return null;
      }
    } else if(query===2){
      // called by TObject.GetInterfaceByStr
      if (intf.$kind === 'com') intf._AddRef();
    }
    return intf;
  },

  getIntfT: function(obj,intftype){
    return rtl.getIntfG(obj,intftype.$guid);
  },

  queryIntfT: function(obj,intftype){
    return rtl.getIntfG(obj,intftype.$guid,intftype);
  },

  queryIntfIsT: function(obj,intftype){
    var i = rtl.getIntfG(obj,intftype.$guid);
    if (!i) return false;
    if (i.$kind === 'com') i._Release();
    return true;
  },

  asIntfT: function (obj,intftype){
    var i = rtl.getIntfG(obj,intftype.$guid);
    if (i!==null) return i;
    rtl.raiseEInvalidCast();
  },

  intfIsIntfT: function(intf,intftype){
    return (intf!==null) && rtl.queryIntfIsT(intf.$o,intftype);
  },

  intfAsIntfT: function (intf,intftype){
    if (!intf) return null;
    var i = rtl.getIntfG(intf.$o,intftype.$guid);
    if (i) return i;
    rtl.raiseEInvalidCast();
  },

  intfIsClass: function(intf,classtype){
    return (intf!=null) && (rtl.is(intf.$o,classtype));
  },

  intfAsClass: function(intf,classtype){
    if (intf==null) return null;
    return rtl.as(intf.$o,classtype);
  },

  intfToClass: function(intf,classtype){
    if ((intf!==null) && rtl.is(intf.$o,classtype)) return intf.$o;
    return null;
  },

  // interface reference counting
  intfRefs: { // base object for temporary interface variables
    ref: function(id,intf){
      // called for temporary interface references needing delayed release
      var old = this[id];
      //console.log('rtl.intfRefs.ref: id='+id+' old="'+(old?old.$name:'null')+'" intf="'+(intf?intf.$name:'null')+' $o='+(intf?intf.$o:'null'));
      if (old){
        // called again, e.g. in a loop
        delete this[id];
        old._Release(); // may fail
      }
      if(intf) {
        this[id]=intf;
      }
      return intf;
    },
    free: function(){
      //console.log('rtl.intfRefs.free...');
      for (var id in this){
        if (this.hasOwnProperty(id)){
          var intf = this[id];
          if (intf){
            //console.log('rtl.intfRefs.free: id='+id+' '+intf.$name+' $o='+intf.$o.$classname);
            intf._Release();
          }
        }
      }
    }
  },

  createIntfRefs: function(){
    //console.log('rtl.createIntfRefs');
    return Object.create(rtl.intfRefs);
  },

  setIntfP: function(path,name,value,skipAddRef){
    var old = path[name];
    //console.log('rtl.setIntfP path='+path+' name='+name+' old="'+(old?old.$name:'null')+'" value="'+(value?value.$name:'null')+'"');
    if (old === value) return;
    if (old !== null){
      path[name]=null;
      old._Release();
    }
    if (value !== null){
      if (!skipAddRef) value._AddRef();
      path[name]=value;
    }
  },

  setIntfL: function(old,value,skipAddRef){
    //console.log('rtl.setIntfL old="'+(old?old.$name:'null')+'" value="'+(value?value.$name:'null')+'"');
    if (old !== value){
      if (value!==null){
        if (!skipAddRef) value._AddRef();
      }
      if (old!==null){
        old._Release();  // Release after AddRef, to avoid double Release if Release creates an exception
      }
    } else if (skipAddRef){
      if (old!==null){
        old._Release();  // value has an AddRef
      }
    }
    return value;
  },

  _AddRef: function(intf){
    //if (intf) console.log('rtl._AddRef intf="'+(intf?intf.$name:'null')+'"');
    if (intf) intf._AddRef();
    return intf;
  },

  _Release: function(intf){
    //if (intf) console.log('rtl._Release intf="'+(intf?intf.$name:'null')+'"');
    if (intf) intf._Release();
    return intf;
  },

  trunc: function(a){
    return a<0 ? Math.ceil(a) : Math.floor(a);
  },

  checkMethodCall: function(obj,type){
    if (rtl.isObject(obj) && rtl.is(obj,type)) return;
    rtl.raiseE("EInvalidCast");
  },

  oc: function(i){
    // overflow check integer
    if ((Math.floor(i)===i) && (i>=-0x1fffffffffffff) && (i<=0x1fffffffffffff)) return i;
    rtl.raiseE('EIntOverflow');
  },

  rc: function(i,minval,maxval){
    // range check integer
    if ((Math.floor(i)===i) && (i>=minval) && (i<=maxval)) return i;
    rtl.raiseE('ERangeError');
  },

  rcc: function(c,minval,maxval){
    // range check char
    if ((typeof(c)==='string') && (c.length===1)){
      var i = c.charCodeAt(0);
      if ((i>=minval) && (i<=maxval)) return c;
    }
    rtl.raiseE('ERangeError');
  },

  rcSetCharAt: function(s,index,c){
    // range check setCharAt
    if ((typeof(s)!=='string') || (index<0) || (index>=s.length)) rtl.raiseE('ERangeError');
    return rtl.setCharAt(s,index,c);
  },

  rcCharAt: function(s,index){
    // range check charAt
    if ((typeof(s)!=='string') || (index<0) || (index>=s.length)) rtl.raiseE('ERangeError');
    return s.charAt(index);
  },

  rcArrR: function(arr,index){
    // range check read array
    if (Array.isArray(arr) && (typeof(index)==='number') && (index>=0) && (index<arr.length)){
      if (arguments.length>2){
        // arr,index1,index2,...
        arr=arr[index];
        for (var i=2; i<arguments.length; i++) arr=rtl.rcArrR(arr,arguments[i]);
        return arr;
      }
      return arr[index];
    }
    rtl.raiseE('ERangeError');
  },

  rcArrW: function(arr,index,value){
    // range check write array
    // arr,index1,index2,...,value
    for (var i=3; i<arguments.length; i++){
      arr=rtl.rcArrR(arr,index);
      index=arguments[i-1];
      value=arguments[i];
    }
    if (Array.isArray(arr) && (typeof(index)==='number') && (index>=0) && (index<arr.length)){
      return arr[index]=value;
    }
    rtl.raiseE('ERangeError');
  },

  length: function(arr){
    return (arr == null) ? 0 : arr.length;
  },

  arrayRef: function(a){
    if (a!=null) rtl.hideProp(a,'$pas2jsrefcnt',1);
    return a;
  },

  arraySetLength: function(arr,defaultvalue,newlength){
    var stack = [];
    var s = 9999;
    for (var i=2; i<arguments.length; i++){
      var j = arguments[i];
      if (j==='s'){ s = i-2; }
      else {
        stack.push({ dim:j+0, a:null, i:0, src:null });
      }
    }
    var dimmax = stack.length-1;
    var depth = 0;
    var lastlen = 0;
    var item = null;
    var a = null;
    var src = arr;
    var srclen = 0, oldlen = 0;
    do{
      if (depth>0){
        item=stack[depth-1];
        src = (item.src && item.src.length>item.i)?item.src[item.i]:null;
      }
      if (!src){
        a = [];
        srclen = 0;
        oldlen = 0;
      } else if (src.$pas2jsrefcnt>0 || depth>=s){
        a = [];
        srclen = src.length;
        oldlen = srclen;
      } else {
        a = src;
        srclen = 0;
        oldlen = a.length;
      }
      lastlen = stack[depth].dim;
      a.length = lastlen;
      if (depth>0){
        item.a[item.i]=a;
        item.i++;
        if ((lastlen===0) && (item.i<item.a.length)) continue;
      }
      if (lastlen>0){
        if (depth<dimmax){
          item = stack[depth];
          item.a = a;
          item.i = 0;
          item.src = src;
          depth++;
          continue;
        } else {
          if (srclen>lastlen) srclen=lastlen;
          if (rtl.isArray(defaultvalue)){
            // array of dyn array
            for (var i=0; i<srclen; i++) a[i]=src[i];
            for (var i=oldlen; i<lastlen; i++) a[i]=[];
          } else if (rtl.isObject(defaultvalue)) {
            if (rtl.isTRecord(defaultvalue)){
              // array of record
              for (var i=0; i<srclen; i++) a[i]=defaultvalue.$clone(src[i]);
              for (var i=oldlen; i<lastlen; i++) a[i]=defaultvalue.$new();
            } else {
              // array of set
              for (var i=0; i<srclen; i++) a[i]=rtl.refSet(src[i]);
              for (var i=oldlen; i<lastlen; i++) a[i]={};
            }
          } else {
            for (var i=0; i<srclen; i++) a[i]=src[i];
            for (var i=oldlen; i<lastlen; i++) a[i]=defaultvalue;
          }
        }
      }
      // backtrack
      while ((depth>0) && (stack[depth-1].i>=stack[depth-1].dim)){
        depth--;
      };
      if (depth===0){
        if (dimmax===0) return a;
        return stack[0].a;
      }
    }while (true);
  },

  arrayEq: function(a,b){
    if (a===null) return b===null;
    if (b===null) return false;
    if (a.length!==b.length) return false;
    for (var i=0; i<a.length; i++) if (a[i]!==b[i]) return false;
    return true;
  },

  arrayClone: function(type,src,srcpos,endpos,dst,dstpos){
    // type: 0 for references, "refset" for calling refSet(), a function for new type()
    // src must not be null
    // This function does not range check.
    if(type === 'refSet') {
      for (; srcpos<endpos; srcpos++) dst[dstpos++] = rtl.refSet(src[srcpos]); // ref set
    } else if (rtl.isTRecord(type)){
      for (; srcpos<endpos; srcpos++) dst[dstpos++] = type.$clone(src[srcpos]); // clone record
    }  else {
      for (; srcpos<endpos; srcpos++) dst[dstpos++] = src[srcpos]; // reference
    };
  },

  arrayConcat: function(type){
    // type: see rtl.arrayClone
    var a = [];
    var l = 0;
    for (var i=1; i<arguments.length; i++){
      var src = arguments[i];
      if (src !== null) l+=src.length;
    };
    a.length = l;
    l=0;
    for (var i=1; i<arguments.length; i++){
      var src = arguments[i];
      if (src === null) continue;
      rtl.arrayClone(type,src,0,src.length,a,l);
      l+=src.length;
    };
    return a;
  },

  arrayConcatN: function(){
    var a = null;
    for (var i=0; i<arguments.length; i++){
      var src = arguments[i];
      if (src === null) continue;
      if (a===null){
        a=rtl.arrayRef(src); // Note: concat(a) does not clone
      } else {
        a=a.concat(src);
      }
    };
    return a;
  },

  arrayCopy: function(type, srcarray, index, count){
    // type: see rtl.arrayClone
    // if count is missing, use srcarray.length
    if (srcarray === null) return [];
    if (index < 0) index = 0;
    if (count === undefined) count=srcarray.length;
    var end = index+count;
    if (end>srcarray.length) end = srcarray.length;
    if (index>=end) return [];
    if (type===0){
      return srcarray.slice(index,end);
    } else {
      var a = [];
      a.length = end-index;
      rtl.arrayClone(type,srcarray,index,end,a,0);
      return a;
    }
  },

  arrayInsert: function(item, arr, index){
    if (arr){
      arr.splice(index,0,item);
      return arr;
    } else {
      return [item];
    }
  },

  setCharAt: function(s,index,c){
    return s.substr(0,index)+c+s.substr(index+1);
  },

  getResStr: function(mod,name){
    var rs = mod.$resourcestrings[name];
    return rs.current?rs.current:rs.org;
  },

  createSet: function(){
    var s = {};
    for (var i=0; i<arguments.length; i++){
      if (arguments[i]!=null){
        s[arguments[i]]=true;
      } else {
        var first=arguments[i+=1];
        var last=arguments[i+=1];
        for(var j=first; j<=last; j++) s[j]=true;
      }
    }
    return s;
  },

  cloneSet: function(s){
    var r = {};
    for (var key in s) r[key]=true;
    return r;
  },

  refSet: function(s){
    rtl.hideProp(s,'$shared',true);
    return s;
  },

  includeSet: function(s,enumvalue){
    if (s.$shared) s = rtl.cloneSet(s);
    s[enumvalue] = true;
    return s;
  },

  excludeSet: function(s,enumvalue){
    if (s.$shared) s = rtl.cloneSet(s);
    delete s[enumvalue];
    return s;
  },

  diffSet: function(s,t){
    var r = {};
    for (var key in s) if (!t[key]) r[key]=true;
    return r;
  },

  unionSet: function(s,t){
    var r = {};
    for (var key in s) r[key]=true;
    for (var key in t) r[key]=true;
    return r;
  },

  intersectSet: function(s,t){
    var r = {};
    for (var key in s) if (t[key]) r[key]=true;
    return r;
  },

  symDiffSet: function(s,t){
    var r = {};
    for (var key in s) if (!t[key]) r[key]=true;
    for (var key in t) if (!s[key]) r[key]=true;
    return r;
  },

  eqSet: function(s,t){
    for (var key in s) if (!t[key]) return false;
    for (var key in t) if (!s[key]) return false;
    return true;
  },

  neSet: function(s,t){
    return !rtl.eqSet(s,t);
  },

  leSet: function(s,t){
    for (var key in s) if (!t[key]) return false;
    return true;
  },

  geSet: function(s,t){
    for (var key in t) if (!s[key]) return false;
    return true;
  },

  strSetLength: function(s,newlen){
    var oldlen = s.length;
    if (oldlen > newlen){
      return s.substring(0,newlen);
    } else if (s.repeat){
      // Note: repeat needs ECMAScript6!
      return s+' '.repeat(newlen-oldlen);
    } else {
       while (oldlen<newlen){
         s+=' ';
         oldlen++;
       };
       return s;
    }
  },

  spaceLeft: function(s,width){
    var l=s.length;
    if (l>=width) return s;
    if (s.repeat){
      // Note: repeat needs ECMAScript6!
      return ' '.repeat(width-l) + s;
    } else {
      while (l<width){
        s=' '+s;
        l++;
      };
      return s;
    };
  },

  floatToStr: function(d,w,p){
    // input 1-3 arguments: double, width, precision
    if (arguments.length>2){
      return rtl.spaceLeft(d.toFixed(p),w);
    } else {
	  // exponent width
	  var pad = "";
	  var ad = Math.abs(d);
	  if (((ad>1) && (ad<1.0e+10)) ||  ((ad>1.e-10) && (ad<1))) {
		pad='00';
	  } else if ((ad>1) && (ad<1.0e+100) || (ad<1.e-10)) {
		pad='0';
      }  	
	  if (arguments.length<2) {
	    w=24;		
      } else if (w<9) {
		w=9;
      }		  
      var p = w-8;
      var s=(d>0 ? " " : "" ) + d.toExponential(p);
      s=s.replace(/e(.)/,'E$1'+pad);
      return rtl.spaceLeft(s,w);
    }
  },

  valEnum: function(s, enumType, setCodeFn){
    s = s.toLowerCase();
    for (var key in enumType){
      if((typeof(key)==='string') && (key.toLowerCase()===s)){
        setCodeFn(0);
        return enumType[key];
      }
    }
    setCodeFn(1);
    return 0;
  },

  lw: function(l){
    // fix longword bitwise operation
    return l<0?l+0x100000000:l;
  },

  and: function(a,b){
    var hi = 0x80000000;
    var low = 0x7fffffff;
    var h = (a / hi) & (b / hi);
    var l = (a & low) & (b & low);
    return h*hi + l;
  },

  or: function(a,b){
    var hi = 0x80000000;
    var low = 0x7fffffff;
    var h = (a / hi) | (b / hi);
    var l = (a & low) | (b & low);
    return h*hi + l;
  },

  xor: function(a,b){
    var hi = 0x80000000;
    var low = 0x7fffffff;
    var h = (a / hi) ^ (b / hi);
    var l = (a & low) ^ (b & low);
    return h*hi + l;
  },

  shr: function(a,b){
    if (a<0) a += rtl.hiInt;
    if (a<0x80000000) return a >> b;
    if (b<=0) return a;
    if (b>54) return 0;
    return Math.floor(a / Math.pow(2,b));
  },

  shl: function(a,b){
    if (a<0) a += rtl.hiInt;
    if (b<=0) return a;
    if (b>54) return 0;
    var r = a * Math.pow(2,b);
    if (r <= rtl.hiInt) return r;
    return r % rtl.hiInt;
  },

  initRTTI: function(){
    if (rtl.debug_rtti) rtl.debug('initRTTI');

    // base types
    rtl.tTypeInfo = { name: "tTypeInfo", kind: 0, $module: null, attr: null };
    function newBaseTI(name,kind,ancestor){
      if (!ancestor) ancestor = rtl.tTypeInfo;
      if (rtl.debug_rtti) rtl.debug('initRTTI.newBaseTI "'+name+'" '+kind+' ("'+ancestor.name+'")');
      var t = Object.create(ancestor);
      t.name = name;
      t.kind = kind;
      rtl[name] = t;
      return t;
    };
    function newBaseInt(name,minvalue,maxvalue,ordtype){
      var t = newBaseTI(name,1 /* tkInteger */,rtl.tTypeInfoInteger);
      t.minvalue = minvalue;
      t.maxvalue = maxvalue;
      t.ordtype = ordtype;
      return t;
    };
    newBaseTI("tTypeInfoInteger",1 /* tkInteger */);
    newBaseInt("shortint",-0x80,0x7f,0);
    newBaseInt("byte",0,0xff,1);
    newBaseInt("smallint",-0x8000,0x7fff,2);
    newBaseInt("word",0,0xffff,3);
    newBaseInt("longint",-0x80000000,0x7fffffff,4);
    newBaseInt("longword",0,0xffffffff,5);
    newBaseInt("nativeint",-0x10000000000000,0xfffffffffffff,6);
    newBaseInt("nativeuint",0,0xfffffffffffff,7);
    newBaseTI("char",2 /* tkChar */);
    newBaseTI("string",3 /* tkString */);
    newBaseTI("tTypeInfoEnum",4 /* tkEnumeration */,rtl.tTypeInfoInteger);
    newBaseTI("tTypeInfoSet",5 /* tkSet */);
    newBaseTI("double",6 /* tkDouble */);
    newBaseTI("boolean",7 /* tkBool */);
    newBaseTI("tTypeInfoProcVar",8 /* tkProcVar */);
    newBaseTI("tTypeInfoMethodVar",9 /* tkMethod */,rtl.tTypeInfoProcVar);
    newBaseTI("tTypeInfoArray",10 /* tkArray */);
    newBaseTI("tTypeInfoDynArray",11 /* tkDynArray */);
    newBaseTI("tTypeInfoPointer",15 /* tkPointer */);
    var t = newBaseTI("pointer",15 /* tkPointer */,rtl.tTypeInfoPointer);
    t.reftype = null;
    newBaseTI("jsvalue",16 /* tkJSValue */);
    newBaseTI("tTypeInfoRefToProcVar",17 /* tkRefToProcVar */,rtl.tTypeInfoProcVar);

    // member kinds
    rtl.tTypeMember = { attr: null };
    function newMember(name,kind){
      var m = Object.create(rtl.tTypeMember);
      m.name = name;
      m.kind = kind;
      rtl[name] = m;
    };
    newMember("tTypeMemberField",1); // tmkField
    newMember("tTypeMemberMethod",2); // tmkMethod
    newMember("tTypeMemberProperty",3); // tmkProperty

    // base object for storing members: a simple object
    rtl.tTypeMembers = {};

    // tTypeInfoStruct - base object for tTypeInfoClass, tTypeInfoRecord, tTypeInfoInterface
    var tis = newBaseTI("tTypeInfoStruct",0);
    tis.$addMember = function(name,ancestor,options){
      if (rtl.debug_rtti){
        if (!rtl.hasString(name) || (name.charAt()==='$')) throw 'invalid member "'+name+'", this="'+this.name+'"';
        if (!rtl.is(ancestor,rtl.tTypeMember)) throw 'invalid ancestor "'+ancestor+':'+ancestor.name+'", "'+this.name+'.'+name+'"';
        if ((options!=undefined) && (typeof(options)!='object')) throw 'invalid options "'+options+'", "'+this.name+'.'+name+'"';
      };
      var t = Object.create(ancestor);
      t.name = name;
      this.members[name] = t;
      this.names.push(name);
      if (rtl.isObject(options)){
        for (var key in options) if (options.hasOwnProperty(key)) t[key] = options[key];
      };
      return t;
    };
    tis.addField = function(name,type,options){
      var t = this.$addMember(name,rtl.tTypeMemberField,options);
      if (rtl.debug_rtti){
        if (!rtl.is(type,rtl.tTypeInfo)) throw 'invalid type "'+type+'", "'+this.name+'.'+name+'"';
      };
      t.typeinfo = type;
      this.fields.push(name);
      return t;
    };
    tis.addFields = function(){
      var i=0;
      while(i<arguments.length){
        var name = arguments[i++];
        var type = arguments[i++];
        if ((i<arguments.length) && (typeof(arguments[i])==='object')){
          this.addField(name,type,arguments[i++]);
        } else {
          this.addField(name,type);
        };
      };
    };
    tis.addMethod = function(name,methodkind,params,result,flags,options){
      var t = this.$addMember(name,rtl.tTypeMemberMethod,options);
      t.methodkind = methodkind;
      t.procsig = rtl.newTIProcSig(params,result,flags);
      this.methods.push(name);
      return t;
    };
    tis.addProperty = function(name,flags,result,getter,setter,options){
      var t = this.$addMember(name,rtl.tTypeMemberProperty,options);
      t.flags = flags;
      t.typeinfo = result;
      t.getter = getter;
      t.setter = setter;
      // Note: in options: params, stored, defaultvalue
      t.params = rtl.isArray(t.params) ? rtl.newTIParams(t.params) : null;
      this.properties.push(name);
      if (!rtl.isString(t.stored)) t.stored = "";
      return t;
    };
    tis.getField = function(index){
      return this.members[this.fields[index]];
    };
    tis.getMethod = function(index){
      return this.members[this.methods[index]];
    };
    tis.getProperty = function(index){
      return this.members[this.properties[index]];
    };

    newBaseTI("tTypeInfoRecord",12 /* tkRecord */,rtl.tTypeInfoStruct);
    newBaseTI("tTypeInfoClass",13 /* tkClass */,rtl.tTypeInfoStruct);
    newBaseTI("tTypeInfoClassRef",14 /* tkClassRef */);
    newBaseTI("tTypeInfoInterface",18 /* tkInterface */,rtl.tTypeInfoStruct);
    newBaseTI("tTypeInfoHelper",19 /* tkHelper */,rtl.tTypeInfoStruct);
    newBaseTI("tTypeInfoExtClass",20 /* tkExtClass */,rtl.tTypeInfoClass);
  },

  tSectionRTTI: {
    $module: null,
    $inherited: function(name,ancestor,o){
      if (rtl.debug_rtti){
        rtl.debug('tSectionRTTI.newTI "'+(this.$module?this.$module.$name:"(no module)")
          +'"."'+name+'" ('+ancestor.name+') '+(o?'init':'forward'));
      };
      var t = this[name];
      if (t){
        if (!t.$forward) throw 'duplicate type "'+name+'"';
        if (!ancestor.isPrototypeOf(t)) throw 'typeinfo ancestor mismatch "'+name+'" ancestor="'+ancestor.name+'" t.name="'+t.name+'"';
      } else {
        t = Object.create(ancestor);
        t.name = name;
        t.$module = this.$module;
        this[name] = t;
      }
      if (o){
        delete t.$forward;
        for (var key in o) if (o.hasOwnProperty(key)) t[key]=o[key];
      } else {
        t.$forward = true;
      }
      return t;
    },
    $Scope: function(name,ancestor,o){
      var t=this.$inherited(name,ancestor,o);
      t.members = {};
      t.names = [];
      t.fields = [];
      t.methods = [];
      t.properties = [];
      return t;
    },
    $TI: function(name,kind,o){ var t=this.$inherited(name,rtl.tTypeInfo,o); t.kind = kind; return t; },
    $Int: function(name,o){ return this.$inherited(name,rtl.tTypeInfoInteger,o); },
    $Enum: function(name,o){ return this.$inherited(name,rtl.tTypeInfoEnum,o); },
    $Set: function(name,o){ return this.$inherited(name,rtl.tTypeInfoSet,o); },
    $StaticArray: function(name,o){ return this.$inherited(name,rtl.tTypeInfoArray,o); },
    $DynArray: function(name,o){ return this.$inherited(name,rtl.tTypeInfoDynArray,o); },
    $ProcVar: function(name,o){ return this.$inherited(name,rtl.tTypeInfoProcVar,o); },
    $RefToProcVar: function(name,o){ return this.$inherited(name,rtl.tTypeInfoRefToProcVar,o); },
    $MethodVar: function(name,o){ return this.$inherited(name,rtl.tTypeInfoMethodVar,o); },
    $Record: function(name,o){ return this.$Scope(name,rtl.tTypeInfoRecord,o); },
    $Class: function(name,o){ return this.$Scope(name,rtl.tTypeInfoClass,o); },
    $ClassRef: function(name,o){ return this.$inherited(name,rtl.tTypeInfoClassRef,o); },
    $Pointer: function(name,o){ return this.$inherited(name,rtl.tTypeInfoPointer,o); },
    $Interface: function(name,o){ return this.$Scope(name,rtl.tTypeInfoInterface,o); },
    $Helper: function(name,o){ return this.$Scope(name,rtl.tTypeInfoHelper,o); },
    $ExtClass: function(name,o){ return this.$Scope(name,rtl.tTypeInfoExtClass,o); }
  },

  newTIParam: function(param){
    // param is an array, 0=name, 1=type, 2=optional flags
    var t = {
      name: param[0],
      typeinfo: param[1],
      flags: (rtl.isNumber(param[2]) ? param[2] : 0)
    };
    return t;
  },

  newTIParams: function(list){
    // list: optional array of [paramname,typeinfo,optional flags]
    var params = [];
    if (rtl.isArray(list)){
      for (var i=0; i<list.length; i++) params.push(rtl.newTIParam(list[i]));
    };
    return params;
  },

  newTIProcSig: function(params,result,flags){
    var s = {
      params: rtl.newTIParams(params),
      resulttype: result?result:null,
      flags: flags?flags:0
    };
    return s;
  },

  addResource: function(aRes){
    rtl.$res[aRes.name]=aRes;
  },

  getResource: function(aName){
    var res = rtl.$res[aName];
    if (res !== undefined) {
      return res;
    } else {
      return null;
    }
  },

  getResourceList: function(){
    return Object.keys(rtl.$res);
  }
}

rtl.module("System",[],function () {
  "use strict";
  var $mod = this;
  var $impl = $mod.$impl;
  this.LineEnding = "\n";
  this.sLineBreak = this.LineEnding;
  this.PathDelim = "\/";
  this.$rtti.$Set("AllowDirectorySeparators$a",{comptype: rtl.char});
  this.AllowDirectorySeparators = rtl.createSet(47);
  this.$rtti.$Set("AllowDriveSeparators$a",{comptype: rtl.char});
  this.AllowDriveSeparators = rtl.createSet(58);
  this.ExtensionSeparator = ".";
  this.MaxSmallint = 32767;
  this.MinSmallint = -32768;
  this.MaxShortInt = 127;
  this.MinShortInt = -128;
  this.MaxByte = 0xFF;
  this.MaxWord = 0xFFFF;
  this.MaxLongint = 0x7fffffff;
  this.MaxCardinal = 0xffffffff;
  this.Maxint = 2147483647;
  this.IsMultiThread = false;
  this.$rtti.$inherited("Real",rtl.double,{});
  this.$rtti.$inherited("Extended",rtl.double,{});
  this.$rtti.$inherited("TDateTime",rtl.double,{});
  this.$rtti.$inherited("TTime",this.$rtti["TDateTime"],{});
  this.$rtti.$inherited("TDate",this.$rtti["TDateTime"],{});
  this.$rtti.$inherited("Int64",rtl.nativeint,{});
  this.$rtti.$inherited("UInt64",rtl.nativeuint,{});
  this.$rtti.$inherited("QWord",rtl.nativeuint,{});
  this.$rtti.$inherited("Single",rtl.double,{});
  this.$rtti.$inherited("Comp",rtl.nativeint,{});
  this.$rtti.$inherited("WideString",rtl.string,{});
  this.TTextLineBreakStyle = {"0": "tlbsLF", tlbsLF: 0, "1": "tlbsCRLF", tlbsCRLF: 1, "2": "tlbsCR", tlbsCR: 2};
  this.$rtti.$Enum("TTextLineBreakStyle",{minvalue: 0, maxvalue: 2, ordtype: 1, enumtype: this.TTextLineBreakStyle});
  this.TCompareOption = {"0": "coIgnoreCase", coIgnoreCase: 0};
  this.$rtti.$Enum("TCompareOption",{minvalue: 0, maxvalue: 0, ordtype: 1, enumtype: this.TCompareOption});
  this.$rtti.$Set("TCompareOptions",{comptype: this.$rtti["TCompareOption"]});
  rtl.recNewT(this,"TGuid",function () {
    this.D1 = 0;
    this.D2 = 0;
    this.D3 = 0;
    this.$new = function () {
      var r = Object.create(this);
      r.D4 = rtl.arraySetLength(null,0,8);
      return r;
    };
    this.$eq = function (b) {
      return (this.D1 === b.D1) && (this.D2 === b.D2) && (this.D3 === b.D3) && rtl.arrayEq(this.D4,b.D4);
    };
    this.$assign = function (s) {
      this.D1 = s.D1;
      this.D2 = s.D2;
      this.D3 = s.D3;
      this.D4 = s.D4.slice(0);
      return this;
    };
    var $r = $mod.$rtti.$Record("TGuid",{});
    $r.addField("D1",rtl.longword);
    $r.addField("D2",rtl.word);
    $r.addField("D3",rtl.word);
    $mod.$rtti.$StaticArray("TGuid.D4$a",{dims: [8], eltype: rtl.byte});
    $r.addField("D4",$mod.$rtti["TGuid.D4$a"]);
  });
  this.$rtti.$inherited("TGUIDString",rtl.string,{});
  this.$rtti.$inherited("PMethod",{comptype: this.$rtti["TMethod"]});
  rtl.recNewT(this,"TMethod",function () {
    this.Code = null;
    this.Data = null;
    this.$eq = function (b) {
      return (this.Code === b.Code) && (this.Data === b.Data);
    };
    this.$assign = function (s) {
      this.Code = s.Code;
      this.Data = s.Data;
      return this;
    };
    var $r = $mod.$rtti.$Record("TMethod",{});
    $r.addField("Code",rtl.pointer);
    $r.addField("Data",rtl.pointer);
  });
  this.$rtti.$Class("TObject");
  this.$rtti.$ClassRef("TClass",{instancetype: this.$rtti["TObject"]});
  rtl.createClass(this,"TObject",null,function () {
    this.$init = function () {
    };
    this.$final = function () {
    };
    this.Create = function () {
      return this;
    };
    this.Destroy = function () {
    };
    this.Free = function () {
      this.$destroy("Destroy");
    };
    this.ClassType = function () {
      return this;
    };
    this.ClassNameIs = function (Name) {
      var Result = false;
      Result = $impl.SameText(Name,this.$classname);
      return Result;
    };
    this.InheritsFrom = function (aClass) {
      return (aClass!=null) && ((this==aClass) || aClass.isPrototypeOf(this));
    };
    this.MethodName = function (aCode) {
      var Result = "";
      Result = "";
      if (aCode === null) return Result;
      if (typeof(aCode)!=='function') return "";
      var i = 0;
      var TI = this.$rtti;
      if (rtl.isObject(aCode.scope)){
        // callback
        if (typeof aCode.fn === "string") return aCode.fn;
        aCode = aCode.fn;
      }
      // Not a callback, check rtti
      while ((Result === "") && (TI != null)) {
        i = 0;
        while ((Result === "") && (i < TI.methods.length)) {
          if (this[TI.getMethod(i).name] === aCode)
            Result=TI.getMethod(i).name;
          i += 1;
        };
        if (Result === "") TI = TI.ancestor;
      };
      // return Result;
      return Result;
    };
    this.MethodAddress = function (aName) {
      var Result = null;
      Result = null;
      if (aName === "") return Result;
      var i = 0;
        var TI = this.$rtti;
        var N = "";
        var MN = "";
        N = aName.toLowerCase();
        while ((MN === "") && (TI != null)) {
          i = 0;
          while ((MN === "") && (i < TI.methods.length)) {
            if (TI.getMethod(i).name.toLowerCase() === N) MN = TI.getMethod(i).name;
            i += 1;
          };
          if (MN === "") TI = TI.ancestor;
        };
        if (MN !== "") Result = this[MN];
      //  return Result;
      return Result;
    };
    this.FieldAddress = function (aName) {
      var Result = null;
      Result = null;
      if (aName === "") return Result;
      var aClass = this.$class;
      var ClassTI = null;
      var myName = aName.toLowerCase();
      var MemberTI = null;
      while (aClass !== null) {
        ClassTI = aClass.$rtti;
        for (var i = 0, $end2 = ClassTI.fields.length - 1; i <= $end2; i++) {
          MemberTI = ClassTI.getField(i);
          if (MemberTI.name.toLowerCase() === myName) {
             return MemberTI;
          };
        };
        aClass = aClass.$ancestor ? aClass.$ancestor : null;
      };
      return Result;
    };
    this.ClassInfo = function () {
      var Result = null;
      Result = this.$rtti;
      return Result;
    };
    this.QualifiedClassName = function () {
      var Result = "";
      Result = this.$module.$name + "." + this.$classname;
      return Result;
    };
    this.AfterConstruction = function () {
    };
    this.BeforeDestruction = function () {
    };
    this.Dispatch = function (aMessage) {
      var aClass = null;
      var Id = undefined;
      if (!rtl.isObject(aMessage)) return;
      Id = aMessage["Msg"];
      if (!rtl.isNumber(Id)) return;
      aClass = this.$class.ClassType();
      while (aClass !== null) {
        var Handlers = aClass.$msgint;
        if (rtl.isObject(Handlers) && Handlers.hasOwnProperty(Id)){
          this[Handlers[Id]](aMessage);
          return;
        };
        aClass = aClass.$ancestor;
      };
      this.DefaultHandler(aMessage);
    };
    this.DispatchStr = function (aMessage) {
      var aClass = null;
      var Id = undefined;
      if (!rtl.isObject(aMessage)) return;
      Id = aMessage["MsgStr"];
      if (!rtl.isString(Id)) return;
      aClass = this.$class.ClassType();
      while (aClass !== null) {
        var Handlers = aClass.$msgstr;
        if (rtl.isObject(Handlers) && Handlers.hasOwnProperty(Id)){
          this[Handlers[Id]](aMessage);
          return;
        };
        aClass = aClass.$ancestor;
      };
      this.DefaultHandlerStr(aMessage);
    };
    this.DefaultHandler = function (aMessage) {
      if (aMessage) ;
    };
    this.DefaultHandlerStr = function (aMessage) {
      if (aMessage) ;
    };
    this.GetInterface = function (iid, obj) {
      var Result = false;
      var i = iid.$intf;
      if (i){
        // iid is the private TGuid of an interface
        i = rtl.getIntfG(this,i.$guid,2);
        if (i){
          obj.set(i);
          return true;
        }
      };
      Result = this.GetInterfaceByStr(rtl.guidrToStr(iid),obj);
      return Result;
    };
    this.GetInterface$1 = function (iidstr, obj) {
      var Result = false;
      Result = this.GetInterfaceByStr(iidstr,obj);
      return Result;
    };
    this.GetInterfaceByStr = function (iidstr, obj) {
      var Result = false;
      Result = false;
      if (!$mod.IObjectInstance["$str"]) $mod.IObjectInstance["$str"] = rtl.guidrToStr($mod.IObjectInstance);
      if (iidstr == $mod.IObjectInstance["$str"]) {
        obj.set(this);
        return true;
      };
      var i = rtl.getIntfG(this,iidstr,2);
      obj.set(i);
      Result=(i!==null);
      return Result;
    };
    this.GetInterfaceWeak = function (iid, obj) {
      var Result = false;
      Result = this.GetInterface(iid,obj);
      if (Result){
        var o = obj.get();
        if (o.$kind==='com'){
          o._Release();
        }
      };
      return Result;
    };
    this.Equals = function (Obj) {
      var Result = false;
      Result = Obj === this;
      return Result;
    };
    this.ToString = function () {
      var Result = "";
      Result = this.$classname;
      return Result;
    };
  });
  rtl.createClass(this,"TCustomAttribute",this.TObject,function () {
  });
  this.$rtti.$DynArray("TCustomAttributeArray",{eltype: this.$rtti["TCustomAttribute"]});
  this.S_OK = 0;
  this.S_FALSE = 1;
  this.E_NOINTERFACE = -2147467262;
  this.E_UNEXPECTED = -2147418113;
  this.E_NOTIMPL = -2147467263;
  rtl.createInterface(this,"IUnknown","{00000000-0000-0000-C000-000000000046}",["QueryInterface","_AddRef","_Release"],null,function () {
    this.$kind = "com";
    var $r = this.$rtti;
    $r.addMethod("QueryInterface",1,[["iid",$mod.$rtti["TGuid"],2],["obj",null,4]],rtl.longint);
    $r.addMethod("_AddRef",1,[],rtl.longint);
    $r.addMethod("_Release",1,[],rtl.longint);
  });
  rtl.createInterface(this,"IInvokable","{88387EF6-BCEE-3E17-9E85-5D491ED4FC10}",[],this.IUnknown,function () {
  });
  rtl.createInterface(this,"IEnumerator","{ECEC7568-4E50-30C9-A2F0-439342DE2ADB}",["GetCurrent","MoveNext","Reset"],this.IUnknown,function () {
    var $r = this.$rtti;
    $r.addMethod("GetCurrent",1,[],$mod.$rtti["TObject"]);
    $r.addMethod("MoveNext",1,[],rtl.boolean);
    $r.addMethod("Reset",0,[]);
    $r.addProperty("Current",1,$mod.$rtti["TObject"],"GetCurrent","");
  });
  rtl.createInterface(this,"IEnumerable","{9791C368-4E51-3424-A3CE-D4911D54F385}",["GetEnumerator"],this.IUnknown,function () {
    var $r = this.$rtti;
    $r.addMethod("GetEnumerator",1,[],$mod.$rtti["IEnumerator"]);
  });
  rtl.createClass(this,"TInterfacedObject",this.TObject,function () {
    this.$init = function () {
      $mod.TObject.$init.call(this);
      this.fRefCount = 0;
    };
    this.QueryInterface = function (iid, obj) {
      var Result = 0;
      if (this.GetInterface(iid,obj)) {
        Result = 0}
       else Result = -2147467262;
      return Result;
    };
    this._AddRef = function () {
      var Result = 0;
      this.fRefCount += 1;
      Result = this.fRefCount;
      return Result;
    };
    this._Release = function () {
      var Result = 0;
      this.fRefCount -= 1;
      Result = this.fRefCount;
      if (this.fRefCount === 0) this.$destroy("Destroy");
      return Result;
    };
    this.BeforeDestruction = function () {
      if (this.fRefCount !== 0) rtl.raiseE('EHeapMemoryError');
    };
    rtl.addIntf(this,$mod.IUnknown);
  });
  this.$rtti.$ClassRef("TInterfacedClass",{instancetype: this.$rtti["TInterfacedObject"]});
  rtl.createClass(this,"TAggregatedObject",this.TObject,function () {
    this.$init = function () {
      $mod.TObject.$init.call(this);
      this.fController = null;
    };
    this.GetController = function () {
      var Result = null;
      var $ok = false;
      try {
        Result = rtl.setIntfL(Result,this.fController);
        $ok = true;
      } finally {
        if (!$ok) rtl._Release(Result);
      };
      return Result;
    };
    this.QueryInterface = function (iid, obj) {
      var Result = 0;
      Result = this.fController.QueryInterface(iid,obj);
      return Result;
    };
    this._AddRef = function () {
      var Result = 0;
      Result = this.fController._AddRef();
      return Result;
    };
    this._Release = function () {
      var Result = 0;
      Result = this.fController._Release();
      return Result;
    };
    this.Create$1 = function (aController) {
      $mod.TObject.Create.call(this);
      this.fController = aController;
      return this;
    };
  });
  rtl.createClass(this,"TContainedObject",this.TAggregatedObject,function () {
    this.QueryInterface = function (iid, obj) {
      var Result = 0;
      if (this.GetInterface(iid,obj)) {
        Result = 0}
       else Result = -2147467262;
      return Result;
    };
    rtl.addIntf(this,$mod.IUnknown);
  });
  this.IObjectInstance = this.TGuid.$clone({D1: 0xD91C9AF4, D2: 0x3C93, D3: 0x420F, D4: [0xA3,0x03,0xBF,0x5B,0xA8,0x2B,0xFD,0x23]});
  this.TTypeKind = {"0": "tkUnknown", tkUnknown: 0, "1": "tkInteger", tkInteger: 1, "2": "tkChar", tkChar: 2, "3": "tkString", tkString: 3, "4": "tkEnumeration", tkEnumeration: 4, "5": "tkSet", tkSet: 5, "6": "tkDouble", tkDouble: 6, "7": "tkBool", tkBool: 7, "8": "tkProcVar", tkProcVar: 8, "9": "tkMethod", tkMethod: 9, "10": "tkArray", tkArray: 10, "11": "tkDynArray", tkDynArray: 11, "12": "tkRecord", tkRecord: 12, "13": "tkClass", tkClass: 13, "14": "tkClassRef", tkClassRef: 14, "15": "tkPointer", tkPointer: 15, "16": "tkJSValue", tkJSValue: 16, "17": "tkRefToProcVar", tkRefToProcVar: 17, "18": "tkInterface", tkInterface: 18, "19": "tkHelper", tkHelper: 19, "20": "tkExtClass", tkExtClass: 20};
  this.$rtti.$Enum("TTypeKind",{minvalue: 0, maxvalue: 20, ordtype: 1, enumtype: this.TTypeKind});
  this.$rtti.$Set("TTypeKinds",{comptype: this.$rtti["TTypeKind"]});
  this.tkFloat = 6;
  this.tkProcedure = 8;
  this.tkAny = rtl.createSet(null,this.TTypeKind.tkUnknown,this.TTypeKind.tkExtClass);
  this.tkMethods = rtl.createSet(9);
  this.tkProperties = rtl.diffSet(rtl.diffSet(this.tkAny,this.tkMethods),rtl.createSet(0));
  this.vtInteger = 0;
  this.vtBoolean = 1;
  this.vtExtended = 3;
  this.vtPointer = 5;
  this.vtObject = 7;
  this.vtClass = 8;
  this.vtWideChar = 9;
  this.vtCurrency = 12;
  this.vtInterface = 14;
  this.vtUnicodeString = 18;
  this.vtNativeInt = 19;
  this.vtJSValue = 20;
  this.$rtti.$inherited("PVarRec",{comptype: this.$rtti["TVarRec"]});
  rtl.recNewT(this,"TVarRec",function () {
    this.VType = 0;
    this.VJSValue = undefined;
    this.$eq = function (b) {
      return (this.VType === b.VType) && (this.VJSValue === b.VJSValue) && (this.VJSValue === b.VJSValue) && (this.VJSValue === b.VJSValue) && (this.VJSValue === b.VJSValue) && (this.VJSValue === b.VJSValue) && (this.VJSValue === b.VJSValue) && (this.VJSValue === b.VJSValue) && (this.VJSValue === b.VJSValue) && (this.VJSValue === b.VJSValue) && (this.VJSValue === b.VJSValue) && (this.VJSValue === b.VJSValue) && (this.VJSValue === b.VJSValue);
    };
    this.$assign = function (s) {
      this.VType = s.VType;
      this.VJSValue = s.VJSValue;
      this.VJSValue = s.VJSValue;
      this.VJSValue = s.VJSValue;
      this.VJSValue = s.VJSValue;
      this.VJSValue = s.VJSValue;
      this.VJSValue = s.VJSValue;
      this.VJSValue = s.VJSValue;
      this.VJSValue = s.VJSValue;
      this.VJSValue = s.VJSValue;
      this.VJSValue = s.VJSValue;
      this.VJSValue = s.VJSValue;
      this.VJSValue = s.VJSValue;
      return this;
    };
    var $r = $mod.$rtti.$Record("TVarRec",{});
    $r.addField("VType",rtl.byte);
    $r.addField("VJSValue",rtl.jsvalue);
    $r.addField("VJSValue",rtl.longint);
    $r.addField("VJSValue",rtl.boolean);
    $r.addField("VJSValue",rtl.double);
    $r.addField("VJSValue",rtl.pointer);
    $r.addField("VJSValue",$mod.$rtti["TObject"]);
    $r.addField("VJSValue",$mod.$rtti["TClass"]);
    $r.addField("VJSValue",rtl.char);
    $r.addField("VJSValue",rtl.nativeint);
    $r.addField("VJSValue",rtl.pointer);
    $r.addField("VJSValue",rtl.string);
    $r.addField("VJSValue",rtl.nativeint);
  });
  this.$rtti.$DynArray("TVarRecArray",{eltype: this.$rtti["TVarRec"]});
  this.VarRecs = function () {
    var Result = [];
    var i = 0;
    var v = null;
    Result = [];
    while (i < arguments.length) {
      v = $mod.TVarRec.$new();
      v.VType = rtl.trunc(arguments[i]);
      i += 1;
      v.VJSValue = arguments[i];
      i += 1;
      Result.push($mod.TVarRec.$clone(v));
    };
    return Result;
  };
  this.IsConsole = false;
  this.FirstDotAtFileNameStartIsExtension = false;
  this.$rtti.$ProcVar("TOnParamCount",{procsig: rtl.newTIProcSig([],rtl.longint)});
  this.$rtti.$ProcVar("TOnParamStr",{procsig: rtl.newTIProcSig([["Index",rtl.longint]],rtl.string)});
  this.OnParamCount = null;
  this.OnParamStr = null;
  this.ParamCount = function () {
    var Result = 0;
    if ($mod.OnParamCount != null) {
      Result = $mod.OnParamCount()}
     else Result = 0;
    return Result;
  };
  this.ParamStr = function (Index) {
    var Result = "";
    if ($mod.OnParamStr != null) {
      Result = $mod.OnParamStr(Index)}
     else if (Index === 0) {
      Result = "js"}
     else Result = "";
    return Result;
  };
  this.Frac = function (A) {
    return A % 1;
  };
  this.Odd = function (A) {
    return A&1 != 0;
  };
  this.Random = function (Range) {
    return Math.floor(Math.random()*Range);
  };
  this.Sqr = function (A) {
    return A*A;
  };
  this.Sqr$1 = function (A) {
    return A*A;
  };
  this.Trunc = function (A) {
    if (!Math.trunc) {
      Math.trunc = function(v) {
        v = +v;
        if (!isFinite(v)) return v;
        return (v - v % 1) || (v < 0 ? -0 : v === 0 ? v : 0);
      };
    }
    $mod.Trunc = Math.trunc;
    return Math.trunc(A);
  };
  this.DefaultTextLineBreakStyle = 0;
  this.Int = function (A) {
    var Result = 0.0;
    Result = $mod.Trunc(A);
    return Result;
  };
  this.Copy = function (S, Index, Size) {
    if (Index<1) Index = 1;
    return (Size>0) ? S.substring(Index-1,Index+Size-1) : "";
  };
  this.Copy$1 = function (S, Index) {
    if (Index<1) Index = 1;
    return S.substr(Index-1);
  };
  this.Delete = function (S, Index, Size) {
    var h = "";
    if ((Index < 1) || (Index > S.get().length) || (Size <= 0)) return;
    h = S.get();
    S.set($mod.Copy(h,1,Index - 1) + $mod.Copy$1(h,Index + Size));
  };
  this.Pos = function (Search, InString) {
    return InString.indexOf(Search)+1;
  };
  this.Pos$1 = function (Search, InString, StartAt) {
    return InString.indexOf(Search,StartAt-1)+1;
  };
  this.Insert = function (Insertion, Target, Index) {
    var t = "";
    if (Insertion === "") return;
    t = Target.get();
    if (Index < 1) {
      Target.set(Insertion + t)}
     else if (Index > t.length) {
      Target.set(t + Insertion)}
     else Target.set($mod.Copy(t,1,Index - 1) + Insertion + $mod.Copy(t,Index,t.length));
  };
  this.upcase = function (c) {
    return c.toUpperCase();
  };
  this.binstr = function (val, cnt) {
    var Result = "";
    var i = 0;
    Result = rtl.strSetLength(Result,cnt);
    for (var $l = cnt; $l >= 1; $l--) {
      i = $l;
      Result = rtl.setCharAt(Result,i - 1,String.fromCharCode(48 + (val & 1)));
      val = Math.floor(val / 2);
    };
    return Result;
  };
  this.val = function (S, NI, Code) {
    NI.set($impl.valint(S,-9007199254740991,9007199254740991,Code));
  };
  this.val$1 = function (S, NI, Code) {
    var x = 0.0;
    if (S === "") {
      Code.set(1);
      return;
    };
    x = Number(S);
    if (isNaN(x) || (x !== $mod.Int(x)) || (x < 0)) {
      Code.set(1)}
     else {
      Code.set(0);
      NI.set($mod.Trunc(x));
    };
  };
  this.val$2 = function (S, SI, Code) {
    SI.set($impl.valint(S,-128,127,Code));
  };
  this.val$3 = function (S, B, Code) {
    B.set($impl.valint(S,0,255,Code));
  };
  this.val$4 = function (S, SI, Code) {
    SI.set($impl.valint(S,-32768,32767,Code));
  };
  this.val$5 = function (S, W, Code) {
    W.set($impl.valint(S,0,65535,Code));
  };
  this.val$6 = function (S, I, Code) {
    I.set($impl.valint(S,-2147483648,2147483647,Code));
  };
  this.val$7 = function (S, C, Code) {
    C.set($impl.valint(S,0,4294967295,Code));
  };
  this.val$8 = function (S, d, Code) {
    var x = 0.0;
    if (S === "") {
      Code.set(1);
      return;
    };
    x = Number(S);
    if (isNaN(x)) {
      Code.set(1)}
     else {
      Code.set(0);
      d.set(x);
    };
  };
  this.val$9 = function (S, b, Code) {
    if ($impl.SameText(S,"true")) {
      Code.set(0);
      b.set(true);
    } else if ($impl.SameText(S,"false")) {
      Code.set(0);
      b.set(false);
    } else Code.set(1);
  };
  this.StringOfChar = function (c, l) {
    var Result = "";
    var i = 0;
    if ((l>0) && c.repeat) return c.repeat(l);
    Result = "";
    for (var $l = 1, $end = l; $l <= $end; $l++) {
      i = $l;
      Result = Result + c;
    };
    return Result;
  };
  this.Write = function () {
    var i = 0;
    for (var $l = 0, $end = arguments.length - 1; $l <= $end; $l++) {
      i = $l;
      if ($impl.WriteCallBack != null) {
        $impl.WriteCallBack(arguments[i],false)}
       else $impl.WriteBuf = $impl.WriteBuf + ("" + arguments[i]);
    };
  };
  this.Writeln = function () {
    var i = 0;
    var l = 0;
    var s = "";
    l = arguments.length - 1;
    if ($impl.WriteCallBack != null) {
      for (var $l = 0, $end = l; $l <= $end; $l++) {
        i = $l;
        $impl.WriteCallBack(arguments[i],i === l);
      };
    } else {
      s = $impl.WriteBuf;
      for (var $l1 = 0, $end1 = l; $l1 <= $end1; $l1++) {
        i = $l1;
        s = s + ("" + arguments[i]);
      };
      console.log(s);
      $impl.WriteBuf = "";
    };
  };
  this.$rtti.$ProcVar("TConsoleHandler",{procsig: rtl.newTIProcSig([["S",rtl.jsvalue],["NewLine",rtl.boolean]])});
  this.SetWriteCallBack = function (H) {
    var Result = null;
    Result = $impl.WriteCallBack;
    $impl.WriteCallBack = H;
    return Result;
  };
  this.Assigned = function (V) {
    return (V!=undefined) && (V!=null) && (!rtl.isArray(V) || (V.length > 0));
  };
  this.StrictEqual = function (A, B) {
    return A === B;
  };
  this.StrictInequal = function (A, B) {
    return A !== B;
  };
  this.$rtti.$DynArray("TArray<Classes.TPersistentClass>",{});
  $mod.$implcode = function () {
    $mod.$rtti.$ExtClass("TJSObj",{jsclass: "Object"});
    $mod.$rtti.$ExtClass("TJSArray",{jsclass: "Array"});
    $mod.$rtti.$ExtClass("TJSArguments",{jsclass: "arguments"});
    $impl.SameText = function (s1, s2) {
      return s1.toLowerCase() == s2.toLowerCase();
    };
    $impl.WriteBuf = "";
    $impl.WriteCallBack = null;
    $impl.valint = function (S, MinVal, MaxVal, Code) {
      var Result = 0;
      var x = 0.0;
      if (S === "") {
        Code.set(1);
        return Result;
      };
      x = Number(S);
      if (isNaN(x)) {
        var $tmp = $mod.Copy(S,1,1);
        if ($tmp === "$") {
          x = Number("0x" + $mod.Copy$1(S,2))}
         else if ($tmp === "&") {
          x = Number("0o" + $mod.Copy$1(S,2))}
         else if ($tmp === "%") {
          x = Number("0b" + $mod.Copy$1(S,2))}
         else {
          Code.set(1);
          return Result;
        };
      };
      if (isNaN(x) || (x !== $mod.Int(x))) {
        Code.set(1)}
       else if ((x < MinVal) || (x > MaxVal)) {
        Code.set(2)}
       else {
        Result = $mod.Trunc(x);
        Code.set(0);
      };
      return Result;
    };
  };
  $mod.$init = function () {
    rtl.exitcode = 0;
  };
},[]);
rtl.module("RTLConsts",["System"],function () {
  "use strict";
  var $mod = this;
  $mod.$resourcestrings = {SArgumentMissing: {org: 'Missing argument in format "%s"'}, SInvalidFormat: {org: 'Invalid format specifier : "%s"'}, SInvalidArgIndex: {org: 'Invalid argument index in format: "%s"'}, SListCapacityError: {org: "List capacity (%s) exceeded."}, SListCountError: {org: "List count (%s) out of bounds."}, SMapKeyError: {org: "Key not found : %s"}, SListIndexError: {org: "List index (%s) out of bounds"}, SSortedListError: {org: "Operation not allowed on sorted list"}, SDuplicateString: {org: "String list does not allow duplicates"}, SDuplicateItem: {org: "ThreadList does not allow duplicates"}, SErrFindNeedsSortedList: {org: "Cannot use find on unsorted list"}, SInvalidName: {org: 'Invalid component name: "%s"'}, SInvalidBoolean: {org: '"%s" is not a valid boolean.'}, SDuplicateName: {org: 'Duplicate component name: "%s"'}, SErrInvalidDate: {org: 'Invalid date: "%s"'}, SErrInvalidTimeFormat: {org: 'Invalid time format: "%s"'}, SInvalidDateFormat: {org: 'Invalid date format: "%s"'}, SCantReadPropertyS: {org: 'Cannot read property "%s"'}, SCantWritePropertyS: {org: 'Cannot write property "%s"'}, SErrPropertyNotFound: {org: 'Unknown property: "%s"'}, SIndexedPropertyNeedsParams: {org: 'Indexed property "%s" needs parameters'}, SErrInvalidTypecast: {org: "Invalid class typecast"}, SErrInvalidInteger: {org: 'Invalid integer value: "%s"'}, SErrInvalidFloat: {org: 'Invalid floating-point value: "%s"'}, SInvalidDateTime: {org: "Invalid date-time value: %s"}, SInvalidCurrency: {org: "Invalid currency value: %s"}, SErrInvalidDayOfWeek: {org: "%d is not a valid day of the week"}, SErrInvalidTimeStamp: {org: 'Invalid date\/timestamp : "%s"'}, SErrInvalidDateWeek: {org: "%d %d %d is not a valid dateweek"}, SErrInvalidDayOfYear: {org: "Year %d does not have a day number %d"}, SErrInvalidDateMonthWeek: {org: "Year %d, month %d, Week %d and day %d is not a valid date."}, SErrInvalidDayOfWeekInMonth: {org: "Year %d Month %d NDow %d DOW %d is not a valid date"}, SInvalidJulianDate: {org: "%f Julian cannot be represented as a DateTime"}, SErrInvalidHourMinuteSecMsec: {org: "%d:%d:%d.%d is not a valid time specification"}, SInvalidGUID: {org: '"%s" is not a valid GUID value'}, SEmptyStreamIllegalReader: {org: "Illegal Nil stream for TReader constructor"}, SInvalidPropertyValue: {org: "Invalid value for property"}, SInvalidImage: {org: "Invalid stream format"}, SUnknownProperty: {org: 'Unknown property: "%s"'}, SUnknownPropertyType: {org: "Unknown property type %s"}, SAncestorNotFound: {org: 'Ancestor class for "%s" not found.'}, SUnsupportedPropertyVariantType: {org: "Unsupported property variant type %d"}, SPropertyException: {org: "Error reading %s%s%s: %s"}, SInvalidPropertyPath: {org: "Invalid property path"}, SReadOnlyProperty: {org: "Property is read-only"}, SClassNotFound: {org: 'Class "%s" not found'}, SEmptyStreamIllegalWriter: {org: "Illegal Nil stream for TWriter constructor"}, SErrInvalidPropertyType: {org: "Invalid property type from streamed property: %d"}, SParserExpected: {org: "Wrong token type: %s expected"}, SParserInvalidFloat: {org: "Invalid floating point number: %s"}, SParserInvalidInteger: {org: "Invalid integer number: %s"}, SParserUnterminatedString: {org: "Unterminated string"}, SParserWrongTokenType: {org: "Wrong token type: %s expected but %s found"}, SParserWrongTokenSymbol: {org: "Wrong token symbol: %s expected but %s found"}, SParserLocInfo: {org: " (at %d,%d, stream offset %.8x)"}, SParserUnterminatedBinValue: {org: "Unterminated byte value"}, SParserInvalidProperty: {org: "Invalid property"}, SRangeError: {org: "Range error"}, SParamIsNegative: {org: 'Parameter "%s" cannot be negative.'}};
});
rtl.module("Types",["System"],function () {
  "use strict";
  var $mod = this;
  this.TDirection = {"0": "FromBeginning", FromBeginning: 0, "1": "FromEnd", FromEnd: 1};
  this.$rtti.$Enum("TDirection",{minvalue: 0, maxvalue: 1, ordtype: 1, enumtype: this.TDirection});
  this.$rtti.$DynArray("TBooleanDynArray",{eltype: rtl.boolean});
  this.$rtti.$DynArray("TWordDynArray",{eltype: rtl.word});
  this.$rtti.$DynArray("TIntegerDynArray",{eltype: rtl.longint});
  this.$rtti.$DynArray("TNativeIntDynArray",{eltype: rtl.nativeint});
  this.$rtti.$DynArray("TStringDynArray",{eltype: rtl.string});
  this.$rtti.$DynArray("TDoubleDynArray",{eltype: rtl.double});
  this.$rtti.$DynArray("TJSValueDynArray",{eltype: rtl.jsvalue});
  this.$rtti.$DynArray("TObjectDynArray",{eltype: pas.System.$rtti["TObject"]});
  this.$rtti.$DynArray("TByteDynArray",{eltype: rtl.byte});
  this.TDuplicates = {"0": "dupIgnore", dupIgnore: 0, "1": "dupAccept", dupAccept: 1, "2": "dupError", dupError: 2};
  this.$rtti.$Enum("TDuplicates",{minvalue: 0, maxvalue: 2, ordtype: 1, enumtype: this.TDuplicates});
  this.$rtti.$RefToProcVar("TProc",{procsig: rtl.newTIProcSig([])});
  this.$rtti.$RefToProcVar("TProcString",{procsig: rtl.newTIProcSig([["aString",rtl.string,2]])});
  this.$rtti.$MethodVar("TListCallback",{procsig: rtl.newTIProcSig([["data",rtl.jsvalue],["arg",rtl.jsvalue]]), methodkind: 0});
  this.$rtti.$ProcVar("TListStaticCallback",{procsig: rtl.newTIProcSig([["data",rtl.jsvalue],["arg",rtl.jsvalue]])});
  rtl.recNewT(this,"TSize",function () {
    this.cx = 0;
    this.cy = 0;
    this.$eq = function (b) {
      return (this.cx === b.cx) && (this.cy === b.cy);
    };
    this.$assign = function (s) {
      this.cx = s.cx;
      this.cy = s.cy;
      return this;
    };
    var $r = $mod.$rtti.$Record("TSize",{});
    $r.addField("cx",rtl.longint);
    $r.addField("cy",rtl.longint);
  });
  rtl.recNewT(this,"TPoint",function () {
    this.x = 0;
    this.y = 0;
    this.$eq = function (b) {
      return (this.x === b.x) && (this.y === b.y);
    };
    this.$assign = function (s) {
      this.x = s.x;
      this.y = s.y;
      return this;
    };
    var $r = $mod.$rtti.$Record("TPoint",{});
    $r.addField("x",rtl.longint);
    $r.addField("y",rtl.longint);
  });
  rtl.recNewT(this,"TRect",function () {
    this.Left = 0;
    this.Top = 0;
    this.Right = 0;
    this.Bottom = 0;
    this.$eq = function (b) {
      return (this.Left === b.Left) && (this.Top === b.Top) && (this.Right === b.Right) && (this.Bottom === b.Bottom);
    };
    this.$assign = function (s) {
      this.Left = s.Left;
      this.Top = s.Top;
      this.Right = s.Right;
      this.Bottom = s.Bottom;
      return this;
    };
    var $r = $mod.$rtti.$Record("TRect",{});
    $r.addField("Left",rtl.longint);
    $r.addField("Top",rtl.longint);
    $r.addField("Right",rtl.longint);
    $r.addField("Bottom",rtl.longint);
  });
  this.EqualRect = function (r1, r2) {
    var Result = false;
    Result = (r1.Left === r2.Left) && (r1.Right === r2.Right) && (r1.Top === r2.Top) && (r1.Bottom === r2.Bottom);
    return Result;
  };
  this.Rect = function (Left, Top, Right, Bottom) {
    var Result = $mod.TRect.$new();
    Result.Left = Left;
    Result.Top = Top;
    Result.Right = Right;
    Result.Bottom = Bottom;
    return Result;
  };
  this.Bounds = function (ALeft, ATop, AWidth, AHeight) {
    var Result = $mod.TRect.$new();
    Result.Left = ALeft;
    Result.Top = ATop;
    Result.Right = ALeft + AWidth;
    Result.Bottom = ATop + AHeight;
    return Result;
  };
  this.Point = function (x, y) {
    var Result = $mod.TPoint.$new();
    Result.x = x;
    Result.y = y;
    return Result;
  };
  this.PtInRect = function (aRect, p) {
    var Result = false;
    Result = (p.y >= aRect.Top) && (p.y < aRect.Bottom) && (p.x >= aRect.Left) && (p.x < aRect.Right);
    return Result;
  };
  this.IntersectRect = function (aRect, R1, R2) {
    var Result = false;
    var lRect = $mod.TRect.$new();
    lRect.$assign(R1);
    if (R2.Left > R1.Left) lRect.Left = R2.Left;
    if (R2.Top > R1.Top) lRect.Top = R2.Top;
    if (R2.Right < R1.Right) lRect.Right = R2.Right;
    if (R2.Bottom < R1.Bottom) lRect.Bottom = R2.Bottom;
    if ($mod.IsRectEmpty(lRect)) {
      aRect.$assign($mod.Rect(0,0,0,0));
      Result = false;
    } else {
      Result = true;
      aRect.$assign(lRect);
    };
    return Result;
  };
  this.UnionRect = function (aRect, R1, R2) {
    var Result = false;
    var lRect = $mod.TRect.$new();
    lRect.$assign(R1);
    if (R2.Left < R1.Left) lRect.Left = R2.Left;
    if (R2.Top < R1.Top) lRect.Top = R2.Top;
    if (R2.Right > R1.Right) lRect.Right = R2.Right;
    if (R2.Bottom > R1.Bottom) lRect.Bottom = R2.Bottom;
    if ($mod.IsRectEmpty(lRect)) {
      aRect.$assign($mod.Rect(0,0,0,0));
      Result = false;
    } else {
      aRect.$assign(lRect);
      Result = true;
    };
    return Result;
  };
  this.IsRectEmpty = function (aRect) {
    var Result = false;
    Result = (aRect.Right <= aRect.Left) || (aRect.Bottom <= aRect.Top);
    return Result;
  };
  this.OffsetRect = function (aRect, DX, DY) {
    var Result = false;
    aRect.Left += DX;
    aRect.Top += DY;
    aRect.Right += DX;
    aRect.Bottom += DY;
    Result = true;
    return Result;
  };
  this.CenterPoint = function (aRect) {
    var Result = $mod.TPoint.$new();
    function Avg(a, b) {
      var Result = 0;
      if (a < b) {
        Result = a + ((b - a) >>> 1)}
       else Result = b + ((a - b) >>> 1);
      return Result;
    };
    Result.x = Avg(aRect.Left,aRect.Right);
    Result.y = Avg(aRect.Top,aRect.Bottom);
    return Result;
  };
  this.InflateRect = function (aRect, dx, dy) {
    var Result = false;
    aRect.Left -= dx;
    aRect.Top -= dy;
    aRect.Right += dx;
    aRect.Bottom += dy;
    Result = true;
    return Result;
  };
  this.Size = function (AWidth, AHeight) {
    var Result = $mod.TSize.$new();
    Result.cx = AWidth;
    Result.cy = AHeight;
    return Result;
  };
  this.Size$1 = function (aRect) {
    var Result = $mod.TSize.$new();
    Result.cx = aRect.Right - aRect.Left;
    Result.cy = aRect.Bottom - aRect.Top;
    return Result;
  };
});
rtl.module("JS",["System","Types"],function () {
  "use strict";
  var $mod = this;
  rtl.createClass(this,"EJS",pas.System.TObject,function () {
    this.$init = function () {
      pas.System.TObject.$init.call(this);
      this.FMessage = "";
    };
    this.Create$1 = function (Msg) {
      this.FMessage = Msg;
      return this;
    };
  });
  this.$rtti.$ExtClass("TJSObject",{jsclass: "Object"});
  this.$rtti.$DynArray("TJSObjectDynArray",{eltype: this.$rtti["TJSObject"]});
  this.$rtti.$DynArray("TJSObjectDynArrayArray",{eltype: this.$rtti["TJSObjectDynArray"]});
  this.$rtti.$DynArray("TJSStringDynArray",{eltype: rtl.string});
  this.$rtti.$ExtClass("TJSIteratorValue",{jsclass: "IteratorValue"});
  this.$rtti.$ExtClass("TJSIterator",{jsclass: "Iterator"});
  this.$rtti.$ExtClass("TJSSet");
  this.$rtti.$RefToProcVar("TJSSetEventProc",{procsig: rtl.newTIProcSig([["value",rtl.jsvalue],["key",rtl.nativeint],["set_",this.$rtti["TJSSet"]]])});
  this.$rtti.$RefToProcVar("TJSSetProcCallBack",{procsig: rtl.newTIProcSig([["value",rtl.jsvalue],["key",rtl.jsvalue]])});
  this.$rtti.$ExtClass("TJSSet",{jsclass: "Set"});
  this.$rtti.$RefToProcVar("TJSMapFunctionCallBack",{procsig: rtl.newTIProcSig([["arg",rtl.jsvalue]],rtl.jsvalue)});
  this.$rtti.$RefToProcVar("TJSMapProcCallBack",{procsig: rtl.newTIProcSig([["value",rtl.jsvalue],["key",rtl.jsvalue]])});
  this.$rtti.$ExtClass("TJSMap",{jsclass: "Map"});
  this.$rtti.$ExtClass("TJSFunction",{ancestor: this.$rtti["TJSObject"], jsclass: "Function"});
  this.$rtti.$ExtClass("TJSDate",{ancestor: this.$rtti["TJSFunction"], jsclass: "Date"});
  rtl.recNewT(this,"TLocaleCompareOptions",function () {
    this.localematched = "";
    this.usage = "";
    this.sensitivity = "";
    this.ignorePunctuation = false;
    this.numeric = false;
    this.caseFirst = "";
    this.$eq = function (b) {
      return (this.localematched === b.localematched) && (this.usage === b.usage) && (this.sensitivity === b.sensitivity) && (this.ignorePunctuation === b.ignorePunctuation) && (this.numeric === b.numeric) && (this.caseFirst === b.caseFirst);
    };
    this.$assign = function (s) {
      this.localematched = s.localematched;
      this.usage = s.usage;
      this.sensitivity = s.sensitivity;
      this.ignorePunctuation = s.ignorePunctuation;
      this.numeric = s.numeric;
      this.caseFirst = s.caseFirst;
      return this;
    };
    var $r = $mod.$rtti.$Record("TLocaleCompareOptions",{});
    $r.addField("localematched",rtl.string);
    $r.addField("usage",rtl.string);
    $r.addField("sensitivity",rtl.string);
    $r.addField("ignorePunctuation",rtl.boolean);
    $r.addField("numeric",rtl.boolean);
    $r.addField("caseFirst",rtl.string);
  });
  this.$rtti.$ExtClass("TJSRegexp",{jsclass: "RegExp"});
  this.$rtti.$RefToProcVar("TReplaceCallBack",{procsig: rtl.newTIProcSig([["match",rtl.string,2]],rtl.string,2)});
  this.$rtti.$RefToProcVar("TReplaceCallBack0",{procsig: rtl.newTIProcSig([["match",rtl.string,2],["offset",rtl.longint],["AString",rtl.string]],rtl.string)});
  this.$rtti.$RefToProcVar("TReplaceCallBack1",{procsig: rtl.newTIProcSig([["match",rtl.string,2],["p1",rtl.string,2],["offset",rtl.longint],["AString",rtl.string]],rtl.string)});
  this.$rtti.$RefToProcVar("TReplaceCallBack2",{procsig: rtl.newTIProcSig([["match",rtl.string,2],["p1",rtl.string,2],["p2",rtl.string,2],["offset",rtl.longint],["AString",rtl.string]],rtl.string)});
  this.$rtti.$ExtClass("TJSString",{jsclass: "String"});
  this.$rtti.$ExtClass("TJSArray");
  this.$rtti.$RefToProcVar("TJSArrayEventProc",{procsig: rtl.newTIProcSig([["element",rtl.jsvalue],["index",rtl.nativeint],["anArray",this.$rtti["TJSArray"]]])});
  this.$rtti.$RefToProcVar("TJSArrayEvent",{procsig: rtl.newTIProcSig([["element",rtl.jsvalue],["index",rtl.nativeint],["anArray",this.$rtti["TJSArray"]]],rtl.boolean)});
  this.$rtti.$RefToProcVar("TJSArrayMapEvent",{procsig: rtl.newTIProcSig([["element",rtl.jsvalue],["index",rtl.nativeint],["anArray",this.$rtti["TJSArray"]]],rtl.jsvalue)});
  this.$rtti.$RefToProcVar("TJSArrayReduceEvent",{procsig: rtl.newTIProcSig([["accumulator",rtl.jsvalue],["currentValue",rtl.jsvalue],["currentIndex",rtl.nativeint],["anArray",this.$rtti["TJSArray"]]],rtl.jsvalue)});
  this.$rtti.$RefToProcVar("TJSArrayCompareEvent",{procsig: rtl.newTIProcSig([["a",rtl.jsvalue],["b",rtl.jsvalue]],rtl.nativeint)});
  this.$rtti.$ExtClass("TJSArray",{jsclass: "Array"});
  this.$rtti.$ExtClass("TJSArrayBuffer",{ancestor: this.$rtti["TJSObject"], jsclass: "ArrayBuffer"});
  this.$rtti.$ExtClass("TJSBufferSource",{jsclass: "BufferSource"});
  this.$rtti.$ExtClass("TJSTypedArray");
  this.$rtti.$ProcVar("TJSTypedArrayCallBack",{procsig: rtl.newTIProcSig([["element",rtl.jsvalue],["index",rtl.nativeint],["anArray",this.$rtti["TJSTypedArray"]]],rtl.boolean)});
  this.$rtti.$MethodVar("TJSTypedArrayEvent",{procsig: rtl.newTIProcSig([["element",rtl.jsvalue],["index",rtl.nativeint],["anArray",this.$rtti["TJSTypedArray"]]],rtl.boolean), methodkind: 1});
  this.$rtti.$ProcVar("TJSTypedArrayMapCallBack",{procsig: rtl.newTIProcSig([["element",rtl.jsvalue],["index",rtl.nativeint],["anArray",this.$rtti["TJSTypedArray"]]],rtl.jsvalue)});
  this.$rtti.$MethodVar("TJSTypedArrayMapEvent",{procsig: rtl.newTIProcSig([["element",rtl.jsvalue],["index",rtl.nativeint],["anArray",this.$rtti["TJSTypedArray"]]],rtl.jsvalue), methodkind: 1});
  this.$rtti.$ProcVar("TJSTypedArrayReduceCallBack",{procsig: rtl.newTIProcSig([["accumulator",rtl.jsvalue],["currentValue",rtl.jsvalue],["currentIndex",rtl.nativeint],["anArray",this.$rtti["TJSTypedArray"]]],rtl.jsvalue)});
  this.$rtti.$ProcVar("TJSTypedArrayCompareCallBack",{procsig: rtl.newTIProcSig([["a",rtl.jsvalue],["b",rtl.jsvalue]],rtl.nativeint)});
  this.$rtti.$ExtClass("TJSTypedArray",{ancestor: this.$rtti["TJSBufferSource"], jsclass: "TypedArray"});
  this.$rtti.$ExtClass("TJSInt8Array",{ancestor: this.$rtti["TJSTypedArray"], jsclass: "Int8Array"});
  this.$rtti.$ExtClass("TJSUint8Array",{ancestor: this.$rtti["TJSTypedArray"], jsclass: "Uint8Array"});
  this.$rtti.$ExtClass("TJSUint8ClampedArray",{ancestor: this.$rtti["TJSTypedArray"], jsclass: "Uint8ClampedArray"});
  this.$rtti.$ExtClass("TJSInt16Array",{ancestor: this.$rtti["TJSTypedArray"], jsclass: "Int16Array"});
  this.$rtti.$ExtClass("TJSUint16Array",{ancestor: this.$rtti["TJSTypedArray"], jsclass: "Uint16Array"});
  this.$rtti.$ExtClass("TJSInt32Array",{ancestor: this.$rtti["TJSTypedArray"], jsclass: "Int32Array"});
  this.$rtti.$ExtClass("TJSUint32Array",{ancestor: this.$rtti["TJSTypedArray"], jsclass: "Uint32Array"});
  this.$rtti.$ExtClass("TJSFloat32Array",{ancestor: this.$rtti["TJSTypedArray"], jsclass: "Float32Array"});
  this.$rtti.$ExtClass("TJSFloat64Array",{ancestor: this.$rtti["TJSTypedArray"], jsclass: "Float64Array"});
  this.$rtti.$ExtClass("TJSDataView",{ancestor: this.$rtti["TJSBufferSource"], jsclass: "DataView"});
  this.$rtti.$ExtClass("TJSJSON",{ancestor: this.$rtti["TJSObject"], jsclass: "JSON"});
  this.$rtti.$ExtClass("TJSError",{ancestor: this.$rtti["TJSObject"], jsclass: "Error"});
  this.$rtti.$RefToProcVar("TJSPromiseResolver",{procsig: rtl.newTIProcSig([["aValue",rtl.jsvalue]],rtl.jsvalue)});
  this.$rtti.$RefToProcVar("TJSPromiseExecutor",{procsig: rtl.newTIProcSig([["resolve",this.$rtti["TJSPromiseResolver"]],["reject",this.$rtti["TJSPromiseResolver"]]])});
  this.$rtti.$RefToProcVar("TJSPromiseFinallyHandler",{procsig: rtl.newTIProcSig([])});
  this.$rtti.$ExtClass("TJSPromise");
  this.$rtti.$DynArray("TJSPromiseArray",{eltype: this.$rtti["TJSPromise"]});
  this.$rtti.$ExtClass("TJSPromise",{jsclass: "Promise"});
  this.$rtti.$ExtClass("TJSFunctionArguments",{jsclass: "arguments"});
  this.$rtti.$ExtClass("TJSIteratorResult",{ancestor: this.$rtti["TJSObject"], jsclass: "IteratorResult"});
  this.$rtti.$ExtClass("TJSAsyncIterator",{ancestor: this.$rtti["TJSObject"], jsclass: "AsyncIterator"});
  this.$rtti.$ExtClass("TJSSyntaxError",{ancestor: this.$rtti["TJSError"], jsclass: "SyntaxError"});
  this.$rtti.$ExtClass("TJSTextDecoderOptions",{ancestor: this.$rtti["TJSObject"], jsclass: "Object"});
  this.$rtti.$ExtClass("TJSTextDecodeOptions",{ancestor: this.$rtti["TJSObject"], jsclass: "Object"});
  this.$rtti.$ExtClass("TJSTextDecoder",{ancestor: this.$rtti["TJSObject"], jsclass: "TextDecoder"});
  this.$rtti.$ExtClass("TJSTextEncoderEncodeIntoResult",{ancestor: this.$rtti["TJSObject"], jsclass: "Object"});
  this.$rtti.$ExtClass("TJSTextEncoder",{ancestor: this.$rtti["TJSObject"], jsclass: "TextEncoder"});
  this.New = function (aElements) {
    var Result = null;
    var L = 0;
    var I = 0;
    var S = "";
    L = rtl.length(aElements);
    if ((L % 2) === 1) throw $mod.EJS.$create("Create$1",["Number of arguments must be even"]);
    I = 0;
    while (I < L) {
      if (!rtl.isString(aElements[I])) {
        S = String(I);
        throw $mod.EJS.$create("Create$1",["Argument " + S + " must be a string."]);
      };
      I += 2;
    };
    I = 0;
    Result = new Object();
    while (I < L) {
      S = "" + aElements[I];
      Result[S] = aElements[I + 1];
      I += 2;
    };
    return Result;
  };
  this.JSDelete = function (Obj, PropName) {
    return delete Obj[PropName];
  };
  this.hasValue = function (v) {
    if(v){ return true; } else { return false; };
  };
  this.isBoolean = function (v) {
    return typeof(v) == 'boolean';
  };
  this.isDate = function (v) {
    return (v instanceof Date);
  };
  this.isCallback = function (v) {
    return rtl.isObject(v) && rtl.isObject(v.scope) && (rtl.isString(v.fn) || rtl.isFunction(v.fn));
  };
  this.isChar = function (v) {
    return (typeof(v)!="string") && (v.length==1);
  };
  this.isClass = function (v) {
    return (typeof(v)=="object") && (v!=null) && (v.$class == v);
  };
  this.isClassInstance = function (v) {
    return (typeof(v)=="object") && (v!=null) && (v.$class == Object.getPrototypeOf(v));
  };
  this.isInteger = function (v) {
    return Math.floor(v)===v;
  };
  this.isNull = function (v) {
    return v === null;
  };
  this.isRecord = function (v) {
    return (typeof(v)==="object")
    && (typeof(v.$new)==="function")
    && (typeof(v.$clone)==="function")
    && (typeof(v.$eq)==="function")
    && (typeof(v.$assign)==="function");
  };
  this.isUndefined = function (v) {
    return v == undefined;
  };
  this.isDefined = function (v) {
    return !(v == undefined);
  };
  this.isUTF16Char = function (v) {
    if (typeof(v)!="string") return false;
    if ((v.length==0) || (v.length>2)) return false;
    var code = v.charCodeAt(0);
    if (code < 0xD800){
      if (v.length == 1) return true;
    } else if (code <= 0xDBFF){
      if (v.length==2){
        code = v.charCodeAt(1);
        if (code >= 0xDC00 && code <= 0xDFFF) return true;
      };
    };
    return false;
  };
  this.jsInstanceOf = function (aFunction, aFunctionWithPrototype) {
    return aFunction instanceof aFunctionWithPrototype;
  };
  this.toNumber = function (v) {
    return v-0;
  };
  this.toInteger = function (v) {
    var Result = 0;
    if ($mod.isInteger(v)) {
      Result = rtl.trunc(v)}
     else Result = 0;
    return Result;
  };
  this.toObject = function (Value) {
    var Result = null;
    if (rtl.isObject(Value)) {
      Result = Value}
     else Result = null;
    return Result;
  };
  this.toArray = function (Value) {
    var Result = null;
    if (rtl.isArray(Value)) {
      Result = Value}
     else Result = null;
    return Result;
  };
  this.toBoolean = function (Value) {
    var Result = false;
    if ($mod.isBoolean(Value)) {
      Result = !(Value == false)}
     else Result = false;
    return Result;
  };
  this.ToString = function (Value) {
    var Result = "";
    if (rtl.isString(Value)) {
      Result = "" + Value}
     else Result = "";
    return Result;
  };
  this.TJSValueType = {"0": "jvtNull", jvtNull: 0, "1": "jvtBoolean", jvtBoolean: 1, "2": "jvtInteger", jvtInteger: 2, "3": "jvtFloat", jvtFloat: 3, "4": "jvtString", jvtString: 4, "5": "jvtObject", jvtObject: 5, "6": "jvtArray", jvtArray: 6};
  this.$rtti.$Enum("TJSValueType",{minvalue: 0, maxvalue: 6, ordtype: 1, enumtype: this.TJSValueType});
  this.GetValueType = function (JS) {
    var Result = 0;
    var t = "";
    if ($mod.isNull(JS)) {
      Result = 0}
     else {
      t = typeof(JS);
      if (t === "string") {
        Result = 4}
       else if (t === "boolean") {
        Result = 1}
       else if (t === "object") {
        if (rtl.isArray(JS)) {
          Result = 6}
         else Result = 5;
      } else if (t === "number") if ($mod.isInteger(JS)) {
        Result = 2}
       else Result = 3;
    };
    return Result;
  };
});
rtl.module("SysUtils",["System","RTLConsts","JS"],function () {
  "use strict";
  var $mod = this;
  var $impl = $mod.$impl;
  this.FreeAndNil = function (Obj) {
    var o = null;
    o = Obj.get();
    if (o === null) return;
    Obj.set(null);
    o.$destroy("Destroy");
  };
  this.$rtti.$ProcVar("TProcedure",{procsig: rtl.newTIProcSig([])});
  this.FloatRecDigits = 19;
  this.$rtti.$Set("TSysCharSet",{comptype: rtl.char});
  rtl.recNewT(this,"TFloatRec",function () {
    this.Exponent = 0;
    this.Negative = false;
    this.$new = function () {
      var r = Object.create(this);
      r.Digits = rtl.arraySetLength(null,"",19);
      return r;
    };
    this.$eq = function (b) {
      return (this.Exponent === b.Exponent) && (this.Negative === b.Negative) && rtl.arrayEq(this.Digits,b.Digits);
    };
    this.$assign = function (s) {
      this.Exponent = s.Exponent;
      this.Negative = s.Negative;
      this.Digits = s.Digits.slice(0);
      return this;
    };
    var $r = $mod.$rtti.$Record("TFloatRec",{});
    $r.addField("Exponent",rtl.longint);
    $r.addField("Negative",rtl.boolean);
    $mod.$rtti.$StaticArray("TFloatRec.Digits$a",{dims: [19], eltype: rtl.char});
    $r.addField("Digits",$mod.$rtti["TFloatRec.Digits$a"]);
  });
  this.TEndian = {"0": "Little", Little: 0, "1": "Big", Big: 1};
  this.$rtti.$Enum("TEndian",{minvalue: 0, maxvalue: 1, ordtype: 1, enumtype: this.TEndian});
  this.$rtti.$StaticArray("TByteArray",{dims: [32768], eltype: rtl.byte});
  this.$rtti.$StaticArray("TWordArray",{dims: [16384], eltype: rtl.word});
  this.$rtti.$DynArray("TBytes",{eltype: rtl.byte});
  this.$rtti.$DynArray("TStringArray",{eltype: rtl.string});
  this.$rtti.$StaticArray("TMonthNameArray",{dims: [12], eltype: rtl.string});
  this.$rtti.$StaticArray("TDayTable",{dims: [12], eltype: rtl.word});
  this.$rtti.$StaticArray("TWeekNameArray",{dims: [7], eltype: rtl.string});
  this.$rtti.$StaticArray("TDayNames",{dims: [7], eltype: rtl.string});
  rtl.recNewT(this,"TFormatSettings",function () {
    this.CurrencyDecimals = 0;
    this.CurrencyFormat = 0;
    this.CurrencyString = "";
    this.DateSeparator = "";
    this.DecimalSeparator = "";
    this.LongDateFormat = "";
    this.LongTimeFormat = "";
    this.NegCurrFormat = 0;
    this.ShortDateFormat = "";
    this.ShortTimeFormat = "";
    this.ThousandSeparator = "";
    this.TimeAMString = "";
    this.TimePMString = "";
    this.TimeSeparator = "";
    this.TwoDigitYearCenturyWindow = 0;
    $mod.$rtti.$ProcVar("TFormatSettings.TLocaleInitCallback",{procsig: rtl.newTIProcSig([["aLocale",rtl.string,2],["aInstance",$r]])});
    this.InitLocaleHandler = null;
    this.$new = function () {
      var r = Object.create(this);
      r.DateTimeToStrFormat = rtl.arraySetLength(null,"",2);
      r.LongDayNames = rtl.arraySetLength(null,"",7);
      r.LongMonthNames = rtl.arraySetLength(null,"",12);
      r.ShortDayNames = rtl.arraySetLength(null,"",7);
      r.ShortMonthNames = rtl.arraySetLength(null,"",12);
      return r;
    };
    this.$eq = function (b) {
      return (this.CurrencyDecimals === b.CurrencyDecimals) && (this.CurrencyFormat === b.CurrencyFormat) && (this.CurrencyString === b.CurrencyString) && (this.DateSeparator === b.DateSeparator) && rtl.arrayEq(this.DateTimeToStrFormat,b.DateTimeToStrFormat) && (this.DecimalSeparator === b.DecimalSeparator) && (this.LongDateFormat === b.LongDateFormat) && rtl.arrayEq(this.LongDayNames,b.LongDayNames) && rtl.arrayEq(this.LongMonthNames,b.LongMonthNames) && (this.LongTimeFormat === b.LongTimeFormat) && (this.NegCurrFormat === b.NegCurrFormat) && (this.ShortDateFormat === b.ShortDateFormat) && rtl.arrayEq(this.ShortDayNames,b.ShortDayNames) && rtl.arrayEq(this.ShortMonthNames,b.ShortMonthNames) && (this.ShortTimeFormat === b.ShortTimeFormat) && (this.ThousandSeparator === b.ThousandSeparator) && (this.TimeAMString === b.TimeAMString) && (this.TimePMString === b.TimePMString) && (this.TimeSeparator === b.TimeSeparator) && (this.TwoDigitYearCenturyWindow === b.TwoDigitYearCenturyWindow);
    };
    this.$assign = function (s) {
      this.CurrencyDecimals = s.CurrencyDecimals;
      this.CurrencyFormat = s.CurrencyFormat;
      this.CurrencyString = s.CurrencyString;
      this.DateSeparator = s.DateSeparator;
      this.DateTimeToStrFormat = s.DateTimeToStrFormat.slice(0);
      this.DecimalSeparator = s.DecimalSeparator;
      this.LongDateFormat = s.LongDateFormat;
      this.LongDayNames = s.LongDayNames.slice(0);
      this.LongMonthNames = s.LongMonthNames.slice(0);
      this.LongTimeFormat = s.LongTimeFormat;
      this.NegCurrFormat = s.NegCurrFormat;
      this.ShortDateFormat = s.ShortDateFormat;
      this.ShortDayNames = s.ShortDayNames.slice(0);
      this.ShortMonthNames = s.ShortMonthNames.slice(0);
      this.ShortTimeFormat = s.ShortTimeFormat;
      this.ThousandSeparator = s.ThousandSeparator;
      this.TimeAMString = s.TimeAMString;
      this.TimePMString = s.TimePMString;
      this.TimeSeparator = s.TimeSeparator;
      this.TwoDigitYearCenturyWindow = s.TwoDigitYearCenturyWindow;
      return this;
    };
    this.GetJSLocale = function () {
      return Intl.DateTimeFormat().resolvedOptions().locale;
    };
    this.GetLocaleShortDayName = function (ADayOfWeek, ALocale) {
      var Result = "";
      var d = null;
      d = new Date(2017,0,1,0,0,0,0);
      d.setDate((d.getDate() + ADayOfWeek) - 1);
      Result = d.toLocaleDateString(ALocale,pas.JS.New(["weekday","short"]));
      return Result;
    };
    this.GetLocaleDecimalSeparator = function (ALocale) {
      var lNumber = 1.1;
      lNumber = lNumber.toLocaleString(ALocale).substring(1, 2);
      return lNumber;
    };
    this.GetLocaleLongMonthName = function (AMonth, ALocale) {
      var lBaseDate = new Date(2017, AMonth - 1, 1);
      return lBaseDate.toLocaleDateString(ALocale, { month: 'long' });
    };
    this.GetLocaleLongDayName = function (ADayOfWeek, ALocale) {
      var lBaseDate = new Date(2017, 0, 1); // Sunday
      lBaseDate.setDate(lBaseDate.getDate() + ADayOfWeek - 1);
      return lBaseDate.toLocaleDateString(ALocale, { weekday: 'long' });
    };
    this.GetLocaleShortMonthName = function (AMonth, ALocale) {
      var Result = "";
      var d = null;
      d = new Date(2017,AMonth - 1,1,0,0,0,0);
      Result = d.toLocaleDateString(ALocale,pas.JS.New(["month","short"]));
      return Result;
    };
    this.Create = function () {
      var Result = $mod.TFormatSettings.$new();
      Result.$assign($mod.TFormatSettings.Create$1($mod.TFormatSettings.GetJSLocale()));
      return Result;
    };
    this.Create$1 = function (ALocale) {
      var Result = $mod.TFormatSettings.$new();
      Result.LongDayNames = $impl.DefaultLongDayNames.slice(0);
      Result.ShortDayNames = $impl.DefaultShortDayNames.slice(0);
      Result.ShortMonthNames = $impl.DefaultShortMonthNames.slice(0);
      Result.LongMonthNames = $impl.DefaultLongMonthNames.slice(0);
      Result.DateTimeToStrFormat[0] = "c";
      Result.DateTimeToStrFormat[1] = "f";
      Result.DateSeparator = "-";
      Result.TimeSeparator = ":";
      Result.ShortDateFormat = "yyyy-mm-dd";
      Result.LongDateFormat = "ddd, yyyy-mm-dd";
      Result.ShortTimeFormat = "hh:nn";
      Result.LongTimeFormat = "hh:nn:ss";
      Result.DecimalSeparator = ".";
      Result.ThousandSeparator = ",";
      Result.TimeAMString = "AM";
      Result.TimePMString = "PM";
      Result.TwoDigitYearCenturyWindow = 50;
      Result.CurrencyFormat = 0;
      Result.NegCurrFormat = 0;
      Result.CurrencyDecimals = 2;
      Result.CurrencyString = "$";
      if ($mod.TFormatSettings.InitLocaleHandler != null) $mod.TFormatSettings.InitLocaleHandler($mod.UpperCase(ALocale),$mod.TFormatSettings.$clone(Result));
      return Result;
    };
    this.Invariant = function () {
      var Result = $mod.TFormatSettings.$new();
      Result.CurrencyString = "¤";
      Result.CurrencyFormat = 0;
      Result.CurrencyDecimals = 2;
      Result.DateSeparator = "\/";
      Result.TimeSeparator = ":";
      Result.ShortDateFormat = "MM\/dd\/yyyy";
      Result.LongDateFormat = "dddd, dd MMMMM yyyy HH:mm:ss";
      Result.TimeAMString = "AM";
      Result.TimePMString = "PM";
      Result.ShortTimeFormat = "HH:mm";
      Result.LongTimeFormat = "HH:mm:ss";
      Result.ShortMonthNames = $impl.DefaultShortMonthNames.slice(0);
      Result.ShortMonthNames = $impl.DefaultShortMonthNames.slice(0);
      Result.LongMonthNames = $impl.DefaultLongMonthNames.slice(0);
      Result.ShortDayNames = $impl.DefaultShortDayNames.slice(0);
      Result.LongDayNames = $impl.DefaultLongDayNames.slice(0);
      Result.ThousandSeparator = ",";
      Result.DecimalSeparator = ".";
      Result.TwoDigitYearCenturyWindow = 50;
      Result.NegCurrFormat = 0;
      return Result;
    };
    var $r = $mod.$rtti.$Record("TFormatSettings",{});
    $r.addField("CurrencyDecimals",rtl.byte);
    $r.addField("CurrencyFormat",rtl.byte);
    $r.addField("CurrencyString",rtl.string);
    $r.addField("DateSeparator",rtl.char);
    $mod.$rtti.$StaticArray("TFormatSettings.DateTimeToStrFormat$a",{dims: [2], eltype: rtl.string});
    $r.addField("DateTimeToStrFormat",$mod.$rtti["TFormatSettings.DateTimeToStrFormat$a"]);
    $r.addField("DecimalSeparator",rtl.string);
    $r.addField("LongDateFormat",rtl.string);
    $r.addField("LongDayNames",$mod.$rtti["TDayNames"]);
    $r.addField("LongMonthNames",$mod.$rtti["TMonthNameArray"]);
    $r.addField("LongTimeFormat",rtl.string);
    $r.addField("NegCurrFormat",rtl.byte);
    $r.addField("ShortDateFormat",rtl.string);
    $r.addField("ShortDayNames",$mod.$rtti["TDayNames"]);
    $r.addField("ShortMonthNames",$mod.$rtti["TMonthNameArray"]);
    $r.addField("ShortTimeFormat",rtl.string);
    $r.addField("ThousandSeparator",rtl.string);
    $r.addField("TimeAMString",rtl.string);
    $r.addField("TimePMString",rtl.string);
    $r.addField("TimeSeparator",rtl.char);
    $r.addField("TwoDigitYearCenturyWindow",rtl.word);
    $r.addField("InitLocaleHandler",$mod.$rtti["TFormatSettings.TLocaleInitCallback"]);
    $r.addMethod("Create",5,[],$r,1);
    $r.addMethod("Create$1",5,[["ALocale",rtl.string,2]],$r,1);
    $r.addMethod("Invariant",5,[],$r,1);
  },true);
  rtl.createClass(this,"Exception",pas.System.TObject,function () {
    this.LogMessageOnCreate = false;
    this.$init = function () {
      pas.System.TObject.$init.call(this);
      this.fMessage = "";
      this.fHelpContext = 0;
    };
    this.Create$1 = function (Msg) {
      this.fMessage = Msg;
      if (this.LogMessageOnCreate) pas.System.Writeln("Created exception ",this.$classname," with message: ",Msg);
      return this;
    };
    this.CreateFmt = function (Msg, Args) {
      this.Create$1($mod.Format(Msg,Args));
      return this;
    };
    this.CreateHelp = function (Msg, AHelpContext) {
      this.Create$1(Msg);
      this.fHelpContext = AHelpContext;
      return this;
    };
    this.CreateFmtHelp = function (Msg, Args, AHelpContext) {
      this.Create$1($mod.Format(Msg,Args));
      this.fHelpContext = AHelpContext;
      return this;
    };
    this.ToString = function () {
      var Result = "";
      Result = this.$classname + ": " + this.fMessage;
      return Result;
    };
  });
  this.$rtti.$ClassRef("ExceptClass",{instancetype: this.$rtti["Exception"]});
  rtl.createClass(this,"EExternal",this.Exception,function () {
  });
  rtl.createClass(this,"EMathError",this.EExternal,function () {
  });
  rtl.createClass(this,"EInvalidOp",this.EMathError,function () {
  });
  rtl.createClass(this,"EZeroDivide",this.EMathError,function () {
  });
  rtl.createClass(this,"EOverflow",this.EMathError,function () {
  });
  rtl.createClass(this,"EUnderflow",this.EMathError,function () {
  });
  rtl.createClass(this,"EAbort",this.Exception,function () {
  });
  rtl.createClass(this,"EInvalidCast",this.Exception,function () {
  });
  rtl.createClass(this,"EAssertionFailed",this.Exception,function () {
  });
  rtl.createClass(this,"EObjectCheck",this.Exception,function () {
  });
  rtl.createClass(this,"EConvertError",this.Exception,function () {
  });
  rtl.createClass(this,"EFormatError",this.Exception,function () {
  });
  rtl.createClass(this,"EIntError",this.EExternal,function () {
  });
  rtl.createClass(this,"EDivByZero",this.EIntError,function () {
  });
  rtl.createClass(this,"ERangeError",this.EIntError,function () {
  });
  rtl.createClass(this,"EIntOverflow",this.EIntError,function () {
  });
  rtl.createClass(this,"EInOutError",this.Exception,function () {
    this.$init = function () {
      $mod.Exception.$init.call(this);
      this.ErrorCode = 0;
    };
  });
  rtl.createClass(this,"EHeapMemoryError",this.Exception,function () {
  });
  rtl.createClass(this,"EExternalException",this.EExternal,function () {
  });
  rtl.createClass(this,"EInvalidPointer",this.EHeapMemoryError,function () {
  });
  rtl.createClass(this,"EOutOfMemory",this.EHeapMemoryError,function () {
  });
  rtl.createClass(this,"EVariantError",this.Exception,function () {
    this.$init = function () {
      $mod.Exception.$init.call(this);
      this.ErrCode = 0;
    };
    this.CreateCode = function (Code) {
      this.ErrCode = Code;
      return this;
    };
  });
  rtl.createClass(this,"EAccessViolation",this.EExternal,function () {
  });
  rtl.createClass(this,"EBusError",this.EAccessViolation,function () {
  });
  rtl.createClass(this,"EPrivilege",this.EExternal,function () {
  });
  rtl.createClass(this,"EStackOverflow",this.EExternal,function () {
  });
  rtl.createClass(this,"EControlC",this.EExternal,function () {
  });
  rtl.createClass(this,"EAbstractError",this.Exception,function () {
  });
  rtl.createClass(this,"EPropReadOnly",this.Exception,function () {
  });
  rtl.createClass(this,"EPropWriteOnly",this.Exception,function () {
  });
  rtl.createClass(this,"EIntfCastError",this.Exception,function () {
  });
  rtl.createClass(this,"EInvalidContainer",this.Exception,function () {
  });
  rtl.createClass(this,"EInvalidInsert",this.Exception,function () {
  });
  rtl.createClass(this,"EPackageError",this.Exception,function () {
  });
  rtl.createClass(this,"EOSError",this.Exception,function () {
    this.$init = function () {
      $mod.Exception.$init.call(this);
      this.ErrorCode = 0;
    };
  });
  rtl.createClass(this,"ESafecallException",this.Exception,function () {
  });
  rtl.createClass(this,"ENoThreadSupport",this.Exception,function () {
  });
  rtl.createClass(this,"ENoWideStringSupport",this.Exception,function () {
  });
  rtl.createClass(this,"ENotImplemented",this.Exception,function () {
  });
  rtl.createClass(this,"EArgumentException",this.Exception,function () {
  });
  rtl.createClass(this,"EArgumentOutOfRangeException",this.EArgumentException,function () {
  });
  rtl.createClass(this,"EArgumentNilException",this.EArgumentException,function () {
  });
  rtl.createClass(this,"EPathTooLongException",this.Exception,function () {
  });
  rtl.createClass(this,"ENotSupportedException",this.Exception,function () {
  });
  rtl.createClass(this,"EDirectoryNotFoundException",this.Exception,function () {
  });
  rtl.createClass(this,"EFileNotFoundException",this.Exception,function () {
  });
  rtl.createClass(this,"EPathNotFoundException",this.Exception,function () {
  });
  rtl.createClass(this,"ENoConstructException",this.Exception,function () {
  });
  this.EmptyStr = "";
  this.EmptyWideStr = "";
  this.HexDisplayPrefix = "$";
  this.LeadBytes = {};
  this.CharInSet = function (Ch, CSet) {
    var Result = false;
    var I = 0;
    Result = false;
    I = rtl.length(CSet) - 1;
    while (!Result && (I >= 0)) {
      Result = Ch === CSet[I];
      I -= 1;
    };
    return Result;
  };
  this.LeftStr = function (S, Count) {
    return (Count>0) ? S.substr(0,Count) : "";
  };
  this.RightStr = function (S, Count) {
    var l = S.length;
    return (Count<1) ? "" : ( Count>=l ? S : S.substr(l-Count));
  };
  this.Trim = function (S) {
    return S.replace(/^[\s\uFEFF\xA0\x00-\x1f]+/,'').replace(/[\s\uFEFF\xA0\x00-\x1f]+$/,'');
  };
  this.TrimLeft = function (S) {
    return S.replace(/^[\s\uFEFF\xA0\x00-\x1f]+/,'');
  };
  this.TrimRight = function (S) {
    return S.replace(/[\s\uFEFF\xA0\x00-\x1f]+$/,'');
  };
  this.UpperCase = function (s) {
    return s.toUpperCase();
  };
  this.LowerCase = function (s) {
    return s.toLowerCase();
  };
  this.CompareStr = function (s1, s2) {
    var l1 = s1.length;
    var l2 = s2.length;
    if (l1<=l2){
      var s = s2.substr(0,l1);
      if (s1<s){ return -1;
      } else if (s1>s){ return 1;
      } else { return l1<l2 ? -1 : 0; };
    } else {
      var s = s1.substr(0,l2);
      if (s<s2){ return -1;
      } else { return 1; };
    };
  };
  this.SameStr = function (s1, s2) {
    return s1 == s2;
  };
  this.CompareText = function (s1, s2) {
    var l1 = s1.toLowerCase();
    var l2 = s2.toLowerCase();
    if (l1>l2){ return 1;
    } else if (l1<l2){ return -1;
    } else { return 0; };
  };
  this.SameText = function (s1, s2) {
    return s1.toLowerCase() == s2.toLowerCase();
  };
  this.AnsiCompareText = function (s1, s2) {
    return s1.localeCompare(s2);
  };
  this.AnsiSameText = function (s1, s2) {
    return s1.toLowerCase() == s2.toLowerCase();
  };
  this.AnsiCompareStr = function (s1, s2) {
    var Result = 0;
    Result = $mod.CompareText(s1,s2);
    return Result;
  };
  this.AppendStr = function (Dest, S) {
    Dest.set(Dest.get() + S);
  };
  this.Format = function (Fmt, Args) {
    var Result = "";
    Result = $mod.Format$1(Fmt,Args,$mod.FormatSettings);
    return Result;
  };
  this.Format$1 = function (Fmt, Args, aSettings) {
    var Result = "";
    var ChPos = 0;
    var OldPos = 0;
    var ArgPos = 0;
    var DoArg = 0;
    var Len = 0;
    var Hs = "";
    var ToAdd = "";
    var Index = 0;
    var Width = 0;
    var Prec = 0;
    var Left = false;
    var Fchar = "";
    var vq = 0;
    function ReadFormat() {
      var Result = "";
      var Value = 0;
      function ReadInteger() {
        var Code = 0;
        var ArgN = 0;
        if (Value !== -1) return;
        OldPos = ChPos;
        while ((ChPos <= Len) && (Fmt.charAt(ChPos - 1) <= "9") && (Fmt.charAt(ChPos - 1) >= "0")) ChPos += 1;
        if (ChPos > Len) $impl.DoFormatError(1,Fmt);
        if (Fmt.charAt(ChPos - 1) === "*") {
          if (Index === 255) {
            ArgN = ArgPos}
           else {
            ArgN = Index;
            Index += 1;
          };
          if ((ChPos > OldPos) || (ArgN > (rtl.length(Args) - 1))) $impl.DoFormatError(1,Fmt);
          ArgPos = ArgN + 1;
          var $tmp = Args[ArgN].VType;
          if ($tmp === 0) {
            Value = Args[ArgN].VJSValue}
           else if ($tmp === 19) {
            Value = Args[ArgN].VJSValue}
           else {
            $impl.DoFormatError(1,Fmt);
          };
          ChPos += 1;
        } else {
          if (OldPos < ChPos) {
            pas.System.val(pas.System.Copy(Fmt,OldPos,ChPos - OldPos),{get: function () {
                return Value;
              }, set: function (v) {
                Value = v;
              }},{get: function () {
                return Code;
              }, set: function (v) {
                Code = v;
              }});
            if (Code > 0) $impl.DoFormatError(1,Fmt);
          } else Value = -1;
        };
      };
      function ReadIndex() {
        if (Fmt.charAt(ChPos - 1) !== ":") {
          ReadInteger()}
         else Value = 0;
        if (Fmt.charAt(ChPos - 1) === ":") {
          if (Value === -1) $impl.DoFormatError(2,Fmt);
          Index = Value;
          Value = -1;
          ChPos += 1;
        };
      };
      function ReadLeft() {
        if (Fmt.charAt(ChPos - 1) === "-") {
          Left = true;
          ChPos += 1;
        } else Left = false;
      };
      function ReadWidth() {
        ReadInteger();
        if (Value !== -1) {
          Width = Value;
          Value = -1;
        };
      };
      function ReadPrec() {
        if (Fmt.charAt(ChPos - 1) === ".") {
          ChPos += 1;
          ReadInteger();
          if (Value === -1) Value = 0;
          Prec = Value;
        };
      };
      Index = 255;
      Width = -1;
      Prec = -1;
      Value = -1;
      ChPos += 1;
      if (Fmt.charAt(ChPos - 1) === "%") {
        Result = "%";
        return Result;
      };
      ReadIndex();
      ReadLeft();
      ReadWidth();
      ReadPrec();
      Result = pas.System.upcase(Fmt.charAt(ChPos - 1));
      return Result;
    };
    function Checkarg(AT, err) {
      var Result = false;
      Result = false;
      if (Index === 255) {
        DoArg = ArgPos}
       else DoArg = Index;
      ArgPos = DoArg + 1;
      if ((DoArg > (rtl.length(Args) - 1)) || (Args[DoArg].VType !== AT)) {
        if (err) $impl.DoFormatError(3,Fmt);
        ArgPos -= 1;
        return Result;
      };
      Result = true;
      return Result;
    };
    Result = "";
    Len = Fmt.length;
    ChPos = 1;
    OldPos = 1;
    ArgPos = 0;
    while (ChPos <= Len) {
      while ((ChPos <= Len) && (Fmt.charAt(ChPos - 1) !== "%")) ChPos += 1;
      if (ChPos > OldPos) Result = Result + pas.System.Copy(Fmt,OldPos,ChPos - OldPos);
      if (ChPos < Len) {
        Fchar = ReadFormat();
        var $tmp = Fchar;
        if ($tmp === "D") {
          if (Checkarg(0,false)) {
            ToAdd = $mod.IntToStr(Args[DoArg].VJSValue)}
           else if (Checkarg(19,true)) ToAdd = $mod.IntToStr(Args[DoArg].VJSValue);
          Width = Math.abs(Width);
          Index = Prec - ToAdd.length;
          if (ToAdd.charAt(0) !== "-") {
            ToAdd = pas.System.StringOfChar("0",Index) + ToAdd}
           else pas.System.Insert(pas.System.StringOfChar("0",Index + 1),{get: function () {
              return ToAdd;
            }, set: function (v) {
              ToAdd = v;
            }},2);
        } else if ($tmp === "U") {
          if (Checkarg(0,false)) {
            ToAdd = $mod.IntToStr(Args[DoArg].VJSValue >>> 0)}
           else if (Checkarg(19,true)) ToAdd = $mod.IntToStr(Args[DoArg].VJSValue);
          Width = Math.abs(Width);
          Index = Prec - ToAdd.length;
          ToAdd = pas.System.StringOfChar("0",Index) + ToAdd;
        } else if ($tmp === "E") {
          if (Checkarg(12,false)) {
            ToAdd = $mod.FloatToStrF$1(Args[DoArg].VJSValue / 10000,2,3,Prec,aSettings)}
           else if (Checkarg(3,true)) ToAdd = $mod.FloatToStrF$1(Args[DoArg].VJSValue,2,3,Prec,aSettings);
        } else if ($tmp === "F") {
          if (Checkarg(12,false)) {
            ToAdd = $mod.FloatToStrF$1(Args[DoArg].VJSValue / 10000,0,9999,Prec,aSettings)}
           else if (Checkarg(3,true)) ToAdd = $mod.FloatToStrF$1(Args[DoArg].VJSValue,0,9999,Prec,aSettings);
        } else if ($tmp === "G") {
          if (Checkarg(12,false)) {
            ToAdd = $mod.FloatToStrF$1(Args[DoArg].VJSValue / 10000,1,Prec,3,aSettings)}
           else if (Checkarg(3,true)) ToAdd = $mod.FloatToStrF$1(Args[DoArg].VJSValue,1,Prec,3,aSettings);
        } else if ($tmp === "N") {
          if (Checkarg(12,false)) {
            ToAdd = $mod.FloatToStrF$1(Args[DoArg].VJSValue / 10000,3,9999,Prec,aSettings)}
           else if (Checkarg(3,true)) ToAdd = $mod.FloatToStrF$1(Args[DoArg].VJSValue,3,9999,Prec,aSettings);
        } else if ($tmp === "M") {
          if (Checkarg(12,false)) {
            ToAdd = $mod.FloatToStrF$1(Args[DoArg].VJSValue / 10000,4,9999,Prec,aSettings)}
           else if (Checkarg(3,true)) ToAdd = $mod.FloatToStrF$1(Args[DoArg].VJSValue,4,9999,Prec,aSettings);
        } else if ($tmp === "S") {
          if (Checkarg(18,false)) {
            Hs = Args[DoArg].VJSValue}
           else if (Checkarg(9,true)) Hs = Args[DoArg].VJSValue;
          Index = Hs.length;
          if ((Prec !== -1) && (Index > Prec)) Index = Prec;
          ToAdd = pas.System.Copy(Hs,1,Index);
        } else if ($tmp === "P") {
          if (Checkarg(0,false)) {
            ToAdd = $mod.IntToHex(Args[DoArg].VJSValue,8)}
           else if (Checkarg(0,true)) ToAdd = $mod.IntToHex(Args[DoArg].VJSValue,16);
        } else if ($tmp === "X") {
          if (Checkarg(0,false)) {
            vq = Args[DoArg].VJSValue;
            Index = 16;
          } else if (Checkarg(19,true)) {
            vq = Args[DoArg].VJSValue;
            Index = 31;
          };
          if (Prec > Index) {
            ToAdd = $mod.IntToHex(vq,Index)}
           else {
            Index = 1;
            while ((rtl.shl(1,Index * 4) <= vq) && (Index < 16)) Index += 1;
            if (Index > Prec) Prec = Index;
            ToAdd = $mod.IntToHex(vq,Prec);
          };
        } else if ($tmp === "%") ToAdd = "%";
        if (Width !== -1) if (ToAdd.length < Width) if (!Left) {
          ToAdd = pas.System.StringOfChar(" ",Width - ToAdd.length) + ToAdd}
         else ToAdd = ToAdd + pas.System.StringOfChar(" ",Width - ToAdd.length);
        Result = Result + ToAdd;
      };
      ChPos += 1;
      OldPos = ChPos;
    };
    return Result;
  };
  this.BytesOf = function (AVal) {
    var Result = [];
    var I = 0;
    Result = rtl.arraySetLength(Result,0,AVal.length);
    for (var $l = 0, $end = AVal.length - 1; $l <= $end; $l++) {
      I = $l;
      Result[I] = AVal.charCodeAt((I + 1) - 1);
    };
    return Result;
  };
  this.StringOf = function (ABytes) {
    var Result = "";
    var I = 0;
    Result = "";
    for (var $l = 0, $end = rtl.length(ABytes) - 1; $l <= $end; $l++) {
      I = $l;
      Result = Result + String.fromCharCode(ABytes[I]);
    };
    return Result;
  };
  this.LocaleCompare = function (s1, s2, locales) {
    return s1.localeCompare(s2,locales) == 0;
  };
  this.NormalizeStr = function (S, Norm) {
    return S.normalize(Norm);
  };
  var Alpha = rtl.createSet(null,65,90,null,97,122,95);
  var AlphaNum = rtl.unionSet(Alpha,rtl.createSet(null,48,57));
  var Dot = ".";
  this.IsValidIdent = function (Ident, AllowDots, StrictDots) {
    var Result = false;
    var First = false;
    var I = 0;
    var Len = 0;
    Len = Ident.length;
    if (Len < 1) return false;
    First = true;
    Result = false;
    I = 1;
    while (I <= Len) {
      if (First) {
        if (!(Ident.charCodeAt(I - 1) in Alpha)) return Result;
        First = false;
      } else if (AllowDots && (Ident.charAt(I - 1) === Dot)) {
        if (StrictDots) {
          if (I >= Len) return Result;
          First = true;
        };
      } else if (!(Ident.charCodeAt(I - 1) in AlphaNum)) return Result;
      I = I + 1;
    };
    Result = true;
    return Result;
  };
  this.TStringReplaceFlag = {"0": "rfReplaceAll", rfReplaceAll: 0, "1": "rfIgnoreCase", rfIgnoreCase: 1};
  this.$rtti.$Enum("TStringReplaceFlag",{minvalue: 0, maxvalue: 1, ordtype: 1, enumtype: this.TStringReplaceFlag});
  this.$rtti.$Set("TStringReplaceFlags",{comptype: this.$rtti["TStringReplaceFlag"]});
  this.StringReplace = function (aOriginal, aSearch, aReplace, Flags) {
    var Result = "";
    var REFlags = "";
    var REString = "";
    REFlags = "";
    if (0 in Flags) REFlags = "g";
    if (1 in Flags) REFlags = REFlags + "i";
    REString = aSearch.replace(new RegExp($impl.RESpecials,"g"),"\\$1");
    Result = aOriginal.replace(new RegExp(REString,REFlags),aReplace);
    return Result;
  };
  this.QuoteString = function (aOriginal, AQuote) {
    var Result = "";
    Result = AQuote + $mod.StringReplace(aOriginal,AQuote,AQuote + AQuote,rtl.createSet(0)) + AQuote;
    return Result;
  };
  this.QuotedStr = function (s, QuoteChar) {
    var Result = "";
    Result = $mod.QuoteString(s,QuoteChar);
    return Result;
  };
  this.DeQuoteString = function (aQuoted, AQuote) {
    var Result = "";
    var i = 0;
    Result = aQuoted;
    if (Result.substr(0,1) !== AQuote) return Result;
    Result = Result.slice(1);
    i = 1;
    while (i <= Result.length) {
      if (Result.charAt(i - 1) === AQuote) {
        if ((i === Result.length) || (Result.charAt((i + 1) - 1) !== AQuote)) {
          Result = Result.slice(0,i - 1);
          return Result;
        } else Result = Result.slice(0,i - 1) + Result.slice(i);
      } else i += 1;
    };
    return Result;
  };
  this.LastDelimiter = function (Delimiters, S) {
    var Result = 0;
    Result = S.length;
    while ((Result > 0) && (pas.System.Pos(S.charAt(Result - 1),Delimiters) === 0)) Result -= 1;
    return Result;
  };
  this.IsDelimiter = function (Delimiters, S, Index) {
    var Result = false;
    Result = false;
    if ((Index > 0) && (Index <= S.length)) Result = pas.System.Pos(S.charAt(Index - 1),Delimiters) !== 0;
    return Result;
  };
  this.AdjustLineBreaks = function (S) {
    var Result = "";
    Result = $mod.AdjustLineBreaks$1(S,pas.System.DefaultTextLineBreakStyle);
    return Result;
  };
  this.AdjustLineBreaks$1 = function (S, Style) {
    var Result = "";
    var I = 0;
    var L = 0;
    var Res = "";
    function Add(C) {
      Res = Res + C;
    };
    I = 0;
    L = S.length;
    Result = "";
    while (I <= L) {
      var $tmp = S.charAt(I - 1);
      if ($tmp === "\n") {
        if (Style in rtl.createSet(1,2)) Add("\r");
        if (Style === 1) Add("\n");
        I += 1;
      } else if ($tmp === "\r") {
        if (Style === 1) Add("\r");
        Add("\n");
        I += 1;
        if (S.charAt(I - 1) === "\n") I += 1;
      } else {
        Add(S.charAt(I - 1));
        I += 1;
      };
    };
    Result = Res;
    return Result;
  };
  var Quotes = rtl.createSet(39,34);
  this.WrapText = function (Line, BreakStr, BreakChars, MaxCol) {
    var Result = "";
    var L = "";
    var C = "";
    var LQ = "";
    var BC = "";
    var P = 0;
    var BLen = 0;
    var Len = 0;
    var HB = false;
    var IBC = false;
    Result = "";
    L = Line;
    BLen = BreakStr.length;
    if (BLen > 0) {
      BC = BreakStr.charAt(0)}
     else BC = "\x00";
    Len = L.length;
    while (Len > 0) {
      P = 1;
      LQ = "\x00";
      HB = false;
      IBC = false;
      while ((P <= Len) && ((P <= MaxCol) || !IBC) && ((LQ !== "\x00") || !HB)) {
        C = L.charAt(P - 1);
        if (C === LQ) {
          LQ = "\x00"}
         else if (C.charCodeAt() in Quotes) LQ = C;
        if (LQ !== "\x00") {
          P += 1}
         else {
          HB = (C === BC) && (BreakStr === pas.System.Copy(L,P,BLen));
          if (HB) {
            P += BLen}
           else {
            if (P >= MaxCol) IBC = $mod.CharInSet(C,BreakChars);
            P += 1;
          };
        };
      };
      Result = Result + pas.System.Copy(L,1,P - 1);
      pas.System.Delete({get: function () {
          return L;
        }, set: function (v) {
          L = v;
        }},1,P - 1);
      Len = L.length;
      if ((Len > 0) && !HB) Result = Result + BreakStr;
    };
    return Result;
  };
  this.WrapText$1 = function (Line, MaxCol) {
    var Result = "";
    Result = $mod.WrapText(Line,pas.System.sLineBreak,[" ","-","\t"],MaxCol);
    return Result;
  };
  this.SwapEndian = function (W) {
    var Result = 0;
    Result = ((W & 0xFF) << 8) | ((W >>> 8) & 0xFF);
    return Result;
  };
  this.SwapEndian$1 = function (C) {
    var Result = 0;
    Result = rtl.lw(rtl.lw(rtl.lw(rtl.lw((C & 0xFF) << 24) | rtl.lw((C & 0xFF00) << 8)) | (rtl.lw(C >>> 8) & 0xFF00)) | (rtl.lw(C >>> 24) & 0xFF));
    return Result;
  };
  this.IntToStr = function (Value) {
    var Result = "";
    Result = "" + Value;
    return Result;
  };
  this.TryStrToInt = function (S, res) {
    var Result = false;
    var NI = 0;
    Result = $mod.TryStrToInt$1(S,{get: function () {
        return NI;
      }, set: function (v) {
        NI = v;
      }});
    Result = Result && (-2147483648 <= NI) && (NI <= 2147483647);
    if (Result) res.set(NI);
    return Result;
  };
  this.TryStrToInt$1 = function (S, res) {
    var Result = false;
    Result = $impl.IntTryStrToInt(S,res,$mod.FormatSettings.DecimalSeparator);
    return Result;
  };
  this.TryStrToInt$2 = function (S, res, aSettings) {
    var Result = false;
    Result = $impl.IntTryStrToInt(S,res,aSettings.DecimalSeparator);
    return Result;
  };
  this.StrToIntDef = function (S, aDef) {
    var Result = 0;
    var R = 0;
    if ($mod.TryStrToInt$1(S,{get: function () {
        return R;
      }, set: function (v) {
        R = v;
      }})) {
      Result = R}
     else Result = aDef;
    return Result;
  };
  this.StrToIntDef$1 = function (S, aDef) {
    var Result = 0;
    var R = 0;
    if ($mod.TryStrToInt$1(S,{get: function () {
        return R;
      }, set: function (v) {
        R = v;
      }})) {
      Result = R}
     else Result = aDef;
    return Result;
  };
  this.StrToInt = function (S) {
    var Result = 0;
    var R = 0;
    if (!$mod.TryStrToInt$1(S,{get: function () {
        return R;
      }, set: function (v) {
        R = v;
      }})) throw $mod.EConvertError.$create("CreateFmt",[rtl.getResStr(pas.RTLConsts,"SErrInvalidInteger"),pas.System.VarRecs(18,S)]);
    Result = R;
    return Result;
  };
  this.StrToNativeInt = function (S) {
    var Result = 0;
    if (!$mod.TryStrToInt$1(S,{get: function () {
        return Result;
      }, set: function (v) {
        Result = v;
      }})) throw $mod.EConvertError.$create("CreateFmt",[rtl.getResStr(pas.RTLConsts,"SErrInvalidInteger"),pas.System.VarRecs(18,S)]);
    return Result;
  };
  this.StrToUInt = function (s) {
    var Result = 0;
    if (!$mod.TryStrToUInt(s,{get: function () {
        return Result;
      }, set: function (v) {
        Result = v;
      }})) throw $mod.EConvertError.$create("CreateFmt",[rtl.getResStr(pas.RTLConsts,"SErrInvalidInteger"),pas.System.VarRecs(18,s)]);
    return Result;
  };
  this.StrToUIntDef = function (s, aDef) {
    var Result = 0;
    if (!$mod.TryStrToUInt(s,{get: function () {
        return Result;
      }, set: function (v) {
        Result = v;
      }})) Result = aDef;
    return Result;
  };
  this.UIntToStr = function (Value) {
    var Result = "";
    Result = $mod.IntToStr(Value);
    return Result;
  };
  this.TryStrToUInt = function (s, C) {
    var Result = false;
    var N = 0;
    Result = $mod.TryStrToInt$1(s,{get: function () {
        return N;
      }, set: function (v) {
        N = v;
      }});
    Result = (N >= 0) && (N <= 4294967295);
    if (Result) C.set(N);
    return Result;
  };
  this.StrToInt64 = function (S) {
    var Result = 0;
    var N = 0;
    if (!$mod.TryStrToInt$1(S,{get: function () {
        return N;
      }, set: function (v) {
        N = v;
      }})) throw $mod.EConvertError.$create("CreateFmt",[rtl.getResStr(pas.RTLConsts,"SErrInvalidInteger"),pas.System.VarRecs(18,S)]);
    Result = N;
    return Result;
  };
  this.StrToInt64Def = function (S, ADefault) {
    var Result = 0;
    if (!$mod.TryStrToInt64(S,{get: function () {
        return Result;
      }, set: function (v) {
        Result = v;
      }})) Result = ADefault;
    return Result;
  };
  this.TryStrToInt64 = function (S, res) {
    var Result = false;
    var R = 0;
    Result = $mod.TryStrToInt$1(S,{get: function () {
        return R;
      }, set: function (v) {
        R = v;
      }});
    if (Result) res.set(R);
    return Result;
  };
  this.TryStrToInt64$1 = function (S, res) {
    var Result = false;
    Result = $mod.TryStrToInt64(S,res);
    return Result;
  };
  this.StrToQWord = function (S) {
    var Result = 0;
    var N = 0;
    if (!$mod.TryStrToInt$1(S,{get: function () {
        return N;
      }, set: function (v) {
        N = v;
      }}) || (N < 0)) throw $mod.EConvertError.$create("CreateFmt",[rtl.getResStr(pas.RTLConsts,"SErrInvalidInteger"),pas.System.VarRecs(18,S)]);
    Result = N;
    return Result;
  };
  this.StrToQWordDef = function (S, ADefault) {
    var Result = 0;
    if (!$mod.TryStrToQWord(S,{get: function () {
        return Result;
      }, set: function (v) {
        Result = v;
      }})) Result = ADefault;
    return Result;
  };
  this.TryStrToQWord = function (S, res) {
    var Result = false;
    var R = 0;
    Result = $mod.TryStrToInt$1(S,{get: function () {
        return R;
      }, set: function (v) {
        R = v;
      }}) && (R >= 0);
    if (Result) res.set(R);
    return Result;
  };
  this.TryStrToQWord$1 = function (S, res) {
    var Result = false;
    Result = $mod.TryStrToQWord(S,res);
    return Result;
  };
  this.StrToUInt64 = function (S) {
    var Result = 0;
    var N = 0;
    if (!$mod.TryStrToInt$1(S,{get: function () {
        return N;
      }, set: function (v) {
        N = v;
      }}) || (N < 0)) throw $mod.EConvertError.$create("CreateFmt",[rtl.getResStr(pas.RTLConsts,"SErrInvalidInteger"),pas.System.VarRecs(18,S)]);
    Result = N;
    return Result;
  };
  this.StrToUInt64Def = function (S, ADefault) {
    var Result = 0;
    if (!$mod.TryStrToUInt64(S,{get: function () {
        return Result;
      }, set: function (v) {
        Result = v;
      }})) Result = ADefault;
    return Result;
  };
  this.TryStrToUInt64 = function (S, res) {
    var Result = false;
    var R = 0;
    Result = $mod.TryStrToInt$1(S,{get: function () {
        return R;
      }, set: function (v) {
        R = v;
      }}) && (R >= 0);
    if (Result) res.set(R);
    return Result;
  };
  this.TryStrToUInt64$1 = function (S, res) {
    var Result = false;
    Result = $mod.TryStrToUInt64(S,res);
    return Result;
  };
  this.StrToDWord = function (S) {
    var Result = 0;
    if (!$mod.TryStrToDWord(S,{get: function () {
        return Result;
      }, set: function (v) {
        Result = v;
      }})) throw $mod.EConvertError.$create("CreateFmt",[rtl.getResStr(pas.RTLConsts,"SErrInvalidInteger"),pas.System.VarRecs(18,S)]);
    return Result;
  };
  this.StrToDWordDef = function (S, ADefault) {
    var Result = 0;
    if (!$mod.TryStrToDWord(S,{get: function () {
        return Result;
      }, set: function (v) {
        Result = v;
      }})) Result = ADefault;
    return Result;
  };
  this.TryStrToDWord = function (S, res) {
    var Result = false;
    var R = 0;
    Result = $mod.TryStrToInt$1(S,{get: function () {
        return R;
      }, set: function (v) {
        R = v;
      }}) && (R >= 0) && (R <= 0xFFFFFFFF);
    if (Result) res.set(R);
    return Result;
  };
  this.IntToHex = function (Value, Digits) {
    var Result = "";
    Result = "";
    if (Value < 0) if (Value<0) Value = 0xFFFFFFFF + Value + 1;
    Result=Value.toString(16);
    Result = $mod.UpperCase(Result);
    while (Result.length < Digits) Result = "0" + Result;
    return Result;
  };
  this.MaxCurrency = 900719925474.0991;
  this.MinCurrency = -900719925474.0991;
  this.TFloatFormat = {"0": "ffFixed", ffFixed: 0, "1": "ffGeneral", ffGeneral: 1, "2": "ffExponent", ffExponent: 2, "3": "ffNumber", ffNumber: 3, "4": "ffCurrency", ffCurrency: 4};
  this.$rtti.$Enum("TFloatFormat",{minvalue: 0, maxvalue: 4, ordtype: 1, enumtype: this.TFloatFormat});
  var Rounds = "123456789:";
  this.FloatToDecimal = function (Value, Precision, Decimals) {
    var Result = $mod.TFloatRec.$new();
    var Buffer = "";
    var InfNan = "";
    var OutPos = 0;
    var error = 0;
    var N = 0;
    var L = 0;
    var C = 0;
    var GotNonZeroBeforeDot = false;
    var BeforeDot = false;
    Result.Negative = false;
    Result.Exponent = 0;
    for (C = 0; C <= 19; C++) Result.Digits[C] = "0";
    if (Value === 0) return Result;
    Buffer = rtl.floatToStr(Value,24);
    N = 1;
    L = Buffer.length;
    while (Buffer.charAt(N - 1) === " ") N += 1;
    Result.Negative = Buffer.charAt(N - 1) === "-";
    if (Result.Negative) {
      N += 1}
     else if (Buffer.charAt(N - 1) === "+") N += 1;
    if (L >= (N + 2)) {
      InfNan = pas.System.Copy(Buffer,N,3);
      if (InfNan === "Inf") {
        Result.Digits[0] = "\x00";
        Result.Exponent = 32767;
        return Result;
      };
      if (InfNan === "Nan") {
        Result.Digits[0] = "\x00";
        Result.Exponent = -32768;
        return Result;
      };
    };
    OutPos = 0;
    Result.Exponent = 0;
    BeforeDot = true;
    GotNonZeroBeforeDot = false;
    while ((L >= N) && (Buffer.charAt(N - 1) !== "E")) {
      if (Buffer.charAt(N - 1) === ".") {
        BeforeDot = false}
       else {
        if (BeforeDot) {
          Result.Exponent += 1;
          Result.Digits[OutPos] = Buffer.charAt(N - 1);
          if (Buffer.charAt(N - 1) !== "0") GotNonZeroBeforeDot = true;
        } else Result.Digits[OutPos - 1] = Buffer.charAt(N - 1);
        OutPos += 1;
      };
      N += 1;
    };
    N += 1;
    if (N <= L) {
      pas.System.val$6(pas.System.Copy(Buffer,N,(L - N) + 1),{get: function () {
          return C;
        }, set: function (v) {
          C = v;
        }},{get: function () {
          return error;
        }, set: function (v) {
          error = v;
        }});
      Result.Exponent += C;
    };
    N = OutPos;
    L = 19;
    while (N < L) {
      Result.Digits[N] = "0";
      N += 1;
    };
    if ((Decimals + Result.Exponent) < Precision) {
      N = Decimals + Result.Exponent}
     else N = Precision;
    if (N >= L) N = L - 1;
    if (N === 0) {
      if (Result.Digits[0] >= "5") {
        Result.Digits[0] = "1";
        Result.Digits[1] = "\x00";
        Result.Exponent += 1;
      } else Result.Digits[0] = "\x00";
    } else if (N > 0) {
      if (Result.Digits[N] >= "5") {
        do {
          Result.Digits[N] = "\x00";
          N -= 1;
          Result.Digits[N] = Rounds.charAt(($mod.StrToInt(Result.Digits[N]) + 1) - 1);
        } while (!((N === 0) || (Result.Digits[N] < ":")));
        if (Result.Digits[0] === ":") {
          Result.Digits[0] = "1";
          Result.Exponent += 1;
        };
      } else {
        Result.Digits[N] = "0";
        while ((N > -1) && (Result.Digits[N] === "0")) {
          Result.Digits[N] = "\x00";
          N -= 1;
        };
      };
    } else Result.Digits[0] = "\x00";
    if ((Result.Digits[0] === "\x00") && !GotNonZeroBeforeDot) {
      Result.Exponent = 0;
      Result.Negative = false;
    };
    return Result;
  };
  this.FloatToStr = function (Value) {
    var Result = "";
    Result = $mod.FloatToStr$1(Value,$mod.FormatSettings);
    return Result;
  };
  this.FloatToStr$1 = function (Value, aSettings) {
    var Result = "";
    Result = $mod.FloatToStrF$1(Value,1,15,0,aSettings);
    return Result;
  };
  this.FloatToStrF = function (Value, format, Precision, Digits) {
    var Result = "";
    Result = $mod.FloatToStrF$1(Value,format,Precision,Digits,$mod.FormatSettings);
    return Result;
  };
  this.FloatToStrF$1 = function (Value, format, Precision, Digits, aSettings) {
    var Result = "";
    var TS = "";
    var DS = "";
    DS = aSettings.DecimalSeparator;
    TS = aSettings.ThousandSeparator;
    var $tmp = format;
    if ($tmp === 1) {
      Result = $impl.FormatGeneralFloat(Value,Precision,DS)}
     else if ($tmp === 2) {
      Result = $impl.FormatExponentFloat(Value,Precision,Digits,DS)}
     else if ($tmp === 0) {
      Result = $impl.FormatFixedFloat(Value,Digits,DS)}
     else if ($tmp === 3) {
      Result = $impl.FormatNumberFloat(Value,Digits,DS,TS)}
     else if ($tmp === 4) Result = $impl.FormatNumberCurrency(Value * 10000,Digits,aSettings);
    if ((format !== 4) && (Result.length > 1) && (Result.charAt(0) === "-")) $impl.RemoveLeadingNegativeSign({get: function () {
        return Result;
      }, set: function (v) {
        Result = v;
      }},DS,TS);
    return Result;
  };
  this.TryStrToFloat = function (S, res) {
    var Result = false;
    Result = $mod.TryStrToFloat$2(S,res);
    return Result;
  };
  this.TryStrToFloat$1 = function (S, res, aSettings) {
    var Result = false;
    Result = $mod.TryStrToFloat$3(S,res,aSettings);
    return Result;
  };
  this.TryStrToFloat$2 = function (S, res) {
    var Result = false;
    Result = $mod.TryStrToFloat$3(S,res,$mod.FormatSettings);
    return Result;
  };
  this.TryStrToFloat$3 = function (S, res, aSettings) {
    var Result = false;
    var J = undefined;
    var N = "";
    N = S;
    if (aSettings.ThousandSeparator !== "") N = $mod.StringReplace(N,aSettings.ThousandSeparator,"",rtl.createSet(0));
    if (aSettings.DecimalSeparator !== ".") N = $mod.StringReplace(N,aSettings.DecimalSeparator,".",{});
    J = parseFloat(N);
    Result = !isNaN(J);
    if (Result) res.set(rtl.getNumber(J));
    return Result;
  };
  this.StrToFloatDef = function (S, aDef) {
    var Result = 0.0;
    if (!$mod.TryStrToFloat$3(S,{get: function () {
        return Result;
      }, set: function (v) {
        Result = v;
      }},$mod.FormatSettings)) Result = aDef;
    return Result;
  };
  this.StrToFloatDef$1 = function (S, aDef, aSettings) {
    var Result = 0.0;
    if (!$mod.TryStrToFloat$3(S,{get: function () {
        return Result;
      }, set: function (v) {
        Result = v;
      }},aSettings)) Result = aDef;
    return Result;
  };
  this.StrToFloat = function (S) {
    var Result = 0.0;
    Result = $mod.StrToFloat$1(S,$mod.FormatSettings);
    return Result;
  };
  this.StrToFloat$1 = function (S, aSettings) {
    var Result = 0.0;
    if (!$mod.TryStrToFloat$3(S,{get: function () {
        return Result;
      }, set: function (v) {
        Result = v;
      }},aSettings)) throw $mod.EConvertError.$create("CreateFmt",[rtl.getResStr(pas.RTLConsts,"SErrInvalidFloat"),pas.System.VarRecs(18,S)]);
    return Result;
  };
  this.FormatFloat = function (Fmt, aValue) {
    var Result = "";
    Result = $mod.FormatFloat$1(Fmt,aValue,$mod.TFormatSettings.$clone($mod.FormatSettings));
    return Result;
  };
  var MaxPrecision = 18;
  this.FormatFloat$1 = function (Fmt, aValue, aSettings) {
    var Result = "";
    var E = 0.0;
    var FV = $mod.TFloatRec.$new();
    var Section = "";
    var SectionLength = 0;
    var ThousandSep = false;
    var IsScientific = false;
    var DecimalPos = 0;
    var FirstDigit = 0;
    var LastDigit = 0;
    var RequestedDigits = 0;
    var ExpSize = 0;
    var Available = 0;
    var Current = 0;
    var PadZeroes = 0;
    var DistToDecimal = 0;
    function InitVars() {
      E = aValue;
      Section = "";
      SectionLength = 0;
      ThousandSep = false;
      IsScientific = false;
      DecimalPos = 0;
      FirstDigit = 2147483647;
      LastDigit = 0;
      RequestedDigits = 0;
      ExpSize = 0;
      Available = -1;
    };
    function ToResult(AChar) {
      Result = Result + AChar;
    };
    function AddToResult(AStr) {
      Result = Result + AStr;
    };
    function WriteDigit(ADigit) {
      if (ADigit === "\x00") return;
      DistToDecimal -= 1;
      if (DistToDecimal === -1) {
        AddToResult(aSettings.DecimalSeparator);
        ToResult(ADigit);
      } else {
        ToResult(ADigit);
        if (ThousandSep && ((DistToDecimal % 3) === 0) && (DistToDecimal > 1)) AddToResult(aSettings.ThousandSeparator);
      };
    };
    function GetDigit() {
      var Result = "";
      Result = "\x00";
      if (Current <= Available) {
        Result = FV.Digits[Current];
        Current += 1;
      } else if (DistToDecimal <= LastDigit) {
        DistToDecimal -= 1}
       else Result = "0";
      return Result;
    };
    function CopyDigit() {
      if (PadZeroes === 0) {
        WriteDigit(GetDigit())}
       else if (PadZeroes < 0) {
        PadZeroes += 1;
        if (DistToDecimal <= FirstDigit) {
          WriteDigit("0")}
         else DistToDecimal -= 1;
      } else {
        while (PadZeroes > 0) {
          WriteDigit(GetDigit());
          PadZeroes -= 1;
        };
        WriteDigit(GetDigit());
      };
    };
    function GetSections(SP) {
      var Result = 0;
      var FL = 0;
      var i = 0;
      var C = "";
      var Q = "";
      var inQuote = false;
      Result = 1;
      SP.get()[1] = -1;
      SP.get()[2] = -1;
      SP.get()[3] = -1;
      inQuote = false;
      Q = "\x00";
      i = 1;
      FL = Fmt.length;
      while (i <= FL) {
        C = Fmt.charAt(i - 1);
        var $tmp = C;
        if ($tmp === ";") {
          if (!inQuote) {
            if (Result > 3) throw $mod.Exception.$create("Create$1",["Invalid float format"]);
            SP.get()[Result] = i;
            Result += 1;
          };
        } else if (($tmp === '"') || ($tmp === "'")) {
          if (inQuote) {
            inQuote = C !== Q}
           else {
            inQuote = true;
            Q = C;
          };
        };
        i += 1;
      };
      if (SP.get()[Result] === -1) SP.get()[Result] = FL + 1;
      return Result;
    };
    function AnalyzeFormat() {
      var I = 0;
      var Len = 0;
      var Q = "";
      var C = "";
      var InQuote = false;
      Len = Section.length;
      I = 1;
      InQuote = false;
      Q = "\x00";
      while (I <= Len) {
        C = Section.charAt(I - 1);
        if (C.charCodeAt() in rtl.createSet(34,39)) {
          if (InQuote) {
            InQuote = C !== Q}
           else {
            InQuote = true;
            Q = C;
          };
        } else if (!InQuote) {
          var $tmp = C;
          if ($tmp === ".") {
            if (DecimalPos === 0) DecimalPos = RequestedDigits + 1}
           else if ($tmp === ",") {
            ThousandSep = aSettings.ThousandSeparator !== "\x00"}
           else if (($tmp === "e") || ($tmp === "E")) {
            I += 1;
            if (I < Len) {
              C = Section.charAt(I - 1);
              IsScientific = C.charCodeAt() in rtl.createSet(45,43);
              if (IsScientific) while ((I < Len) && (Section.charAt((I + 1) - 1) === "0")) {
                ExpSize += 1;
                I += 1;
              };
              if (ExpSize > 4) ExpSize = 4;
            };
          } else if ($tmp === "#") {
            RequestedDigits += 1}
           else if ($tmp === "0") {
            if (RequestedDigits < FirstDigit) FirstDigit = RequestedDigits + 1;
            RequestedDigits += 1;
            LastDigit = RequestedDigits + 1;
          };
        };
        I += 1;
      };
      if (DecimalPos === 0) DecimalPos = RequestedDigits + 1;
      LastDigit = DecimalPos - LastDigit;
      if (LastDigit > 0) LastDigit = 0;
      FirstDigit = DecimalPos - FirstDigit;
      if (FirstDigit < 0) FirstDigit = 0;
    };
    function ValueOutSideScope() {
      var Result = false;
      Result = ((FV.Exponent >= 18) && !IsScientific) || (FV.Exponent === 0x7FF) || (FV.Exponent === 0x800);
      return Result;
    };
    function CalcRunVars() {
      var D = 0;
      var P = 0;
      if (IsScientific) {
        P = RequestedDigits;
        D = 9999;
      } else {
        P = 18;
        D = (RequestedDigits - DecimalPos) + 1;
      };
      FV.$assign($mod.FloatToDecimal(aValue,P,D));
      DistToDecimal = DecimalPos - 1;
      if (IsScientific) {
        PadZeroes = 0}
       else {
        PadZeroes = FV.Exponent - (DecimalPos - 1);
        if (PadZeroes >= 0) DistToDecimal = FV.Exponent;
      };
      Available = -1;
      while ((Available < 18) && (FV.Digits[Available + 1] !== "\x00")) Available += 1;
    };
    function FormatExponent(ASign, aExponent) {
      var Result = "";
      Result = $mod.IntToStr(aExponent);
      Result = pas.System.StringOfChar("0",ExpSize - Result.length) + Result;
      if (aExponent < 0) {
        Result = "-" + Result}
       else if ((aExponent > 0) && (ASign === "+")) Result = ASign + Result;
      return Result;
    };
    var I = 0;
    var S = 0;
    var C = "";
    var Q = "";
    var PA = [];
    var InLiteral = false;
    PA = rtl.arraySetLength(PA,0,4);
    Result = "";
    InitVars();
    if (E > 0) {
      S = 1}
     else if (E < 0) {
      S = 2}
     else S = 3;
    PA[0] = 0;
    I = GetSections({get: function () {
        return PA;
      }, set: function (v) {
        PA = v;
      }});
    if ((I < S) || ((PA[S] - PA[S - 1]) === 0)) S = 1;
    SectionLength = PA[S] - PA[S - 1] - 1;
    Section = pas.System.Copy(Fmt,PA[S - 1] + 1,SectionLength);
    Section = rtl.strSetLength(Section,SectionLength);
    AnalyzeFormat();
    CalcRunVars();
    if ((SectionLength === 0) || ValueOutSideScope()) {
      Section=E.toPrecision(15);
      Result = Section;
    };
    I = 1;
    Current = 0;
    Q = " ";
    InLiteral = false;
    if (FV.Negative && (S === 1)) ToResult("-");
    while (I <= SectionLength) {
      C = Section.charAt(I - 1);
      if (C.charCodeAt() in rtl.createSet(34,39)) {
        if (InLiteral) {
          InLiteral = C !== Q}
         else {
          InLiteral = true;
          Q = C;
        };
      } else if (InLiteral) {
        ToResult(C)}
       else {
        var $tmp = C;
        if (($tmp === "0") || ($tmp === "#")) {
          CopyDigit()}
         else if (($tmp === ".") || ($tmp === ",")) {}
        else if (($tmp === "e") || ($tmp === "E")) {
          ToResult(C);
          I += 1;
          if (I <= Section.length) {
            C = Section.charAt(I - 1);
            if (C.charCodeAt() in rtl.createSet(43,45)) {
              AddToResult(FormatExponent(C,(FV.Exponent - DecimalPos) + 1));
              while ((I < SectionLength) && (Section.charAt((I + 1) - 1) === "0")) I += 1;
            };
          };
        } else {
          ToResult(C);
        };
      };
      I += 1;
    };
    return Result;
  };
  this.$rtti.$DynArray("FalseBoolStrs$a",{eltype: rtl.string});
  this.TrueBoolStrs = [];
  this.FalseBoolStrs = [];
  this.StrToBool = function (S) {
    var Result = false;
    if (!$mod.TryStrToBool(S,{get: function () {
        return Result;
      }, set: function (v) {
        Result = v;
      }})) throw $mod.EConvertError.$create("CreateFmt",[rtl.getResStr(pas.RTLConsts,"SInvalidBoolean"),pas.System.VarRecs(18,S)]);
    return Result;
  };
  this.BoolToStr = function (B, UseBoolStrs) {
    var Result = "";
    if (UseBoolStrs) {
      $impl.CheckBoolStrs();
      if (B) {
        Result = $mod.TrueBoolStrs[0]}
       else Result = $mod.FalseBoolStrs[0];
    } else if (B) {
      Result = "-1"}
     else Result = "0";
    return Result;
  };
  this.BoolToStr$1 = function (B, TrueS, FalseS) {
    var Result = "";
    if (B) {
      Result = TrueS}
     else Result = FalseS;
    return Result;
  };
  this.StrToBoolDef = function (S, Default) {
    var Result = false;
    if (!$mod.TryStrToBool(S,{get: function () {
        return Result;
      }, set: function (v) {
        Result = v;
      }})) Result = Default;
    return Result;
  };
  this.TryStrToBool = function (S, Value) {
    var Result = false;
    var Temp = "";
    var I = 0;
    var D = 0.0;
    var Code = 0;
    Temp = $mod.UpperCase(S);
    pas.System.val$8(Temp,{get: function () {
        return D;
      }, set: function (v) {
        D = v;
      }},{get: function () {
        return Code;
      }, set: function (v) {
        Code = v;
      }});
    Result = true;
    if (Code === 0) {
      Value.set(D !== 0.0)}
     else {
      $impl.CheckBoolStrs();
      for (var $l = 0, $end = rtl.length($mod.TrueBoolStrs) - 1; $l <= $end; $l++) {
        I = $l;
        if (Temp === $mod.UpperCase($mod.TrueBoolStrs[I])) {
          Value.set(true);
          return Result;
        };
      };
      for (var $l1 = 0, $end1 = rtl.length($mod.FalseBoolStrs) - 1; $l1 <= $end1; $l1++) {
        I = $l1;
        if (Temp === $mod.UpperCase($mod.FalseBoolStrs[I])) {
          Value.set(false);
          return Result;
        };
      };
      Result = false;
    };
    return Result;
  };
  this.ConfigExtension = ".cfg";
  this.SysConfigDir = "";
  this.$rtti.$ProcVar("TOnGetEnvironmentVariable",{procsig: rtl.newTIProcSig([["EnvVar",rtl.string,2]],rtl.string)});
  this.$rtti.$ProcVar("TOnGetEnvironmentString",{procsig: rtl.newTIProcSig([["Index",rtl.longint]],rtl.string)});
  this.$rtti.$ProcVar("TOnGetEnvironmentVariableCount",{procsig: rtl.newTIProcSig([],rtl.longint)});
  this.$rtti.$ProcVar("TShowExceptionHandler",{procsig: rtl.newTIProcSig([["Msg",rtl.string,2]])});
  this.$rtti.$RefToProcVar("TUncaughtPascalExceptionHandler",{procsig: rtl.newTIProcSig([["aObject",pas.System.$rtti["TObject"]]])});
  this.$rtti.$RefToProcVar("TUncaughtJSExceptionHandler",{procsig: rtl.newTIProcSig([["aObject",pas.JS.$rtti["TJSObject"]]])});
  this.OnGetEnvironmentVariable = null;
  this.OnGetEnvironmentString = null;
  this.OnGetEnvironmentVariableCount = null;
  this.OnShowException = null;
  this.SetOnUnCaughtExceptionHandler = function (aValue) {
    var Result = null;
    Result = $impl.OnPascalException;
    $impl.OnPascalException = aValue;
    $mod.HookUncaughtExceptions();
    return Result;
  };
  this.SetOnUnCaughtExceptionHandler$1 = function (aValue) {
    var Result = null;
    Result = $impl.OnJSException;
    $impl.OnJSException = aValue;
    $mod.HookUncaughtExceptions();
    return Result;
  };
  this.HookUncaughtExceptions = function () {
    rtl.onUncaughtException = $impl.RTLExceptionHook;
    rtl.showUncaughtExceptions = true;
  };
  this.GetEnvironmentVariable = function (EnvVar) {
    var Result = "";
    if ($mod.OnGetEnvironmentVariable != null) {
      Result = $mod.OnGetEnvironmentVariable(EnvVar)}
     else Result = "";
    return Result;
  };
  this.GetEnvironmentVariableCount = function () {
    var Result = 0;
    if ($mod.OnGetEnvironmentVariableCount != null) {
      Result = $mod.OnGetEnvironmentVariableCount()}
     else Result = 0;
    return Result;
  };
  this.GetEnvironmentString = function (Index) {
    var Result = "";
    if ($mod.OnGetEnvironmentString != null) {
      Result = $mod.OnGetEnvironmentString(Index)}
     else Result = "";
    return Result;
  };
  this.ShowException = function (ExceptObject, ExceptAddr) {
    var S = "";
    S = rtl.getResStr($mod,"SApplicationException") + ExceptObject.$classname;
    if ($mod.Exception.isPrototypeOf(ExceptObject)) S = S + " : " + ExceptObject.fMessage;
    $impl.DoShowException(S);
    if (ExceptAddr === null) ;
  };
  this.Abort = function () {
    throw $mod.EAbort.$create("Create$1",[rtl.getResStr($mod,"SAbortError")]);
  };
  this.TEventType = {"0": "etCustom", etCustom: 0, "1": "etInfo", etInfo: 1, "2": "etWarning", etWarning: 2, "3": "etError", etError: 3, "4": "etDebug", etDebug: 4};
  this.$rtti.$Enum("TEventType",{minvalue: 0, maxvalue: 4, ordtype: 1, enumtype: this.TEventType});
  this.$rtti.$Set("TEventTypes",{comptype: this.$rtti["TEventType"]});
  rtl.recNewT(this,"TSystemTime",function () {
    this.Year = 0;
    this.Month = 0;
    this.Day = 0;
    this.DayOfWeek = 0;
    this.Hour = 0;
    this.Minute = 0;
    this.Second = 0;
    this.MilliSecond = 0;
    this.$eq = function (b) {
      return (this.Year === b.Year) && (this.Month === b.Month) && (this.Day === b.Day) && (this.DayOfWeek === b.DayOfWeek) && (this.Hour === b.Hour) && (this.Minute === b.Minute) && (this.Second === b.Second) && (this.MilliSecond === b.MilliSecond);
    };
    this.$assign = function (s) {
      this.Year = s.Year;
      this.Month = s.Month;
      this.Day = s.Day;
      this.DayOfWeek = s.DayOfWeek;
      this.Hour = s.Hour;
      this.Minute = s.Minute;
      this.Second = s.Second;
      this.MilliSecond = s.MilliSecond;
      return this;
    };
    var $r = $mod.$rtti.$Record("TSystemTime",{});
    $r.addField("Year",rtl.word);
    $r.addField("Month",rtl.word);
    $r.addField("Day",rtl.word);
    $r.addField("DayOfWeek",rtl.word);
    $r.addField("Hour",rtl.word);
    $r.addField("Minute",rtl.word);
    $r.addField("Second",rtl.word);
    $r.addField("MilliSecond",rtl.word);
  });
  rtl.recNewT(this,"TTimeStamp",function () {
    this.Time = 0;
    this.Date = 0;
    this.$eq = function (b) {
      return (this.Time === b.Time) && (this.Date === b.Date);
    };
    this.$assign = function (s) {
      this.Time = s.Time;
      this.Date = s.Date;
      return this;
    };
    var $r = $mod.$rtti.$Record("TTimeStamp",{});
    $r.addField("Time",rtl.longint);
    $r.addField("Date",rtl.longint);
  });
  this.TimeSeparator = "";
  this.DateSeparator = "";
  this.ShortDateFormat = "";
  this.LongDateFormat = "";
  this.ShortTimeFormat = "";
  this.LongTimeFormat = "";
  this.DecimalSeparator = "";
  this.ThousandSeparator = "";
  this.TimeAMString = "";
  this.TimePMString = "";
  this.HoursPerDay = 24;
  this.MinsPerHour = 60;
  this.SecsPerMin = 60;
  this.MSecsPerSec = 1000;
  this.MinsPerDay = 24 * 60;
  this.SecsPerDay = 1440 * 60;
  this.MSecsPerDay = 86400 * 1000;
  this.MaxDateTime = 2958465.99999999;
  this.MinDateTime = -693593.99999999;
  this.JulianEpoch = -2415018.5;
  this.UnixEpoch = -2415018.5 + 2440587.5;
  this.DateDelta = 693594;
  this.UnixDateDelta = 25569;
  this.MonthDays$a$clone = function (a) {
    var b = [];
    b.length = 2;
    for (var c = 0; c < 2; c++) b[c] = a[c].slice(0);
    return b;
  };
  this.$rtti.$StaticArray("MonthDays$a",{dims: [2,12], eltype: rtl.word});
  this.MonthDays = [[31,28,31,30,31,30,31,31,30,31,30,31],[31,29,31,30,31,30,31,31,30,31,30,31]];
  this.ShortMonthNames = rtl.arraySetLength(null,"",12);
  this.LongMonthNames = rtl.arraySetLength(null,"",12);
  this.ShortDayNames = rtl.arraySetLength(null,"",7);
  this.LongDayNames = rtl.arraySetLength(null,"",7);
  this.FormatSettings = this.TFormatSettings.$new();
  this.TwoDigitYearCenturyWindow = 50;
  this.DateTimeToJSDate = function (aDateTime) {
    var Result = null;
    var Y = 0;
    var M = 0;
    var D = 0;
    var h = 0;
    var n = 0;
    var s = 0;
    var z = 0;
    $mod.DecodeDate(pas.System.Trunc(aDateTime),{get: function () {
        return Y;
      }, set: function (v) {
        Y = v;
      }},{get: function () {
        return M;
      }, set: function (v) {
        M = v;
      }},{get: function () {
        return D;
      }, set: function (v) {
        D = v;
      }});
    $mod.DecodeTime(pas.System.Frac(aDateTime),{get: function () {
        return h;
      }, set: function (v) {
        h = v;
      }},{get: function () {
        return n;
      }, set: function (v) {
        n = v;
      }},{get: function () {
        return s;
      }, set: function (v) {
        s = v;
      }},{get: function () {
        return z;
      }, set: function (v) {
        z = v;
      }});
    Result = new Date(Y,M - 1,D,h,n,s,z);
    return Result;
  };
  this.JSDateToDateTime = function (aDate) {
    var Result = 0.0;
    Result = $mod.EncodeDate(aDate.getFullYear(),aDate.getMonth() + 1,aDate.getDate()) + $mod.EncodeTime(aDate.getHours(),aDate.getMinutes(),aDate.getSeconds(),aDate.getMilliseconds());
    return Result;
  };
  this.DateTimeToTimeStamp = function (DateTime) {
    var Result = $mod.TTimeStamp.$new();
    var D = 0.0;
    D = DateTime * 86400000;
    if (D < 0) {
      D = D - 0.5}
     else D = D + 0.5;
    Result.Time = pas.System.Trunc(Math.abs(pas.System.Trunc(D)) % 86400000);
    Result.Date = 693594 + rtl.trunc(pas.System.Trunc(D) / 86400000);
    return Result;
  };
  this.TimeStampToDateTime = function (TimeStamp) {
    var Result = 0.0;
    Result = $mod.ComposeDateTime(TimeStamp.Date - 693594,TimeStamp.Time / 86400000);
    return Result;
  };
  this.MSecsToTimeStamp = function (MSecs) {
    var Result = $mod.TTimeStamp.$new();
    Result.Date = pas.System.Trunc(MSecs / 86400000);
    MSecs = MSecs - (Result.Date * 86400000);
    Result.Time = Math.round(MSecs);
    return Result;
  };
  this.TimeStampToMSecs = function (TimeStamp) {
    var Result = 0;
    Result = TimeStamp.Time + (TimeStamp.Date * 86400000);
    return Result;
  };
  this.DateTimeToSystemTime = function (DateTime, SystemTime) {
    $mod.DecodeDateFully(DateTime,{p: SystemTime, get: function () {
        return this.p.Year;
      }, set: function (v) {
        this.p.Year = v;
      }},{p: SystemTime, get: function () {
        return this.p.Month;
      }, set: function (v) {
        this.p.Month = v;
      }},{p: SystemTime, get: function () {
        return this.p.Day;
      }, set: function (v) {
        this.p.Day = v;
      }},{p: SystemTime, get: function () {
        return this.p.DayOfWeek;
      }, set: function (v) {
        this.p.DayOfWeek = v;
      }});
    $mod.DecodeTime(DateTime,{p: SystemTime, get: function () {
        return this.p.Hour;
      }, set: function (v) {
        this.p.Hour = v;
      }},{p: SystemTime, get: function () {
        return this.p.Minute;
      }, set: function (v) {
        this.p.Minute = v;
      }},{p: SystemTime, get: function () {
        return this.p.Second;
      }, set: function (v) {
        this.p.Second = v;
      }},{p: SystemTime, get: function () {
        return this.p.MilliSecond;
      }, set: function (v) {
        this.p.MilliSecond = v;
      }});
    SystemTime.DayOfWeek -= 1;
  };
  this.SystemTimeToDateTime = function (SystemTime) {
    var Result = 0.0;
    Result = $mod.ComposeDateTime($impl.DoEncodeDate(SystemTime.Year,SystemTime.Month,SystemTime.Day),$impl.DoEncodeTime(SystemTime.Hour,SystemTime.Minute,SystemTime.Second,SystemTime.MilliSecond));
    return Result;
  };
  this.FloatToDateTime = function (Value) {
    var Result = 0.0;
    if ((Value < $mod.MinDateTime) || (Value > $mod.MaxDateTime)) throw $mod.EConvertError.$create("CreateFmt",[rtl.getResStr(pas.RTLConsts,"SInvalidDateTime"),pas.System.VarRecs(18,$mod.FloatToStr(Value))]);
    Result = Value;
    return Result;
  };
  this.TryEncodeDate = function (Year, Month, Day, date) {
    var Result = false;
    var c = 0;
    var ya = 0;
    Result = (Year > 0) && (Year < 10000) && (Month >= 1) && (Month <= 12) && (Day > 0) && (Day <= $mod.MonthDays[+$mod.IsLeapYear(Year)][Month - 1]);
    if (Result) {
      if (Month > 2) {
        Month -= 3}
       else {
        Month += 9;
        Year -= 1;
      };
      c = rtl.trunc(Year / 100);
      ya = Year - (100 * c);
      date.set(((146097 * c) >>> 2) + ((1461 * ya) >>> 2) + rtl.trunc(((153 * Month) + 2) / 5) + Day);
      date.set(date.get() - 693900);
    };
    return Result;
  };
  this.TryEncodeTime = function (Hour, Min, Sec, MSec, Time) {
    var Result = false;
    Result = (Hour < 24) && (Min < 60) && (Sec < 60) && (MSec < 1000);
    if (Result) Time.set(((Hour * 3600000) + (Min * 60000) + (Sec * 1000) + MSec) / 86400000);
    return Result;
  };
  this.EncodeDate = function (Year, Month, Day) {
    var Result = 0.0;
    if (!$mod.TryEncodeDate(Year,Month,Day,{get: function () {
        return Result;
      }, set: function (v) {
        Result = v;
      }})) throw $mod.EConvertError.$create("CreateFmt",["%s-%s-%s is not a valid date specification",pas.System.VarRecs(18,$mod.IntToStr(Year),18,$mod.IntToStr(Month),18,$mod.IntToStr(Day))]);
    return Result;
  };
  this.EncodeTime = function (Hour, Minute, Second, MilliSecond) {
    var Result = 0.0;
    if (!$mod.TryEncodeTime(Hour,Minute,Second,MilliSecond,{get: function () {
        return Result;
      }, set: function (v) {
        Result = v;
      }})) throw $mod.EConvertError.$create("CreateFmt",["%s:%s:%s.%s is not a valid time specification",pas.System.VarRecs(18,$mod.IntToStr(Hour),18,$mod.IntToStr(Minute),18,$mod.IntToStr(Second),18,$mod.IntToStr(MilliSecond))]);
    return Result;
  };
  this.DecodeDate = function (date, Year, Month, Day) {
    var ly = 0;
    var ld = 0;
    var lm = 0;
    var j = 0;
    if (date <= -693594) {
      Year.set(0);
      Month.set(0);
      Day.set(0);
    } else {
      if (date > 0) {
        date = date + (1 / (86400000 * 2))}
       else date = date - (1 / (86400000 * 2));
      if (date > $mod.MaxDateTime) date = $mod.MaxDateTime;
      j = rtl.shl(pas.System.Trunc(date) + 693900,2) - 1;
      ly = rtl.trunc(j / 146097);
      j = j - (146097 * ly);
      ld = rtl.lw(j >>> 2);
      j = rtl.trunc((rtl.lw(ld << 2) + 3) / 1461);
      ld = rtl.lw(((rtl.lw(ld << 2) + 7) - (1461 * j)) >>> 2);
      lm = rtl.trunc(((5 * ld) - 3) / 153);
      ld = rtl.trunc((((5 * ld) + 2) - (153 * lm)) / 5);
      ly = (100 * ly) + j;
      if (lm < 10) {
        lm += 3}
       else {
        lm -= 9;
        ly += 1;
      };
      Year.set(ly);
      Month.set(lm);
      Day.set(ld);
    };
  };
  this.DecodeTime = function (Time, Hour, Minute, Second, MilliSecond) {
    var l = 0;
    l = $mod.DateTimeToTimeStamp(Time).Time;
    Hour.set(rtl.trunc(l / 3600000));
    l = l % 3600000;
    Minute.set(rtl.trunc(l / 60000));
    l = l % 60000;
    Second.set(rtl.trunc(l / 1000));
    l = l % 1000;
    MilliSecond.set(l);
  };
  this.DecodeDateFully = function (DateTime, Year, Month, Day, DOW) {
    var Result = false;
    $mod.DecodeDate(DateTime,Year,Month,Day);
    DOW.set($mod.DayOfWeek(DateTime));
    Result = $mod.IsLeapYear(Year.get());
    return Result;
  };
  this.ComposeDateTime = function (date, Time) {
    var Result = 0.0;
    if (date < 0) {
      Result = pas.System.Trunc(date) - Math.abs(pas.System.Frac(Time))}
     else Result = pas.System.Trunc(date) + Math.abs(pas.System.Frac(Time));
    return Result;
  };
  this.ReplaceTime = function (dati, NewTime) {
    dati.set($mod.ComposeDateTime(dati.get(),NewTime));
  };
  this.ReplaceDate = function (DateTime, NewDate) {
    var tmp = 0.0;
    tmp = NewDate;
    $mod.ReplaceTime({get: function () {
        return tmp;
      }, set: function (v) {
        tmp = v;
      }},DateTime.get());
    DateTime.set(tmp);
  };
  this.Date = function () {
    var Result = 0.0;
    Result = pas.System.Trunc($mod.Now());
    return Result;
  };
  this.Time = function () {
    var Result = 0.0;
    Result = $mod.Now() - $mod.Date();
    return Result;
  };
  this.Now = function () {
    var Result = 0.0;
    Result = $mod.JSDateToDateTime(new Date());
    return Result;
  };
  this.DayOfWeek = function (DateTime) {
    var Result = 0;
    Result = 1 + ((pas.System.Trunc(DateTime) - 1) % 7);
    if (Result <= 0) Result += 7;
    return Result;
  };
  this.IncMonth = function (DateTime, NumberOfMonths) {
    var Result = 0.0;
    var Year = 0;
    var Month = 0;
    var Day = 0;
    $mod.DecodeDate(DateTime,{get: function () {
        return Year;
      }, set: function (v) {
        Year = v;
      }},{get: function () {
        return Month;
      }, set: function (v) {
        Month = v;
      }},{get: function () {
        return Day;
      }, set: function (v) {
        Day = v;
      }});
    $mod.IncAMonth({get: function () {
        return Year;
      }, set: function (v) {
        Year = v;
      }},{get: function () {
        return Month;
      }, set: function (v) {
        Month = v;
      }},{get: function () {
        return Day;
      }, set: function (v) {
        Day = v;
      }},NumberOfMonths);
    Result = $mod.ComposeDateTime($impl.DoEncodeDate(Year,Month,Day),DateTime);
    return Result;
  };
  this.IncAMonth = function (Year, Month, Day, NumberOfMonths) {
    var TempMonth = 0;
    var S = 0;
    if (NumberOfMonths >= 0) {
      S = 1}
     else S = -1;
    Year.set(Year.get() + rtl.trunc(NumberOfMonths / 12));
    TempMonth = (Month.get() + (NumberOfMonths % 12)) - 1;
    if ((TempMonth > 11) || (TempMonth < 0)) {
      TempMonth -= S * 12;
      Year.set(Year.get() + S);
    };
    Month.set(TempMonth + 1);
    if (Day.get() > $mod.MonthDays[+$mod.IsLeapYear(Year.get())][Month.get() - 1]) Day.set($mod.MonthDays[+$mod.IsLeapYear(Year.get())][Month.get() - 1]);
  };
  this.IsLeapYear = function (Year) {
    var Result = false;
    Result = ((Year % 4) === 0) && (((Year % 100) !== 0) || ((Year % 400) === 0));
    return Result;
  };
  this.CurrentYear = function () {
    var Result = 0;
    Result = (new Date()).getFullYear();
    return Result;
  };
  this.DateToStr = function (date) {
    var Result = "";
    Result = $mod.DateToStr$1(date,$mod.FormatSettings);
    return Result;
  };
  this.DateToStr$1 = function (date, aSettings) {
    var Result = "";
    Result = $mod.FormatDateTime$1("ddddd",date,aSettings);
    return Result;
  };
  this.StrToDate = function (S) {
    var Result = 0.0;
    Result = $mod.StrToDate$3(S,$mod.FormatSettings);
    return Result;
  };
  this.StrToDate$1 = function (S, separator) {
    var Result = 0.0;
    Result = $mod.StrToDate$2(S,$mod.FormatSettings.ShortDateFormat,separator);
    return Result;
  };
  this.StrToDate$2 = function (S, useformat, separator) {
    var Result = 0.0;
    var MSg = "";
    Result = $impl.IntStrToDate({get: function () {
        return MSg;
      }, set: function (v) {
        MSg = v;
      }},S,useformat,separator);
    if (MSg !== "") throw $mod.EConvertError.$create("Create$1",[MSg]);
    return Result;
  };
  this.StrToDate$3 = function (S, aSettings) {
    var Result = 0.0;
    Result = $mod.StrToDate$2(S,aSettings.ShortDateFormat,aSettings.DateSeparator);
    return Result;
  };
  this.TryStrToDate = function (S, Value) {
    var Result = false;
    Result = $mod.TryStrToDate$1(S,Value,$mod.FormatSettings);
    return Result;
  };
  this.TryStrToDate$1 = function (S, Value, aSettings) {
    var Result = false;
    Result = $mod.TryStrToDate$3(S,Value,aSettings.ShortDateFormat,aSettings.DateSeparator);
    return Result;
  };
  this.TryStrToDate$2 = function (S, Value, separator) {
    var Result = false;
    Result = $mod.TryStrToDate$3(S,Value,$mod.FormatSettings.ShortDateFormat,separator);
    return Result;
  };
  this.TryStrToDate$3 = function (S, Value, useformat, separator) {
    var Result = false;
    var Msg = "";
    Result = S.length !== 0;
    if (Result) {
      Value.set($impl.IntStrToDate({get: function () {
          return Msg;
        }, set: function (v) {
          Msg = v;
        }},S,useformat,separator));
      Result = Msg === "";
    };
    return Result;
  };
  this.StrToDateDef = function (S, Defvalue) {
    var Result = 0.0;
    Result = $mod.StrToDateDef$1(S,Defvalue,"\x00");
    return Result;
  };
  this.StrToDateDef$1 = function (S, Defvalue, separator) {
    var Result = 0.0;
    if (!$mod.TryStrToDate$2(S,{get: function () {
        return Result;
      }, set: function (v) {
        Result = v;
      }},separator)) Result = Defvalue;
    return Result;
  };
  this.TimeToStr = function (Time) {
    var Result = "";
    Result = $mod.TimeToStr$1(Time,$mod.FormatSettings);
    return Result;
  };
  this.TimeToStr$1 = function (Time, aSettings) {
    var Result = "";
    Result = $mod.FormatDateTime$1("tt",Time,aSettings);
    return Result;
  };
  this.StrToTime = function (S) {
    var Result = 0.0;
    Result = $mod.StrToTime$2(S,$mod.FormatSettings);
    return Result;
  };
  this.StrToTime$1 = function (S, separator) {
    var Result = 0.0;
    var aSettings = $mod.TFormatSettings.$new();
    aSettings.$assign($mod.TFormatSettings.Create());
    aSettings.TimeSeparator = separator;
    Result = $mod.StrToTime$2(S,aSettings);
    return Result;
  };
  this.StrToTime$2 = function (S, aSettings) {
    var Result = 0.0;
    var Msg = "";
    Result = $impl.IntStrToTime({get: function () {
        return Msg;
      }, set: function (v) {
        Msg = v;
      }},S,S.length,aSettings);
    if (Msg !== "") throw $mod.EConvertError.$create("Create$1",[Msg]);
    return Result;
  };
  this.TryStrToTime = function (S, Value) {
    var Result = false;
    Result = $mod.TryStrToTime$1(S,Value,$mod.TFormatSettings.$clone($mod.FormatSettings));
    return Result;
  };
  this.TryStrToTime$1 = function (S, Value, aSettings) {
    var Result = false;
    var Msg = "";
    Result = S.length !== 0;
    if (Result) {
      Value.set($impl.IntStrToTime({get: function () {
          return Msg;
        }, set: function (v) {
          Msg = v;
        }},S,S.length,aSettings));
      Result = Msg === "";
    };
    return Result;
  };
  this.TryStrToTime$2 = function (S, Value, separator) {
    var Result = false;
    var Fmt = $mod.TFormatSettings.$new();
    Fmt.$assign($mod.TFormatSettings.Create());
    Fmt.TimeSeparator = separator;
    Result = $mod.TryStrToTime$1(S,Value,$mod.TFormatSettings.$clone(Fmt));
    return Result;
  };
  this.StrToTimeDef = function (S, Defvalue) {
    var Result = 0.0;
    Result = $mod.StrToTimeDef$1(S,Defvalue,"\x00");
    return Result;
  };
  this.StrToTimeDef$1 = function (S, Defvalue, separator) {
    var Result = 0.0;
    if (!$mod.TryStrToTime$2(S,{get: function () {
        return Result;
      }, set: function (v) {
        Result = v;
      }},separator)) Result = Defvalue;
    return Result;
  };
  this.StrToTimeDef$2 = function (AString, ADefault, aSettings) {
    var Result = 0.0;
    if (!$mod.TryStrToTime$1(AString,{get: function () {
        return Result;
      }, set: function (v) {
        Result = v;
      }},$mod.TFormatSettings.$clone(aSettings))) Result = ADefault;
    return Result;
  };
  this.DateTimeToStr = function (DateTime, ForceTimeIfZero) {
    var Result = "";
    Result = $mod.DateTimeToStr$1(DateTime,$mod.FormatSettings,ForceTimeIfZero);
    return Result;
  };
  this.DateTimeToStr$1 = function (DateTime, aSettings, ForceTimeIfZero) {
    var Result = "";
    Result = $mod.FormatDateTime$1($impl.DateTimeToStrFormat[+ForceTimeIfZero],DateTime,aSettings);
    return Result;
  };
  this.StrToDateTime = function (S) {
    var Result = 0.0;
    Result = $mod.StrToDateTime$1(S,$mod.FormatSettings);
    return Result;
  };
  this.StrToDateTime$1 = function (s, aSettings) {
    var Result = 0.0;
    var TimeStr = "";
    var DateStr = "";
    var PartsFound = 0;
    PartsFound = $impl.SplitDateTimeStr(s,{get: function () {
        return DateStr;
      }, set: function (v) {
        DateStr = v;
      }},{get: function () {
        return TimeStr;
      }, set: function (v) {
        TimeStr = v;
      }},aSettings);
    var $tmp = PartsFound;
    if ($tmp === 0) {
      Result = $mod.StrToDate("")}
     else if ($tmp === 1) {
      if (DateStr.length > 0) {
        Result = $mod.StrToDate$2(DateStr,aSettings.ShortDateFormat,aSettings.DateSeparator)}
       else Result = $mod.StrToTime(TimeStr)}
     else if ($tmp === 2) Result = $mod.ComposeDateTime($mod.StrToDate$2(DateStr,aSettings.ShortDateFormat,aSettings.DateSeparator),$mod.StrToTime(TimeStr));
    return Result;
  };
  this.TryStrToDateTime = function (S, Value) {
    var Result = false;
    Result = $mod.TryStrToDateTime$1(S,Value,$mod.FormatSettings);
    return Result;
  };
  this.TryStrToDateTime$1 = function (S, Value, aSettings) {
    var Result = false;
    var I = 0;
    var dtdate = 0.0;
    var dttime = 0.0;
    Result = false;
    I = pas.System.Pos(aSettings.TimeSeparator,S);
    if (I > 0) {
      while ((I > 0) && (S.charAt(I - 1) !== " ")) I -= 1;
      if (I > 0) {
        if (!$mod.TryStrToDate(pas.System.Copy(S,1,I - 1),{get: function () {
            return dtdate;
          }, set: function (v) {
            dtdate = v;
          }})) return Result;
        if (!$mod.TryStrToTime(pas.System.Copy(S,I + 1,S.length - I),{get: function () {
            return dttime;
          }, set: function (v) {
            dttime = v;
          }})) return Result;
        Value.set($mod.ComposeDateTime(dtdate,dttime));
        Result = true;
      } else Result = $mod.TryStrToTime(S,Value);
    } else Result = $mod.TryStrToDate(S,Value);
    return Result;
  };
  this.StrToDateTimeDef = function (S, Defvalue) {
    var Result = 0.0;
    Result = $mod.StrToDateTimeDef$1(S,Defvalue,$mod.TFormatSettings.$clone($mod.FormatSettings));
    return Result;
  };
  this.StrToDateTimeDef$1 = function (S, Defvalue, aSettings) {
    var Result = 0.0;
    if (!$mod.TryStrToDateTime$1(S,{get: function () {
        return Result;
      }, set: function (v) {
        Result = v;
      }},aSettings)) Result = Defvalue;
    return Result;
  };
  this.FormatDateTime = function (FormatStr, DateTime) {
    var Result = "";
    Result = $mod.FormatDateTime$1(FormatStr,DateTime,$mod.FormatSettings);
    return Result;
  };
  this.FormatDateTime$1 = function (FormatStr, DateTime, aSettings) {
    var Result = "";
    function StoreStr(APos, Len) {
      Result = Result + pas.System.Copy(FormatStr,APos,Len);
    };
    function StoreString(AStr) {
      Result = Result + AStr;
    };
    function StoreInt(Value, Digits) {
      var S = "";
      S = $mod.IntToStr(Value);
      while (S.length < Digits) S = "0" + S;
      StoreString(S);
    };
    var Year = 0;
    var Month = 0;
    var Day = 0;
    var DayOfWeek = 0;
    var Hour = 0;
    var Minute = 0;
    var Second = 0;
    var MilliSecond = 0;
    function StoreFormat(FormatStr, Nesting, TimeFlag) {
      var Token = "";
      var lastformattoken = "";
      var prevlasttoken = "";
      var Count = 0;
      var Clock12 = false;
      var tmp = 0;
      var isInterval = false;
      var P = 0;
      var FormatCurrent = 0;
      var FormatEnd = 0;
      if (Nesting > 1) return;
      FormatCurrent = 1;
      FormatEnd = FormatStr.length;
      Clock12 = false;
      isInterval = false;
      P = 1;
      while (P <= FormatEnd) {
        Token = FormatStr.charAt(P - 1);
        var $tmp = Token;
        if (($tmp === "'") || ($tmp === '"')) {
          P += 1;
          while ((P < FormatEnd) && (FormatStr.charAt(P - 1) !== Token)) P += 1;
        } else if (($tmp === "A") || ($tmp === "a")) {
          if (($mod.CompareText(pas.System.Copy(FormatStr,P,3),"A\/P") === 0) || ($mod.CompareText(pas.System.Copy(FormatStr,P,4),"AMPM") === 0) || ($mod.CompareText(pas.System.Copy(FormatStr,P,5),"AM\/PM") === 0)) {
            Clock12 = true;
            break;
          };
        };
        P += 1;
      };
      Token = "ÿ";
      lastformattoken = " ";
      prevlasttoken = "H";
      while (FormatCurrent <= FormatEnd) {
        Token = $mod.UpperCase(FormatStr.charAt(FormatCurrent - 1)).charAt(0);
        Count = 1;
        P = FormatCurrent + 1;
        var $tmp1 = Token;
        if (($tmp1 === "'") || ($tmp1 === '"')) {
          while ((P < FormatEnd) && (FormatStr.charAt(P - 1) !== Token)) P += 1;
          P += 1;
          Count = P - FormatCurrent;
          StoreStr(FormatCurrent + 1,Count - 2);
        } else if ($tmp1 === "A") {
          if ($mod.CompareText(pas.System.Copy(FormatStr,FormatCurrent,4),"AMPM") === 0) {
            Count = 4;
            if (Hour < 12) {
              StoreString(aSettings.TimeAMString)}
             else StoreString(aSettings.TimePMString);
          } else if ($mod.CompareText(pas.System.Copy(FormatStr,FormatCurrent,5),"AM\/PM") === 0) {
            Count = 5;
            if (Hour < 12) {
              StoreStr(FormatCurrent,2)}
             else StoreStr(FormatCurrent + 3,2);
          } else if ($mod.CompareText(pas.System.Copy(FormatStr,FormatCurrent,3),"A\/P") === 0) {
            Count = 3;
            if (Hour < 12) {
              StoreStr(FormatCurrent,1)}
             else StoreStr(FormatCurrent + 2,1);
          } else throw $mod.EConvertError.$create("Create$1",["Illegal character in format string"]);
        } else if ($tmp1 === "\/") {
          StoreString(aSettings.DateSeparator);
        } else if ($tmp1 === ":") {
          StoreString(aSettings.TimeSeparator)}
         else if (($tmp1 === " ") || ($tmp1 === "C") || ($tmp1 === "D") || ($tmp1 === "H") || ($tmp1 === "M") || ($tmp1 === "N") || ($tmp1 === "S") || ($tmp1 === "T") || ($tmp1 === "Y") || ($tmp1 === "Z") || ($tmp1 === "F")) {
          while ((P <= FormatEnd) && ($mod.UpperCase(FormatStr.charAt(P - 1)) === Token)) P += 1;
          Count = P - FormatCurrent;
          var $tmp2 = Token;
          if ($tmp2 === " ") {
            StoreStr(FormatCurrent,Count)}
           else if ($tmp2 === "Y") {
            if (Count > 2) {
              StoreInt(Year,4)}
             else StoreInt(Year % 100,2);
          } else if ($tmp2 === "M") {
            if (isInterval && ((prevlasttoken === "H") || TimeFlag)) {
              StoreInt(Minute + ((Hour + (pas.System.Trunc(Math.abs(DateTime)) * 24)) * 60),0)}
             else if ((lastformattoken === "H") || TimeFlag) {
              if (Count === 1) {
                StoreInt(Minute,0)}
               else StoreInt(Minute,2);
            } else {
              var $tmp3 = Count;
              if ($tmp3 === 1) {
                StoreInt(Month,0)}
               else if ($tmp3 === 2) {
                StoreInt(Month,2)}
               else if ($tmp3 === 3) {
                StoreString(aSettings.ShortMonthNames[Month - 1])}
               else {
                StoreString(aSettings.LongMonthNames[Month - 1]);
              };
            };
          } else if ($tmp2 === "D") {
            var $tmp4 = Count;
            if ($tmp4 === 1) {
              StoreInt(Day,0)}
             else if ($tmp4 === 2) {
              StoreInt(Day,2)}
             else if ($tmp4 === 3) {
              StoreString(aSettings.ShortDayNames[DayOfWeek - 1])}
             else if ($tmp4 === 4) {
              StoreString(aSettings.LongDayNames[DayOfWeek - 1])}
             else if ($tmp4 === 5) {
              StoreFormat(aSettings.ShortDateFormat,Nesting + 1,false)}
             else {
              StoreFormat(aSettings.LongDateFormat,Nesting + 1,false);
            };
          } else if ($tmp2 === "H") {
            if (isInterval) {
              StoreInt(Hour + (pas.System.Trunc(Math.abs(DateTime)) * 24),0)}
             else if (Clock12) {
              tmp = Hour % 12;
              if (tmp === 0) tmp = 12;
              if (Count === 1) {
                StoreInt(tmp,0)}
               else StoreInt(tmp,2);
            } else {
              if (Count === 1) {
                StoreInt(Hour,0)}
               else StoreInt(Hour,2);
            }}
           else if ($tmp2 === "N") {
            if (isInterval) {
              StoreInt(Minute + ((Hour + (pas.System.Trunc(Math.abs(DateTime)) * 24)) * 60),0)}
             else if (Count === 1) {
              StoreInt(Minute,0)}
             else StoreInt(Minute,2)}
           else if ($tmp2 === "S") {
            if (isInterval) {
              StoreInt(Second + ((Minute + ((Hour + (pas.System.Trunc(Math.abs(DateTime)) * 24)) * 60)) * 60),0)}
             else if (Count === 1) {
              StoreInt(Second,0)}
             else StoreInt(Second,2)}
           else if ($tmp2 === "Z") {
            if (Count === 1) {
              StoreInt(MilliSecond,0)}
             else StoreInt(MilliSecond,3)}
           else if ($tmp2 === "T") {
            if (Count === 1) {
              StoreFormat(aSettings.ShortTimeFormat,Nesting + 1,true)}
             else StoreFormat(aSettings.LongTimeFormat,Nesting + 1,true)}
           else if ($tmp2 === "C") {
            StoreFormat(aSettings.ShortDateFormat,Nesting + 1,false);
            if ((Hour !== 0) || (Minute !== 0) || (Second !== 0)) {
              StoreString(" ");
              StoreFormat(aSettings.LongTimeFormat,Nesting + 1,true);
            };
          } else if ($tmp2 === "F") {
            StoreFormat(aSettings.ShortDateFormat,Nesting + 1,false);
            StoreString(" ");
            StoreFormat(aSettings.LongTimeFormat,Nesting + 1,true);
          };
          prevlasttoken = lastformattoken;
          lastformattoken = Token;
        } else {
          StoreString(Token);
        };
        FormatCurrent += Count;
      };
    };
    $mod.DecodeDateFully(DateTime,{get: function () {
        return Year;
      }, set: function (v) {
        Year = v;
      }},{get: function () {
        return Month;
      }, set: function (v) {
        Month = v;
      }},{get: function () {
        return Day;
      }, set: function (v) {
        Day = v;
      }},{get: function () {
        return DayOfWeek;
      }, set: function (v) {
        DayOfWeek = v;
      }});
    $mod.DecodeTime(DateTime,{get: function () {
        return Hour;
      }, set: function (v) {
        Hour = v;
      }},{get: function () {
        return Minute;
      }, set: function (v) {
        Minute = v;
      }},{get: function () {
        return Second;
      }, set: function (v) {
        Second = v;
      }},{get: function () {
        return MilliSecond;
      }, set: function (v) {
        MilliSecond = v;
      }});
    if (FormatStr !== "") {
      StoreFormat(FormatStr,0,false)}
     else StoreFormat("C",0,false);
    return Result;
  };
  this.CurrencyFormat = 0;
  this.NegCurrFormat = 0;
  this.CurrencyDecimals = 0;
  this.CurrencyString = "";
  this.FloattoCurr = function (Value) {
    var Result = 0;
    if (!$mod.TryFloatToCurr(Value,{get: function () {
        return Result;
      }, set: function (v) {
        Result = v;
      }})) throw $mod.EConvertError.$create("CreateFmt",[rtl.getResStr(pas.RTLConsts,"SInvalidCurrency"),pas.System.VarRecs(18,$mod.FloatToStr(Value))]);
    return Result;
  };
  this.TryFloatToCurr = function (Value, AResult) {
    var Result = false;
    Result = ((Value * 10000) >= $mod.MinCurrency) && ((Value * 10000) <= $mod.MaxCurrency);
    if (Result) AResult.set(rtl.trunc(Value * 10000));
    return Result;
  };
  this.CurrToStr = function (Value) {
    var Result = "";
    Result = $mod.FloatToStrF$1(Value / 10000,1,-1,0,$mod.FormatSettings);
    return Result;
  };
  this.CurrToStr$1 = function (Value, aSettings) {
    var Result = "";
    Result = $mod.FloatToStrF$1(Value / 10000,1,-1,0,aSettings);
    return Result;
  };
  this.StrToCurr = function (S) {
    var Result = 0;
    if (!$mod.TryStrToCurr(S,{get: function () {
        return Result;
      }, set: function (v) {
        Result = v;
      }})) throw $mod.EConvertError.$create("CreateFmt",[rtl.getResStr(pas.RTLConsts,"SInvalidCurrency"),pas.System.VarRecs(18,S)]);
    return Result;
  };
  this.StrToCurr$1 = function (S, aSettings) {
    var Result = 0;
    if (!$mod.TryStrToCurr$1(S,{get: function () {
        return Result;
      }, set: function (v) {
        Result = v;
      }},aSettings)) throw $mod.EConvertError.$create("CreateFmt",[rtl.getResStr(pas.RTLConsts,"SInvalidCurrency"),pas.System.VarRecs(18,S)]);
    return Result;
  };
  this.TryStrToCurr = function (S, Value) {
    var Result = false;
    var D = 0.0;
    Result = $mod.TryStrToFloat$3(S,{get: function () {
        return D;
      }, set: function (v) {
        D = v;
      }},$mod.FormatSettings);
    if (Result) Value.set(rtl.trunc(D * 10000));
    return Result;
  };
  this.TryStrToCurr$1 = function (S, Value, aSettings) {
    var Result = false;
    var D = 0.0;
    Result = $mod.TryStrToFloat$3(S,{get: function () {
        return D;
      }, set: function (v) {
        D = v;
      }},aSettings);
    if (Result) Value.set(rtl.trunc(D * 10000));
    return Result;
  };
  this.StrToCurrDef = function (S, Default) {
    var Result = 0;
    var R = 0;
    if ($mod.TryStrToCurr$1(S,{get: function () {
        return R;
      }, set: function (v) {
        R = v;
      }},$mod.FormatSettings)) {
      Result = R}
     else Result = Default;
    return Result;
  };
  this.StrToCurrDef$1 = function (S, Default, aSettings) {
    var Result = 0;
    var R = 0;
    if ($mod.TryStrToCurr$1(S,{get: function () {
        return R;
      }, set: function (v) {
        R = v;
      }},aSettings)) {
      Result = R}
     else Result = Default;
    return Result;
  };
  this.$rtti.$DynArray("TPathStrArray",{eltype: rtl.string});
  this.ChangeFileExt = function (FileName, Extension) {
    var Result = "";
    var i = 0;
    var EndSep = {};
    var SOF = false;
    i = FileName.length;
    EndSep = rtl.unionSet(rtl.unionSet(pas.System.AllowDirectorySeparators,pas.System.AllowDriveSeparators),rtl.createSet(pas.System.ExtensionSeparator.charCodeAt()));
    while ((i > 0) && !(FileName.charCodeAt(i - 1) in EndSep)) i -= 1;
    if ((i === 0) || (FileName.charAt(i - 1) !== pas.System.ExtensionSeparator)) {
      i = FileName.length + 1}
     else {
      SOF = (i === 1) || (FileName.charCodeAt(i - 1 - 1) in pas.System.AllowDirectorySeparators);
      if (SOF && !pas.System.FirstDotAtFileNameStartIsExtension) i = FileName.length + 1;
    };
    Result = pas.System.Copy(FileName,1,i - 1) + Extension;
    return Result;
  };
  this.ExtractFilePath = function (FileName) {
    var Result = "";
    var i = 0;
    var EndSep = {};
    i = FileName.length;
    EndSep = rtl.unionSet(pas.System.AllowDirectorySeparators,pas.System.AllowDriveSeparators);
    while ((i > 0) && !$impl.CharInSet$1(FileName.charAt(i - 1),EndSep)) i -= 1;
    if (i > 0) {
      Result = pas.System.Copy(FileName,1,i)}
     else Result = "";
    return Result;
  };
  this.ExtractFileDrive = function (FileName) {
    var Result = "";
    var i = 0;
    var l = 0;
    Result = "";
    l = FileName.length;
    if (l < 2) return Result;
    if ($impl.CharInSet$1(FileName.charAt(1),pas.System.AllowDriveSeparators)) {
      Result = pas.System.Copy(FileName,1,2)}
     else if ($impl.CharInSet$1(FileName.charAt(0),pas.System.AllowDirectorySeparators) && $impl.CharInSet$1(FileName.charAt(1),pas.System.AllowDirectorySeparators)) {
      i = 2;
      while ((i < l) && !$impl.CharInSet$1(FileName.charAt((i + 1) - 1),pas.System.AllowDirectorySeparators)) i += 1;
      i += 1;
      while ((i < l) && !$impl.CharInSet$1(FileName.charAt((i + 1) - 1),pas.System.AllowDirectorySeparators)) i += 1;
      Result = pas.System.Copy(FileName,1,i);
    };
    return Result;
  };
  this.ExtractFileName = function (FileName) {
    var Result = "";
    var i = 0;
    var EndSep = {};
    i = FileName.length;
    EndSep = rtl.unionSet(pas.System.AllowDirectorySeparators,pas.System.AllowDriveSeparators);
    while ((i > 0) && !$impl.CharInSet$1(FileName.charAt(i - 1),EndSep)) i -= 1;
    Result = pas.System.Copy(FileName,i + 1,2147483647);
    return Result;
  };
  this.ExtractFileExt = function (FileName) {
    var Result = "";
    var i = 0;
    var EndSep = {};
    var SOF = false;
    Result = "";
    i = FileName.length;
    EndSep = rtl.unionSet(rtl.unionSet(pas.System.AllowDirectorySeparators,pas.System.AllowDriveSeparators),rtl.createSet(pas.System.ExtensionSeparator.charCodeAt()));
    while ((i > 0) && !$impl.CharInSet$1(FileName.charAt(i - 1),EndSep)) i -= 1;
    if ((i > 0) && (FileName.charAt(i - 1) === pas.System.ExtensionSeparator)) {
      SOF = (i === 1) || (FileName.charCodeAt(i - 1 - 1) in pas.System.AllowDirectorySeparators);
      if (!SOF || pas.System.FirstDotAtFileNameStartIsExtension) Result = pas.System.Copy(FileName,i,2147483647);
    } else Result = "";
    return Result;
  };
  this.ExtractFileDir = function (FileName) {
    var Result = "";
    var i = 0;
    var EndSep = {};
    i = FileName.length;
    EndSep = rtl.unionSet(pas.System.AllowDirectorySeparators,pas.System.AllowDriveSeparators);
    while ((i > 0) && !$impl.CharInSet$1(FileName.charAt(i - 1),EndSep)) i -= 1;
    if ((i > 1) && $impl.CharInSet$1(FileName.charAt(i - 1),pas.System.AllowDirectorySeparators) && !$impl.CharInSet$1(FileName.charAt(i - 1 - 1),EndSep)) i -= 1;
    Result = pas.System.Copy(FileName,1,i);
    return Result;
  };
  this.ExtractRelativepath = function (BaseName, DestName) {
    var Result = "";
    var OneLevelBack = "";
    var Source = "";
    var Dest = "";
    var Sc = 0;
    var Dc = 0;
    var I = 0;
    var J = 0;
    var SD = [];
    var DD = [];
    OneLevelBack = ".." + pas.System.PathDelim;
    if ($mod.UpperCase($mod.ExtractFileDrive(BaseName)) !== $mod.UpperCase($mod.ExtractFileDrive(DestName))) {
      Result = DestName;
      return Result;
    };
    Source = $mod.ExcludeTrailingPathDelimiter($mod.ExtractFilePath(BaseName));
    Dest = $mod.ExcludeTrailingPathDelimiter($mod.ExtractFilePath(DestName));
    SD = $mod.GetDirs(Source);
    Sc = rtl.length(SD);
    DD = $mod.GetDirs(Dest);
    Dc = rtl.length(SD);
    I = 0;
    while ((I < Dc) && (I < Sc)) {
      if ($mod.SameText(DD[I],SD[I])) {
        I += 1}
       else break;
    };
    Result = "";
    for (var $l = I, $end = Sc; $l <= $end; $l++) {
      J = $l;
      Result = Result + OneLevelBack;
    };
    for (var $l1 = I, $end1 = Dc; $l1 <= $end1; $l1++) {
      J = $l1;
      Result = Result + DD[J] + pas.System.PathDelim;
    };
    Result = Result + $mod.ExtractFileName(DestName);
    return Result;
  };
  this.IncludeTrailingPathDelimiter = function (Path) {
    var Result = "";
    var l = 0;
    Result = Path;
    l = Result.length;
    if ((l === 0) || !$impl.CharInSet$1(Result.charAt(l - 1),pas.System.AllowDirectorySeparators)) Result = Result + pas.System.PathDelim;
    return Result;
  };
  this.ExcludeTrailingPathDelimiter = function (Path) {
    var Result = "";
    var L = 0;
    L = Path.length;
    if ((L > 0) && $impl.CharInSet$1(Path.charAt(L - 1),pas.System.AllowDirectorySeparators)) L -= 1;
    Result = pas.System.Copy(Path,1,L);
    return Result;
  };
  this.IncludeLeadingPathDelimiter = function (Path) {
    var Result = "";
    var l = 0;
    Result = Path;
    l = Result.length;
    if ((l === 0) || !$impl.CharInSet$1(Result.charAt(0),pas.System.AllowDirectorySeparators)) Result = pas.System.PathDelim + Result;
    return Result;
  };
  this.ExcludeLeadingPathDelimiter = function (Path) {
    var Result = "";
    var L = 0;
    Result = Path;
    L = Result.length;
    if ((L > 0) && $impl.CharInSet$1(Result.charAt(0),pas.System.AllowDirectorySeparators)) pas.System.Delete({get: function () {
        return Result;
      }, set: function (v) {
        Result = v;
      }},1,1);
    return Result;
  };
  this.IsPathDelimiter = function (Path, Index) {
    var Result = false;
    Result = (Index > 0) && (Index <= Path.length) && $impl.CharInSet$1(Path.charAt(Index - 1),pas.System.AllowDirectorySeparators);
    return Result;
  };
  this.SetDirSeparators = function (FileName) {
    var Result = "";
    var I = 0;
    Result = FileName;
    for (var $l = 1, $end = Result.length; $l <= $end; $l++) {
      I = $l;
      if ($impl.CharInSet$1(Result.charAt(I - 1),pas.System.AllowDirectorySeparators)) Result = rtl.setCharAt(Result,I - 1,pas.System.PathDelim);
    };
    return Result;
  };
  this.GetDirs = function (DirName) {
    var Result = [];
    var I = 0;
    var J = 0;
    var L = 0;
    var D = "";
    I = 1;
    J = 0;
    L = 0;
    Result = rtl.arraySetLength(Result,"",DirName.length);
    while (I <= DirName.length) {
      if ($impl.CharInSet$1(DirName.charAt(I - 1),pas.System.AllowDirectorySeparators)) {
        D = pas.System.Copy(DirName,J + 1,J - I);
        if (D !== "") {
          Result[L] = D;
          L += 1;
        };
        J = I;
      };
      I += 1;
    };
    Result = rtl.arraySetLength(Result,"",L);
    return Result;
  };
  this.ConcatPaths = function (Paths) {
    var Result = "";
    var I = 0;
    if (rtl.length(Paths) > 0) {
      Result = Paths[0];
      for (var $l = 1, $end = rtl.length(Paths) - 1; $l <= $end; $l++) {
        I = $l;
        Result = $mod.IncludeTrailingPathDelimiter(Result) + $mod.ExcludeLeadingPathDelimiter(Paths[I]);
      };
    } else Result = "";
    return Result;
  };
  this.GUID_NULL = pas.System.TGuid.$clone({D1: 0x00000000, D2: 0x0000, D3: 0x0000, D4: [0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00]});
  this.Supports = function (Instance, AClass, Obj) {
    var Result = false;
    Result = (Instance !== null) && (Instance.QueryInterface(pas.System.IObjectInstance,Obj) === 0) && Obj.get().$class.InheritsFrom(AClass);
    return Result;
  };
  this.Supports$1 = function (Instance, IID, Intf) {
    var Result = false;
    Result = (Instance !== null) && (Instance.QueryInterface(IID,Intf) === 0);
    return Result;
  };
  this.Supports$2 = function (Instance, IID, Intf) {
    var Result = false;
    Result = (Instance !== null) && Instance.GetInterface(IID,Intf);
    return Result;
  };
  this.Supports$3 = function (Instance, IID, Intf) {
    var Result = false;
    Result = (Instance !== null) && Instance.GetInterfaceByStr(IID,Intf);
    return Result;
  };
  this.Supports$4 = function (Instance, AClass) {
    var Result = false;
    var Temp = null;
    Result = $mod.Supports(Instance,AClass,{get: function () {
        return Temp;
      }, set: function (v) {
        Temp = v;
      }});
    return Result;
  };
  this.Supports$5 = function (Instance, IID) {
    var Result = false;
    var Temp = null;
    try {
      Result = $mod.Supports$1(Instance,IID,{get: function () {
          return Temp;
        }, set: function (v) {
          Temp = v;
        }});
    } finally {
      rtl._Release(Temp);
    };
    return Result;
  };
  this.Supports$6 = function (Instance, IID) {
    var Result = false;
    var Temp = null;
    Result = $mod.Supports$2(Instance,IID,{get: function () {
        return Temp;
      }, set: function (v) {
        Temp = v;
      }});
    if (Temp && Temp.$kind==='com') Temp._Release();
    return Result;
  };
  this.Supports$7 = function (Instance, IID) {
    var Result = false;
    var Temp = null;
    Result = $mod.Supports$3(Instance,IID,{get: function () {
        return Temp;
      }, set: function (v) {
        Temp = v;
      }});
    if (Temp && Temp.$kind==='com') Temp._Release();
    return Result;
  };
  this.Supports$8 = function (AClass, IID) {
    var Result = false;
    var maps = undefined;
    if (AClass === null) return false;
    maps = AClass["$intfmaps"];
    if (!maps) return false;
    if (maps[$mod.GUIDToString(IID)]) return true;
    Result = false;
    return Result;
  };
  this.Supports$9 = function (AClass, IID) {
    var Result = false;
    var maps = undefined;
    if (AClass === null) return false;
    maps = AClass["$intfmaps"];
    if (!maps) return false;
    if (maps[$mod.UpperCase(IID)]) return true;
    Result = false;
    return Result;
  };
  this.TryStringToGUID = function (s, Guid) {
    var Result = false;
    var re = null;
    if (s.length !== 38) return false;
    re = new RegExp("^\\{[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\\}$");
    Result = re.test(s);
    if (!Result) {
      Guid.D1 = 0;
      return Result;
    };
    rtl.strToGUIDR(s,Guid);
    Result = true;
    return Result;
  };
  this.StringToGUID = function (S) {
    var Result = pas.System.TGuid.$new();
    if (!$mod.TryStringToGUID(S,Result)) throw $mod.EConvertError.$create("CreateFmt",[rtl.getResStr(pas.RTLConsts,"SInvalidGUID"),pas.System.VarRecs(18,S)]);
    return Result;
  };
  this.GUIDToString = function (guid) {
    var Result = "";
    Result = rtl.guidrToStr(guid);
    return Result;
  };
  this.IsEqualGUID = function (guid1, guid2) {
    var Result = false;
    var i = 0;
    if ((guid1.D1 !== guid2.D1) || (guid1.D2 !== guid2.D2) || (guid1.D3 !== guid2.D3)) return false;
    for (i = 0; i <= 7; i++) if (guid1.D4[i] !== guid2.D4[i]) return false;
    Result = true;
    return Result;
  };
  this.GuidCase = function (guid, List) {
    var Result = 0;
    for (var $l = rtl.length(List) - 1; $l >= 0; $l--) {
      Result = $l;
      if ($mod.IsEqualGUID(guid,List[Result])) return Result;
    };
    Result = -1;
    return Result;
  };
  this.CreateGUID = function (GUID) {
    var Result = 0;
    function R(B) {
      var Result = 0;
      var v = 0;
      v = pas.System.Random(256);
      while (B > 1) {
        v = (v * 256) + pas.System.Random(256);
        B -= 1;
      };
      Result = v;
      return Result;
    };
    var I = 0;
    Result = 0;
    GUID.D1 = R(4);
    GUID.D2 = R(2);
    GUID.D3 = R(2);
    for (I = 0; I <= 7; I++) GUID.D4[I] = R(1);
    return Result;
  };
  this.EncodeHTMLEntities = function (S) {
    var Result = "";
    Result = "";
    if (S === "") return Result;
    return S.replace(/[\u00A0-\u9999<>\&]/gim, function(i) {
      return '&#'+i.charCodeAt(0)+';';
    });
    return Result;
  };
  this.$rtti.$DynArray("TCharArray",{eltype: rtl.char});
  this.$rtti.$Int("TByteBitIndex",{minvalue: 0, maxvalue: 7, ordtype: 1});
  this.$rtti.$Int("TShortIntBitIndex",{minvalue: 0, maxvalue: 7, ordtype: 1});
  this.$rtti.$Int("TWordBitIndex",{minvalue: 0, maxvalue: 15, ordtype: 1});
  this.$rtti.$Int("TSmallIntBitIndex",{minvalue: 0, maxvalue: 15, ordtype: 1});
  this.$rtti.$Int("TCardinalBitIndex",{minvalue: 0, maxvalue: 31, ordtype: 1});
  this.$rtti.$Int("TIntegerBitIndex",{minvalue: 0, maxvalue: 31, ordtype: 1});
  this.$rtti.$Int("TQwordBitIndex",{minvalue: 0, maxvalue: 52, ordtype: 1});
  this.$rtti.$Int("TInt64BitIndex",{minvalue: 0, maxvalue: 52, ordtype: 1});
  this.$rtti.$Int("TNativeIntBitIndex",{minvalue: 0, maxvalue: 52, ordtype: 1});
  this.$rtti.$Int("TNativeUIntBitIndex",{minvalue: 0, maxvalue: 52, ordtype: 1});
  this.CPUEndian = 1;
  rtl.createHelper(this,"TGuidHelper",null,function () {
    this.Create = function (Src, BigEndian) {
      var Result = pas.System.TGuid.$new();
      Result.$assign(Src);
      if (!BigEndian) {
        Result.D1 = $mod.SwapEndian$1(Result.D1);
        Result.D2 = $mod.SwapEndian(Result.D2);
        Result.D3 = $mod.SwapEndian(Result.D3);
      };
      return Result;
    };
    this.Create$1 = function (Buf, AStartIndex, BigEndian) {
      var Result = pas.System.TGuid.$new();
      var A = 0;
      var B = 0;
      var C = 0;
      var V = null;
      V = new DataView(Buf);
      if (BigEndian) {
        A = V.getUint32(AStartIndex);
        B = V.getUint16(AStartIndex + 4);
        C = V.getUint16(AStartIndex + 6);
      } else {
        A = $mod.SwapEndian$1(V.getUint32(AStartIndex));
        B = $mod.SwapEndian(V.getUint16(AStartIndex + 4));
        C = $mod.SwapEndian(V.getUint16(AStartIndex + 6));
      };
      Result.$assign($mod.TGuidHelper.Create$7(A,B,C,V.getUint8(AStartIndex + 8),V.getUint8(AStartIndex + 9),V.getUint8(AStartIndex + 10),V.getUint8(AStartIndex + 11),V.getUint8(AStartIndex + 12),V.getUint8(AStartIndex + 13),V.getUint8(AStartIndex + 14),V.getUint8(AStartIndex + 15)));
      return Result;
    };
    this.Create$2 = function (Data, AStartIndex, BigEndian) {
      var Result = pas.System.TGuid.$new();
      var D = null;
      if ((rtl.length(Data) - AStartIndex) < 16) throw $mod.EArgumentException.$create("CreateFmt",["The length of a GUID array must be at least %d",[]]);
      D = Uint8Array.from(Data);
      Result.$assign($mod.TGuidHelper.Create$1(D.buffer,AStartIndex,BigEndian));
      return Result;
    };
    this.Create$3 = function (B, DataEndian) {
      var Result = pas.System.TGuid.$new();
      Result.$assign($mod.TGuidHelper.Create$4(B,0,DataEndian));
      return Result;
    };
    this.Create$4 = function (B, AStartIndex, DataEndian) {
      var Result = pas.System.TGuid.$new();
      if ((rtl.length(B) - AStartIndex) < 16) throw $mod.EArgumentException.$create("CreateFmt",["The length of a GUID array must be at least %d",[]]);
      Result.$assign($mod.TGuidHelper.Create$2(B,AStartIndex,DataEndian === 1));
      return Result;
    };
    this.Create$5 = function (S) {
      var Result = pas.System.TGuid.$new();
      Result.$assign($mod.StringToGUID(S));
      return Result;
    };
    this.Create$6 = function (A, B, C, D) {
      var Result = pas.System.TGuid.$new();
      if (rtl.length(D) !== 8) throw $mod.EArgumentException.$create("CreateFmt",["The length of a GUID array must be %d",[]]);
      Result.$assign($mod.TGuidHelper.Create$7(A >>> 0,B & 65535,C & 65535,D[0],D[1],D[2],D[3],D[4],D[5],D[6],D[7]));
      return Result;
    };
    this.Create$7 = function (A, B, C, D, E, F, G, H, I, J, K) {
      var Result = pas.System.TGuid.$new();
      Result.D1 = A;
      Result.D2 = B;
      Result.D3 = C;
      Result.D4[0] = D;
      Result.D4[1] = E;
      Result.D4[2] = F;
      Result.D4[3] = G;
      Result.D4[4] = H;
      Result.D4[5] = I;
      Result.D4[6] = J;
      Result.D4[7] = K;
      return Result;
    };
    this.NewGuid = function () {
      var Result = pas.System.TGuid.$new();
      $mod.CreateGUID(Result);
      return Result;
    };
    this.ToByteArray = function (DataEndian) {
      var Result = [];
      var D = null;
      var V = null;
      var I = 0;
      D = new Uint8Array(16);
      V = new DataView(D.buffer);
      V.setUint32(0,this.D1,DataEndian === 0);
      V.setUint16(4,this.D2,DataEndian === 0);
      V.setUint16(6,this.D3,DataEndian === 0);
      for (I = 0; I <= 7; I++) V.setUint8(8 + I,this.D4[I]);
      Result = rtl.arraySetLength(Result,0,16);
      for (I = 0; I <= 15; I++) Result[I] = V.getUint8(I);
      return Result;
    };
    this.ToString = function (SkipBrackets) {
      var Result = "";
      Result = $mod.GUIDToString(this);
      if (SkipBrackets) Result = pas.System.Copy(Result,2,Result.length - 2);
      return Result;
    };
  });
  this.TStringSplitOptions = {"0": "None", None: 0, "1": "ExcludeEmpty", ExcludeEmpty: 1};
  this.$rtti.$Enum("TStringSplitOptions",{minvalue: 0, maxvalue: 1, ordtype: 1, enumtype: this.TStringSplitOptions});
  rtl.createHelper(this,"TStringHelper",null,function () {
    this.Empty = "";
    this.GetChar = function (AIndex) {
      var Result = "";
      Result = this.get().charAt((AIndex + 1) - 1);
      return Result;
    };
    this.GetLength = function () {
      var Result = 0;
      Result = this.get().length;
      return Result;
    };
    this.Compare = function (A, B) {
      var Result = 0;
      Result = $mod.TStringHelper.Compare$5(A,0,B,0,B.length,{});
      return Result;
    };
    this.Compare$1 = function (A, B, IgnoreCase) {
      var Result = 0;
      if (IgnoreCase) {
        Result = $mod.TStringHelper.Compare$2(A,B,rtl.createSet(0))}
       else Result = $mod.TStringHelper.Compare$2(A,B,{});
      return Result;
    };
    this.Compare$2 = function (A, B, Options) {
      var Result = 0;
      Result = $mod.TStringHelper.Compare$5(A,0,B,0,B.length,rtl.refSet(Options));
      return Result;
    };
    this.Compare$3 = function (A, IndexA, B, IndexB, ALen) {
      var Result = 0;
      Result = $mod.TStringHelper.Compare$5(A,IndexA,B,IndexB,ALen,{});
      return Result;
    };
    this.Compare$4 = function (A, IndexA, B, IndexB, ALen, IgnoreCase) {
      var Result = 0;
      if (IgnoreCase) {
        Result = $mod.TStringHelper.Compare$5(A,IndexA,B,IndexB,ALen,rtl.createSet(0))}
       else Result = $mod.TStringHelper.Compare$5(A,IndexA,B,IndexB,ALen,{});
      return Result;
    };
    this.Compare$5 = function (A, IndexA, B, IndexB, ALen, Options) {
      var Result = 0;
      var AL = "";
      var BL = "";
      AL = pas.System.Copy(A,IndexA + 1,ALen);
      BL = pas.System.Copy(B,IndexB + 1,ALen);
      if (0 in Options) {
        Result = $mod.TStringHelper.UpperCase(AL).localeCompare($mod.TStringHelper.UpperCase(BL))}
       else Result = AL.localeCompare(BL);
      return Result;
    };
    this.CompareOrdinal = function (A, B) {
      var Result = 0;
      var L = 0;
      L = B.length;
      if (L > A.length) L = A.length;
      Result = $mod.TStringHelper.CompareOrdinal$1(A,0,B,0,L);
      return Result;
    };
    this.CompareOrdinal$1 = function (A, IndexA, B, IndexB, ALen) {
      var Result = 0;
      var I = 0;
      var M = 0;
      M = A.length - IndexA;
      if (M > (B.length - IndexB)) M = B.length - IndexB;
      if (M > ALen) M = ALen;
      I = 0;
      Result = 0;
      while ((Result === 0) && (I < M)) {
        Result = A.charCodeAt(IndexA + I) - B.charCodeAt(IndexB + I);
        I += 1;
      };
      return Result;
    };
    this.CompareText = function (A, B) {
      var Result = 0;
      Result = $mod.CompareText(A,B);
      return Result;
    };
    this.Copy = function (Str) {
      var Result = "";
      Result = Str;
      return Result;
    };
    this.Create = function (AChar, ACount) {
      var Result = "";
      Result = pas.System.StringOfChar(AChar,ACount);
      return Result;
    };
    this.Create$1 = function (AValue) {
      var Result = "";
      Result = $mod.TStringHelper.Create$2(AValue,0,rtl.length(AValue));
      return Result;
    };
    this.Create$2 = function (AValue, StartIndex, ALen) {
      var Result = "";
      var I = 0;
      Result = rtl.strSetLength(Result,ALen);
      for (var $l = 1, $end = ALen; $l <= $end; $l++) {
        I = $l;
        Result = rtl.setCharAt(Result,I - 1,AValue[(StartIndex + I) - 1]);
      };
      return Result;
    };
    this.EndsText = function (ASubText, AText) {
      var Result = false;
      Result = (ASubText !== "") && ($mod.CompareText(pas.System.Copy(AText,(AText.length - ASubText.length) + 1,ASubText.length),ASubText) === 0);
      return Result;
    };
    this.Equals = function (a, b) {
      var Result = false;
      Result = a === b;
      return Result;
    };
    this.Format = function (AFormat, args) {
      var Result = "";
      Result = $mod.Format(AFormat,args);
      return Result;
    };
    this.IsNullOrEmpty = function (AValue) {
      var Result = false;
      Result = AValue.length === 0;
      return Result;
    };
    this.IsNullOrWhiteSpace = function (AValue) {
      var Result = false;
      Result = $mod.Trim(AValue).length === 0;
      return Result;
    };
    this.Join = function (Separator, Values) {
      var Result = "";
      Result = Values.join(Separator);
      return Result;
    };
    this.Join$1 = function (Separator, Values) {
      var Result = "";
      Result = Values.join(Separator);
      return Result;
    };
    this.Join$2 = function (Separator, Values, StartIndex, ACount) {
      var Result = "";
      var VLen = 0;
      VLen = rtl.length(Values) - 1;
      if ((ACount < 0) || ((StartIndex > 0) && (StartIndex > VLen))) throw $mod.ERangeError.$create("Create$1",[rtl.getResStr(pas.RTLConsts,"SRangeError")]);
      if ((ACount === 0) || (VLen < 0)) {
        Result = ""}
       else Result = Values.slice(StartIndex,StartIndex + ACount).join(Separator);
      return Result;
    };
    this.LowerCase = function (S) {
      var Result = "";
      Result = $mod.LowerCase(S);
      return Result;
    };
    this.Parse = function (AValue) {
      var Result = "";
      Result = $mod.BoolToStr(AValue,false);
      return Result;
    };
    this.Parse$1 = function (AValue) {
      var Result = "";
      Result = $mod.FloatToStr(AValue);
      return Result;
    };
    this.Parse$2 = function (AValue) {
      var Result = "";
      Result = $mod.IntToStr(AValue);
      return Result;
    };
    this.Parse$3 = function (AValue) {
      var Result = "";
      Result = $mod.IntToStr(AValue);
      return Result;
    };
    this.ToBoolean = function (S) {
      var Result = false;
      Result = $mod.StrToBool(S);
      return Result;
    };
    this.ToDouble = function (S) {
      var Result = 0.0;
      Result = $mod.StrToFloat(S);
      return Result;
    };
    this.ToExtended = function (S) {
      var Result = 0.0;
      Result = $mod.StrToFloat(S);
      return Result;
    };
    this.ToNativeInt = function (S) {
      var Result = 0;
      Result = $mod.StrToInt64(S);
      return Result;
    };
    this.ToInteger = function (S) {
      var Result = 0;
      Result = $mod.StrToInt(S);
      return Result;
    };
    this.UpperCase = function (S) {
      var Result = "";
      Result = $mod.UpperCase(S);
      return Result;
    };
    this.ToCharArray = function (S) {
      var Result = [];
      var I = 0;
      var Len = 0;
      Len = S.length;
      Result = rtl.arraySetLength(Result,"",Len);
      for (var $l = 1, $end = Len; $l <= $end; $l++) {
        I = $l;
        Result[I - 1] = S.charAt(I - 1);
      };
      return Result;
    };
    this.CompareTo = function (B) {
      var Result = 0;
      Result = $mod.TStringHelper.Compare(this.get(),B);
      return Result;
    };
    this.Contains = function (AValue) {
      var Result = false;
      Result = (AValue !== "") && (pas.System.Pos(AValue,this.get()) > 0);
      return Result;
    };
    this.CountChar = function (C) {
      var Result = 0;
      var S = "";
      Result = 0;
      for (var $in = this.get(), $l = 0, $end = $in.length - 1; $l <= $end; $l++) {
        S = $in.charAt($l);
        if (S === C) Result += 1;
      };
      return Result;
    };
    this.DeQuotedString = function () {
      var Result = "";
      Result = $mod.TStringHelper.DeQuotedString$1.call(this,"'");
      return Result;
    };
    this.DeQuotedString$1 = function (AQuoteChar) {
      var Result = "";
      var L = 0;
      var I = 0;
      var Res = [];
      var PS = 0;
      var PD = 0;
      var IsQuote = false;
      L = this.get().length;
      if ((L < 2) || !((this.get().charAt(0) === AQuoteChar) && (this.get().charAt(L - 1) === AQuoteChar))) return this.get();
      Res = rtl.arraySetLength(Res,"",L);
      IsQuote = false;
      PS = 2;
      PD = 1;
      for (var $l = 2, $end = L - 1; $l <= $end; $l++) {
        I = $l;
        if (this.get().charAt(PS - 1) === AQuoteChar) {
          IsQuote = !IsQuote;
          if (!IsQuote) {
            Result = rtl.setCharAt(Result,PD - 1,this.get().charAt(PS - 1));
            PD += 1;
          };
        } else {
          if (IsQuote) IsQuote = false;
          Result = rtl.setCharAt(Result,PD - 1,this.get().charAt(PS - 1));
          PD += 1;
        };
        PS += 1;
      };
      Result = rtl.strSetLength(Result,PD - 1);
      return Result;
    };
    this.EndsWith = function (AValue) {
      var Result = false;
      Result = $mod.TStringHelper.EndsWith$1.call(this,AValue,false);
      return Result;
    };
    this.EndsWith$1 = function (AValue, IgnoreCase) {
      var Result = false;
      var L = 0;
      var S = "";
      L = AValue.length;
      Result = L === 0;
      if (!Result) {
        S = pas.System.Copy(this.get(),($mod.TStringHelper.GetLength.call(this) - L) + 1,L);
        Result = S.length === L;
        if (Result) if (IgnoreCase) {
          Result = $mod.TStringHelper.CompareText(S,AValue) === 0}
         else Result = S === AValue;
      };
      return Result;
    };
    this.Equals$1 = function (AValue) {
      var Result = false;
      Result = this.get() === AValue;
      return Result;
    };
    this.Format$1 = function (args) {
      var Result = "";
      Result = $mod.Format(this.get(),args);
      return Result;
    };
    this.GetHashCode = function () {
      var Result = 0;
      var P = 0;
      var pmax = 0;
      var L = null;
      L = this.get();
      Result = 0;
      P = 1;
      pmax = $mod.TStringHelper.GetLength.call(this) + 1;
      while (P < pmax) {
        Result = rtl.xor(((Result << 5) - Result) >>> 0,L.charCodeAt(P));
        P += 1;
      };
      return Result;
    };
    this.IndexOf = function (AValue) {
      var Result = 0;
      Result = $mod.TStringHelper.IndexOf$4.call(this,AValue,0,$mod.TStringHelper.GetLength.call(this));
      return Result;
    };
    this.IndexOf$1 = function (AValue) {
      var Result = 0;
      Result = $mod.TStringHelper.IndexOf$5.call(this,AValue,0,$mod.TStringHelper.GetLength.call(this));
      return Result;
    };
    this.IndexOf$2 = function (AValue, StartIndex) {
      var Result = 0;
      Result = $mod.TStringHelper.IndexOf$4.call(this,AValue,StartIndex,$mod.TStringHelper.GetLength.call(this));
      return Result;
    };
    this.IndexOf$3 = function (AValue, StartIndex) {
      var Result = 0;
      Result = $mod.TStringHelper.IndexOf$5.call(this,AValue,StartIndex,$mod.TStringHelper.GetLength.call(this));
      return Result;
    };
    this.IndexOf$4 = function (AValue, StartIndex, ACount) {
      var Result = 0;
      var S = "";
      S = pas.System.Copy(this.get(),StartIndex + 1,ACount);
      Result = pas.System.Pos(AValue,S) - 1;
      if (Result !== -1) Result = Result + StartIndex;
      return Result;
    };
    this.IndexOf$5 = function (AValue, StartIndex, ACount) {
      var Result = 0;
      var S = "";
      S = pas.System.Copy(this.get(),StartIndex + 1,ACount);
      Result = pas.System.Pos(AValue,S) - 1;
      if (Result !== -1) Result = Result + StartIndex;
      return Result;
    };
    this.IndexOfUnQuoted = function (AValue, StartQuote, EndQuote, StartIndex) {
      var $Self = this;
      var Result = 0;
      var LV = 0;
      var S = "";
      function MatchAt(I) {
        var Result = false;
        var J = 0;
        J = 1;
        do {
          Result = S.charAt((I + J) - 1 - 1) === AValue.charAt(J - 1);
          J += 1;
        } while (!(!Result || (J > LV)));
        return Result;
      };
      var I = 0;
      var L = 0;
      var Q = 0;
      S = $Self.get();
      Result = -1;
      LV = AValue.length;
      L = ($mod.TStringHelper.GetLength.call($Self) - LV) + 1;
      if (L < 0) L = 0;
      I = StartIndex + 1;
      Q = 0;
      if (StartQuote === EndQuote) {
        while ((Result === -1) && (I <= L)) {
          if (S.charAt(I - 1) === StartQuote) Q = 1 - Q;
          if ((Q === 0) && MatchAt(I)) Result = I - 1;
          I += 1;
        };
      } else {
        while ((Result === -1) && (I <= L)) {
          if (S.charAt(I - 1) === StartQuote) {
            Q += 1}
           else if ((S.charAt(I - 1) === EndQuote) && (Q > 0)) Q -= 1;
          if ((Q === 0) && MatchAt(I)) Result = I - 1;
          I += 1;
        };
      };
      return Result;
    };
    this.IndexOfAny = function (AnyOf) {
      var Result = 0;
      Result = $mod.TStringHelper.IndexOfAny$1.call(this,$mod.TStringHelper.ToCharArray$1.call({get: function () {
          return AnyOf;
        }, set: function (v) {
          rtl.raiseE("EPropReadOnly");
        }}));
      return Result;
    };
    this.IndexOfAny$1 = function (AnyOf) {
      var Result = 0;
      Result = $mod.TStringHelper.IndexOfAny$5.call(this,AnyOf,0,$mod.TStringHelper.GetLength.call(this));
      return Result;
    };
    this.IndexOfAny$2 = function (AnyOf, StartIndex) {
      var Result = 0;
      Result = $mod.TStringHelper.IndexOfAny$3.call(this,$mod.TStringHelper.ToCharArray$1.call({get: function () {
          return AnyOf;
        }, set: function (v) {
          rtl.raiseE("EPropReadOnly");
        }}),StartIndex);
      return Result;
    };
    this.IndexOfAny$3 = function (AnyOf, StartIndex) {
      var Result = 0;
      Result = $mod.TStringHelper.IndexOfAny$5.call(this,AnyOf,StartIndex,$mod.TStringHelper.GetLength.call(this));
      return Result;
    };
    this.IndexOfAny$4 = function (AnyOf, StartIndex, ACount) {
      var Result = 0;
      Result = $mod.TStringHelper.IndexOfAny$5.call(this,$mod.TStringHelper.ToCharArray$1.call({get: function () {
          return AnyOf;
        }, set: function (v) {
          rtl.raiseE("EPropReadOnly");
        }}),StartIndex,ACount);
      return Result;
    };
    this.IndexOfAny$5 = function (AnyOf, StartIndex, ACount) {
      var Result = 0;
      var i = 0;
      var L = 0;
      i = StartIndex + 1;
      L = (i + ACount) - 1;
      if (L > $mod.TStringHelper.GetLength.call(this)) L = $mod.TStringHelper.GetLength.call(this);
      Result = -1;
      while ((Result === -1) && (i <= L)) {
        if ($impl.HaveChar(this.get().charAt(i - 1),AnyOf)) Result = i - 1;
        i += 1;
      };
      return Result;
    };
    this.IndexOfAny$6 = function (AnyOf) {
      var Result = 0;
      Result = $mod.TStringHelper.IndexOfAny$8.call(this,AnyOf,0,$mod.TStringHelper.GetLength.call(this));
      return Result;
    };
    this.IndexOfAny$7 = function (AnyOf, StartIndex) {
      var Result = 0;
      Result = $mod.TStringHelper.IndexOfAny$8.call(this,AnyOf,StartIndex,$mod.TStringHelper.GetLength.call(this) - StartIndex);
      return Result;
    };
    this.IndexOfAny$8 = function (AnyOf, StartIndex, ACount) {
      var Result = 0;
      var M = 0;
      Result = $mod.TStringHelper.IndexOfAny$9.call(this,AnyOf,StartIndex,ACount,{get: function () {
          return M;
        }, set: function (v) {
          M = v;
        }});
      return Result;
    };
    this.IndexOfAny$9 = function (AnyOf, StartIndex, ACount, AMatch) {
      var Result = 0;
      var L = 0;
      var I = 0;
      Result = -1;
      for (var $l = 0, $end = rtl.length(AnyOf) - 1; $l <= $end; $l++) {
        I = $l;
        L = $mod.TStringHelper.IndexOf$5.call(this,AnyOf[I],StartIndex,ACount);
        if ((L >= 0) && ((Result === -1) || (L < Result))) {
          Result = L;
          AMatch.set(I);
        };
      };
      return Result;
    };
    this.IndexOfAnyUnquoted = function (AnyOf, StartQuote, EndQuote) {
      var Result = 0;
      Result = $mod.TStringHelper.IndexOfAnyUnquoted$2.call(this,AnyOf,StartQuote,EndQuote,0,$mod.TStringHelper.GetLength.call(this));
      return Result;
    };
    this.IndexOfAnyUnquoted$1 = function (AnyOf, StartQuote, EndQuote, StartIndex) {
      var Result = 0;
      Result = $mod.TStringHelper.IndexOfAnyUnquoted$2.call(this,AnyOf,StartQuote,EndQuote,StartIndex,$mod.TStringHelper.GetLength.call(this));
      return Result;
    };
    this.IndexOfAnyUnquoted$2 = function (AnyOf, StartQuote, EndQuote, StartIndex, ACount) {
      var Result = 0;
      var I = 0;
      var L = 0;
      var Q = 0;
      Result = -1;
      L = (StartIndex + ACount) - 1;
      if (L > $mod.TStringHelper.GetLength.call(this)) L = $mod.TStringHelper.GetLength.call(this);
      I = StartIndex + 1;
      Q = 0;
      if (StartQuote === EndQuote) {
        while ((Result === -1) && (I <= L)) {
          if (this.get().charAt(I - 1) === StartQuote) Q = 1 - Q;
          if ((Q === 0) && $impl.HaveChar(this.get().charAt(I - 1),AnyOf)) Result = I - 1;
          I += 1;
        };
      } else {
        while ((Result === -1) && (I <= L)) {
          if (this.get().charAt(I - 1) === StartQuote) {
            Q += 1}
           else if ((this.get().charAt(I - 1) === EndQuote) && (Q > 0)) Q -= 1;
          if ((Q === 0) && $impl.HaveChar(this.get().charAt(I - 1),AnyOf)) Result = I - 1;
          I += 1;
        };
      };
      return Result;
    };
    this.IndexOfAnyUnquoted$3 = function (AnyOf, StartQuote, EndQuote, StartIndex, Matched) {
      var Result = 0;
      var L = 0;
      var I = 0;
      Result = -1;
      for (var $l = 0, $end = rtl.length(AnyOf) - 1; $l <= $end; $l++) {
        I = $l;
        L = $mod.TStringHelper.IndexOfUnQuoted.call(this,AnyOf[I],StartQuote,EndQuote,StartIndex);
        if ((L >= 0) && ((Result === -1) || (L < Result))) {
          Result = L;
          Matched.set(I);
        };
      };
      return Result;
    };
    this.Insert = function (StartIndex, AValue) {
      var Result = "";
      pas.System.Insert(AValue,this,StartIndex + 1);
      Result = this.get();
      return Result;
    };
    this.IsDelimiter = function (Delimiters, Index) {
      var Result = false;
      Result = $mod.IsDelimiter(Delimiters,this.get(),Index + 1);
      return Result;
    };
    this.IsEmpty = function () {
      var Result = false;
      Result = $mod.TStringHelper.GetLength.call(this) === 0;
      return Result;
    };
    this.LastDelimiter = function (Delims) {
      var Result = 0;
      Result = $mod.LastDelimiter(Delims,this.get()) - 1;
      return Result;
    };
    this.LastIndexOf = function (AValue) {
      var Result = 0;
      Result = $mod.TStringHelper.LastIndexOf$4.call(this,AValue,$mod.TStringHelper.GetLength.call(this) - 1,$mod.TStringHelper.GetLength.call(this));
      return Result;
    };
    this.LastIndexOf$1 = function (AValue) {
      var Result = 0;
      Result = $mod.TStringHelper.LastIndexOf$5.call(this,AValue,$mod.TStringHelper.GetLength.call(this) - 1,$mod.TStringHelper.GetLength.call(this));
      return Result;
    };
    this.LastIndexOf$2 = function (AValue, AStartIndex) {
      var Result = 0;
      Result = $mod.TStringHelper.LastIndexOf$4.call(this,AValue,AStartIndex,$mod.TStringHelper.GetLength.call(this));
      return Result;
    };
    this.LastIndexOf$3 = function (AValue, AStartIndex) {
      var Result = 0;
      Result = $mod.TStringHelper.LastIndexOf$5.call(this,AValue,AStartIndex,$mod.TStringHelper.GetLength.call(this));
      return Result;
    };
    this.LastIndexOf$4 = function (AValue, AStartIndex, ACount) {
      var Result = 0;
      var Min = 0;
      Result = AStartIndex + 1;
      Min = (Result - ACount) + 1;
      if (Min < 1) Min = 1;
      while ((Result >= Min) && (this.get().charAt(Result - 1) !== AValue)) Result -= 1;
      if (Result < Min) {
        Result = -1}
       else Result = Result - 1;
      return Result;
    };
    this.LastIndexOf$5 = function (AValue, AStartIndex, ACount) {
      var Result = 0;
      Result = this.get().lastIndexOf(AValue,AStartIndex);
      if ((AStartIndex - Result) > ACount) Result = -1;
      return Result;
    };
    this.LastIndexOfAny = function (AnyOf) {
      var Result = 0;
      Result = $mod.TStringHelper.LastIndexOfAny$2.call(this,AnyOf,$mod.TStringHelper.GetLength.call(this) - 1,$mod.TStringHelper.GetLength.call(this));
      return Result;
    };
    this.LastIndexOfAny$1 = function (AnyOf, AStartIndex) {
      var Result = 0;
      Result = $mod.TStringHelper.LastIndexOfAny$2.call(this,AnyOf,AStartIndex,$mod.TStringHelper.GetLength.call(this));
      return Result;
    };
    this.LastIndexOfAny$2 = function (AnyOf, AStartIndex, ACount) {
      var Result = 0;
      var Min = 0;
      Result = AStartIndex + 1;
      Min = (Result - ACount) + 1;
      if (Min < 1) Min = 1;
      while ((Result >= Min) && !$impl.HaveChar(this.get().charAt(Result - 1),AnyOf)) Result -= 1;
      if (Result < Min) {
        Result = -1}
       else Result = Result - 1;
      return Result;
    };
    this.PadLeft = function (ATotalWidth) {
      var Result = "";
      Result = $mod.TStringHelper.PadLeft$1.call(this,ATotalWidth," ");
      return Result;
    };
    this.PadLeft$1 = function (ATotalWidth, PaddingChar) {
      var Result = "";
      var L = 0;
      Result = this.get();
      L = ATotalWidth - $mod.TStringHelper.GetLength.call(this);
      if (L > 0) Result = pas.System.StringOfChar(PaddingChar,L) + Result;
      return Result;
    };
    this.PadRight = function (ATotalWidth) {
      var Result = "";
      Result = $mod.TStringHelper.PadRight$1.call(this,ATotalWidth," ");
      return Result;
    };
    this.PadRight$1 = function (ATotalWidth, PaddingChar) {
      var Result = "";
      var L = 0;
      Result = this.get();
      L = ATotalWidth - $mod.TStringHelper.GetLength.call(this);
      if (L > 0) Result = Result + pas.System.StringOfChar(PaddingChar,L);
      return Result;
    };
    this.QuotedString = function () {
      var Result = "";
      Result = $mod.QuotedStr(this.get(),"'");
      return Result;
    };
    this.QuotedString$1 = function (AQuoteChar) {
      var Result = "";
      Result = $mod.QuotedStr(this.get(),AQuoteChar);
      return Result;
    };
    this.Remove = function (StartIndex) {
      var Result = "";
      Result = $mod.TStringHelper.Remove$1.call(this,StartIndex,$mod.TStringHelper.GetLength.call(this) - StartIndex);
      return Result;
    };
    this.Remove$1 = function (StartIndex, ACount) {
      var Result = "";
      Result = this.get();
      pas.System.Delete({get: function () {
          return Result;
        }, set: function (v) {
          Result = v;
        }},StartIndex + 1,ACount);
      return Result;
    };
    this.Replace = function (OldChar, NewChar) {
      var Result = "";
      Result = $mod.TStringHelper.Replace$1.call(this,OldChar,NewChar,rtl.createSet(0));
      return Result;
    };
    this.Replace$1 = function (OldChar, NewChar, ReplaceFlags) {
      var Result = "";
      Result = $mod.StringReplace(this.get(),OldChar,NewChar,rtl.refSet(ReplaceFlags));
      return Result;
    };
    this.Replace$2 = function (OldValue, NewValue) {
      var Result = "";
      Result = $mod.TStringHelper.Replace$3.call(this,OldValue,NewValue,rtl.createSet(0));
      return Result;
    };
    this.Replace$3 = function (OldValue, NewValue, ReplaceFlags) {
      var Result = "";
      Result = $mod.StringReplace(this.get(),OldValue,NewValue,rtl.refSet(ReplaceFlags));
      return Result;
    };
    this.Split = function (Separators) {
      var Result = [];
      Result = $mod.TStringHelper.Split$1.call(this,$mod.TStringHelper.ToCharArray$1.call({get: function () {
          return Separators;
        }, set: function (v) {
          rtl.raiseE("EPropReadOnly");
        }}));
      return Result;
    };
    this.Split$1 = function (Separators) {
      var Result = [];
      Result = $mod.TStringHelper.Split$21.call(this,Separators,"\x00","\x00",$mod.TStringHelper.GetLength.call(this) + 1,0);
      return Result;
    };
    this.Split$2 = function (Separators, ACount) {
      var Result = [];
      Result = $mod.TStringHelper.Split$3.call(this,$mod.TStringHelper.ToCharArray$1.call({get: function () {
          return Separators;
        }, set: function (v) {
          rtl.raiseE("EPropReadOnly");
        }}),ACount);
      return Result;
    };
    this.Split$3 = function (Separators, ACount) {
      var Result = [];
      Result = $mod.TStringHelper.Split$21.call(this,Separators,"\x00","\x00",ACount,0);
      return Result;
    };
    this.Split$4 = function (Separators, Options) {
      var Result = [];
      Result = $mod.TStringHelper.Split$5.call(this,$mod.TStringHelper.ToCharArray$1.call({get: function () {
          return Separators;
        }, set: function (v) {
          rtl.raiseE("EPropReadOnly");
        }}),Options);
      return Result;
    };
    this.Split$5 = function (Separators, Options) {
      var Result = [];
      Result = $mod.TStringHelper.Split$7.call(this,Separators,$mod.TStringHelper.GetLength.call(this) + 1,Options);
      return Result;
    };
    this.Split$6 = function (Separators, ACount, Options) {
      var Result = [];
      Result = $mod.TStringHelper.Split$7.call(this,$mod.TStringHelper.ToCharArray$1.call({get: function () {
          return Separators;
        }, set: function (v) {
          rtl.raiseE("EPropReadOnly");
        }}),ACount,Options);
      return Result;
    };
    this.Split$7 = function (Separators, ACount, Options) {
      var Result = [];
      Result = $mod.TStringHelper.Split$21.call(this,Separators,"\x00","\x00",ACount,Options);
      return Result;
    };
    this.Split$8 = function (Separators) {
      var Result = [];
      Result = $mod.TStringHelper.Split$9.call(this,Separators,$mod.TStringHelper.GetLength.call(this) + 1);
      return Result;
    };
    this.Split$9 = function (Separators, ACount) {
      var Result = [];
      Result = $mod.TStringHelper.Split$11.call(this,Separators,ACount,0);
      return Result;
    };
    this.Split$10 = function (Separators, Options) {
      var Result = [];
      Result = $mod.TStringHelper.Split$11.call(this,Separators,$mod.TStringHelper.GetLength.call(this) + 1,Options);
      return Result;
    };
    this.Split$11 = function (Separators, ACount, Options) {
      var Result = [];
      Result = $mod.TStringHelper.Split$26.call(this,Separators,"\x00","\x00",ACount,Options);
      return Result;
    };
    this.Split$12 = function (Separators, AQuote) {
      var Result = [];
      Result = $mod.TStringHelper.Split$13.call(this,$mod.TStringHelper.ToCharArray$1.call({get: function () {
          return Separators;
        }, set: function (v) {
          rtl.raiseE("EPropReadOnly");
        }}),AQuote);
      return Result;
    };
    this.Split$13 = function (Separators, AQuote) {
      var Result = [];
      Result = $mod.TStringHelper.Split$15.call(this,Separators,AQuote,AQuote);
      return Result;
    };
    this.Split$14 = function (Separators, AQuoteStart, AQuoteEnd) {
      var Result = [];
      Result = $mod.TStringHelper.Split$15.call(this,$mod.TStringHelper.ToCharArray$1.call({get: function () {
          return Separators;
        }, set: function (v) {
          rtl.raiseE("EPropReadOnly");
        }}),AQuoteStart,AQuoteEnd);
      return Result;
    };
    this.Split$15 = function (Separators, AQuoteStart, AQuoteEnd) {
      var Result = [];
      Result = $mod.TStringHelper.Split$17.call(this,Separators,AQuoteStart,AQuoteEnd,0);
      return Result;
    };
    this.Split$16 = function (Separators, AQuoteStart, AQuoteEnd, Options) {
      var Result = [];
      Result = $mod.TStringHelper.Split$17.call(this,$mod.TStringHelper.ToCharArray$1.call({get: function () {
          return Separators;
        }, set: function (v) {
          rtl.raiseE("EPropReadOnly");
        }}),AQuoteStart,AQuoteEnd,Options);
      return Result;
    };
    this.Split$17 = function (Separators, AQuoteStart, AQuoteEnd, Options) {
      var Result = [];
      Result = $mod.TStringHelper.Split$21.call(this,Separators,AQuoteStart,AQuoteEnd,$mod.TStringHelper.GetLength.call(this) + 1,Options);
      return Result;
    };
    this.Split$18 = function (Separators, AQuoteStart, AQuoteEnd, ACount) {
      var Result = [];
      Result = $mod.TStringHelper.Split$19.call(this,$mod.TStringHelper.ToCharArray$1.call({get: function () {
          return Separators;
        }, set: function (v) {
          rtl.raiseE("EPropReadOnly");
        }}),AQuoteStart,AQuoteEnd,ACount);
      return Result;
    };
    this.Split$19 = function (Separators, AQuoteStart, AQuoteEnd, ACount) {
      var Result = [];
      Result = $mod.TStringHelper.Split$21.call(this,Separators,AQuoteStart,AQuoteEnd,ACount,0);
      return Result;
    };
    this.Split$20 = function (Separators, AQuoteStart, AQuoteEnd, ACount, Options) {
      var Result = [];
      Result = $mod.TStringHelper.Split$21.call(this,$mod.TStringHelper.ToCharArray$1.call({get: function () {
          return Separators;
        }, set: function (v) {
          rtl.raiseE("EPropReadOnly");
        }}),AQuoteStart,AQuoteEnd,ACount,Options);
      return Result;
    };
    var BlockSize = 10;
    this.Split$21 = function (Separators, AQuoteStart, AQuoteEnd, ACount, Options) {
      var $Self = this;
      var Result = [];
      var S = "";
      function NextSep(StartIndex) {
        var Result = 0;
        if (AQuoteStart !== "\x00") {
          Result = $mod.TStringHelper.IndexOfAnyUnquoted$1.call({get: function () {
              return S;
            }, set: function (v) {
              S = v;
            }},Separators,AQuoteStart,AQuoteEnd,StartIndex)}
         else Result = $mod.TStringHelper.IndexOfAny$3.call({get: function () {
            return S;
          }, set: function (v) {
            S = v;
          }},Separators,StartIndex);
        return Result;
      };
      function MaybeGrow(Curlen) {
        if (rtl.length(Result) <= Curlen) Result = rtl.arraySetLength(Result,"",rtl.length(Result) + 10);
      };
      var Sep = 0;
      var LastSep = 0;
      var Len = 0;
      var T = "";
      S = $Self.get();
      Result = rtl.arraySetLength(Result,"",10);
      Len = 0;
      LastSep = 0;
      Sep = NextSep(0);
      while ((Sep !== -1) && ((ACount === 0) || (Len < ACount))) {
        T = $mod.TStringHelper.Substring$1.call($Self,LastSep,Sep - LastSep);
        if ((T !== "") || !(1 === Options)) {
          MaybeGrow(Len);
          Result[Len] = T;
          Len += 1;
        };
        LastSep = Sep + 1;
        Sep = NextSep(LastSep);
      };
      if ((LastSep <= $mod.TStringHelper.GetLength.call($Self)) && ((ACount === 0) || (Len < ACount))) {
        T = $mod.TStringHelper.Substring.call($Self,LastSep);
        if ((T !== "") || !(1 === Options)) {
          MaybeGrow(Len);
          Result[Len] = T;
          Len += 1;
        };
      };
      Result = rtl.arraySetLength(Result,"",Len);
      return Result;
    };
    this.Split$22 = function (Separators, AQuote) {
      var Result = [];
      Result = $mod.TStringHelper.Split$23.call(this,Separators,AQuote,AQuote);
      return Result;
    };
    this.Split$23 = function (Separators, AQuoteStart, AQuoteEnd) {
      var Result = [];
      Result = $mod.TStringHelper.Split$26.call(this,Separators,AQuoteStart,AQuoteEnd,$mod.TStringHelper.GetLength.call(this) + 1,0);
      return Result;
    };
    this.Split$24 = function (Separators, AQuoteStart, AQuoteEnd, Options) {
      var Result = [];
      Result = $mod.TStringHelper.Split$26.call(this,Separators,AQuoteStart,AQuoteEnd,$mod.TStringHelper.GetLength.call(this) + 1,Options);
      return Result;
    };
    this.Split$25 = function (Separators, AQuoteStart, AQuoteEnd, ACount) {
      var Result = [];
      Result = $mod.TStringHelper.Split$26.call(this,Separators,AQuoteStart,AQuoteEnd,ACount,0);
      return Result;
    };
    var BlockSize$1 = 10;
    this.Split$26 = function (Separators, AQuoteStart, AQuoteEnd, ACount, Options) {
      var $Self = this;
      var Result = [];
      var S = "";
      function NextSep(StartIndex, Match) {
        var Result = 0;
        if (AQuoteStart !== "\x00") {
          Result = $mod.TStringHelper.IndexOfAnyUnquoted$3.call({get: function () {
              return S;
            }, set: function (v) {
              S = v;
            }},Separators,AQuoteStart,AQuoteEnd,StartIndex,Match)}
         else Result = $mod.TStringHelper.IndexOfAny$9.call({get: function () {
            return S;
          }, set: function (v) {
            S = v;
          }},Separators,StartIndex,$mod.TStringHelper.GetLength.call($Self),Match);
        return Result;
      };
      function MaybeGrow(Curlen) {
        if (rtl.length(Result) <= Curlen) Result = rtl.arraySetLength(Result,"",rtl.length(Result) + 10);
      };
      var Sep = 0;
      var LastSep = 0;
      var Len = 0;
      var Match = 0;
      var T = "";
      S = $Self.get();
      Result = rtl.arraySetLength(Result,"",10);
      Len = 0;
      LastSep = 0;
      Sep = NextSep(0,{get: function () {
          return Match;
        }, set: function (v) {
          Match = v;
        }});
      while ((Sep !== -1) && ((ACount === 0) || (Len < ACount))) {
        T = $mod.TStringHelper.Substring$1.call($Self,LastSep,Sep - LastSep);
        if ((T !== "") || !(1 === Options)) {
          MaybeGrow(Len);
          Result[Len] = T;
          Len += 1;
        };
        LastSep = Sep + Separators[Match].length;
        Sep = NextSep(LastSep,{get: function () {
            return Match;
          }, set: function (v) {
            Match = v;
          }});
      };
      if ((LastSep <= $mod.TStringHelper.GetLength.call($Self)) && ((ACount === 0) || (Len < ACount))) {
        T = $mod.TStringHelper.Substring.call($Self,LastSep);
        if ((T !== "") || !(1 === Options)) {
          MaybeGrow(Len);
          Result[Len] = T;
          Len += 1;
        };
      };
      Result = rtl.arraySetLength(Result,"",Len);
      return Result;
    };
    this.StartsWith = function (AValue) {
      var Result = false;
      Result = $mod.TStringHelper.StartsWith$1.call(this,AValue,false);
      return Result;
    };
    this.StartsWith$1 = function (AValue, IgnoreCase) {
      var Result = false;
      var L = 0;
      var S = "";
      L = AValue.length;
      Result = L <= 0;
      if (!Result) {
        S = pas.System.Copy(this.get(),1,L);
        Result = S.length === L;
        if (Result) if (IgnoreCase) {
          Result = $mod.SameText(S,AValue)}
         else Result = $mod.SameStr(S,AValue);
      };
      return Result;
    };
    this.Substring = function (AStartIndex) {
      var Result = "";
      Result = $mod.TStringHelper.Substring$1.call(this,AStartIndex,$mod.TStringHelper.GetLength.call(this) - AStartIndex);
      return Result;
    };
    this.Substring$1 = function (AStartIndex, ALen) {
      var Result = "";
      Result = pas.System.Copy(this.get(),AStartIndex + 1,ALen);
      return Result;
    };
    this.ToBoolean$1 = function () {
      var Result = false;
      Result = $mod.StrToBool(this.get());
      return Result;
    };
    this.ToInteger$1 = function () {
      var Result = 0;
      Result = $mod.StrToInt(this.get());
      return Result;
    };
    this.ToNativeInt$1 = function () {
      var Result = 0;
      Result = $mod.StrToNativeInt(this.get());
      return Result;
    };
    this.ToDouble$1 = function () {
      var Result = 0.0;
      Result = $mod.StrToFloat(this.get());
      return Result;
    };
    this.ToExtended$1 = function () {
      var Result = 0.0;
      Result = $mod.StrToFloat(this.get());
      return Result;
    };
    this.ToCharArray$1 = function () {
      var Result = [];
      Result = $mod.TStringHelper.ToCharArray$2.call(this,0,$mod.TStringHelper.GetLength.call(this));
      return Result;
    };
    this.ToCharArray$2 = function (AStartIndex, ALen) {
      var Result = [];
      var I = 0;
      Result = rtl.arraySetLength(Result,"",ALen);
      for (var $l = 0, $end = ALen - 1; $l <= $end; $l++) {
        I = $l;
        Result[I] = this.get().charAt((AStartIndex + I + 1) - 1);
      };
      return Result;
    };
    this.ToLower = function () {
      var Result = "";
      Result = $mod.TStringHelper.LowerCase(this.get());
      return Result;
    };
    this.ToLowerInvariant = function () {
      var Result = "";
      Result = $mod.TStringHelper.LowerCase(this.get());
      return Result;
    };
    this.ToUpper = function () {
      var Result = "";
      Result = $mod.TStringHelper.UpperCase(this.get());
      return Result;
    };
    this.ToUpperInvariant = function () {
      var Result = "";
      Result = $mod.TStringHelper.UpperCase(this.get());
      return Result;
    };
    this.Trim = function () {
      var Result = "";
      Result = $mod.Trim(this.get());
      return Result;
    };
    this.TrimLeft = function () {
      var Result = "";
      Result = $mod.TrimLeft(this.get());
      return Result;
    };
    this.TrimRight = function () {
      var Result = "";
      Result = $mod.TrimRight(this.get());
      return Result;
    };
    this.Trim$1 = function (ATrimChars) {
      var Result = "";
      Result = $mod.TStringHelper.TrimRight$1.call({a: $mod.TStringHelper.TrimLeft$1.call(this,ATrimChars), get: function () {
          return this.a;
        }, set: function (v) {
          this.a = v;
        }},ATrimChars);
      return Result;
    };
    this.TrimLeft$1 = function (ATrimChars) {
      var Result = "";
      var I = 0;
      var Len = 0;
      I = 1;
      Len = $mod.TStringHelper.GetLength.call(this);
      while ((I <= Len) && $impl.HaveChar(this.get().charAt(I - 1),ATrimChars)) I += 1;
      if (I === 1) {
        Result = this.get()}
       else if (I > Len) {
        Result = ""}
       else Result = pas.System.Copy(this.get(),I,(Len - I) + 1);
      return Result;
    };
    this.TrimRight$1 = function (ATrimChars) {
      var Result = "";
      var I = 0;
      var Len = 0;
      Len = $mod.TStringHelper.GetLength.call(this);
      I = Len;
      while ((I >= 1) && $impl.HaveChar(this.get().charAt(I - 1),ATrimChars)) I -= 1;
      if (I < 1) {
        Result = ""}
       else if (I === Len) {
        Result = this.get()}
       else Result = pas.System.Copy(this.get(),1,I);
      return Result;
    };
    this.TrimEnd = function (ATrimChars) {
      var Result = "";
      Result = $mod.TStringHelper.TrimRight$1.call(this,ATrimChars);
      return Result;
    };
    this.TrimStart = function (ATrimChars) {
      var Result = "";
      Result = $mod.TStringHelper.TrimLeft$1.call(this,ATrimChars);
      return Result;
    };
  });
  rtl.createHelper(this,"TDoubleHelper",null,function () {
    this.Epsilon = 4.9406564584124654418e-324;
    this.MaxValue = 1.7976931348623157081e+308;
    this.MinValue = -1.7976931348623157081e+308;
    this.GetB = function (AIndex) {
      var Result = 0;
      var F = null;
      var B = null;
      F = new Float64Array(1);
      B = new Uint8Array(F.buffer);
      F[0] = this.get();
      Result = B[AIndex];
      return Result;
    };
    this.GetW = function (AIndex) {
      var Result = 0;
      var F = null;
      var W = null;
      F = new Float64Array(1);
      W = new Uint16Array(F.buffer);
      F[0] = this.get();
      Result = W[AIndex];
      return Result;
    };
    this.GetE = function () {
      var Result = 0;
      Result = $impl.FloatToParts(this.get()).exp;
      return Result;
    };
    this.GetF = function () {
      var Result = 0;
      Result = 0;
      $impl.NotImplemented("GetF");
      return Result;
    };
    this.GetS = function () {
      var Result = false;
      Result = $impl.FloatToParts(this.get()).sign;
      return Result;
    };
    this.SetS = function (aValue) {
      var F = null;
      var B = null;
      F = new Float64Array(1);
      B = new Uint8Array(F.buffer);
      F[0] = this.get();
      if (aValue) {
        B[7] = B[7] | (1 >>> 7)}
       else B[7] = B[7] & ~(1 >>> 7);
      this.set(F[0]);
    };
    this.SetB = function (AIndex, AValue) {
      var F = null;
      var B = null;
      if (AIndex >= 8) throw $mod.ERangeError.$create("Create$1",[rtl.getResStr(pas.RTLConsts,"SRangeError")]);
      F = new Float64Array(1);
      B = new Uint8Array(F.buffer);
      F[0] = this.get();
      B[AIndex] = AValue;
      this.set(F[0]);
    };
    this.SetW = function (AIndex, AValue) {
      var F = null;
      var W = null;
      if (AIndex >= 4) throw $mod.ERangeError.$create("Create$1",[rtl.getResStr(pas.RTLConsts,"SRangeError")]);
      F = new Float64Array(1);
      W = new Uint16Array(F.buffer);
      F[0] = this.get();
      W[AIndex] = AValue;
      this.set(F[0]);
    };
    this.IsInfinity = function (AValue) {
      var Result = false;
      Result = !isFinite(AValue);
      return Result;
    };
    this.IsNan = function (AValue) {
      var Result = false;
      Result = isNaN(AValue);
      return Result;
    };
    this.IsNegativeInfinity = function (AValue) {
      var Result = false;
      return (AValue=Number.NEGATIVE_INFINITY);
      Result = AValue === 0;
      return Result;
    };
    this.IsPositiveInfinity = function (AValue) {
      var Result = false;
      return (AValue=Number.POSITIVE_INFINITY);
      Result = AValue === 0;
      return Result;
    };
    this.Parse = function (AString) {
      var Result = 0.0;
      Result = $mod.StrToFloat(AString);
      return Result;
    };
    this.ToString = function (AValue) {
      var Result = "";
      Result = $mod.FloatToStr(AValue);
      return Result;
    };
    this.ToString$1 = function (AValue, AFormat, APrecision, ADigits) {
      var Result = "";
      Result = $mod.FloatToStrF(AValue,AFormat,APrecision,ADigits);
      return Result;
    };
    this.TryParse = function (AString, AValue) {
      var Result = false;
      Result = $mod.TryStrToFloat$2(AString,AValue);
      return Result;
    };
    this.BuildUp = function (ASignFlag, AMantissa, AExponent) {
      $impl.NotImplemented("BuildUp");
      if (ASignFlag && (AMantissa > 0) && (AExponent < 0)) return;
    };
    this.Exponent = function () {
      var Result = 0;
      Result = $impl.FloatToParts(this.get()).exp;
      return Result;
    };
    this.Fraction = function () {
      var Result = 0.0;
      Result = pas.System.Frac(this.get());
      return Result;
    };
    this.IsInfinity$1 = function () {
      var Result = false;
      Result = $mod.TDoubleHelper.IsInfinity(this.get());
      return Result;
    };
    this.IsNan$1 = function () {
      var Result = false;
      Result = $mod.TDoubleHelper.IsNan(this.get());
      return Result;
    };
    this.IsNegativeInfinity$1 = function () {
      var Result = false;
      Result = $mod.TDoubleHelper.IsNegativeInfinity(this.get());
      return Result;
    };
    this.IsPositiveInfinity$1 = function () {
      var Result = false;
      Result = $mod.TDoubleHelper.IsPositiveInfinity(this.get());
      return Result;
    };
    this.Mantissa = function () {
      var Result = 0;
      Result = pas.System.Trunc($impl.FloatToParts(this.get()).mantissa);
      return Result;
    };
    this.ToString$2 = function (AFormat, APrecision, ADigits) {
      var Result = "";
      Result = $mod.FloatToStrF(this.get(),AFormat,APrecision,ADigits);
      return Result;
    };
    this.ToString$3 = function () {
      var Result = "";
      Result = $mod.FloatToStr(this.get());
      return Result;
    };
  });
  rtl.createHelper(this,"TByteHelper",null,function () {
    this.MaxValue = 255;
    this.MinValue = 0;
    this.Parse = function (AString) {
      var Result = 0;
      Result = $mod.StrToInt(AString);
      return Result;
    };
    this.Size = function () {
      var Result = 0;
      Result = 1;
      return Result;
    };
    this.ToString = function (AValue) {
      var Result = "";
      Result = $mod.IntToStr(AValue);
      return Result;
    };
    this.TryParse = function (AString, AValue) {
      var Result = false;
      var C = 0;
      pas.System.val$3(AString,AValue,{get: function () {
          return C;
        }, set: function (v) {
          C = v;
        }});
      Result = C === 0;
      return Result;
    };
    this.ToBoolean = function () {
      var Result = false;
      Result = this.get() !== 0;
      return Result;
    };
    this.ToDouble = function () {
      var Result = 0.0;
      Result = this.get();
      return Result;
    };
    this.ToExtended = function () {
      var Result = 0.0;
      Result = this.get();
      return Result;
    };
    this.ToBinString = function () {
      var Result = "";
      Result = pas.System.binstr(this.get(),$mod.TByteHelper.Size() * 8);
      return Result;
    };
    this.ToHexString = function (AMinDigits) {
      var Result = "";
      Result = $mod.IntToHex(this.get(),AMinDigits);
      return Result;
    };
    this.ToHexString$1 = function () {
      var Result = "";
      Result = $mod.IntToHex(this.get(),$mod.TByteHelper.Size() * 2);
      return Result;
    };
    this.ToString$1 = function () {
      var Result = "";
      Result = $mod.IntToStr(this.get());
      return Result;
    };
    this.SetBit = function (Index) {
      var Result = 0;
      this.set(this.get() | (1 << Index));
      Result = this.get();
      return Result;
    };
    this.ClearBit = function (Index) {
      var Result = 0;
      this.set(this.get() & ~(1 << Index));
      Result = this.get();
      return Result;
    };
    this.ToggleBit = function (Index) {
      var Result = 0;
      this.set(this.get() ^ (1 << Index));
      Result = this.get();
      return Result;
    };
    this.TestBit = function (Index) {
      var Result = false;
      Result = (this.get() & (1 << Index)) !== 0;
      return Result;
    };
  });
  rtl.createHelper(this,"TShortIntHelper",null,function () {
    this.MaxValue = 127;
    this.MinValue = -128;
    this.Parse = function (AString) {
      var Result = 0;
      Result = $mod.StrToInt(AString);
      return Result;
    };
    this.Size = function () {
      var Result = 0;
      Result = 1;
      return Result;
    };
    this.ToString = function (AValue) {
      var Result = "";
      Result = $mod.IntToStr(AValue);
      return Result;
    };
    this.TryParse = function (AString, AValue) {
      var Result = false;
      var C = 0;
      pas.System.val$2(AString,AValue,{get: function () {
          return C;
        }, set: function (v) {
          C = v;
        }});
      Result = C === 0;
      return Result;
    };
    this.ToBoolean = function () {
      var Result = false;
      Result = this.get() !== 0;
      return Result;
    };
    this.ToDouble = function () {
      var Result = 0.0;
      Result = this.get();
      return Result;
    };
    this.ToExtended = function () {
      var Result = 0.0;
      Result = this.get();
      return Result;
    };
    this.ToBinString = function () {
      var Result = "";
      Result = pas.System.binstr(this.get(),$mod.TShortIntHelper.Size() * 8);
      return Result;
    };
    this.ToHexString = function (AMinDigits) {
      var Result = "";
      var B = 0;
      var U = null;
      var S = null;
      if (this.get() >= 0) {
        B = this.get()}
       else {
        S = new Int8Array(1);
        S[0] = this.get();
        U = new Uint8Array(S);
        B = U[0];
        if (AMinDigits > 2) B = 0xFF00 + B;
      };
      Result = $mod.IntToHex(B,AMinDigits);
      return Result;
    };
    this.ToHexString$1 = function () {
      var Result = "";
      Result = $mod.TShortIntHelper.ToHexString.call(this,$mod.TShortIntHelper.Size() * 2);
      return Result;
    };
    this.ToString$1 = function () {
      var Result = "";
      Result = $mod.IntToStr(this.get());
      return Result;
    };
    this.SetBit = function (Index) {
      var Result = 0;
      this.set(this.get() | (1 << Index));
      Result = this.get();
      return Result;
    };
    this.ClearBit = function (Index) {
      var Result = 0;
      this.set(this.get() & ~(1 << Index));
      Result = this.get();
      return Result;
    };
    this.ToggleBit = function (Index) {
      var Result = 0;
      this.set(this.get() ^ (1 << Index));
      Result = this.get();
      return Result;
    };
    this.TestBit = function (Index) {
      var Result = false;
      Result = (this.get() & (1 << Index)) !== 0;
      return Result;
    };
  });
  rtl.createHelper(this,"TSmallIntHelper",null,function () {
    this.MaxValue = 32767;
    this.MinValue = -32768;
    this.Parse = function (AString) {
      var Result = 0;
      Result = $mod.StrToInt(AString);
      return Result;
    };
    this.Size = function () {
      var Result = 0;
      Result = 2;
      return Result;
    };
    this.ToString = function (AValue) {
      var Result = "";
      Result = $mod.IntToStr(AValue);
      return Result;
    };
    this.TryParse = function (AString, AValue) {
      var Result = false;
      var C = 0;
      pas.System.val$4(AString,AValue,{get: function () {
          return C;
        }, set: function (v) {
          C = v;
        }});
      Result = C === 0;
      return Result;
    };
    this.ToString$1 = function () {
      var Result = "";
      Result = $mod.IntToStr(this.get());
      return Result;
    };
    this.ToBoolean = function () {
      var Result = false;
      Result = this.get() !== 0;
      return Result;
    };
    this.ToBinString = function () {
      var Result = "";
      Result = pas.System.binstr(this.get(),$mod.TSmallIntHelper.Size() * 8);
      return Result;
    };
    this.ToHexString = function () {
      var Result = "";
      Result = $mod.TSmallIntHelper.ToHexString$1.call(this,$mod.TSmallIntHelper.Size() * 2);
      return Result;
    };
    this.ToHexString$1 = function (AMinDigits) {
      var Result = "";
      var B = 0;
      var U = null;
      var S = null;
      if (this.get() >= 0) {
        B = this.get()}
       else {
        S = new Int16Array(1);
        S[0] = this.get();
        U = new Uint16Array(S);
        B = U[0];
        if (AMinDigits > 6) {
          B = 0xFFFF0000 + B}
         else if (AMinDigits > 4) B = 0xFF0000 + B;
      };
      Result = $mod.IntToHex(B,AMinDigits);
      return Result;
    };
    this.ToDouble = function () {
      var Result = 0.0;
      Result = this.get();
      return Result;
    };
    this.ToExtended = function () {
      var Result = 0.0;
      Result = this.get();
      return Result;
    };
    this.SetBit = function (Index) {
      var Result = 0;
      this.set(this.get() | (1 << Index));
      Result = this.get();
      return Result;
    };
    this.ClearBit = function (Index) {
      var Result = 0;
      this.set(this.get() & ~(1 << Index));
      Result = this.get();
      return Result;
    };
    this.ToggleBit = function (Index) {
      var Result = 0;
      this.set(this.get() ^ (1 << Index));
      Result = this.get();
      return Result;
    };
    this.TestBit = function (Index) {
      var Result = false;
      Result = (this.get() & (1 << Index)) !== 0;
      return Result;
    };
  });
  rtl.createHelper(this,"TWordHelper",null,function () {
    this.MaxValue = 65535;
    this.MinValue = 0;
    this.Parse = function (AString) {
      var Result = 0;
      Result = $mod.StrToInt(AString);
      return Result;
    };
    this.Size = function () {
      var Result = 0;
      Result = 2;
      return Result;
    };
    this.ToString = function (AValue) {
      var Result = "";
      Result = $mod.IntToStr(AValue);
      return Result;
    };
    this.TryParse = function (AString, AValue) {
      var Result = false;
      var C = 0;
      pas.System.val$5(AString,AValue,{get: function () {
          return C;
        }, set: function (v) {
          C = v;
        }});
      Result = C === 0;
      return Result;
    };
    this.ToBoolean = function () {
      var Result = false;
      Result = this.get() !== 0;
      return Result;
    };
    this.ToDouble = function () {
      var Result = 0.0;
      Result = this.get();
      return Result;
    };
    this.ToExtended = function () {
      var Result = 0.0;
      Result = this.get();
      return Result;
    };
    this.ToBinString = function () {
      var Result = "";
      Result = pas.System.binstr(this.get(),$mod.TWordHelper.Size() * 8);
      return Result;
    };
    this.ToHexString = function (AMinDigits) {
      var Result = "";
      Result = $mod.IntToHex(this.get(),AMinDigits);
      return Result;
    };
    this.ToHexString$1 = function () {
      var Result = "";
      Result = $mod.IntToHex(this.get(),$mod.TWordHelper.Size() * 2);
      return Result;
    };
    this.ToString$1 = function () {
      var Result = "";
      Result = $mod.IntToStr(this.get());
      return Result;
    };
    this.SetBit = function (Index) {
      var Result = 0;
      this.set(this.get() | (1 << Index));
      Result = this.get();
      return Result;
    };
    this.ClearBit = function (Index) {
      var Result = 0;
      this.set(this.get() & ~(1 << Index));
      Result = this.get();
      return Result;
    };
    this.ToggleBit = function (Index) {
      var Result = 0;
      this.set(this.get() ^ (1 << Index));
      Result = this.get();
      return Result;
    };
    this.TestBit = function (Index) {
      var Result = false;
      Result = (this.get() & (1 << Index)) !== 0;
      return Result;
    };
  });
  rtl.createHelper(this,"TCardinalHelper",null,function () {
    this.MaxValue = 4294967295;
    this.MinValue = 0;
    this.Parse = function (AString) {
      var Result = 0;
      Result = $mod.StrToInt(AString);
      return Result;
    };
    this.Size = function () {
      var Result = 0;
      Result = 4;
      return Result;
    };
    this.ToString = function (AValue) {
      var Result = "";
      Result = $mod.IntToStr(AValue);
      return Result;
    };
    this.TryParse = function (AString, AValue) {
      var Result = false;
      var C = 0;
      pas.System.val$7(AString,AValue,{get: function () {
          return C;
        }, set: function (v) {
          C = v;
        }});
      Result = C === 0;
      return Result;
    };
    this.ToBoolean = function () {
      var Result = false;
      Result = this.get() !== 0;
      return Result;
    };
    this.ToDouble = function () {
      var Result = 0.0;
      Result = this.get();
      return Result;
    };
    this.ToExtended = function () {
      var Result = 0.0;
      Result = this.get();
      return Result;
    };
    this.ToBinString = function () {
      var Result = "";
      Result = pas.System.binstr(this.get(),$mod.TCardinalHelper.Size() * 8);
      return Result;
    };
    this.ToHexString = function (AMinDigits) {
      var Result = "";
      Result = $mod.IntToHex(this.get(),AMinDigits);
      return Result;
    };
    this.ToHexString$1 = function () {
      var Result = "";
      Result = $mod.TCardinalHelper.ToHexString.call(this,$mod.TCardinalHelper.Size() * 2);
      return Result;
    };
    this.ToString$1 = function () {
      var Result = "";
      Result = $mod.IntToStr(this.get());
      return Result;
    };
    this.SetBit = function (Index) {
      var Result = 0;
      this.set(rtl.lw(this.get() | rtl.lw(1 << Index)));
      Result = this.get();
      return Result;
    };
    this.ClearBit = function (Index) {
      var Result = 0;
      this.set(rtl.lw(this.get() & rtl.lw(~rtl.lw(1 << Index))));
      Result = this.get();
      return Result;
    };
    this.ToggleBit = function (Index) {
      var Result = 0;
      this.set(rtl.lw(this.get() ^ rtl.lw(1 << Index)));
      Result = this.get();
      return Result;
    };
    this.TestBit = function (Index) {
      var Result = false;
      Result = rtl.lw(this.get() & rtl.lw(1 << Index)) !== 0;
      return Result;
    };
  });
  rtl.createHelper(this,"TIntegerHelper",null,function () {
    this.MaxValue = 2147483647;
    this.MinValue = -2147483648;
    this.Size = function () {
      var Result = 0;
      Result = 4;
      return Result;
    };
    this.ToString = function (AValue) {
      var Result = "";
      Result = $mod.IntToStr(AValue);
      return Result;
    };
    this.Parse = function (AString) {
      var Result = 0;
      Result = $mod.StrToInt(AString);
      return Result;
    };
    this.TryParse = function (AString, AValue) {
      var Result = false;
      var C = 0;
      pas.System.val$6(AString,AValue,{get: function () {
          return C;
        }, set: function (v) {
          C = v;
        }});
      Result = C === 0;
      return Result;
    };
    this.ToBoolean = function () {
      var Result = false;
      Result = this.get() !== 0;
      return Result;
    };
    this.ToDouble = function () {
      var Result = 0.0;
      Result = this.get();
      return Result;
    };
    this.ToExtended = function () {
      var Result = 0.0;
      Result = this.get();
      return Result;
    };
    this.ToBinString = function () {
      var Result = "";
      Result = pas.System.binstr(this.get(),$mod.TIntegerHelper.Size() * 8);
      return Result;
    };
    this.ToHexString = function (AMinDigits) {
      var Result = "";
      var B = 0;
      var U = null;
      var S = null;
      if (this.get() >= 0) {
        B = this.get()}
       else {
        S = new Int32Array(1);
        S[0] = this.get();
        U = new Uint32Array(S);
        B = U[0];
      };
      Result = $mod.IntToHex(B,AMinDigits);
      return Result;
    };
    this.ToHexString$1 = function () {
      var Result = "";
      Result = $mod.TIntegerHelper.ToHexString.call(this,$mod.TIntegerHelper.Size() * 2);
      return Result;
    };
    this.ToString$1 = function () {
      var Result = "";
      Result = $mod.IntToStr(this.get());
      return Result;
    };
    this.SetBit = function (Index) {
      var Result = 0;
      this.set(this.get() | (1 << Index));
      Result = this.get();
      return Result;
    };
    this.ClearBit = function (Index) {
      var Result = 0;
      this.set(this.get() & ~(1 << Index));
      Result = this.get();
      return Result;
    };
    this.ToggleBit = function (Index) {
      var Result = 0;
      this.set(this.get() ^ (1 << Index));
      Result = this.get();
      return Result;
    };
    this.TestBit = function (Index) {
      var Result = false;
      Result = (this.get() & (1 << Index)) !== 0;
      return Result;
    };
  });
  rtl.createHelper(this,"TNativeIntHelper",null,function () {
    this.MaxValue = 9007199254740991;
    this.MinValue = -9007199254740991;
    this.Parse = function (AString) {
      var Result = 0;
      Result = $mod.StrToInt(AString);
      return Result;
    };
    this.Size = function () {
      var Result = 0;
      Result = 7;
      return Result;
    };
    this.ToString = function (AValue) {
      var Result = "";
      Result = $mod.IntToStr(AValue);
      return Result;
    };
    this.TryParse = function (AString, AValue) {
      var Result = false;
      var C = 0;
      pas.System.val(AString,AValue,{get: function () {
          return C;
        }, set: function (v) {
          C = v;
        }});
      Result = C === 0;
      return Result;
    };
    this.ToBoolean = function () {
      var Result = false;
      Result = this.get() !== 0;
      return Result;
    };
    this.ToDouble = function () {
      var Result = 0.0;
      Result = this.get();
      return Result;
    };
    this.ToExtended = function () {
      var Result = 0.0;
      Result = this.get();
      return Result;
    };
    this.ToBinString = function () {
      var Result = "";
      Result = pas.System.binstr(this.get(),$mod.TNativeIntHelper.Size() * 8);
      return Result;
    };
    this.ToHexString = function (AMinDigits) {
      var Result = "";
      Result = $mod.IntToHex(this.get(),AMinDigits);
      return Result;
    };
    this.ToHexString$1 = function () {
      var Result = "";
      Result = $mod.IntToHex(this.get(),$mod.TNativeIntHelper.Size() * 2);
      return Result;
    };
    this.ToString$1 = function () {
      var Result = "";
      Result = $mod.IntToStr(this.get());
      return Result;
    };
    this.SetBit = function (Index) {
      var Result = 0;
      this.set(rtl.or(this.get(),rtl.shl(1,Index)));
      Result = this.get();
      return Result;
    };
    this.ClearBit = function (Index) {
      var Result = 0;
      this.set(rtl.and(this.get(),~rtl.shl(1,Index)));
      Result = this.get();
      return Result;
    };
    this.ToggleBit = function (Index) {
      var Result = 0;
      this.set(rtl.xor(this.get(),rtl.shl(1,Index)));
      Result = this.get();
      return Result;
    };
    this.TestBit = function (Index) {
      var Result = false;
      Result = rtl.and(this.get(),rtl.shl(1,Index)) !== 0;
      return Result;
    };
  });
  rtl.createHelper(this,"TNativeUIntHelper",null,function () {
    this.MaxValue = 9007199254740991;
    this.MinValue = 0;
    this.Parse = function (AString) {
      var Result = 0;
      Result = $mod.StrToInt(AString);
      return Result;
    };
    this.Size = function () {
      var Result = 0;
      Result = 7;
      return Result;
    };
    this.ToString = function (AValue) {
      var Result = "";
      Result = $mod.IntToStr(AValue);
      return Result;
    };
    this.TryParse = function (AString, AValue) {
      var Result = false;
      var C = 0;
      pas.System.val$1(AString,AValue,{get: function () {
          return C;
        }, set: function (v) {
          C = v;
        }});
      Result = C === 0;
      return Result;
    };
    this.ToBoolean = function () {
      var Result = false;
      Result = this.get() !== 0;
      return Result;
    };
    this.ToDouble = function () {
      var Result = 0.0;
      Result = this.get();
      return Result;
    };
    this.ToExtended = function () {
      var Result = 0.0;
      Result = this.get();
      return Result;
    };
    this.ToBinString = function () {
      var Result = "";
      Result = pas.System.binstr(this.get(),$mod.TNativeUIntHelper.Size() * 8);
      return Result;
    };
    this.ToHexString = function (AMinDigits) {
      var Result = "";
      Result = $mod.IntToHex(this.get(),AMinDigits);
      return Result;
    };
    this.ToHexString$1 = function () {
      var Result = "";
      Result = $mod.IntToHex(this.get(),$mod.TNativeUIntHelper.Size() * 2);
      return Result;
    };
    this.ToSingle = function () {
      var Result = 0.0;
      Result = this.get();
      return Result;
    };
    this.ToString$1 = function () {
      var Result = "";
      Result = $mod.IntToStr(this.get());
      return Result;
    };
    this.SetBit = function (Index) {
      var Result = 0;
      this.set(rtl.or(this.get(),rtl.shl(1,Index)));
      Result = this.get();
      return Result;
    };
    this.ClearBit = function (Index) {
      var Result = 0;
      this.set(rtl.and(this.get(),~rtl.shl(1,Index)));
      Result = this.get();
      return Result;
    };
    this.ToggleBit = function (Index) {
      var Result = 0;
      this.set(rtl.xor(this.get(),rtl.shl(1,Index)));
      Result = this.get();
      return Result;
    };
    this.TestBit = function (Index) {
      var Result = false;
      Result = rtl.and(this.get(),rtl.shl(1,Index)) !== 0;
      return Result;
    };
  });
  this.TUseBoolStrs = {"0": "False", False: 0, "1": "True", True: 1};
  this.$rtti.$Enum("TUseBoolStrs",{minvalue: 0, maxvalue: 1, ordtype: 1, enumtype: this.TUseBoolStrs});
  rtl.createHelper(this,"TBooleanHelper",null,function () {
    this.Parse = function (S) {
      var Result = false;
      Result = $mod.StrToBool(S);
      return Result;
    };
    this.Size = function () {
      var Result = 0;
      Result = 1;
      return Result;
    };
    this.ToString = function (AValue, UseBoolStrs) {
      var Result = "";
      Result = $mod.BoolToStr(AValue,UseBoolStrs === 1);
      return Result;
    };
    this.TryToParse = function (S, AValue) {
      var Result = false;
      Result = $mod.TryStrToBool(S,AValue);
      return Result;
    };
    this.ToInteger = function () {
      var Result = 0;
      Result = (this.get() ? 1 : 0);
      return Result;
    };
    this.ToString$1 = function (UseBoolStrs) {
      var Result = "";
      Result = $mod.BoolToStr(this.get(),UseBoolStrs === 1);
      return Result;
    };
  });
  rtl.createHelper(this,"TByteBoolHelper",null,function () {
    this.Parse = function (S) {
      var Result = false;
      Result = $mod.StrToBool(S);
      return Result;
    };
    this.Size = function () {
      var Result = 0;
      Result = 1;
      return Result;
    };
    this.ToString = function (AValue, UseBoolStrs) {
      var Result = "";
      Result = $mod.BoolToStr(AValue,UseBoolStrs);
      return Result;
    };
    this.TryToParse = function (S, AValue) {
      var Result = false;
      Result = $mod.TryStrToBool(S,AValue);
      return Result;
    };
    this.ToInteger = function () {
      var Result = 0;
      Result = (this.get() ? 1 : 0);
      return Result;
    };
    this.ToString$1 = function (UseBoolStrs) {
      var Result = "";
      Result = $mod.BoolToStr(this.get(),UseBoolStrs);
      return Result;
    };
  });
  rtl.createHelper(this,"TWordBoolHelper",null,function () {
    this.Parse = function (S) {
      var Result = false;
      Result = $mod.StrToBool(S);
      return Result;
    };
    this.Size = function () {
      var Result = 0;
      Result = 2;
      return Result;
    };
    this.ToString = function (AValue, UseBoolStrs) {
      var Result = "";
      Result = $mod.BoolToStr(AValue,UseBoolStrs);
      return Result;
    };
    this.TryToParse = function (S, AValue) {
      var Result = false;
      Result = $mod.TryStrToBool(S,AValue);
      return Result;
    };
    this.ToInteger = function () {
      var Result = 0;
      Result = (this.get() ? 1 : 0);
      return Result;
    };
    this.ToString$1 = function (UseBoolStrs) {
      var Result = "";
      Result = $mod.BoolToStr(this.get(),UseBoolStrs);
      return Result;
    };
  });
  rtl.createHelper(this,"TLongBoolHelper",null,function () {
    this.Parse = function (S) {
      var Result = false;
      Result = $mod.StrToBool(S);
      return Result;
    };
    this.Size = function () {
      var Result = 0;
      Result = 4;
      return Result;
    };
    this.ToString = function (AValue, UseBoolStrs) {
      var Result = "";
      Result = $mod.BoolToStr(AValue,UseBoolStrs);
      return Result;
    };
    this.TryToParse = function (S, AValue) {
      var Result = false;
      Result = $mod.TryStrToBool(S,AValue);
      return Result;
    };
    this.ToInteger = function () {
      var Result = 0;
      Result = (this.get() ? 1 : 0);
      return Result;
    };
    this.ToString$1 = function (UseBoolStrs) {
      var Result = "";
      Result = $mod.BoolToStr(this.get(),UseBoolStrs);
      return Result;
    };
  });
  rtl.createClass(this,"TStringBuilder",pas.System.TObject,function () {
    this.DefaultCapacity = 64;
    this.$init = function () {
      pas.System.TObject.$init.call(this);
      this.FData = "";
      this.FMaxCapacity = 0;
    };
    this.GetCapacity = function () {
      var Result = 0;
      Result = this.FData.length;
      return Result;
    };
    this.SetCapacity = function (AValue) {
      if (AValue > this.FMaxCapacity) throw $mod.ERangeError.$create("CreateFmt",[rtl.getResStr(pas.RTLConsts,"SListCapacityError"),pas.System.VarRecs(0,AValue)]);
      if (AValue < this.GetLength()) throw $mod.ERangeError.$create("CreateFmt",[rtl.getResStr(pas.RTLConsts,"SListCapacityError"),pas.System.VarRecs(0,AValue)]);
    };
    this.GetC = function (Index) {
      var Result = "";
      this.CheckNegative(Index,"Index");
      this.CheckRange(Index,0,this.GetLength());
      Result = this.FData.charAt(Index - 1);
      return Result;
    };
    this.SetC = function (Index, AValue) {
      this.CheckNegative(Index,"Index");
      this.CheckRange(Index,0,this.GetLength() - 1);
      this.FData = rtl.setCharAt(this.FData,Index - 1,AValue);
    };
    this.GetLength = function () {
      var Result = 0;
      Result = this.FData.length;
      return Result;
    };
    this.SetLength = function (AValue) {
      this.CheckNegative(AValue,"AValue");
      this.CheckRange(AValue,0,this.FMaxCapacity);
      this.FData = rtl.strSetLength(this.FData,AValue);
    };
    this.CheckRange = function (Idx, Count, MaxLen) {
      if ((Idx < 0) || ((Idx + Count) > MaxLen)) throw $mod.ERangeError.$create("CreateFmt",[rtl.getResStr(pas.RTLConsts,"SListIndexError"),pas.System.VarRecs(0,Idx)]);
    };
    this.CheckNegative = function (AValue, AName) {
      if (AValue < 0) throw $mod.ERangeError.$create("CreateFmt",[rtl.getResStr(pas.RTLConsts,"SParamIsNegative"),pas.System.VarRecs(18,AName)]);
    };
    this.DoAppend = function (S) {
      this.FData = this.FData + S;
    };
    this.DoAppend$1 = function (AValue, Idx, aCount) {
      var S = "";
      var I = 0;
      S = "";
      this.CheckRange(Idx,aCount,rtl.length(AValue));
      for (var $l = Idx, $end = (Idx + aCount) - 1; $l <= $end; $l++) {
        I = $l;
        S = S + AValue[I];
      };
      this.DoAppend(S);
    };
    this.DoInsert = function (Index, AValue) {
      this.CheckRange(Index,0,this.GetLength() - 1);
      pas.System.Insert(AValue,{p: this, get: function () {
          return this.p.FData;
        }, set: function (v) {
          this.p.FData = v;
        }},Index + 1);
    };
    this.DoInsert$1 = function (Index, AValue, StartIndex, aCharCount) {
      var I = 0;
      var S = "";
      this.CheckRange(Index,0,this.GetLength() - 1);
      this.CheckNegative(StartIndex,"StartIndex");
      this.CheckNegative(aCharCount,"SBCharCount");
      this.CheckRange(StartIndex,aCharCount,rtl.length(AValue));
      S = "";
      for (var $l = StartIndex, $end = (StartIndex + aCharCount) - 1; $l <= $end; $l++) {
        I = $l;
        S = S + AValue[I];
      };
      this.DoInsert(Index,S);
    };
    this.DoReplace = function (Index, Old, New) {
      var OVLen = 0;
      OVLen = Old.length;
      pas.System.Delete({p: this, get: function () {
          return this.p.FData;
        }, set: function (v) {
          this.p.FData = v;
        }},Index + 1,OVLen);
      pas.System.Insert(New,{p: this, get: function () {
          return this.p.FData;
        }, set: function (v) {
          this.p.FData = v;
        }},Index + 1);
    };
    this.Grow = function () {
      var NewCapacity = 0;
      NewCapacity = this.GetCapacity() * 2;
      if (NewCapacity > this.FMaxCapacity) NewCapacity = this.FMaxCapacity;
      this.SetCapacity(NewCapacity);
    };
    this.Shrink = function () {
      if (rtl.trunc(this.GetCapacity() / 4) >= this.GetLength()) this.SetCapacity(rtl.trunc(this.GetCapacity() / 2));
    };
    this.Create$1 = function () {
      this.Create$4(64,2147483647);
      return this;
    };
    this.Create$2 = function (aCapacity) {
      this.Create$4(aCapacity,2147483647);
      return this;
    };
    this.Create$3 = function (AValue) {
      this.Create$5(AValue,64);
      return this;
    };
    this.Create$4 = function (aCapacity, aMaxCapacity) {
      this.FMaxCapacity = aMaxCapacity;
      this.SetCapacity(aCapacity);
      return this;
    };
    this.Create$5 = function (AValue, aCapacity) {
      this.Create$4(aCapacity,2147483647);
      if (AValue.length > 0) this.Append$15(AValue);
      return this;
    };
    this.Create$6 = function (AValue, StartIndex, aLength, aCapacity) {
      this.Create$5(pas.System.Copy(AValue,StartIndex + 1,aLength),aCapacity);
      return this;
    };
    this.Append = function (AValue) {
      var Result = null;
      this.DoAppend($mod.BoolToStr(AValue,true));
      Result = this;
      return Result;
    };
    this.Append$1 = function (AValue) {
      var Result = null;
      this.DoAppend($mod.IntToStr(AValue));
      Result = this;
      return Result;
    };
    this.Append$2 = function (AValue) {
      var Result = null;
      this.DoAppend(AValue);
      Result = this;
      return Result;
    };
    this.Append$3 = function (AValue) {
      var Result = null;
      this.DoAppend($mod.CurrToStr(AValue));
      Result = this;
      return Result;
    };
    this.Append$4 = function (AValue) {
      var Result = null;
      this.DoAppend($mod.FloatToStr(AValue));
      Result = this;
      return Result;
    };
    this.Append$5 = function (AValue) {
      var Result = null;
      this.DoAppend($mod.IntToStr(AValue));
      Result = this;
      return Result;
    };
    this.Append$6 = function (AValue) {
      var Result = null;
      this.DoAppend($mod.IntToStr(AValue));
      Result = this;
      return Result;
    };
    this.Append$7 = function (AValue) {
      var Result = null;
      this.DoAppend($mod.IntToStr(AValue));
      Result = this;
      return Result;
    };
    this.Append$8 = function (AValue) {
      var Result = null;
      this.DoAppend(AValue.ToString());
      Result = this;
      return Result;
    };
    this.Append$9 = function (AValue) {
      var Result = null;
      this.DoAppend($mod.IntToStr(AValue));
      Result = this;
      return Result;
    };
    this.Append$10 = function (AValue) {
      var Result = null;
      this.DoAppend($mod.FloatToStr(AValue));
      Result = this;
      return Result;
    };
    this.Append$11 = function (AValue) {
      var Result = null;
      this.DoAppend($mod.IntToStr(AValue));
      Result = this;
      return Result;
    };
    this.Append$12 = function (AValue) {
      var Result = null;
      var I = 0;
      var L = 0;
      I = -1;
      L = rtl.length(AValue);
      if (L === 0) return this;
      do {
        I += 1;
      } while (!((I >= L) || (AValue[I] === "\x00")));
      this.DoAppend$1(AValue,0,I);
      Result = this;
      return Result;
    };
    this.Append$13 = function (AValue) {
      var Result = null;
      this.Append$15($mod.IntToStr(AValue));
      Result = this;
      return Result;
    };
    this.Append$14 = function (AValue) {
      var Result = null;
      this.DoAppend($mod.IntToStr(AValue));
      Result = this;
      return Result;
    };
    this.Append$15 = function (AValue) {
      var Result = null;
      this.DoAppend(AValue);
      Result = this;
      return Result;
    };
    this.Append$16 = function (AValue, RepeatCount) {
      var Result = null;
      this.DoAppend(pas.System.StringOfChar(AValue,RepeatCount));
      Result = this;
      return Result;
    };
    this.Append$17 = function (AValue, StartIndex, SBCharCount) {
      var Result = null;
      this.DoAppend$1(AValue,StartIndex,SBCharCount);
      Result = this;
      return Result;
    };
    this.Append$18 = function (AValue, StartIndex, Count) {
      var Result = null;
      this.CheckRange(StartIndex,Count,AValue.length);
      this.DoAppend(pas.System.Copy(AValue,StartIndex + 1,Count));
      Result = this;
      return Result;
    };
    this.Append$19 = function (Fmt, Args) {
      var Result = null;
      this.DoAppend($mod.Format(Fmt,Args));
      Result = this;
      return Result;
    };
    this.AppendFormat = function (Fmt, Args) {
      var Result = null;
      this.DoAppend($mod.Format(Fmt,Args));
      Result = this;
      return Result;
    };
    this.AppendLine = function () {
      var Result = null;
      this.DoAppend(pas.System.sLineBreak);
      Result = this;
      return Result;
    };
    this.AppendLine$1 = function (AValue) {
      var Result = null;
      this.DoAppend(AValue);
      Result = this.AppendLine();
      return Result;
    };
    this.Clear = function () {
      this.SetLength(0);
      this.SetCapacity(64);
    };
    this.CopyTo = function (SourceIndex, Destination, DestinationIndex, Count) {
      var I = 0;
      this.CheckNegative(Count,"Count");
      this.CheckNegative(DestinationIndex,"DestinationIndex");
      this.CheckRange(DestinationIndex,Count,rtl.length(Destination.get()));
      if (Count > 0) {
        this.CheckRange(SourceIndex,Count,this.GetLength());
        for (var $l = SourceIndex + 1, $end = SourceIndex + Count; $l <= $end; $l++) {
          I = $l;
          Destination.get()[DestinationIndex] = this.FData.charAt(I - 1);
        };
      };
    };
    this.EnsureCapacity = function (aCapacity) {
      var Result = 0;
      this.CheckRange(aCapacity,0,this.FMaxCapacity);
      if (this.GetCapacity() < aCapacity) this.SetCapacity(aCapacity);
      Result = this.GetCapacity();
      return Result;
    };
    this.Equals$1 = function (StringBuilder) {
      var Result = false;
      Result = StringBuilder !== null;
      if (Result) Result = (this.GetLength() === StringBuilder.GetLength()) && (this.FMaxCapacity === StringBuilder.FMaxCapacity) && (this.FData === StringBuilder.FData.charAt(-1));
      return Result;
    };
    this.Insert = function (Index, AValue) {
      var Result = null;
      this.DoInsert(Index,$mod.BoolToStr(AValue,true));
      Result = this;
      return Result;
    };
    this.Insert$1 = function (Index, AValue) {
      var Result = null;
      this.DoInsert(Index,$mod.IntToStr(AValue));
      Result = this;
      return Result;
    };
    this.Insert$2 = function (Index, AValue) {
      var Result = null;
      this.DoInsert(Index,AValue);
      Result = this;
      return Result;
    };
    this.Insert$3 = function (Index, AValue) {
      var Result = null;
      this.DoInsert(Index,$mod.CurrToStr(AValue));
      Result = this;
      return Result;
    };
    this.Insert$4 = function (Index, AValue) {
      var Result = null;
      this.DoInsert(Index,$mod.FloatToStr(AValue));
      Result = this;
      return Result;
    };
    this.Insert$5 = function (Index, AValue) {
      var Result = null;
      this.DoInsert(Index,$mod.IntToStr(AValue));
      Result = this;
      return Result;
    };
    this.Insert$6 = function (Index, AValue) {
      var Result = null;
      this.DoInsert(Index,$mod.IntToStr(AValue));
      Result = this;
      return Result;
    };
    this.Insert$7 = function (Index, AValue) {
      var Result = null;
      this.DoInsert$1(Index,AValue,0,rtl.length(AValue));
      Result = this;
      return Result;
    };
    this.Insert$8 = function (Index, AValue) {
      var Result = null;
      this.DoInsert(Index,$mod.IntToStr(AValue));
      Result = this;
      return Result;
    };
    this.Insert$9 = function (Index, AValue) {
      var Result = null;
      this.DoInsert(Index,AValue.ToString());
      Result = this;
      return Result;
    };
    this.Insert$10 = function (Index, AValue) {
      var Result = null;
      this.DoInsert(Index,$mod.IntToStr(AValue));
      Result = this;
      return Result;
    };
    this.Insert$11 = function (Index, AValue) {
      var Result = null;
      this.DoInsert(Index,$mod.FloatToStr(AValue));
      Result = this;
      return Result;
    };
    this.Insert$12 = function (Index, AValue) {
      var Result = null;
      this.DoInsert(Index,AValue);
      Result = this;
      return Result;
    };
    this.Insert$13 = function (Index, AValue) {
      var Result = null;
      this.DoInsert(Index,$mod.IntToStr(AValue));
      Result = this;
      return Result;
    };
    this.Insert$14 = function (Index, AValue) {
      var Result = null;
      this.DoInsert(Index,$mod.IntToStr(AValue));
      Result = this;
      return Result;
    };
    this.Insert$15 = function (Index, AValue) {
      var Result = null;
      this.DoInsert(Index,$mod.IntToStr(AValue));
      Result = this;
      return Result;
    };
    this.Insert$16 = function (Index, AValue, aRepeatCount) {
      var Result = null;
      var I = 0;
      for (var $l = 0, $end = aRepeatCount - 1; $l <= $end; $l++) {
        I = $l;
        this.DoInsert(Index,AValue);
      };
      Result = this;
      return Result;
    };
    this.Insert$17 = function (Index, AValue, startIndex, SBCharCount) {
      var Result = null;
      this.DoInsert$1(Index,AValue,startIndex,SBCharCount);
      Result = this;
      return Result;
    };
    this.Remove = function (StartIndex, RemLength) {
      var Result = null;
      var MoveIndex = 0;
      if (RemLength === 0) return this;
      this.CheckNegative(RemLength,"RemLength");
      this.CheckRange(StartIndex,0,this.GetLength());
      MoveIndex = StartIndex + RemLength;
      this.CheckRange(MoveIndex,0,this.GetLength());
      pas.System.Delete({p: this, get: function () {
          return this.p.FData;
        }, set: function (v) {
          this.p.FData = v;
        }},StartIndex + 1,RemLength);
      this.Shrink();
      Result = this;
      return Result;
    };
    this.Replace = function (OldValue, NewValue) {
      var Result = null;
      Result = this.Replace$1(OldValue,NewValue,0,this.GetLength());
      return Result;
    };
    this.Replace$1 = function (OldValue, NewValue, StartIndex, Count) {
      var Result = null;
      var I = 0;
      var Start = "";
      if (Count === 0) return this;
      this.CheckNegative(StartIndex,"StartIndex");
      this.CheckNegative(Count,"Count");
      this.CheckRange(StartIndex,Count,this.GetLength());
      Start = pas.System.Copy(this.FData,1,StartIndex + 1);
      this.FData = pas.System.Copy$1(this.FData,StartIndex + 1);
      for (var $l = 1, $end = Count; $l <= $end; $l++) {
        I = $l;
        this.FData = $mod.StringReplace(this.FData,OldValue,NewValue,{});
      };
      this.FData = Start + this.FData;
      Result = this;
      return Result;
    };
    this.ToString = function () {
      var Result = "";
      Result = this.ToString$2(0,this.GetLength());
      return Result;
    };
    this.ToString$2 = function (aStartIndex, aLength) {
      var Result = "";
      this.CheckNegative(aStartIndex,"aStartIndex");
      this.CheckNegative(aLength,"aLength");
      this.CheckRange(aStartIndex,aLength,this.GetLength());
      pas.System.Writeln("FData : ",this.FData);
      Result = pas.System.Copy(this.FData,1 + aStartIndex,aStartIndex + aLength);
      return Result;
    };
  });
  $mod.$implcode = function () {
    $impl.DefaultShortMonthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    $impl.DefaultLongMonthNames = ["January","February","March","April","May","June","July","August","September","October","November","December"];
    $impl.DefaultShortDayNames = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
    $impl.DefaultLongDayNames = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
    $impl.DoShowException = function (S) {
      if ($mod.OnShowException != null) {
        $mod.OnShowException(S)}
       else {
        window.alert(S);
      };
    };
    $mod.$rtti.$ProcVar("TRTLExceptionHandler",{procsig: rtl.newTIProcSig([["aError",rtl.jsvalue]])});
    $impl.OnPascalException = null;
    $impl.OnJSException = null;
    $impl.RTLExceptionHook = function (aError) {
      var S = "";
      if (pas.JS.isClassInstance(aError)) {
        if ($impl.OnPascalException != null) {
          $impl.OnPascalException(rtl.getObject(aError))}
         else $mod.ShowException(rtl.getObject(aError),null);
      } else if (rtl.isObject(aError)) {
        if ($impl.OnJSException != null) {
          $impl.OnJSException(aError)}
         else {
          if (aError.hasOwnProperty("message")) {
            S = rtl.getResStr($mod,"SErrUnknownExceptionType") + ("" + aError["message"])}
           else S = rtl.getResStr($mod,"SErrUnknownExceptionType") + aError.toString();
          $impl.DoShowException(S);
        };
      } else {
        S = rtl.getResStr($mod,"SErrUnknownExceptionType") + ("" + aError);
        $impl.DoShowException(S);
      };
    };
    $mod.$rtti.$Set("TCharSet",{comptype: rtl.char});
    $impl.CharInSet$1 = function (Ch, CSet) {
      var Result = false;
      Result = Ch.charCodeAt() in CSet;
      return Result;
    };
    $impl.CheckBoolStrs = function () {
      if (rtl.length($mod.TrueBoolStrs) === 0) {
        $mod.TrueBoolStrs = rtl.arraySetLength($mod.TrueBoolStrs,"",1);
        $mod.TrueBoolStrs[0] = "True";
      };
      if (rtl.length($mod.FalseBoolStrs) === 0) {
        $mod.FalseBoolStrs = rtl.arraySetLength($mod.FalseBoolStrs,"",1);
        $mod.FalseBoolStrs[0] = "False";
      };
    };
    $impl.feInvalidFormat = 1;
    $impl.feMissingArgument = 2;
    $impl.feInvalidArgIndex = 3;
    $impl.DoFormatError = function (ErrCode, fmt) {
      var $tmp = ErrCode;
      if ($tmp === 1) {
        throw $mod.EConvertError.$create("CreateFmt",[rtl.getResStr(pas.RTLConsts,"SInvalidFormat"),pas.System.VarRecs(18,fmt)])}
       else if ($tmp === 2) {
        throw $mod.EConvertError.$create("CreateFmt",[rtl.getResStr(pas.RTLConsts,"SArgumentMissing"),pas.System.VarRecs(18,fmt)])}
       else if ($tmp === 3) throw $mod.EConvertError.$create("CreateFmt",[rtl.getResStr(pas.RTLConsts,"SInvalidArgIndex"),pas.System.VarRecs(18,fmt)]);
    };
    $impl.maxdigits = 15;
    $impl.ReplaceDecimalSep = function (S, DS) {
      var Result = "";
      var P = 0;
      P = pas.System.Pos(".",S);
      if (P > 0) {
        Result = pas.System.Copy(S,1,P - 1) + DS + pas.System.Copy(S,P + 1,S.length - P)}
       else Result = S;
      return Result;
    };
    $impl.FormatGeneralFloat = function (Value, Precision, DS) {
      var Result = "";
      var P = 0;
      var PE = 0;
      var Q = 0;
      var Exponent = 0;
      if ((Precision === -1) || (Precision > 15)) Precision = 15;
      Result = rtl.floatToStr(Value,Precision + 7);
      Result = $mod.TrimLeft(Result);
      P = pas.System.Pos(".",Result);
      if (P === 0) return Result;
      PE = pas.System.Pos("E",Result);
      if (PE === 0) {
        Result = $impl.ReplaceDecimalSep(Result,DS);
        return Result;
      };
      Q = PE + 2;
      Exponent = 0;
      while (Q <= Result.length) {
        Exponent = ((Exponent * 10) + Result.charCodeAt(Q - 1)) - 48;
        Q += 1;
      };
      if (Result.charAt((PE + 1) - 1) === "-") Exponent = -Exponent;
      if (((P + Exponent) < PE) && (Exponent > -6)) {
        Result = rtl.strSetLength(Result,PE - 1);
        if (Exponent >= 0) {
          for (var $l = 0, $end = Exponent - 1; $l <= $end; $l++) {
            Q = $l;
            Result = rtl.setCharAt(Result,P - 1,Result.charAt((P + 1) - 1));
            P += 1;
          };
          Result = rtl.setCharAt(Result,P - 1,".");
          P = 1;
          if (Result.charAt(P - 1) === "-") P += 1;
          while ((Result.charAt(P - 1) === "0") && (P < Result.length) && (pas.System.Copy(Result,P + 1,DS.length) !== DS)) pas.System.Delete({get: function () {
              return Result;
            }, set: function (v) {
              Result = v;
            }},P,1);
        } else {
          pas.System.Insert(pas.System.Copy("00000",1,-Exponent),{get: function () {
              return Result;
            }, set: function (v) {
              Result = v;
            }},P - 1);
          Result = rtl.setCharAt(Result,P - Exponent - 1,Result.charAt(P - Exponent - 1 - 1));
          Result = rtl.setCharAt(Result,P - 1,".");
          if (Exponent !== -1) Result = rtl.setCharAt(Result,P - Exponent - 1 - 1,"0");
        };
        Q = Result.length;
        while ((Q > 0) && (Result.charAt(Q - 1) === "0")) Q -= 1;
        if (Result.charAt(Q - 1) === ".") Q -= 1;
        if ((Q === 0) || ((Q === 1) && (Result.charAt(0) === "-"))) {
          Result = "0"}
         else Result = rtl.strSetLength(Result,Q);
      } else {
        while (Result.charAt(PE - 1 - 1) === "0") {
          pas.System.Delete({get: function () {
              return Result;
            }, set: function (v) {
              Result = v;
            }},PE - 1,1);
          PE -= 1;
        };
        if (Result.charAt(PE - 1 - 1) === DS) {
          pas.System.Delete({get: function () {
              return Result;
            }, set: function (v) {
              Result = v;
            }},PE - 1,1);
          PE -= 1;
        };
        if (Result.charAt((PE + 1) - 1) === "+") {
          pas.System.Delete({get: function () {
              return Result;
            }, set: function (v) {
              Result = v;
            }},PE + 1,1)}
         else PE += 1;
        while (Result.charAt((PE + 1) - 1) === "0") pas.System.Delete({get: function () {
            return Result;
          }, set: function (v) {
            Result = v;
          }},PE + 1,1);
      };
      Result = $impl.ReplaceDecimalSep(Result,DS);
      return Result;
    };
    $impl.FormatExponentFloat = function (Value, Precision, Digits, DS) {
      var Result = "";
      var P = 0;
      DS = $mod.FormatSettings.DecimalSeparator;
      if ((Precision === -1) || (Precision > 15)) Precision = 15;
      Result = rtl.floatToStr(Value,Precision + 7);
      while (Result.charAt(0) === " ") pas.System.Delete({get: function () {
          return Result;
        }, set: function (v) {
          Result = v;
        }},1,1);
      P = pas.System.Pos("E",Result);
      if (P === 0) {
        Result = $impl.ReplaceDecimalSep(Result,DS);
        return Result;
      };
      P += 2;
      if (Digits > 4) Digits = 4;
      Digits = (Result.length - P - Digits) + 1;
      if (Digits < 0) {
        pas.System.Insert(pas.System.Copy("0000",1,-Digits),{get: function () {
            return Result;
          }, set: function (v) {
            Result = v;
          }},P)}
       else while ((Digits > 0) && (Result.charAt(P - 1) === "0")) {
        pas.System.Delete({get: function () {
            return Result;
          }, set: function (v) {
            Result = v;
          }},P,1);
        if (P > Result.length) {
          pas.System.Delete({get: function () {
              return Result;
            }, set: function (v) {
              Result = v;
            }},P - 2,2);
          break;
        };
        Digits -= 1;
      };
      Result = $impl.ReplaceDecimalSep(Result,DS);
      return Result;
    };
    $impl.FormatFixedFloat = function (Value, Digits, DS) {
      var Result = "";
      if (Digits === -1) {
        Digits = 2}
       else if (Digits > 18) Digits = 18;
      Result = rtl.floatToStr(Value,0,Digits);
      if ((Result !== "") && (Result.charAt(0) === " ")) pas.System.Delete({get: function () {
          return Result;
        }, set: function (v) {
          Result = v;
        }},1,1);
      Result = $impl.ReplaceDecimalSep(Result,DS);
      return Result;
    };
    $impl.FormatNumberFloat = function (Value, Digits, DS, TS) {
      var Result = "";
      var P = 0;
      if (Digits === -1) {
        Digits = 2}
       else if (Digits > 15) Digits = 15;
      Result = rtl.floatToStr(Value,0,Digits);
      if ((Result !== "") && (Result.charAt(0) === " ")) pas.System.Delete({get: function () {
          return Result;
        }, set: function (v) {
          Result = v;
        }},1,1);
      P = pas.System.Pos(".",Result);
      if (P <= 0) P = Result.length + 1;
      Result = $impl.ReplaceDecimalSep(Result,DS);
      P -= 3;
      if ((TS !== "") && (TS !== "\x00")) while (P > 1) {
        if (Result.charAt(P - 1 - 1) !== "-") pas.System.Insert(TS,{get: function () {
            return Result;
          }, set: function (v) {
            Result = v;
          }},P);
        P -= 3;
      };
      return Result;
    };
    $impl.RemoveLeadingNegativeSign = function (AValue, DS, aThousandSeparator) {
      var Result = false;
      var i = 0;
      var TS = "";
      var StartPos = 0;
      Result = false;
      StartPos = 2;
      TS = aThousandSeparator;
      for (var $l = StartPos, $end = AValue.get().length; $l <= $end; $l++) {
        i = $l;
        Result = (AValue.get().charCodeAt(i - 1) in rtl.createSet(48,DS.charCodeAt(),69,43)) || (AValue.get().charAt(i - 1) === TS);
        if (!Result) break;
      };
      if (Result && (AValue.get().charAt(0) === "-")) pas.System.Delete(AValue,1,1);
      return Result;
    };
    $impl.FormatNumberCurrency = function (Value, Digits, aSettings) {
      var Result = "";
      var Negative = false;
      var P = 0;
      var CS = "";
      var DS = "";
      var TS = "";
      DS = aSettings.DecimalSeparator;
      TS = aSettings.ThousandSeparator;
      CS = aSettings.CurrencyString;
      if (Digits === -1) {
        Digits = aSettings.CurrencyDecimals}
       else if (Digits > 18) Digits = 18;
      Result = rtl.floatToStr(Value / 10000,0,Digits);
      Negative = Result.charAt(0) === "-";
      if (Negative) pas.System.Delete({get: function () {
          return Result;
        }, set: function (v) {
          Result = v;
        }},1,1);
      P = pas.System.Pos(".",Result);
      if (TS !== "") {
        if (P !== 0) {
          Result = $impl.ReplaceDecimalSep(Result,DS)}
         else P = Result.length + 1;
        P -= 3;
        while (P > 1) {
          pas.System.Insert(TS,{get: function () {
              return Result;
            }, set: function (v) {
              Result = v;
            }},P);
          P -= 3;
        };
      };
      if (Negative) $impl.RemoveLeadingNegativeSign({get: function () {
          return Result;
        }, set: function (v) {
          Result = v;
        }},DS,TS);
      if (!Negative) {
        var $tmp = aSettings.CurrencyFormat;
        if ($tmp === 0) {
          Result = CS + Result}
         else if ($tmp === 1) {
          Result = Result + CS}
         else if ($tmp === 2) {
          Result = CS + " " + Result}
         else if ($tmp === 3) Result = Result + " " + CS;
      } else {
        var $tmp1 = aSettings.NegCurrFormat;
        if ($tmp1 === 0) {
          Result = "(" + CS + Result + ")"}
         else if ($tmp1 === 1) {
          Result = "-" + CS + Result}
         else if ($tmp1 === 2) {
          Result = CS + "-" + Result}
         else if ($tmp1 === 3) {
          Result = CS + Result + "-"}
         else if ($tmp1 === 4) {
          Result = "(" + Result + CS + ")"}
         else if ($tmp1 === 5) {
          Result = "-" + Result + CS}
         else if ($tmp1 === 6) {
          Result = Result + "-" + CS}
         else if ($tmp1 === 7) {
          Result = Result + CS + "-"}
         else if ($tmp1 === 8) {
          Result = "-" + Result + " " + CS}
         else if ($tmp1 === 9) {
          Result = "-" + CS + " " + Result}
         else if ($tmp1 === 10) {
          Result = Result + " " + CS + "-"}
         else if ($tmp1 === 11) {
          Result = CS + " " + Result + "-"}
         else if ($tmp1 === 12) {
          Result = CS + " " + "-" + Result}
         else if ($tmp1 === 13) {
          Result = Result + "-" + " " + CS}
         else if ($tmp1 === 14) {
          Result = "(" + CS + " " + Result + ")"}
         else if ($tmp1 === 15) Result = "(" + Result + " " + CS + ")";
      };
      return Result;
    };
    $impl.RESpecials = "([\\$\\+\\[\\]\\(\\)\\\\\\.\\*\\^\\?\\|])";
    $impl.DoEncodeDate = function (Year, Month, Day) {
      var Result = 0;
      var D = 0.0;
      if ($mod.TryEncodeDate(Year,Month,Day,{get: function () {
          return D;
        }, set: function (v) {
          D = v;
        }})) {
        Result = pas.System.Trunc(D)}
       else Result = 0;
      return Result;
    };
    $impl.DoEncodeTime = function (Hour, Minute, Second, MilliSecond) {
      var Result = 0.0;
      if (!$mod.TryEncodeTime(Hour,Minute,Second,MilliSecond,{get: function () {
          return Result;
        }, set: function (v) {
          Result = v;
        }})) Result = 0;
      return Result;
    };
    $mod.$rtti.$StaticArray("DateTimeToStrFormat$a",{dims: [2], eltype: rtl.string});
    $impl.DateTimeToStrFormat = ["c","f"];
    var WhiteSpace = " \b\t\n\f\r";
    var Digits = "0123456789";
    $impl.IntStrToDate = function (ErrorMsg, S, useformat, separator) {
      var Result = 0.0;
      function FixErrorMsg(errmarg) {
        ErrorMsg.set($mod.Format(rtl.getResStr(pas.RTLConsts,"SInvalidDateFormat"),pas.System.VarRecs(18,errmarg)));
      };
      var df = "";
      var d = 0;
      var m = 0;
      var y = 0;
      var ly = 0;
      var ld = 0;
      var lm = 0;
      var n = 0;
      var i = 0;
      var len = 0;
      var c = 0;
      var dp = 0;
      var mp = 0;
      var yp = 0;
      var which = 0;
      var s1 = "";
      var values = [];
      var YearMoreThenTwoDigits = false;
      values = rtl.arraySetLength(values,0,4);
      Result = 0;
      len = S.length;
      ErrorMsg.set("");
      while ((len > 0) && (pas.System.Pos(S.charAt(len - 1),WhiteSpace) > 0)) len -= 1;
      if (len === 0) {
        FixErrorMsg(S);
        return Result;
      };
      YearMoreThenTwoDigits = false;
      if (separator === "\x00") if ($mod.FormatSettings.DateSeparator !== "\x00") {
        separator = $mod.FormatSettings.DateSeparator}
       else separator = "-";
      df = $mod.UpperCase(useformat);
      yp = 0;
      mp = 0;
      dp = 0;
      which = 0;
      i = 0;
      while ((i < df.length) && (which < 3)) {
        i += 1;
        var $tmp = df.charAt(i - 1);
        if ($tmp === "Y") {
          if (yp === 0) {
            which += 1;
            yp = which;
          }}
         else if ($tmp === "M") {
          if (mp === 0) {
            which += 1;
            mp = which;
          }}
         else if ($tmp === "D") if (dp === 0) {
          which += 1;
          dp = which;
        };
      };
      for (i = 1; i <= 3; i++) values[i] = 0;
      s1 = "";
      n = 0;
      for (var $l = 1, $end = len; $l <= $end; $l++) {
        i = $l;
        if (pas.System.Pos(S.charAt(i - 1),Digits) > 0) s1 = s1 + S.charAt(i - 1);
        if ((separator !== " ") && (S.charAt(i - 1) === " ")) continue;
        if ((S.charAt(i - 1) === separator) || ((i === len) && (pas.System.Pos(S.charAt(i - 1),Digits) > 0))) {
          n += 1;
          if (n > 3) {
            FixErrorMsg(S);
            return Result;
          };
          if ((n === yp) && (s1.length > 2)) YearMoreThenTwoDigits = true;
          pas.System.val$6(s1,{a: n, p: values, get: function () {
              return this.p[this.a];
            }, set: function (v) {
              this.p[this.a] = v;
            }},{get: function () {
              return c;
            }, set: function (v) {
              c = v;
            }});
          if (c !== 0) {
            FixErrorMsg(S);
            return Result;
          };
          s1 = "";
        } else if (pas.System.Pos(S.charAt(i - 1),Digits) === 0) {
          FixErrorMsg(S);
          return Result;
        };
      };
      if ((which < 3) && (n > which)) {
        FixErrorMsg(S);
        return Result;
      };
      $mod.DecodeDate($mod.Date(),{get: function () {
          return ly;
        }, set: function (v) {
          ly = v;
        }},{get: function () {
          return lm;
        }, set: function (v) {
          lm = v;
        }},{get: function () {
          return ld;
        }, set: function (v) {
          ld = v;
        }});
      if (n === 3) {
        y = values[yp];
        m = values[mp];
        d = values[dp];
      } else {
        y = ly;
        if (n < 2) {
          d = values[1];
          m = lm;
        } else if (dp < mp) {
          d = values[1];
          m = values[2];
        } else {
          d = values[2];
          m = values[1];
        };
      };
      if ((y >= 0) && (y < 100) && !YearMoreThenTwoDigits) {
        ly = ly - $mod.TwoDigitYearCenturyWindow;
        y += rtl.trunc(ly / 100) * 100;
        if (($mod.TwoDigitYearCenturyWindow > 0) && (y < ly)) y += 100;
      };
      if (!$mod.TryEncodeDate(y,m,d,{get: function () {
          return Result;
        }, set: function (v) {
          Result = v;
        }})) ErrorMsg.set(rtl.getResStr(pas.RTLConsts,"SErrInvalidDate"));
      return Result;
    };
    var AMPM_None = 0;
    var AMPM_AM = 1;
    var AMPM_PM = 2;
    var tiHour = 0;
    var tiMin = 1;
    var tiSec = 2;
    var tiMSec = 3;
    var Digits$1 = "0123456789";
    $impl.IntStrToTime = function (ErrorMsg, S, Len, aSettings) {
      var Result = 0.0;
      var AmPm = 0;
      var TimeValues = [];
      function SplitElements(TimeValues, AmPm) {
        var Result = false;
        var Cur = 0;
        var Offset = 0;
        var ElemLen = 0;
        var Err = 0;
        var TimeIndex = 0;
        var FirstSignificantDigit = 0;
        var Value = 0;
        var DigitPending = false;
        var MSecPending = false;
        var AmPmStr = "";
        var CurChar = "";
        var I = 0;
        var allowedchars = "";
        Result = false;
        AmPm.set(0);
        MSecPending = false;
        TimeIndex = 0;
        for (I = 0; I <= 3; I++) TimeValues.get()[I] = 0;
        Cur = 1;
        while ((Cur < Len) && (S.charAt(Cur - 1) === " ")) Cur += 1;
        Offset = Cur;
        if ((Cur > (Len - 1)) || (S.charAt(Cur - 1) === aSettings.TimeSeparator) || (S.charAt(Cur - 1) === aSettings.DecimalSeparator)) {
          return Result;
        };
        DigitPending = pas.System.Pos(S.charAt(Cur - 1),Digits$1) > 0;
        while (Cur <= Len) {
          CurChar = S.charAt(Cur - 1);
          if (pas.System.Pos(CurChar,Digits$1) > 0) {
            if (!DigitPending || (TimeIndex > 3)) {
              return Result;
            };
            Offset = Cur;
            if (CurChar !== "0") {
              FirstSignificantDigit = Offset}
             else FirstSignificantDigit = -1;
            while ((Cur < Len) && (pas.System.Pos(S.charAt((Cur + 1) - 1),Digits$1) > 0)) {
              if ((FirstSignificantDigit === -1) && (S.charAt(Cur - 1) !== "0")) FirstSignificantDigit = Cur;
              Cur += 1;
            };
            if (FirstSignificantDigit === -1) FirstSignificantDigit = Cur;
            ElemLen = (1 + Cur) - FirstSignificantDigit;
            if ((ElemLen <= 2) || ((ElemLen <= 3) && (TimeIndex === 3))) {
              pas.System.val$6(pas.System.Copy(S,FirstSignificantDigit,ElemLen),{get: function () {
                  return Value;
                }, set: function (v) {
                  Value = v;
                }},{get: function () {
                  return Err;
                }, set: function (v) {
                  Err = v;
                }});
              TimeValues.get()[TimeIndex] = Value;
              TimeIndex += 1;
              DigitPending = false;
            } else {
              return Result;
            };
          } else if (CurChar === " ") {}
          else if (CurChar === aSettings.TimeSeparator) {
            if (DigitPending || (TimeIndex > 2)) {
              return Result;
            };
            DigitPending = true;
            MSecPending = false;
          } else if (CurChar === aSettings.DecimalSeparator) {
            if (DigitPending || MSecPending || (TimeIndex !== 3)) {
              return Result;
            };
            DigitPending = true;
            MSecPending = true;
          } else {
            if ((AmPm.get() !== 0) || DigitPending) {
              return Result;
            };
            Offset = Cur;
            allowedchars = aSettings.DecimalSeparator + " ";
            if (aSettings.TimeSeparator !== "\x00") allowedchars = allowedchars + aSettings.TimeSeparator;
            while ((Cur < Len) && (pas.System.Pos(S.charAt((Cur + 1) - 1),allowedchars) === 0) && (pas.System.Pos(S.charAt((Cur + 1) - 1),Digits$1) === 0)) Cur += 1;
            ElemLen = (1 + Cur) - Offset;
            AmPmStr = pas.System.Copy(S,Offset,ElemLen);
            if ($mod.CompareText(AmPmStr,aSettings.TimeAMString) === 0) {
              AmPm.set(1)}
             else if ($mod.CompareText(AmPmStr,aSettings.TimePMString) === 0) {
              AmPm.set(2)}
             else if ($mod.CompareText(AmPmStr,"AM") === 0) {
              AmPm.set(1)}
             else if ($mod.CompareText(AmPmStr,"PM") === 0) {
              AmPm.set(2)}
             else {
              return Result;
            };
            if (TimeIndex === 0) {
              DigitPending = true;
            } else {
              TimeIndex = 3 + 1;
              DigitPending = false;
            };
          };
          Cur += 1;
        };
        if ((TimeIndex === 0) || ((AmPm.get() !== 0) && ((TimeValues.get()[0] > 12) || (TimeValues.get()[0] === 0))) || DigitPending) return Result;
        Result = true;
        return Result;
      };
      TimeValues = rtl.arraySetLength(TimeValues,0,4);
      AmPm = 0;
      if (!SplitElements({get: function () {
          return TimeValues;
        }, set: function (v) {
          TimeValues = v;
        }},{get: function () {
          return AmPm;
        }, set: function (v) {
          AmPm = v;
        }})) {
        ErrorMsg.set($mod.Format(rtl.getResStr(pas.RTLConsts,"SErrInvalidTimeFormat"),pas.System.VarRecs(18,S)));
        return Result;
      };
      if ((AmPm === 2) && (TimeValues[0] !== 12)) {
        TimeValues[0] += 12}
       else if ((AmPm === 1) && (TimeValues[0] === 12)) TimeValues[0] = 0;
      if (!$mod.TryEncodeTime(TimeValues[0],TimeValues[1],TimeValues[2],TimeValues[3],{get: function () {
          return Result;
        }, set: function (v) {
          Result = v;
        }})) ErrorMsg.set($mod.Format(rtl.getResStr(pas.RTLConsts,"SErrInvalidTimeFormat"),pas.System.VarRecs(18,S)));
      return Result;
    };
    var WhiteSpace$1 = "\t\n\r ";
    $impl.SplitDateTimeStr = function (DateTimeStr, DateStr, TimeStr, aSettings) {
      var Result = 0;
      var p = 0;
      var DummyDT = 0.0;
      Result = 0;
      DateStr.set("");
      TimeStr.set("");
      DateTimeStr = $mod.Trim(DateTimeStr);
      if (DateTimeStr.length === 0) return Result;
      if ((aSettings.DateSeparator === " ") && (aSettings.TimeSeparator === " ") && (pas.System.Pos(" ",DateTimeStr) > 0)) {
        DateStr.set(DateTimeStr);
        return 1;
      };
      p = 1;
      if (aSettings.DateSeparator !== " ") {
        while ((p < DateTimeStr.length) && !(pas.System.Pos(DateTimeStr.charAt((p + 1) - 1),WhiteSpace$1) > 0)) p += 1;
      } else {
        p = pas.System.Pos(aSettings.TimeSeparator,DateTimeStr);
        if (p !== 0) do {
          p -= 1;
        } while (!((p === 0) || (pas.System.Pos(DateTimeStr.charAt(p - 1),WhiteSpace$1) > 0)));
      };
      if (p === 0) p = DateTimeStr.length;
      DateStr.set(pas.System.Copy(DateTimeStr,1,p));
      TimeStr.set($mod.Trim(pas.System.Copy(DateTimeStr,p + 1,100)));
      if (TimeStr.get().length !== 0) {
        Result = 2}
       else {
        Result = 1;
        if (((aSettings.DateSeparator !== aSettings.TimeSeparator) && (pas.System.Pos(aSettings.TimeSeparator,DateStr.get()) > 0)) || ((aSettings.DateSeparator === aSettings.TimeSeparator) && !$mod.TryStrToDate(DateStr.get(),{get: function () {
            return DummyDT;
          }, set: function (v) {
            DummyDT = v;
          }}))) {
          TimeStr.set(DateStr.get());
          DateStr.set("");
        };
      };
      return Result;
    };
    $impl.IntTryStrToInt = function (S, res, aSep) {
      var Result = false;
      var Radix = 10;
      var N = "";
      var J = undefined;
      N = S;
      if ((pas.System.Pos(aSep,N) !== 0) || (pas.System.Pos(".",N) !== 0)) return false;
      var $tmp = pas.System.Copy(N,1,1);
      if ($tmp === "$") {
        Radix = 16}
       else if ($tmp === "&") {
        Radix = 8}
       else if ($tmp === "%") Radix = 2;
      if ((Radix !== 16) && (pas.System.Pos("e",$mod.LowerCase(N)) !== 0)) return false;
      if (Radix !== 10) pas.System.Delete({get: function () {
          return N;
        }, set: function (v) {
          N = v;
        }},1,1);
      J = parseInt(N,Radix);
      Result = !isNaN(J);
      if (Result) res.set(rtl.trunc(J));
      return Result;
    };
    $impl.NotImplemented = function (S) {
      throw $mod.Exception.$create("Create$1",["Not yet implemented : " + S]);
    };
    $impl.HaveChar = function (AChar, AList) {
      var Result = false;
      var I = 0;
      I = 0;
      Result = false;
      while (!Result && (I < rtl.length(AList))) {
        Result = AList[I] === AChar;
        I += 1;
      };
      return Result;
    };
    rtl.recNewT($impl,"TFloatParts",function () {
      this.sign = false;
      this.exp = 0;
      this.mantissa = 0.0;
      this.$eq = function (b) {
        return (this.sign === b.sign) && (this.exp === b.exp) && (this.mantissa === b.mantissa);
      };
      this.$assign = function (s) {
        this.sign = s.sign;
        this.exp = s.exp;
        this.mantissa = s.mantissa;
        return this;
      };
      var $r = $mod.$rtti.$Record("TFloatParts",{});
      $r.addField("sign",rtl.boolean);
      $r.addField("exp",rtl.longint);
      $r.addField("mantissa",rtl.double);
    });
    $impl.FloatToParts = function (aValue) {
      var Result = $impl.TFloatParts.$new();
      var F = null;
      var B = null;
      F = new Float64Array(1);
      B = new Uint8Array(F.buffer);
      F[0] = aValue;
      Result.sign = (B[7] >>> 7) === 0;
      Result.exp = (((B[7] & 0x7f) << 4) | (B[6] >>> 4)) - 0x3ff;
      B[3] = 0x3F;
      B[6] = B[6] | 0xF0;
      Result.mantissa = F[0];
      return Result;
    };
    $mod.$resourcestrings = {SAbortError: {org: "Operation aborted"}, SApplicationException: {org: "Application raised an exception: "}, SErrUnknownExceptionType: {org: "Caught unknown exception type : "}};
  };
  $mod.$init = function () {
    $mod.ShortMonthNames = $impl.DefaultShortMonthNames.slice(0);
    $mod.LongMonthNames = $impl.DefaultLongMonthNames.slice(0);
    $mod.ShortDayNames = $impl.DefaultShortDayNames.slice(0);
    $mod.LongDayNames = $impl.DefaultLongDayNames.slice(0);
    $mod.FormatSettings.$assign($mod.TFormatSettings.Create());
    $mod.TimeSeparator = $mod.FormatSettings.TimeSeparator;
    $mod.DateSeparator = $mod.FormatSettings.DateSeparator;
    $mod.ShortDateFormat = $mod.FormatSettings.ShortDateFormat;
    $mod.LongDateFormat = $mod.FormatSettings.LongDateFormat;
    $mod.ShortTimeFormat = $mod.FormatSettings.ShortTimeFormat;
    $mod.LongTimeFormat = $mod.FormatSettings.LongTimeFormat;
    $mod.DecimalSeparator = $mod.FormatSettings.DecimalSeparator;
    $mod.ThousandSeparator = $mod.FormatSettings.ThousandSeparator;
    $mod.TimeAMString = $mod.FormatSettings.TimeAMString;
    $mod.TimePMString = $mod.FormatSettings.TimePMString;
    $mod.CurrencyFormat = $mod.FormatSettings.CurrencyFormat;
    $mod.NegCurrFormat = $mod.FormatSettings.NegCurrFormat;
    $mod.CurrencyDecimals = $mod.FormatSettings.CurrencyDecimals;
    $mod.CurrencyString = $mod.FormatSettings.CurrencyString;
  };
},[]);
rtl.module("TypInfo",["System","SysUtils","Types","RTLConsts","JS"],function () {
  "use strict";
  var $mod = this;
  var $impl = $mod.$impl;
  this.TCallConv = {"0": "ccReg", ccReg: 0, "1": "ccCdecl", ccCdecl: 1, "2": "ccPascal", ccPascal: 2, "3": "ccStdCall", ccStdCall: 3, "4": "ccSafeCall", ccSafeCall: 4, "5": "ccCppdecl", ccCppdecl: 5, "6": "ccFar16", ccFar16: 6, "7": "ccOldFPCCall", ccOldFPCCall: 7, "8": "ccInternProc", ccInternProc: 8, "9": "ccSysCall", ccSysCall: 9, "10": "ccSoftFloat", ccSoftFloat: 10, "11": "ccMWPascal", ccMWPascal: 11};
  this.$rtti.$Enum("TCallConv",{minvalue: 0, maxvalue: 11, ordtype: 1, enumtype: this.TCallConv});
  this.$rtti.$ExtClass("TSectionRTTI",{ancestor: pas.JS.$rtti["TJSObject"], jsclass: "rtl.tSectionRTTI"});
  this.$rtti.$ExtClass("TTypeInfoModule",{ancestor: pas.JS.$rtti["TJSObject"], jsclass: "pasmodule"});
  this.$rtti.$inherited("TTypeInfoAttributes",pas.Types.$rtti["TJSValueDynArray"],{});
  this.$rtti.$ExtClass("TTypeInfo",{jsclass: "rtl.tTypeInfo"});
  this.$rtti.$ClassRef("TTypeInfoClassOf",{instancetype: this.$rtti["TTypeInfo"]});
  this.TOrdType = {"0": "otSByte", otSByte: 0, "1": "otUByte", otUByte: 1, "2": "otSWord", otSWord: 2, "3": "otUWord", otUWord: 3, "4": "otSLong", otSLong: 4, "5": "otULong", otULong: 5, "6": "otSIntDouble", otSIntDouble: 6, "7": "otUIntDouble", otUIntDouble: 7};
  this.$rtti.$Enum("TOrdType",{minvalue: 0, maxvalue: 7, ordtype: 1, enumtype: this.TOrdType});
  this.$rtti.$ExtClass("TTypeInfoInteger",{ancestor: this.$rtti["TTypeInfo"], jsclass: "rtl.tTypeInfoInteger"});
  this.$rtti.$ExtClass("TEnumType",{jsclass: "anonymous"});
  this.$rtti.$ExtClass("TTypeInfoEnum",{ancestor: this.$rtti["TTypeInfoInteger"], jsclass: "rtl.tTypeInfoEnum"});
  this.$rtti.$ExtClass("TTypeInfoSet",{ancestor: this.$rtti["TTypeInfo"], jsclass: "rtl.tTypeInfoSet"});
  this.$rtti.$ExtClass("TTypeInfoStaticArray",{ancestor: this.$rtti["TTypeInfo"], jsclass: "rtl.tTypeInfoStaticArray"});
  this.$rtti.$ExtClass("TTypeInfoDynArray",{ancestor: this.$rtti["TTypeInfo"], jsclass: "rtl.tTypeInfoDynArray"});
  this.TParamFlag = {"0": "pfVar", pfVar: 0, "1": "pfConst", pfConst: 1, "2": "pfOut", pfOut: 2, "3": "pfArray", pfArray: 3, "4": "pfAddress", pfAddress: 4, "5": "pfReference", pfReference: 5};
  this.$rtti.$Enum("TParamFlag",{minvalue: 0, maxvalue: 5, ordtype: 1, enumtype: this.TParamFlag});
  this.$rtti.$Set("TParamFlags",{comptype: this.$rtti["TParamFlag"]});
  this.$rtti.$ExtClass("TProcedureParam",{jsclass: "anonymous"});
  this.$rtti.$DynArray("TProcedureParams",{eltype: this.$rtti["TProcedureParam"]});
  this.TProcedureFlag = {"0": "pfStatic", pfStatic: 0, "1": "pfVarargs", pfVarargs: 1, "2": "pfExternal", pfExternal: 2, "3": "pfSafeCall", pfSafeCall: 3, "4": "pfAsync", pfAsync: 4};
  this.$rtti.$Enum("TProcedureFlag",{minvalue: 0, maxvalue: 4, ordtype: 1, enumtype: this.TProcedureFlag});
  this.$rtti.$Set("TProcedureFlags",{comptype: this.$rtti["TProcedureFlag"]});
  this.$rtti.$ExtClass("TProcedureSignature",{jsclass: "anonymous"});
  this.$rtti.$ExtClass("TTypeInfoProcVar",{ancestor: this.$rtti["TTypeInfo"], jsclass: "rtl.tTypeInfoProcVar"});
  this.$rtti.$ExtClass("TTypeInfoRefToProcVar",{ancestor: this.$rtti["TTypeInfoProcVar"], jsclass: "rtl.tTypeInfoRefToProcVar"});
  this.TMethodKind = {"0": "mkProcedure", mkProcedure: 0, "1": "mkFunction", mkFunction: 1, "2": "mkConstructor", mkConstructor: 2, "3": "mkDestructor", mkDestructor: 3, "4": "mkClassProcedure", mkClassProcedure: 4, "5": "mkClassFunction", mkClassFunction: 5};
  this.$rtti.$Enum("TMethodKind",{minvalue: 0, maxvalue: 5, ordtype: 1, enumtype: this.TMethodKind});
  this.$rtti.$Set("TMethodKinds",{comptype: this.$rtti["TMethodKind"]});
  this.$rtti.$ExtClass("TTypeInfoMethodVar",{ancestor: this.$rtti["TTypeInfoProcVar"], jsclass: "rtl.tTypeInfoMethodVar"});
  this.TTypeMemberKind = {"0": "tmkUnknown", tmkUnknown: 0, "1": "tmkField", tmkField: 1, "2": "tmkMethod", tmkMethod: 2, "3": "tmkProperty", tmkProperty: 3};
  this.$rtti.$Enum("TTypeMemberKind",{minvalue: 0, maxvalue: 3, ordtype: 1, enumtype: this.TTypeMemberKind});
  this.$rtti.$Set("TTypeMemberKinds",{comptype: this.$rtti["TTypeMemberKind"]});
  this.$rtti.$ExtClass("TTypeMember",{jsclass: "rtl.tTypeMember"});
  this.$rtti.$DynArray("TTypeMemberDynArray",{eltype: this.$rtti["TTypeMember"]});
  this.$rtti.$ExtClass("TTypeMemberField",{ancestor: this.$rtti["TTypeMember"], jsclass: "rtl.tTypeMemberField"});
  this.$rtti.$ExtClass("TTypeMemberMethod",{ancestor: this.$rtti["TTypeMember"], jsclass: "rtl.tTypeMemberMethod"});
  this.$rtti.$DynArray("TTypeMemberMethodDynArray",{eltype: this.$rtti["TTypeMemberMethod"]});
  this.pfGetFunction = 1;
  this.pfSetProcedure = 2;
  this.pfStoredFalse = 4;
  this.pfStoredField = 8;
  this.pfStoredFunction = 12;
  this.pfHasIndex = 16;
  this.$rtti.$ExtClass("TTypeMemberProperty",{ancestor: this.$rtti["TTypeMember"], jsclass: "rtl.tTypeMemberProperty"});
  this.$rtti.$DynArray("TTypeMemberPropertyDynArray",{eltype: this.$rtti["TTypeMemberProperty"]});
  this.$rtti.$ExtClass("TTypeMembers",{jsclass: "rtl.tTypeMembers"});
  this.$rtti.$ExtClass("TTypeInfoStruct",{ancestor: this.$rtti["TTypeInfo"], jsclass: "rtl.tTypeInfoStruct"});
  this.$rtti.$ExtClass("TTypeInfoRecord",{ancestor: this.$rtti["TTypeInfoStruct"], jsclass: "rtl.tTypeInfoRecord"});
  this.$rtti.$ExtClass("TTypeInfoClass",{ancestor: this.$rtti["TTypeInfoStruct"], jsclass: "rtl.tTypeInfoClass"});
  this.$rtti.$ExtClass("TTypeInfoExtClass",{ancestor: this.$rtti["TTypeInfo"], jsclass: "rtl.tTypeInfoExtClass"});
  this.$rtti.$ExtClass("TTypeInfoClassRef",{ancestor: this.$rtti["TTypeInfo"], jsclass: "rtl.tTypeInfoClassRef"});
  this.$rtti.$ExtClass("TTypeInfoPointer",{ancestor: this.$rtti["TTypeInfo"], jsclass: "rtl.tTypeInfoPointer"});
  this.$rtti.$ExtClass("TTypeInfoInterface",{ancestor: this.$rtti["TTypeInfoStruct"], jsclass: "rtl.tTypeInfoInterface"});
  this.$rtti.$ExtClass("TTypeInfoHelper",{ancestor: this.$rtti["TTypeInfoStruct"], jsclass: "rtl.tTypeInfoHelper"});
  rtl.createClass(this,"EPropertyError",pas.SysUtils.Exception,function () {
  });
  this.GetTypeName = function (TypeInfo) {
    var Result = "";
    Result = TypeInfo.name;
    return Result;
  };
  this.GetClassMembers = function (aTIStruct) {
    var Result = [];
    var C = null;
    var i = 0;
    var PropName = "";
    var Names = null;
    Result = [];
    Names = new Object();
    C = aTIStruct;
    while (C !== null) {
      for (var $l = 0, $end = rtl.length(C.names) - 1; $l <= $end; $l++) {
        i = $l;
        PropName = C.names[i];
        if (Names.hasOwnProperty(PropName)) continue;
        Result.push(C.members[PropName]);
        Names[PropName] = true;
      };
      if (!rtl.isExt(C,rtl.tTypeInfoClass)) break;
      C = C.ancestor;
    };
    return Result;
  };
  this.GetClassMember = function (aTIStruct, aName) {
    var Result = null;
    var C = null;
    var i = 0;
    C = aTIStruct;
    while (C !== null) {
      if (C.members.hasOwnProperty(aName)) return C.members[aName];
      if (!rtl.isExt(C,rtl.tTypeInfoClass)) break;
      C = C.ancestor;
    };
    C = aTIStruct;
    while (C !== null) {
      for (var $l = 0, $end = rtl.length(C.names) - 1; $l <= $end; $l++) {
        i = $l;
        if (pas.SysUtils.CompareText(C.names[i],aName) === 0) return C.members[C.names[i]];
      };
      if (!rtl.isExt(C,rtl.tTypeInfoClass)) break;
      C = C.ancestor;
    };
    Result = null;
    return Result;
  };
  this.GetInstanceMethod = function (Instance, aName) {
    var Result = null;
    var TI = null;
    if (Instance === null) return null;
    TI = $mod.GetClassMember(Instance.$rtti,aName);
    if (!rtl.isExt(TI,rtl.tTypeMemberMethod)) return null;
    Result = rtl.createCallback(Instance,TI.name);
    return Result;
  };
  this.GetClassMethods = function (aTIStruct) {
    var Result = [];
    var C = null;
    var i = 0;
    var Cnt = 0;
    var j = 0;
    Cnt = 0;
    C = aTIStruct;
    while (C !== null) {
      Cnt += C.methods.length;
      if (!rtl.isExt(C,rtl.tTypeInfoClass)) break;
      C = C.ancestor;
    };
    Result = rtl.arraySetLength(Result,null,Cnt);
    C = aTIStruct;
    i = 0;
    while (C !== null) {
      for (var $l = 0, $end = C.methods.length - 1; $l <= $end; $l++) {
        j = $l;
        Result[i] = C.members[C.methods[j]];
        i += 1;
      };
      if (!rtl.isExt(C,rtl.tTypeInfoClass)) break;
      C = C.ancestor;
    };
    return Result;
  };
  this.GetInterfaceMembers = function (aTIInterface) {
    var Result = [];
    var Intf = null;
    var i = 0;
    var Cnt = 0;
    var j = 0;
    Cnt = 0;
    Intf = aTIInterface;
    while (Intf !== null) {
      Cnt += rtl.length(Intf.names);
      Intf = Intf.ancestor;
    };
    Result = rtl.arraySetLength(Result,null,Cnt);
    Intf = aTIInterface;
    i = 0;
    while (Intf !== null) {
      for (var $l = 0, $end = rtl.length(Intf.names) - 1; $l <= $end; $l++) {
        j = $l;
        Result[i] = Intf.members[Intf.names[j]];
        i += 1;
      };
      Intf = Intf.ancestor;
    };
    return Result;
  };
  this.GetInterfaceMember = function (aTIInterface, aName) {
    var Result = null;
    var Intf = null;
    var i = 0;
    Intf = aTIInterface;
    while (Intf !== null) {
      if (Intf.members.hasOwnProperty(aName)) return Intf.members[aName];
      Intf = Intf.ancestor;
    };
    Intf = aTIInterface;
    while (Intf !== null) {
      for (var $l = 0, $end = rtl.length(Intf.names) - 1; $l <= $end; $l++) {
        i = $l;
        if (pas.SysUtils.CompareText(Intf.names[i],aName) === 0) return Intf.members[Intf.names[i]];
      };
      Intf = Intf.ancestor;
    };
    Result = null;
    return Result;
  };
  this.GetInterfaceMethods = function (aTIInterface) {
    var Result = [];
    var Intf = null;
    var i = 0;
    var Cnt = 0;
    var j = 0;
    Cnt = 0;
    Intf = aTIInterface;
    while (Intf !== null) {
      Cnt += Intf.methods.length;
      Intf = Intf.ancestor;
    };
    Result = rtl.arraySetLength(Result,null,Cnt);
    Intf = aTIInterface;
    i = 0;
    while (Intf !== null) {
      for (var $l = 0, $end = Intf.methods.length - 1; $l <= $end; $l++) {
        j = $l;
        Result[i] = Intf.members[Intf.methods[j]];
        i += 1;
      };
      Intf = Intf.ancestor;
    };
    return Result;
  };
  this.GetRTTIAttributes = function (Attributes) {
    var Result = [];
    var i = 0;
    var len = 0;
    var AttrClass = null;
    var ProcName = "";
    var Attr = null;
    Result = [];
    if (Attributes == undefined) return Result;
    i = 0;
    len = rtl.length(Attributes);
    while (i < len) {
      AttrClass = rtl.getObject(Attributes[i]);
      i += 1;
      ProcName = "" + Attributes[i];
      i += 1;
      if ((i < len) && rtl.isArray(Attributes[i])) {
        Attr = AttrClass.$create(ProcName,Attributes[i]);
        i += 1;
      } else Attr = AttrClass.$create(ProcName);
      Result = rtl.arrayInsert(Attr,Result,rtl.length(Result));
    };
    return Result;
  };
  this.GetPropInfos = function (aTIStruct) {
    var Result = [];
    var C = null;
    var i = 0;
    var Names = null;
    var PropName = "";
    Result = [];
    C = aTIStruct;
    Names = new Object();
    while (C !== null) {
      for (var $l = 0, $end = C.properties.length - 1; $l <= $end; $l++) {
        i = $l;
        PropName = C.properties[i];
        if (Names.hasOwnProperty(PropName)) continue;
        Result.push(C.members[PropName]);
        Names[PropName] = true;
      };
      if (!rtl.isExt(C,rtl.tTypeInfoClass)) break;
      C = C.ancestor;
    };
    return Result;
  };
  this.GetPropList = function (aTIStruct, TypeKinds, Sorted) {
    var Result = [];
    function NameSort(a, b) {
      var Result = 0;
      if (a.name < b.name) {
        Result = -1}
       else if (a.name > b.name) {
        Result = 1}
       else Result = 0;
      return Result;
    };
    var C = null;
    var i = 0;
    var Names = null;
    var PropName = "";
    var Prop = null;
    Result = [];
    C = aTIStruct;
    Names = new Object();
    while (C !== null) {
      for (var $l = 0, $end = C.properties.length - 1; $l <= $end; $l++) {
        i = $l;
        PropName = C.properties[i];
        if (Names.hasOwnProperty(PropName)) continue;
        Prop = C.members[PropName];
        if (!(Prop.typeinfo.kind in TypeKinds)) continue;
        Result.push(Prop);
        Names[PropName] = true;
      };
      if (!rtl.isExt(C,rtl.tTypeInfoClass)) break;
      C = C.ancestor;
    };
    if (Sorted) Result.sort(NameSort);
    return Result;
  };
  this.GetPropList$1 = function (aTIStruct) {
    var Result = [];
    Result = $mod.GetPropInfos(aTIStruct);
    return Result;
  };
  this.GetPropList$2 = function (AClass) {
    var Result = [];
    Result = $mod.GetPropInfos(AClass.$rtti);
    return Result;
  };
  this.GetPropList$3 = function (Instance) {
    var Result = [];
    Result = $mod.GetPropList$2(Instance.$class.ClassType());
    return Result;
  };
  this.GetPropInfo = function (TI, PropName) {
    var Result = null;
    var m = null;
    var i = 0;
    var C = null;
    C = TI;
    while (C !== null) {
      m = C.members[PropName];
      if (rtl.isExt(m,rtl.tTypeMemberProperty)) return m;
      if (!rtl.isExt(C,rtl.tTypeInfoClass)) break;
      C = C.ancestor;
    };
    Result = null;
    do {
      for (var $l = 0, $end = TI.properties.length - 1; $l <= $end; $l++) {
        i = $l;
        if (pas.SysUtils.CompareText(PropName,TI.properties[i]) === 0) {
          m = TI.members[TI.properties[i]];
          if (rtl.isExt(m,rtl.tTypeMemberProperty)) Result = m;
          return Result;
        };
      };
      if (!rtl.isExt(TI,rtl.tTypeInfoClass)) break;
      TI = TI.ancestor;
    } while (!(TI === null));
    return Result;
  };
  this.GetPropInfo$1 = function (TI, PropName, Kinds) {
    var Result = null;
    Result = $mod.GetPropInfo(TI,PropName);
    if (rtl.neSet(Kinds,{}) && (Result !== null) && !(Result.typeinfo.kind in Kinds)) Result = null;
    return Result;
  };
  this.GetPropInfo$2 = function (Instance, PropName) {
    var Result = null;
    Result = $mod.GetPropInfo$1(Instance.$rtti,PropName,{});
    return Result;
  };
  this.GetPropInfo$3 = function (Instance, PropName, Kinds) {
    var Result = null;
    Result = $mod.GetPropInfo$1(Instance.$rtti,PropName,Kinds);
    return Result;
  };
  this.GetPropInfo$4 = function (aClass, PropName) {
    var Result = null;
    Result = $mod.GetPropInfo$1(aClass.$rtti,PropName,{});
    return Result;
  };
  this.GetPropInfo$5 = function (aClass, PropName, Kinds) {
    var Result = null;
    Result = $mod.GetPropInfo$1(aClass.$rtti,PropName,Kinds);
    return Result;
  };
  this.FindPropInfo = function (Instance, PropName) {
    var Result = null;
    Result = $mod.GetPropInfo(Instance.$rtti,PropName);
    if (Result === null) throw $mod.EPropertyError.$create("CreateFmt",[rtl.getResStr(pas.RTLConsts,"SErrPropertyNotFound"),pas.System.VarRecs(18,PropName)]);
    return Result;
  };
  this.FindPropInfo$1 = function (Instance, PropName, Kinds) {
    var Result = null;
    Result = $mod.GetPropInfo$1(Instance.$rtti,PropName,Kinds);
    if (Result === null) throw $mod.EPropertyError.$create("CreateFmt",[rtl.getResStr(pas.RTLConsts,"SErrPropertyNotFound"),pas.System.VarRecs(18,PropName)]);
    return Result;
  };
  this.FindPropInfo$2 = function (aClass, PropName) {
    var Result = null;
    Result = $mod.GetPropInfo(aClass.$rtti,PropName);
    if (Result === null) throw $mod.EPropertyError.$create("CreateFmt",[rtl.getResStr(pas.RTLConsts,"SErrPropertyNotFound"),pas.System.VarRecs(18,PropName)]);
    return Result;
  };
  this.FindPropInfo$3 = function (aClass, PropName, Kinds) {
    var Result = null;
    Result = $mod.GetPropInfo$1(aClass.$rtti,PropName,Kinds);
    if (Result === null) throw $mod.EPropertyError.$create("CreateFmt",[rtl.getResStr(pas.RTLConsts,"SErrPropertyNotFound"),pas.System.VarRecs(18,PropName)]);
    return Result;
  };
  this.IsStoredProp = function (Instance, PropInfo) {
    var Result = false;
    var $tmp = PropInfo.flags & 12;
    if ($tmp === 0) {
      Result = true}
     else if ($tmp === 4) {
      Result = false}
     else if ($tmp === 8) {
      Result = !(Instance[PropInfo.stored] == false)}
     else {
      Result = Instance[PropInfo.stored]();
    };
    return Result;
  };
  this.IsStoredProp$1 = function (Instance, PropName) {
    var Result = false;
    Result = $mod.IsStoredProp(Instance,$mod.FindPropInfo(Instance,PropName));
    return Result;
  };
  this.IsPublishedProp = function (Instance, PropName) {
    var Result = false;
    Result = $mod.GetPropInfo$2(Instance,PropName) !== null;
    return Result;
  };
  this.IsPublishedProp$1 = function (aClass, PropName) {
    var Result = false;
    Result = $mod.GetPropInfo$4(aClass,PropName) !== null;
    return Result;
  };
  this.PropType = function (Instance, PropName) {
    var Result = 0;
    Result = $mod.FindPropInfo(Instance,PropName).typeinfo.kind;
    return Result;
  };
  this.PropType$1 = function (aClass, PropName) {
    var Result = 0;
    Result = $mod.FindPropInfo$2(aClass,PropName).typeinfo.kind;
    return Result;
  };
  this.PropIsType = function (Instance, PropName, TypeKind) {
    var Result = false;
    Result = $mod.PropType(Instance,PropName) === TypeKind;
    return Result;
  };
  this.PropIsType$1 = function (aClass, PropName, TypeKind) {
    var Result = false;
    Result = $mod.PropType$1(aClass,PropName) === TypeKind;
    return Result;
  };
  this.GetJSValueProp = function (Instance, TI, PropName) {
    var Result = undefined;
    var PropInfo = null;
    PropInfo = $mod.GetPropInfo(TI,PropName);
    if (PropInfo === null) throw $mod.EPropertyError.$create("CreateFmt",[rtl.getResStr(pas.RTLConsts,"SErrPropertyNotFound"),pas.System.VarRecs(18,PropName)]);
    Result = $mod.GetJSValueProp$1(Instance,PropInfo);
    return Result;
  };
  this.GetJSValueProp$1 = function (Instance, PropInfo) {
    var Result = undefined;
    var gk = 0;
    gk = $impl.GetPropGetterKind(PropInfo);
    var $tmp = gk;
    if ($tmp === 0) {
      throw $mod.EPropertyError.$create("CreateFmt",[rtl.getResStr(pas.RTLConsts,"SCantReadPropertyS"),pas.System.VarRecs(18,PropInfo.name)])}
     else if ($tmp === 1) {
      Result = Instance[PropInfo.getter]}
     else if ($tmp === 2) {
      if ((16 & PropInfo.flags) > 0) {
        Result = Instance[PropInfo.getter](PropInfo.index)}
       else Result = Instance[PropInfo.getter]()}
     else if ($tmp === 3) throw $mod.EPropertyError.$create("CreateFmt",[rtl.getResStr(pas.RTLConsts,"SIndexedPropertyNeedsParams"),pas.System.VarRecs(18,PropInfo.name)]);
    return Result;
  };
  this.GetJSValueProp$2 = function (Instance, PropName) {
    var Result = undefined;
    Result = $mod.GetJSValueProp$3(Instance,$mod.FindPropInfo(Instance,PropName));
    return Result;
  };
  this.GetJSValueProp$3 = function (Instance, PropInfo) {
    var Result = undefined;
    Result = $mod.GetJSValueProp$1(Instance,PropInfo);
    return Result;
  };
  this.SetJSValueProp = function (Instance, TI, PropName, Value) {
    var PropInfo = null;
    PropInfo = $mod.GetPropInfo(TI,PropName);
    if (PropInfo === null) throw $mod.EPropertyError.$create("CreateFmt",[rtl.getResStr(pas.RTLConsts,"SErrPropertyNotFound"),pas.System.VarRecs(18,PropName)]);
    $mod.SetJSValueProp$1(Instance,PropInfo,Value);
  };
  this.SetJSValueProp$1 = function (Instance, PropInfo, Value) {
    var sk = 0;
    sk = $impl.GetPropSetterKind(PropInfo);
    var $tmp = sk;
    if ($tmp === 0) {
      throw $mod.EPropertyError.$create("CreateFmt",[rtl.getResStr(pas.RTLConsts,"SCantWritePropertyS"),pas.System.VarRecs(18,PropInfo.name)])}
     else if ($tmp === 1) {
      Instance[PropInfo.setter] = Value}
     else if ($tmp === 2) {
      if ((16 & PropInfo.flags) > 0) {
        Instance[PropInfo.setter](PropInfo.index,Value)}
       else Instance[PropInfo.setter](Value)}
     else if ($tmp === 3) throw $mod.EPropertyError.$create("CreateFmt",[rtl.getResStr(pas.RTLConsts,"SIndexedPropertyNeedsParams"),pas.System.VarRecs(18,PropInfo.name)]);
  };
  this.SetJSValueProp$2 = function (Instance, PropName, Value) {
    $mod.SetJSValueProp$3(Instance,$mod.FindPropInfo(Instance,PropName),Value);
  };
  this.SetJSValueProp$3 = function (Instance, PropInfo, Value) {
    $mod.SetJSValueProp$1(Instance,PropInfo,Value);
  };
  this.GetNativeIntProp = function (Instance, PropName) {
    var Result = 0;
    Result = $mod.GetNativeIntProp$1(Instance,$mod.FindPropInfo(Instance,PropName));
    return Result;
  };
  this.GetNativeIntProp$1 = function (Instance, PropInfo) {
    var Result = 0;
    Result = rtl.trunc($mod.GetJSValueProp$3(Instance,PropInfo));
    return Result;
  };
  this.SetNativeIntProp = function (Instance, PropName, Value) {
    $mod.SetJSValueProp$3(Instance,$mod.FindPropInfo(Instance,PropName),Value);
  };
  this.SetNativeIntProp$1 = function (Instance, PropInfo, Value) {
    $mod.SetJSValueProp$3(Instance,PropInfo,Value);
  };
  this.GetOrdProp = function (Instance, PropName) {
    var Result = 0;
    Result = $mod.GetOrdProp$1(Instance,$mod.FindPropInfo(Instance,PropName));
    return Result;
  };
  this.GetOrdProp$1 = function (Instance, PropInfo) {
    var Result = 0;
    var o = null;
    var Key = "";
    var n = 0;
    var v = undefined;
    if (PropInfo.typeinfo.kind === 5) {
      o = $mod.GetJSValueProp$3(Instance,PropInfo);
      Result = 0;
      for (Key in o) {
        n = parseInt(Key,10);
        if (n < 32) Result = Result + (1 << n);
      };
    } else if (PropInfo.typeinfo.kind === 2) {
      v = $mod.GetJSValueProp$3(Instance,PropInfo);
      if (rtl.isNumber(v)) {
        Result = rtl.trunc(v)}
       else {
        Key = "" + v;
        if (Key === "") {
          Result = 0}
         else Result = Key.charCodeAt(0);
      };
    } else Result = rtl.trunc($mod.GetJSValueProp$3(Instance,PropInfo));
    return Result;
  };
  this.SetOrdProp = function (Instance, PropName, Value) {
    $mod.SetOrdProp$1(Instance,$mod.FindPropInfo(Instance,PropName),Value);
  };
  this.SetOrdProp$1 = function (Instance, PropInfo, Value) {
    var o = null;
    var i = 0;
    if (PropInfo.typeinfo.kind === 5) {
      o = new Object();
      for (i = 0; i <= 31; i++) if (((1 << i) & Value) > 0) o["" + i] = true;
      $mod.SetJSValueProp$3(Instance,PropInfo,o);
    } else if (PropInfo.typeinfo.kind === 2) {
      $mod.SetJSValueProp$3(Instance,PropInfo,String.fromCharCode(Value))}
     else $mod.SetJSValueProp$3(Instance,PropInfo,Value);
  };
  this.GetEnumProp = function (Instance, PropName) {
    var Result = "";
    Result = $mod.GetEnumProp$1(Instance,$mod.FindPropInfo(Instance,PropName));
    return Result;
  };
  this.GetEnumProp$1 = function (Instance, PropInfo) {
    var Result = "";
    var n = 0;
    var TIEnum = null;
    TIEnum = rtl.asExt(PropInfo.typeinfo,rtl.tTypeInfoEnum);
    n = rtl.trunc($mod.GetJSValueProp$3(Instance,PropInfo));
    if ((n >= TIEnum.minvalue) && (n <= TIEnum.maxvalue)) {
      Result = TIEnum.enumtype[n]}
     else Result = "" + n;
    return Result;
  };
  this.SetEnumProp = function (Instance, PropName, Value) {
    $mod.SetEnumProp$1(Instance,$mod.FindPropInfo(Instance,PropName),Value);
  };
  this.SetEnumProp$1 = function (Instance, PropInfo, Value) {
    var TIEnum = null;
    var n = 0;
    TIEnum = rtl.asExt(PropInfo.typeinfo,rtl.tTypeInfoEnum);
    n = TIEnum.enumtype[Value];
    if (!pas.JS.isUndefined(n)) $mod.SetJSValueProp$3(Instance,PropInfo,n);
  };
  this.GetEnumName = function (TypeInfo, Value) {
    var Result = "";
    Result = TypeInfo.enumtype[Value];
    return Result;
  };
  this.GetEnumValue = function (TypeInfo, Name) {
    var Result = 0;
    Result = TypeInfo.enumtype[Name];
    return Result;
  };
  this.GetEnumNameCount = function (TypeInfo) {
    var Result = 0;
    var o = null;
    var l = 0;
    var r = 0;
    o = TypeInfo.enumtype;
    Result = 1;
    while (o.hasOwnProperty("" + Result)) Result = Result * 2;
    l = rtl.trunc(Result / 2);
    r = Result;
    while (l <= r) {
      Result = rtl.trunc((l + r) / 2);
      if (o.hasOwnProperty("" + Result)) {
        l = Result + 1}
       else r = Result - 1;
    };
    if (o.hasOwnProperty("" + Result)) Result += 1;
    return Result;
  };
  this.GetSetProp = function (Instance, PropName) {
    var Result = "";
    Result = $mod.GetSetProp$1(Instance,$mod.FindPropInfo(Instance,PropName));
    return Result;
  };
  this.GetSetProp$1 = function (Instance, PropInfo) {
    var Result = "";
    var o = null;
    var key = "";
    var Value = "";
    var n = 0;
    var TIEnum = null;
    var TISet = null;
    Result = "";
    TISet = rtl.asExt(PropInfo.typeinfo,rtl.tTypeInfoSet);
    TIEnum = null;
    if (rtl.isExt(TISet.comptype,rtl.tTypeInfoEnum)) TIEnum = TISet.comptype;
    o = $mod.GetJSValueProp$3(Instance,PropInfo);
    for (key in o) {
      n = parseInt(key,10);
      if ((TIEnum !== null) && (n >= TIEnum.minvalue) && (n <= TIEnum.maxvalue)) {
        Value = TIEnum.enumtype[n]}
       else Value = "" + n;
      if (Result !== "") Result = Result + ",";
      Result = Result + Value;
    };
    Result = "[" + Result + "]";
    return Result;
  };
  this.GetSetPropArray = function (Instance, PropName) {
    var Result = [];
    Result = $mod.GetSetPropArray$1(Instance,$mod.FindPropInfo(Instance,PropName));
    return Result;
  };
  this.GetSetPropArray$1 = function (Instance, PropInfo) {
    var Result = [];
    var o = null;
    var Key = "";
    Result = [];
    o = $mod.GetJSValueProp$3(Instance,PropInfo);
    for (Key in o) Result.push(parseInt(Key,10));
    return Result;
  };
  this.SetSetPropArray = function (Instance, PropName, Arr) {
    $mod.SetSetPropArray$1(Instance,$mod.FindPropInfo(Instance,PropName),Arr);
  };
  this.SetSetPropArray$1 = function (Instance, PropInfo, Arr) {
    var o = null;
    var i = 0;
    o = new Object();
    for (var $in = Arr, $l = 0, $end = rtl.length($in) - 1; $l <= $end; $l++) {
      i = $in[$l];
      o["" + i] = true;
    };
    $mod.SetJSValueProp$3(Instance,PropInfo,o);
  };
  this.GetBoolProp = function (Instance, PropName) {
    var Result = false;
    Result = $mod.GetBoolProp$1(Instance,$mod.FindPropInfo(Instance,PropName));
    return Result;
  };
  this.GetBoolProp$1 = function (Instance, PropInfo) {
    var Result = false;
    Result = !($mod.GetJSValueProp$3(Instance,PropInfo) == false);
    return Result;
  };
  this.SetBoolProp = function (Instance, PropName, Value) {
    $mod.SetBoolProp$1(Instance,$mod.FindPropInfo(Instance,PropName),Value);
  };
  this.SetBoolProp$1 = function (Instance, PropInfo, Value) {
    $mod.SetJSValueProp$3(Instance,PropInfo,Value);
  };
  this.GetStrProp = function (Instance, PropName) {
    var Result = "";
    Result = $mod.GetStrProp$1(Instance,$mod.FindPropInfo(Instance,PropName));
    return Result;
  };
  this.GetStrProp$1 = function (Instance, PropInfo) {
    var Result = "";
    Result = "" + $mod.GetJSValueProp$3(Instance,PropInfo);
    return Result;
  };
  this.SetStrProp = function (Instance, PropName, Value) {
    $mod.SetStrProp$1(Instance,$mod.FindPropInfo(Instance,PropName),Value);
  };
  this.SetStrProp$1 = function (Instance, PropInfo, Value) {
    $mod.SetJSValueProp$3(Instance,PropInfo,Value);
  };
  this.GetStringProp = function (Instance, PropName) {
    var Result = "";
    Result = $mod.GetStrProp(Instance,PropName);
    return Result;
  };
  this.GetStringProp$1 = function (Instance, PropInfo) {
    var Result = "";
    Result = $mod.GetStrProp$1(Instance,PropInfo);
    return Result;
  };
  this.SetStringProp = function (Instance, PropName, Value) {
    $mod.SetStrProp(Instance,PropName,Value);
  };
  this.SetStringProp$1 = function (Instance, PropInfo, Value) {
    $mod.SetStrProp$1(Instance,PropInfo,Value);
  };
  this.GetFloatProp = function (Instance, PropName) {
    var Result = 0.0;
    Result = $mod.GetFloatProp$1(Instance,$mod.FindPropInfo(Instance,PropName));
    return Result;
  };
  this.GetFloatProp$1 = function (Instance, PropInfo) {
    var Result = 0.0;
    Result = rtl.getNumber($mod.GetJSValueProp$3(Instance,PropInfo));
    return Result;
  };
  this.SetFloatProp = function (Instance, PropName, Value) {
    $mod.SetFloatProp$1(Instance,$mod.FindPropInfo(Instance,PropName),Value);
  };
  this.SetFloatProp$1 = function (Instance, PropInfo, Value) {
    $mod.SetJSValueProp$3(Instance,PropInfo,Value);
  };
  this.GetObjectProp = function (Instance, PropName) {
    var Result = null;
    Result = $mod.GetObjectProp$2(Instance,$mod.FindPropInfo(Instance,PropName));
    return Result;
  };
  this.GetObjectProp$1 = function (Instance, PropName, MinClass) {
    var Result = null;
    Result = $mod.GetObjectProp$2(Instance,$mod.FindPropInfo(Instance,PropName));
    if ((MinClass !== null) && (Result !== null)) if (!Result.$class.InheritsFrom(MinClass)) Result = null;
    return Result;
  };
  this.GetObjectProp$2 = function (Instance, PropInfo) {
    var Result = null;
    Result = $mod.GetObjectProp$3(Instance,PropInfo,null);
    return Result;
  };
  this.GetObjectProp$3 = function (Instance, PropInfo, MinClass) {
    var Result = null;
    var O = null;
    O = rtl.getObject($mod.GetJSValueProp$3(Instance,PropInfo));
    if ((MinClass !== null) && !O.$class.InheritsFrom(MinClass)) {
      Result = null}
     else Result = O;
    return Result;
  };
  this.SetObjectProp = function (Instance, PropName, Value) {
    $mod.SetObjectProp$1(Instance,$mod.FindPropInfo(Instance,PropName),Value);
  };
  this.SetObjectProp$1 = function (Instance, PropInfo, Value) {
    $mod.SetJSValueProp$3(Instance,PropInfo,Value);
  };
  this.GetMethodProp = function (Instance, PropInfo) {
    var Result = pas.System.TMethod.$new();
    var v = undefined;
    var fn = undefined;
    Result.Code = null;
    Result.Data = null;
    v = $mod.GetJSValueProp$3(Instance,PropInfo);
    if (!rtl.isFunction(v)) return Result;
    Result.Data = v["scope"];
    fn = v["fn"];
    if (rtl.isString(fn)) {
      if (Result.Data !== null) {
        Result.Code = Result.Data["" + fn]}
       else Result.Code = v;
    } else Result.Code = fn;
    return Result;
  };
  this.GetMethodProp$1 = function (Instance, PropName) {
    var Result = pas.System.TMethod.$new();
    Result.$assign($mod.GetMethodProp(Instance,$mod.FindPropInfo(Instance,PropName)));
    return Result;
  };
  this.SetMethodProp = function (Instance, PropInfo, Value) {
    var cb = null;
    var Code = null;
    Code = Value.Code;
    if (Code === null) {
      cb = null}
     else if (rtl.isFunction(Code)) {
      if ((Code["scope"] === Value.Data) && (rtl.isFunction(Code["fn"]) || rtl.isString(Code["fn"]))) {
        cb = Code;
      } else if (rtl.isString(Code["fn"])) {
        cb = rtl.createCallback(Value.Data,"" + Code["fn"])}
       else cb = rtl.createCallback(Value.Data,Code);
    } else cb = rtl.createCallback(Value.Data,Code);
    $mod.SetJSValueProp$3(Instance,PropInfo,cb);
  };
  this.SetMethodProp$1 = function (Instance, PropName, Value) {
    $mod.SetMethodProp(Instance,$mod.FindPropInfo(Instance,PropName),Value);
  };
  this.GetInterfaceProp = function (Instance, PropName) {
    var Result = null;
    var $ok = false;
    try {
      Result = rtl.setIntfL(Result,$mod.GetInterfaceProp$1(Instance,$mod.FindPropInfo(Instance,PropName)),true);
      $ok = true;
    } finally {
      if (!$ok) rtl._Release(Result);
    };
    return Result;
  };
  this.GetInterfaceProp$1 = function (Instance, PropInfo) {
    var Result = null;
    var gk = 0;
    var $ok = false;
    try {
      if (PropInfo.typeinfo.kind !== 18) throw pas.SysUtils.Exception.$create("Create$1",["Cannot get RAW interface from IInterface interface"]);
      gk = $impl.GetPropGetterKind(PropInfo);
      var $tmp = gk;
      if ($tmp === 0) {
        throw $mod.EPropertyError.$create("CreateFmt",[rtl.getResStr(pas.RTLConsts,"SCantReadPropertyS"),pas.System.VarRecs(18,PropInfo.name)])}
       else if ($tmp === 1) {
        Result = rtl.setIntfL(Result,rtl.getObject(Instance[PropInfo.getter]))}
       else if ($tmp === 2) {
        if ((16 & PropInfo.flags) > 0) {
          Result = rtl.setIntfL(Result,Instance[PropInfo.getter](PropInfo.index),true)}
         else Result = rtl.setIntfL(Result,Instance[PropInfo.getter](),true)}
       else if ($tmp === 3) throw $mod.EPropertyError.$create("CreateFmt",[rtl.getResStr(pas.RTLConsts,"SIndexedPropertyNeedsParams"),pas.System.VarRecs(18,PropInfo.name)]);
      $ok = true;
    } finally {
      if (!$ok) rtl._Release(Result);
    };
    return Result;
  };
  this.SetInterfaceProp = function (Instance, PropName, Value) {
    $mod.SetInterfaceProp$1(Instance,$mod.FindPropInfo(Instance,PropName),Value);
  };
  this.SetInterfaceProp$1 = function (Instance, PropInfo, Value) {
    var sk = 0;
    var Setter = "";
    if (PropInfo.typeinfo.kind !== 18) throw pas.SysUtils.Exception.$create("Create$1",["Cannot set RAW interface from IInterface interface"]);
    sk = $impl.GetPropSetterKind(PropInfo);
    Setter = PropInfo.setter;
    var $tmp = sk;
    if ($tmp === 0) {
      throw $mod.EPropertyError.$create("CreateFmt",[rtl.getResStr(pas.RTLConsts,"SCantWritePropertyS"),pas.System.VarRecs(18,PropInfo.name)])}
     else if ($tmp === 1) {
      rtl.setIntfP(Instance,Setter,Value)}
     else if ($tmp === 2) {
      if ((16 & PropInfo.flags) > 0) {
        Instance[Setter](PropInfo.index,Value)}
       else Instance[Setter](Value)}
     else if ($tmp === 3) throw $mod.EPropertyError.$create("CreateFmt",[rtl.getResStr(pas.RTLConsts,"SIndexedPropertyNeedsParams"),pas.System.VarRecs(18,PropInfo.name)]);
  };
  this.GetRawInterfaceProp = function (Instance, PropName) {
    var Result = null;
    Result = $mod.GetRawInterfaceProp$1(Instance,$mod.FindPropInfo(Instance,PropName));
    return Result;
  };
  this.GetRawInterfaceProp$1 = function (Instance, PropInfo) {
    var Result = null;
    Result = $mod.GetJSValueProp$3(Instance,PropInfo);
    return Result;
  };
  this.SetRawInterfaceProp = function (Instance, PropName, Value) {
    $mod.SetRawInterfaceProp$1(Instance,$mod.FindPropInfo(Instance,PropName),Value);
  };
  this.SetRawInterfaceProp$1 = function (Instance, PropInfo, Value) {
    $mod.SetJSValueProp$3(Instance,PropInfo,Value);
  };
  $mod.$implcode = function () {
    $mod.$rtti.$ExtClass("TCreatorAttribute",{jsclass: "attr"});
    $mod.$rtti.$ClassRef("TCreatorAttributeClass",{instancetype: $mod.$rtti["TCreatorAttribute"]});
    $impl.TGetterKind = {"0": "gkNone", gkNone: 0, "1": "gkField", gkField: 1, "2": "gkFunction", gkFunction: 2, "3": "gkFunctionWithParams", gkFunctionWithParams: 3};
    $mod.$rtti.$Enum("TGetterKind",{minvalue: 0, maxvalue: 3, ordtype: 1, enumtype: $impl.TGetterKind});
    $impl.GetPropGetterKind = function (PropInfo) {
      var Result = 0;
      if (PropInfo.getter === "") {
        Result = 0}
       else if ((1 & PropInfo.flags) > 0) {
        if (rtl.length(PropInfo.params) > 0) {
          Result = 3}
         else Result = 2;
      } else Result = 1;
      return Result;
    };
    $impl.TSetterKind = {"0": "skNone", skNone: 0, "1": "skField", skField: 1, "2": "skProcedure", skProcedure: 2, "3": "skProcedureWithParams", skProcedureWithParams: 3};
    $mod.$rtti.$Enum("TSetterKind",{minvalue: 0, maxvalue: 3, ordtype: 1, enumtype: $impl.TSetterKind});
    $impl.GetPropSetterKind = function (PropInfo) {
      var Result = 0;
      if (PropInfo.setter === "") {
        Result = 0}
       else if ((2 & PropInfo.flags) > 0) {
        if (rtl.length(PropInfo.params) > 0) {
          Result = 3}
         else Result = 2;
      } else Result = 1;
      return Result;
    };
  };
},[]);
rtl.module("simplelinkedlist",["System"],function () {
  "use strict";
  var $mod = this;
  rtl.createClass(this,"TLinkedListItem",pas.System.TObject,function () {
    this.$init = function () {
      pas.System.TObject.$init.call(this);
      this.Next = null;
    };
    this.$final = function () {
      this.Next = undefined;
      pas.System.TObject.$final.call(this);
    };
  });
  this.$rtti.$ClassRef("TLinkedListItemClass",{instancetype: this.$rtti["TLinkedListItem"]});
  rtl.createClass(this,"TLinkedListVisitor",pas.System.TObject,function () {
  });
  rtl.createClass(this,"TLinkedList",pas.System.TObject,function () {
    this.$init = function () {
      pas.System.TObject.$init.call(this);
      this.FItemClass = null;
      this.FRoot = null;
    };
    this.$final = function () {
      this.FItemClass = undefined;
      this.FRoot = undefined;
      pas.System.TObject.$final.call(this);
    };
    this.GetCount = function () {
      var Result = 0;
      var I = null;
      I = this.FRoot;
      Result = 0;
      while (I !== null) {
        I = I.Next;
        Result += 1;
      };
      return Result;
    };
    this.Create$1 = function (AnItemClass) {
      this.FItemClass = AnItemClass;
      return this;
    };
    this.Destroy = function () {
      this.Clear();
      pas.System.TObject.Destroy.call(this);
    };
    this.Clear = function () {
      var I = null;
      I = this.FRoot;
      while (I !== null) {
        this.FRoot = I;
        I = I.Next;
        this.FRoot.Next = null;
        pas.SysUtils.FreeAndNil({p: this, get: function () {
            return this.p.FRoot;
          }, set: function (v) {
            this.p.FRoot = v;
          }});
      };
    };
    this.Add = function () {
      var Result = null;
      Result = this.FItemClass.$create("Create");
      Result.Next = this.FRoot;
      this.FRoot = Result;
      return Result;
    };
    this.ForEach = function (Visitor) {
      var I = null;
      I = this.FRoot;
      while ((I !== null) && Visitor.Visit(I)) I = I.Next;
    };
    this.RemoveItem = function (Item, FreeItem) {
      var I = null;
      if ((Item !== null) && (this.FRoot !== null)) {
        if (Item === this.FRoot) {
          this.FRoot = Item.Next}
         else {
          I = this.FRoot;
          while ((I.Next !== null) && (I.Next !== Item)) I = I.Next;
          if (I.Next === Item) I.Next = Item.Next;
        };
        if (FreeItem) Item = rtl.freeLoc(Item);
      };
    };
  });
},["SysUtils"]);
rtl.module("Classes",["System","RTLConsts","Types","SysUtils","JS","TypInfo"],function () {
  "use strict";
  var $mod = this;
  var $impl = $mod.$impl;
  this.$rtti.$MethodVar("TNotifyEvent",{procsig: rtl.newTIProcSig([["Sender",pas.System.$rtti["TObject"]]]), methodkind: 0});
  this.$rtti.$RefToProcVar("TNotifyEventRef",{procsig: rtl.newTIProcSig([["Sender",pas.System.$rtti["TObject"]]])});
  this.$rtti.$RefToProcVar("TStringNotifyEventRef",{procsig: rtl.newTIProcSig([["Sender",pas.System.$rtti["TObject"]],["aString",rtl.string,2]])});
  this.TFPObservedOperation = {"0": "ooChange", ooChange: 0, "1": "ooFree", ooFree: 1, "2": "ooAddItem", ooAddItem: 2, "3": "ooDeleteItem", ooDeleteItem: 3, "4": "ooCustom", ooCustom: 4};
  this.$rtti.$Enum("TFPObservedOperation",{minvalue: 0, maxvalue: 4, ordtype: 1, enumtype: this.TFPObservedOperation});
  rtl.createClass(this,"EStreamError",pas.SysUtils.Exception,function () {
  });
  rtl.createClass(this,"EFCreateError",this.EStreamError,function () {
  });
  rtl.createClass(this,"EFOpenError",this.EStreamError,function () {
  });
  rtl.createClass(this,"EFilerError",this.EStreamError,function () {
  });
  rtl.createClass(this,"EReadError",this.EFilerError,function () {
  });
  rtl.createClass(this,"EWriteError",this.EFilerError,function () {
  });
  rtl.createClass(this,"EClassNotFound",this.EFilerError,function () {
  });
  rtl.createClass(this,"EMethodNotFound",this.EFilerError,function () {
  });
  rtl.createClass(this,"EInvalidImage",this.EFilerError,function () {
  });
  rtl.createClass(this,"EResNotFound",pas.SysUtils.Exception,function () {
  });
  rtl.createClass(this,"EListError",pas.SysUtils.Exception,function () {
  });
  rtl.createClass(this,"EBitsError",pas.SysUtils.Exception,function () {
  });
  rtl.createClass(this,"EStringListError",this.EListError,function () {
  });
  rtl.createClass(this,"EComponentError",pas.SysUtils.Exception,function () {
  });
  rtl.createClass(this,"EParserError",pas.SysUtils.Exception,function () {
  });
  rtl.createClass(this,"EOutOfResources",pas.SysUtils.EOutOfMemory,function () {
  });
  rtl.createClass(this,"EInvalidOperation",pas.SysUtils.Exception,function () {
  });
  this.TListAssignOp = {"0": "laCopy", laCopy: 0, "1": "laAnd", laAnd: 1, "2": "laOr", laOr: 2, "3": "laXor", laXor: 3, "4": "laSrcUnique", laSrcUnique: 4, "5": "laDestUnique", laDestUnique: 5};
  this.$rtti.$Enum("TListAssignOp",{minvalue: 0, maxvalue: 5, ordtype: 1, enumtype: this.TListAssignOp});
  this.$rtti.$ProcVar("TListSortCompare",{procsig: rtl.newTIProcSig([["Item1",rtl.jsvalue],["Item2",rtl.jsvalue]],rtl.longint)});
  this.$rtti.$RefToProcVar("TListSortCompareFunc",{procsig: rtl.newTIProcSig([["Item1",rtl.jsvalue],["Item2",rtl.jsvalue]],rtl.longint)});
  this.TAlignment = {"0": "taLeftJustify", taLeftJustify: 0, "1": "taRightJustify", taRightJustify: 1, "2": "taCenter", taCenter: 2};
  this.$rtti.$Enum("TAlignment",{minvalue: 0, maxvalue: 2, ordtype: 1, enumtype: this.TAlignment});
  this.$rtti.$Class("TFPList");
  this.$rtti.$Class("TReader");
  this.$rtti.$Class("TWriter");
  this.$rtti.$Class("TFiler");
  rtl.createClass(this,"TFPListEnumerator",pas.System.TObject,function () {
    this.$init = function () {
      pas.System.TObject.$init.call(this);
      this.FList = null;
      this.FPosition = 0;
    };
    this.$final = function () {
      this.FList = undefined;
      pas.System.TObject.$final.call(this);
    };
    this.Create$1 = function (AList) {
      pas.System.TObject.Create.call(this);
      this.FList = AList;
      this.FPosition = -1;
      return this;
    };
    this.GetCurrent = function () {
      var Result = undefined;
      Result = this.FList.Get(this.FPosition);
      return Result;
    };
    this.MoveNext = function () {
      var Result = false;
      this.FPosition += 1;
      Result = this.FPosition < this.FList.FCount;
      return Result;
    };
  });
  rtl.createClass(this,"TFPList",pas.System.TObject,function () {
    this.$init = function () {
      pas.System.TObject.$init.call(this);
      this.FList = [];
      this.FCount = 0;
      this.FCapacity = 0;
    };
    this.$final = function () {
      this.FList = undefined;
      pas.System.TObject.$final.call(this);
    };
    this.CopyMove = function (aList) {
      var r = 0;
      this.Clear();
      for (var $l = 0, $end = aList.FCount - 1; $l <= $end; $l++) {
        r = $l;
        this.Add(aList.Get(r));
      };
    };
    this.MergeMove = function (aList) {
      var r = 0;
      for (var $l = 0, $end = aList.FCount - 1; $l <= $end; $l++) {
        r = $l;
        if (this.IndexOf(aList.Get(r)) < 0) this.Add(aList.Get(r));
      };
    };
    this.DoCopy = function (ListA, ListB) {
      if (ListB != null) {
        this.CopyMove(ListB)}
       else this.CopyMove(ListA);
    };
    this.DoSrcUnique = function (ListA, ListB) {
      var r = 0;
      if (ListB != null) {
        this.Clear();
        for (var $l = 0, $end = ListA.FCount - 1; $l <= $end; $l++) {
          r = $l;
          if (ListB.IndexOf(ListA.Get(r)) < 0) this.Add(ListA.Get(r));
        };
      } else {
        for (var $l1 = this.FCount - 1; $l1 >= 0; $l1--) {
          r = $l1;
          if (ListA.IndexOf(this.Get(r)) >= 0) this.Delete(r);
        };
      };
    };
    this.DoAnd = function (ListA, ListB) {
      var r = 0;
      if (ListB != null) {
        this.Clear();
        for (var $l = 0, $end = ListA.FCount - 1; $l <= $end; $l++) {
          r = $l;
          if (ListB.IndexOf(ListA.Get(r)) >= 0) this.Add(ListA.Get(r));
        };
      } else {
        for (var $l1 = this.FCount - 1; $l1 >= 0; $l1--) {
          r = $l1;
          if (ListA.IndexOf(this.Get(r)) < 0) this.Delete(r);
        };
      };
    };
    this.DoDestUnique = function (ListA, ListB) {
      var $Self = this;
      function MoveElements(Src, Dest) {
        var r = 0;
        $Self.Clear();
        for (var $l = 0, $end = Src.FCount - 1; $l <= $end; $l++) {
          r = $l;
          if (Dest.IndexOf(Src.Get(r)) < 0) $Self.Add(Src.Get(r));
        };
      };
      var Dest = null;
      if (ListB != null) {
        MoveElements(ListB,ListA)}
       else Dest = $mod.TFPList.$create("Create");
      try {
        Dest.CopyMove($Self);
        MoveElements(ListA,Dest);
      } finally {
        Dest.$destroy("Destroy");
      };
    };
    this.DoOr = function (ListA, ListB) {
      if (ListB != null) {
        this.CopyMove(ListA);
        this.MergeMove(ListB);
      } else this.MergeMove(ListA);
    };
    this.DoXOr = function (ListA, ListB) {
      var r = 0;
      var l = null;
      if (ListB != null) {
        this.Clear();
        for (var $l = 0, $end = ListA.FCount - 1; $l <= $end; $l++) {
          r = $l;
          if (ListB.IndexOf(ListA.Get(r)) < 0) this.Add(ListA.Get(r));
        };
        for (var $l1 = 0, $end1 = ListB.FCount - 1; $l1 <= $end1; $l1++) {
          r = $l1;
          if (ListA.IndexOf(ListB.Get(r)) < 0) this.Add(ListB.Get(r));
        };
      } else {
        l = $mod.TFPList.$create("Create");
        try {
          l.CopyMove(this);
          for (var $l2 = this.FCount - 1; $l2 >= 0; $l2--) {
            r = $l2;
            if (ListA.IndexOf(this.Get(r)) >= 0) this.Delete(r);
          };
          for (var $l3 = 0, $end2 = ListA.FCount - 1; $l3 <= $end2; $l3++) {
            r = $l3;
            if (l.IndexOf(ListA.Get(r)) < 0) this.Add(ListA.Get(r));
          };
        } finally {
          l.$destroy("Destroy");
        };
      };
    };
    this.Get = function (Index) {
      var Result = undefined;
      if ((Index < 0) || (Index >= this.FCount)) this.RaiseIndexError(Index);
      Result = this.FList[Index];
      return Result;
    };
    this.Put = function (Index, Item) {
      if ((Index < 0) || (Index >= this.FCount)) this.RaiseIndexError(Index);
      this.FList[Index] = Item;
    };
    this.SetCapacity = function (NewCapacity) {
      if (NewCapacity < this.FCount) this.$class.Error(rtl.getResStr(pas.RTLConsts,"SListCapacityError"),"" + NewCapacity);
      if (NewCapacity === this.FCapacity) return;
      this.FList = rtl.arraySetLength(this.FList,undefined,NewCapacity);
      this.FCapacity = NewCapacity;
    };
    this.SetCount = function (NewCount) {
      if (NewCount < 0) this.$class.Error(rtl.getResStr(pas.RTLConsts,"SListCountError"),"" + NewCount);
      if (NewCount > this.FCount) {
        if (NewCount > this.FCapacity) this.SetCapacity(NewCount);
      };
      this.FCount = NewCount;
    };
    this.RaiseIndexError = function (Index) {
      this.$class.Error(rtl.getResStr(pas.RTLConsts,"SListIndexError"),"" + Index);
    };
    this.Destroy = function () {
      this.Clear();
      pas.System.TObject.Destroy.call(this);
    };
    this.AddList = function (AList) {
      var I = 0;
      if (this.FCapacity < (this.FCount + AList.FCount)) this.SetCapacity(this.FCount + AList.FCount);
      for (var $l = 0, $end = AList.FCount - 1; $l <= $end; $l++) {
        I = $l;
        this.Add(AList.Get(I));
      };
    };
    this.Add = function (Item) {
      var Result = 0;
      if (this.FCount === this.FCapacity) this.Expand();
      this.FList[this.FCount] = Item;
      Result = this.FCount;
      this.FCount += 1;
      return Result;
    };
    this.Clear = function () {
      if (rtl.length(this.FList) > 0) {
        this.SetCount(0);
        this.SetCapacity(0);
      };
    };
    this.Delete = function (Index) {
      if ((Index < 0) || (Index >= this.FCount)) this.$class.Error(rtl.getResStr(pas.RTLConsts,"SListIndexError"),"" + Index);
      this.FCount = this.FCount - 1;
      this.FList.splice(Index,1);
      this.FCapacity -= 1;
    };
    this.Error = function (Msg, Data) {
      throw $mod.EListError.$create("CreateFmt",[Msg,pas.System.VarRecs(18,Data)]);
    };
    this.Exchange = function (Index1, Index2) {
      var Temp = undefined;
      if ((Index1 >= this.FCount) || (Index1 < 0)) this.$class.Error(rtl.getResStr(pas.RTLConsts,"SListIndexError"),"" + Index1);
      if ((Index2 >= this.FCount) || (Index2 < 0)) this.$class.Error(rtl.getResStr(pas.RTLConsts,"SListIndexError"),"" + Index2);
      Temp = this.FList[Index1];
      this.FList[Index1] = this.FList[Index2];
      this.FList[Index2] = Temp;
    };
    this.Expand = function () {
      var Result = null;
      var IncSize = 0;
      if (this.FCount < this.FCapacity) return this;
      IncSize = 4;
      if (this.FCapacity > 3) IncSize = IncSize + 4;
      if (this.FCapacity > 8) IncSize = IncSize + 8;
      if (this.FCapacity > 127) IncSize += this.FCapacity >>> 2;
      this.SetCapacity(this.FCapacity + IncSize);
      Result = this;
      return Result;
    };
    this.Extract = function (Item) {
      var Result = undefined;
      var i = 0;
      i = this.IndexOf(Item);
      if (i >= 0) {
        Result = Item;
        this.Delete(i);
      } else Result = null;
      return Result;
    };
    this.First = function () {
      var Result = undefined;
      if (this.FCount === 0) {
        Result = null}
       else Result = this.Get(0);
      return Result;
    };
    this.GetEnumerator = function () {
      var Result = null;
      Result = $mod.TFPListEnumerator.$create("Create$1",[this]);
      return Result;
    };
    this.IndexOf = function (Item) {
      var Result = 0;
      var C = 0;
      Result = 0;
      C = this.FCount;
      while ((Result < C) && (this.FList[Result] != Item)) Result += 1;
      if (Result >= C) Result = -1;
      return Result;
    };
    this.IndexOfItem = function (Item, Direction) {
      var Result = 0;
      if (Direction === 0) {
        Result = this.IndexOf(Item)}
       else {
        Result = this.FCount - 1;
        while ((Result >= 0) && (this.FList[Result] != Item)) Result = Result - 1;
      };
      return Result;
    };
    this.Insert = function (Index, Item) {
      if ((Index < 0) || (Index > this.FCount)) this.$class.Error(rtl.getResStr(pas.RTLConsts,"SListIndexError"),"" + Index);
      this.FList.splice(Index,0,Item);
      this.FCapacity += 1;
      this.FCount += 1;
    };
    this.Last = function () {
      var Result = undefined;
      if (this.FCount === 0) {
        Result = null}
       else Result = this.Get(this.FCount - 1);
      return Result;
    };
    this.Move = function (CurIndex, NewIndex) {
      var Temp = undefined;
      if ((CurIndex < 0) || (CurIndex > (this.FCount - 1))) this.$class.Error(rtl.getResStr(pas.RTLConsts,"SListIndexError"),"" + CurIndex);
      if ((NewIndex < 0) || (NewIndex > (this.FCount - 1))) this.$class.Error(rtl.getResStr(pas.RTLConsts,"SListIndexError"),"" + NewIndex);
      if (CurIndex === NewIndex) return;
      Temp = this.FList[CurIndex];
      this.FList.splice(CurIndex,1);
      this.FList.splice(NewIndex,0,Temp);
    };
    this.Assign = function (ListA, AOperator, ListB) {
      var $tmp = AOperator;
      if ($tmp === 0) {
        this.DoCopy(ListA,ListB)}
       else if ($tmp === 4) {
        this.DoSrcUnique(ListA,ListB)}
       else if ($tmp === 1) {
        this.DoAnd(ListA,ListB)}
       else if ($tmp === 5) {
        this.DoDestUnique(ListA,ListB)}
       else if ($tmp === 2) {
        this.DoOr(ListA,ListB)}
       else if ($tmp === 3) this.DoXOr(ListA,ListB);
    };
    this.Remove = function (Item) {
      var Result = 0;
      Result = this.IndexOf(Item);
      if (Result !== -1) this.Delete(Result);
      return Result;
    };
    this.Pack = function () {
      var Dst = 0;
      var i = 0;
      var V = undefined;
      Dst = 0;
      for (var $l = 0, $end = this.FCount - 1; $l <= $end; $l++) {
        i = $l;
        V = this.FList[i];
        if (!pas.System.Assigned(V)) continue;
        this.FList[Dst] = V;
        Dst += 1;
      };
    };
    this.Sort = function (Compare) {
      var $Self = this;
      if (!(rtl.length(this.FList) > 0) || (this.FCount < 2)) return;
      $impl.QuickSort(rtl.arrayRef(this.FList),0,this.FCount - 1,function (Item1, Item2) {
        var Result = 0;
        Result = Compare(Item1,Item2);
        return Result;
      });
    };
    this.SortList = function (Compare) {
      if (!(rtl.length(this.FList) > 0) || (this.FCount < 2)) return;
      $impl.QuickSort(rtl.arrayRef(this.FList),0,this.FCount - 1,Compare);
    };
    this.ForEachCall = function (proc2call, arg) {
      var i = 0;
      var v = undefined;
      for (var $l = 0, $end = this.FCount - 1; $l <= $end; $l++) {
        i = $l;
        v = this.FList[i];
        if (pas.System.Assigned(v)) proc2call(v,arg);
      };
    };
    this.ForEachCall$1 = function (proc2call, arg) {
      var i = 0;
      var v = undefined;
      for (var $l = 0, $end = this.FCount - 1; $l <= $end; $l++) {
        i = $l;
        v = this.FList[i];
        if (pas.System.Assigned(v)) proc2call(v,arg);
      };
    };
  });
  this.TListNotification = {"0": "lnAdded", lnAdded: 0, "1": "lnExtracted", lnExtracted: 1, "2": "lnDeleted", lnDeleted: 2};
  this.$rtti.$Enum("TListNotification",{minvalue: 0, maxvalue: 2, ordtype: 1, enumtype: this.TListNotification});
  this.$rtti.$Class("TList");
  rtl.createClass(this,"TListEnumerator",pas.System.TObject,function () {
    this.$init = function () {
      pas.System.TObject.$init.call(this);
      this.FList = null;
      this.FPosition = 0;
    };
    this.$final = function () {
      this.FList = undefined;
      pas.System.TObject.$final.call(this);
    };
    this.Create$1 = function (AList) {
      pas.System.TObject.Create.call(this);
      this.FList = AList;
      this.FPosition = -1;
      return this;
    };
    this.GetCurrent = function () {
      var Result = undefined;
      Result = this.FList.Get(this.FPosition);
      return Result;
    };
    this.MoveNext = function () {
      var Result = false;
      this.FPosition += 1;
      Result = this.FPosition < this.FList.GetCount();
      return Result;
    };
  });
  rtl.createClass(this,"TList",pas.System.TObject,function () {
    this.$init = function () {
      pas.System.TObject.$init.call(this);
      this.FList = null;
    };
    this.$final = function () {
      this.FList = undefined;
      pas.System.TObject.$final.call(this);
    };
    this.CopyMove = function (aList) {
      var r = 0;
      this.Clear();
      for (var $l = 0, $end = aList.GetCount() - 1; $l <= $end; $l++) {
        r = $l;
        this.Add(aList.Get(r));
      };
    };
    this.MergeMove = function (aList) {
      var r = 0;
      for (var $l = 0, $end = aList.GetCount() - 1; $l <= $end; $l++) {
        r = $l;
        if (this.IndexOf(aList.Get(r)) < 0) this.Add(aList.Get(r));
      };
    };
    this.DoCopy = function (ListA, ListB) {
      if (ListB != null) {
        this.CopyMove(ListB)}
       else this.CopyMove(ListA);
    };
    this.DoSrcUnique = function (ListA, ListB) {
      var r = 0;
      if (ListB != null) {
        this.Clear();
        for (var $l = 0, $end = ListA.GetCount() - 1; $l <= $end; $l++) {
          r = $l;
          if (ListB.IndexOf(ListA.Get(r)) < 0) this.Add(ListA.Get(r));
        };
      } else {
        for (var $l1 = this.GetCount() - 1; $l1 >= 0; $l1--) {
          r = $l1;
          if (ListA.IndexOf(this.Get(r)) >= 0) this.Delete(r);
        };
      };
    };
    this.DoAnd = function (ListA, ListB) {
      var r = 0;
      if (ListB != null) {
        this.Clear();
        for (var $l = 0, $end = ListA.GetCount() - 1; $l <= $end; $l++) {
          r = $l;
          if (ListB.IndexOf(ListA.Get(r)) >= 0) this.Add(ListA.Get(r));
        };
      } else {
        for (var $l1 = this.GetCount() - 1; $l1 >= 0; $l1--) {
          r = $l1;
          if (ListA.IndexOf(this.Get(r)) < 0) this.Delete(r);
        };
      };
    };
    this.DoDestUnique = function (ListA, ListB) {
      var $Self = this;
      function MoveElements(Src, Dest) {
        var r = 0;
        $Self.Clear();
        for (var $l = 0, $end = Src.GetCount() - 1; $l <= $end; $l++) {
          r = $l;
          if (Dest.IndexOf(Src.Get(r)) < 0) $Self.Add(Src.Get(r));
        };
      };
      var Dest = null;
      if (ListB != null) {
        MoveElements(ListB,ListA)}
       else try {
        Dest = $mod.TList.$create("Create$1");
        Dest.CopyMove($Self);
        MoveElements(ListA,Dest);
      } finally {
        Dest.$destroy("Destroy");
      };
    };
    this.DoOr = function (ListA, ListB) {
      if (ListB != null) {
        this.CopyMove(ListA);
        this.MergeMove(ListB);
      } else this.MergeMove(ListA);
    };
    this.DoXOr = function (ListA, ListB) {
      var r = 0;
      var l = null;
      if (ListB != null) {
        this.Clear();
        for (var $l = 0, $end = ListA.GetCount() - 1; $l <= $end; $l++) {
          r = $l;
          if (ListB.IndexOf(ListA.Get(r)) < 0) this.Add(ListA.Get(r));
        };
        for (var $l1 = 0, $end1 = ListB.GetCount() - 1; $l1 <= $end1; $l1++) {
          r = $l1;
          if (ListA.IndexOf(ListB.Get(r)) < 0) this.Add(ListB.Get(r));
        };
      } else try {
        l = $mod.TList.$create("Create$1");
        l.CopyMove(this);
        for (var $l2 = this.GetCount() - 1; $l2 >= 0; $l2--) {
          r = $l2;
          if (ListA.IndexOf(this.Get(r)) >= 0) this.Delete(r);
        };
        for (var $l3 = 0, $end2 = ListA.GetCount() - 1; $l3 <= $end2; $l3++) {
          r = $l3;
          if (l.IndexOf(ListA.Get(r)) < 0) this.Add(ListA.Get(r));
        };
      } finally {
        l.$destroy("Destroy");
      };
    };
    this.Get = function (Index) {
      var Result = undefined;
      Result = this.FList.Get(Index);
      return Result;
    };
    this.Put = function (Index, Item) {
      var V = undefined;
      V = this.Get(Index);
      this.FList.Put(Index,Item);
      if (pas.System.Assigned(V)) this.Notify(V,2);
      if (pas.System.Assigned(Item)) this.Notify(Item,0);
    };
    this.Notify = function (aValue, Action) {
      if (pas.System.Assigned(aValue)) ;
      if (Action === 1) ;
    };
    this.SetCapacity = function (NewCapacity) {
      this.FList.SetCapacity(NewCapacity);
    };
    this.GetCapacity = function () {
      var Result = 0;
      Result = this.FList.FCapacity;
      return Result;
    };
    this.SetCount = function (NewCount) {
      if (NewCount < this.FList.FCount) {
        while (this.FList.FCount > NewCount) this.Delete(this.FList.FCount - 1)}
       else this.FList.SetCount(NewCount);
    };
    this.GetCount = function () {
      var Result = 0;
      Result = this.FList.FCount;
      return Result;
    };
    this.GetList = function () {
      var Result = [];
      Result = this.FList.FList;
      return Result;
    };
    this.Create$1 = function () {
      pas.System.TObject.Create.call(this);
      this.FList = $mod.TFPList.$create("Create");
      return this;
    };
    this.Destroy = function () {
      if (this.FList != null) this.Clear();
      pas.SysUtils.FreeAndNil({p: this, get: function () {
          return this.p.FList;
        }, set: function (v) {
          this.p.FList = v;
        }});
    };
    this.AddList = function (AList) {
      var I = 0;
      this.FList.AddList(AList.FList);
      for (var $l = 0, $end = AList.GetCount() - 1; $l <= $end; $l++) {
        I = $l;
        if (pas.System.Assigned(AList.Get(I))) this.Notify(AList.Get(I),0);
      };
    };
    this.Add = function (Item) {
      var Result = 0;
      Result = this.FList.Add(Item);
      if (pas.System.Assigned(Item)) this.Notify(Item,0);
      return Result;
    };
    this.Clear = function () {
      while (this.FList.FCount > 0) this.Delete(this.GetCount() - 1);
    };
    this.Delete = function (Index) {
      var V = undefined;
      V = this.FList.Get(Index);
      this.FList.Delete(Index);
      if (pas.System.Assigned(V)) this.Notify(V,2);
    };
    this.Error = function (Msg, Data) {
      throw $mod.EListError.$create("CreateFmt",[Msg,pas.System.VarRecs(18,Data)]);
    };
    this.Exchange = function (Index1, Index2) {
      this.FList.Exchange(Index1,Index2);
    };
    this.Expand = function () {
      var Result = null;
      this.FList.Expand();
      Result = this;
      return Result;
    };
    this.Extract = function (Item) {
      var Result = undefined;
      var c = 0;
      c = this.FList.FCount;
      Result = this.FList.Extract(Item);
      if (c !== this.FList.FCount) this.Notify(Result,1);
      return Result;
    };
    this.First = function () {
      var Result = undefined;
      Result = this.FList.First();
      return Result;
    };
    this.GetEnumerator = function () {
      var Result = null;
      Result = $mod.TListEnumerator.$create("Create$1",[this]);
      return Result;
    };
    this.IndexOf = function (Item) {
      var Result = 0;
      Result = this.FList.IndexOf(Item);
      return Result;
    };
    this.Insert = function (Index, Item) {
      this.FList.Insert(Index,Item);
      if (pas.System.Assigned(Item)) this.Notify(Item,0);
    };
    this.Last = function () {
      var Result = undefined;
      Result = this.FList.Last();
      return Result;
    };
    this.Move = function (CurIndex, NewIndex) {
      this.FList.Move(CurIndex,NewIndex);
    };
    this.Assign = function (ListA, AOperator, ListB) {
      var $tmp = AOperator;
      if ($tmp === 0) {
        this.DoCopy(ListA,ListB)}
       else if ($tmp === 4) {
        this.DoSrcUnique(ListA,ListB)}
       else if ($tmp === 1) {
        this.DoAnd(ListA,ListB)}
       else if ($tmp === 5) {
        this.DoDestUnique(ListA,ListB)}
       else if ($tmp === 2) {
        this.DoOr(ListA,ListB)}
       else if ($tmp === 3) this.DoXOr(ListA,ListB);
    };
    this.Remove = function (Item) {
      var Result = 0;
      Result = this.IndexOf(Item);
      if (Result !== -1) this.Delete(Result);
      return Result;
    };
    this.Pack = function () {
      this.FList.Pack();
    };
    this.Sort = function (Compare) {
      this.FList.Sort(Compare);
    };
    this.SortList = function (Compare) {
      this.FList.SortList(Compare);
    };
  });
  rtl.createClass(this,"TPersistent",pas.System.TObject,function () {
    this.AssignError = function (Source) {
      var SourceName = "";
      if (Source !== null) {
        SourceName = Source.$classname}
       else SourceName = "Nil";
      throw pas.SysUtils.EConvertError.$create("Create$1",["Cannot assign a " + SourceName + " to a " + this.$classname + "."]);
    };
    this.DefineProperties = function (Filer) {
      if (Filer === null) return;
    };
    this.AssignTo = function (Dest) {
      Dest.AssignError(this);
    };
    this.GetOwner = function () {
      var Result = null;
      Result = null;
      return Result;
    };
    this.Assign = function (Source) {
      if (Source !== null) {
        Source.AssignTo(this)}
       else this.AssignError(null);
    };
    this.GetNamePath = function () {
      var Result = "";
      var OwnerName = "";
      var TheOwner = null;
      Result = this.$classname;
      TheOwner = this.GetOwner();
      if (TheOwner !== null) {
        OwnerName = TheOwner.GetNamePath();
        if (OwnerName !== "") Result = OwnerName + "." + Result;
      };
      return Result;
    };
  });
  this.$rtti.$ClassRef("TPersistentClass",{instancetype: this.$rtti["TPersistent"]});
  rtl.createClass(this,"TInterfacedPersistent",this.TPersistent,function () {
    this.$init = function () {
      $mod.TPersistent.$init.call(this);
      this.FOwnerInterface = null;
    };
    this.$final = function () {
      rtl.setIntfP(this,"FOwnerInterface",null);
      $mod.TPersistent.$final.call(this);
    };
    this._AddRef = function () {
      var Result = 0;
      Result = -1;
      if (this.FOwnerInterface != null) Result = this.FOwnerInterface._AddRef();
      return Result;
    };
    this._Release = function () {
      var Result = 0;
      Result = -1;
      if (this.FOwnerInterface != null) Result = this.FOwnerInterface._Release();
      return Result;
    };
    this.QueryInterface = function (IID, Obj) {
      var Result = 0;
      Result = -2147467262;
      if (this.GetInterface(IID,Obj)) Result = 0;
      return Result;
    };
    this.AfterConstruction = function () {
      try {
        pas.System.TObject.AfterConstruction.call(this);
        if (this.GetOwner() !== null) this.GetOwner().GetInterface(rtl.getIntfGUIDR(pas.System.IUnknown),{p: this, get: function () {
            return this.p.FOwnerInterface;
          }, set: function (v) {
            this.p.FOwnerInterface = v;
          }});
      } finally {
        rtl._Release(this.FOwnerInterface);
      };
    };
    rtl.addIntf(this,pas.System.IUnknown);
  });
  this.$rtti.$Class("TStrings");
  rtl.createClass(this,"TStringsEnumerator",pas.System.TObject,function () {
    this.$init = function () {
      pas.System.TObject.$init.call(this);
      this.FStrings = null;
      this.FPosition = 0;
    };
    this.$final = function () {
      this.FStrings = undefined;
      pas.System.TObject.$final.call(this);
    };
    this.Create$1 = function (AStrings) {
      pas.System.TObject.Create.call(this);
      this.FStrings = AStrings;
      this.FPosition = -1;
      return this;
    };
    this.GetCurrent = function () {
      var Result = "";
      Result = this.FStrings.Get(this.FPosition);
      return Result;
    };
    this.MoveNext = function () {
      var Result = false;
      this.FPosition += 1;
      Result = this.FPosition < this.FStrings.GetCount();
      return Result;
    };
  });
  rtl.createClass(this,"TStrings",this.TPersistent,function () {
    this.$init = function () {
      $mod.TPersistent.$init.call(this);
      this.FSpecialCharsInited = false;
      this.FAlwaysQuote = false;
      this.FQuoteChar = "";
      this.FDelimiter = "";
      this.FNameValueSeparator = "";
      this.FUpdateCount = 0;
      this.FLBS = 0;
      this.FSkipLastLineBreak = false;
      this.FStrictDelimiter = false;
      this.FLineBreak = "";
    };
    this.GetCommaText = function () {
      var Result = "";
      var C1 = "";
      var C2 = "";
      var FSD = false;
      this.CheckSpecialChars();
      FSD = this.FStrictDelimiter;
      C1 = this.GetDelimiter();
      C2 = this.GetQuoteChar();
      this.SetDelimiter(",");
      this.SetQuoteChar('"');
      this.FStrictDelimiter = false;
      try {
        Result = this.GetDelimitedText();
      } finally {
        this.SetDelimiter(C1);
        this.SetQuoteChar(C2);
        this.FStrictDelimiter = FSD;
      };
      return Result;
    };
    this.GetName = function (Index) {
      var Result = "";
      var V = "";
      this.GetNameValue(Index,{get: function () {
          return Result;
        }, set: function (v) {
          Result = v;
        }},{get: function () {
          return V;
        }, set: function (v) {
          V = v;
        }});
      return Result;
    };
    this.GetValue = function (Name) {
      var Result = "";
      var L = 0;
      var N = "";
      Result = "";
      L = this.IndexOfName(Name);
      if (L !== -1) this.GetNameValue(L,{get: function () {
          return N;
        }, set: function (v) {
          N = v;
        }},{get: function () {
          return Result;
        }, set: function (v) {
          Result = v;
        }});
      return Result;
    };
    this.GetLBS = function () {
      var Result = 0;
      this.CheckSpecialChars();
      Result = this.FLBS;
      return Result;
    };
    this.SetLBS = function (AValue) {
      this.CheckSpecialChars();
      this.FLBS = AValue;
    };
    this.SetCommaText = function (Value) {
      var C1 = "";
      var C2 = "";
      this.CheckSpecialChars();
      C1 = this.GetDelimiter();
      C2 = this.GetQuoteChar();
      this.SetDelimiter(",");
      this.SetQuoteChar('"');
      try {
        this.SetDelimitedText(Value);
      } finally {
        this.SetDelimiter(C1);
        this.SetQuoteChar(C2);
      };
    };
    this.SetValue = function (Name, Value) {
      var L = 0;
      this.CheckSpecialChars();
      L = this.IndexOfName(Name);
      if (L === -1) {
        this.Add(Name + this.FNameValueSeparator + Value)}
       else this.Put(L,Name + this.FNameValueSeparator + Value);
    };
    this.SetDelimiter = function (c) {
      this.CheckSpecialChars();
      this.FDelimiter = c;
    };
    this.SetQuoteChar = function (c) {
      this.CheckSpecialChars();
      this.FQuoteChar = c;
    };
    this.SetNameValueSeparator = function (c) {
      this.CheckSpecialChars();
      this.FNameValueSeparator = c;
    };
    this.DoSetTextStr = function (Value, DoClear) {
      var S = "";
      var P = 0;
      try {
        this.BeginUpdate();
        if (DoClear) this.Clear();
        P = 1;
        while (this.GetNextLinebreak(Value,{get: function () {
            return S;
          }, set: function (v) {
            S = v;
          }},{get: function () {
            return P;
          }, set: function (v) {
            P = v;
          }})) this.Add(S);
      } finally {
        this.EndUpdate();
      };
    };
    this.GetDelimiter = function () {
      var Result = "";
      this.CheckSpecialChars();
      Result = this.FDelimiter;
      return Result;
    };
    this.GetNameValueSeparator = function () {
      var Result = "";
      this.CheckSpecialChars();
      Result = this.FNameValueSeparator;
      return Result;
    };
    this.GetQuoteChar = function () {
      var Result = "";
      this.CheckSpecialChars();
      Result = this.FQuoteChar;
      return Result;
    };
    this.GetLineBreak = function () {
      var Result = "";
      this.CheckSpecialChars();
      Result = this.FLineBreak;
      return Result;
    };
    this.SetLineBreak = function (S) {
      this.CheckSpecialChars();
      this.FLineBreak = S;
    };
    this.GetSkipLastLineBreak = function () {
      var Result = false;
      this.CheckSpecialChars();
      Result = this.FSkipLastLineBreak;
      return Result;
    };
    this.SetSkipLastLineBreak = function (AValue) {
      this.CheckSpecialChars();
      this.FSkipLastLineBreak = AValue;
    };
    this.ReadData = function (Reader) {
      Reader.ReadListBegin();
      this.BeginUpdate();
      try {
        this.Clear();
        while (!Reader.EndOfList()) this.Add(Reader.ReadString());
      } finally {
        this.EndUpdate();
      };
      Reader.ReadListEnd();
    };
    this.WriteData = function (Writer) {
      var i = 0;
      Writer.WriteListBegin();
      for (var $l = 0, $end = this.GetCount() - 1; $l <= $end; $l++) {
        i = $l;
        Writer.WriteString(this.Get(i));
      };
      Writer.WriteListEnd();
    };
    this.DefineProperties = function (Filer) {
      var HasData = false;
      if (Filer.FAncestor != null) {
        if (Filer.FAncestor.$class.InheritsFrom($mod.TStrings)) {
          HasData = !this.Equals$2(Filer.FAncestor)}
         else HasData = true}
       else HasData = this.GetCount() > 0;
      Filer.DefineProperty("Strings",rtl.createCallback(this,"ReadData"),rtl.createCallback(this,"WriteData"),HasData);
    };
    this.Error = function (Msg, Data) {
      throw $mod.EStringListError.$create("CreateFmt",[Msg,pas.System.VarRecs(18,pas.SysUtils.IntToStr(Data))]);
    };
    this.GetCapacity = function () {
      var Result = 0;
      Result = this.GetCount();
      return Result;
    };
    this.GetObject = function (Index) {
      var Result = null;
      if (Index === 0) ;
      Result = null;
      return Result;
    };
    this.GetTextStr = function () {
      var Result = "";
      var I = 0;
      var S = "";
      var NL = "";
      this.CheckSpecialChars();
      if (this.FLineBreak !== pas.System.sLineBreak) {
        NL = this.FLineBreak}
       else {
        var $tmp = this.FLBS;
        if ($tmp === 0) {
          NL = "\n"}
         else if ($tmp === 1) {
          NL = "\r\n"}
         else if ($tmp === 2) NL = "\r";
      };
      Result = "";
      for (var $l = 0, $end = this.GetCount() - 1; $l <= $end; $l++) {
        I = $l;
        S = this.Get(I);
        Result = Result + S;
        if ((I < (this.GetCount() - 1)) || !this.GetSkipLastLineBreak()) Result = Result + NL;
      };
      return Result;
    };
    this.Put = function (Index, S) {
      var Obj = null;
      Obj = this.GetObject(Index);
      this.Delete(Index);
      this.InsertObject(Index,S,Obj);
    };
    this.PutObject = function (Index, AObject) {
      if (Index === 0) return;
      if (AObject === null) return;
    };
    this.SetCapacity = function (NewCapacity) {
      if (NewCapacity === 0) ;
    };
    this.SetTextStr = function (Value) {
      this.CheckSpecialChars();
      this.DoSetTextStr(Value,true);
    };
    this.SetUpdateState = function (Updating) {
      if (Updating) ;
    };
    this.DoCompareText = function (s1, s2) {
      var Result = 0;
      Result = pas.SysUtils.CompareText(s1,s2);
      return Result;
    };
    this.GetDelimitedText = function () {
      var Result = "";
      var I = 0;
      var RE = "";
      var S = "";
      var doQuote = false;
      this.CheckSpecialChars();
      Result = "";
      RE = this.GetQuoteChar() + "|" + this.GetDelimiter();
      if (!this.FStrictDelimiter) RE = " |" + RE;
      RE = "\/" + RE + "\/";
      for (var $l = 0, $end = this.GetCount() - 1; $l <= $end; $l++) {
        I = $l;
        S = this.Get(I);
        doQuote = this.FAlwaysQuote || (S.search(RE) !== -1);
        if (doQuote) {
          Result = Result + pas.SysUtils.QuoteString(S,this.GetQuoteChar())}
         else Result = Result + S;
        if (I < (this.GetCount() - 1)) Result = Result + this.GetDelimiter();
      };
      if ((Result.length === 0) && (this.GetCount() === 1)) Result = this.GetQuoteChar() + this.GetQuoteChar();
      return Result;
    };
    this.SetDelimitedText = function (AValue) {
      var i = 0;
      var j = 0;
      var aNotFirst = false;
      this.CheckSpecialChars();
      this.BeginUpdate();
      i = 1;
      j = 1;
      aNotFirst = false;
      try {
        this.Clear();
        if (this.FStrictDelimiter) {
          while (i <= AValue.length) {
            if (aNotFirst && (i <= AValue.length) && (AValue.charAt(i - 1) === this.FDelimiter)) i += 1;
            if (i <= AValue.length) {
              if (AValue.charAt(i - 1) === this.FQuoteChar) {
                j = i + 1;
                while ((j <= AValue.length) && ((AValue.charAt(j - 1) !== this.FQuoteChar) || (((j + 1) <= AValue.length) && (AValue.charAt((j + 1) - 1) === this.FQuoteChar)))) {
                  if ((j <= AValue.length) && (AValue.charAt(j - 1) === this.FQuoteChar)) {
                    j += 2}
                   else j += 1;
                };
                this.Add(pas.SysUtils.StringReplace(pas.System.Copy(AValue,i + 1,j - i - 1),this.FQuoteChar + this.FQuoteChar,this.FQuoteChar,rtl.createSet(0)));
                i = j + 1;
              } else {
                j = i;
                while ((j <= AValue.length) && (AValue.charAt(j - 1) !== this.FDelimiter)) j += 1;
                this.Add(pas.System.Copy(AValue,i,j - i));
                i = j;
              };
            } else {
              if (aNotFirst) this.Add("");
            };
            aNotFirst = true;
          };
        } else {
          while (i <= AValue.length) {
            if (aNotFirst && (i <= AValue.length) && (AValue.charAt(i - 1) === this.FDelimiter)) i += 1;
            while ((i <= AValue.length) && (AValue.charCodeAt(i - 1) <= 32)) i += 1;
            if (i <= AValue.length) {
              if (AValue.charAt(i - 1) === this.FQuoteChar) {
                j = i + 1;
                while ((j <= AValue.length) && ((AValue.charAt(j - 1) !== this.FQuoteChar) || (((j + 1) <= AValue.length) && (AValue.charAt((j + 1) - 1) === this.FQuoteChar)))) {
                  if ((j <= AValue.length) && (AValue.charAt(j - 1) === this.FQuoteChar)) {
                    j += 2}
                   else j += 1;
                };
                this.Add(pas.SysUtils.StringReplace(pas.System.Copy(AValue,i + 1,j - i - 1),this.FQuoteChar + this.FQuoteChar,this.FQuoteChar,rtl.createSet(0)));
                i = j + 1;
              } else {
                j = i;
                while ((j <= AValue.length) && (AValue.charCodeAt(j - 1) > 32) && (AValue.charAt(j - 1) !== this.FDelimiter)) j += 1;
                this.Add(pas.System.Copy(AValue,i,j - i));
                i = j;
              };
            } else {
              if (aNotFirst) this.Add("");
            };
            while ((i <= AValue.length) && (AValue.charCodeAt(i - 1) <= 32)) i += 1;
            aNotFirst = true;
          };
        };
      } finally {
        this.EndUpdate();
      };
    };
    this.GetValueFromIndex = function (Index) {
      var Result = "";
      var N = "";
      this.GetNameValue(Index,{get: function () {
          return N;
        }, set: function (v) {
          N = v;
        }},{get: function () {
          return Result;
        }, set: function (v) {
          Result = v;
        }});
      return Result;
    };
    this.SetValueFromIndex = function (Index, Value) {
      if (Value === "") {
        this.Delete(Index)}
       else {
        if (Index < 0) Index = this.Add("");
        this.CheckSpecialChars();
        this.Put(Index,this.GetName(Index) + this.FNameValueSeparator + Value);
      };
    };
    this.CheckSpecialChars = function () {
      if (!this.FSpecialCharsInited) {
        this.FQuoteChar = '"';
        this.FDelimiter = ",";
        this.FNameValueSeparator = "=";
        this.FLBS = pas.System.DefaultTextLineBreakStyle;
        this.FSpecialCharsInited = true;
        this.FLineBreak = pas.System.sLineBreak;
      };
    };
    this.GetNextLinebreak = function (Value, S, P) {
      var Result = false;
      var PPLF = 0;
      var PPCR = 0;
      var PP = 0;
      var PL = 0;
      S.set("");
      Result = false;
      if ((Value.length - P.get()) < 0) return Result;
      PPLF = Value.indexOf("\n",P.get() - 1) + 1;
      PPCR = Value.indexOf("\r",P.get() - 1) + 1;
      PL = 1;
      if ((PPLF > 0) && (PPCR > 0)) {
        if ((PPLF - PPCR) === 1) PL = 2;
        if (PPLF < PPCR) {
          PP = PPLF}
         else PP = PPCR;
      } else if ((PPLF > 0) && (PPCR < 1)) {
        PP = PPLF}
       else if ((PPCR > 0) && (PPLF < 1)) {
        PP = PPCR}
       else PP = Value.length + 1;
      S.set(pas.System.Copy(Value,P.get(),PP - P.get()));
      P.set(PP + PL);
      Result = true;
      return Result;
    };
    this.Create$1 = function () {
      pas.System.TObject.Create.call(this);
      this.FAlwaysQuote = false;
      return this;
    };
    this.Destroy = function () {
      pas.System.TObject.Destroy.call(this);
    };
    this.ToObjectArray = function () {
      var Result = [];
      Result = this.ToObjectArray$1(0,this.GetCount() - 1);
      return Result;
    };
    this.ToObjectArray$1 = function (aStart, aEnd) {
      var Result = [];
      var I = 0;
      Result = [];
      if (aStart > aEnd) return Result;
      Result = rtl.arraySetLength(Result,null,(aEnd - aStart) + 1);
      for (var $l = aStart, $end = aEnd; $l <= $end; $l++) {
        I = $l;
        Result[I - aStart] = this.GetObject(I);
      };
      return Result;
    };
    this.ToStringArray = function () {
      var Result = [];
      Result = this.ToStringArray$1(0,this.GetCount() - 1);
      return Result;
    };
    this.ToStringArray$1 = function (aStart, aEnd) {
      var Result = [];
      var I = 0;
      Result = [];
      if (aStart > aEnd) return Result;
      Result = rtl.arraySetLength(Result,"",(aEnd - aStart) + 1);
      for (var $l = aStart, $end = aEnd; $l <= $end; $l++) {
        I = $l;
        Result[I - aStart] = this.Get(I);
      };
      return Result;
    };
    this.Add = function (S) {
      var Result = 0;
      Result = this.GetCount();
      this.Insert(this.GetCount(),S);
      return Result;
    };
    this.Add$1 = function (Fmt, Args) {
      var Result = 0;
      Result = this.Add(pas.SysUtils.Format(Fmt,Args));
      return Result;
    };
    this.AddFmt = function (Fmt, Args) {
      var Result = 0;
      Result = this.Add(pas.SysUtils.Format(Fmt,Args));
      return Result;
    };
    this.AddObject = function (S, AObject) {
      var Result = 0;
      Result = this.Add(S);
      this.PutObject(Result,AObject);
      return Result;
    };
    this.AddObject$1 = function (Fmt, Args, AObject) {
      var Result = 0;
      Result = this.AddObject(pas.SysUtils.Format(Fmt,Args),AObject);
      return Result;
    };
    this.Append = function (S) {
      this.Add(S);
    };
    this.AddStrings = function (TheStrings) {
      var Runner = 0;
      for (var $l = 0, $end = TheStrings.GetCount() - 1; $l <= $end; $l++) {
        Runner = $l;
        this.AddObject(TheStrings.Get(Runner),TheStrings.GetObject(Runner));
      };
    };
    this.AddStrings$1 = function (TheStrings, ClearFirst) {
      this.BeginUpdate();
      try {
        if (ClearFirst) this.Clear();
        this.AddStrings(TheStrings);
      } finally {
        this.EndUpdate();
      };
    };
    this.AddStrings$2 = function (TheStrings) {
      var Runner = 0;
      if ((this.GetCount() + (rtl.length(TheStrings) - 1) + 1) > this.GetCapacity()) this.SetCapacity(this.GetCount() + (rtl.length(TheStrings) - 1) + 1);
      for (var $l = 0, $end = rtl.length(TheStrings) - 1; $l <= $end; $l++) {
        Runner = $l;
        this.Add(TheStrings[Runner]);
      };
    };
    this.AddStrings$3 = function (TheStrings, ClearFirst) {
      this.BeginUpdate();
      try {
        if (ClearFirst) this.Clear();
        this.AddStrings$2(TheStrings);
      } finally {
        this.EndUpdate();
      };
    };
    this.AddPair = function (AName, AValue) {
      var Result = null;
      Result = this.AddPair$1(AName,AValue,null);
      return Result;
    };
    this.AddPair$1 = function (AName, AValue, AObject) {
      var Result = null;
      Result = this;
      this.AddObject(AName + this.GetNameValueSeparator() + AValue,AObject);
      return Result;
    };
    this.AddText = function (S) {
      this.CheckSpecialChars();
      this.DoSetTextStr(S,false);
    };
    this.Assign = function (Source) {
      var S = null;
      if ($mod.TStrings.isPrototypeOf(Source)) {
        S = Source;
        this.BeginUpdate();
        try {
          this.Clear();
          this.FSpecialCharsInited = S.FSpecialCharsInited;
          this.FQuoteChar = S.FQuoteChar;
          this.FDelimiter = S.FDelimiter;
          this.FNameValueSeparator = S.FNameValueSeparator;
          this.FLBS = S.FLBS;
          this.FLineBreak = S.FLineBreak;
          this.AddStrings(S);
        } finally {
          this.EndUpdate();
        };
      } else $mod.TPersistent.Assign.call(this,Source);
    };
    this.BeginUpdate = function () {
      if (this.FUpdateCount === 0) this.SetUpdateState(true);
      this.FUpdateCount += 1;
    };
    this.EndUpdate = function () {
      if (this.FUpdateCount > 0) this.FUpdateCount -= 1;
      if (this.FUpdateCount === 0) this.SetUpdateState(false);
    };
    this.Equals = function (Obj) {
      var Result = false;
      if ($mod.TStrings.isPrototypeOf(Obj)) {
        Result = this.Equals$2(Obj)}
       else Result = pas.System.TObject.Equals.call(this,Obj);
      return Result;
    };
    this.Equals$2 = function (TheStrings) {
      var Result = false;
      var Runner = 0;
      var Nr = 0;
      Result = false;
      Nr = this.GetCount();
      if (Nr !== TheStrings.GetCount()) return Result;
      for (var $l = 0, $end = Nr - 1; $l <= $end; $l++) {
        Runner = $l;
        if (this.Get(Runner) !== TheStrings.Get(Runner)) return Result;
      };
      Result = true;
      return Result;
    };
    this.Exchange = function (Index1, Index2) {
      var Obj = null;
      var Str = "";
      this.BeginUpdate();
      try {
        Obj = this.GetObject(Index1);
        Str = this.Get(Index1);
        this.PutObject(Index1,this.GetObject(Index2));
        this.Put(Index1,this.Get(Index2));
        this.PutObject(Index2,Obj);
        this.Put(Index2,Str);
      } finally {
        this.EndUpdate();
      };
    };
    this.GetEnumerator = function () {
      var Result = null;
      Result = $mod.TStringsEnumerator.$create("Create$1",[this]);
      return Result;
    };
    this.IndexOf = function (S) {
      var Result = 0;
      Result = 0;
      while ((Result < this.GetCount()) && (this.DoCompareText(this.Get(Result),S) !== 0)) Result = Result + 1;
      if (Result === this.GetCount()) Result = -1;
      return Result;
    };
    this.IndexOfName = function (Name) {
      var Result = 0;
      var len = 0;
      var S = "";
      this.CheckSpecialChars();
      Result = 0;
      while (Result < this.GetCount()) {
        S = this.Get(Result);
        len = pas.System.Pos(this.FNameValueSeparator,S) - 1;
        if ((len >= 0) && (this.DoCompareText(Name,pas.System.Copy(S,1,len)) === 0)) return Result;
        Result += 1;
      };
      Result = -1;
      return Result;
    };
    this.IndexOfObject = function (AObject) {
      var Result = 0;
      Result = 0;
      while ((Result < this.GetCount()) && (this.GetObject(Result) !== AObject)) Result = Result + 1;
      if (Result === this.GetCount()) Result = -1;
      return Result;
    };
    this.InsertObject = function (Index, S, AObject) {
      this.Insert(Index,S);
      this.PutObject(Index,AObject);
    };
    this.Move = function (CurIndex, NewIndex) {
      var Obj = null;
      var Str = "";
      this.BeginUpdate();
      try {
        Obj = this.GetObject(CurIndex);
        Str = this.Get(CurIndex);
        this.PutObject(CurIndex,null);
        this.Delete(CurIndex);
        this.InsertObject(NewIndex,Str,Obj);
      } finally {
        this.EndUpdate();
      };
    };
    this.GetNameValue = function (Index, AName, AValue) {
      var L = 0;
      this.CheckSpecialChars();
      AValue.set(this.Get(Index));
      L = pas.System.Pos(this.FNameValueSeparator,AValue.get());
      if (L !== 0) {
        AName.set(pas.System.Copy(AValue.get(),1,L - 1));
        AValue.set(pas.System.Copy(AValue.get(),L + 1,AValue.get().length - L));
      } else AName.set("");
    };
    this.LoadFromURL = function (aURL, Async, OnLoaded, OnError) {
      var $Self = this;
      function DoLoaded(aString) {
        $Self.SetTextStr(aString);
        if (OnLoaded != null) OnLoaded($Self);
      };
      function DoError(AError) {
        if (OnError != null) {
          OnError($Self,AError)}
         else throw pas.SysUtils.EInOutError.$create("Create$1",["Failed to load from URL:" + AError]);
      };
      $impl.CheckLoadHelper();
      $impl.GlobalLoadHelper.LoadText(aURL,Async,DoLoaded,DoError);
    };
    this.LoadFromFile = function (aFileName, OnLoaded, AError) {
      var $Self = this;
      this.LoadFromURL(aFileName,false,function (Sender) {
        if (OnLoaded != null) OnLoaded();
      },function (Sender, ErrorMsg) {
        if (AError != null) AError(ErrorMsg);
      });
    };
    this.ExtractName = function (S) {
      var Result = "";
      var L = 0;
      this.CheckSpecialChars();
      L = pas.System.Pos(this.FNameValueSeparator,S);
      if (L !== 0) {
        Result = pas.System.Copy(S,1,L - 1)}
       else Result = "";
      return Result;
    };
  });
  rtl.recNewT(this,"TStringItem",function () {
    this.FString = "";
    this.FObject = null;
    this.$eq = function (b) {
      return (this.FString === b.FString) && (this.FObject === b.FObject);
    };
    this.$assign = function (s) {
      this.FString = s.FString;
      this.FObject = s.FObject;
      return this;
    };
    var $r = $mod.$rtti.$Record("TStringItem",{});
    $r.addField("FString",rtl.string);
    $r.addField("FObject",pas.System.$rtti["TObject"]);
  });
  this.$rtti.$DynArray("TStringItemArray",{eltype: this.$rtti["TStringItem"]});
  this.$rtti.$Class("TStringList");
  this.$rtti.$ProcVar("TStringListSortCompare",{procsig: rtl.newTIProcSig([["List",this.$rtti["TStringList"]],["Index1",rtl.longint],["Index2",rtl.longint]],rtl.longint)});
  this.TStringsSortStyle = {"0": "sslNone", sslNone: 0, "1": "sslUser", sslUser: 1, "2": "sslAuto", sslAuto: 2};
  this.$rtti.$Enum("TStringsSortStyle",{minvalue: 0, maxvalue: 2, ordtype: 1, enumtype: this.TStringsSortStyle});
  this.$rtti.$Set("TStringsSortStyles",{comptype: this.$rtti["TStringsSortStyle"]});
  rtl.createClass(this,"TStringList",this.TStrings,function () {
    this.$init = function () {
      $mod.TStrings.$init.call(this);
      this.FList = [];
      this.FCount = 0;
      this.FOnChange = null;
      this.FOnChanging = null;
      this.FDuplicates = 0;
      this.FCaseSensitive = false;
      this.FForceSort = false;
      this.FOwnsObjects = false;
      this.FSortStyle = 0;
    };
    this.$final = function () {
      this.FList = undefined;
      this.FOnChange = undefined;
      this.FOnChanging = undefined;
      $mod.TStrings.$final.call(this);
    };
    this.ExchangeItemsInt = function (Index1, Index2) {
      var S = "";
      var O = null;
      S = this.FList[Index1].FString;
      O = this.FList[Index1].FObject;
      this.FList[Index1].FString = this.FList[Index2].FString;
      this.FList[Index1].FObject = this.FList[Index2].FObject;
      this.FList[Index2].FString = S;
      this.FList[Index2].FObject = O;
    };
    this.GetSorted = function () {
      var Result = false;
      Result = this.FSortStyle in rtl.createSet(1,2);
      return Result;
    };
    this.Grow = function () {
      var NC = 0;
      NC = this.GetCapacity();
      if (NC >= 256) {
        NC = NC + rtl.trunc(NC / 4)}
       else if (NC === 0) {
        NC = 4}
       else NC = NC * 4;
      this.SetCapacity(NC);
    };
    this.InternalClear = function (FromIndex, ClearOnly) {
      var I = 0;
      if (FromIndex < this.FCount) {
        if (this.FOwnsObjects) {
          for (var $l = FromIndex, $end = this.FCount - 1; $l <= $end; $l++) {
            I = $l;
            this.FList[I].FString = "";
            pas.SysUtils.FreeAndNil({p: this.FList[I], get: function () {
                return this.p.FObject;
              }, set: function (v) {
                this.p.FObject = v;
              }});
          };
        } else {
          for (var $l1 = FromIndex, $end1 = this.FCount - 1; $l1 <= $end1; $l1++) {
            I = $l1;
            this.FList[I].FString = "";
          };
        };
        this.FCount = FromIndex;
      };
      if (!ClearOnly) this.SetCapacity(0);
    };
    this.QuickSort = function (L, R, CompareFn) {
      var Pivot = 0;
      var vL = 0;
      var vR = 0;
      if ((R - L) <= 1) {
        if (L < R) if (CompareFn(this,L,R) > 0) this.ExchangeItems(L,R);
        return;
      };
      vL = L;
      vR = R;
      Pivot = L + pas.System.Random(R - L);
      while (vL < vR) {
        while ((vL < Pivot) && (CompareFn(this,vL,Pivot) <= 0)) vL += 1;
        while ((vR > Pivot) && (CompareFn(this,vR,Pivot) > 0)) vR -= 1;
        this.ExchangeItems(vL,vR);
        if (Pivot === vL) {
          Pivot = vR}
         else if (Pivot === vR) Pivot = vL;
      };
      if ((Pivot - 1) >= L) this.QuickSort(L,Pivot - 1,CompareFn);
      if ((Pivot + 1) <= R) this.QuickSort(Pivot + 1,R,CompareFn);
    };
    this.SetSorted = function (Value) {
      if (Value) {
        this.SetSortStyle(2)}
       else this.SetSortStyle(0);
    };
    this.SetCaseSensitive = function (b) {
      if (b === this.FCaseSensitive) return;
      this.FCaseSensitive = b;
      if (this.FSortStyle === 2) {
        this.FForceSort = true;
        try {
          this.Sort();
        } finally {
          this.FForceSort = false;
        };
      };
    };
    this.SetSortStyle = function (AValue) {
      if (this.FSortStyle === AValue) return;
      if (AValue === 2) this.Sort();
      this.FSortStyle = AValue;
    };
    this.CheckIndex = function (AIndex) {
      if ((AIndex < 0) || (AIndex >= this.FCount)) this.Error(rtl.getResStr(pas.RTLConsts,"SListIndexError"),AIndex);
    };
    this.ExchangeItems = function (Index1, Index2) {
      this.ExchangeItemsInt(Index1,Index2);
    };
    this.Changed = function () {
      if (this.FUpdateCount === 0) {
        if (this.FOnChange != null) this.FOnChange(this);
      };
    };
    this.Changing = function () {
      if (this.FUpdateCount === 0) if (this.FOnChanging != null) this.FOnChanging(this);
    };
    this.Get = function (Index) {
      var Result = "";
      this.CheckIndex(Index);
      Result = this.FList[Index].FString;
      return Result;
    };
    this.GetCapacity = function () {
      var Result = 0;
      Result = rtl.length(this.FList);
      return Result;
    };
    this.GetCount = function () {
      var Result = 0;
      Result = this.FCount;
      return Result;
    };
    this.GetObject = function (Index) {
      var Result = null;
      this.CheckIndex(Index);
      Result = this.FList[Index].FObject;
      return Result;
    };
    this.Put = function (Index, S) {
      if (this.GetSorted()) this.Error(rtl.getResStr(pas.RTLConsts,"SSortedListError"),0);
      this.CheckIndex(Index);
      this.Changing();
      this.FList[Index].FString = S;
      this.Changed();
    };
    this.PutObject = function (Index, AObject) {
      this.CheckIndex(Index);
      this.Changing();
      this.FList[Index].FObject = AObject;
      this.Changed();
    };
    this.SetCapacity = function (NewCapacity) {
      if (NewCapacity < 0) this.Error(rtl.getResStr(pas.RTLConsts,"SListCapacityError"),NewCapacity);
      if (NewCapacity !== this.GetCapacity()) this.FList = rtl.arraySetLength(this.FList,$mod.TStringItem,NewCapacity);
    };
    this.SetUpdateState = function (Updating) {
      if (Updating) {
        this.Changing()}
       else this.Changed();
    };
    this.InsertItem = function (Index, S) {
      this.InsertItem$1(Index,S,null);
    };
    this.InsertItem$1 = function (Index, S, O) {
      var It = $mod.TStringItem.$new();
      this.Changing();
      if (this.FCount === this.GetCapacity()) this.Grow();
      It.FString = S;
      It.FObject = O;
      this.FList.splice(Index,0,It);
      this.FCount += 1;
      this.Changed();
    };
    this.DoCompareText = function (s1, s2) {
      var Result = 0;
      if (this.FCaseSensitive) {
        Result = pas.SysUtils.CompareStr(s1,s2)}
       else Result = pas.SysUtils.CompareText(s1,s2);
      return Result;
    };
    this.CompareStrings = function (s1, s2) {
      var Result = 0;
      Result = this.DoCompareText(s1,s2);
      return Result;
    };
    this.Destroy = function () {
      this.InternalClear(0,false);
      $mod.TStrings.Destroy.call(this);
    };
    this.Add = function (S) {
      var Result = 0;
      if (!(this.FSortStyle === 2)) {
        Result = this.FCount}
       else if (this.Find(S,{get: function () {
          return Result;
        }, set: function (v) {
          Result = v;
        }})) {
        var $tmp = this.FDuplicates;
        if ($tmp === 0) {
          return Result}
         else if ($tmp === 2) this.Error(rtl.getResStr(pas.RTLConsts,"SDuplicateString"),0);
      };
      this.InsertItem(Result,S);
      return Result;
    };
    this.Clear = function () {
      if (this.FCount === 0) return;
      this.Changing();
      this.InternalClear(0,false);
      this.Changed();
    };
    this.Delete = function (Index) {
      this.CheckIndex(Index);
      this.Changing();
      if (this.FOwnsObjects) pas.SysUtils.FreeAndNil({p: this.FList[Index], get: function () {
          return this.p.FObject;
        }, set: function (v) {
          this.p.FObject = v;
        }});
      this.FList.splice(Index,1);
      this.FList[this.GetCount() - 1].FString = "";
      this.FList[this.GetCount() - 1].FObject = null;
      this.FCount -= 1;
      this.Changed();
    };
    this.Exchange = function (Index1, Index2) {
      this.CheckIndex(Index1);
      this.CheckIndex(Index2);
      this.Changing();
      this.ExchangeItemsInt(Index1,Index2);
      this.Changed();
    };
    this.Find = function (S, Index) {
      var Result = false;
      var L = 0;
      var R = 0;
      var I = 0;
      var CompareRes = 0;
      Result = false;
      Index.set(-1);
      if (!this.GetSorted()) throw $mod.EListError.$create("Create$1",[rtl.getResStr(pas.RTLConsts,"SErrFindNeedsSortedList")]);
      L = 0;
      R = this.GetCount() - 1;
      while (L <= R) {
        I = L + rtl.trunc((R - L) / 2);
        CompareRes = this.DoCompareText(S,this.FList[I].FString);
        if (CompareRes > 0) {
          L = I + 1}
         else {
          R = I - 1;
          if (CompareRes === 0) {
            Result = true;
            if (this.FDuplicates !== 1) L = I;
          };
        };
      };
      Index.set(L);
      return Result;
    };
    this.IndexOf = function (S) {
      var Result = 0;
      if (!this.GetSorted()) {
        Result = $mod.TStrings.IndexOf.call(this,S)}
       else if (!this.Find(S,{get: function () {
          return Result;
        }, set: function (v) {
          Result = v;
        }})) Result = -1;
      return Result;
    };
    this.Insert = function (Index, S) {
      if (this.FSortStyle === 2) {
        this.Error(rtl.getResStr(pas.RTLConsts,"SSortedListError"),0)}
       else {
        if ((Index < 0) || (Index > this.FCount)) this.Error(rtl.getResStr(pas.RTLConsts,"SListIndexError"),Index);
        this.InsertItem(Index,S);
      };
    };
    this.Sort = function () {
      this.CustomSort($impl.StringListAnsiCompare);
    };
    this.CustomSort = function (CompareFn) {
      if ((this.FForceSort || !(this.FSortStyle === 2)) && (this.FCount > 1)) {
        this.Changing();
        this.QuickSort(0,this.FCount - 1,CompareFn);
        this.Changed();
      };
    };
  });
  this.$rtti.$Class("TCollection");
  rtl.createClass(this,"TCollectionItem",this.TPersistent,function () {
    this.$init = function () {
      $mod.TPersistent.$init.call(this);
      this.FCollection = null;
      this.FID = 0;
      this.FUpdateCount = 0;
    };
    this.$final = function () {
      this.FCollection = undefined;
      $mod.TPersistent.$final.call(this);
    };
    this.GetIndex = function () {
      var Result = 0;
      if (this.FCollection != null) {
        Result = this.FCollection.FItems.IndexOf(this)}
       else Result = -1;
      return Result;
    };
    this.SetCollection = function (Value) {
      if (Value !== this.FCollection) {
        if (this.FCollection != null) this.FCollection.RemoveItem(this);
        if (Value != null) Value.InsertItem(this);
      };
    };
    this.Changed = function (AllItems) {
      if ((this.FCollection !== null) && (this.FCollection.FUpdateCount === 0)) {
        if (AllItems) {
          this.FCollection.Update(null)}
         else this.FCollection.Update(this);
      };
    };
    this.GetOwner = function () {
      var Result = null;
      Result = this.FCollection;
      return Result;
    };
    this.GetDisplayName = function () {
      var Result = "";
      Result = this.$classname;
      return Result;
    };
    this.SetIndex = function (Value) {
      var Temp = 0;
      Temp = this.GetIndex();
      if ((Temp > -1) && (Temp !== Value)) {
        this.FCollection.FItems.Move(Temp,Value);
        this.Changed(true);
      };
    };
    this.SetDisplayName = function (Value) {
      this.Changed(false);
      if (Value === "") ;
    };
    this.Create$1 = function (ACollection) {
      pas.System.TObject.Create.call(this);
      this.SetCollection(ACollection);
      return this;
    };
    this.Destroy = function () {
      this.SetCollection(null);
      pas.System.TObject.Destroy.call(this);
    };
    this.GetNamePath = function () {
      var Result = "";
      if (this.FCollection !== null) {
        Result = this.FCollection.GetNamePath() + "[" + pas.SysUtils.IntToStr(this.GetIndex()) + "]"}
       else Result = this.$classname;
      return Result;
    };
  });
  rtl.createClass(this,"TCollectionEnumerator",pas.System.TObject,function () {
    this.$init = function () {
      pas.System.TObject.$init.call(this);
      this.FCollection = null;
      this.FPosition = 0;
    };
    this.$final = function () {
      this.FCollection = undefined;
      pas.System.TObject.$final.call(this);
    };
    this.Create$1 = function (ACollection) {
      pas.System.TObject.Create.call(this);
      this.FCollection = ACollection;
      this.FPosition = -1;
      return this;
    };
    this.GetCurrent = function () {
      var Result = null;
      Result = this.FCollection.GetItem(this.FPosition);
      return Result;
    };
    this.MoveNext = function () {
      var Result = false;
      this.FPosition += 1;
      Result = this.FPosition < this.FCollection.GetCount();
      return Result;
    };
  });
  this.$rtti.$ClassRef("TCollectionItemClass",{instancetype: this.$rtti["TCollectionItem"]});
  this.TCollectionNotification = {"0": "cnAdded", cnAdded: 0, "1": "cnExtracting", cnExtracting: 1, "2": "cnDeleting", cnDeleting: 2};
  this.$rtti.$Enum("TCollectionNotification",{minvalue: 0, maxvalue: 2, ordtype: 1, enumtype: this.TCollectionNotification});
  this.$rtti.$ProcVar("TCollectionSortCompare",{procsig: rtl.newTIProcSig([["Item1",this.$rtti["TCollectionItem"]],["Item2",this.$rtti["TCollectionItem"]]],rtl.longint)});
  this.$rtti.$RefToProcVar("TCollectionSortCompareFunc",{procsig: rtl.newTIProcSig([["Item1",this.$rtti["TCollectionItem"]],["Item2",this.$rtti["TCollectionItem"]]],rtl.longint)});
  rtl.createClass(this,"TCollection",this.TPersistent,function () {
    this.$init = function () {
      $mod.TPersistent.$init.call(this);
      this.FItemClass = null;
      this.FItems = null;
      this.FUpdateCount = 0;
      this.FNextID = 0;
      this.FPropName = "";
    };
    this.$final = function () {
      this.FItemClass = undefined;
      this.FItems = undefined;
      $mod.TPersistent.$final.call(this);
    };
    this.GetCount = function () {
      var Result = 0;
      Result = this.FItems.FCount;
      return Result;
    };
    this.GetPropName = function () {
      var Result = "";
      Result = this.FPropName;
      this.SetPropName();
      Result = this.FPropName;
      return Result;
    };
    this.InsertItem = function (Item) {
      if (!this.FItemClass.isPrototypeOf(Item)) return;
      this.FItems.Add(Item);
      Item.FCollection = this;
      Item.FID = this.FNextID;
      this.FNextID += 1;
      this.SetItemName(Item);
      this.Notify(Item,0);
      this.Changed();
    };
    this.RemoveItem = function (Item) {
      var I = 0;
      this.Notify(Item,1);
      I = this.FItems.IndexOfItem(Item,1);
      if (I !== -1) this.FItems.Delete(I);
      Item.FCollection = null;
      this.Changed();
    };
    this.DoClear = function () {
      var Item = null;
      while (this.FItems.FCount > 0) {
        Item = rtl.getObject(this.FItems.Last());
        if (Item != null) Item.$destroy("Destroy");
      };
    };
    this.GetAttrCount = function () {
      var Result = 0;
      Result = 0;
      return Result;
    };
    this.GetAttr = function (Index) {
      var Result = "";
      Result = "";
      if (Index === 0) ;
      return Result;
    };
    this.GetItemAttr = function (Index, ItemIndex) {
      var Result = "";
      Result = rtl.getObject(this.FItems.Get(ItemIndex)).GetDisplayName();
      if (Index === 0) ;
      return Result;
    };
    this.Changed = function () {
      if (this.FUpdateCount === 0) this.Update(null);
    };
    this.GetItem = function (Index) {
      var Result = null;
      Result = rtl.getObject(this.FItems.Get(Index));
      return Result;
    };
    this.SetItem = function (Index, Value) {
      rtl.getObject(this.FItems.Get(Index)).Assign(Value);
    };
    this.SetItemName = function (Item) {
      if (Item === null) ;
    };
    this.SetPropName = function () {
      this.FPropName = "";
    };
    this.Update = function (Item) {
      if (Item === null) ;
    };
    this.Notify = function (Item, Action) {
      if (Item === null) ;
      if (Action === 0) ;
    };
    this.Create$1 = function (AItemClass) {
      pas.System.TObject.Create.call(this);
      this.FItemClass = AItemClass;
      this.FItems = $mod.TFPList.$create("Create");
      return this;
    };
    this.Destroy = function () {
      this.FUpdateCount = 1;
      try {
        this.DoClear();
      } finally {
        this.FUpdateCount = 0;
      };
      if (this.FItems != null) this.FItems.$destroy("Destroy");
      pas.System.TObject.Destroy.call(this);
    };
    this.Owner = function () {
      var Result = null;
      Result = this.GetOwner();
      return Result;
    };
    this.Add = function () {
      var Result = null;
      Result = this.FItemClass.$create("Create$1",[this]);
      return Result;
    };
    this.Assign = function (Source) {
      var I = 0;
      if ($mod.TCollection.isPrototypeOf(Source)) {
        this.Clear();
        for (var $l = 0, $end = Source.GetCount() - 1; $l <= $end; $l++) {
          I = $l;
          this.Add().Assign(Source.GetItem(I));
        };
        return;
      } else $mod.TPersistent.Assign.call(this,Source);
    };
    this.BeginUpdate = function () {
      this.FUpdateCount += 1;
    };
    this.Clear = function () {
      if (this.FItems.FCount === 0) return;
      this.BeginUpdate();
      try {
        this.DoClear();
      } finally {
        this.EndUpdate();
      };
    };
    this.EndUpdate = function () {
      if (this.FUpdateCount > 0) this.FUpdateCount -= 1;
      if (this.FUpdateCount === 0) this.Changed();
    };
    this.Delete = function (Index) {
      var Item = null;
      Item = rtl.getObject(this.FItems.Get(Index));
      this.Notify(Item,2);
      if (Item != null) Item.$destroy("Destroy");
    };
    this.GetEnumerator = function () {
      var Result = null;
      Result = $mod.TCollectionEnumerator.$create("Create$1",[this]);
      return Result;
    };
    this.GetNamePath = function () {
      var Result = "";
      var o = null;
      o = this.GetOwner();
      if ((o != null) && (this.GetPropName() !== "")) {
        Result = o.GetNamePath() + "." + this.GetPropName()}
       else Result = this.$classname;
      return Result;
    };
    this.Insert = function (Index) {
      var Result = null;
      Result = this.Add();
      Result.SetIndex(Index);
      return Result;
    };
    this.FindItemID = function (ID) {
      var Result = null;
      var I = 0;
      for (var $l = 0, $end = this.FItems.FCount - 1; $l <= $end; $l++) {
        I = $l;
        Result = rtl.getObject(this.FItems.Get(I));
        if (Result.FID === ID) return Result;
      };
      Result = null;
      return Result;
    };
    this.Exchange = function (Index1, index2) {
      this.FItems.Exchange(Index1,index2);
    };
    this.Sort = function (Compare) {
      this.BeginUpdate();
      try {
        this.FItems.Sort(Compare);
      } finally {
        this.EndUpdate();
      };
    };
    this.SortList = function (Compare) {
      this.BeginUpdate();
      try {
        this.FItems.SortList(Compare);
      } finally {
        this.EndUpdate();
      };
    };
  });
  rtl.createClass(this,"TOwnedCollection",this.TCollection,function () {
    this.$init = function () {
      $mod.TCollection.$init.call(this);
      this.FOwner = null;
    };
    this.$final = function () {
      this.FOwner = undefined;
      $mod.TCollection.$final.call(this);
    };
    this.GetOwner = function () {
      var Result = null;
      Result = this.FOwner;
      return Result;
    };
    this.Create$2 = function (AOwner, AItemClass) {
      this.FOwner = AOwner;
      $mod.TCollection.Create$1.call(this,AItemClass);
      return this;
    };
  });
  this.$rtti.$Class("TComponent");
  this.TOperation = {"0": "opInsert", opInsert: 0, "1": "opRemove", opRemove: 1};
  this.$rtti.$Enum("TOperation",{minvalue: 0, maxvalue: 1, ordtype: 1, enumtype: this.TOperation});
  this.TComponentStateItem = {"0": "csLoading", csLoading: 0, "1": "csReading", csReading: 1, "2": "csWriting", csWriting: 2, "3": "csDestroying", csDestroying: 3, "4": "csDesigning", csDesigning: 4, "5": "csAncestor", csAncestor: 5, "6": "csUpdating", csUpdating: 6, "7": "csFixups", csFixups: 7, "8": "csFreeNotification", csFreeNotification: 8, "9": "csInline", csInline: 9, "10": "csDesignInstance", csDesignInstance: 10};
  this.$rtti.$Enum("TComponentStateItem",{minvalue: 0, maxvalue: 10, ordtype: 1, enumtype: this.TComponentStateItem});
  this.$rtti.$Set("TComponentState",{comptype: this.$rtti["TComponentStateItem"]});
  this.TComponentStyleItem = {"0": "csInheritable", csInheritable: 0, "1": "csCheckPropAvail", csCheckPropAvail: 1, "2": "csSubComponent", csSubComponent: 2, "3": "csTransient", csTransient: 3};
  this.$rtti.$Enum("TComponentStyleItem",{minvalue: 0, maxvalue: 3, ordtype: 1, enumtype: this.TComponentStyleItem});
  this.$rtti.$Set("TComponentStyle",{comptype: this.$rtti["TComponentStyleItem"]});
  this.$rtti.$MethodVar("TGetChildProc",{procsig: rtl.newTIProcSig([["Child",this.$rtti["TComponent"]]]), methodkind: 0});
  rtl.createClass(this,"TComponentEnumerator",pas.System.TObject,function () {
    this.$init = function () {
      pas.System.TObject.$init.call(this);
      this.FComponent = null;
      this.FPosition = 0;
    };
    this.$final = function () {
      this.FComponent = undefined;
      pas.System.TObject.$final.call(this);
    };
    this.Create$1 = function (AComponent) {
      pas.System.TObject.Create.call(this);
      this.FComponent = AComponent;
      this.FPosition = -1;
      return this;
    };
    this.GetCurrent = function () {
      var Result = null;
      Result = this.FComponent.GetComponent(this.FPosition);
      return Result;
    };
    this.MoveNext = function () {
      var Result = false;
      this.FPosition += 1;
      Result = this.FPosition < this.FComponent.GetComponentCount();
      return Result;
    };
  });
  rtl.createClass(this,"TComponent",this.TPersistent,function () {
    this.$init = function () {
      $mod.TPersistent.$init.call(this);
      this.FOwner = null;
      this.FName = "";
      this.FTag = 0;
      this.FComponents = null;
      this.FFreeNotifies = null;
      this.FDesignInfo = 0;
      this.FComponentState = {};
      this.FComponentStyle = {};
    };
    this.$final = function () {
      this.FOwner = undefined;
      this.FComponents = undefined;
      this.FFreeNotifies = undefined;
      this.FComponentState = undefined;
      this.FComponentStyle = undefined;
      $mod.TPersistent.$final.call(this);
    };
    this.GetComponent = function (AIndex) {
      var Result = null;
      if (!(this.FComponents != null)) {
        Result = null}
       else Result = rtl.getObject(this.FComponents.Get(AIndex));
      return Result;
    };
    this.GetComponentCount = function () {
      var Result = 0;
      if (!(this.FComponents != null)) {
        Result = 0}
       else Result = this.FComponents.FCount;
      return Result;
    };
    this.GetComponentIndex = function () {
      var Result = 0;
      if ((this.FOwner != null) && (this.FOwner.FComponents != null)) {
        Result = this.FOwner.FComponents.IndexOf(this)}
       else Result = -1;
      return Result;
    };
    this.Insert = function (AComponent) {
      if (!(this.FComponents != null)) this.FComponents = $mod.TFPList.$create("Create");
      this.FComponents.Add(AComponent);
      AComponent.FOwner = this;
    };
    this.ReadLeft = function (AReader) {
      this.FDesignInfo = (this.FDesignInfo & 0xffff0000) | (AReader.ReadInteger() & 0xffff);
    };
    this.ReadTop = function (AReader) {
      this.FDesignInfo = ((AReader.ReadInteger() & 0xffff) << 16) | (this.FDesignInfo & 0xffff);
    };
    this.Remove = function (AComponent) {
      AComponent.FOwner = null;
      if (this.FComponents != null) {
        this.FComponents.Remove(AComponent);
        if (this.FComponents.FCount === 0) {
          this.FComponents.$destroy("Destroy");
          this.FComponents = null;
        };
      };
    };
    this.RemoveNotification = function (AComponent) {
      if (this.FFreeNotifies !== null) {
        this.FFreeNotifies.Remove(AComponent);
        if (this.FFreeNotifies.FCount === 0) {
          this.FFreeNotifies.$destroy("Destroy");
          this.FFreeNotifies = null;
          this.FComponentState = rtl.excludeSet(this.FComponentState,8);
        };
      };
    };
    this.SetComponentIndex = function (Value) {
      var Temp = 0;
      var Count = 0;
      if (!(this.FOwner != null)) return;
      Temp = this.GetComponentIndex();
      if (Temp < 0) return;
      if (Value < 0) Value = 0;
      Count = this.FOwner.FComponents.FCount;
      if (Value >= Count) Value = Count - 1;
      if (Value !== Temp) {
        this.FOwner.FComponents.Delete(Temp);
        this.FOwner.FComponents.Insert(Value,this);
      };
    };
    this.SetReference = function (Enable) {
      var aField = null;
      var aValue = null;
      var aOwner = null;
      if (this.FName === "") return;
      if (this.FOwner != null) {
        aOwner = this.FOwner;
        aField = this.FOwner.$class.FieldAddress(this.FName);
        if (aField != null) {
          if (Enable) {
            aValue = this}
           else aValue = null;
          aOwner["" + aField["name"]] = aValue;
        };
      };
    };
    this.WriteLeft = function (AWriter) {
      AWriter.WriteInteger(this.FDesignInfo & 0xffff);
    };
    this.WriteTop = function (AWriter) {
      AWriter.WriteInteger((this.FDesignInfo >>> 16) & 0xffff);
    };
    this.ChangeName = function (NewName) {
      this.FName = NewName;
    };
    this.DefineProperties = function (Filer) {
      var Temp = 0;
      var Ancestor = null;
      Ancestor = Filer.FAncestor;
      if (Ancestor != null) {
        Temp = Ancestor.FDesignInfo}
       else Temp = 0;
      Filer.DefineProperty("Left",rtl.createCallback(this,"ReadLeft"),rtl.createCallback(this,"WriteLeft"),(this.FDesignInfo & 0xffff) !== (Temp & 0xffff));
      Filer.DefineProperty("Top",rtl.createCallback(this,"ReadTop"),rtl.createCallback(this,"WriteTop"),(this.FDesignInfo & 0xffff0000) !== (Temp & 0xffff0000));
    };
    this.GetChildren = function (Proc, Root) {
      if (Proc === null) ;
      if (Root === null) ;
    };
    this.GetChildOwner = function () {
      var Result = null;
      Result = null;
      return Result;
    };
    this.GetChildParent = function () {
      var Result = null;
      Result = this;
      return Result;
    };
    this.GetOwner = function () {
      var Result = null;
      Result = this.FOwner;
      return Result;
    };
    this.Loaded = function () {
      this.FComponentState = rtl.excludeSet(this.FComponentState,0);
    };
    this.Loading = function () {
      this.FComponentState = rtl.includeSet(this.FComponentState,0);
    };
    this.SetWriting = function (Value) {
      if (Value) {
        this.FComponentState = rtl.includeSet(this.FComponentState,2)}
       else this.FComponentState = rtl.excludeSet(this.FComponentState,2);
    };
    this.SetReading = function (Value) {
      if (Value) {
        this.FComponentState = rtl.includeSet(this.FComponentState,1)}
       else this.FComponentState = rtl.excludeSet(this.FComponentState,1);
    };
    this.Notification = function (AComponent, Operation) {
      var C = 0;
      if (Operation === 1) this.RemoveFreeNotification(AComponent);
      if (!(this.FComponents != null)) return;
      C = this.FComponents.FCount - 1;
      while (C >= 0) {
        rtl.getObject(this.FComponents.Get(C)).Notification(AComponent,Operation);
        C -= 1;
        if (C >= this.FComponents.FCount) C = this.FComponents.FCount - 1;
      };
    };
    this.PaletteCreated = function () {
    };
    this.ReadState = function (Reader) {
      Reader.ReadData(this);
    };
    this.SetAncestor = function (Value) {
      var Runner = 0;
      if (Value) {
        this.FComponentState = rtl.includeSet(this.FComponentState,5)}
       else this.FComponentState = rtl.excludeSet(this.FComponentState,5);
      if (this.FComponents != null) for (var $l = 0, $end = this.FComponents.FCount - 1; $l <= $end; $l++) {
        Runner = $l;
        rtl.getObject(this.FComponents.Get(Runner)).SetAncestor(Value);
      };
    };
    this.SetDesigning = function (Value, SetChildren) {
      var Runner = 0;
      if (Value) {
        this.FComponentState = rtl.includeSet(this.FComponentState,4)}
       else this.FComponentState = rtl.excludeSet(this.FComponentState,4);
      if ((this.FComponents != null) && SetChildren) for (var $l = 0, $end = this.FComponents.FCount - 1; $l <= $end; $l++) {
        Runner = $l;
        rtl.getObject(this.FComponents.Get(Runner)).SetDesigning(Value,true);
      };
    };
    this.SetDesignInstance = function (Value) {
      if (Value) {
        this.FComponentState = rtl.includeSet(this.FComponentState,10)}
       else this.FComponentState = rtl.excludeSet(this.FComponentState,10);
    };
    this.SetInline = function (Value) {
      if (Value) {
        this.FComponentState = rtl.includeSet(this.FComponentState,9)}
       else this.FComponentState = rtl.excludeSet(this.FComponentState,9);
    };
    this.SetName = function (NewName) {
      if (this.FName === NewName) return;
      if ((NewName !== "") && !pas.SysUtils.IsValidIdent(NewName,false,false)) throw $mod.EComponentError.$create("CreateFmt",[rtl.getResStr(pas.RTLConsts,"SInvalidName"),pas.System.VarRecs(18,NewName)]);
      if (this.FOwner != null) {
        this.FOwner.ValidateRename(this,this.FName,NewName)}
       else this.ValidateRename(null,this.FName,NewName);
      this.SetReference(false);
      this.ChangeName(NewName);
      this.SetReference(true);
    };
    this.SetChildOrder = function (Child, Order) {
      if (Child === null) ;
      if (Order === 0) ;
    };
    this.SetParentComponent = function (Value) {
      if (Value === null) ;
    };
    this.Updating = function () {
      this.FComponentState = rtl.includeSet(this.FComponentState,6);
    };
    this.Updated = function () {
      this.FComponentState = rtl.excludeSet(this.FComponentState,6);
    };
    this.ValidateRename = function (AComponent, CurName, NewName) {
      if ((AComponent !== null) && (pas.SysUtils.CompareText(CurName,NewName) !== 0) && (AComponent.FOwner === this) && (this.FindComponent(NewName) !== null)) throw $mod.EComponentError.$create("CreateFmt",[rtl.getResStr(pas.RTLConsts,"SDuplicateName"),pas.System.VarRecs(18,NewName)]);
      if ((4 in this.FComponentState) && (this.FOwner !== null)) this.FOwner.ValidateRename(AComponent,CurName,NewName);
    };
    this.ValidateContainer = function (AComponent) {
      AComponent.ValidateInsert(this);
    };
    this.ValidateInsert = function (AComponent) {
      if (AComponent === null) ;
    };
    this._AddRef = function () {
      var Result = 0;
      Result = -1;
      return Result;
    };
    this._Release = function () {
      var Result = 0;
      Result = -1;
      return Result;
    };
    this.Create$1 = function (AOwner) {
      this.FComponentStyle = rtl.createSet(0);
      if (AOwner != null) AOwner.InsertComponent(this);
      return this;
    };
    this.Destroy = function () {
      var I = 0;
      var C = null;
      this.Destroying();
      if (this.FFreeNotifies != null) {
        I = this.FFreeNotifies.FCount - 1;
        while (I >= 0) {
          C = rtl.getObject(this.FFreeNotifies.Get(I));
          this.FFreeNotifies.Delete(I);
          C.Notification(this,1);
          if (this.FFreeNotifies === null) {
            I = 0}
           else if (I > this.FFreeNotifies.FCount) I = this.FFreeNotifies.FCount;
          I -= 1;
        };
        pas.SysUtils.FreeAndNil({p: this, get: function () {
            return this.p.FFreeNotifies;
          }, set: function (v) {
            this.p.FFreeNotifies = v;
          }});
      };
      this.DestroyComponents();
      if (this.FOwner !== null) this.FOwner.RemoveComponent(this);
      pas.System.TObject.Destroy.call(this);
    };
    this.BeforeDestruction = function () {
      if (!(3 in this.FComponentState)) this.Destroying();
    };
    this.DestroyComponents = function () {
      var acomponent = null;
      while (this.FComponents != null) {
        acomponent = rtl.getObject(this.FComponents.Last());
        this.Remove(acomponent);
        acomponent.$destroy("Destroy");
      };
    };
    this.Destroying = function () {
      var Runner = 0;
      if (3 in this.FComponentState) return;
      this.FComponentState = rtl.includeSet(this.FComponentState,3);
      if (this.FComponents != null) for (var $l = 0, $end = this.FComponents.FCount - 1; $l <= $end; $l++) {
        Runner = $l;
        rtl.getObject(this.FComponents.Get(Runner)).Destroying();
      };
    };
    this.QueryInterface = function (IID, Obj) {
      var Result = 0;
      if (this.GetInterface(IID,Obj)) {
        Result = 0}
       else Result = -2147467262;
      return Result;
    };
    this.WriteState = function (Writer) {
      Writer.WriteComponentData(this);
    };
    this.FindComponent = function (AName) {
      var Result = null;
      var I = 0;
      Result = null;
      if ((AName === "") || !(this.FComponents != null)) return Result;
      for (var $l = 0, $end = this.FComponents.FCount - 1; $l <= $end; $l++) {
        I = $l;
        if (pas.SysUtils.CompareText(rtl.getObject(this.FComponents.Get(I)).FName,AName) === 0) {
          Result = rtl.getObject(this.FComponents.Get(I));
          return Result;
        };
      };
      return Result;
    };
    this.FreeNotification = function (AComponent) {
      if ((this.FOwner !== null) && (AComponent === this.FOwner)) return;
      if (!(this.FFreeNotifies != null)) this.FFreeNotifies = $mod.TFPList.$create("Create");
      if (this.FFreeNotifies.IndexOf(AComponent) === -1) {
        this.FFreeNotifies.Add(AComponent);
        AComponent.FreeNotification(this);
      };
    };
    this.RemoveFreeNotification = function (AComponent) {
      this.RemoveNotification(AComponent);
      AComponent.RemoveNotification(this);
    };
    this.GetNamePath = function () {
      var Result = "";
      Result = this.FName;
      return Result;
    };
    this.GetParentComponent = function () {
      var Result = null;
      Result = null;
      return Result;
    };
    this.HasParent = function () {
      var Result = false;
      Result = false;
      return Result;
    };
    this.InsertComponent = function (AComponent) {
      AComponent.ValidateContainer(this);
      this.ValidateRename(AComponent,"",AComponent.FName);
      if (AComponent.FOwner !== null) AComponent.FOwner.RemoveComponent(AComponent);
      this.Insert(AComponent);
      if (4 in this.FComponentState) AComponent.SetDesigning(true,true);
      this.Notification(AComponent,0);
    };
    this.RemoveComponent = function (AComponent) {
      this.Notification(AComponent,1);
      this.Remove(AComponent);
      AComponent.SetDesigning(false,true);
      this.ValidateRename(AComponent,AComponent.FName,"");
    };
    this.SetSubComponent = function (ASubComponent) {
      if (ASubComponent) {
        this.FComponentStyle = rtl.includeSet(this.FComponentStyle,2)}
       else this.FComponentStyle = rtl.excludeSet(this.FComponentStyle,2);
    };
    this.GetEnumerator = function () {
      var Result = null;
      Result = $mod.TComponentEnumerator.$create("Create$1",[this]);
      return Result;
    };
    rtl.addIntf(this,pas.System.IUnknown);
    var $r = this.$rtti;
    $r.addProperty("Name",6,rtl.string,"FName","SetName");
    $r.addProperty("Tag",0,rtl.nativeint,"FTag","FTag",{Default: 0});
  });
  this.$rtti.$ClassRef("TComponentClass",{instancetype: this.$rtti["TComponent"]});
  this.TSeekOrigin = {"0": "soBeginning", soBeginning: 0, "1": "soCurrent", soCurrent: 1, "2": "soEnd", soEnd: 2};
  this.$rtti.$Enum("TSeekOrigin",{minvalue: 0, maxvalue: 2, ordtype: 1, enumtype: this.TSeekOrigin});
  rtl.createClass(this,"TStream",pas.System.TObject,function () {
    this.$init = function () {
      pas.System.TObject.$init.call(this);
      this.FEndian = 0;
    };
    this.MakeInt = function (B, aSize, Signed) {
      var Result = 0;
      var Mem = null;
      var A = null;
      var D = null;
      var isLittle = false;
      isLittle = this.FEndian === 0;
      Mem = new ArrayBuffer(rtl.length(B));
      A = new Uint8Array(Mem);
      A.set(B);
      D = new DataView(Mem);
      if (Signed) {
        var $tmp = aSize;
        if ($tmp === 1) {
          Result = D.getInt8(0)}
         else if ($tmp === 2) {
          Result = D.getInt16(0,isLittle)}
         else if ($tmp === 4) {
          Result = D.getInt32(0,isLittle)}
         else if ($tmp === 8) Result = Math.round(D.getFloat64(0,isLittle));
      } else {
        var $tmp1 = aSize;
        if ($tmp1 === 1) {
          Result = D.getUint8(0)}
         else if ($tmp1 === 2) {
          Result = D.getUint16(0,isLittle)}
         else if ($tmp1 === 4) {
          Result = D.getUint32(0,isLittle)}
         else if ($tmp1 === 8) Result = Math.round(D.getFloat64(0,isLittle));
      };
      return Result;
    };
    this.MakeBytes = function (B, aSize, Signed) {
      var Result = [];
      var Mem = null;
      var A = null;
      var D = null;
      var isLittle = false;
      isLittle = this.FEndian === 0;
      Mem = new ArrayBuffer(aSize);
      D = new DataView(Mem);
      if (Signed) {
        var $tmp = aSize;
        if ($tmp === 1) {
          D.setInt8(0,B)}
         else if ($tmp === 2) {
          D.setInt16(0,B,isLittle)}
         else if ($tmp === 4) {
          D.setInt32(0,B,isLittle)}
         else if ($tmp === 8) D.setFloat64(0,B,isLittle);
      } else {
        var $tmp1 = aSize;
        if ($tmp1 === 1) {
          D.setUint8(0,B)}
         else if ($tmp1 === 2) {
          D.setUint16(0,B,isLittle)}
         else if ($tmp1 === 4) {
          D.setUint32(0,B,isLittle)}
         else if ($tmp1 === 8) D.setFloat64(0,B,isLittle);
      };
      Result = rtl.arraySetLength(Result,0,aSize);
      A = new Uint8Array(Mem);
      Result = $mod.TMemoryStream.MemoryToBytes$1(A);
      return Result;
    };
    this.InvalidSeek = function () {
      throw $mod.EStreamError.$create("CreateFmt",[rtl.getResStr($mod,"SStreamInvalidSeek"),pas.System.VarRecs(18,this.$classname)]);
    };
    var CSmallSize = 255;
    var CLargeMaxBuffer = 32 * 1024;
    this.Discard = function (Count) {
      var Buffer = [];
      if (Count === 0) return;
      if (Count <= 255) {
        Buffer = rtl.arraySetLength(Buffer,0,255);
        this.ReadBuffer({get: function () {
            return Buffer;
          }, set: function (v) {
            Buffer = v;
          }},Count);
      } else this.DiscardLarge(Count,32768);
    };
    this.DiscardLarge = function (Count, MaxBufferSize) {
      var Buffer = [];
      if (Count === 0) return;
      if (Count > MaxBufferSize) {
        Buffer = rtl.arraySetLength(Buffer,0,MaxBufferSize)}
       else Buffer = rtl.arraySetLength(Buffer,0,Count);
      while (Count >= rtl.length(Buffer)) {
        this.ReadBuffer({get: function () {
            return Buffer;
          }, set: function (v) {
            Buffer = v;
          }},rtl.length(Buffer));
        Count -= rtl.length(Buffer);
      };
      if (Count > 0) this.ReadBuffer({get: function () {
          return Buffer;
        }, set: function (v) {
          Buffer = v;
        }},Count);
    };
    this.FakeSeekForward = function (Offset, Origin, Pos) {
      if (Origin === 0) Offset -= Pos;
      if ((Offset < 0) || (Origin === 2)) this.InvalidSeek();
      if (Offset > 0) this.Discard(Offset);
    };
    this.GetPosition = function () {
      var Result = 0;
      Result = this.Seek(0,1);
      return Result;
    };
    this.SetPosition = function (Pos) {
      this.Seek(Pos,0);
    };
    this.GetSize = function () {
      var Result = 0;
      var p = 0;
      p = this.Seek(0,1);
      Result = this.Seek(0,2);
      this.Seek(p,0);
      return Result;
    };
    this.SetSize = function (NewSize) {
      if (NewSize < 0) throw $mod.EStreamError.$create("Create$1",[rtl.getResStr($mod,"SerrInvalidStreamSize")]);
    };
    this.SetSize64 = function (NewSize) {
      this.SetSize(NewSize);
    };
    this.ReadNotImplemented = function () {
      throw $mod.EStreamError.$create("CreateFmt",[rtl.getResStr($mod,"SStreamNoReading"),pas.System.VarRecs(18,this.$classname)]);
    };
    this.WriteNotImplemented = function () {
      throw $mod.EStreamError.$create("CreateFmt",[rtl.getResStr($mod,"SStreamNoWriting"),pas.System.VarRecs(18,this.$classname)]);
    };
    this.ReadMaxSizeData = function (Buffer, aSize, aCount) {
      var Result = 0;
      var CP = 0;
      if (aCount <= aSize) {
        Result = this.Read({get: function () {
            return Buffer;
          }, set: function (v) {
            Buffer = v;
          }},aCount)}
       else {
        Result = this.Read({get: function () {
            return Buffer;
          }, set: function (v) {
            Buffer = v;
          }},aSize);
        CP = this.GetPosition();
        Result = (Result + this.Seek(aCount - aSize,1)) - CP;
      };
      return Result;
    };
    this.ReadExactSizeData = function (Buffer, aSize, aCount) {
      if (this.ReadMaxSizeData(rtl.arrayRef(Buffer),aSize,aCount) !== aCount) throw $mod.EReadError.$create("Create$1",[rtl.getResStr($mod,"SReadError")]);
    };
    this.WriteMaxSizeData = function (Buffer, aSize, aCount) {
      var Result = 0;
      var CP = 0;
      if (aCount <= aSize) {
        Result = this.Write(Buffer,aCount)}
       else {
        Result = this.Write(Buffer,aSize);
        CP = this.GetPosition();
        Result = (Result + this.Seek(aCount - aSize,1)) - CP;
      };
      return Result;
    };
    this.WriteExactSizeData = function (Buffer, aSize, aCount) {
      this.WriteMaxSizeData(Buffer,aSize,aCount);
    };
    this.Read = function (Buffer, Count) {
      var Result = 0;
      Result = this.Read$1(rtl.arrayRef(Buffer.get()),0,Count);
      return Result;
    };
    this.Write = function (Buffer, Count) {
      var Result = 0;
      Result = this.Write$1(Buffer,0,Count);
      return Result;
    };
    this.ReadData = function (Buffer, Count) {
      var Result = 0;
      Result = this.Read$1(rtl.arrayRef(Buffer),0,Count);
      return Result;
    };
    this.ReadData$1 = function (Buffer) {
      var Result = 0;
      var B = 0;
      Result = this.ReadData$8({get: function () {
          return B;
        }, set: function (v) {
          B = v;
        }},1);
      if (Result === 1) Buffer.set(B !== 0);
      return Result;
    };
    this.ReadData$2 = function (Buffer, Count) {
      var Result = 0;
      var B = [];
      B = rtl.arraySetLength(B,0,Count);
      Result = this.ReadMaxSizeData(rtl.arrayRef(B),1,Count);
      if (Result > 0) Buffer.set(B[0] !== 0);
      return Result;
    };
    this.ReadData$3 = function (Buffer) {
      var Result = 0;
      Result = this.ReadData$4(Buffer,2);
      return Result;
    };
    this.ReadData$4 = function (Buffer, Count) {
      var Result = 0;
      var W = 0;
      Result = this.ReadData$12({get: function () {
          return W;
        }, set: function (v) {
          W = v;
        }},Count);
      if (Result === 2) Buffer.set(String.fromCharCode(W));
      return Result;
    };
    this.ReadData$5 = function (Buffer) {
      var Result = 0;
      Result = this.ReadData$6(Buffer,1);
      return Result;
    };
    this.ReadData$6 = function (Buffer, Count) {
      var Result = 0;
      var B = [];
      B = rtl.arraySetLength(B,0,Count);
      Result = this.ReadMaxSizeData(rtl.arrayRef(B),1,Count);
      if (Result >= 1) Buffer.set(this.MakeInt(rtl.arrayRef(B),1,true));
      return Result;
    };
    this.ReadData$7 = function (Buffer) {
      var Result = 0;
      Result = this.ReadData$8(Buffer,1);
      return Result;
    };
    this.ReadData$8 = function (Buffer, Count) {
      var Result = 0;
      var B = [];
      B = rtl.arraySetLength(B,0,Count);
      Result = this.ReadMaxSizeData(rtl.arrayRef(B),1,Count);
      if (Result >= 1) Buffer.set(this.MakeInt(rtl.arrayRef(B),1,false));
      return Result;
    };
    this.ReadData$9 = function (Buffer) {
      var Result = 0;
      Result = this.ReadData$10(Buffer,2);
      return Result;
    };
    this.ReadData$10 = function (Buffer, Count) {
      var Result = 0;
      var B = [];
      B = rtl.arraySetLength(B,0,Count);
      Result = this.ReadMaxSizeData(rtl.arrayRef(B),2,Count);
      if (Result >= 2) Buffer.set(this.MakeInt(rtl.arrayRef(B),2,true));
      return Result;
    };
    this.ReadData$11 = function (Buffer) {
      var Result = 0;
      Result = this.ReadData$12(Buffer,2);
      return Result;
    };
    this.ReadData$12 = function (Buffer, Count) {
      var Result = 0;
      var B = [];
      B = rtl.arraySetLength(B,0,Count);
      Result = this.ReadMaxSizeData(rtl.arrayRef(B),2,Count);
      if (Result >= 2) Buffer.set(this.MakeInt(rtl.arrayRef(B),2,false));
      return Result;
    };
    this.ReadData$13 = function (Buffer) {
      var Result = 0;
      Result = this.ReadData$14(Buffer,4);
      return Result;
    };
    this.ReadData$14 = function (Buffer, Count) {
      var Result = 0;
      var B = [];
      B = rtl.arraySetLength(B,0,Count);
      Result = this.ReadMaxSizeData(rtl.arrayRef(B),4,Count);
      if (Result >= 4) Buffer.set(this.MakeInt(rtl.arrayRef(B),4,true));
      return Result;
    };
    this.ReadData$15 = function (Buffer) {
      var Result = 0;
      Result = this.ReadData$16(Buffer,4);
      return Result;
    };
    this.ReadData$16 = function (Buffer, Count) {
      var Result = 0;
      var B = [];
      B = rtl.arraySetLength(B,0,Count);
      Result = this.ReadMaxSizeData(rtl.arrayRef(B),4,Count);
      if (Result >= 4) Buffer.set(this.MakeInt(rtl.arrayRef(B),4,false));
      return Result;
    };
    this.ReadData$17 = function (Buffer) {
      var Result = 0;
      Result = this.ReadData$18(Buffer,8);
      return Result;
    };
    this.ReadData$18 = function (Buffer, Count) {
      var Result = 0;
      var B = [];
      B = rtl.arraySetLength(B,0,Count);
      Result = this.ReadMaxSizeData(rtl.arrayRef(B),8,8);
      if (Result >= 8) Buffer.set(this.MakeInt(rtl.arrayRef(B),8,true));
      return Result;
    };
    this.ReadData$19 = function (Buffer) {
      var Result = 0;
      Result = this.ReadData$20(Buffer,8);
      return Result;
    };
    this.ReadData$20 = function (Buffer, Count) {
      var Result = 0;
      var B = [];
      var B1 = 0;
      B = rtl.arraySetLength(B,0,Count);
      Result = this.ReadMaxSizeData(rtl.arrayRef(B),4,4);
      if (Result >= 4) {
        B1 = this.MakeInt(rtl.arrayRef(B),4,false);
        Result = Result + this.ReadMaxSizeData(rtl.arrayRef(B),4,4);
        Buffer.set(this.MakeInt(rtl.arrayRef(B),4,false));
        Buffer.set(rtl.or(rtl.shl(Buffer.get(),32),B1));
      };
      return Result;
    };
    this.ReadData$21 = function (Buffer) {
      var Result = 0;
      Result = this.ReadData$22(Buffer,8);
      return Result;
    };
    this.ReadData$22 = function (Buffer, Count) {
      var Result = 0;
      var B = [];
      var Mem = null;
      var A = null;
      var D = null;
      B = rtl.arraySetLength(B,0,Count);
      Result = this.ReadMaxSizeData(rtl.arrayRef(B),8,Count);
      if (Result >= 8) {
        Mem = new ArrayBuffer(8);
        A = new Uint8Array(Mem);
        A.set(B);
        D = new DataView(Mem);
        Buffer.set(D.getFloat64(0));
      };
      return Result;
    };
    this.ReadBuffer = function (Buffer, Count) {
      this.ReadBuffer$1(Buffer,0,Count);
    };
    this.ReadBuffer$1 = function (Buffer, Offset, Count) {
      if (this.Read$1(rtl.arrayRef(Buffer.get()),Offset,Count) !== Count) throw $mod.EStreamError.$create("Create$1",[rtl.getResStr($mod,"SReadError")]);
    };
    this.ReadBufferData = function (Buffer) {
      this.ReadBufferData$1(Buffer,1);
    };
    this.ReadBufferData$1 = function (Buffer, Count) {
      if (this.ReadData$2(Buffer,Count) !== Count) throw $mod.EStreamError.$create("Create$1",[rtl.getResStr($mod,"SReadError")]);
    };
    this.ReadBufferData$2 = function (Buffer) {
      this.ReadBufferData$3(Buffer,2);
    };
    this.ReadBufferData$3 = function (Buffer, Count) {
      if (this.ReadData$4(Buffer,Count) !== Count) throw $mod.EStreamError.$create("Create$1",[rtl.getResStr($mod,"SReadError")]);
    };
    this.ReadBufferData$4 = function (Buffer) {
      this.ReadBufferData$5(Buffer,1);
    };
    this.ReadBufferData$5 = function (Buffer, Count) {
      if (this.ReadData$6(Buffer,Count) !== Count) throw $mod.EStreamError.$create("Create$1",[rtl.getResStr($mod,"SReadError")]);
    };
    this.ReadBufferData$6 = function (Buffer) {
      this.ReadBufferData$7(Buffer,1);
    };
    this.ReadBufferData$7 = function (Buffer, Count) {
      if (this.ReadData$8(Buffer,Count) !== Count) throw $mod.EStreamError.$create("Create$1",[rtl.getResStr($mod,"SReadError")]);
    };
    this.ReadBufferData$8 = function (Buffer) {
      this.ReadBufferData$9(Buffer,2);
    };
    this.ReadBufferData$9 = function (Buffer, Count) {
      if (this.ReadData$10(Buffer,Count) !== Count) throw $mod.EStreamError.$create("Create$1",[rtl.getResStr($mod,"SReadError")]);
    };
    this.ReadBufferData$10 = function (Buffer) {
      this.ReadBufferData$11(Buffer,2);
    };
    this.ReadBufferData$11 = function (Buffer, Count) {
      if (this.ReadData$12(Buffer,Count) !== Count) throw $mod.EStreamError.$create("Create$1",[rtl.getResStr($mod,"SReadError")]);
    };
    this.ReadBufferData$12 = function (Buffer) {
      this.ReadBufferData$13(Buffer,4);
    };
    this.ReadBufferData$13 = function (Buffer, Count) {
      if (this.ReadData$14(Buffer,Count) !== Count) throw $mod.EStreamError.$create("Create$1",[rtl.getResStr($mod,"SReadError")]);
    };
    this.ReadBufferData$14 = function (Buffer) {
      this.ReadBufferData$15(Buffer,4);
    };
    this.ReadBufferData$15 = function (Buffer, Count) {
      if (this.ReadData$16(Buffer,Count) !== Count) throw $mod.EStreamError.$create("Create$1",[rtl.getResStr($mod,"SReadError")]);
    };
    this.ReadBufferData$16 = function (Buffer) {
      this.ReadBufferData$17(Buffer,8);
    };
    this.ReadBufferData$17 = function (Buffer, Count) {
      if (this.ReadData$18(Buffer,Count) !== Count) throw $mod.EStreamError.$create("Create$1",[rtl.getResStr($mod,"SReadError")]);
    };
    this.ReadBufferData$18 = function (Buffer) {
      this.ReadBufferData$19(Buffer,8);
    };
    this.ReadBufferData$19 = function (Buffer, Count) {
      if (this.ReadData$20(Buffer,Count) !== Count) throw $mod.EStreamError.$create("Create$1",[rtl.getResStr($mod,"SReadError")]);
    };
    this.ReadBufferData$20 = function (Buffer) {
      this.ReadBufferData$21(Buffer,8);
    };
    this.ReadBufferData$21 = function (Buffer, Count) {
      if (this.ReadData$22(Buffer,Count) !== Count) throw $mod.EStreamError.$create("Create$1",[rtl.getResStr($mod,"SReadError")]);
    };
    this.WriteBuffer = function (Buffer, Count) {
      this.WriteBuffer$1(Buffer,0,Count);
    };
    this.WriteBuffer$1 = function (Buffer, Offset, Count) {
      if (this.Write$1(Buffer,Offset,Count) !== Count) throw $mod.EStreamError.$create("Create$1",[rtl.getResStr($mod,"SWriteError")]);
    };
    this.WriteData = function (Buffer, Count) {
      var Result = 0;
      Result = this.Write$1(Buffer,0,Count);
      return Result;
    };
    this.WriteData$1 = function (Buffer) {
      var Result = 0;
      Result = this.WriteData$2(Buffer,1);
      return Result;
    };
    this.WriteData$2 = function (Buffer, Count) {
      var Result = 0;
      var B = 0;
      B = Buffer + 0;
      Result = this.WriteData$6(B,Count);
      return Result;
    };
    this.WriteData$3 = function (Buffer) {
      var Result = 0;
      Result = this.WriteData$4(Buffer,2);
      return Result;
    };
    this.WriteData$4 = function (Buffer, Count) {
      var Result = 0;
      var U = 0;
      U = Buffer.charCodeAt();
      Result = this.WriteData$12(U,Count);
      return Result;
    };
    this.WriteData$5 = function (Buffer) {
      var Result = 0;
      Result = this.WriteData$6(Buffer,1);
      return Result;
    };
    this.WriteData$6 = function (Buffer, Count) {
      var Result = 0;
      Result = this.WriteMaxSizeData(this.MakeBytes(Buffer,1,true),1,Count);
      return Result;
    };
    this.WriteData$7 = function (Buffer) {
      var Result = 0;
      Result = this.WriteData$8(Buffer,1);
      return Result;
    };
    this.WriteData$8 = function (Buffer, Count) {
      var Result = 0;
      Result = this.WriteMaxSizeData(this.MakeBytes(Buffer,1,false),1,Count);
      return Result;
    };
    this.WriteData$9 = function (Buffer) {
      var Result = 0;
      Result = this.WriteData$10(Buffer,2);
      return Result;
    };
    this.WriteData$10 = function (Buffer, Count) {
      var Result = 0;
      Result = this.WriteMaxSizeData(this.MakeBytes(Buffer,2,true),2,Count);
      return Result;
    };
    this.WriteData$11 = function (Buffer) {
      var Result = 0;
      Result = this.WriteData$12(Buffer,2);
      return Result;
    };
    this.WriteData$12 = function (Buffer, Count) {
      var Result = 0;
      Result = this.WriteMaxSizeData(this.MakeBytes(Buffer,2,true),2,Count);
      return Result;
    };
    this.WriteData$13 = function (Buffer) {
      var Result = 0;
      Result = this.WriteData$14(Buffer,4);
      return Result;
    };
    this.WriteData$14 = function (Buffer, Count) {
      var Result = 0;
      Result = this.WriteMaxSizeData(this.MakeBytes(Buffer,4,true),4,Count);
      return Result;
    };
    this.WriteData$15 = function (Buffer) {
      var Result = 0;
      Result = this.WriteData$16(Buffer,4);
      return Result;
    };
    this.WriteData$16 = function (Buffer, Count) {
      var Result = 0;
      Result = this.WriteMaxSizeData(this.MakeBytes(Buffer,4,false),4,Count);
      return Result;
    };
    this.WriteData$17 = function (Buffer) {
      var Result = 0;
      Result = this.WriteData$18(Buffer,8);
      return Result;
    };
    this.WriteData$18 = function (Buffer, Count) {
      var Result = 0;
      Result = this.WriteMaxSizeData(this.MakeBytes(Buffer,8,true),8,Count);
      return Result;
    };
    this.WriteData$19 = function (Buffer) {
      var Result = 0;
      Result = this.WriteData$20(Buffer,8);
      return Result;
    };
    this.WriteData$20 = function (Buffer, Count) {
      var Result = 0;
      Result = this.WriteMaxSizeData(this.MakeBytes(Buffer,8,false),8,Count);
      return Result;
    };
    this.WriteData$21 = function (Buffer) {
      var Result = 0;
      Result = this.WriteData$22(Buffer,8);
      return Result;
    };
    this.WriteData$22 = function (Buffer, Count) {
      var Result = 0;
      var Mem = null;
      var A = null;
      var D = null;
      var B = [];
      var I = 0;
      Mem = new ArrayBuffer(8);
      D = new DataView(Mem);
      D.setFloat64(0,Buffer);
      B = rtl.arraySetLength(B,0,8);
      A = new Uint8Array(Mem);
      for (I = 0; I <= 7; I++) B[I] = A[I];
      Result = this.WriteMaxSizeData(B,8,Count);
      return Result;
    };
    this.WriteBufferData = function (Buffer) {
      this.WriteBufferData$1(Buffer,4);
    };
    this.WriteBufferData$1 = function (Buffer, Count) {
      if (this.WriteData$14(Buffer,Count) !== Count) throw $mod.EStreamError.$create("Create$1",[rtl.getResStr($mod,"SWriteError")]);
    };
    this.WriteBufferData$2 = function (Buffer) {
      this.WriteBufferData$3(Buffer,1);
    };
    this.WriteBufferData$3 = function (Buffer, Count) {
      if (this.WriteData$2(Buffer,Count) !== Count) throw $mod.EStreamError.$create("Create$1",[rtl.getResStr($mod,"SWriteError")]);
    };
    this.WriteBufferData$4 = function (Buffer) {
      this.WriteBufferData$5(Buffer,2);
    };
    this.WriteBufferData$5 = function (Buffer, Count) {
      if (this.WriteData$4(Buffer,Count) !== Count) throw $mod.EStreamError.$create("Create$1",[rtl.getResStr($mod,"SWriteError")]);
    };
    this.WriteBufferData$6 = function (Buffer) {
      this.WriteBufferData$7(Buffer,1);
    };
    this.WriteBufferData$7 = function (Buffer, Count) {
      if (this.WriteData$6(Buffer,Count) !== Count) throw $mod.EStreamError.$create("Create$1",[rtl.getResStr($mod,"SWriteError")]);
    };
    this.WriteBufferData$8 = function (Buffer) {
      this.WriteBufferData$9(Buffer,1);
    };
    this.WriteBufferData$9 = function (Buffer, Count) {
      if (this.WriteData$8(Buffer,Count) !== Count) throw $mod.EStreamError.$create("Create$1",[rtl.getResStr($mod,"SWriteError")]);
    };
    this.WriteBufferData$10 = function (Buffer) {
      this.WriteBufferData$11(Buffer,2);
    };
    this.WriteBufferData$11 = function (Buffer, Count) {
      if (this.WriteData$10(Buffer,Count) !== Count) throw $mod.EStreamError.$create("Create$1",[rtl.getResStr($mod,"SWriteError")]);
    };
    this.WriteBufferData$12 = function (Buffer) {
      this.WriteBufferData$13(Buffer,2);
    };
    this.WriteBufferData$13 = function (Buffer, Count) {
      if (this.WriteData$12(Buffer,Count) !== Count) throw $mod.EStreamError.$create("Create$1",[rtl.getResStr($mod,"SWriteError")]);
    };
    this.WriteBufferData$14 = function (Buffer) {
      this.WriteBufferData$15(Buffer,4);
    };
    this.WriteBufferData$15 = function (Buffer, Count) {
      if (this.WriteData$16(Buffer,Count) !== Count) throw $mod.EStreamError.$create("Create$1",[rtl.getResStr($mod,"SWriteError")]);
    };
    this.WriteBufferData$16 = function (Buffer) {
      this.WriteBufferData$17(Buffer,8);
    };
    this.WriteBufferData$17 = function (Buffer, Count) {
      if (this.WriteData$18(Buffer,Count) !== Count) throw $mod.EStreamError.$create("Create$1",[rtl.getResStr($mod,"SWriteError")]);
    };
    this.WriteBufferData$18 = function (Buffer) {
      this.WriteBufferData$19(Buffer,8);
    };
    this.WriteBufferData$19 = function (Buffer, Count) {
      if (this.WriteData$20(Buffer,Count) !== Count) throw $mod.EStreamError.$create("Create$1",[rtl.getResStr($mod,"SWriteError")]);
    };
    this.WriteBufferData$20 = function (Buffer) {
      this.WriteBufferData$21(Buffer,8);
    };
    this.WriteBufferData$21 = function (Buffer, Count) {
      if (this.WriteData$22(Buffer,Count) !== Count) throw $mod.EStreamError.$create("Create$1",[rtl.getResStr($mod,"SWriteError")]);
    };
    var MaxSize = 0x20000;
    this.CopyFrom = function (Source, Count) {
      var Result = 0;
      var Buffer = [];
      var BufferSize = 0;
      var i = 0;
      Result = 0;
      if (Count === 0) Source.SetPosition(0);
      BufferSize = 131072;
      if ((Count > 0) && (Count < BufferSize)) BufferSize = Count;
      Buffer = rtl.arraySetLength(Buffer,0,BufferSize);
      if (Count === 0) {
        do {
          i = Source.Read({get: function () {
              return Buffer;
            }, set: function (v) {
              Buffer = v;
            }},BufferSize);
          if (i > 0) this.WriteBuffer(Buffer,i);
          Result += i;
        } while (!(i < BufferSize))}
       else while (Count > 0) {
        if (Count > BufferSize) {
          i = BufferSize}
         else i = Count;
        Source.ReadBuffer({get: function () {
            return Buffer;
          }, set: function (v) {
            Buffer = v;
          }},i);
        this.WriteBuffer(Buffer,i);
        Count -= i;
        Result += i;
      };
      return Result;
    };
    this.ReadComponent = function (Instance) {
      var Result = null;
      var Reader = null;
      Reader = $mod.TReader.$create("Create$1",[this]);
      try {
        Result = Reader.ReadRootComponent(Instance);
      } finally {
        Reader = rtl.freeLoc(Reader);
      };
      return Result;
    };
    this.ReadComponentRes = function (Instance) {
      var Result = null;
      this.ReadResHeader();
      Result = this.ReadComponent(Instance);
      return Result;
    };
    this.WriteComponent = function (Instance) {
      this.WriteDescendent(Instance,null);
    };
    this.WriteComponentRes = function (ResName, Instance) {
      this.WriteDescendentRes(ResName,Instance,null);
    };
    this.WriteDescendent = function (Instance, Ancestor) {
      var Driver = null;
      var Writer = null;
      Driver = $mod.TBinaryObjectWriter.$create("Create$1",[this]);
      try {
        Writer = $mod.TWriter.$create("Create$1",[Driver]);
        try {
          Writer.WriteDescendent(Instance,Ancestor);
        } finally {
          Writer.$destroy("Destroy");
        };
      } finally {
        Driver = rtl.freeLoc(Driver);
      };
    };
    this.WriteDescendentRes = function (ResName, Instance, Ancestor) {
      var FixupInfo = 0;
      this.WriteResourceHeader(ResName,{get: function () {
          return FixupInfo;
        }, set: function (v) {
          FixupInfo = v;
        }});
      this.WriteDescendent(Instance,Ancestor);
      this.FixupResourceHeader(FixupInfo);
    };
    this.WriteResourceHeader = function (ResName, FixupInfo) {
      var ResType = 0;
      var Flags = 0;
      var B = 0;
      var I = 0;
      ResType = 0xA;
      Flags = 0x1030;
      this.WriteByte(0xff);
      this.WriteWord(ResType);
      for (var $l = 1, $end = ResName.length; $l <= $end; $l++) {
        I = $l;
        B = ResName.charCodeAt(I - 1);
        this.WriteByte(B);
      };
      this.WriteByte(0);
      this.WriteWord(Flags);
      this.WriteDWord(0);
      FixupInfo.set(this.GetPosition());
    };
    this.FixupResourceHeader = function (FixupInfo) {
      var ResSize = 0;
      var TmpResSize = 0;
      ResSize = this.GetPosition() - FixupInfo;
      TmpResSize = ResSize >>> 0;
      this.SetPosition(FixupInfo - 4);
      this.WriteDWord(TmpResSize);
      this.SetPosition(FixupInfo + ResSize);
    };
    this.ReadResHeader = function () {
      var ResType = 0;
      var Flags = 0;
      try {
        if (this.ReadByte() !== 0xff) throw $mod.EInvalidImage.$create("Create$1",[rtl.getResStr(pas.RTLConsts,"SInvalidImage")]);
        ResType = this.ReadWord();
        if (ResType !== 0xa) throw $mod.EInvalidImage.$create("Create$1",[rtl.getResStr(pas.RTLConsts,"SInvalidImage")]);
        while (this.ReadByte() !== 0) {
        };
        Flags = this.ReadWord();
        if (Flags !== 0x1030) throw $mod.EInvalidImage.$create("Create$1",[rtl.getResStr(pas.RTLConsts,"SInvalidImage")]);
        this.ReadDWord();
      } catch ($e) {
        if ($mod.EInvalidImage.isPrototypeOf($e)) {
          throw $e}
         else {
          throw $mod.EInvalidImage.$create("Create$1",[rtl.getResStr(pas.RTLConsts,"SInvalidImage")]);
        }
      };
    };
    this.ReadByte = function () {
      var Result = 0;
      this.ReadBufferData$7({get: function () {
          return Result;
        }, set: function (v) {
          Result = v;
        }},1);
      return Result;
    };
    this.ReadWord = function () {
      var Result = 0;
      this.ReadBufferData$11({get: function () {
          return Result;
        }, set: function (v) {
          Result = v;
        }},2);
      return Result;
    };
    this.ReadDWord = function () {
      var Result = 0;
      this.ReadBufferData$15({get: function () {
          return Result;
        }, set: function (v) {
          Result = v;
        }},4);
      return Result;
    };
    this.ReadQWord = function () {
      var Result = 0;
      this.ReadBufferData$19({get: function () {
          return Result;
        }, set: function (v) {
          Result = v;
        }},8);
      return Result;
    };
    this.WriteByte = function (b) {
      this.WriteBufferData$9(b,1);
    };
    this.WriteWord = function (w) {
      this.WriteBufferData$13(w,2);
    };
    this.WriteDWord = function (d) {
      this.WriteBufferData$15(d,4);
    };
    this.WriteQWord = function (q) {
      this.WriteBufferData$19(q,8);
    };
  });
  rtl.createClass(this,"TCustomMemoryStream",this.TStream,function () {
    this.$init = function () {
      $mod.TStream.$init.call(this);
      this.FMemory = null;
      this.FDataView = null;
      this.FDataArray = null;
      this.FSize = 0;
      this.FPosition = 0;
      this.FSizeBoundsSeek = false;
    };
    this.$final = function () {
      this.FMemory = undefined;
      this.FDataView = undefined;
      this.FDataArray = undefined;
      $mod.TStream.$final.call(this);
    };
    this.GetDataArray = function () {
      var Result = null;
      if (this.FDataArray === null) this.FDataArray = new Uint8Array(this.FMemory);
      Result = this.FDataArray;
      return Result;
    };
    this.GetDataView = function () {
      var Result = null;
      if (this.FDataView === null) this.FDataView = new DataView(this.FMemory);
      Result = this.FDataView;
      return Result;
    };
    this.GetSize = function () {
      var Result = 0;
      Result = this.FSize;
      return Result;
    };
    this.GetPosition = function () {
      var Result = 0;
      Result = this.FPosition;
      return Result;
    };
    this.SetPointer = function (Ptr, ASize) {
      this.FMemory = Ptr;
      this.FSize = ASize;
      this.FDataView = null;
      this.FDataArray = null;
    };
    this.MemoryToBytes = function (Mem) {
      var Result = [];
      Result = this.MemoryToBytes$1(new Uint8Array(Mem));
      return Result;
    };
    this.MemoryToBytes$1 = function (Mem) {
      var Result = [];
      var I = 0;
      for (var $l = 0, $end = Mem.length - 1; $l <= $end; $l++) {
        I = $l;
        Result[I] = Mem[I];
      };
      return Result;
    };
    this.BytesToMemory = function (aBytes) {
      var Result = null;
      var a = null;
      Result = new ArrayBuffer(rtl.length(aBytes));
      a = new Uint8Array(Result);
      a.set(aBytes);
      return Result;
    };
    this.Read$1 = function (Buffer, Offset, Count) {
      var Result = 0;
      var I = 0;
      var Src = 0;
      var Dest = 0;
      Result = 0;
      if ((this.FSize > 0) && (this.FPosition < this.FSize) && (this.FPosition >= 0)) {
        Result = Count;
        if (Result > (this.FSize - this.FPosition)) Result = this.FSize - this.FPosition;
        Src = this.FPosition;
        Dest = Offset;
        I = 0;
        while (I < Result) {
          Buffer[Dest] = this.GetDataView().getUint8(Src);
          Src += 1;
          Dest += 1;
          I += 1;
        };
        this.FPosition = this.FPosition + Result;
      };
      return Result;
    };
    this.Seek = function (Offset, Origin) {
      var Result = 0;
      var $tmp = Origin;
      if ($tmp === 0) {
        this.FPosition = Offset}
       else if ($tmp === 2) {
        this.FPosition = this.FSize + Offset}
       else if ($tmp === 1) this.FPosition = this.FPosition + Offset;
      if (this.FSizeBoundsSeek && (this.FPosition > this.FSize)) this.FPosition = this.FSize;
      Result = this.FPosition;
      return Result;
    };
    this.SaveToStream = function (Stream) {
      if (this.FSize > 0) Stream.WriteBuffer($mod.TMemoryStream.MemoryToBytes(this.FMemory),this.FSize);
    };
    this.LoadFromURL = function (aURL, Async, OnLoaded, OnError) {
      var $Self = this;
      function DoLoaded(abytes) {
        $Self.SetPointer(abytes,abytes.byteLength);
        if (OnLoaded != null) OnLoaded($Self);
      };
      function DoError(AError) {
        if (OnError != null) {
          OnError($Self,AError)}
         else throw pas.SysUtils.EInOutError.$create("Create$1",["Failed to load from URL:" + AError]);
      };
      $impl.CheckLoadHelper();
      $impl.GlobalLoadHelper.LoadBytes(aURL,Async,DoLoaded,DoError);
    };
    this.LoadFromFile = function (aFileName, OnLoaded, AError) {
      var $Self = this;
      this.LoadFromURL(aFileName,false,function (Sender) {
        if (OnLoaded != null) OnLoaded();
      },function (Sender, ErrorMsg) {
        if (AError != null) AError(ErrorMsg);
      });
    };
  });
  rtl.createClass(this,"TMemoryStream",this.TCustomMemoryStream,function () {
    this.$init = function () {
      $mod.TCustomMemoryStream.$init.call(this);
      this.FCapacity = 0;
    };
    this.SetCapacity = function (NewCapacity) {
      this.SetPointer(this.Realloc({get: function () {
          return NewCapacity;
        }, set: function (v) {
          NewCapacity = v;
        }}),this.FSize);
      this.FCapacity = NewCapacity;
    };
    this.Realloc = function (NewCapacity) {
      var Result = null;
      var GC = 0;
      var DestView = null;
      if (NewCapacity.get() < 0) {
        NewCapacity.set(0)}
       else {
        GC = this.FCapacity + rtl.trunc(this.FCapacity / 4);
        if ((NewCapacity.get() > this.FCapacity) && (NewCapacity.get() < GC)) NewCapacity.set(GC);
        NewCapacity.set((NewCapacity.get() + (4096 - 1)) & ~(4096 - 1));
      };
      if (NewCapacity.get() === this.FCapacity) {
        Result = this.FMemory}
       else if (NewCapacity.get() === 0) {
        Result = null}
       else {
        Result = new ArrayBuffer(NewCapacity.get());
        if (Result === null) throw $mod.EStreamError.$create("Create$1",[rtl.getResStr($mod,"SMemoryStreamError")]);
        DestView = new Uint8Array(Result);
        DestView.set(this.GetDataArray());
      };
      return Result;
    };
    this.Destroy = function () {
      this.Clear();
      pas.System.TObject.Destroy.call(this);
    };
    this.Clear = function () {
      this.FSize = 0;
      this.FPosition = 0;
      this.SetCapacity(0);
    };
    this.LoadFromStream = function (Stream) {
      this.SetPosition(0);
      Stream.SetPosition(0);
      this.SetSize(Stream.GetSize());
      if (this.GetSize() > 0) this.CopyFrom(Stream,0);
    };
    this.SetSize = function (NewSize) {
      this.SetCapacity(NewSize);
      this.FSize = NewSize;
      if (this.FPosition > this.FSize) this.FPosition = this.FSize;
    };
    this.Write$1 = function (Buffer, Offset, Count) {
      var Result = 0;
      var NewPos = 0;
      if ((Count === 0) || (this.FPosition < 0)) return 0;
      NewPos = this.FPosition + Count;
      if (NewPos > this.FSize) {
        if (NewPos > this.FCapacity) this.SetCapacity(NewPos);
        this.FSize = NewPos;
      };
      this.GetDataArray().set(rtl.arrayCopy(0,Buffer,Offset,Count),this.FPosition);
      this.FPosition = NewPos;
      Result = Count;
      return Result;
    };
  });
  rtl.createClass(this,"TBytesStream",this.TMemoryStream,function () {
    this.GetBytes = function () {
      var Result = [];
      Result = $mod.TMemoryStream.MemoryToBytes(this.FMemory);
      return Result;
    };
    this.Create$1 = function (ABytes) {
      pas.System.TObject.Create.call(this);
      this.SetPointer($mod.TMemoryStream.BytesToMemory(rtl.arrayRef(ABytes)),rtl.length(ABytes));
      this.FCapacity = rtl.length(ABytes);
      return this;
    };
  });
  rtl.createClass(this,"TStringStream",this.TMemoryStream,function () {
    this.GetDataString = function () {
      var Result = "";
      var a = null;
      Result = "";
      a = new Uint16Array(this.FMemory.slice(0,this.GetSize()));
      if (a !== null) {
        // Result=String.fromCharCode.apply(null, new Uint16Array(a));
        Result=String.fromCharCode.apply(null, a);
      };
      return Result;
    };
    this.Create$1 = function () {
      this.Create$2("");
      return this;
    };
    this.Create$2 = function (aString) {
      var Len = 0;
      pas.System.TObject.Create.call(this);
      Len = aString.length;
      this.SetPointer($mod.StringToBuffer(aString,Len),Len * 2);
      this.FCapacity = Len * 2;
      return this;
    };
    this.ReadString = function (Count) {
      var Result = "";
      var B = [];
      var Buf = null;
      var BytesLeft = 0;
      var ByteCount = 0;
      ByteCount = Count * 2;
      BytesLeft = this.GetSize() - this.GetPosition();
      if (BytesLeft < ByteCount) ByteCount = BytesLeft;
      B = rtl.arraySetLength(B,0,ByteCount);
      this.ReadBuffer$1({get: function () {
          return B;
        }, set: function (v) {
          B = v;
        }},0,ByteCount);
      Buf = this.$class.BytesToMemory(rtl.arrayRef(B));
      Result = $mod.BufferToString(Buf,0,ByteCount);
      return Result;
    };
    this.WriteString = function (AString) {
      var Buf = null;
      var B = [];
      Buf = $mod.StringToBuffer(AString,AString.length);
      B = this.$class.MemoryToBytes(Buf);
      this.WriteBuffer(B,rtl.length(B));
    };
  });
  this.TFilerFlag = {"0": "ffInherited", ffInherited: 0, "1": "ffChildPos", ffChildPos: 1, "2": "ffInline", ffInline: 2};
  this.$rtti.$Enum("TFilerFlag",{minvalue: 0, maxvalue: 2, ordtype: 1, enumtype: this.TFilerFlag});
  this.$rtti.$Set("TFilerFlags",{comptype: this.$rtti["TFilerFlag"]});
  this.$rtti.$MethodVar("TReaderProc",{procsig: rtl.newTIProcSig([["Reader",this.$rtti["TReader"]]]), methodkind: 0});
  this.$rtti.$MethodVar("TWriterProc",{procsig: rtl.newTIProcSig([["Writer",this.$rtti["TWriter"]]]), methodkind: 0});
  this.$rtti.$MethodVar("TStreamProc",{procsig: rtl.newTIProcSig([["Stream",this.$rtti["TStream"]]]), methodkind: 0});
  rtl.createClass(this,"TFiler",pas.System.TObject,function () {
    this.$init = function () {
      pas.System.TObject.$init.call(this);
      this.FRoot = null;
      this.FLookupRoot = null;
      this.FAncestor = null;
      this.FIgnoreChildren = false;
    };
    this.$final = function () {
      this.FRoot = undefined;
      this.FLookupRoot = undefined;
      this.FAncestor = undefined;
      pas.System.TObject.$final.call(this);
    };
    this.SetRoot = function (ARoot) {
      this.FRoot = ARoot;
    };
  });
  this.TValueType = {"0": "vaNull", vaNull: 0, "1": "vaList", vaList: 1, "2": "vaInt8", vaInt8: 2, "3": "vaInt16", vaInt16: 3, "4": "vaInt32", vaInt32: 4, "5": "vaDouble", vaDouble: 5, "6": "vaString", vaString: 6, "7": "vaIdent", vaIdent: 7, "8": "vaFalse", vaFalse: 8, "9": "vaTrue", vaTrue: 9, "10": "vaBinary", vaBinary: 10, "11": "vaSet", vaSet: 11, "12": "vaNil", vaNil: 12, "13": "vaCollection", vaCollection: 13, "14": "vaCurrency", vaCurrency: 14, "15": "vaDate", vaDate: 15, "16": "vaNativeInt", vaNativeInt: 16};
  this.$rtti.$Enum("TValueType",{minvalue: 0, maxvalue: 16, ordtype: 1, enumtype: this.TValueType});
  rtl.createClass(this,"TAbstractObjectReader",pas.System.TObject,function () {
    this.FlushBuffer = function () {
    };
  });
  rtl.createClass(this,"TBinaryObjectReader",this.TAbstractObjectReader,function () {
    this.$init = function () {
      $mod.TAbstractObjectReader.$init.call(this);
      this.FStream = null;
    };
    this.$final = function () {
      this.FStream = undefined;
      $mod.TAbstractObjectReader.$final.call(this);
    };
    this.ReadWord = function () {
      var Result = 0;
      this.FStream.ReadBufferData$10({get: function () {
          return Result;
        }, set: function (v) {
          Result = v;
        }});
      return Result;
    };
    this.ReadDWord = function () {
      var Result = 0;
      this.FStream.ReadBufferData$14({get: function () {
          return Result;
        }, set: function (v) {
          Result = v;
        }});
      return Result;
    };
    this.SkipProperty = function () {
      this.ReadStr();
      this.SkipValue();
    };
    this.SkipSetBody = function () {
      while (this.ReadStr().length > 0) {
      };
    };
    this.Create$1 = function (Stream) {
      pas.System.TObject.Create.call(this);
      if (Stream === null) throw $mod.EReadError.$create("Create$1",[rtl.getResStr(pas.RTLConsts,"SEmptyStreamIllegalReader")]);
      this.FStream = Stream;
      return this;
    };
    this.NextValue = function () {
      var Result = 0;
      Result = this.ReadValue();
      this.FStream.Seek(-1,1);
      return Result;
    };
    this.ReadValue = function () {
      var Result = 0;
      var b = 0;
      this.FStream.ReadBufferData$6({get: function () {
          return b;
        }, set: function (v) {
          b = v;
        }});
      Result = b;
      return Result;
    };
    this.BeginRootComponent = function () {
      this.ReadSignature();
    };
    this.BeginComponent = function (Flags, AChildPos, CompClassName, CompName) {
      var Prefix = 0;
      var ValueType = 0;
      Flags.set({});
      if ((this.NextValue() & 0xf0) === 0xf0) {
        Prefix = this.ReadValue();
        Flags.set({});
        if ((Prefix & 0x1) !== 0) Flags.set(rtl.includeSet(Flags.get(),0));
        if ((Prefix & 0x2) !== 0) Flags.set(rtl.includeSet(Flags.get(),1));
        if ((Prefix & 0x4) !== 0) Flags.set(rtl.includeSet(Flags.get(),2));
        if (1 in Flags.get()) {
          ValueType = this.ReadValue();
          var $tmp = ValueType;
          if ($tmp === 2) {
            AChildPos.set(this.ReadInt8())}
           else if ($tmp === 3) {
            AChildPos.set(this.ReadInt16())}
           else if ($tmp === 4) {
            AChildPos.set(this.ReadInt32())}
           else if ($tmp === 16) {
            AChildPos.set(this.ReadNativeInt())}
           else {
            throw $mod.EReadError.$create("Create$1",[rtl.getResStr(pas.RTLConsts,"SInvalidPropertyValue")]);
          };
        };
      };
      CompClassName.set(this.ReadStr());
      CompName.set(this.ReadStr());
    };
    this.BeginProperty = function () {
      var Result = "";
      Result = this.ReadStr();
      return Result;
    };
    this.Read = function (Buffer, Count) {
      this.FStream.Read(Buffer,Count);
    };
    this.ReadBinary = function (DestData) {
      var BinSize = 0;
      BinSize = this.ReadDWord() & 0xFFFFFFFF;
      DestData.SetSize64(BinSize);
      DestData.CopyFrom(this.FStream,BinSize);
    };
    this.ReadFloat = function () {
      var Result = 0.0;
      this.FStream.ReadBufferData$20({get: function () {
          return Result;
        }, set: function (v) {
          Result = v;
        }});
      return Result;
    };
    this.ReadCurrency = function () {
      var Result = 0;
      Result = rtl.trunc(this.ReadFloat() * 10000);
      return Result;
    };
    this.ReadIdent = function (ValueType) {
      var Result = "";
      var i = 0;
      var c = "";
      var $tmp = ValueType;
      if ($tmp === 7) {
        this.FStream.ReadBufferData$6({get: function () {
            return i;
          }, set: function (v) {
            i = v;
          }});
        Result = rtl.strSetLength(Result,i);
        for (var $l = 1, $end = Result.length; $l <= $end; $l++) {
          i = $l;
          this.FStream.ReadBufferData$2({get: function () {
              return c;
            }, set: function (v) {
              c = v;
            }});
          Result = rtl.setCharAt(Result,i - 1,c);
        };
      } else if ($tmp === 12) {
        Result = "nil"}
       else if ($tmp === 8) {
        Result = "False"}
       else if ($tmp === 9) {
        Result = "True"}
       else if ($tmp === 0) Result = "Null";
      return Result;
    };
    this.ReadInt8 = function () {
      var Result = 0;
      this.FStream.ReadBufferData$4({get: function () {
          return Result;
        }, set: function (v) {
          Result = v;
        }});
      return Result;
    };
    this.ReadInt16 = function () {
      var Result = 0;
      this.FStream.ReadBufferData$8({get: function () {
          return Result;
        }, set: function (v) {
          Result = v;
        }});
      return Result;
    };
    this.ReadInt32 = function () {
      var Result = 0;
      this.FStream.ReadBufferData$12({get: function () {
          return Result;
        }, set: function (v) {
          Result = v;
        }});
      return Result;
    };
    this.ReadNativeInt = function () {
      var Result = 0;
      this.FStream.ReadBufferData$16({get: function () {
          return Result;
        }, set: function (v) {
          Result = v;
        }});
      return Result;
    };
    this.ReadSet = function (EnumType) {
      var Result = 0;
      var Name = "";
      var Value = 0;
      try {
        Result = 0;
        while (true) {
          Name = this.ReadStr();
          if (Name.length === 0) break;
          Value = EnumType.enumtype[Name];
          if (Value === -1) throw $mod.EReadError.$create("Create$1",[rtl.getResStr(pas.RTLConsts,"SInvalidPropertyValue")]);
          Result = Result | (1 << Value);
        };
      } catch ($e) {
        this.SkipSetBody();
        throw $e;
      };
      return Result;
    };
    this.ReadSignature = function () {
      var Signature = 0;
      this.FStream.ReadBufferData$12({get: function () {
          return Signature;
        }, set: function (v) {
          Signature = v;
        }});
      if (Signature !== 809914452) throw $mod.EReadError.$create("Create$1",[rtl.getResStr(pas.RTLConsts,"SInvalidImage")]);
    };
    this.ReadStr = function () {
      var Result = "";
      var l = 0;
      var i = 0;
      var c = "";
      this.FStream.ReadBufferData$6({get: function () {
          return l;
        }, set: function (v) {
          l = v;
        }});
      Result = rtl.strSetLength(Result,l);
      for (var $l = 1, $end = l; $l <= $end; $l++) {
        i = $l;
        this.FStream.ReadBufferData$2({get: function () {
            return c;
          }, set: function (v) {
            c = v;
          }});
        Result = rtl.setCharAt(Result,i - 1,c);
      };
      return Result;
    };
    this.ReadString = function (StringType) {
      var Result = "";
      var i = 0;
      var C = "";
      Result = "";
      if (StringType !== 6) throw $mod.EFilerError.$create("Create$1",["Invalid string type passed to ReadString"]);
      i = this.ReadDWord();
      Result = rtl.strSetLength(Result,i);
      for (var $l = 1, $end = Result.length; $l <= $end; $l++) {
        i = $l;
        this.FStream.ReadBufferData$2({get: function () {
            return C;
          }, set: function (v) {
            C = v;
          }});
        Result = rtl.setCharAt(Result,i - 1,C);
      };
      return Result;
    };
    this.ReadWideString = function () {
      var Result = "";
      Result = this.ReadString($mod.TValueType.vaString);
      return Result;
    };
    this.ReadUnicodeString = function () {
      var Result = "";
      Result = this.ReadString($mod.TValueType.vaString);
      return Result;
    };
    this.SkipComponent = function (SkipComponentInfos) {
      var Flags = {};
      var Dummy = 0;
      var CompClassName = "";
      var CompName = "";
      if (SkipComponentInfos) this.BeginComponent({get: function () {
          return Flags;
        }, set: function (v) {
          Flags = v;
        }},{get: function () {
          return Dummy;
        }, set: function (v) {
          Dummy = v;
        }},{get: function () {
          return CompClassName;
        }, set: function (v) {
          CompClassName = v;
        }},{get: function () {
          return CompName;
        }, set: function (v) {
          CompName = v;
        }});
      while (this.NextValue() !== 0) this.SkipProperty();
      this.ReadValue();
      while (this.NextValue() !== 0) this.SkipComponent(true);
      this.ReadValue();
    };
    this.SkipValue = function () {
      var $Self = this;
      function SkipBytes(Count) {
        var Dummy = [];
        var SkipNow = 0;
        while (Count > 0) {
          if (Count > 1024) {
            SkipNow = 1024}
           else SkipNow = Count;
          Dummy = rtl.arraySetLength(Dummy,0,SkipNow);
          $Self.Read({get: function () {
              return Dummy;
            }, set: function (v) {
              Dummy = v;
            }},SkipNow);
          Count -= SkipNow;
        };
      };
      var Count = 0;
      var $tmp = this.ReadValue();
      if (($tmp === 0) || ($tmp === 8) || ($tmp === 9) || ($tmp === 12)) {}
      else if ($tmp === 1) {
        while (this.NextValue() !== 0) this.SkipValue();
        this.ReadValue();
      } else if ($tmp === 2) {
        SkipBytes(1)}
       else if ($tmp === 3) {
        SkipBytes(2)}
       else if ($tmp === 4) {
        SkipBytes(4)}
       else if (($tmp === $mod.TValueType.vaNativeInt) || ($tmp === 5)) {
        SkipBytes(8)}
       else if ($tmp === 7) {
        this.ReadStr()}
       else if ($tmp === 6) {
        this.ReadString(6)}
       else if ($tmp === 10) {
        Count = this.ReadDWord() & 0xFFFFFFFF;
        SkipBytes(Count);
      } else if ($tmp === 11) {
        this.SkipSetBody()}
       else if ($tmp === 13) {
        while (this.NextValue() !== 0) {
          if (this.NextValue() in rtl.createSet(2,3,4)) this.SkipValue();
          SkipBytes(1);
          while (this.NextValue() !== 0) this.SkipProperty();
          this.ReadValue();
        };
        this.ReadValue();
      };
    };
  });
  this.$rtti.$MethodVar("TFindMethodEvent",{procsig: rtl.newTIProcSig([["Reader",this.$rtti["TReader"]],["MethodName",rtl.string,2],["Address",rtl.pointer,1],["error",rtl.boolean,1]]), methodkind: 0});
  this.$rtti.$MethodVar("TSetNameEvent",{procsig: rtl.newTIProcSig([["Reader",this.$rtti["TReader"]],["Component",this.$rtti["TComponent"]],["Name",rtl.string,1]]), methodkind: 0});
  this.$rtti.$MethodVar("TReferenceNameEvent",{procsig: rtl.newTIProcSig([["Reader",this.$rtti["TReader"]],["Name",rtl.string,1]]), methodkind: 0});
  this.$rtti.$MethodVar("TAncestorNotFoundEvent",{procsig: rtl.newTIProcSig([["Reader",this.$rtti["TReader"]],["ComponentName",rtl.string,2],["ComponentClass",this.$rtti["TPersistentClass"]],["Component",this.$rtti["TComponent"],1]]), methodkind: 0});
  this.$rtti.$MethodVar("TReadComponentsProc",{procsig: rtl.newTIProcSig([["Component",this.$rtti["TComponent"]]]), methodkind: 0});
  this.$rtti.$MethodVar("TReaderError",{procsig: rtl.newTIProcSig([["Reader",this.$rtti["TReader"]],["Message",rtl.string,2],["Handled",rtl.boolean,1]]), methodkind: 0});
  this.$rtti.$MethodVar("TPropertyNotFoundEvent",{procsig: rtl.newTIProcSig([["Reader",this.$rtti["TReader"]],["Instance",this.$rtti["TPersistent"]],["PropName",rtl.string,1],["IsPath",rtl.boolean],["Handled",rtl.boolean,1],["Skip",rtl.boolean,1]]), methodkind: 0});
  this.$rtti.$MethodVar("TFindComponentClassEvent",{procsig: rtl.newTIProcSig([["Reader",this.$rtti["TReader"]],["ClassName",rtl.string,2],["ComponentClass",this.$rtti["TComponentClass"],1]]), methodkind: 0});
  this.$rtti.$MethodVar("TCreateComponentEvent",{procsig: rtl.newTIProcSig([["Reader",this.$rtti["TReader"]],["ComponentClass",this.$rtti["TComponentClass"]],["Component",this.$rtti["TComponent"],1]]), methodkind: 0});
  this.$rtti.$MethodVar("TSetMethodPropertyEvent",{procsig: rtl.newTIProcSig([["Reader",this.$rtti["TReader"]],["Instance",this.$rtti["TPersistent"]],["PropInfo",pas.TypInfo.$rtti["TTypeMemberProperty"]],["TheMethodName",rtl.string,2],["Handled",rtl.boolean,1]]), methodkind: 0});
  this.$rtti.$MethodVar("TReadWriteStringPropertyEvent",{procsig: rtl.newTIProcSig([["Sender",pas.System.$rtti["TObject"]],["Instance",this.$rtti["TPersistent"],2],["PropInfo",pas.TypInfo.$rtti["TTypeMemberProperty"]],["Content",rtl.string,1]]), methodkind: 0});
  rtl.createClass(this,"TReader",this.TFiler,function () {
    this.$init = function () {
      $mod.TFiler.$init.call(this);
      this.FDriver = null;
      this.FOwner = null;
      this.FParent = null;
      this.FFixups = null;
      this.FLoaded = null;
      this.FOnFindMethod = null;
      this.FOnSetMethodProperty = null;
      this.FOnSetName = null;
      this.FOnReferenceName = null;
      this.FOnAncestorNotFound = null;
      this.FOnError = null;
      this.FOnPropertyNotFound = null;
      this.FOnFindComponentClass = null;
      this.FOnCreateComponent = null;
      this.FPropName = "";
      this.FCanHandleExcepts = false;
      this.FOnReadStringProperty = null;
    };
    this.$final = function () {
      this.FDriver = undefined;
      this.FOwner = undefined;
      this.FParent = undefined;
      this.FFixups = undefined;
      this.FLoaded = undefined;
      this.FOnFindMethod = undefined;
      this.FOnSetMethodProperty = undefined;
      this.FOnSetName = undefined;
      this.FOnReferenceName = undefined;
      this.FOnAncestorNotFound = undefined;
      this.FOnError = undefined;
      this.FOnPropertyNotFound = undefined;
      this.FOnFindComponentClass = undefined;
      this.FOnCreateComponent = undefined;
      this.FOnReadStringProperty = undefined;
      $mod.TFiler.$final.call(this);
    };
    this.DoFixupReferences = function () {
      var R = null;
      var RN = null;
      var G = null;
      var Ref = "";
      var C = null;
      var P = 0;
      var L = null;
      var $ir = rtl.createIntfRefs();
      try {
        if (this.FFixups != null) {
          L = this.FFixups;
          R = L.FRoot;
          while (R !== null) {
            RN = R.Next;
            Ref = R.FRelative;
            if (this.FOnReferenceName != null) this.FOnReferenceName(this,{get: function () {
                return Ref;
              }, set: function (v) {
                Ref = v;
              }});
            C = $mod.FindNestedComponent(R.FRoot,Ref,true);
            if (C != null) {
              if (R.FPropInfo.typeinfo.kind === 18) {
                pas.TypInfo.SetInterfaceProp$1(R.Finstance,R.FPropInfo,$ir.ref(1,rtl.queryIntfT(C,pas.System.IUnknown)))}
               else pas.TypInfo.SetObjectProp$1(R.Finstance,R.FPropInfo,C)}
             else {
              P = pas.System.Pos(".",R.FRelative);
              if (P !== 0) {
                G = $impl.AddtoResolveList(R.Finstance);
                G.AddReference(R.FRoot,R.FPropInfo,pas.System.Copy(R.FRelative,1,P - 1),pas.System.Copy(R.FRelative,P + 1,R.FRelative.length - P));
              };
            };
            L.RemoveItem(R,true);
            R = RN;
          };
          pas.SysUtils.FreeAndNil({p: this, get: function () {
              return this.p.FFixups;
            }, set: function (v) {
              this.p.FFixups = v;
            }});
        };
      } finally {
        $ir.free();
      };
    };
    this.FindComponentClass = function (AClassName) {
      var $Self = this;
      var Result = null;
      var PersistentClass = null;
      function FindClassInFieldTable(Instance) {
        var Result = null;
        var aClass = null;
        var i = 0;
        var ClassTI = null;
        var MemberClassTI = null;
        var MemberTI = null;
        aClass = Instance.$class.ClassType();
        while (aClass !== null) {
          ClassTI = aClass.$rtti;
          for (var $l = 0, $end = ClassTI.fields.length - 1; $l <= $end; $l++) {
            i = $l;
            MemberTI = ClassTI.getField(i).typeinfo;
            if (MemberTI.kind === 13) {
              MemberClassTI = MemberTI;
              if (pas.SysUtils.SameText(MemberClassTI.name,AClassName) && rtl.is(MemberClassTI.class,$mod.TComponent)) return MemberClassTI.class;
            };
          };
          aClass = aClass.$ancestor;
        };
        return Result;
      };
      Result = null;
      Result = FindClassInFieldTable(this.FRoot);
      if ((Result === null) && (this.FLookupRoot != null) && (this.FLookupRoot !== this.FRoot)) Result = FindClassInFieldTable(this.FLookupRoot);
      if (Result === null) {
        PersistentClass = $mod.GetClass(AClassName);
        if (PersistentClass.InheritsFrom($mod.TComponent)) Result = PersistentClass;
      };
      if ((Result === null) && (this.FOnFindComponentClass != null)) this.FOnFindComponentClass($Self,AClassName,{get: function () {
          return Result;
        }, set: function (v) {
          Result = v;
        }});
      if ((Result === null) || !Result.InheritsFrom($mod.TComponent)) throw $mod.EClassNotFound.$create("CreateFmt",[rtl.getResStr(pas.RTLConsts,"SClassNotFound"),pas.System.VarRecs(18,AClassName)]);
      return Result;
    };
    this.Error = function (Message) {
      var Result = false;
      Result = false;
      if (this.FOnError != null) this.FOnError(this,Message,{get: function () {
          return Result;
        }, set: function (v) {
          Result = v;
        }});
      return Result;
    };
    this.FindMethod = function (ARoot, AMethodName) {
      var Result = null;
      var ErrorResult = false;
      Result = null;
      if ((ARoot === null) || (AMethodName === "")) return Result;
      Result = ARoot.$class.MethodAddress(AMethodName);
      ErrorResult = Result === null;
      if (this.FOnFindMethod != null) this.FOnFindMethod(this,AMethodName,{get: function () {
          return Result;
        }, set: function (v) {
          Result = v;
        }},{get: function () {
          return ErrorResult;
        }, set: function (v) {
          ErrorResult = v;
        }});
      if (ErrorResult) throw $mod.EReadError.$create("Create$1",[rtl.getResStr(pas.RTLConsts,"SInvalidPropertyValue")]);
      return Result;
    };
    this.ReadProperty = function (AInstance) {
      var $Self = this;
      var Path = "";
      var Instance = null;
      var PropInfo = null;
      var Obj = null;
      var Name = "";
      var Skip = false;
      var Handled = false;
      var OldPropName = "";
      var DotPos = "";
      var NextPos = 0;
      function HandleMissingProperty(IsPath) {
        var Result = false;
        Result = true;
        if ($Self.FOnPropertyNotFound != null) {
          OldPropName = $Self.FPropName;
          Handled = false;
          Skip = false;
          $Self.FOnPropertyNotFound($Self,Instance,{p: $Self, get: function () {
              return this.p.FPropName;
            }, set: function (v) {
              this.p.FPropName = v;
            }},IsPath,{get: function () {
              return Handled;
            }, set: function (v) {
              Handled = v;
            }},{get: function () {
              return Skip;
            }, set: function (v) {
              Skip = v;
            }});
          if (Handled && !Skip && (OldPropName !== $Self.FPropName)) PropInfo = pas.TypInfo.GetPropInfo$4(Instance.$class.ClassType(),$Self.FPropName);
          if (Skip) {
            $Self.FDriver.SkipValue();
            Result = false;
            return Result;
          };
        };
        return Result;
      };
      try {
        Path = this.FDriver.BeginProperty();
        try {
          Instance = AInstance;
          this.FCanHandleExcepts = true;
          DotPos = Path;
          while (true) {
            NextPos = pas.System.Pos(".",DotPos);
            if (NextPos > 0) {
              this.FPropName = pas.System.Copy(DotPos,1,NextPos - 1)}
             else {
              this.FPropName = DotPos;
              break;
            };
            pas.System.Delete({get: function () {
                return DotPos;
              }, set: function (v) {
                DotPos = v;
              }},1,NextPos);
            PropInfo = pas.TypInfo.GetPropInfo$4(Instance.$class.ClassType(),this.FPropName);
            if (!(PropInfo != null)) {
              if (!HandleMissingProperty(true)) return;
              if (!(PropInfo != null)) this.PropertyError();
            };
            if (PropInfo.typeinfo.kind === 13) {
              Obj = pas.TypInfo.GetObjectProp$2(Instance,PropInfo)}
             else Obj = null;
            if (!$mod.TPersistent.isPrototypeOf(Obj)) {
              this.FDriver.SkipValue();
              throw $mod.EReadError.$create("Create$1",[rtl.getResStr(pas.RTLConsts,"SInvalidPropertyPath")]);
            };
            Instance = Obj;
          };
          PropInfo = pas.TypInfo.GetPropInfo$4(Instance.$class.ClassType(),this.FPropName);
          if (PropInfo != null) {
            this.ReadPropValue(Instance,PropInfo)}
           else {
            this.FCanHandleExcepts = false;
            Instance.DefineProperties($Self);
            this.FCanHandleExcepts = true;
            if (this.FPropName.length > 0) {
              if (!HandleMissingProperty(false)) return;
              if (!(PropInfo != null)) this.PropertyError();
            };
          };
        } catch ($e) {
          if (pas.SysUtils.Exception.isPrototypeOf($e)) {
            var e = $e;
            Name = rtl.strSetLength(Name,0);
            if (AInstance.$class.InheritsFrom($mod.TComponent)) Name = AInstance.FName;
            if (Name.length === 0) Name = AInstance.$classname;
            throw $mod.EReadError.$create("CreateFmt",[rtl.getResStr(pas.RTLConsts,"SPropertyException"),pas.System.VarRecs(18,Name,9,".",18,Path,18,e.fMessage)]);
          } else throw $e
        };
      } catch ($e) {
        if (pas.SysUtils.Exception.isPrototypeOf($e)) {
          var e = $e;
          if (!this.FCanHandleExcepts || !this.Error(e.fMessage)) throw $e;
        } else throw $e
      };
    };
    var NullMethod = pas.System.TMethod.$clone({Code: null, Data: null});
    this.ReadPropValue = function (Instance, PropInfo) {
      var PropType = null;
      var Value = 0;
      var Ident = "";
      var Method = pas.System.TMethod.$new();
      var Handled = false;
      var TmpStr = "";
      if (PropInfo.setter === "") throw $mod.EReadError.$create("Create$1",[rtl.getResStr(pas.RTLConsts,"SReadOnlyProperty")]);
      PropType = PropInfo.typeinfo;
      var $tmp = PropType.kind;
      if ($tmp === 1) {
        var $tmp1 = this.FDriver.NextValue();
        if ($tmp1 === 7) {
          Ident = this.ReadIdent();
          if ($impl.GlobalIdentToInt(Ident,{get: function () {
              return Value;
            }, set: function (v) {
              Value = v;
            }})) {
            pas.TypInfo.SetOrdProp$1(Instance,PropInfo,Value)}
           else throw $mod.EReadError.$create("Create$1",[rtl.getResStr(pas.RTLConsts,"SInvalidPropertyValue")]);
        } else if ($tmp1 === 16) {
          pas.TypInfo.SetOrdProp$1(Instance,PropInfo,this.ReadNativeInt())}
         else if ($tmp1 === 14) {
          pas.TypInfo.SetFloatProp$1(Instance,PropInfo,this.ReadCurrency() / 10000)}
         else {
          pas.TypInfo.SetOrdProp$1(Instance,PropInfo,this.ReadInteger());
        };
      } else if ($tmp === 7) {
        pas.TypInfo.SetBoolProp$1(Instance,PropInfo,this.ReadBoolean())}
       else if ($tmp === 2) {
        pas.TypInfo.SetOrdProp$1(Instance,PropInfo,this.ReadChar().charCodeAt())}
       else if ($tmp === 4) {
        Value = pas.TypInfo.GetEnumValue(PropType,this.ReadIdent());
        if (Value === -1) throw $mod.EReadError.$create("Create$1",[rtl.getResStr(pas.RTLConsts,"SInvalidPropertyValue")]);
        pas.TypInfo.SetOrdProp$1(Instance,PropInfo,Value);
      } else if ($tmp === pas.System.TTypeKind.tkDouble) {
        pas.TypInfo.SetFloatProp$1(Instance,PropInfo,this.ReadFloat())}
       else if ($tmp === 5) {
        this.CheckValue(11);
        if (PropType.comptype.kind === 4) pas.TypInfo.SetOrdProp$1(Instance,PropInfo,this.FDriver.ReadSet(PropType.comptype));
      } else if (($tmp === 9) || ($tmp === 17)) {
        if (this.FDriver.NextValue() === 12) {
          this.FDriver.ReadValue();
          pas.TypInfo.SetMethodProp(Instance,PropInfo,NullMethod);
        } else {
          Handled = false;
          Ident = this.ReadIdent();
          if (this.FOnSetMethodProperty != null) this.FOnSetMethodProperty(this,Instance,PropInfo,Ident,{get: function () {
              return Handled;
            }, set: function (v) {
              Handled = v;
            }});
          if (!Handled) {
            Method.Code = this.FindMethod(this.FRoot,Ident);
            Method.Data = this.FRoot;
            if (Method.Code != null) pas.TypInfo.SetMethodProp(Instance,PropInfo,Method);
          };
        }}
       else if ($tmp === 3) {
        TmpStr = this.ReadString();
        if (this.FOnReadStringProperty != null) this.FOnReadStringProperty(this,Instance,PropInfo,{get: function () {
            return TmpStr;
          }, set: function (v) {
            TmpStr = v;
          }});
        pas.TypInfo.SetStrProp$1(Instance,PropInfo,TmpStr);
      } else if ($tmp === 16) {
        pas.TypInfo.SetJSValueProp$3(Instance,PropInfo,this.ReadVariant());
      } else if (($tmp === 13) || ($tmp === 18)) {
        var $tmp2 = this.FDriver.NextValue();
        if ($tmp2 === 12) {
          this.FDriver.ReadValue();
          pas.TypInfo.SetOrdProp$1(Instance,PropInfo,0);
        } else if ($tmp2 === 13) {
          this.FDriver.ReadValue();
          this.ReadCollection(pas.TypInfo.GetObjectProp$2(Instance,PropInfo));
        } else {
          if (!(this.FFixups != null)) this.FFixups = pas.simplelinkedlist.TLinkedList.$create("Create$1",[$impl.TLocalUnResolvedReference]);
          var $with = this.FFixups.Add();
          $with.Finstance = Instance;
          $with.FRoot = this.FRoot;
          $with.FPropInfo = PropInfo;
          $with.FRelative = this.ReadIdent();
        };
      } else {
        throw $mod.EReadError.$create("CreateFmt",[rtl.getResStr(pas.RTLConsts,"SUnknownPropertyType"),pas.System.VarRecs(18,pas.System.TTypeKind[PropType.kind])]);
      };
    };
    this.PropertyError = function () {
      this.FDriver.SkipValue();
      throw $mod.EReadError.$create("CreateFmt",[rtl.getResStr(pas.RTLConsts,"SUnknownProperty"),pas.System.VarRecs(18,this.FPropName)]);
    };
    this.ReadData = function (Instance) {
      var SavedOwner = null;
      var SavedParent = null;
      while (!this.EndOfList()) this.ReadProperty(Instance);
      this.ReadListEnd();
      SavedOwner = this.FOwner;
      SavedParent = this.FParent;
      try {
        this.FOwner = Instance.GetChildOwner();
        if (!(this.FOwner != null)) this.FOwner = this.FRoot;
        this.FParent = Instance.GetChildParent();
        while (!this.EndOfList()) this.ReadComponent(null);
        this.ReadListEnd();
      } finally {
        this.FOwner = SavedOwner;
        this.FParent = SavedParent;
      };
      if (Instance === this.FRoot) this.DoFixupReferences();
    };
    this.CreateDriver = function (Stream) {
      var Result = null;
      Result = $mod.TBinaryObjectReader.$create("Create$1",[Stream]);
      return Result;
    };
    this.Create$1 = function (Stream) {
      pas.System.TObject.Create.call(this);
      if (Stream === null) throw $mod.EReadError.$create("Create$1",[rtl.getResStr(pas.RTLConsts,"SEmptyStreamIllegalReader")]);
      this.FDriver = this.CreateDriver(Stream);
      return this;
    };
    this.Destroy = function () {
      rtl.free(this,"FDriver");
      pas.System.TObject.Destroy.call(this);
    };
    this.FlushBuffer = function () {
      this.FDriver.FlushBuffer();
    };
    this.BeginReferences = function () {
      this.FLoaded = $mod.TFPList.$create("Create");
    };
    this.CheckValue = function (Value) {
      if (this.FDriver.NextValue() !== Value) {
        throw $mod.EReadError.$create("Create$1",[rtl.getResStr(pas.RTLConsts,"SInvalidPropertyValue")])}
       else this.FDriver.ReadValue();
    };
    this.DefineProperty = function (Name, AReadData, WriteData, HasData) {
      if ((AReadData != null) && pas.SysUtils.SameText(Name,this.FPropName)) {
        AReadData(this);
        this.FPropName = rtl.strSetLength(this.FPropName,0);
      } else if ((WriteData != null) && HasData) ;
    };
    this.DefineBinaryProperty = function (Name, AReadData, WriteData, HasData) {
      var MemBuffer = null;
      if ((AReadData != null) && pas.SysUtils.SameText(Name,this.FPropName)) {
        if (this.FDriver.NextValue() !== 10) {
          this.FDriver.SkipValue();
          this.FCanHandleExcepts = true;
          throw $mod.EReadError.$create("Create$1",[rtl.getResStr(pas.RTLConsts,"SInvalidPropertyValue")]);
        } else this.FDriver.ReadValue();
        MemBuffer = $mod.TMemoryStream.$create("Create");
        try {
          this.FDriver.ReadBinary(MemBuffer);
          this.FCanHandleExcepts = true;
          AReadData(MemBuffer);
        } finally {
          MemBuffer = rtl.freeLoc(MemBuffer);
        };
        this.FPropName = rtl.strSetLength(this.FPropName,0);
      } else if ((WriteData != null) && HasData) ;
    };
    this.EndOfList = function () {
      var Result = false;
      Result = this.FDriver.NextValue() === 0;
      return Result;
    };
    this.EndReferences = function () {
      rtl.free(this,"FLoaded");
      this.FLoaded = null;
    };
    this.FixupReferences = function () {
      var i = 0;
      this.DoFixupReferences();
      $impl.GlobalFixupReferences();
      for (var $l = 0, $end = this.FLoaded.FCount - 1; $l <= $end; $l++) {
        i = $l;
        rtl.getObject(this.FLoaded.Get(i)).Loaded();
      };
    };
    this.NextValue = function () {
      var Result = 0;
      Result = this.FDriver.NextValue();
      return Result;
    };
    this.Read = function (Buffer, Count) {
      this.FDriver.Read(Buffer,Count);
    };
    this.ReadBoolean = function () {
      var Result = false;
      var ValueType = 0;
      ValueType = this.FDriver.ReadValue();
      if (ValueType === 9) {
        Result = true}
       else if (ValueType === 8) {
        Result = false}
       else throw $mod.EReadError.$create("Create$1",[rtl.getResStr(pas.RTLConsts,"SInvalidPropertyValue")]);
      return Result;
    };
    this.ReadChar = function () {
      var Result = "";
      var s = "";
      s = this.ReadString();
      if (s.length === 1) {
        Result = s.charAt(0)}
       else throw $mod.EReadError.$create("Create$1",[rtl.getResStr(pas.RTLConsts,"SInvalidPropertyValue")]);
      return Result;
    };
    this.ReadWideChar = function () {
      var Result = "";
      var W = "";
      W = this.ReadWideString();
      if (W.length === 1) {
        Result = W.charAt(0)}
       else throw $mod.EReadError.$create("Create$1",[rtl.getResStr(pas.RTLConsts,"SInvalidPropertyValue")]);
      return Result;
    };
    this.ReadUnicodeChar = function () {
      var Result = "";
      var U = "";
      U = this.ReadUnicodeString();
      if (U.length === 1) {
        Result = U.charAt(0)}
       else throw $mod.EReadError.$create("Create$1",[rtl.getResStr(pas.RTLConsts,"SInvalidPropertyValue")]);
      return Result;
    };
    this.ReadCollection = function (Collection) {
      var Item = null;
      Collection.BeginUpdate();
      if (!this.EndOfList()) Collection.Clear();
      while (!this.EndOfList()) {
        this.ReadListBegin();
        Item = Collection.Add();
        while (this.NextValue() !== 0) this.ReadProperty(Item);
        this.ReadListEnd();
      };
      Collection.EndUpdate();
      this.ReadListEnd();
    };
    this.ReadComponent = function (Component) {
      var $Self = this;
      var Result = null;
      var Flags = {};
      function Recover(E, aComponent) {
        var Result = false;
        Result = false;
        if (!((0 in Flags) || (Component != null))) aComponent.set(rtl.freeLoc(aComponent.get()));
        aComponent.set(null);
        $Self.FDriver.SkipComponent(false);
        Result = $Self.Error(E.fMessage);
        return Result;
      };
      var CompClassName = "";
      var Name = "";
      var n = 0;
      var ChildPos = 0;
      var SavedParent = null;
      var SavedLookupRoot = null;
      var ComponentClass = null;
      var C = null;
      var NewComponent = null;
      var SubComponents = null;
      this.FDriver.BeginComponent({get: function () {
          return Flags;
        }, set: function (v) {
          Flags = v;
        }},{get: function () {
          return ChildPos;
        }, set: function (v) {
          ChildPos = v;
        }},{get: function () {
          return CompClassName;
        }, set: function (v) {
          CompClassName = v;
        }},{get: function () {
          return Name;
        }, set: function (v) {
          Name = v;
        }});
      SavedParent = this.FParent;
      SavedLookupRoot = this.FLookupRoot;
      SubComponents = null;
      try {
        Result = Component;
        if (!(Result != null)) try {
          if (0 in Flags) {
            if (this.FLookupRoot != null) {
              Result = this.FLookupRoot.FindComponent(Name)}
             else Result = null;
            if (!(Result != null)) {
              if (this.FOnAncestorNotFound != null) this.FOnAncestorNotFound($Self,Name,this.FindComponentClass(CompClassName),{get: function () {
                  return Result;
                }, set: function (v) {
                  Result = v;
                }});
              if (!(Result != null)) throw $mod.EReadError.$create("CreateFmt",[rtl.getResStr(pas.RTLConsts,"SAncestorNotFound"),pas.System.VarRecs(18,Name)]);
            };
            this.FParent = Result.GetParentComponent();
            if (!(this.FParent != null)) this.FParent = this.FRoot;
          } else {
            Result = null;
            ComponentClass = this.FindComponentClass(CompClassName);
            if (this.FOnCreateComponent != null) this.FOnCreateComponent($Self,ComponentClass,{get: function () {
                return Result;
              }, set: function (v) {
                Result = v;
              }});
            if (!(Result != null)) {
              NewComponent = Object.create(ComponentClass);
              NewComponent.$init();
              if (2 in Flags) NewComponent.FComponentState = rtl.unionSet(NewComponent.FComponentState,rtl.createSet(0,9));
              NewComponent.Create$1(this.FOwner);
              NewComponent.AfterConstruction();
              Result = NewComponent;
            };
            Result.FComponentState = rtl.includeSet(Result.FComponentState,0);
          };
        } catch ($e) {
          if (pas.SysUtils.Exception.isPrototypeOf($e)) {
            var E = $e;
            if (!Recover(E,{get: function () {
                return Result;
              }, set: function (v) {
                Result = v;
              }})) throw $e;
          } else throw $e
        };
        if (Result != null) try {
          Result.FComponentState = rtl.includeSet(Result.FComponentState,0);
          SubComponents = $mod.TList.$create("Create$1");
          for (var $l = 0, $end = Result.GetComponentCount() - 1; $l <= $end; $l++) {
            n = $l;
            C = Result.GetComponent(n);
            if (2 in C.FComponentStyle) {
              SubComponents.Add(C);
              C.FComponentState = rtl.includeSet(C.FComponentState,0);
            };
          };
          if (!(0 in Flags)) try {
            Result.SetParentComponent(this.FParent);
            if (this.FOnSetName != null) this.FOnSetName($Self,Result,{get: function () {
                return Name;
              }, set: function (v) {
                Name = v;
              }});
            Result.SetName(Name);
            if ($mod.FindGlobalComponent(Name) === Result) Result.FComponentState = rtl.includeSet(Result.FComponentState,9);
          } catch ($e) {
            if (pas.SysUtils.Exception.isPrototypeOf($e)) {
              var E = $e;
              if (!Recover(E,{get: function () {
                  return Result;
                }, set: function (v) {
                  Result = v;
                }})) throw $e;
            } else throw $e
          };
          if (!(Result != null)) return Result;
          if (9 in Result.FComponentState) this.FLookupRoot = Result;
          Result.FComponentState = rtl.includeSet(Result.FComponentState,1);
          for (var $l1 = 0, $end1 = SubComponents.GetCount() - 1; $l1 <= $end1; $l1++) {
            n = $l1;
            rtl.getObject(SubComponents.Get(n)).FComponentState = rtl.includeSet(rtl.getObject(SubComponents.Get(n)).FComponentState,1);
          };
          Result.ReadState($Self);
          Result.FComponentState = rtl.excludeSet(Result.FComponentState,1);
          for (var $l2 = 0, $end2 = SubComponents.GetCount() - 1; $l2 <= $end2; $l2++) {
            n = $l2;
            rtl.getObject(SubComponents.Get(n)).FComponentState = rtl.excludeSet(rtl.getObject(SubComponents.Get(n)).FComponentState,1);
          };
          if (1 in Flags) this.FParent.SetChildOrder(Result,ChildPos);
          if (!((0 in Flags) || (9 in Result.FComponentState)) || (this.FLoaded.IndexOf(Result) < 0)) {
            for (var $l3 = 0, $end3 = SubComponents.GetCount() - 1; $l3 <= $end3; $l3++) {
              n = $l3;
              this.FLoaded.Add(SubComponents.Get(n));
            };
            this.FLoaded.Add(Result);
          };
        } catch ($e) {
          if ((0 in Flags) || (Component != null)) Result = rtl.freeLoc(Result);
          throw $e;
        };
      } finally {
        this.FParent = SavedParent;
        this.FLookupRoot = SavedLookupRoot;
        SubComponents = rtl.freeLoc(SubComponents);
      };
      return Result;
    };
    this.ReadComponents = function (AOwner, AParent, Proc) {
      var Component = null;
      this.SetRoot(AOwner);
      this.FOwner = AOwner;
      this.FParent = AParent;
      this.BeginReferences();
      try {
        while (!this.EndOfList()) {
          this.FDriver.BeginRootComponent();
          Component = this.ReadComponent(null);
          if (Proc != null) Proc(Component);
        };
        this.ReadListEnd();
        this.FixupReferences();
      } finally {
        this.EndReferences();
      };
    };
    this.ReadFloat = function () {
      var Result = 0.0;
      if (this.FDriver.NextValue() === $mod.TValueType.vaDouble) {
        this.ReadValue();
        Result = this.FDriver.ReadFloat();
      } else Result = this.ReadNativeInt();
      return Result;
    };
    this.ReadCurrency = function () {
      var Result = 0;
      if (this.FDriver.NextValue() === 14) {
        this.FDriver.ReadValue();
        Result = this.FDriver.ReadCurrency();
      } else Result = this.ReadInteger() * 10000;
      return Result;
    };
    this.ReadIdent = function () {
      var Result = "";
      var ValueType = 0;
      ValueType = this.FDriver.ReadValue();
      if (ValueType in rtl.createSet(7,12,8,9,0)) {
        Result = this.FDriver.ReadIdent(ValueType)}
       else throw $mod.EReadError.$create("Create$1",[rtl.getResStr(pas.RTLConsts,"SInvalidPropertyValue")]);
      return Result;
    };
    this.ReadInteger = function () {
      var Result = 0;
      var $tmp = this.FDriver.ReadValue();
      if ($tmp === 2) {
        Result = this.FDriver.ReadInt8()}
       else if ($tmp === 3) {
        Result = this.FDriver.ReadInt16()}
       else if ($tmp === 4) {
        Result = this.FDriver.ReadInt32()}
       else {
        throw $mod.EReadError.$create("Create$1",[rtl.getResStr(pas.RTLConsts,"SInvalidPropertyValue")]);
      };
      return Result;
    };
    this.ReadNativeInt = function () {
      var Result = 0;
      if (this.FDriver.NextValue() === $mod.TValueType.vaNativeInt) {
        this.FDriver.ReadValue();
        Result = this.FDriver.ReadNativeInt();
      } else Result = this.ReadInteger();
      return Result;
    };
    this.ReadSet = function (EnumType) {
      var Result = 0;
      if (this.FDriver.NextValue() === 11) {
        this.FDriver.ReadValue();
        Result = this.FDriver.ReadSet(EnumType);
      } else Result = this.ReadInteger();
      return Result;
    };
    this.ReadListBegin = function () {
      this.CheckValue(1);
    };
    this.ReadListEnd = function () {
      this.CheckValue(0);
    };
    this.ReadRootComponent = function (ARoot) {
      var Result = null;
      var Dummy = 0;
      var i = 0;
      var Flags = {};
      var CompClassName = "";
      var CompName = "";
      var ResultName = "";
      this.FDriver.BeginRootComponent();
      Result = null;
      try {
        this.FDriver.BeginComponent({get: function () {
            return Flags;
          }, set: function (v) {
            Flags = v;
          }},{get: function () {
            return Dummy;
          }, set: function (v) {
            Dummy = v;
          }},{get: function () {
            return CompClassName;
          }, set: function (v) {
            CompClassName = v;
          }},{get: function () {
            return CompName;
          }, set: function (v) {
            CompName = v;
          }});
        if (!(ARoot != null)) {
          Result = $mod.FindClass(CompClassName).$create("Create$1",[null]);
          Result.SetName(CompName);
        } else {
          Result = ARoot;
          if (!(4 in Result.FComponentState)) {
            Result.FComponentState = rtl.unionSet(Result.FComponentState,rtl.createSet(0,1));
            i = 0;
            ResultName = CompName;
            while ($mod.FindGlobalComponent(ResultName) != null) {
              i += 1;
              ResultName = CompName + "_" + pas.SysUtils.IntToStr(i);
            };
            Result.SetName(ResultName);
          };
        };
        this.FRoot = Result;
        this.FLookupRoot = Result;
        if ($impl.GlobalLoaded != null) {
          this.FLoaded = $impl.GlobalLoaded}
         else this.FLoaded = $mod.TFPList.$create("Create");
        try {
          if (this.FLoaded.IndexOf(this.FRoot) < 0) this.FLoaded.Add(this.FRoot);
          this.FOwner = this.FRoot;
          this.FRoot.FComponentState = rtl.unionSet(this.FRoot.FComponentState,rtl.createSet(0,1));
          this.FRoot.ReadState(this);
          this.FRoot.FComponentState = rtl.excludeSet(this.FRoot.FComponentState,1);
          if (!($impl.GlobalLoaded != null)) for (var $l = 0, $end = this.FLoaded.FCount - 1; $l <= $end; $l++) {
            i = $l;
            rtl.getObject(this.FLoaded.Get(i)).Loaded();
          };
        } finally {
          if (!($impl.GlobalLoaded != null)) rtl.free(this,"FLoaded");
          this.FLoaded = null;
        };
        $impl.GlobalFixupReferences();
      } catch ($e) {
        $mod.RemoveFixupReferences(ARoot,"");
        if (!(ARoot != null)) Result = rtl.freeLoc(Result);
        throw $e;
      };
      return Result;
    };
    this.ReadVariant = function () {
      var Result = undefined;
      var nv = 0;
      nv = this.NextValue();
      var $tmp = nv;
      if ($tmp === 12) {
        Result = undefined;
        this.ReadValue();
      } else if ($tmp === 0) {
        Result = null;
        this.ReadValue();
      } else if (($tmp === 2) || ($tmp === 3) || ($tmp === 4)) {
        Result = this.ReadInteger();
      } else if ($tmp === $mod.TValueType.vaNativeInt) {
        Result = this.ReadNativeInt();
      } else if (($tmp === 8) || ($tmp === 9)) {
        Result = nv !== 8;
        this.ReadValue();
      } else if ($tmp === 14) {
        Result = this.ReadCurrency() / 10000;
      } else if ($tmp === 5) {
        Result = this.ReadFloat();
      } else if ($tmp === 6) {
        Result = this.ReadString();
      } else {
        throw $mod.EReadError.$create("CreateFmt",[rtl.getResStr(pas.RTLConsts,"SUnsupportedPropertyVariantType"),pas.System.VarRecs(0,nv)]);
      };
      return Result;
    };
    this.ReadSignature = function () {
      this.FDriver.ReadSignature();
    };
    this.ReadString = function () {
      var Result = "";
      var StringType = 0;
      StringType = this.FDriver.ReadValue();
      if (StringType === 6) {
        Result = this.FDriver.ReadString(StringType)}
       else throw $mod.EReadError.$create("Create$1",[rtl.getResStr(pas.RTLConsts,"SInvalidPropertyValue")]);
      return Result;
    };
    this.ReadWideString = function () {
      var Result = "";
      Result = this.ReadString();
      return Result;
    };
    this.ReadUnicodeString = function () {
      var Result = "";
      Result = this.ReadString();
      return Result;
    };
    this.ReadValue = function () {
      var Result = 0;
      Result = this.FDriver.ReadValue();
      return Result;
    };
    this.CopyValue = function (Writer) {
      var $tmp = this.FDriver.NextValue();
      if ($tmp === 0) {
        Writer.WriteIdent("NULL")}
       else if ($tmp === 8) {
        Writer.WriteIdent("FALSE")}
       else if ($tmp === 9) {
        Writer.WriteIdent("TRUE")}
       else if ($tmp === 12) {
        Writer.WriteIdent("NIL")}
       else if (($tmp === 2) || ($tmp === 3) || ($tmp === 4)) {
        Writer.WriteInteger(this.ReadInteger())}
       else if ($tmp === $mod.TValueType.vaDouble) {
        Writer.WriteFloat(this.ReadFloat())}
       else if ($tmp === 6) {
        Writer.WriteString(this.ReadString())}
       else if ($tmp === 7) {
        Writer.WriteIdent(this.ReadIdent())}
       else if ($tmp === $mod.TValueType.vaNativeInt) Writer.WriteInteger$1(this.ReadNativeInt());
    };
  });
  rtl.createClass(this,"TAbstractObjectWriter",pas.System.TObject,function () {
  });
  rtl.createClass(this,"TBinaryObjectWriter",this.TAbstractObjectWriter,function () {
    this.$init = function () {
      $mod.TAbstractObjectWriter.$init.call(this);
      this.FStream = null;
      this.FBuffer = null;
      this.FBufSize = 0;
      this.FBufPos = 0;
      this.FBufEnd = 0;
    };
    this.$final = function () {
      this.FStream = undefined;
      $mod.TAbstractObjectWriter.$final.call(this);
    };
    this.WriteWord = function (w) {
      this.FStream.WriteBufferData$12(w);
    };
    this.WriteDWord = function (lw) {
      this.FStream.WriteBufferData$14(lw);
    };
    this.WriteValue = function (Value) {
      var b = 0;
      b = Value;
      this.FStream.WriteBufferData$8(b);
    };
    this.Create$1 = function (Stream) {
      pas.System.TObject.Create.call(this);
      if (Stream === null) throw $mod.EWriteError.$create("Create$1",[rtl.getResStr(pas.RTLConsts,"SEmptyStreamIllegalWriter")]);
      this.FStream = Stream;
      return this;
    };
    this.WriteSignature = function () {
      this.FStream.WriteBufferData$14(809914452);
    };
    this.BeginCollection = function () {
      this.WriteValue(13);
    };
    this.BeginComponent = function (Component, Flags, ChildPos) {
      var Prefix = 0;
      if (rtl.neSet(Flags,{})) {
        Prefix = 0;
        if (0 in Flags) Prefix = Prefix | 0x1;
        if (1 in Flags) Prefix = Prefix | 0x2;
        if (2 in Flags) Prefix = Prefix | 0x4;
        Prefix = Prefix | 0xf0;
        this.FStream.WriteBufferData$8(Prefix);
        if (1 in Flags) this.WriteInteger(ChildPos);
      };
      this.WriteStr(Component.$classname);
      this.WriteStr(Component.FName);
    };
    this.BeginList = function () {
      this.WriteValue(1);
    };
    this.EndList = function () {
      this.WriteValue(0);
    };
    this.BeginProperty = function (PropName) {
      this.WriteStr(PropName);
    };
    this.EndProperty = function () {
    };
    this.FlushBuffer = function () {
    };
    this.Write = function (Buffer, Count) {
      this.FStream.Write(Buffer,Count);
    };
    this.WriteBinary = function (Buffer, Count) {
      this.WriteValue(10);
      this.WriteDWord(Count >>> 0);
      this.FStream.Write(Buffer,Count);
    };
    this.WriteBoolean = function (Value) {
      if (Value) {
        this.WriteValue(9)}
       else this.WriteValue(8);
    };
    this.WriteFloat = function (Value) {
      this.WriteValue(5);
      this.FStream.WriteBufferData$20(Value);
    };
    this.WriteCurrency = function (Value) {
      var F = 0.0;
      this.WriteValue(14);
      F = Value / 10000;
      this.FStream.WriteBufferData$20(F);
    };
    this.WriteIdent = function (Ident) {
      if (pas.SysUtils.UpperCase(Ident) === "NIL") {
        this.WriteValue(12)}
       else if (pas.SysUtils.UpperCase(Ident) === "FALSE") {
        this.WriteValue(8)}
       else if (pas.SysUtils.UpperCase(Ident) === "TRUE") {
        this.WriteValue(9)}
       else if (pas.SysUtils.UpperCase(Ident) === "NULL") {
        this.WriteValue(0)}
       else {
        this.WriteValue(7);
        this.WriteStr(Ident);
      };
    };
    this.WriteInteger = function (Value) {
      var s = 0;
      var i = 0;
      var l = 0;
      if ((Value >= -128) && (Value <= 127)) {
        this.WriteValue(2);
        s = Value;
        this.FStream.WriteBufferData$6(s);
      } else if ((Value >= -32768) && (Value <= 32767)) {
        this.WriteValue(3);
        i = Value;
        this.WriteWord(i & 65535);
      } else if ((Value >= -0x80000000) && (Value <= 0x7fffffff)) {
        this.WriteValue(4);
        l = Value;
        this.WriteDWord(l >>> 0);
      } else {
        this.WriteValue($mod.TValueType.vaNativeInt);
        this.FStream.WriteBufferData$16(Value);
      };
    };
    this.WriteNativeInt = function (Value) {
      var s = 0;
      var i = 0;
      var l = 0;
      if (Value <= 127) {
        this.WriteValue(2);
        s = Value;
        this.FStream.WriteBufferData$6(s);
      } else if (Value <= 32767) {
        this.WriteValue(3);
        i = Value;
        this.WriteWord(i & 65535);
      } else if (Value <= 0x7fffffff) {
        this.WriteValue(4);
        l = Value;
        this.WriteDWord(l >>> 0);
      } else {
        this.WriteValue($mod.TValueType.vaNativeInt);
        this.FStream.WriteBufferData$16(Value);
      };
    };
    this.WriteMethodName = function (Name) {
      if (Name.length > 0) {
        this.WriteValue(7);
        this.WriteStr(Name);
      } else this.WriteValue(12);
    };
    this.WriteSet = function (Value, SetType) {
      var i = 0;
      var b = 0;
      this.WriteValue(11);
      b = 1;
      for (i = 0; i <= 31; i++) {
        if ((Value & b) !== 0) {
          this.WriteStr(pas.TypInfo.GetEnumName(SetType,i));
        };
        b = b << 1;
      };
      this.WriteStr("");
    };
    this.WriteStr = function (Value) {
      var len = 0;
      var i = 0;
      var b = 0;
      len = Value.length;
      if (len > 255) len = 255;
      b = len;
      this.FStream.WriteBufferData$8(b);
      for (var $l = 1, $end = len; $l <= $end; $l++) {
        i = $l;
        this.FStream.WriteBufferData$4(Value.charAt(i - 1));
      };
    };
    this.WriteString = function (Value) {
      var i = 0;
      var len = 0;
      len = Value.length;
      this.WriteValue(6);
      this.WriteDWord(len);
      for (var $l = 1, $end = len; $l <= $end; $l++) {
        i = $l;
        this.FStream.WriteBufferData$4(Value.charAt(i - 1));
      };
    };
    this.WriteWideString = function (Value) {
      this.WriteString(Value);
    };
    this.WriteUnicodeString = function (Value) {
      this.WriteString(Value);
    };
    this.WriteVariant = function (VarValue) {
      if (pas.JS.isUndefined(VarValue)) {
        this.WriteValue(12)}
       else if (pas.JS.isNull(VarValue)) {
        this.WriteValue(0)}
       else if (rtl.isNumber(VarValue)) {
        if (pas.System.Frac(rtl.getNumber(VarValue)) === 0) {
          this.WriteInteger(rtl.trunc(VarValue))}
         else this.WriteFloat(rtl.getNumber(VarValue));
      } else if (pas.JS.isBoolean(VarValue)) {
        this.WriteBoolean(!(VarValue == false))}
       else if (rtl.isString(VarValue)) {
        this.WriteString("" + VarValue)}
       else throw $mod.EWriteError.$create("Create$1",[rtl.getResStr(pas.RTLConsts,"SUnsupportedPropertyVariantType")]);
    };
  });
  this.$rtti.$MethodVar("TFindAncestorEvent",{procsig: rtl.newTIProcSig([["Writer",this.$rtti["TWriter"]],["Component",this.$rtti["TComponent"]],["Name",rtl.string,2],["Ancestor",this.$rtti["TComponent"],1],["RootAncestor",this.$rtti["TComponent"],1]]), methodkind: 0});
  this.$rtti.$MethodVar("TWriteMethodPropertyEvent",{procsig: rtl.newTIProcSig([["Writer",this.$rtti["TWriter"]],["Instance",this.$rtti["TPersistent"]],["PropInfo",pas.TypInfo.$rtti["TTypeMemberProperty"]],["MethodValue",pas.System.$rtti["TMethod"],2],["DefMethodValue",pas.System.$rtti["TMethod"],2],["Handled",rtl.boolean,1]]), methodkind: 0});
  rtl.createClass(this,"TWriter",this.TFiler,function () {
    this.$init = function () {
      $mod.TFiler.$init.call(this);
      this.FDriver = null;
      this.FDestroyDriver = false;
      this.FRootAncestor = null;
      this.FPropPath = "";
      this.FAncestors = null;
      this.FAncestorPos = 0;
      this.FCurrentPos = 0;
      this.FOnFindAncestor = null;
      this.FOnWriteMethodProperty = null;
      this.FOnWriteStringProperty = null;
    };
    this.$final = function () {
      this.FDriver = undefined;
      this.FRootAncestor = undefined;
      this.FAncestors = undefined;
      this.FOnFindAncestor = undefined;
      this.FOnWriteMethodProperty = undefined;
      this.FOnWriteStringProperty = undefined;
      $mod.TFiler.$final.call(this);
    };
    this.AddToAncestorList = function (Component) {
      this.FAncestors.AddObject(Component.FName,$impl.TPosComponent.$create("Create$1",[this.FAncestors.GetCount(),Component]));
    };
    this.WriteComponentData = function (Instance) {
      var Flags = {};
      Flags = {};
      if ((this.FAncestor != null) && (!(9 in Instance.FComponentState) || ((5 in Instance.FComponentState) && (this.FAncestors !== null)))) {
        Flags = rtl.createSet(0)}
       else if (9 in Instance.FComponentState) Flags = rtl.createSet(2);
      if ((this.FAncestors !== null) && ((this.FCurrentPos !== this.FAncestorPos) || (this.FAncestor === null))) Flags = rtl.includeSet(Flags,1);
      this.FDriver.BeginComponent(Instance,rtl.refSet(Flags),this.FCurrentPos);
      if (this.FAncestors !== null) this.FCurrentPos += 1;
      this.WriteProperties(Instance);
      this.WriteListEnd();
      if (!this.FIgnoreChildren) this.WriteChildren(Instance);
    };
    this.DetermineAncestor = function (Component) {
      var I = 0;
      if (!(this.FAncestors != null)) return;
      I = this.FAncestors.IndexOf(Component.FName);
      if (I === -1) {
        this.FAncestor = null;
        this.FAncestorPos = -1;
      } else {
        var $with = this.FAncestors.GetObject(I);
        this.FAncestor = $with.FComponent;
        this.FAncestorPos = $with.FPos;
      };
    };
    this.DoFindAncestor = function (Component) {
      var C = null;
      if (this.FOnFindAncestor != null) if ((this.FAncestor === null) || $mod.TComponent.isPrototypeOf(this.FAncestor)) {
        C = this.FAncestor;
        this.FOnFindAncestor(this,Component,Component.FName,{get: function () {
            return C;
          }, set: function (v) {
            C = v;
          }},{p: this, get: function () {
            return this.p.FRootAncestor;
          }, set: function (v) {
            this.p.FRootAncestor = v;
          }});
        this.FAncestor = C;
      };
    };
    this.SetRoot = function (ARoot) {
      $mod.TFiler.SetRoot.call(this,ARoot);
      this.FLookupRoot = ARoot;
    };
    this.WriteBinary = function (AWriteData) {
      var MemBuffer = null;
      MemBuffer = $mod.TBytesStream.$create("Create");
      try {
        AWriteData(MemBuffer);
        this.FDriver.WriteBinary(MemBuffer.GetBytes(),MemBuffer.GetSize());
      } finally {
        MemBuffer = rtl.freeLoc(MemBuffer);
      };
    };
    this.WriteProperty = function (Instance, PropInfo) {
      var HasAncestor = false;
      var PropType = null;
      var N = 0;
      var Value = 0;
      var DefValue = 0;
      var Ident = "";
      var IntToIdentFn = null;
      var FloatValue = 0.0;
      var DefFloatValue = 0.0;
      var MethodValue = pas.System.TMethod.$new();
      var DefMethodValue = pas.System.TMethod.$new();
      var StrValue = "";
      var DefStrValue = "";
      var AncestorObj = null;
      var C = null;
      var Component = null;
      var ObjValue = null;
      var SavedAncestor = null;
      var Key = "";
      var SavedPropPath = "";
      var Name = "";
      var lMethodName = "";
      var VarValue = undefined;
      var DefVarValue = undefined;
      var BoolValue = false;
      var DefBoolValue = false;
      var Handled = false;
      var O = null;
      if (PropInfo.getter === "") return;
      PropType = PropInfo.typeinfo;
      if (PropInfo.setter === "") {
        if (PropType.kind !== 13) return;
        ObjValue = pas.TypInfo.GetObjectProp$2(Instance,PropInfo);
        if (!ObjValue.$class.InheritsFrom($mod.TComponent) || !(2 in ObjValue.FComponentStyle)) return;
      };
      HasAncestor = (this.FAncestor != null) && ((Instance === this.FRoot) || (Instance.$class.ClassType() === this.FAncestor.$class.ClassType()));
      var $tmp = PropType.kind;
      if (($tmp === 1) || ($tmp === 2) || ($tmp === 4) || ($tmp === 5)) {
        Value = pas.TypInfo.GetOrdProp$1(Instance,PropInfo);
        if (HasAncestor) {
          DefValue = pas.TypInfo.GetOrdProp$1(this.FAncestor,PropInfo)}
         else {
          if (PropType.kind !== 5) {
            DefValue = rtl.trunc(PropInfo.Default)}
           else {
            O = PropInfo.Default;
            DefValue = 0;
            for (Key in O) {
              N = parseInt(Key,10);
              if (N < 32) DefValue = DefValue + (1 << N);
            };
          };
        };
        if ((Value !== DefValue) || (DefValue === 0x80000000)) {
          this.FDriver.BeginProperty(this.FPropPath + PropInfo.name);
          var $tmp1 = PropType.kind;
          if ($tmp1 === 1) {
            IntToIdentFn = $mod.FindIntToIdent(PropInfo.typeinfo);
            if ((IntToIdentFn != null) && IntToIdentFn(Value,{get: function () {
                return Ident;
              }, set: function (v) {
                Ident = v;
              }})) {
              this.WriteIdent(Ident)}
             else this.WriteInteger(Value);
          } else if ($tmp1 === 2) {
            this.WriteChar(String.fromCharCode(Value))}
           else if ($tmp1 === 5) {
            this.FDriver.WriteSet(Value,PropType.comptype);
          } else if ($tmp1 === 4) this.WriteIdent(pas.TypInfo.GetEnumName(PropType,Value));
          this.FDriver.EndProperty();
        };
      } else if ($tmp === pas.System.TTypeKind.tkDouble) {
        FloatValue = pas.TypInfo.GetFloatProp$1(Instance,PropInfo);
        if (HasAncestor) {
          DefFloatValue = pas.TypInfo.GetFloatProp$1(this.FAncestor,PropInfo)}
         else {
          DefFloatValue = rtl.getNumber(PropInfo.Default);
        };
        if ((FloatValue !== DefFloatValue) || (!HasAncestor && (pas.System.Int(DefFloatValue) === 0x80000000))) {
          this.FDriver.BeginProperty(this.FPropPath + PropInfo.name);
          this.WriteFloat(FloatValue);
          this.FDriver.EndProperty();
        };
      } else if ($tmp === 9) {
        MethodValue.$assign(pas.TypInfo.GetMethodProp(Instance,PropInfo));
        if (HasAncestor) {
          DefMethodValue.$assign(pas.TypInfo.GetMethodProp(this.FAncestor,PropInfo))}
         else {
          DefMethodValue.Data = null;
          DefMethodValue.Code = null;
        };
        Handled = false;
        if (this.FOnWriteMethodProperty != null) this.FOnWriteMethodProperty(this,Instance,PropInfo,MethodValue,DefMethodValue,{get: function () {
            return Handled;
          }, set: function (v) {
            Handled = v;
          }});
        if (rtl.isString(MethodValue.Code)) {
          lMethodName = MethodValue.Code}
         else lMethodName = this.FLookupRoot.$class.MethodName(MethodValue.Code);
        if (!Handled && (MethodValue.Code !== DefMethodValue.Code) && (!(MethodValue.Code != null) || (lMethodName.length > 0))) {
          this.FDriver.BeginProperty(this.FPropPath + PropInfo.name);
          if (MethodValue.Code != null) {
            this.FDriver.WriteMethodName(lMethodName)}
           else this.FDriver.WriteMethodName("");
          this.FDriver.EndProperty();
        };
      } else if ($tmp === 3) {
        StrValue = pas.TypInfo.GetStrProp$1(Instance,PropInfo);
        if (HasAncestor) {
          DefStrValue = pas.TypInfo.GetStrProp$1(this.FAncestor,PropInfo)}
         else {
          DefValue = rtl.trunc(PropInfo.Default);
          DefStrValue = rtl.strSetLength(DefStrValue,0);
        };
        if ((StrValue !== DefStrValue) || (!HasAncestor && (DefValue === 0x80000000))) {
          this.FDriver.BeginProperty(this.FPropPath + PropInfo.name);
          if (this.FOnWriteStringProperty != null) this.FOnWriteStringProperty(this,Instance,PropInfo,{get: function () {
              return StrValue;
            }, set: function (v) {
              StrValue = v;
            }});
          this.WriteString(StrValue);
          this.FDriver.EndProperty();
        };
      } else if ($tmp === 16) {
        VarValue = pas.TypInfo.GetJSValueProp$3(Instance,PropInfo);
        if (HasAncestor) {
          DefVarValue = pas.TypInfo.GetJSValueProp$3(this.FAncestor,PropInfo)}
         else DefVarValue = null;
        if (VarValue != DefVarValue) {
          this.FDriver.BeginProperty(this.FPropPath + PropInfo.name);
          this.WriteVariant(VarValue);
          this.FDriver.EndProperty();
        };
      } else if ($tmp === 13) {
        ObjValue = pas.TypInfo.GetObjectProp$2(Instance,PropInfo);
        if (HasAncestor) {
          AncestorObj = pas.TypInfo.GetObjectProp$2(this.FAncestor,PropInfo);
          if ($mod.TComponent.isPrototypeOf(AncestorObj) && $mod.TComponent.isPrototypeOf(ObjValue)) {
            if ((AncestorObj !== ObjValue) && (AncestorObj.FOwner === this.FRootAncestor) && (ObjValue.FOwner === this.FRoot) && (pas.SysUtils.UpperCase(AncestorObj.FName) === pas.SysUtils.UpperCase(ObjValue.FName))) {
              AncestorObj = ObjValue;
            };
          };
        } else AncestorObj = null;
        if (!(ObjValue != null)) {
          if (ObjValue !== AncestorObj) {
            this.FDriver.BeginProperty(this.FPropPath + PropInfo.name);
            this.FDriver.WriteIdent("NIL");
            this.FDriver.EndProperty();
          };
        } else if (ObjValue.$class.InheritsFrom($mod.TPersistent)) {
          if (ObjValue.$class.InheritsFrom($mod.TComponent) && (!(2 in ObjValue.FComponentStyle) || ((ObjValue.FOwner !== Instance) && (ObjValue.FOwner !== null)))) {
            Component = ObjValue;
            if ((ObjValue !== AncestorObj) && !(3 in Component.FComponentStyle)) {
              Name = "";
              C = Component;
              while ((C !== null) && (C.FName !== "")) {
                if (Name !== "") Name = "." + Name;
                if (C.FOwner === this.FLookupRoot) {
                  Name = C.FName + Name;
                  break;
                } else if (C === this.FLookupRoot) {
                  Name = "Owner" + Name;
                  break;
                };
                Name = C.FName + Name;
                C = C.FOwner;
              };
              if ((C === null) && (Component.FOwner === null)) if (Name !== "") Name = Name + ".Owner";
              if (Name.length > 0) {
                this.FDriver.BeginProperty(this.FPropPath + PropInfo.name);
                this.WriteIdent(Name);
                this.FDriver.EndProperty();
              };
            };
          } else {
            SavedAncestor = this.FAncestor;
            SavedPropPath = this.FPropPath;
            try {
              this.FPropPath = this.FPropPath + PropInfo.name + ".";
              if (HasAncestor) this.FAncestor = pas.TypInfo.GetObjectProp$2(this.FAncestor,PropInfo);
              this.WriteProperties(ObjValue);
            } finally {
              this.FAncestor = SavedAncestor;
              this.FPropPath = SavedPropPath;
            };
            if (ObjValue.$class.InheritsFrom($mod.TCollection)) {
              if (!HasAncestor || !$mod.CollectionsEqual$1(ObjValue,pas.TypInfo.GetObjectProp$2(this.FAncestor,PropInfo),this.FRoot,this.FRootAncestor)) {
                this.FDriver.BeginProperty(this.FPropPath + PropInfo.name);
                SavedPropPath = this.FPropPath;
                try {
                  this.FPropPath = rtl.strSetLength(this.FPropPath,0);
                  this.WriteCollection(ObjValue);
                } finally {
                  this.FPropPath = SavedPropPath;
                  this.FDriver.EndProperty();
                };
              };
            };
          };
        };
      } else if ($tmp === 7) {
        BoolValue = pas.TypInfo.GetOrdProp$1(Instance,PropInfo) !== 0;
        if (HasAncestor) {
          DefBoolValue = pas.TypInfo.GetOrdProp$1(this.FAncestor,PropInfo) !== 0}
         else {
          DefBoolValue = PropInfo.Default != 0;
          DefValue = rtl.trunc(PropInfo.Default);
        };
        if ((BoolValue !== DefBoolValue) || (DefValue === 0x80000000)) {
          this.FDriver.BeginProperty(this.FPropPath + PropInfo.name);
          this.WriteBoolean(BoolValue);
          this.FDriver.EndProperty();
        };
      } else if ($tmp === 18) ;
    };
    this.WriteProperties = function (Instance) {
      var PropCount = 0;
      var i = 0;
      var PropList = [];
      PropList = pas.TypInfo.GetPropList$3(Instance);
      PropCount = rtl.length(PropList);
      if (PropCount > 0) for (var $l = 0, $end = PropCount - 1; $l <= $end; $l++) {
        i = $l;
        if (pas.TypInfo.IsStoredProp(Instance,PropList[i])) this.WriteProperty(Instance,PropList[i]);
      };
      Instance.DefineProperties(this);
    };
    this.WriteChildren = function (Component) {
      var SRoot = null;
      var SRootA = null;
      var SList = null;
      var SPos = 0;
      var I = 0;
      var SAncestorPos = 0;
      var O = null;
      SRoot = this.FRoot;
      SRootA = this.FRootAncestor;
      SList = this.FAncestors;
      SPos = this.FCurrentPos;
      SAncestorPos = this.FAncestorPos;
      try {
        this.FAncestors = null;
        this.FCurrentPos = 0;
        this.FAncestorPos = -1;
        if (9 in Component.FComponentState) this.FRoot = Component;
        if ($mod.TComponent.isPrototypeOf(this.FAncestor)) {
          this.FAncestors = $mod.TStringList.$create("Create$1");
          if (9 in this.FAncestor.FComponentState) this.FRootAncestor = this.FAncestor;
          this.FAncestor.GetChildren(rtl.createCallback(this,"AddToAncestorList"),this.FRootAncestor);
          this.FAncestors.SetSorted(true);
        };
        try {
          Component.GetChildren(rtl.createCallback(this,"WriteComponent"),this.FRoot);
        } finally {
          if (this.FAncestors != null) for (var $l = 0, $end = this.FAncestors.GetCount() - 1; $l <= $end; $l++) {
            I = $l;
            O = this.FAncestors.GetObject(I);
            this.FAncestors.PutObject(I,null);
            O = rtl.freeLoc(O);
          };
          pas.SysUtils.FreeAndNil({p: this, get: function () {
              return this.p.FAncestors;
            }, set: function (v) {
              this.p.FAncestors = v;
            }});
        };
      } finally {
        this.FAncestors = SList;
        this.FRoot = SRoot;
        this.FRootAncestor = SRootA;
        this.FCurrentPos = SPos;
        this.FAncestorPos = SAncestorPos;
      };
    };
    this.CreateDriver = function (Stream) {
      var Result = null;
      Result = $mod.TBinaryObjectWriter.$create("Create$1",[Stream]);
      return Result;
    };
    this.Create$1 = function (ADriver) {
      pas.System.TObject.Create.call(this);
      this.FDriver = ADriver;
      return this;
    };
    this.Create$2 = function (Stream) {
      pas.System.TObject.Create.call(this);
      if (Stream === null) throw $mod.EWriteError.$create("Create$1",[rtl.getResStr(pas.RTLConsts,"SEmptyStreamIllegalWriter")]);
      this.FDriver = this.CreateDriver(Stream);
      this.FDestroyDriver = true;
      return this;
    };
    this.Destroy = function () {
      if (this.FDestroyDriver) rtl.free(this,"FDriver");
      pas.System.TObject.Destroy.call(this);
    };
    this.DefineProperty = function (Name, ReadData, AWriteData, HasData) {
      if (HasData && (AWriteData != null)) {
        this.FDriver.BeginProperty(this.FPropPath + Name);
        AWriteData(this);
        this.FDriver.EndProperty();
      } else if (ReadData != null) ;
    };
    this.DefineBinaryProperty = function (Name, ReadData, AWriteData, HasData) {
      if (HasData && (AWriteData != null)) {
        this.FDriver.BeginProperty(this.FPropPath + Name);
        this.WriteBinary(AWriteData);
        this.FDriver.EndProperty();
      } else if (ReadData != null) ;
    };
    this.FlushBuffer = function () {
      this.FDriver.FlushBuffer();
    };
    this.Write = function (Buffer, Count) {
      this.FDriver.Write(Buffer,Count);
    };
    this.WriteBoolean = function (Value) {
      this.FDriver.WriteBoolean(Value);
    };
    this.WriteCollection = function (Value) {
      var i = 0;
      this.FDriver.BeginCollection();
      if (Value != null) for (var $l = 0, $end = Value.GetCount() - 1; $l <= $end; $l++) {
        i = $l;
        this.WriteListBegin();
        this.WriteProperties(Value.GetItem(i));
        this.WriteListEnd();
      };
      this.WriteListEnd();
    };
    this.WriteComponent = function (Component) {
      var SA = null;
      var SR = null;
      var SRA = null;
      SR = this.FRoot;
      SA = this.FAncestor;
      SRA = this.FRootAncestor;
      try {
        Component.FComponentState = rtl.unionSet(Component.FComponentState,rtl.createSet(2));
        try {
          this.DetermineAncestor(Component);
          this.DoFindAncestor(Component);
          Component.WriteState(this);
          this.FDriver.EndList();
        } finally {
          Component.FComponentState = rtl.diffSet(Component.FComponentState,rtl.createSet(2));
        };
      } finally {
        this.FAncestor = SA;
        this.FRoot = SR;
        this.FRootAncestor = SRA;
      };
    };
    this.WriteChar = function (Value) {
      this.WriteString(Value);
    };
    this.WriteWideChar = function (Value) {
      this.WriteWideString(Value);
    };
    this.WriteDescendent = function (ARoot, AAncestor) {
      this.FRoot = ARoot;
      this.FAncestor = AAncestor;
      this.FRootAncestor = AAncestor;
      this.FLookupRoot = ARoot;
      this.WriteSignature();
      this.WriteComponent(ARoot);
    };
    this.WriteFloat = function (Value) {
      this.FDriver.WriteFloat(Value);
    };
    this.WriteCurrency = function (Value) {
      this.FDriver.WriteCurrency(Value);
    };
    this.WriteIdent = function (Ident) {
      this.FDriver.WriteIdent(Ident);
    };
    this.WriteInteger = function (Value) {
      this.FDriver.WriteInteger(Value);
    };
    this.WriteInteger$1 = function (Value) {
      this.FDriver.WriteInteger(Value);
    };
    this.WriteSet = function (Value, SetType) {
      this.FDriver.WriteSet(Value,SetType);
    };
    this.WriteListBegin = function () {
      this.FDriver.BeginList();
    };
    this.WriteListEnd = function () {
      this.FDriver.EndList();
    };
    this.WriteSignature = function () {
      this.FDriver.WriteSignature();
    };
    this.WriteRootComponent = function (ARoot) {
      this.WriteDescendent(ARoot,null);
    };
    this.WriteString = function (Value) {
      this.FDriver.WriteString(Value);
    };
    this.WriteWideString = function (Value) {
      this.FDriver.WriteWideString(Value);
    };
    this.WriteUnicodeString = function (Value) {
      this.FDriver.WriteUnicodeString(Value);
    };
    this.WriteVariant = function (VarValue) {
      this.FDriver.WriteVariant(VarValue);
    };
  });
  this.TParserToken = {"0": "toUnknown", toUnknown: 0, "1": "toEOF", toEOF: 1, "2": "toSymbol", toSymbol: 2, "3": "ToString", ToString: 3, "4": "toInteger", toInteger: 4, "5": "toFloat", toFloat: 5, "6": "toMinus", toMinus: 6, "7": "toSetStart", toSetStart: 7, "8": "toListStart", toListStart: 8, "9": "toCollectionStart", toCollectionStart: 9, "10": "toBinaryStart", toBinaryStart: 10, "11": "toSetEnd", toSetEnd: 11, "12": "toListEnd", toListEnd: 12, "13": "toCollectionEnd", toCollectionEnd: 13, "14": "toBinaryEnd", toBinaryEnd: 14, "15": "toComma", toComma: 15, "16": "toDot", toDot: 16, "17": "toEqual", toEqual: 17, "18": "toColon", toColon: 18, "19": "toPlus", toPlus: 19};
  this.$rtti.$Enum("TParserToken",{minvalue: 0, maxvalue: 19, ordtype: 1, enumtype: this.TParserToken});
  rtl.createClass(this,"TParser",pas.System.TObject,function () {
    this.$init = function () {
      pas.System.TObject.$init.call(this);
      this.fStream = null;
      this.fBuf = [];
      this.FBufLen = 0;
      this.fPos = 0;
      this.fDeltaPos = 0;
      this.fFloatType = "";
      this.fSourceLine = 0;
      this.fToken = 0;
      this.fEofReached = false;
      this.fLastTokenStr = "";
    };
    this.$final = function () {
      this.fStream = undefined;
      this.fBuf = undefined;
      pas.System.TObject.$final.call(this);
    };
    this.GetTokenName = function (aTok) {
      var Result = "";
      Result = $impl.TokNames[aTok];
      return Result;
    };
    this.LoadBuffer = function () {
      var CharsRead = 0;
      var i = 0;
      CharsRead = 0;
      for (i = 0; i <= 4095; i++) {
        if (this.fStream.ReadData$3({a: i, p: this.fBuf, get: function () {
            return this.p[this.a];
          }, set: function (v) {
            this.p[this.a] = v;
          }}) !== 2) break;
        CharsRead += 1;
      };
      this.fDeltaPos += CharsRead;
      this.fPos = 0;
      this.FBufLen = CharsRead;
      this.fEofReached = CharsRead === 0;
    };
    this.CheckLoadBuffer = function () {
      if (this.fPos >= this.FBufLen) this.LoadBuffer();
    };
    this.ProcessChar = function () {
      this.fLastTokenStr = this.fLastTokenStr + this.fBuf[this.fPos];
      this.GotoToNextChar();
    };
    this.IsNumber = function () {
      var Result = false;
      Result = this.fBuf[this.fPos].charCodeAt() in rtl.createSet(null,48,57);
      return Result;
    };
    this.IsHexNum = function () {
      var Result = false;
      Result = this.fBuf[this.fPos].charCodeAt() in rtl.createSet(null,48,57,null,65,70,null,97,102);
      return Result;
    };
    this.IsAlpha = function () {
      var Result = false;
      Result = this.fBuf[this.fPos].charCodeAt() in rtl.createSet(95,null,65,90,null,97,122);
      return Result;
    };
    this.IsAlphaNum = function () {
      var Result = false;
      Result = this.IsAlpha() || this.IsNumber();
      return Result;
    };
    this.GetHexValue = function (c) {
      var Result = 0;
      var $tmp = c;
      if (($tmp >= "0") && ($tmp <= "9")) {
        Result = c.charCodeAt() - 0x30}
       else if (($tmp >= "A") && ($tmp <= "F")) {
        Result = c.charCodeAt() - 0x37}
       else if (($tmp >= "a") && ($tmp <= "f")) Result = c.charCodeAt() - 0x57;
      return Result;
    };
    this.GetAlphaNum = function () {
      var Result = "";
      if (!this.IsAlpha()) this.ErrorFmt(rtl.getResStr(pas.RTLConsts,"SParserExpected"),pas.System.VarRecs(18,this.GetTokenName(2)));
      Result = "";
      while (this.IsAlphaNum()) {
        Result = Result + this.fBuf[this.fPos];
        this.GotoToNextChar();
      };
      return Result;
    };
    this.HandleNewLine = function () {
      if (this.fBuf[this.fPos] === "\r") this.GotoToNextChar();
      if (this.fBuf[this.fPos] === "\n") this.GotoToNextChar();
      this.fSourceLine += 1;
      this.fDeltaPos = -(this.fPos - 1);
    };
    this.SkipBOM = function () {
    };
    this.SkipSpaces = function () {
      while (!this.fEofReached && (this.fBuf[this.fPos].charCodeAt() in rtl.createSet(32,9))) this.GotoToNextChar();
    };
    this.SkipWhitespace = function () {
      while (!this.fEofReached) {
        var $tmp = this.fBuf[this.fPos];
        if (($tmp === " ") || ($tmp === "\t")) {
          this.SkipSpaces()}
         else if (($tmp === "\n") || ($tmp === "\r")) {
          this.HandleNewLine()}
         else {
          break;
        };
      };
    };
    this.HandleEof = function () {
      this.fToken = 1;
      this.fLastTokenStr = "";
    };
    this.HandleAlphaNum = function () {
      this.fLastTokenStr = this.GetAlphaNum();
      this.fToken = 2;
    };
    var floatPunct = {"0": "fpDot", fpDot: 0, "1": "fpE", fpE: 1};
    this.HandleNumber = function () {
      var allowed = {};
      this.fLastTokenStr = "";
      while (this.IsNumber()) this.ProcessChar();
      this.fToken = 4;
      if (this.fBuf[this.fPos].charCodeAt() in rtl.createSet(46,101,69)) {
        this.fToken = 5;
        allowed = rtl.createSet(0,1);
        while (this.fBuf[this.fPos].charCodeAt() in rtl.createSet(46,101,69,null,48,57)) {
          var $tmp = this.fBuf[this.fPos];
          if ($tmp === ".") {
            if (0 in allowed) {
              allowed = rtl.excludeSet(allowed,0)}
             else break}
           else if (($tmp === "E") || ($tmp === "e")) if (1 in allowed) {
            allowed = {};
            this.ProcessChar();
            if (this.fBuf[this.fPos].charCodeAt() in rtl.createSet(43,45)) this.ProcessChar();
            if (!(this.fBuf[this.fPos].charCodeAt() in rtl.createSet(null,48,57))) this.ErrorFmt(rtl.getResStr(pas.RTLConsts,"SParserInvalidFloat"),pas.System.VarRecs(18,this.fLastTokenStr + this.fBuf[this.fPos]));
          } else break;
          this.ProcessChar();
        };
      };
      if (this.fBuf[this.fPos].charCodeAt() in rtl.createSet(115,83,100,68,99,67)) {
        this.fFloatType = this.fBuf[this.fPos];
        this.GotoToNextChar();
        this.fToken = 5;
      } else this.fFloatType = "\x00";
    };
    this.HandleHexNumber = function () {
      var valid = false;
      this.fLastTokenStr = "$";
      this.GotoToNextChar();
      valid = false;
      while (this.IsHexNum()) {
        valid = true;
        this.ProcessChar();
      };
      if (!valid) this.ErrorFmt(rtl.getResStr(pas.RTLConsts,"SParserInvalidInteger"),pas.System.VarRecs(18,this.fLastTokenStr));
      this.fToken = 4;
    };
    this.HandleQuotedString = function () {
      var Result = "";
      Result = "";
      this.GotoToNextChar();
      while (true) {
        var $tmp = this.fBuf[this.fPos];
        if ($tmp === "\x00") {
          this.ErrorStr(rtl.getResStr(pas.RTLConsts,"SParserUnterminatedString"))}
         else if (($tmp === "\r") || ($tmp === "\n")) {
          this.ErrorStr(rtl.getResStr(pas.RTLConsts,"SParserUnterminatedString"))}
         else if ($tmp === "'") {
          this.GotoToNextChar();
          if (this.fBuf[this.fPos] !== "'") return Result;
        };
        Result = Result + this.fBuf[this.fPos];
        this.GotoToNextChar();
      };
      return Result;
    };
    this.HandleDecimalCharacter = function () {
      var Result = "";
      var i = 0;
      this.GotoToNextChar();
      i = 0;
      while (this.IsNumber() && (i < 65535)) {
        i = ((i * 10) + this.fBuf[this.fPos].charCodeAt()) - 48;
        this.GotoToNextChar();
      };
      if (i > 65535) i = 0;
      Result = String.fromCharCode(i);
      return Result;
    };
    this.HandleString = function () {
      var s = "";
      this.fLastTokenStr = "";
      while (true) {
        var $tmp = this.fBuf[this.fPos];
        if ($tmp === "'") {
          s = this.HandleQuotedString();
          this.fLastTokenStr = this.fLastTokenStr + s;
        } else if ($tmp === "#") {
          this.fLastTokenStr = this.fLastTokenStr + this.HandleDecimalCharacter();
        } else {
          break;
        };
      };
      this.fToken = 3;
    };
    this.HandleMinus = function () {
      this.GotoToNextChar();
      if (this.IsNumber()) {
        this.HandleNumber();
        this.fLastTokenStr = "-" + this.fLastTokenStr;
      } else {
        this.fToken = 6;
        this.fLastTokenStr = "-";
      };
    };
    this.HandleUnknown = function () {
      this.fToken = 0;
      this.fLastTokenStr = this.fBuf[this.fPos];
      this.GotoToNextChar();
    };
    this.GotoToNextChar = function () {
      this.fPos += 1;
      this.CheckLoadBuffer();
    };
    this.Create$1 = function (Stream) {
      this.fStream = Stream;
      this.fBuf = rtl.arraySetLength(this.fBuf,"",4096);
      this.FBufLen = 0;
      this.fPos = 0;
      this.fDeltaPos = 1;
      this.fSourceLine = 1;
      this.fEofReached = false;
      this.fLastTokenStr = "";
      this.fFloatType = "\x00";
      this.fToken = 1;
      this.LoadBuffer();
      this.SkipBOM();
      this.NextToken();
      return this;
    };
    this.Destroy = function () {
      var aCount = 0;
      aCount = this.fLastTokenStr.length * 2;
      this.fStream.SetPosition(this.SourcePos() - aCount);
    };
    this.CheckToken = function (T) {
      if (this.fToken !== T) this.ErrorFmt(rtl.getResStr(pas.RTLConsts,"SParserWrongTokenType"),pas.System.VarRecs(18,this.GetTokenName(T),18,this.GetTokenName(this.fToken)));
    };
    this.CheckTokenSymbol = function (S) {
      this.CheckToken(2);
      if (pas.SysUtils.CompareText(this.fLastTokenStr,S) !== 0) this.ErrorFmt(rtl.getResStr(pas.RTLConsts,"SParserWrongTokenSymbol"),pas.System.VarRecs(18,S,18,this.fLastTokenStr));
    };
    this.Error = function (Ident) {
      this.ErrorStr(Ident);
    };
    this.ErrorFmt = function (Ident, Args) {
      this.ErrorStr(pas.SysUtils.Format(Ident,Args));
    };
    this.ErrorStr = function (Message) {
      throw $mod.EParserError.$create("CreateFmt",[Message + rtl.getResStr(pas.RTLConsts,"SParserLocInfo"),pas.System.VarRecs(0,this.fSourceLine,0,this.fPos + this.fDeltaPos,0,this.SourcePos())]);
    };
    this.HexToBinary = function (Stream) {
      var outbuf = [];
      var b = 0;
      var i = 0;
      outbuf = rtl.arraySetLength(outbuf,0,4096);
      i = 0;
      this.SkipWhitespace();
      while (this.IsHexNum()) {
        b = this.GetHexValue(this.fBuf[this.fPos]) << 4;
        this.GotoToNextChar();
        if (!this.IsHexNum()) this.Error(rtl.getResStr(pas.RTLConsts,"SParserUnterminatedBinValue"));
        b = b | this.GetHexValue(this.fBuf[this.fPos]);
        this.GotoToNextChar();
        outbuf[i] = b;
        i += 1;
        if (i >= 4096) {
          Stream.WriteBuffer(outbuf,i);
          i = 0;
        };
        this.SkipWhitespace();
      };
      if (i > 0) Stream.WriteBuffer(outbuf,i);
      this.NextToken();
    };
    this.NextToken = function () {
      var $Self = this;
      var Result = 0;
      function SetToken(aToken) {
        $Self.fToken = aToken;
        $Self.GotoToNextChar();
      };
      this.SkipWhitespace();
      if (this.fEofReached) {
        this.HandleEof()}
       else {
        var $tmp = this.fBuf[this.fPos];
        if (($tmp === "_") || (($tmp >= "A") && ($tmp <= "Z")) || (($tmp >= "a") && ($tmp <= "z"))) {
          this.HandleAlphaNum()}
         else if ($tmp === "$") {
          this.HandleHexNumber()}
         else if ($tmp === "-") {
          this.HandleMinus()}
         else if (($tmp >= "0") && ($tmp <= "9")) {
          this.HandleNumber()}
         else if (($tmp === "'") || ($tmp === "#")) {
          this.HandleString()}
         else if ($tmp === "[") {
          SetToken(7)}
         else if ($tmp === "(") {
          SetToken(8)}
         else if ($tmp === "<") {
          SetToken(9)}
         else if ($tmp === "{") {
          SetToken(10)}
         else if ($tmp === "]") {
          SetToken(11)}
         else if ($tmp === ")") {
          SetToken(12)}
         else if ($tmp === ">") {
          SetToken(13)}
         else if ($tmp === "}") {
          SetToken(14)}
         else if ($tmp === ",") {
          SetToken(15)}
         else if ($tmp === ".") {
          SetToken(16)}
         else if ($tmp === "=") {
          SetToken(17)}
         else if ($tmp === ":") {
          SetToken(18)}
         else if ($tmp === "+") {
          SetToken(19)}
         else {
          this.HandleUnknown();
        };
      };
      Result = this.fToken;
      return Result;
    };
    this.SourcePos = function () {
      var Result = 0;
      Result = (this.fStream.GetPosition() - this.FBufLen) + this.fPos;
      return Result;
    };
    this.TokenComponentIdent = function () {
      var Result = "";
      if (this.fToken !== 2) this.ErrorFmt(rtl.getResStr(pas.RTLConsts,"SParserExpected"),pas.System.VarRecs(18,this.GetTokenName(2)));
      this.CheckLoadBuffer();
      while (this.fBuf[this.fPos] === ".") {
        this.ProcessChar();
        this.fLastTokenStr = this.fLastTokenStr + this.GetAlphaNum();
      };
      Result = this.fLastTokenStr;
      return Result;
    };
    this.TokenFloat = function () {
      var Result = 0.0;
      var errcode = 0;
      pas.System.val$8(this.fLastTokenStr,{get: function () {
          return Result;
        }, set: function (v) {
          Result = v;
        }},{get: function () {
          return errcode;
        }, set: function (v) {
          errcode = v;
        }});
      if (errcode !== 0) this.ErrorFmt(rtl.getResStr(pas.RTLConsts,"SParserInvalidFloat"),pas.System.VarRecs(18,this.fLastTokenStr));
      return Result;
    };
    this.TokenInt = function () {
      var Result = 0;
      if (!pas.SysUtils.TryStrToInt64(this.fLastTokenStr,{get: function () {
          return Result;
        }, set: function (v) {
          Result = v;
        }})) Result = pas.SysUtils.StrToQWord(this.fLastTokenStr);
      return Result;
    };
    this.TokenString = function () {
      var Result = "";
      var $tmp = this.fToken;
      if ($tmp === 5) {
        if (this.fFloatType !== "\x00") {
          Result = this.fLastTokenStr + this.fFloatType}
         else Result = this.fLastTokenStr}
       else {
        Result = this.fLastTokenStr;
      };
      return Result;
    };
    this.TokenSymbolIs = function (S) {
      var Result = false;
      Result = (this.fToken === 2) && (pas.SysUtils.CompareText(this.fLastTokenStr,S) === 0);
      return Result;
    };
    var $r = this.$rtti;
    $mod.$rtti.$DynArray("TParser.fBuf$a",{eltype: rtl.char});
  });
  this.TObjectTextEncoding = {"0": "oteDFM", oteDFM: 0, "1": "oteLFM", oteLFM: 1};
  this.$rtti.$Enum("TObjectTextEncoding",{minvalue: 0, maxvalue: 1, ordtype: 1, enumtype: this.TObjectTextEncoding});
  rtl.createClass(this,"TObjectStreamConverter",pas.System.TObject,function () {
    this.$init = function () {
      pas.System.TObject.$init.call(this);
      this.FIndent = "";
      this.FInput = null;
      this.FOutput = null;
      this.FEncoding = 0;
      this.FPlainStrings = false;
    };
    this.$final = function () {
      this.FInput = undefined;
      this.FOutput = undefined;
      pas.System.TObject.$final.call(this);
    };
    this.Outchars = function (S) {
      var res = "";
      var NewStr = "";
      var i = 0;
      var len = 0;
      var w = 0;
      var InString = false;
      var NewInString = false;
      if (S === "") {
        res = "''"}
       else {
        res = "";
        InString = false;
        len = S.length;
        i = 0;
        while (i < len) {
          NewInString = InString;
          w = S.charCodeAt(i);
          if (w === 39) {
            if (!InString) NewInString = true;
            NewStr = "''";
          } else if ((w >= 32) && (w < 127)) {
            if (!InString) NewInString = true;
            NewStr = String.fromCharCode(w);
          } else {
            if (InString) NewInString = false;
            NewStr = "#" + pas.SysUtils.IntToStr(w);
          };
          if (NewInString !== InString) {
            NewStr = "'" + NewStr;
            InString = NewInString;
          };
          res = res + NewStr;
          i += 1;
        };
        if (InString) res = res + "'";
      };
      this.OutStr(res);
    };
    this.OutLn = function (s) {
      this.OutStr(s + pas.System.LineEnding);
    };
    this.OutStr = function (s) {
      var I = 0;
      for (var $l = 1, $end = s.length; $l <= $end; $l++) {
        I = $l;
        this.FOutput.WriteBufferData$4(s.charAt(I - 1));
      };
    };
    this.OutString = function (s) {
      this.Outchars(s);
    };
    this.ReadWord = function () {
      var Result = 0;
      this.FInput.ReadBufferData$10({get: function () {
          return Result;
        }, set: function (v) {
          Result = v;
        }});
      return Result;
    };
    this.ReadDWord = function () {
      var Result = 0;
      this.FInput.ReadBufferData$14({get: function () {
          return Result;
        }, set: function (v) {
          Result = v;
        }});
      return Result;
    };
    this.ReadDouble = function () {
      var Result = 0.0;
      this.FInput.ReadBufferData$20({get: function () {
          return Result;
        }, set: function (v) {
          Result = v;
        }});
      return Result;
    };
    this.ReadInt = function (ValueType) {
      var Result = 0;
      var $tmp = ValueType;
      if ($tmp === 2) {
        Result = ((this.FInput.ReadByte() & 255) << 24) >> 24}
       else if ($tmp === 3) {
        Result = ((this.ReadWord() & 65535) << 16) >> 16}
       else if ($tmp === 4) {
        Result = this.ReadDWord() & 0xFFFFFFFF}
       else if ($tmp === 16) Result = this.ReadNativeInt();
      return Result;
    };
    this.ReadInt$1 = function () {
      var Result = 0;
      Result = this.ReadInt(this.FInput.ReadByte());
      return Result;
    };
    this.ReadNativeInt = function () {
      var Result = 0;
      this.FInput.ReadBufferData$16({get: function () {
          return Result;
        }, set: function (v) {
          Result = v;
        }});
      return Result;
    };
    this.ReadStr = function () {
      var Result = "";
      var l = 0;
      var i = 0;
      var c = "";
      this.FInput.ReadBufferData$6({get: function () {
          return l;
        }, set: function (v) {
          l = v;
        }});
      Result = rtl.strSetLength(Result,l);
      for (var $l = 1, $end = l; $l <= $end; $l++) {
        i = $l;
        this.FInput.ReadBufferData$2({get: function () {
            return c;
          }, set: function (v) {
            c = v;
          }});
        Result = rtl.setCharAt(Result,i - 1,c);
      };
      return Result;
    };
    this.ReadString = function (StringType) {
      var Result = "";
      var i = 0;
      var C = "";
      Result = "";
      if (StringType !== 6) throw $mod.EFilerError.$create("Create$1",["Invalid string type passed to ReadString"]);
      i = this.ReadDWord();
      Result = rtl.strSetLength(Result,i);
      for (var $l = 1, $end = Result.length; $l <= $end; $l++) {
        i = $l;
        this.FInput.ReadBufferData$2({get: function () {
            return C;
          }, set: function (v) {
            C = v;
          }});
        Result = rtl.setCharAt(Result,i - 1,C);
      };
      return Result;
    };
    this.ProcessBinary = function () {
      var ToDo = 0;
      var DoNow = 0;
      var i = 0;
      var lbuf = [];
      var s = "";
      ToDo = this.ReadDWord();
      lbuf = rtl.arraySetLength(lbuf,0,32);
      this.OutLn("{");
      while (ToDo > 0) {
        DoNow = ToDo;
        if (DoNow > 32) DoNow = 32;
        ToDo -= DoNow;
        s = this.FIndent + "  ";
        this.FInput.ReadBuffer({get: function () {
            return lbuf;
          }, set: function (v) {
            lbuf = v;
          }},DoNow);
        for (var $l = 0, $end = DoNow - 1; $l <= $end; $l++) {
          i = $l;
          s = s + pas.SysUtils.IntToHex(lbuf[i],2);
        };
        this.OutLn(s);
      };
      this.OutLn(this.FIndent + "}");
    };
    this.ProcessValue = function (ValueType, Indent) {
      var s = "";
      var IsFirst = false;
      var ext = 0.0;
      var $tmp = ValueType;
      if ($tmp === 1) {
        this.OutStr("(");
        IsFirst = true;
        while (true) {
          ValueType = this.FInput.ReadByte();
          if (ValueType === 0) break;
          if (IsFirst) {
            this.OutLn("");
            IsFirst = false;
          };
          this.OutStr(Indent + "  ");
          this.ProcessValue(ValueType,Indent + "  ");
        };
        this.OutLn(Indent + ")");
      } else if ($tmp === 2) {
        this.OutLn(pas.SysUtils.IntToStr(((this.FInput.ReadByte() & 255) << 24) >> 24))}
       else if ($tmp === 3) {
        this.OutLn(pas.SysUtils.IntToStr(((this.ReadWord() & 65535) << 16) >> 16))}
       else if ($tmp === 4) {
        this.OutLn(pas.SysUtils.IntToStr(this.ReadDWord() & 0xFFFFFFFF))}
       else if ($tmp === 16) {
        this.OutLn(pas.SysUtils.IntToStr(this.ReadNativeInt()))}
       else if ($tmp === 5) {
        ext = this.ReadDouble();
        s = rtl.floatToStr(ext);
        this.OutLn(s);
      } else if ($tmp === 6) {
        if (this.FPlainStrings) {
          this.OutStr("'" + pas.SysUtils.StringReplace(this.ReadString(6),"'","''",rtl.createSet(0)) + "'")}
         else this.OutString(this.ReadString(6));
        this.OutLn("");
      } else if ($tmp === 7) {
        this.OutLn(this.ReadStr())}
       else if ($tmp === 8) {
        this.OutLn("False")}
       else if ($tmp === 9) {
        this.OutLn("True")}
       else if ($tmp === 10) {
        this.ProcessBinary()}
       else if ($tmp === 11) {
        this.OutStr("[");
        IsFirst = true;
        while (true) {
          s = this.ReadStr();
          if (s.length === 0) break;
          if (!IsFirst) this.OutStr(", ");
          IsFirst = false;
          this.OutStr(s);
        };
        this.OutLn("]");
      } else if ($tmp === 12) {
        this.OutLn("nil")}
       else if ($tmp === 13) {
        this.OutStr("<");
        while (this.FInput.ReadByte() !== 0) {
          this.OutLn(Indent);
          this.FInput.Seek(-1,1);
          this.OutStr(Indent + "  item");
          ValueType = this.FInput.ReadByte();
          if (ValueType !== 1) this.OutStr("[" + pas.SysUtils.IntToStr(this.ReadInt(ValueType)) + "]");
          this.OutLn("");
          this.ReadPropList(Indent + "    ");
          this.OutStr(Indent + "  end");
        };
        this.OutLn(">");
      } else {
        throw $mod.EReadError.$create("CreateFmt",[rtl.getResStr(pas.RTLConsts,"SErrInvalidPropertyType"),pas.System.VarRecs(0,ValueType)]);
      };
    };
    this.ReadObject = function (indent) {
      var b = 0;
      var ObjClassName = "";
      var ObjName = "";
      var ChildPos = 0;
      b = this.FInput.ReadByte();
      if ((b & 0xf0) === 0xf0) {
        if ((b & 2) !== 0) ChildPos = this.ReadInt$1();
      } else {
        b = 0;
        this.FInput.Seek(-1,1);
      };
      ObjClassName = this.ReadStr();
      ObjName = this.ReadStr();
      this.OutStr(indent);
      if ((b & 1) !== 0) {
        this.OutStr("inherited")}
       else if ((b & 4) !== 0) {
        this.OutStr("inline")}
       else this.OutStr("object");
      this.OutStr(" ");
      if (ObjName !== "") this.OutStr(ObjName + ": ");
      this.OutStr(ObjClassName);
      if ((b & 2) !== 0) this.OutStr("[" + pas.SysUtils.IntToStr(ChildPos) + "]");
      this.OutLn("");
      this.ReadPropList(indent + "  ");
      while (this.FInput.ReadByte() !== 0) {
        this.FInput.Seek(-1,1);
        this.ReadObject(indent + "  ");
      };
      this.OutLn(indent + "end");
    };
    this.ReadPropList = function (indent) {
      while (this.FInput.ReadByte() !== 0) {
        this.FInput.Seek(-1,1);
        this.OutStr(indent + this.ReadStr() + " = ");
        this.ProcessValue(this.FInput.ReadByte(),indent);
      };
    };
    this.ObjectBinaryToText = function (aInput, aOutput) {
      this.ObjectBinaryToText$1(aInput,aOutput,0);
    };
    this.ObjectBinaryToText$1 = function (aInput, aOutput, aEncoding) {
      this.FInput = aInput;
      this.FOutput = aOutput;
      this.FEncoding = aEncoding;
      this.Execute();
    };
    this.Execute = function () {
      var Signature = 0;
      if (this.FIndent === "") this.FIndent = "  ";
      if (!(this.FInput != null)) throw $mod.EReadError.$create("Create$1",["Missing input stream"]);
      if (!(this.FOutput != null)) throw $mod.EReadError.$create("Create$1",["Missing output stream"]);
      this.FInput.ReadBufferData$12({get: function () {
          return Signature;
        }, set: function (v) {
          Signature = v;
        }});
      if (Signature !== 809914452) throw $mod.EReadError.$create("Create$1",[rtl.getResStr(pas.RTLConsts,"SInvalidImage")]);
      this.ReadObject("");
    };
  });
  rtl.createClass(this,"TObjectTextConverter",pas.System.TObject,function () {
    this.$init = function () {
      pas.System.TObject.$init.call(this);
      this.FParser = null;
      this.FInput = null;
      this.Foutput = null;
    };
    this.$final = function () {
      this.FParser = undefined;
      this.FInput = undefined;
      this.Foutput = undefined;
      pas.System.TObject.$final.call(this);
    };
    this.WriteDouble = function (e) {
      this.Foutput.WriteBufferData$20(e);
    };
    this.WriteDWord = function (lw) {
      this.Foutput.WriteBufferData$14(lw);
    };
    this.WriteInteger = function (value) {
      if ((value >= -128) && (value <= 127)) {
        this.Foutput.WriteByte(2);
        this.Foutput.WriteByte(value & 255);
      } else if ((value >= -32768) && (value <= 32767)) {
        this.Foutput.WriteByte(3);
        this.WriteWord(value & 65535);
      } else if ((value >= -2147483648) && (value <= 2147483647)) {
        this.Foutput.WriteByte(4);
        this.WriteDWord(value >>> 0);
      } else {
        this.Foutput.WriteByte($mod.TValueType.vaNativeInt);
        this.WriteQWord(value);
      };
    };
    this.WriteQWord = function (q) {
      this.Foutput.WriteBufferData$16(q);
    };
    this.WriteString = function (s) {
      var i = 0;
      var size = 0;
      if (s.length > 255) {
        size = 255}
       else size = s.length;
      this.Foutput.WriteByte(size);
      for (var $l = 1, $end = s.length; $l <= $end; $l++) {
        i = $l;
        this.Foutput.WriteBufferData$4(s.charAt(i - 1));
      };
    };
    this.WriteWord = function (w) {
      this.Foutput.WriteBufferData$12(w);
    };
    this.WriteWString = function (s) {
      var i = 0;
      this.WriteDWord(s.length);
      for (var $l = 1, $end = s.length; $l <= $end; $l++) {
        i = $l;
        this.Foutput.WriteBufferData$4(s.charAt(i - 1));
      };
    };
    this.ProcessObject = function () {
      var Flags = 0;
      var ObjectName = "";
      var ObjectType = "";
      var ChildPos = 0;
      if (this.FParser.TokenSymbolIs("OBJECT")) {
        Flags = 0}
       else {
        if (this.FParser.TokenSymbolIs("INHERITED")) {
          Flags = 1}
         else {
          this.FParser.CheckTokenSymbol("INLINE");
          Flags = 4;
        };
      };
      this.FParser.NextToken();
      this.FParser.CheckToken(2);
      ObjectName = "";
      ObjectType = this.FParser.TokenString();
      this.FParser.NextToken();
      if (this.FParser.fToken === 18) {
        this.FParser.NextToken();
        this.FParser.CheckToken(2);
        ObjectName = ObjectType;
        ObjectType = this.FParser.TokenString();
        this.FParser.NextToken();
        if (this.FParser.fToken === 7) {
          this.FParser.NextToken();
          ChildPos = this.FParser.TokenInt();
          this.FParser.NextToken();
          this.FParser.CheckToken(11);
          this.FParser.NextToken();
          Flags = Flags | 2;
        };
      };
      if (Flags !== 0) {
        this.Foutput.WriteByte(0xf0 | Flags);
        if ((Flags & 2) !== 0) this.WriteInteger(ChildPos);
      };
      this.WriteString(ObjectType);
      this.WriteString(ObjectName);
      while (!(this.FParser.TokenSymbolIs("END") || this.FParser.TokenSymbolIs("OBJECT") || this.FParser.TokenSymbolIs("INHERITED") || this.FParser.TokenSymbolIs("INLINE"))) this.ProcessProperty();
      this.Foutput.WriteByte(0);
      while (!this.FParser.TokenSymbolIs("END")) this.ProcessObject();
      this.FParser.NextToken();
      this.Foutput.WriteByte(0);
    };
    this.ProcessProperty = function () {
      var name = "";
      this.FParser.CheckToken(2);
      name = this.FParser.TokenString();
      while (true) {
        this.FParser.NextToken();
        if (this.FParser.fToken !== 16) break;
        this.FParser.NextToken();
        this.FParser.CheckToken(2);
        name = name + "." + this.FParser.TokenString();
      };
      this.WriteString(name);
      this.FParser.CheckToken(17);
      this.FParser.NextToken();
      this.ProcessValue();
    };
    this.ProcessValue = function () {
      var flt = 0.0;
      var stream = null;
      var $tmp = this.FParser.fToken;
      if ($tmp === 4) {
        this.WriteInteger(this.FParser.TokenInt());
        this.FParser.NextToken();
      } else if ($tmp === 5) {
        this.Foutput.WriteByte($mod.TValueType.vaDouble);
        flt = this.FParser.TokenFloat();
        this.WriteDouble(flt);
        this.FParser.NextToken();
      } else if ($tmp === 3) {
        this.ProcessWideString("")}
       else if ($tmp === 2) {
        if (pas.SysUtils.CompareText(this.FParser.TokenString(),"True") === 0) {
          this.Foutput.WriteByte(9)}
         else if (pas.SysUtils.CompareText(this.FParser.TokenString(),"False") === 0) {
          this.Foutput.WriteByte(8)}
         else if (pas.SysUtils.CompareText(this.FParser.TokenString(),"nil") === 0) {
          this.Foutput.WriteByte(12)}
         else {
          this.Foutput.WriteByte(7);
          this.WriteString(this.FParser.TokenComponentIdent());
        };
        this.FParser.NextToken();
      } else if ($tmp === 7) {
        this.FParser.NextToken();
        this.Foutput.WriteByte(11);
        if (this.FParser.fToken !== 11) while (true) {
          this.FParser.CheckToken(2);
          this.WriteString(this.FParser.TokenString());
          this.FParser.NextToken();
          if (this.FParser.fToken === 11) break;
          this.FParser.CheckToken(15);
          this.FParser.NextToken();
        };
        this.Foutput.WriteByte(0);
        this.FParser.NextToken();
      } else if ($tmp === 8) {
        this.FParser.NextToken();
        this.Foutput.WriteByte(1);
        while (this.FParser.fToken !== 12) this.ProcessValue();
        this.Foutput.WriteByte(0);
        this.FParser.NextToken();
      } else if ($tmp === 9) {
        this.FParser.NextToken();
        this.Foutput.WriteByte(13);
        while (this.FParser.fToken !== 13) {
          this.FParser.CheckTokenSymbol("item");
          this.FParser.NextToken();
          this.Foutput.WriteByte(1);
          while (!this.FParser.TokenSymbolIs("end")) this.ProcessProperty();
          this.FParser.NextToken();
          this.Foutput.WriteByte(0);
        };
        this.Foutput.WriteByte(0);
        this.FParser.NextToken();
      } else if ($tmp === 10) {
        this.Foutput.WriteByte(10);
        stream = $mod.TBytesStream.$create("Create");
        try {
          this.FParser.HexToBinary(stream);
          this.WriteDWord(stream.GetSize());
          this.Foutput.WriteBuffer(stream.GetBytes(),stream.GetSize());
        } finally {
          stream = rtl.freeLoc(stream);
        };
        this.FParser.NextToken();
      } else {
        this.FParser.Error(rtl.getResStr(pas.RTLConsts,"SParserInvalidProperty"));
      };
    };
    this.ProcessWideString = function (left) {
      var ws = "";
      ws = left + this.FParser.TokenString();
      while (this.FParser.NextToken() === 19) {
        this.FParser.NextToken();
        if (!(this.FParser.fToken === 3)) this.FParser.CheckToken(3);
        ws = ws + this.FParser.TokenString();
      };
      this.Foutput.WriteByte($mod.TValueType.vaString);
      this.WriteWString(ws);
    };
    this.ObjectTextToBinary = function (aInput, aOutput) {
      this.FInput = aInput;
      this.Foutput = aOutput;
      this.Execute();
    };
    this.Execute = function () {
      if (!(this.FInput != null)) throw $mod.EReadError.$create("Create$1",["Missing input stream"]);
      if (!(this.Foutput != null)) throw $mod.EReadError.$create("Create$1",["Missing output stream"]);
      this.FParser = $mod.TParser.$create("Create$1",[this.FInput]);
      try {
        this.Foutput.WriteBufferData$14(809914452);
        this.ProcessObject();
      } finally {
        rtl.free(this,"FParser");
      };
    };
  });
  rtl.createClass(this,"TLoadHelper",pas.System.TObject,function () {
    $mod.$rtti.$RefToProcVar("TLoadHelper.TTextLoadedCallBack",{procsig: rtl.newTIProcSig([["aText",rtl.string,2]])});
    $mod.$rtti.$RefToProcVar("TLoadHelper.TBytesLoadedCallBack",{procsig: rtl.newTIProcSig([["aBuffer",pas.JS.$rtti["TJSArrayBuffer"],2]])});
    $mod.$rtti.$RefToProcVar("TLoadHelper.TErrorCallBack",{procsig: rtl.newTIProcSig([["aError",rtl.string,2]])});
  });
  this.$rtti.$ClassRef("TLoadHelperClass",{instancetype: this.$rtti["TLoadHelper"]});
  rtl.recNewT(this,"TIdentMapEntry",function () {
    this.Value = 0;
    this.Name = "";
    this.$eq = function (b) {
      return (this.Value === b.Value) && (this.Name === b.Name);
    };
    this.$assign = function (s) {
      this.Value = s.Value;
      this.Name = s.Name;
      return this;
    };
    var $r = $mod.$rtti.$Record("TIdentMapEntry",{});
    $r.addField("Value",rtl.longint);
    $r.addField("Name",rtl.string);
  });
  this.$rtti.$ProcVar("TIdentToInt",{procsig: rtl.newTIProcSig([["Ident",rtl.string,2],["Int",rtl.longint,1]],rtl.boolean)});
  this.$rtti.$ProcVar("TIntToIdent",{procsig: rtl.newTIProcSig([["Int",rtl.longint],["Ident",rtl.string,1]],rtl.boolean)});
  this.$rtti.$ProcVar("TFindGlobalComponent",{procsig: rtl.newTIProcSig([["Name",rtl.string,2]],this.$rtti["TComponent"])});
  this.$rtti.$ProcVar("TInitComponentHandler",{procsig: rtl.newTIProcSig([["Instance",this.$rtti["TComponent"]],["RootAncestor",pas.System.$rtti["TClass"]]],rtl.boolean)});
  this.RegisterInitComponentHandler = function (ComponentClass, Handler) {
    var I = 0;
    var H = null;
    if ($impl.InitHandlerList === null) $impl.InitHandlerList = $mod.TList.$create("Create$1");
    H = $impl.TInitHandler.$create("Create");
    H.AClass = ComponentClass;
    H.AHandler = Handler;
    try {
      var $with = $impl.InitHandlerList;
      I = 0;
      while ((I < $with.GetCount()) && !H.AClass.InheritsFrom(rtl.getObject($with.Get(I)).AClass)) I += 1;
      if ((I < $with.GetCount()) && (rtl.getObject($with.Get(I)).AClass === H.AClass)) {
        rtl.getObject($with.Get(I)).AHandler = Handler;
        H = rtl.freeLoc(H);
      } else $impl.InitHandlerList.Insert(I,H);
    } catch ($e) {
      H = rtl.freeLoc(H);
      throw $e;
    };
  };
  this.RegisterClass = function (AClass) {
    $impl.ClassList[AClass.$classname] = AClass;
  };
  this.RegisterClasses = function (AClasses) {
    var AClass = null;
    for (var $in = AClasses, $l = 0, $end = rtl.length($in) - 1; $l <= $end; $l++) {
      AClass = $in[$l];
      $mod.RegisterClass(AClass);
    };
  };
  this.GetClass = function (AClassName) {
    var Result = null;
    Result = null;
    if (AClassName === "") return Result;
    if (!$impl.ClassList.hasOwnProperty(AClassName)) return Result;
    Result = rtl.getObject($impl.ClassList[AClassName]);
    return Result;
  };
  this.RegisterFindGlobalComponentProc = function (AFindGlobalComponent) {
    if (!($impl.FindGlobalComponentList != null)) $impl.FindGlobalComponentList = $mod.TFPList.$create("Create");
    if ($impl.FindGlobalComponentList.IndexOf(AFindGlobalComponent) < 0) $impl.FindGlobalComponentList.Add(AFindGlobalComponent);
  };
  this.UnregisterFindGlobalComponentProc = function (AFindGlobalComponent) {
    if ($impl.FindGlobalComponentList != null) $impl.FindGlobalComponentList.Remove(AFindGlobalComponent);
  };
  this.FindGlobalComponent = function (Name) {
    var Result = null;
    var i = 0;
    Result = null;
    if ($impl.FindGlobalComponentList != null) {
      for (var $l = $impl.FindGlobalComponentList.FCount - 1; $l >= 0; $l--) {
        i = $l;
        Result = $impl.FindGlobalComponentList.Get(i)(Name);
        if (Result != null) break;
      };
    };
    return Result;
  };
  this.FindNestedComponent = function (Root, APath, CStyle) {
    var Result = null;
    function GetNextName() {
      var Result = "";
      var P = 0;
      var CM = false;
      P = pas.System.Pos(".",APath);
      CM = false;
      if (P === 0) {
        if (CStyle) {
          P = pas.System.Pos("->",APath);
          CM = P !== 0;
        };
        if (P === 0) P = APath.length + 1;
      };
      Result = pas.System.Copy(APath,1,P - 1);
      pas.System.Delete({get: function () {
          return APath;
        }, set: function (v) {
          APath = v;
        }},1,P + (CM + 0));
      return Result;
    };
    var C = null;
    var S = "";
    if (APath === "") {
      Result = null}
     else {
      Result = Root;
      while ((APath !== "") && (Result !== null)) {
        C = Result;
        S = pas.SysUtils.UpperCase(GetNextName());
        Result = C.FindComponent(S);
        if ((Result === null) && (S === "OWNER")) Result = C;
      };
    };
    return Result;
  };
  this.RedirectFixupReferences = function (Root, OldRootName, NewRootName) {
    if ($impl.NeedResolving === null) return;
    $impl.VisitResolveList($impl.TRedirectReferenceVisitor.$create("Create$1",[Root,OldRootName,NewRootName]));
  };
  this.RemoveFixupReferences = function (Root, RootName) {
    if ($impl.NeedResolving === null) return;
    $impl.VisitResolveList($impl.TRemoveReferenceVisitor.$create("Create$1",[Root,RootName]));
  };
  this.RegisterIntegerConsts = function (IntegerType, IdentToIntFn, IntToIdentFn) {
    if (!($impl.IntConstList != null)) $impl.IntConstList = $mod.TFPList.$create("Create");
    $impl.IntConstList.Add($impl.TIntConst.$create("Create$1",[IntegerType,IdentToIntFn,IntToIdentFn]));
  };
  this.ExtractStrings = function (Separators, WhiteSpace, Content, Strings, AddEmptyStrings) {
    var Result = 0;
    var b = 0;
    var c = 0;
    function SkipWhitespace() {
      while (Content.charCodeAt(c - 1) in WhiteSpace) c += 1;
    };
    function AddString() {
      var l = 0;
      l = c - b;
      if ((l > 0) || AddEmptyStrings) {
        if (Strings != null) {
          if (l > 0) {
            Strings.Add(pas.System.Copy(Content,b,l))}
           else Strings.Add("");
        };
        Result += 1;
      };
    };
    var cc = "";
    var quoted = "";
    var aLen = 0;
    Result = 0;
    c = 1;
    quoted = "\x00";
    Separators = rtl.diffSet(rtl.unionSet(Separators,rtl.createSet(13,10)),rtl.createSet(39,34));
    SkipWhitespace();
    b = c;
    aLen = Content.length;
    while (c <= aLen) {
      cc = Content.charAt(c - 1);
      if (cc === quoted) {
        if ((c < aLen) && (Content.charAt((c + 1) - 1) === quoted)) {
          c += 1}
         else quoted = "\x00";
      } else if ((quoted === "\x00") && (cc.charCodeAt() in rtl.createSet(39,34))) quoted = cc;
      if ((quoted === "\x00") && (cc.charCodeAt() in Separators)) {
        AddString();
        c += 1;
        SkipWhitespace();
        b = c;
      } else c += 1;
    };
    if (c !== b) AddString();
    return Result;
  };
  this.IdentToInt = function (Ident, Int, map) {
    var Result = false;
    var i = 0;
    for (var $l = 0, $end = rtl.length(map) - 1; $l <= $end; $l++) {
      i = $l;
      if (pas.SysUtils.CompareText(map[i].Name,Ident) === 0) {
        Int.set(map[i].Value);
        return true;
      };
    };
    Result = false;
    return Result;
  };
  this.IntToIdent = function (Int, Ident, map) {
    var Result = false;
    var i = 0;
    for (var $l = 0, $end = rtl.length(map) - 1; $l <= $end; $l++) {
      i = $l;
      if (map[i].Value === Int) {
        Ident.set(map[i].Name);
        return true;
      };
    };
    Result = false;
    return Result;
  };
  this.FindIntToIdent = function (AIntegerType) {
    var Result = null;
    var i = 0;
    Result = null;
    if (!($impl.IntConstList != null)) return Result;
    var $with = $impl.IntConstList;
    for (var $l = 0, $end = $with.FCount - 1; $l <= $end; $l++) {
      i = $l;
      if (rtl.getObject($with.Get(i)).IntegerType === AIntegerType) return rtl.getObject($with.Get(i)).IntToIdentFn;
    };
    return Result;
  };
  this.FindIdentToInt = function (AIntegerType) {
    var Result = null;
    var i = 0;
    Result = null;
    if (!($impl.IntConstList != null)) return Result;
    var $with = $impl.IntConstList;
    for (var $l = 0, $end = $with.FCount - 1; $l <= $end; $l++) {
      i = $l;
      var $with1 = rtl.getObject($with.Get(i));
      if (rtl.getObject($with.Get(i)).IntegerType === AIntegerType) return $with1.IdentToIntFn;
    };
    return Result;
  };
  this.FindClass = function (AClassName) {
    var Result = null;
    Result = $mod.GetClass(AClassName);
    if (!(Result != null)) throw $mod.EClassNotFound.$create("CreateFmt",[rtl.getResStr(pas.RTLConsts,"SClassNotFound"),pas.System.VarRecs(18,AClassName)]);
    return Result;
  };
  this.CollectionsEqual = function (C1, C2) {
    var Result = false;
    var Comp1 = null;
    var Comp2 = null;
    Comp2 = null;
    Comp1 = $mod.TComponent.$create("Create");
    try {
      Result = $mod.CollectionsEqual$1(C1,C2,Comp1,Comp2);
    } finally {
      Comp1 = rtl.freeLoc(Comp1);
      Comp2 = rtl.freeLoc(Comp2);
    };
    return Result;
  };
  this.CollectionsEqual$1 = function (C1, C2, Owner1, Owner2) {
    var Result = false;
    function stream_collection(s, c, o) {
      var w = null;
      w = $mod.TWriter.$create("Create$2",[s]);
      try {
        w.SetRoot(o);
        w.FLookupRoot = o;
        w.WriteCollection(c);
      } finally {
        w = rtl.freeLoc(w);
      };
    };
    var s1 = null;
    var s2 = null;
    var b1 = [];
    var b2 = [];
    var I = 0;
    var Len = 0;
    Result = false;
    if ((C1.$class.ClassType() !== C2.$class.ClassType()) || (C1.GetCount() !== C2.GetCount())) return Result;
    if (C1.GetCount() === 0) {
      Result = true;
      return Result;
    };
    s2 = null;
    s1 = $mod.TBytesStream.$create("Create");
    try {
      s2 = $mod.TBytesStream.$create("Create");
      stream_collection(s1,C1,Owner1);
      stream_collection(s2,C2,Owner2);
      Result = s1.GetSize() === s2.GetSize();
      if (Result) {
        b1 = s1.GetBytes();
        b2 = s2.GetBytes();
        I = 0;
        Len = s1.GetSize();
        while (Result && (I < Len)) {
          Result = b1[I] === b2[I];
          I += 1;
        };
      };
    } finally {
      s2 = rtl.freeLoc(s2);
      s1 = rtl.freeLoc(s1);
    };
    return Result;
  };
  this.GetFixupReferenceNames = function (Root, Names) {
    if ($impl.NeedResolving === null) return;
    $impl.VisitResolveList($impl.TReferenceNamesVisitor.$create("Create$1",[Root,Names]));
  };
  this.GetFixupInstanceNames = function (Root, ReferenceRootName, Names) {
    if ($impl.NeedResolving === null) return;
    $impl.VisitResolveList($impl.TReferenceInstancesVisitor.$create("Create$1",[Root,ReferenceRootName,Names]));
  };
  this.ObjectBinaryToText = function (aInput, aOutput) {
    $mod.ObjectBinaryToText$1(aInput,aOutput,1);
  };
  this.ObjectBinaryToText$1 = function (aInput, aOutput, aEncoding) {
    var Conv = null;
    Conv = $mod.TObjectStreamConverter.$create("Create");
    try {
      Conv.ObjectBinaryToText$1(aInput,aOutput,aEncoding);
    } finally {
      Conv = rtl.freeLoc(Conv);
    };
  };
  this.ObjectTextToBinary = function (aInput, aOutput) {
    var Conv = null;
    Conv = $mod.TObjectTextConverter.$create("Create");
    try {
      Conv.ObjectTextToBinary(aInput,aOutput);
    } finally {
      Conv = rtl.freeLoc(Conv);
    };
  };
  this.SetLoadHelperClass = function (aClass) {
    var Result = null;
    Result = $impl.GlobalLoadHelper;
    $impl.GlobalLoadHelper = aClass;
    return Result;
  };
  this.StringToBuffer = function (aString, aLen) {
    var Result = null;
    var I = 0;
    Result = new ArrayBuffer(aLen * 2);
    var $with = new Uint16Array(Result);
    for (var $l = 0, $end = aLen - 1; $l <= $end; $l++) {
      I = $l;
      $with[I] = aString.charCodeAt(I);
    };
    return Result;
  };
  this.BufferToString = function (aBuffer, aPos, aLen) {
    var Result = "";
    var a = null;
    Result = "";
    a = new Uint16Array(aBuffer.slice(aPos,aLen));
    if (a !== null) Result = "" + String.fromCharCode.apply(null,a);
    return Result;
  };
  this.BeginGlobalLoading = function () {
    $impl.GlobalLoaded = $mod.TFPList.$create("Create");
  };
  this.NotifyGlobalLoading = function () {
    var I = 0;
    var G = null;
    G = $impl.GlobalLoaded;
    for (var $l = 0, $end = G.FCount - 1; $l <= $end; $l++) {
      I = $l;
      rtl.getObject(G.Get(I)).Loaded();
    };
  };
  this.EndGlobalLoading = function () {
    rtl.free($impl,"GlobalLoaded");
  };
  this.vaSingle = 5;
  this.vaExtended = 5;
  this.vaLString = 6;
  this.vaUTF8String = 6;
  this.vaUString = 6;
  this.vaWString = 6;
  this.vaQWord = 16;
  this.vaInt64 = 16;
  this.toWString = 3;
  $mod.$implcode = function () {
    $impl.GlobalLoaded = null;
    $impl.IntConstList = null;
    $impl.GlobalLoadHelper = null;
    $impl.CheckLoadHelper = function () {
      if ($impl.GlobalLoadHelper === null) throw pas.SysUtils.EInOutError.$create("Create$1",["No support for loading URLS. Include Rtl.BrowserLoadHelper in your project uses clause"]);
    };
    rtl.createClass($impl,"TIntConst",pas.System.TObject,function () {
      this.$init = function () {
        pas.System.TObject.$init.call(this);
        this.IntegerType = null;
        this.IdentToIntFn = null;
        this.IntToIdentFn = null;
      };
      this.$final = function () {
        this.IdentToIntFn = undefined;
        this.IntToIdentFn = undefined;
        pas.System.TObject.$final.call(this);
      };
      this.Create$1 = function (AIntegerType, AIdentToInt, AIntToIdent) {
        this.IntegerType = AIntegerType;
        this.IdentToIntFn = AIdentToInt;
        this.IntToIdentFn = AIntToIdent;
        return this;
      };
    });
    $impl.GlobalIdentToInt = function (Ident, Int) {
      var Result = false;
      var i = 0;
      Result = false;
      if (!($impl.IntConstList != null)) return Result;
      var $with = $impl.IntConstList;
      for (var $l = 0, $end = $with.FCount - 1; $l <= $end; $l++) {
        i = $l;
        if (rtl.getObject($with.Get(i)).IdentToIntFn(Ident,Int)) return true;
      };
      return Result;
    };
    $impl.QuickSort = function (aList, L, R, Compare) {
      var I = 0;
      var J = 0;
      var PivotIdx = 0;
      var P = undefined;
      var Q = undefined;
      do {
        I = L;
        J = R;
        PivotIdx = L + ((R - L) >>> 1);
        P = aList[PivotIdx];
        do {
          while ((I < PivotIdx) && (Compare(P,aList[I]) > 0)) I += 1;
          while ((J > PivotIdx) && (Compare(P,aList[J]) < 0)) J -= 1;
          if (I < J) {
            Q = aList[I];
            aList[I] = aList[J];
            aList[J] = Q;
            if (PivotIdx === I) {
              PivotIdx = J;
              I += 1;
            } else if (PivotIdx === J) {
              PivotIdx = I;
              J -= 1;
            } else {
              I += 1;
              J -= 1;
            };
          };
        } while (!(I >= J));
        if ((PivotIdx - L) < (R - PivotIdx)) {
          if ((L + 1) < PivotIdx) $impl.QuickSort(rtl.arrayRef(aList),L,PivotIdx - 1,Compare);
          L = PivotIdx + 1;
        } else {
          if ((PivotIdx + 1) < R) $impl.QuickSort(rtl.arrayRef(aList),PivotIdx + 1,R,Compare);
          if ((L + 1) < PivotIdx) {
            R = PivotIdx - 1}
           else return;
        };
      } while (!(L >= R));
    };
    $impl.StringListAnsiCompare = function (List, Index1, Index) {
      var Result = 0;
      Result = List.DoCompareText(List.FList[Index1].FString,List.FList[Index].FString);
      return Result;
    };
    $impl.TMSGrow = 4096;
    $impl.FilerSignatureInt = 809914452;
    rtl.createClass($impl,"TUnresolvedReference",pas.simplelinkedlist.TLinkedListItem,function () {
      this.$init = function () {
        pas.simplelinkedlist.TLinkedListItem.$init.call(this);
        this.FRoot = null;
        this.FPropInfo = null;
        this.FGlobal = "";
        this.FRelative = "";
      };
      this.$final = function () {
        this.FRoot = undefined;
        this.FPropInfo = undefined;
        pas.simplelinkedlist.TLinkedListItem.$final.call(this);
      };
      this.Resolve = function (Instance) {
        var Result = false;
        var C = null;
        C = $mod.FindGlobalComponent(this.FGlobal);
        Result = C !== null;
        if (Result) {
          C = $mod.FindNestedComponent(C,this.FRelative,true);
          Result = C !== null;
          if (Result) pas.TypInfo.SetObjectProp$1(Instance,this.FPropInfo,C);
        };
        return Result;
      };
      this.RootMatches = function (ARoot) {
        var Result = false;
        Result = (ARoot === null) || (ARoot === this.FRoot);
        return Result;
      };
      this.NextRef = function () {
        var Result = null;
        Result = this.Next;
        return Result;
      };
    });
    rtl.createClass($impl,"TLocalUnResolvedReference",$impl.TUnresolvedReference,function () {
      this.$init = function () {
        $impl.TUnresolvedReference.$init.call(this);
        this.Finstance = null;
      };
      this.$final = function () {
        this.Finstance = undefined;
        $impl.TUnresolvedReference.$final.call(this);
      };
      var $r = this.$rtti;
      $r.addField("Finstance",$mod.$rtti["TPersistent"]);
    });
    rtl.createClass($impl,"TUnResolvedInstance",pas.simplelinkedlist.TLinkedListItem,function () {
      this.$init = function () {
        pas.simplelinkedlist.TLinkedListItem.$init.call(this);
        this.Instance = null;
        this.FUnresolved = null;
      };
      this.$final = function () {
        this.Instance = undefined;
        this.FUnresolved = undefined;
        pas.simplelinkedlist.TLinkedListItem.$final.call(this);
      };
      this.Destroy = function () {
        rtl.free(this,"FUnresolved");
        pas.System.TObject.Destroy.call(this);
      };
      this.AddReference = function (ARoot, APropInfo, AGlobal, ARelative) {
        var Result = null;
        if (this.FUnresolved === null) this.FUnresolved = pas.simplelinkedlist.TLinkedList.$create("Create$1",[$impl.TUnresolvedReference]);
        Result = rtl.as(this.FUnresolved.Add(),$impl.TUnresolvedReference);
        Result.FGlobal = AGlobal;
        Result.FRelative = ARelative;
        Result.FPropInfo = APropInfo;
        Result.FRoot = ARoot;
        return Result;
      };
      this.RootUnresolved = function () {
        var Result = null;
        Result = null;
        if (this.FUnresolved != null) Result = this.FUnresolved.FRoot;
        return Result;
      };
      this.ResolveReferences = function () {
        var Result = false;
        var R = null;
        var RN = null;
        R = this.RootUnresolved();
        while (R !== null) {
          RN = R.NextRef();
          if (R.Resolve(this.Instance)) this.FUnresolved.RemoveItem(R,true);
          R = RN;
        };
        Result = this.RootUnresolved() === null;
        return Result;
      };
    });
    rtl.createClass($impl,"TBuildListVisitor",pas.simplelinkedlist.TLinkedListVisitor,function () {
      this.$init = function () {
        pas.simplelinkedlist.TLinkedListVisitor.$init.call(this);
        this.List = null;
      };
      this.$final = function () {
        this.List = undefined;
        pas.simplelinkedlist.TLinkedListVisitor.$final.call(this);
      };
      this.Add = function (Item) {
        if (this.List === null) this.List = $mod.TFPList.$create("Create");
        this.List.Add(Item);
      };
      this.Destroy = function () {
        var I = 0;
        if (this.List != null) for (var $l = 0, $end = this.List.FCount - 1; $l <= $end; $l++) {
          I = $l;
          $impl.NeedResolving.RemoveItem(rtl.getObject(this.List.Get(I)),true);
        };
        pas.SysUtils.FreeAndNil({p: this, get: function () {
            return this.p.List;
          }, set: function (v) {
            this.p.List = v;
          }});
        pas.System.TObject.Destroy.call(this);
      };
    });
    rtl.createClass($impl,"TResolveReferenceVisitor",$impl.TBuildListVisitor,function () {
      this.Visit = function (Item) {
        var Result = false;
        if (Item.ResolveReferences()) this.Add(Item);
        Result = true;
        return Result;
      };
      var $r = this.$rtti;
      $r.addMethod("Visit",1,[["Item",pas.simplelinkedlist.$rtti["TLinkedListItem"]]],rtl.boolean);
    });
    rtl.createClass($impl,"TRemoveReferenceVisitor",$impl.TBuildListVisitor,function () {
      this.$init = function () {
        $impl.TBuildListVisitor.$init.call(this);
        this.FRef = "";
        this.FRoot = null;
      };
      this.$final = function () {
        this.FRoot = undefined;
        $impl.TBuildListVisitor.$final.call(this);
      };
      this.Create$1 = function (ARoot, ARef) {
        this.FRoot = ARoot;
        this.FRef = pas.SysUtils.UpperCase(ARef);
        return this;
      };
      this.Visit = function (Item) {
        var Result = false;
        var I = 0;
        var UI = null;
        var R = null;
        var L = null;
        UI = Item;
        R = UI.RootUnresolved();
        L = null;
        try {
          while (R !== null) {
            if (R.RootMatches(this.FRoot) && ((this.FRef === "") || (this.FRef === pas.SysUtils.UpperCase(R.FGlobal)))) {
              if (!(L != null)) L = $mod.TFPList.$create("Create");
              L.Add(R);
            };
            R = R.NextRef();
          };
          if (L != null) {
            for (var $l = 0, $end = L.FCount - 1; $l <= $end; $l++) {
              I = $l;
              UI.FUnresolved.RemoveItem(rtl.getObject(L.Get(I)),true);
            };
          };
          if (UI.FUnresolved.FRoot === null) {
            if (this.List === null) this.List = $mod.TFPList.$create("Create");
            this.List.Add(UI);
          };
        } finally {
          L = rtl.freeLoc(L);
        };
        Result = true;
        return Result;
      };
    });
    rtl.createClass($impl,"TReferenceNamesVisitor",pas.simplelinkedlist.TLinkedListVisitor,function () {
      this.$init = function () {
        pas.simplelinkedlist.TLinkedListVisitor.$init.call(this);
        this.FList = null;
        this.FRoot = null;
      };
      this.$final = function () {
        this.FList = undefined;
        this.FRoot = undefined;
        pas.simplelinkedlist.TLinkedListVisitor.$final.call(this);
      };
      this.Visit = function (Item) {
        var Result = false;
        var R = null;
        R = Item.RootUnresolved();
        while (R !== null) {
          if (R.RootMatches(this.FRoot)) if (this.FList.IndexOf(R.FGlobal) === -1) this.FList.Add(R.FGlobal);
          R = R.NextRef();
        };
        Result = true;
        return Result;
      };
      this.Create$1 = function (ARoot, AList) {
        this.FRoot = ARoot;
        this.FList = AList;
        return this;
      };
    });
    rtl.createClass($impl,"TReferenceInstancesVisitor",pas.simplelinkedlist.TLinkedListVisitor,function () {
      this.$init = function () {
        pas.simplelinkedlist.TLinkedListVisitor.$init.call(this);
        this.FList = null;
        this.FRef = "";
        this.FRoot = null;
      };
      this.$final = function () {
        this.FList = undefined;
        this.FRoot = undefined;
        pas.simplelinkedlist.TLinkedListVisitor.$final.call(this);
      };
      this.Visit = function (Item) {
        var Result = false;
        var R = null;
        R = Item.RootUnresolved();
        while (R !== null) {
          if ((this.FRoot === R.FRoot) && (this.FRef === pas.SysUtils.UpperCase(R.FGlobal))) if (this.FList.IndexOf(R.FRelative) === -1) this.FList.Add(R.FRelative);
          R = R.NextRef();
        };
        Result = true;
        return Result;
      };
      this.Create$1 = function (ARoot, ARef, AList) {
        this.FRoot = ARoot;
        this.FRef = pas.SysUtils.UpperCase(ARef);
        this.FList = AList;
        return this;
      };
    });
    rtl.createClass($impl,"TRedirectReferenceVisitor",pas.simplelinkedlist.TLinkedListVisitor,function () {
      this.$init = function () {
        pas.simplelinkedlist.TLinkedListVisitor.$init.call(this);
        this.FOld = "";
        this.FNew = "";
        this.FRoot = null;
      };
      this.$final = function () {
        this.FRoot = undefined;
        pas.simplelinkedlist.TLinkedListVisitor.$final.call(this);
      };
      this.Visit = function (Item) {
        var Result = false;
        var R = null;
        R = Item.RootUnresolved();
        while (R !== null) {
          if (R.RootMatches(this.FRoot) && (this.FOld === pas.SysUtils.UpperCase(R.FGlobal))) R.FGlobal = this.FNew;
          R = R.NextRef();
        };
        Result = true;
        return Result;
      };
      this.Create$1 = function (ARoot, AOld, ANew) {
        this.FRoot = ARoot;
        this.FOld = pas.SysUtils.UpperCase(AOld);
        this.FNew = ANew;
        return this;
      };
    });
    $impl.NeedResolving = null;
    $impl.FindUnresolvedInstance = function (AInstance) {
      var Result = null;
      Result = null;
      if ($impl.NeedResolving != null) {
        Result = $impl.NeedResolving.FRoot;
        while ((Result !== null) && (Result.Instance !== AInstance)) Result = Result.Next;
      };
      return Result;
    };
    $impl.AddtoResolveList = function (AInstance) {
      var Result = null;
      Result = $impl.FindUnresolvedInstance(AInstance);
      if (Result === null) {
        if (!($impl.NeedResolving != null)) $impl.NeedResolving = pas.simplelinkedlist.TLinkedList.$create("Create$1",[$impl.TUnResolvedInstance]);
        Result = rtl.as($impl.NeedResolving.Add(),$impl.TUnResolvedInstance);
        Result.Instance = AInstance;
      };
      return Result;
    };
    $impl.VisitResolveList = function (V) {
      try {
        $impl.NeedResolving.ForEach(V);
      } finally {
        pas.SysUtils.FreeAndNil({get: function () {
            return V;
          }, set: function (v) {
            V = v;
          }});
      };
    };
    $impl.GlobalFixupReferences = function () {
      if ($impl.NeedResolving === null) return;
      $impl.VisitResolveList($impl.TResolveReferenceVisitor.$create("Create"));
    };
    rtl.createClass($impl,"TPosComponent",pas.System.TObject,function () {
      this.$init = function () {
        pas.System.TObject.$init.call(this);
        this.FPos = 0;
        this.FComponent = null;
      };
      this.$final = function () {
        this.FComponent = undefined;
        pas.System.TObject.$final.call(this);
      };
      this.Create$1 = function (APos, AComponent) {
        this.FPos = APos;
        this.FComponent = AComponent;
        return this;
      };
    });
    $impl.ClassList = null;
    $impl.InitHandlerList = null;
    $impl.FindGlobalComponentList = null;
    rtl.createClass($impl,"TInitHandler",pas.System.TObject,function () {
      this.$init = function () {
        pas.System.TObject.$init.call(this);
        this.AHandler = null;
        this.AClass = null;
      };
      this.$final = function () {
        this.AHandler = undefined;
        this.AClass = undefined;
        pas.System.TObject.$final.call(this);
      };
      var $r = this.$rtti;
      $r.addField("AHandler",$mod.$rtti["TInitComponentHandler"]);
      $r.addField("AClass",$mod.$rtti["TComponentClass"]);
    });
    $impl.ParseBufSize = 4096;
    $mod.$rtti.$StaticArray("TokNames$a",{dims: [20], eltype: rtl.string});
    $impl.TokNames = ["?","EOF","Symbol","String","Integer","Float","-","[","(","<","{","]",")",">","}",",",".","=",":","+"];
    $mod.$resourcestrings = {SStreamInvalidSeek: {org: "Seek is not implemented for class %s"}, SStreamNoReading: {org: "Stream reading is not implemented for class %s"}, SStreamNoWriting: {org: "Stream writing is not implemented for class %s"}, SReadError: {org: "Could not read data from stream"}, SWriteError: {org: "Could not write data to stream"}, SMemoryStreamError: {org: "Could not allocate memory"}, SerrInvalidStreamSize: {org: "Invalid Stream size"}};
  };
  $mod.$init = function () {
    $impl.ClassList = new Object();
  };
},["simplelinkedlist"]);
rtl.module("Web",["System","Types","JS"],function () {
  "use strict";
  var $mod = this;
  this.$rtti.$ExtClass("TJSEvent");
  this.$rtti.$ExtClass("TJSWindow");
  this.$rtti.$ExtClass("TJSDOMTokenList");
  this.$rtti.$ExtClass("TJSXPathResult");
  this.$rtti.$ExtClass("TJSNodeList");
  this.$rtti.$ExtClass("TJSDocument");
  this.$rtti.$ExtClass("TJSElement");
  this.$rtti.$ExtClass("TJSCSSStyleSheet");
  this.$rtti.$ExtClass("TJSNodeFilter");
  this.$rtti.$ExtClass("TJSIDBObjectStore");
  this.$rtti.$ExtClass("TIDBDatabase");
  this.$rtti.$ExtClass("TJSIDBRequest");
  this.$rtti.$ExtClass("TJSEventTarget");
  this.$rtti.$ExtClass("TJSMouseEvent");
  this.$rtti.$ExtClass("TJSWheelEvent");
  this.$rtti.$ExtClass("TJSKeyboardEvent");
  this.$rtti.$ExtClass("TJSPointerEvent");
  this.$rtti.$ExtClass("TJSUIEvent");
  this.$rtti.$ExtClass("TJSTouchEvent");
  this.$rtti.$ExtClass("TJSBlob");
  this.$rtti.$ExtClass("TJSPermissions");
  this.$rtti.$ExtClass("TJSFileSystemFileHandle");
  this.$rtti.$DynArray("TJSFileSystemFileHandleArray",{eltype: this.$rtti["TJSFileSystemFileHandle"]});
  this.$rtti.$ExtClass("TJSFileSystemDirectoryHandle");
  this.$rtti.$DynArray("TJSFileSystemDirectoryHandleArray",{eltype: this.$rtti["TJSFileSystemDirectoryHandle"]});
  this.$rtti.$ExtClass("TJSShowOpenFilePickerOptions");
  this.$rtti.$ExtClass("TJSShowSaveFilePickerOptions");
  this.$rtti.$RefToProcVar("TJSEventHandler",{procsig: rtl.newTIProcSig([["Event",this.$rtti["TJSEvent"]]],rtl.boolean,8)});
  this.$rtti.$RefToProcVar("TJSRawEventHandler",{procsig: rtl.newTIProcSig([["Event",this.$rtti["TJSEvent"]]],null,8)});
  this.$rtti.$ExtClass("TJSEventTarget",{ancestor: pas.JS.$rtti["TJSObject"], jsclass: "EventTarget"});
  this.$rtti.$ExtClass("TJSNode",{ancestor: this.$rtti["TJSEventTarget"], jsclass: "Node"});
  this.$rtti.$ProcVar("TJSNodeListCallBack",{procsig: rtl.newTIProcSig([["currentValue",this.$rtti["TJSNode"]],["currentIndex",rtl.nativeint],["list",this.$rtti["TJSNodeList"]]])});
  this.$rtti.$MethodVar("TJSNodeListEvent",{procsig: rtl.newTIProcSig([["currentValue",this.$rtti["TJSNode"]],["currentIndex",rtl.nativeint],["list",this.$rtti["TJSNodeList"]]]), methodkind: 0});
  this.$rtti.$ExtClass("TJSNodeList",{ancestor: pas.JS.$rtti["TJSObject"], jsclass: "NodeList"});
  this.$rtti.$ExtClass("TJSAttr",{ancestor: this.$rtti["TJSNode"], jsclass: "Attr"});
  this.$rtti.$ExtClass("TJSNamedNodeMap",{ancestor: pas.JS.$rtti["TJSObject"], jsclass: "NamedNodeMap"});
  this.$rtti.$ExtClass("TJSHTMLCollection",{ancestor: pas.JS.$rtti["TJSObject"], jsclass: "HTMLCollection"});
  this.$rtti.$ProcVar("TDOMTokenlistCallBack",{procsig: rtl.newTIProcSig([["Current",rtl.jsvalue],["currentIndex",rtl.nativeint],["list",this.$rtti["TJSDOMTokenList"]]])});
  this.$rtti.$ExtClass("TJSDOMTokenList",{ancestor: pas.JS.$rtti["TJSObject"], jsclass: "DOMTokenList"});
  this.$rtti.$ExtClass("TJSDOMRect",{ancestor: pas.JS.$rtti["TJSObject"], jsclass: "DOMRect"});
  rtl.recNewT(this,"TJSClientRect",function () {
    this.left = 0.0;
    this.top = 0.0;
    this.right = 0.0;
    this.bottom = 0.0;
    this.$eq = function (b) {
      return (this.left === b.left) && (this.top === b.top) && (this.right === b.right) && (this.bottom === b.bottom);
    };
    this.$assign = function (s) {
      this.left = s.left;
      this.top = s.top;
      this.right = s.right;
      this.bottom = s.bottom;
      return this;
    };
    var $r = $mod.$rtti.$Record("TJSClientRect",{});
    $r.addField("left",rtl.double);
    $r.addField("top",rtl.double);
    $r.addField("right",rtl.double);
    $r.addField("bottom",rtl.double);
  });
  this.$rtti.$DynArray("TJSClientRectArray",{eltype: this.$rtti["TJSClientRect"]});
  this.$rtti.$ExtClass("TJSElement",{ancestor: this.$rtti["TJSNode"], jsclass: "Element"});
  rtl.recNewT(this,"TJSElementCreationOptions",function () {
    this.named = "";
    this.$eq = function (b) {
      return this.named === b.named;
    };
    this.$assign = function (s) {
      this.named = s.named;
      return this;
    };
    var $r = $mod.$rtti.$Record("TJSElementCreationOptions",{});
    $r.addField("named",rtl.string);
  });
  this.$rtti.$ExtClass("TJSDocumentType",{ancestor: this.$rtti["TJSNode"], jsclass: "DocumentType"});
  this.$rtti.$ExtClass("TJSDOMImplementation",{ancestor: pas.JS.$rtti["TJSObject"], jsclass: "DocumentImplementation"});
  this.$rtti.$ExtClass("TJSLocation",{ancestor: pas.JS.$rtti["TJSObject"], jsclass: "Location"});
  this.$rtti.$ExtClass("TJSCSSStyleDeclaration");
  this.$rtti.$ExtClass("TJSStyleSheet",{ancestor: this.$rtti["TJSEventTarget"], jsclass: "StyleSheet"});
  this.$rtti.$ExtClass("TJSCSSRule",{ancestor: pas.JS.$rtti["TJSObject"], jsclass: "CSSRule"});
  this.$rtti.$ExtClass("TJSCSSStyleRule",{ancestor: this.$rtti["TJSCSSRule"], jsclass: "CSSStyleRule"});
  this.$rtti.$ExtClass("TJSCSSRuleList",{ancestor: pas.JS.$rtti["TJSObject"], jsclass: "CSSRuleList"});
  this.$rtti.$ExtClass("TJSCSSStyleSheet",{ancestor: this.$rtti["TJSStyleSheet"], jsclass: "CSSStyleSheet"});
  this.$rtti.$ExtClass("TJSStyleSheetList",{ancestor: pas.JS.$rtti["TJSObject"], jsclass: "StyleSheetList"});
  this.$rtti.$ExtClass("TJSDocumentFragment",{ancestor: this.$rtti["TJSNode"], jsclass: "DocumentFragment"});
  rtl.recNewT(this,"TJSEventInit",function () {
    this.bubbles = false;
    this.cancelable = false;
    this.scoped = false;
    this.composed = false;
    this.$eq = function (b) {
      return (this.bubbles === b.bubbles) && (this.cancelable === b.cancelable) && (this.scoped === b.scoped) && (this.composed === b.composed);
    };
    this.$assign = function (s) {
      this.bubbles = s.bubbles;
      this.cancelable = s.cancelable;
      this.scoped = s.scoped;
      this.composed = s.composed;
      return this;
    };
    var $r = $mod.$rtti.$Record("TJSEventInit",{});
    $r.addField("bubbles",rtl.boolean);
    $r.addField("cancelable",rtl.boolean);
    $r.addField("scoped",rtl.boolean);
    $r.addField("composed",rtl.boolean);
  });
  this.$rtti.$ExtClass("TJSEvent",{ancestor: pas.JS.$rtti["TJSObject"], jsclass: "Event"});
  this.$rtti.$ExtClass("TJSXPathExpression",{ancestor: pas.JS.$rtti["TJSObject"], jsclass: "XPathExpression"});
  this.$rtti.$ExtClass("TJSXPathNSResolver",{ancestor: pas.JS.$rtti["TJSObject"], jsclass: "XPathNSResolver"});
  this.$rtti.$ExtClass("TJSCharacterData",{ancestor: this.$rtti["TJSNode"], jsclass: "CharacterData"});
  this.$rtti.$ExtClass("TJSProcessingInstruction",{ancestor: this.$rtti["TJSCharacterData"], jsclass: "ProcessingInstruction"});
  this.$rtti.$ExtClass("TJSRange",{ancestor: pas.JS.$rtti["TJSObject"], jsclass: "Range"});
  this.$rtti.$ExtClass("TJSTreeWalker",{ancestor: pas.JS.$rtti["TJSObject"], jsclass: "TreeWalker"});
  this.$rtti.$ExtClass("TJSNodeFilter",{ancestor: pas.JS.$rtti["TJSObject"], jsclass: "NodeFilter"});
  this.$rtti.$ExtClass("TJSXPathResult",{ancestor: pas.JS.$rtti["TJSObject"], jsclass: "XPathResult"});
  this.$rtti.$ExtClass("TJSSelection",{ancestor: pas.JS.$rtti["TJSObject"], jsclass: "Selection"});
  this.$rtti.$ProcVar("TJSNameSpaceMapperCallback",{procsig: rtl.newTIProcSig([["aNameSpace",rtl.string]],rtl.string)});
  this.$rtti.$ExtClass("TJSHTMLFile");
  this.$rtti.$ExtClass("TJSHTMLFileList");
  this.$rtti.$RefToProcVar("TJSDataTransferItemCallBack",{procsig: rtl.newTIProcSig([["aData",rtl.string]],null,8)});
  this.$rtti.$ExtClass("TJSDataTransferItem",{ancestor: pas.JS.$rtti["TJSObject"], jsclass: "DataTransferItem"});
  this.$rtti.$ExtClass("TJSDataTransferItemList",{ancestor: pas.JS.$rtti["TJSObject"], jsclass: "DataTransferItemList"});
  this.$rtti.$ExtClass("TJSDataTransfer",{ancestor: pas.JS.$rtti["TJSObject"], jsclass: "DataTransfer"});
  this.$rtti.$ExtClass("TJSDragEvent",{ancestor: this.$rtti["TJSEvent"], jsclass: "DragEvent"});
  this.$rtti.$RefToProcVar("TJSDragDropEventHandler",{procsig: rtl.newTIProcSig([["aEvent",this.$rtti["TJSDragEvent"]]],rtl.boolean,8)});
  this.$rtti.$RefToProcVar("THTMLClickEventHandler",{procsig: rtl.newTIProcSig([["aEvent",this.$rtti["TJSMouseEvent"]]],rtl.boolean,8)});
  this.$rtti.$ExtClass("TJSClipBoardEvent",{ancestor: this.$rtti["TJSEvent"], jsclass: "ClipboardEvent"});
  rtl.createClassExt(this,"TJSFocusEvent",Event,"",function () {
    this.$init = function () {
    };
    this.$final = function () {
    };
  });
  rtl.createClassExt(this,"TJSAnimationEvent",Event,"",function () {
    this.$init = function () {
    };
    this.$final = function () {
    };
  });
  rtl.createClassExt(this,"TJSLoadEvent",Event,"",function () {
    this.$init = function () {
    };
    this.$final = function () {
    };
  });
  this.$rtti.$ExtClass("TJSErrorEvent",{ancestor: this.$rtti["TJSEvent"], jsclass: "ErrorEvent"});
  rtl.createClassExt(this,"TJSPageTransitionEvent",Event,"",function () {
    this.$init = function () {
    };
    this.$final = function () {
    };
  });
  this.$rtti.$ExtClass("TJSHashChangeEvent",{ancestor: this.$rtti["TJSEvent"], jsclass: "HashChangeEvent"});
  this.$rtti.$ExtClass("TJSPopStateEvent",{ancestor: this.$rtti["TJSEvent"], jsclass: "PopStateEvent"});
  this.$rtti.$ExtClass("TJSStorageEvent",{ancestor: this.$rtti["TJSEvent"], jsclass: "StorageEvent"});
  this.$rtti.$ExtClass("TJSProgressEvent",{ancestor: this.$rtti["TJSEvent"], jsclass: "ProgressEvent"});
  this.$rtti.$ExtClass("TJSCloseEvent",{ancestor: this.$rtti["TJSEvent"], jsclass: "CloseEvent"});
  this.$rtti.$RefToProcVar("TJSPageTransitionEventHandler",{procsig: rtl.newTIProcSig([["aEvent",this.$rtti["TJSPageTransitionEvent"]]],rtl.boolean,8)});
  this.$rtti.$RefToProcVar("TJSHashChangeEventhandler",{procsig: rtl.newTIProcSig([["aEvent",this.$rtti["TJSHashChangeEvent"]]],rtl.boolean,8)});
  this.$rtti.$RefToProcVar("TJSMouseWheelEventHandler",{procsig: rtl.newTIProcSig([["aEvent",this.$rtti["TJSWheelEvent"]]],rtl.boolean,8)});
  this.$rtti.$RefToProcVar("TJSMouseEventHandler",{procsig: rtl.newTIProcSig([["aEvent",this.$rtti["TJSMouseEvent"]]],rtl.boolean,8)});
  this.$rtti.$RefToProcVar("THTMLAnimationEventHandler",{procsig: rtl.newTIProcSig([["aEvent",this.$rtti["TJSAnimationEvent"]]],rtl.boolean,8)});
  this.$rtti.$RefToProcVar("TJSErrorEventHandler",{procsig: rtl.newTIProcSig([["aEvent",this.$rtti["TJSErrorEvent"]]],rtl.boolean,8)});
  this.$rtti.$RefToProcVar("TJSFocusEventHandler",{procsig: rtl.newTIProcSig([["aEvent",this.$rtti["TJSFocusEvent"]]],rtl.boolean,8)});
  this.$rtti.$RefToProcVar("TJSKeyEventhandler",{procsig: rtl.newTIProcSig([["aEvent",this.$rtti["TJSKeyboardEvent"]]],rtl.boolean,8)});
  this.$rtti.$RefToProcVar("TJSLoadEventhandler",{procsig: rtl.newTIProcSig([["aEvent",this.$rtti["TJSLoadEvent"]]],rtl.boolean,8)});
  this.$rtti.$RefToProcVar("TJSPointerEventHandler",{procsig: rtl.newTIProcSig([["aEvent",this.$rtti["TJSPointerEvent"]]],rtl.boolean,8)});
  this.$rtti.$RefToProcVar("TJSUIEventHandler",{procsig: rtl.newTIProcSig([["aEvent",this.$rtti["TJSUIEvent"]]],rtl.boolean,8)});
  this.$rtti.$RefToProcVar("TJSPopStateEventHandler",{procsig: rtl.newTIProcSig([["aEvent",this.$rtti["TJSPopStateEvent"]]],rtl.boolean,8)});
  this.$rtti.$RefToProcVar("TJSStorageEventHandler",{procsig: rtl.newTIProcSig([["aEvent",this.$rtti["TJSStorageEvent"]]],rtl.boolean,8)});
  this.$rtti.$RefToProcVar("TJSProgressEventhandler",{procsig: rtl.newTIProcSig([["aEvent",this.$rtti["TJSProgressEvent"]]],rtl.boolean,8)});
  this.$rtti.$RefToProcVar("TJSTouchEventHandler",{procsig: rtl.newTIProcSig([["aEvent",this.$rtti["TJSTouchEvent"]]],rtl.boolean,8)});
  this.$rtti.$ExtClass("TJSDocument",{ancestor: this.$rtti["TJSNode"], jsclass: "Document"});
  this.$rtti.$ExtClass("TJSConsole",{ancestor: pas.JS.$rtti["TJSObject"], jsclass: "Console"});
  this.$rtti.$ExtClass("TJSCryptoKey");
  this.$rtti.$ExtClass("TJSSubtleCrypto");
  rtl.recNewT(this,"Algorithm",function () {
    this.name = "";
    this.$eq = function (b) {
      return this.name === b.name;
    };
    this.$assign = function (s) {
      this.name = s.name;
      return this;
    };
    var $r = $mod.$rtti.$Record("Algorithm",{});
    $r.addField("name",rtl.string);
  });
  rtl.recNewT(this,"AesCbcParams",function () {
    this.iv = null;
    this.$eq = function (b) {
      return this.iv === b.iv;
    };
    this.$assign = function (s) {
      this.iv = s.iv;
      return this;
    };
    var $r = $mod.$rtti.$Record("AesCbcParams",{});
    $r.addField("iv",pas.JS.$rtti["TJSBufferSource"]);
  });
  rtl.recNewT(this,"AesCtrParams",function () {
    this.counter = null;
    this.$eq = function (b) {
      return (this.counter === b.counter) && (this.length === b.length);
    };
    this.$assign = function (s) {
      this.counter = s.counter;
      this.length = s.length;
      return this;
    };
    var $r = $mod.$rtti.$Record("AesCtrParams",{});
    $r.addField("counter",pas.JS.$rtti["TJSBufferSource"]);
    $r.addField("length",rtl.byte);
  });
  rtl.recNewT(this,"AesGcmParams",function () {
    this.iv = null;
    this.additionalData = null;
    this.tagLength = 0;
    this.$eq = function (b) {
      return (this.iv === b.iv) && (this.additionalData === b.additionalData) && (this.tagLength === b.tagLength);
    };
    this.$assign = function (s) {
      this.iv = s.iv;
      this.additionalData = s.additionalData;
      this.tagLength = s.tagLength;
      return this;
    };
    var $r = $mod.$rtti.$Record("AesGcmParams",{});
    $r.addField("iv",pas.JS.$rtti["TJSBufferSource"]);
    $r.addField("additionalData",pas.JS.$rtti["TJSBufferSource"]);
    $r.addField("tagLength",rtl.byte);
  });
  rtl.recNewT(this,"HmacImportParams",function () {
    this.hash = undefined;
    this.$eq = function (b) {
      return this.hash === b.hash;
    };
    this.$assign = function (s) {
      this.hash = s.hash;
      return this;
    };
    var $r = $mod.$rtti.$Record("HmacImportParams",{});
    $r.addField("hash",rtl.jsvalue);
  });
  rtl.recNewT(this,"Pbkdf2Params",function () {
    this.salt = null;
    this.iterations = 0;
    this.hash = undefined;
    this.$eq = function (b) {
      return (this.salt === b.salt) && (this.iterations === b.iterations) && (this.hash === b.hash);
    };
    this.$assign = function (s) {
      this.salt = s.salt;
      this.iterations = s.iterations;
      this.hash = s.hash;
      return this;
    };
    var $r = $mod.$rtti.$Record("Pbkdf2Params",{});
    $r.addField("salt",pas.JS.$rtti["TJSBufferSource"]);
    $r.addField("iterations",rtl.nativeint);
    $r.addField("hash",rtl.jsvalue);
  });
  rtl.recNewT(this,"RsaHashedImportParams",function () {
    this.hash = undefined;
    this.$eq = function (b) {
      return this.hash === b.hash;
    };
    this.$assign = function (s) {
      this.hash = s.hash;
      return this;
    };
    var $r = $mod.$rtti.$Record("RsaHashedImportParams",{});
    $r.addField("hash",rtl.jsvalue);
  });
  rtl.recNewT(this,"AesKeyGenParams",function () {
    this.$eq = function (b) {
      return this.length === b.length;
    };
    this.$assign = function (s) {
      this.length = s.length;
      return this;
    };
    var $r = $mod.$rtti.$Record("AesKeyGenParams",{});
    $r.addField("length",rtl.longint);
  });
  rtl.recNewT(this,"HmacKeyGenParams",function () {
    this.hash = undefined;
    this.$eq = function (b) {
      return (this.hash === b.hash) && (this.length === b.length);
    };
    this.$assign = function (s) {
      this.hash = s.hash;
      this.length = s.length;
      return this;
    };
    var $r = $mod.$rtti.$Record("HmacKeyGenParams",{});
    $r.addField("hash",rtl.jsvalue);
    $r.addField("length",rtl.longint);
  });
  rtl.recNewT(this,"RsaHashedKeyGenParams",function () {
    this.modulusLength = 0;
    this.publicExponent = null;
    this.hash = undefined;
    this.$eq = function (b) {
      return (this.modulusLength === b.modulusLength) && (this.publicExponent === b.publicExponent) && (this.hash === b.hash);
    };
    this.$assign = function (s) {
      this.modulusLength = s.modulusLength;
      this.publicExponent = s.publicExponent;
      this.hash = s.hash;
      return this;
    };
    var $r = $mod.$rtti.$Record("RsaHashedKeyGenParams",{});
    $r.addField("modulusLength",rtl.longint);
    $r.addField("publicExponent",pas.JS.$rtti["TJSUint8Array"]);
    $r.addField("hash",rtl.jsvalue);
  });
  rtl.recNewT(this,"RsaOaepParams",function () {
    this.$eq = function (b) {
      return this.label === b.label;
    };
    this.$assign = function (s) {
      this.label = s.label;
      return this;
    };
    var $r = $mod.$rtti.$Record("RsaOaepParams",{});
    $r.addField("label",pas.JS.$rtti["TJSBufferSource"]);
  });
  rtl.recNewT(this,"RsaPssParams",function () {
    this.saltLength = 0;
    this.$eq = function (b) {
      return this.saltLength === b.saltLength;
    };
    this.$assign = function (s) {
      this.saltLength = s.saltLength;
      return this;
    };
    var $r = $mod.$rtti.$Record("RsaPssParams",{});
    $r.addField("saltLength",rtl.longint);
  });
  rtl.recNewT(this,"DhKeyGenParams",function () {
    this.prime = null;
    this.generator = null;
    this.$eq = function (b) {
      return (this.prime === b.prime) && (this.generator === b.generator);
    };
    this.$assign = function (s) {
      this.prime = s.prime;
      this.generator = s.generator;
      return this;
    };
    var $r = $mod.$rtti.$Record("DhKeyGenParams",{});
    $r.addField("prime",pas.JS.$rtti["TJSUint8Array"]);
    $r.addField("generator",pas.JS.$rtti["TJSUint8Array"]);
  });
  rtl.recNewT(this,"EcKeyGenParams",function () {
    this.$eq = function (b) {
      return this.namedCurve === b.namedCurve;
    };
    this.$assign = function (s) {
      this.namedCurve = s.namedCurve;
      return this;
    };
    var $r = $mod.$rtti.$Record("EcKeyGenParams",{});
    $r.addField("namedCurve",rtl.string);
  });
  rtl.recNewT(this,"AesDerivedKeyParams",function () {
    this.$eq = function (b) {
      return this.length === b.length;
    };
    this.$assign = function (s) {
      this.length = s.length;
      return this;
    };
    var $r = $mod.$rtti.$Record("AesDerivedKeyParams",{});
    $r.addField("length",rtl.longint);
  });
  rtl.recNewT(this,"HmacDerivedKeyParams",function () {
    this.$eq = function (b) {
      return this.length === b.length;
    };
    this.$assign = function (s) {
      this.length = s.length;
      return this;
    };
    var $r = $mod.$rtti.$Record("HmacDerivedKeyParams",{});
    $r.addField("length",rtl.longint);
  });
  rtl.recNewT(this,"EcdhKeyDeriveParams",function () {
    this.$eq = function (b) {
      return this.public === b.public;
    };
    this.$assign = function (s) {
      this.public = s.public;
      return this;
    };
    var $r = $mod.$rtti.$Record("EcdhKeyDeriveParams",{});
    $r.addField("public",$mod.$rtti["TJSCryptoKey"]);
  });
  rtl.recNewT(this,"DhKeyDeriveParams",function () {
    this.$eq = function (b) {
      return this.public === b.public;
    };
    this.$assign = function (s) {
      this.public = s.public;
      return this;
    };
    var $r = $mod.$rtti.$Record("DhKeyDeriveParams",{});
    $r.addField("public",$mod.$rtti["TJSCryptoKey"]);
  });
  rtl.recNewT(this,"DhImportKeyParams",function () {
    this.prime = null;
    this.generator = null;
    this.$eq = function (b) {
      return (this.prime === b.prime) && (this.generator === b.generator);
    };
    this.$assign = function (s) {
      this.prime = s.prime;
      this.generator = s.generator;
      return this;
    };
    var $r = $mod.$rtti.$Record("DhImportKeyParams",{});
    $r.addField("prime",pas.JS.$rtti["TJSUint8Array"]);
    $r.addField("generator",pas.JS.$rtti["TJSUint8Array"]);
  });
  rtl.recNewT(this,"EcdsaParams",function () {
    this.hash = undefined;
    this.$eq = function (b) {
      return this.hash === b.hash;
    };
    this.$assign = function (s) {
      this.hash = s.hash;
      return this;
    };
    var $r = $mod.$rtti.$Record("EcdsaParams",{});
    $r.addField("hash",rtl.jsvalue);
  });
  rtl.recNewT(this,"EcKeyImportParams",function () {
    this.$eq = function (b) {
      return this.namedCurve === b.namedCurve;
    };
    this.$assign = function (s) {
      this.namedCurve = s.namedCurve;
      return this;
    };
    var $r = $mod.$rtti.$Record("EcKeyImportParams",{});
    $r.addField("namedCurve",rtl.string);
  });
  rtl.recNewT(this,"HkdfParams",function () {
    this.hash = undefined;
    this.salt = null;
    this.info = null;
    this.$eq = function (b) {
      return (this.hash === b.hash) && (this.salt === b.salt) && (this.info === b.info);
    };
    this.$assign = function (s) {
      this.hash = s.hash;
      this.salt = s.salt;
      this.info = s.info;
      return this;
    };
    var $r = $mod.$rtti.$Record("HkdfParams",{});
    $r.addField("hash",rtl.jsvalue);
    $r.addField("salt",pas.JS.$rtti["TJSBufferSource"]);
    $r.addField("info",pas.JS.$rtti["TJSBufferSource"]);
  });
  rtl.recNewT(this,"RsaOtherPrimesInfo",function () {
    this.r = "";
    this.d = "";
    this.t = "";
    this.$eq = function (b) {
      return (this.r === b.r) && (this.d === b.d) && (this.t === b.t);
    };
    this.$assign = function (s) {
      this.r = s.r;
      this.d = s.d;
      this.t = s.t;
      return this;
    };
    var $r = $mod.$rtti.$Record("RsaOtherPrimesInfo",{});
    $r.addField("r",rtl.string);
    $r.addField("d",rtl.string);
    $r.addField("t",rtl.string);
  });
  this.$rtti.$DynArray("TRsaOtherPrimesInfoDynArray",{eltype: this.$rtti["RsaOtherPrimesInfo"]});
  rtl.recNewT(this,"JsonWebKey",function () {
    this.kty = "";
    this.use = "";
    this.alg = "";
    this.ext = false;
    this.crv = "";
    this.x = "";
    this.y = "";
    this.d = "";
    this.n = "";
    this.e = "";
    this.p = "";
    this.q = "";
    this.dp = "";
    this.dq = "";
    this.qi = "";
    this.k = "";
    this.$new = function () {
      var r = Object.create(this);
      r.key_ops = [];
      r.oth = [];
      return r;
    };
    this.$eq = function (b) {
      return (this.kty === b.kty) && (this.use === b.use) && (this.key_ops === b.key_ops) && (this.alg === b.alg) && (this.ext === b.ext) && (this.crv === b.crv) && (this.x === b.x) && (this.y === b.y) && (this.d === b.d) && (this.n === b.n) && (this.e === b.e) && (this.p === b.p) && (this.q === b.q) && (this.dp === b.dp) && (this.dq === b.dq) && (this.qi === b.qi) && (this.oth === b.oth) && (this.k === b.k);
    };
    this.$assign = function (s) {
      this.kty = s.kty;
      this.use = s.use;
      this.key_ops = rtl.arrayRef(s.key_ops);
      this.alg = s.alg;
      this.ext = s.ext;
      this.crv = s.crv;
      this.x = s.x;
      this.y = s.y;
      this.d = s.d;
      this.n = s.n;
      this.e = s.e;
      this.p = s.p;
      this.q = s.q;
      this.dp = s.dp;
      this.dq = s.dq;
      this.qi = s.qi;
      this.oth = rtl.arrayRef(s.oth);
      this.k = s.k;
      return this;
    };
    var $r = $mod.$rtti.$Record("JsonWebKey",{});
    $r.addField("kty",rtl.string);
    $r.addField("use",rtl.string);
    $r.addField("key_ops",pas.Types.$rtti["TStringDynArray"]);
    $r.addField("alg",rtl.string);
    $r.addField("ext",rtl.boolean);
    $r.addField("crv",rtl.string);
    $r.addField("x",rtl.string);
    $r.addField("y",rtl.string);
    $r.addField("d",rtl.string);
    $r.addField("n",rtl.string);
    $r.addField("e",rtl.string);
    $r.addField("p",rtl.string);
    $r.addField("q",rtl.string);
    $r.addField("dp",rtl.string);
    $r.addField("dq",rtl.string);
    $r.addField("qi",rtl.string);
    $r.addField("oth",$mod.$rtti["TRsaOtherPrimesInfoDynArray"]);
    $r.addField("k",rtl.string);
  });
  rtl.recNewT(this,"CryptoKeyPair",function () {
    this.publicKey = null;
    this.privateKey = null;
    this.$eq = function (b) {
      return (this.publicKey === b.publicKey) && (this.privateKey === b.privateKey);
    };
    this.$assign = function (s) {
      this.publicKey = s.publicKey;
      this.privateKey = s.privateKey;
      return this;
    };
    var $r = $mod.$rtti.$Record("CryptoKeyPair",{});
    $r.addField("publicKey",$mod.$rtti["TJSCryptoKey"]);
    $r.addField("privateKey",$mod.$rtti["TJSCryptoKey"]);
  });
  this.$rtti.$DynArray("TKeyUsageDynArray",{eltype: rtl.string});
  this.$rtti.$ExtClass("TJSCryptoKey",{jsclass: "CryptoKey"});
  this.$rtti.$ExtClass("TJSSubtleCrypto",{jsclass: "SubtleCrypto"});
  this.$rtti.$ExtClass("TJSCrypto",{ancestor: pas.JS.$rtti["TJSObject"], jsclass: "Crypto"});
  this.$rtti.$ExtClass("TJSHistory",{ancestor: pas.JS.$rtti["TJSObject"], jsclass: "History"});
  rtl.createClass(this,"TJSIDBTransactionMode",pas.System.TObject,function () {
    this.readonly = "readonly";
    this.readwrite = "readwrite";
    this.versionchange = "versionchange";
  });
  this.$rtti.$ExtClass("TJSIDBTransaction",{ancestor: this.$rtti["TJSEventTarget"], jsclass: "IDBTransaction"});
  this.$rtti.$ExtClass("TJSIDBKeyRange",{ancestor: pas.JS.$rtti["TJSObject"], jsclass: "IDBKeyRange"});
  rtl.recNewT(this,"TJSIDBIndexParameters",function () {
    this.unique = false;
    this.multiEntry = false;
    this.locale = "";
    this.$eq = function (b) {
      return (this.unique === b.unique) && (this.multiEntry === b.multiEntry) && (this.locale === b.locale);
    };
    this.$assign = function (s) {
      this.unique = s.unique;
      this.multiEntry = s.multiEntry;
      this.locale = s.locale;
      return this;
    };
    var $r = $mod.$rtti.$Record("TJSIDBIndexParameters",{});
    $r.addField("unique",rtl.boolean);
    $r.addField("multiEntry",rtl.boolean);
    $r.addField("locale",rtl.string);
  });
  this.$rtti.$ExtClass("TJSIDBIndex",{ancestor: pas.JS.$rtti["TJSObject"], jsclass: "IDBIndex"});
  this.$rtti.$ExtClass("TJSIDBCursorDirection",{ancestor: pas.JS.$rtti["TJSObject"], jsclass: "IDBCursorDirection"});
  this.$rtti.$ExtClass("TJSIDBCursor",{ancestor: pas.JS.$rtti["TJSObject"], jsclass: "IDBCursor"});
  this.$rtti.$ExtClass("TJSIDBObjectStore",{ancestor: this.$rtti["TJSEventTarget"], jsclass: "IDBObjectStore"});
  this.$rtti.$ExtClass("TJSIDBRequest",{ancestor: this.$rtti["TJSEventTarget"], jsclass: "IDBRequest"});
  this.$rtti.$ExtClass("TJSIDBOpenDBRequest",{ancestor: this.$rtti["TJSIDBRequest"], jsclass: "IDBOpenDBRequest"});
  rtl.recNewT(this,"TJSCreateObjectStoreOptions",function () {
    this.keyPath = undefined;
    this.autoIncrement = false;
    this.$eq = function (b) {
      return (this.keyPath === b.keyPath) && (this.autoIncrement === b.autoIncrement);
    };
    this.$assign = function (s) {
      this.keyPath = s.keyPath;
      this.autoIncrement = s.autoIncrement;
      return this;
    };
    var $r = $mod.$rtti.$Record("TJSCreateObjectStoreOptions",{});
    $r.addField("keyPath",rtl.jsvalue);
    $r.addField("autoIncrement",rtl.boolean);
  });
  this.$rtti.$ExtClass("TIDBDatabase",{ancestor: this.$rtti["TJSEventTarget"], jsclass: "IDBDatabase"});
  this.$rtti.$ExtClass("TJSIDBFactory",{ancestor: this.$rtti["TJSEventTarget"], jsclass: "IDBFactory"});
  this.$rtti.$ExtClass("TJSStorage",{ancestor: this.$rtti["TJSEventTarget"], jsclass: "Storage"});
  this.$rtti.$ExtClass("TJSVisibleItem",{ancestor: pas.JS.$rtti["TJSObject"], jsclass: "IVisible"});
  this.$rtti.$ExtClass("TJSLocationBar",{ancestor: this.$rtti["TJSVisibleItem"], jsclass: "LocationBar"});
  this.$rtti.$ExtClass("TJSMenuBar",{ancestor: this.$rtti["TJSVisibleItem"], jsclass: "MenuBar"});
  this.$rtti.$ExtClass("TJSToolBar",{ancestor: this.$rtti["TJSVisibleItem"], jsclass: "ToolBar"});
  this.$rtti.$ExtClass("TJSPersonalBar",{ancestor: this.$rtti["TJSVisibleItem"], jsclass: "PersonalBar"});
  this.$rtti.$ExtClass("TJSScrollBars",{ancestor: this.$rtti["TJSVisibleItem"], jsclass: "ScrollBars"});
  rtl.recNewT(this,"TJSPositionError",function () {
    this.code = 0;
    this.message = "";
    this.$eq = function (b) {
      return (this.code === b.code) && (this.message === b.message);
    };
    this.$assign = function (s) {
      this.code = s.code;
      this.message = s.message;
      return this;
    };
    var $r = $mod.$rtti.$Record("TJSPositionError",{});
    $r.addField("code",rtl.longint);
    $r.addField("message",rtl.string);
  });
  rtl.recNewT(this,"TJSPositionOptions",function () {
    this.enableHighAccuracy = false;
    this.timeout = 0;
    this.maximumAge = 0;
    this.$eq = function (b) {
      return (this.enableHighAccuracy === b.enableHighAccuracy) && (this.timeout === b.timeout) && (this.maximumAge === b.maximumAge);
    };
    this.$assign = function (s) {
      this.enableHighAccuracy = s.enableHighAccuracy;
      this.timeout = s.timeout;
      this.maximumAge = s.maximumAge;
      return this;
    };
    var $r = $mod.$rtti.$Record("TJSPositionOptions",{});
    $r.addField("enableHighAccuracy",rtl.boolean);
    $r.addField("timeout",rtl.longint);
    $r.addField("maximumAge",rtl.longint);
  });
  rtl.recNewT(this,"TJSCoordinates",function () {
    this.latitude = 0.0;
    this.longitude = 0.0;
    this.altitude = 0.0;
    this.accuracy = 0.0;
    this.altitudeAccuracy = 0.0;
    this.heading = 0.0;
    this.speed = 0.0;
    this.$eq = function (b) {
      return (this.latitude === b.latitude) && (this.longitude === b.longitude) && (this.altitude === b.altitude) && (this.accuracy === b.accuracy) && (this.altitudeAccuracy === b.altitudeAccuracy) && (this.heading === b.heading) && (this.speed === b.speed);
    };
    this.$assign = function (s) {
      this.latitude = s.latitude;
      this.longitude = s.longitude;
      this.altitude = s.altitude;
      this.accuracy = s.accuracy;
      this.altitudeAccuracy = s.altitudeAccuracy;
      this.heading = s.heading;
      this.speed = s.speed;
      return this;
    };
    var $r = $mod.$rtti.$Record("TJSCoordinates",{});
    $r.addField("latitude",rtl.double);
    $r.addField("longitude",rtl.double);
    $r.addField("altitude",rtl.double);
    $r.addField("accuracy",rtl.double);
    $r.addField("altitudeAccuracy",rtl.double);
    $r.addField("heading",rtl.double);
    $r.addField("speed",rtl.double);
  });
  rtl.recNewT(this,"TJSPosition",function () {
    this.timestamp = "";
    this.$new = function () {
      var r = Object.create(this);
      r.coords = $mod.TJSCoordinates.$new();
      return r;
    };
    this.$eq = function (b) {
      return this.coords.$eq(b.coords) && (this.timestamp === b.timestamp);
    };
    this.$assign = function (s) {
      this.coords.$assign(s.coords);
      this.timestamp = s.timestamp;
      return this;
    };
    var $r = $mod.$rtti.$Record("TJSPosition",{});
    $r.addField("coords",$mod.$rtti["TJSCoordinates"]);
    $r.addField("timestamp",rtl.string);
  });
  this.$rtti.$ProcVar("TJSGeoLocationCallback",{procsig: rtl.newTIProcSig([["aPosition",this.$rtti["TJSPosition"]]])});
  this.$rtti.$MethodVar("TJSGeoLocationEvent",{procsig: rtl.newTIProcSig([["aPosition",this.$rtti["TJSPosition"]]]), methodkind: 0});
  this.$rtti.$ProcVar("TJSGeoLocationErrorCallback",{procsig: rtl.newTIProcSig([["aValue",this.$rtti["TJSPositionError"]]])});
  this.$rtti.$MethodVar("TJSGeoLocationErrorEvent",{procsig: rtl.newTIProcSig([["aValue",this.$rtti["TJSPositionError"]]]), methodkind: 0});
  this.$rtti.$ExtClass("TJSGeoLocation",{ancestor: pas.JS.$rtti["TJSObject"], jsclass: "GeoLocation"});
  this.$rtti.$ExtClass("TJSMediaStreamTrack",{ancestor: this.$rtti["TJSEventTarget"], jsclass: "MediaStreamTrack"});
  this.$rtti.$ExtClass("TJSMediaDevices",{ancestor: this.$rtti["TJSEventTarget"], jsclass: "MediaDevices"});
  this.$rtti.$ExtClass("TJSWorker",{ancestor: this.$rtti["TJSEventTarget"], jsclass: "Worker"});
  this.$rtti.$ExtClass("TJSMessagePort",{ancestor: this.$rtti["TJSEventTarget"], jsclass: "MessagePort"});
  this.$rtti.$ExtClass("TJSSharedWorker",{ancestor: this.$rtti["TJSEventTarget"], jsclass: "SharedWorker"});
  this.$rtti.$ExtClass("TJSServiceWorker",{ancestor: this.$rtti["TJSWorker"], jsclass: "ServiceWorker"});
  this.$rtti.$ExtClass("TJSServiceWorkerRegistration",{ancestor: pas.JS.$rtti["TJSObject"], jsclass: "ServiceWorkerRegistration"});
  rtl.recNewT(this,"TJSServiceWorkerContainerOptions",function () {
    this.scope = "";
    this.$eq = function (b) {
      return this.scope === b.scope;
    };
    this.$assign = function (s) {
      this.scope = s.scope;
      return this;
    };
    var $r = $mod.$rtti.$Record("TJSServiceWorkerContainerOptions",{});
    $r.addField("scope",rtl.string);
  });
  this.$rtti.$ExtClass("TJSServiceWorkerContainer",{ancestor: pas.JS.$rtti["TJSObject"], jsclass: "ServiceWorkerContainer"});
  this.$rtti.$ExtClass("TJSClipboardItemOptions",{ancestor: pas.JS.$rtti["TJSObject"], jsclass: "Object"});
  this.$rtti.$ExtClass("TJSClipBoardItem",{ancestor: pas.JS.$rtti["TJSObject"], jsclass: "ClipboardItem"});
  this.$rtti.$ExtClass("TJSClipBoard",{ancestor: this.$rtti["TJSEventTarget"], jsclass: "Clipboard"});
  this.$rtti.$ExtClass("TJSNavigator",{ancestor: pas.JS.$rtti["TJSObject"], jsclass: "Navigator"});
  this.$rtti.$ExtClass("TJSTouch",{ancestor: pas.JS.$rtti["TJSObject"], jsclass: "Touch"});
  this.$rtti.$ExtClass("TJSTouchList",{ancestor: pas.JS.$rtti["TJSObject"], jsclass: "TouchList"});
  this.$rtti.$ExtClass("TJSPerformance",{ancestor: pas.JS.$rtti["TJSObject"], jsclass: "Performance"});
  this.$rtti.$ExtClass("TJSScreen",{ancestor: pas.JS.$rtti["TJSObject"], jsclass: "Screen"});
  this.$rtti.$RefToProcVar("TJSParamEnumCallBack",{procsig: rtl.newTIProcSig([["aKey",rtl.string,2],["aValue",rtl.string,2]])});
  this.$rtti.$ExtClass("TJSURLSearchParams",{ancestor: pas.JS.$rtti["TJSObject"], jsclass: "URLSearchParams"});
  this.$rtti.$ExtClass("TJSURL",{ancestor: pas.JS.$rtti["TJSObject"], jsclass: "URL"});
  this.$rtti.$RefToProcVar("TJSTimerCallBack",{procsig: rtl.newTIProcSig([],null,8)});
  this.$rtti.$StaticArray("Theader",{dims: [2], eltype: rtl.string});
  this.$rtti.$DynArray("THeaderArray",{eltype: this.$rtti["Theader"]});
  this.$rtti.$ExtClass("TJSHTMLHeaders",{ancestor: pas.JS.$rtti["TJSObject"], jsclass: "Headers"});
  this.$rtti.$ExtClass("TJSMediaQueryList",{ancestor: pas.JS.$rtti["TJSObject"], jsclass: "MediaQueryList"});
  this.$rtti.$ExtClass("TJSReadableStream",{ancestor: pas.JS.$rtti["TJSObject"], jsclass: "ReadableStream"});
  this.$rtti.$ExtClass("TJSWritableStream",{ancestor: pas.JS.$rtti["TJSObject"], jsclass: "WritableStream"});
  this.$rtti.$ExtClass("TJSBody",{ancestor: pas.JS.$rtti["TJSObject"], jsclass: "Body"});
  this.$rtti.$ExtClass("TJSResponse",{ancestor: this.$rtti["TJSBody"], jsclass: "Response"});
  this.$rtti.$RefToProcVar("TFrameRequestCallback",{procsig: rtl.newTIProcSig([["aTime",rtl.double]])});
  this.$rtti.$ExtClass("TJSPostMessageOptions",{ancestor: pas.JS.$rtti["TJSObject"], jsclass: "Object"});
  rtl.createClass(this,"TJSIdleCallbackOptions",pas.System.TObject,function () {
    this.$init = function () {
      pas.System.TObject.$init.call(this);
      this.timeout = 0;
    };
  });
  this.$rtti.$ExtClass("TJSIdleDeadline",{jsclass: "IdleDeadline"});
  this.$rtti.$RefToProcVar("TIdleCallbackProc",{procsig: rtl.newTIProcSig([["idleDeadline",this.$rtti["TJSIdleDeadline"]]])});
  this.$rtti.$DynArray("TJSWindowArray",{eltype: this.$rtti["TJSWindow"]});
  this.$rtti.$ExtClass("TJSWindow",{ancestor: pas.JS.$rtti["TJSObject"], jsclass: "Window"});
  this.$rtti.$ExtClass("TJSCSSStyleDeclaration",{ancestor: pas.JS.$rtti["TJSObject"], jsclass: "CSSStyleDeclaration"});
  this.$rtti.$ExtClass("TJSScrollIntoViewOptions",{ancestor: pas.JS.$rtti["TJSObject"], jsclass: "Object"});
  this.$rtti.$ExtClass("TJSHTMLElement",{ancestor: this.$rtti["TJSElement"], jsclass: "HTMLElement"});
  this.$rtti.$ExtClass("TJSHTMLDivElement",{ancestor: this.$rtti["TJSHTMLElement"], jsclass: "HTMLDivElement"});
  this.$rtti.$ExtClass("TJSHTMLFormControlsCollection",{ancestor: this.$rtti["TJSHTMLCollection"], jsclass: "HTMLFormControlsCollection"});
  this.$rtti.$ExtClass("TJSHTMLFormElement",{ancestor: this.$rtti["TJSHTMLElement"], jsclass: "HTMLFormElement"});
  this.$rtti.$ExtClass("TJSValidityState",{ancestor: pas.JS.$rtti["TJSObject"], jsclass: "ValidityState"});
  this.$rtti.$ExtClass("TJSBlob",{ancestor: this.$rtti["TJSEventTarget"], jsclass: "Blob"});
  this.$rtti.$ExtClass("TJSHTMLFile",{ancestor: this.$rtti["TJSBlob"], jsclass: "File"});
  this.$rtti.$ExtClass("TJSHTMLFileList",{ancestor: this.$rtti["TJSEventTarget"], jsclass: "FileList"});
  this.$rtti.$ExtClass("TJSHTMLInputElement",{ancestor: this.$rtti["TJSHTMLElement"], jsclass: "HTMLInputElement"});
  this.$rtti.$ExtClass("TJSDOMSettableTokenList",{ancestor: this.$rtti["TJSDOMTokenList"], jsclass: "DOMSettableTokenList"});
  this.$rtti.$ExtClass("TJSHTMLOutputElement",{ancestor: this.$rtti["TJSHTMLElement"], jsclass: "HTMLOutputElement"});
  this.$rtti.$ExtClass("TJSHTMLImageElement",{ancestor: this.$rtti["TJSHTMLElement"], jsclass: "Image"});
  this.$rtti.$ExtClass("TJSHTMLLinkElement",{ancestor: this.$rtti["TJSHTMLElement"], jsclass: "HTMLLinkElement"});
  this.$rtti.$ExtClass("TJSHTMLAnchorElement",{ancestor: this.$rtti["TJSHTMLElement"], jsclass: "HTMLAnchorElement"});
  this.$rtti.$ExtClass("TJSHTMLMenuElement",{ancestor: this.$rtti["TJSHTMLElement"], jsclass: "HTMLMenuElement"});
  this.$rtti.$ExtClass("TJSHTMLButtonElement",{ancestor: this.$rtti["TJSHTMLElement"], jsclass: "HTMLButtonElement"});
  this.$rtti.$ExtClass("TJSHTMLLabelElement",{ancestor: this.$rtti["TJSHTMLElement"], jsclass: "HTMLLabelElement"});
  this.$rtti.$ExtClass("TJSHTMLTextAreaElement",{ancestor: this.$rtti["TJSHTMLElement"], jsclass: "HTMLTextAreaElement"});
  this.$rtti.$ExtClass("TJSHTMLEmbedElement",{ancestor: this.$rtti["TJSHTMLElement"], jsclass: "HTMLEmbedElement"});
  this.$rtti.$ExtClass("TJSHTMLOptionElement",{ancestor: this.$rtti["TJSHTMLElement"], jsclass: "Option"});
  this.$rtti.$ExtClass("TJSHTMLOptGroupElement",{ancestor: this.$rtti["TJSHTMLElement"], jsclass: "HTMLOptGroupElement"});
  this.$rtti.$ExtClass("TJSHTMLOptionsCollection",{ancestor: this.$rtti["TJSHTMLCollection"], jsclass: "HTMLOptionsCollection"});
  this.$rtti.$ExtClass("TJSHTMLSelectElement",{ancestor: this.$rtti["TJSHTMLElement"], jsclass: "HTMLSelectElement"});
  this.$rtti.$ExtClass("TJSHTMLTableSectionElement");
  this.$rtti.$ExtClass("TJSHTMLTableRowElement");
  this.$rtti.$ExtClass("TJSHTMLTableElement",{ancestor: this.$rtti["TJSHTMLElement"], jsclass: "HTMLTableElement"});
  this.$rtti.$ExtClass("TJSHTMLTableSectionElement",{ancestor: this.$rtti["TJSHTMLElement"], jsclass: "HTMLTableSectionElement"});
  this.$rtti.$ExtClass("TJSHTMLTableCellElement",{ancestor: this.$rtti["TJSHTMLElement"], jsclass: "HTMLTableCellElement"});
  this.$rtti.$ExtClass("TJSHTMLTableRowElement",{ancestor: this.$rtti["TJSHTMLElement"], jsclass: "HTMLTableRowElement"});
  this.$rtti.$ExtClass("TJSHTMLTableDataCellElement",{ancestor: this.$rtti["TJSHTMLElement"], jsclass: "HTMLTableDataCellElement"});
  this.$rtti.$ExtClass("TJSCanvasRenderingContext2D");
  this.$rtti.$RefToProcVar("THTMLCanvasToBlobCallback",{procsig: rtl.newTIProcSig([["aBlob",this.$rtti["TJSBlob"]]],rtl.boolean,8)});
  this.$rtti.$ExtClass("TJSHTMLCanvasElement",{ancestor: this.$rtti["TJSHTMLElement"], jsclass: "HTMLCanvasElement"});
  this.$rtti.$ExtClass("TJSHTMLProgressElement",{ancestor: this.$rtti["TJSHTMLElement"], jsclass: "HTMLProgressElement"});
  this.$rtti.$ExtClass("TJSDOMException",{ancestor: pas.JS.$rtti["TJSObject"], jsclass: "DOMException"});
  this.$rtti.$ExtClass("TJSFileReader",{ancestor: this.$rtti["TJSEventTarget"], jsclass: "FileReader"});
  this.$rtti.$ExtClass("TJSCanvasGradient",{ancestor: pas.JS.$rtti["TJSObject"], jsclass: "CanvasGradient"});
  this.$rtti.$ExtClass("TJSCanvasPattern",{ancestor: pas.JS.$rtti["TJSObject"], jsclass: "CanvasPattern"});
  this.$rtti.$ExtClass("TJSPath2D",{ancestor: pas.JS.$rtti["TJSObject"], jsclass: "Path2D"});
  this.$rtti.$ExtClass("TJSImageData",{ancestor: pas.JS.$rtti["TJSObject"], jsclass: "ImageData"});
  this.$rtti.$ExtClass("TJSTextMetrics",{ancestor: pas.JS.$rtti["TJSObject"], jsclass: "TextMetrics"});
  this.$rtti.$ExtClass("TJSCanvasRenderingContext2D",{ancestor: pas.JS.$rtti["TJSObject"], jsclass: "CanvasRenderingContext2D"});
  this.$rtti.$ExtClass("TJSHTMLIFrameElement",{ancestor: this.$rtti["TJSHTMLElement"], jsclass: "HTMLIFrameElement"});
  this.$rtti.$ExtClass("TJSHTMLScriptElement",{ancestor: this.$rtti["TJSHTMLElement"], jsclass: "HTMLScriptElement"});
  this.$rtti.$ExtClass("TJSXMLHttpRequestEventTarget",{ancestor: this.$rtti["TJSEventTarget"], jsclass: "XMLHttpRequestEventTarget"});
  this.$rtti.$ExtClass("TJSXMLHttpRequestUpload",{ancestor: this.$rtti["TJSXMLHttpRequestEventTarget"], jsclass: "XMLHttpRequestUpload"});
  this.$rtti.$RefToProcVar("TJSOnReadyStateChangeHandler",{procsig: rtl.newTIProcSig([],null,8)});
  this.$rtti.$ExtClass("TJSXMLHttpRequest",{ancestor: this.$rtti["TJSXMLHttpRequestEventTarget"], jsclass: "XMLHttpRequest"});
  this.$rtti.$ExtClass("TJSUIEvent",{ancestor: this.$rtti["TJSEvent"], jsclass: "UIEvent"});
  this.$rtti.$ExtClass("TJSMouseEvent",{ancestor: this.$rtti["TJSUIEvent"], jsclass: "MouseEvent"});
  rtl.recNewT(this,"TJSWheelEventInit",function () {
    this.deltaX = 0.0;
    this.deltaY = 0.0;
    this.deltaZ = 0.0;
    this.deltaMode = 0;
    this.$eq = function (b) {
      return (this.deltaX === b.deltaX) && (this.deltaY === b.deltaY) && (this.deltaZ === b.deltaZ) && (this.deltaMode === b.deltaMode);
    };
    this.$assign = function (s) {
      this.deltaX = s.deltaX;
      this.deltaY = s.deltaY;
      this.deltaZ = s.deltaZ;
      this.deltaMode = s.deltaMode;
      return this;
    };
    var $r = $mod.$rtti.$Record("TJSWheelEventInit",{});
    $r.addField("deltaX",rtl.double);
    $r.addField("deltaY",rtl.double);
    $r.addField("deltaZ",rtl.double);
    $r.addField("deltaMode",rtl.nativeint);
  });
  this.$rtti.$ExtClass("TJSWheelEvent",{ancestor: this.$rtti["TJSMouseEvent"], jsclass: "WheelEvent"});
  this.$rtti.$ExtClass("TJSPointerEvent",{ancestor: this.$rtti["TJSMouseEvent"], jsclass: "PointerEvent"});
  this.$rtti.$ExtClass("TJSTouchEvent",{ancestor: this.$rtti["TJSUIEvent"], jsclass: "TouchEvent"});
  rtl.createClass(this,"TJSKeyNames",pas.System.TObject,function () {
    this.Alt = "Alt";
    this.AltGraph = "AltGraph";
    this.CapsLock = "CapsLock";
    this.Control = "Control";
    this.Fn = "Fn";
    this.FnLock = "FnLock";
    this.Hyper = "Hyper";
    this.Meta = "Meta";
    this.NumLock = "NumLock";
    this.ScrollLock = "ScrollLock";
    this.Shift = "Shift";
    this.Super = "Super";
    this.Symbol = "Symbol";
    this.SymbolLock = "SymbolLock";
    this.Enter = "Enter";
    this.Tab = "Tab";
    this.Space = "Space";
    this.ArrowDown = "ArrowDown";
    this.ArrowLeft = "ArrowLeft";
    this.ArrowRight = "ArrowRight";
    this.ArrowUp = "ArrowUp";
    this._End = "End";
    this.Home = "Home";
    this.PageDown = "PageDown";
    this.PageUp = "PageUp";
    this.BackSpace = "Backspace";
    this.Clear = "Clear";
    this.Copy = "Copy";
    this.CrSel = "CrSel";
    this.Cut = "Cut";
    this.Delete = "Delete";
    this.EraseEof = "EraseEof";
    this.ExSel = "ExSel";
    this.Insert = "Insert";
    this.Paste = "Paste";
    this.Redo = "Redo";
    this.Undo = "Undo";
    this.Accept = "Accept";
    this.Again = "Again";
    this.Attn = "Attn";
    this.Cancel = "Cancel";
    this.ContextMenu = "Contextmenu";
    this.Escape = "Escape";
    this.Execute = "Execute";
    this.Find = "Find";
    this.Finish = "Finish";
    this.Help = "Help";
    this.Pause = "Pause";
    this.Play = "Play";
    this.Props = "Props";
    this.Select = "Select";
    this.ZoomIn = "ZoomIn";
    this.ZoomOut = "ZoomOut";
    this.BrightnessDown = "BrightnessDown";
    this.BrightnessUp = "BrightnessUp";
    this.Eject = "Eject";
    this.LogOff = "LogOff";
    this.Power = "Power";
    this.PowerOff = "PowerOff";
    this.PrintScreen = "PrintScreen";
    this.Hibernate = "Hibernate";
    this.Standby = "Standby";
    this.WakeUp = "WakeUp";
    this.AllCandidates = "AllCandidates";
    this.Alphanumeric = "Alphanumeric";
    this.CodeInput = "CodeInput";
    this.Compose = "Compose";
    this.Convert = "Convert";
    this.Dead = "Dead";
    this.FinalMode = "FinalMode";
    this.GroupFirst = "GroupFirst";
    this.GroupLast = "GroupLast";
    this.GroupNext = "GroupNext";
    this.GroupPrevious = "GroupPrevious";
    this.ModelChange = "ModelChange";
    this.NextCandidate = "NextCandidate";
    this.NonConvert = "NonConvert";
    this.PreviousCandidate = "PreviousCandidate";
    this.Process = "Process";
    this.SingleCandidate = "SingleCandidate";
    this.HangulMode = "HangulMode";
    this.HanjaMode = "HanjaMode";
    this.JunjaMode = "JunjaMode";
    this.Eisu = "Eisu";
    this.Hankaku = "Hankaku";
    this.Hiranga = "Hiranga";
    this.HirangaKatakana = "HirangaKatakana";
    this.KanaMode = "KanaMode";
    this.Katakana = "Katakana";
    this.Romaji = "Romaji";
    this.Zenkaku = "Zenkaku";
    this.ZenkakuHanaku = "ZenkakuHanaku";
    this.F1 = "F1";
    this.F2 = "F2";
    this.F3 = "F3";
    this.F4 = "F4";
    this.F5 = "F5";
    this.F6 = "F6";
    this.F7 = "F7";
    this.F8 = "F8";
    this.F9 = "F9";
    this.F10 = "F10";
    this.F11 = "F11";
    this.F12 = "F12";
    this.F13 = "F13";
    this.F14 = "F14";
    this.F15 = "F15";
    this.F16 = "F16";
    this.F17 = "F17";
    this.F18 = "F18";
    this.F19 = "F19";
    this.F20 = "F20";
    this.Soft1 = "Soft1";
    this.Soft2 = "Soft2";
    this.Soft3 = "Soft3";
    this.Soft4 = "Soft4";
    this.Decimal = "Decimal";
    this.Key11 = "Key11";
    this.Key12 = "Key12";
    this.Multiply = "Multiply";
    this.Add = "Add";
    this.NumClear = "Clear";
    this.Divide = "Divide";
    this.Subtract = "Subtract";
    this.Separator = "Separator";
    this.AppSwitch = "AppSwitch";
    this.Call = "Call";
    this.Camera = "Camera";
    this.CameraFocus = "CameraFocus";
    this.EndCall = "EndCall";
    this.GoBack = "GoBack";
    this.GoHome = "GoHome";
    this.HeadsetHook = "HeadsetHook";
    this.LastNumberRedial = "LastNumberRedial";
    this.Notification = "Notification";
    this.MannerMode = "MannerMode";
    this.VoiceDial = "VoiceDial";
  });
  this.$rtti.$ExtClass("TJSKeyboardEvent",{ancestor: this.$rtti["TJSUIEvent"], jsclass: "KeyboardEvent"});
  this.$rtti.$ExtClass("TJSMutationObserver");
  rtl.recNewT(this,"TJSMutationRecord",function () {
    this.type_ = "";
    this.target = null;
    this.addedNodes = null;
    this.removedNodes = null;
    this.previousSibling = null;
    this.nextSibling = null;
    this.attributeName = "";
    this.attributeNamespace = "";
    this.oldValue = "";
    this.$eq = function (b) {
      return (this.type_ === b.type_) && (this.target === b.target) && (this.addedNodes === b.addedNodes) && (this.removedNodes === b.removedNodes) && (this.previousSibling === b.previousSibling) && (this.nextSibling === b.nextSibling) && (this.attributeName === b.attributeName) && (this.attributeNamespace === b.attributeNamespace) && (this.oldValue === b.oldValue);
    };
    this.$assign = function (s) {
      this.type_ = s.type_;
      this.target = s.target;
      this.addedNodes = s.addedNodes;
      this.removedNodes = s.removedNodes;
      this.previousSibling = s.previousSibling;
      this.nextSibling = s.nextSibling;
      this.attributeName = s.attributeName;
      this.attributeNamespace = s.attributeNamespace;
      this.oldValue = s.oldValue;
      return this;
    };
    var $r = $mod.$rtti.$Record("TJSMutationRecord",{});
    $r.addField("type_",rtl.string);
    $r.addField("target",$mod.$rtti["TJSNode"]);
    $r.addField("addedNodes",$mod.$rtti["TJSNodeList"]);
    $r.addField("removedNodes",$mod.$rtti["TJSNodeList"]);
    $r.addField("previousSibling",$mod.$rtti["TJSNode"]);
    $r.addField("nextSibling",$mod.$rtti["TJSNode"]);
    $r.addField("attributeName",rtl.string);
    $r.addField("attributeNamespace",rtl.string);
    $r.addField("oldValue",rtl.string);
  });
  this.$rtti.$DynArray("TJSMutationRecordArray",{eltype: this.$rtti["TJSMutationRecord"]});
  this.$rtti.$RefToProcVar("TJSMutationCallback",{procsig: rtl.newTIProcSig([["mutations",this.$rtti["TJSMutationRecordArray"]],["observer",this.$rtti["TJSMutationObserver"]]],null,8)});
  rtl.recNewT(this,"TJSMutationObserverInit",function () {
    this.attributes = false;
    this.attributeOldValue = false;
    this.characterData = false;
    this.characterDataOldValue = false;
    this.childList = false;
    this.subTree = false;
    this.attributeFilter = null;
    this.$eq = function (b) {
      return (this.attributes === b.attributes) && (this.attributeOldValue === b.attributeOldValue) && (this.characterData === b.characterData) && (this.characterDataOldValue === b.characterDataOldValue) && (this.childList === b.childList) && (this.subTree === b.subTree) && (this.attributeFilter === b.attributeFilter);
    };
    this.$assign = function (s) {
      this.attributes = s.attributes;
      this.attributeOldValue = s.attributeOldValue;
      this.characterData = s.characterData;
      this.characterDataOldValue = s.characterDataOldValue;
      this.childList = s.childList;
      this.subTree = s.subTree;
      this.attributeFilter = s.attributeFilter;
      return this;
    };
    var $r = $mod.$rtti.$Record("TJSMutationObserverInit",{});
    $r.addField("attributes",rtl.boolean);
    $r.addField("attributeOldValue",rtl.boolean);
    $r.addField("characterData",rtl.boolean);
    $r.addField("characterDataOldValue",rtl.boolean);
    $r.addField("childList",rtl.boolean);
    $r.addField("subTree",rtl.boolean);
    $r.addField("attributeFilter",pas.JS.$rtti["TJSArray"]);
  });
  this.$rtti.$ExtClass("TJSMutationObserver",{ancestor: pas.JS.$rtti["TJSObject"], jsclass: "MutationObserver"});
  this.$rtti.$DynArray("TJSMessagePortArray",{eltype: this.$rtti["TJSMessagePort"]});
  this.$rtti.$ExtClass("TJSMessageEvent",{ancestor: this.$rtti["TJSEvent"], jsclass: "MessageEvent"});
  this.$rtti.$ExtClass("TJSWebSocket",{ancestor: this.$rtti["TJSEventTarget"], jsclass: "WebSocket"});
  this.$rtti.$ExtClass("TJSHTMLAudioTrack",{ancestor: pas.JS.$rtti["TJSObject"], jsclass: "AudioTrack"});
  this.$rtti.$ExtClass("TJSHTMLAudioTrackList",{ancestor: pas.JS.$rtti["TJSObject"], jsclass: "AudioTrackList"});
  this.$rtti.$ExtClass("TJSHTMLVideoTrack",{ancestor: pas.JS.$rtti["TJSObject"], jsclass: "VideoTrack"});
  this.$rtti.$ExtClass("TJSHTMLVideoTrackList",{ancestor: pas.JS.$rtti["TJSObject"], jsclass: "VideoTrackList"});
  this.$rtti.$ExtClass("TJSHTMLTextTrack",{ancestor: pas.JS.$rtti["TJSObject"], jsclass: "TextTrack"});
  this.$rtti.$ExtClass("TJSHTMLTextTrackList",{ancestor: pas.JS.$rtti["TJSObject"], jsclass: "TextTrackList"});
  this.$rtti.$ExtClass("TJSMEdiaError",{ancestor: pas.JS.$rtti["TJSObject"], jsclass: "MediaError"});
  this.$rtti.$ExtClass("TJSHTMLMediaStream",{ancestor: pas.JS.$rtti["TJSObject"], jsclass: "MediaStream"});
  this.$rtti.$ExtClass("TJSHTMLMediaController",{ancestor: pas.JS.$rtti["TJSObject"], jsclass: "MediaController"});
  this.$rtti.$ExtClass("TJSHTMLMediaElement",{ancestor: this.$rtti["TJSHTMLElement"], jsclass: "HTMLMediaElement"});
  this.$rtti.$ExtClass("TJSHTMLAudioElement",{ancestor: this.$rtti["TJSHTMLMediaElement"], jsclass: "HTMLAudioElement"});
  this.$rtti.$ExtClass("TJSHTMLVideoElement",{ancestor: this.$rtti["TJSHTMLMediaElement"], jsclass: "HTMLVideoElement"});
  this.$rtti.$ExtClass("TJSHTMLStyleElement",{ancestor: this.$rtti["TJSHTMLElement"], jsclass: "HTMLStyleElement"});
  this.$rtti.$DynArray("TJSFormDataEntryValueArray",{eltype: rtl.string});
  this.$rtti.$ExtClass("TJSFormData",{ancestor: pas.JS.$rtti["TJSObject"], jsclass: "FormData"});
  this.$rtti.$ExtClass("TJSHTMLTemplateElement",{ancestor: this.$rtti["TJSHTMLElement"], jsclass: "HTMLTemplateElement"});
  this.$rtti.$ExtClass("TJSHTMLOrXMLDocument",{ancestor: this.$rtti["TJSDocument"], jsclass: "Document"});
  this.$rtti.$ExtClass("TJSHTMLDocument",{ancestor: this.$rtti["TJSHTMLOrXMLDocument"], jsclass: "HTMLDocument"});
  this.$rtti.$ExtClass("TJSXMLDocument",{ancestor: this.$rtti["TJSHTMLOrXMLDocument"], jsclass: "HTMLDocument"});
  this.$rtti.$ExtClass("TDOMParser",{ancestor: pas.JS.$rtti["TJSObject"], jsclass: "DOMParser"});
  this.$rtti.$RefToProcVar("TOnChangeProcedure",{procsig: rtl.newTIProcSig([])});
  this.$rtti.$ExtClass("TJSPermissionDescriptor",{ancestor: pas.JS.$rtti["TJSObject"], jsclass: "Object"});
  this.$rtti.$ExtClass("TJSPermissionStatus",{ancestor: pas.JS.$rtti["TJSObject"], jsclass: "PermissionStatus"});
  this.$rtti.$ExtClass("TJSPermissions",{ancestor: pas.JS.$rtti["TJSObject"], jsclass: "Permissions"});
  this.$rtti.$ExtClass("TJSFileSystemHandlePermissionDescriptor",{ancestor: pas.JS.$rtti["TJSObject"], jsclass: "Object"});
  this.$rtti.$ExtClass("TJSFileSystemCreateWritableOptions",{ancestor: pas.JS.$rtti["TJSObject"], jsclass: "Object"});
  this.$rtti.$ExtClass("TJSFileSystemWritableFileStream");
  this.$rtti.$ExtClass("TJSFileSystemHandle",{ancestor: pas.JS.$rtti["TJSObject"], jsclass: "FileSystemHandle"});
  this.$rtti.$ExtClass("TJSFileSystemFileHandle",{ancestor: this.$rtti["TJSFileSystemHandle"], jsclass: "FileSystemFileHandle"});
  this.$rtti.$ExtClass("TJSGetFileHandleOptions",{jsclass: "Object"});
  this.$rtti.$ExtClass("TJSRemoveEntryOptions",{ancestor: pas.JS.$rtti["TJSObject"], jsclass: "Object"});
  this.$rtti.$ExtClass("TJSFileSystemDirectoryHandle",{ancestor: this.$rtti["TJSFileSystemHandle"], jsclass: "FileSystemDirectoryHandle"});
  this.$rtti.$ExtClass("TJSFileSystemWritableFileStream",{ancestor: this.$rtti["TJSWritableStream"], jsclass: "FileSystemWritableFileStream"});
  this.$rtti.$ExtClass("TJSShowOpenFilePickerTypeOptions",{ancestor: pas.JS.$rtti["TJSObject"], jsclass: "Object"});
  this.$rtti.$ExtClass("TJSShowOpenFilePickerOptions",{ancestor: pas.JS.$rtti["TJSObject"], jsclass: "Object"});
  this.$rtti.$ExtClass("TJSShowSaveFilePickerOptionsAccept",{ancestor: pas.JS.$rtti["TJSObject"], jsclass: "Object"});
  this.$rtti.$ExtClass("TJSShowSaveFilePickerOptions",{ancestor: pas.JS.$rtti["TJSObject"], jsclass: "Object"});
});
rtl.module("CustApp",["System","Classes","SysUtils","Types","JS"],function () {
  "use strict";
  var $mod = this;
  this.SErrInvalidOption = 'Invalid option at position %s: "%s"';
  this.SErrNoOptionAllowed = "Option at position %s does not allow an argument: %s";
  this.SErrOptionNeeded = "Option at position %s needs an argument : %s";
  this.$rtti.$MethodVar("TExceptionEvent",{procsig: rtl.newTIProcSig([["Sender",pas.System.$rtti["TObject"]],["E",pas.SysUtils.$rtti["Exception"]]]), methodkind: 0});
  this.$rtti.$Set("TEventLogTypes",{comptype: pas.SysUtils.$rtti["TEventType"]});
  rtl.createClass(this,"TCustomApplication",pas.Classes.TComponent,function () {
    this.$init = function () {
      pas.Classes.TComponent.$init.call(this);
      this.FEventLogFilter = {};
      this.FExceptObjectJS = undefined;
      this.FOnException = null;
      this.FTerminated = false;
      this.FTitle = "";
      this.FOptionChar = "";
      this.FCaseSensitiveOptions = false;
      this.FStopOnException = false;
      this.FExceptionExitCode = 0;
      this.FExceptObject = null;
    };
    this.$final = function () {
      this.FEventLogFilter = undefined;
      this.FOnException = undefined;
      this.FExceptObject = undefined;
      pas.Classes.TComponent.$final.call(this);
    };
    this.GetEnvironmentVar = function (VarName) {
      var Result = "";
      Result = pas.SysUtils.GetEnvironmentVariable(VarName);
      return Result;
    };
    this.GetExeName = function () {
      var Result = "";
      Result = pas.System.ParamStr(0);
      return Result;
    };
    this.GetOptionAtIndex = function (AIndex, IsLong) {
      var Result = "";
      var P = 0;
      var O = "";
      Result = "";
      if (AIndex === -1) return Result;
      if (IsLong) {
        O = this.GetParams(AIndex);
        P = pas.System.Pos("=",O);
        if (P === 0) P = O.length;
        pas.System.Delete({get: function () {
            return O;
          }, set: function (v) {
            O = v;
          }},1,P);
        Result = O;
      } else {
        if (AIndex < this.GetParamCount()) if (pas.System.Copy(this.GetParams(AIndex + 1),1,1) !== "-") Result = this.GetParams(AIndex + 1);
      };
      return Result;
    };
    this.SetTitle = function (AValue) {
      this.FTitle = AValue;
    };
    this.GetParams = function (Index) {
      var Result = "";
      Result = pas.System.ParamStr(Index);
      return Result;
    };
    this.GetParamCount = function () {
      var Result = 0;
      Result = pas.System.ParamCount();
      return Result;
    };
    this.DoLog = function (EventType, Msg) {
      if (EventType === 0) ;
      if (Msg === "") ;
    };
    this.Create$1 = function (AOwner) {
      pas.Classes.TComponent.Create$1.call(this,AOwner);
      this.FOptionChar = "-";
      this.FCaseSensitiveOptions = true;
      this.FStopOnException = false;
      return this;
    };
    this.HandleException = function (Sender) {
      this.ShowException(this.FExceptObject);
      if (this.FStopOnException) this.Terminate$1(this.FExceptionExitCode);
      if (Sender === null) ;
    };
    this.Initialize = function () {
      this.FTerminated = false;
    };
    this.Run = function () {
      do {
        this.FExceptObject = null;
        this.FExceptObjectJS = null;
        try {
          this.DoRun();
        } catch ($e) {
          if (pas.SysUtils.Exception.isPrototypeOf($e)) {
            var E = $e;
            this.FExceptObject = E;
            this.FExceptObjectJS = E;
            this.HandleException(this);
          } else {
            this.FExceptObject = null;
            this.FExceptObjectJS = $e;
          }
        };
        break;
      } while (!this.FTerminated);
    };
    this.Terminate = function () {
      this.Terminate$1(rtl.exitcode);
    };
    this.Terminate$1 = function (AExitCode) {
      this.FTerminated = true;
      rtl.exitcode = AExitCode;
    };
    this.FindOptionIndex = function (S, Longopt, StartAt) {
      var Result = 0;
      var SO = "";
      var O = "";
      var I = 0;
      var P = 0;
      if (!this.FCaseSensitiveOptions) {
        SO = pas.SysUtils.UpperCase(S)}
       else SO = S;
      Result = -1;
      I = StartAt;
      if (I === -1) I = this.GetParamCount();
      while ((Result === -1) && (I > 0)) {
        O = this.GetParams(I);
        if ((O.length > 1) && (O.charAt(0) === this.FOptionChar)) {
          pas.System.Delete({get: function () {
              return O;
            }, set: function (v) {
              O = v;
            }},1,1);
          Longopt.set((O.length > 0) && (O.charAt(0) === this.FOptionChar));
          if (Longopt.get()) {
            pas.System.Delete({get: function () {
                return O;
              }, set: function (v) {
                O = v;
              }},1,1);
            P = pas.System.Pos("=",O);
            if (P !== 0) O = pas.System.Copy(O,1,P - 1);
          };
          if (!this.FCaseSensitiveOptions) O = pas.SysUtils.UpperCase(O);
          if (O === SO) Result = I;
        };
        I -= 1;
      };
      return Result;
    };
    this.GetOptionValue = function (S) {
      var Result = "";
      Result = this.GetOptionValue$1(" ",S);
      return Result;
    };
    this.GetOptionValue$1 = function (C, S) {
      var Result = "";
      var B = false;
      var I = 0;
      Result = "";
      I = this.FindOptionIndex(C,{get: function () {
          return B;
        }, set: function (v) {
          B = v;
        }},-1);
      if (I === -1) I = this.FindOptionIndex(S,{get: function () {
          return B;
        }, set: function (v) {
          B = v;
        }},-1);
      if (I !== -1) Result = this.GetOptionAtIndex(I,B);
      return Result;
    };
    this.GetOptionValues = function (C, S) {
      var Result = [];
      var I = 0;
      var Cnt = 0;
      var B = false;
      Result = rtl.arraySetLength(Result,"",this.GetParamCount());
      Cnt = 0;
      do {
        I = this.FindOptionIndex(C,{get: function () {
            return B;
          }, set: function (v) {
            B = v;
          }},I);
        if (I !== -1) {
          Cnt += 1;
          I -= 1;
        };
      } while (!(I === -1));
      do {
        I = this.FindOptionIndex(S,{get: function () {
            return B;
          }, set: function (v) {
            B = v;
          }},I);
        if (I !== -1) {
          Cnt += 1;
          I -= 1;
        };
      } while (!(I === -1));
      Result = rtl.arraySetLength(Result,"",Cnt);
      Cnt = 0;
      I = -1;
      do {
        I = this.FindOptionIndex(C,{get: function () {
            return B;
          }, set: function (v) {
            B = v;
          }},I);
        if (I !== -1) {
          Result[Cnt] = this.GetOptionAtIndex(I,false);
          Cnt += 1;
          I -= 1;
        };
      } while (!(I === -1));
      I = -1;
      do {
        I = this.FindOptionIndex(S,{get: function () {
            return B;
          }, set: function (v) {
            B = v;
          }},I);
        if (I !== -1) {
          Result[Cnt] = this.GetOptionAtIndex(I,true);
          Cnt += 1;
          I -= 1;
        };
      } while (!(I === -1));
      return Result;
    };
    this.HasOption = function (S) {
      var Result = false;
      var B = false;
      Result = this.FindOptionIndex(S,{get: function () {
          return B;
        }, set: function (v) {
          B = v;
        }},-1) !== -1;
      return Result;
    };
    this.HasOption$1 = function (C, S) {
      var Result = false;
      var B = false;
      Result = (this.FindOptionIndex(C,{get: function () {
          return B;
        }, set: function (v) {
          B = v;
        }},-1) !== -1) || (this.FindOptionIndex(S,{get: function () {
          return B;
        }, set: function (v) {
          B = v;
        }},-1) !== -1);
      return Result;
    };
    this.CheckOptions = function (ShortOptions, Longopts, Opts, NonOpts, AllErrors) {
      var $Self = this;
      var Result = "";
      var I = 0;
      var J = 0;
      var L = 0;
      var P = 0;
      var O = "";
      var OV = "";
      var SO = "";
      var UsedArg = false;
      var HaveArg = false;
      function FindLongOpt(S) {
        var Result = false;
        var I = 0;
        Result = Longopts != null;
        if (!Result) return Result;
        if ($Self.FCaseSensitiveOptions) {
          I = Longopts.GetCount() - 1;
          while ((I >= 0) && (Longopts.Get(I) !== S)) I -= 1;
        } else {
          S = pas.SysUtils.UpperCase(S);
          I = Longopts.GetCount() - 1;
          while ((I >= 0) && (pas.SysUtils.UpperCase(Longopts.Get(I)) !== S)) I -= 1;
        };
        Result = I !== -1;
        return Result;
      };
      function AddToResult(Msg) {
        if (Result !== "") Result = Result + pas.System.sLineBreak;
        Result = Result + Msg;
      };
      if (this.FCaseSensitiveOptions) {
        SO = ShortOptions}
       else SO = pas.SysUtils.LowerCase(ShortOptions);
      Result = "";
      I = 1;
      while ((I <= this.GetParamCount()) && ((Result === "") || AllErrors)) {
        O = pas.System.ParamStr(I);
        if ((O.length === 0) || (O.charAt(0) !== this.FOptionChar)) {
          if (NonOpts != null) NonOpts.Add(O);
        } else {
          if (O.length < 2) {
            AddToResult(pas.SysUtils.Format($mod.SErrInvalidOption,pas.System.VarRecs(18,pas.SysUtils.IntToStr(I),18,O)))}
           else {
            HaveArg = false;
            OV = "";
            if (O.charAt(1) === this.FOptionChar) {
              pas.System.Delete({get: function () {
                  return O;
                }, set: function (v) {
                  O = v;
                }},1,2);
              J = pas.System.Pos("=",O);
              if (J !== 0) {
                HaveArg = true;
                OV = O;
                pas.System.Delete({get: function () {
                    return OV;
                  }, set: function (v) {
                    OV = v;
                  }},1,J);
                O = pas.System.Copy(O,1,J - 1);
              };
              if (FindLongOpt(O)) {
                if (HaveArg) AddToResult(pas.SysUtils.Format($mod.SErrNoOptionAllowed,pas.System.VarRecs(18,pas.SysUtils.IntToStr(I),18,O)));
              } else {
                if (FindLongOpt(O + ":")) {
                  if (!HaveArg) AddToResult(pas.SysUtils.Format($mod.SErrOptionNeeded,pas.System.VarRecs(18,pas.SysUtils.IntToStr(I),18,O)));
                } else {
                  if (!FindLongOpt(O + "::")) AddToResult(pas.SysUtils.Format($mod.SErrInvalidOption,pas.System.VarRecs(18,pas.SysUtils.IntToStr(I),18,O)));
                };
              };
            } else {
              HaveArg = (I < this.GetParamCount()) && (pas.System.ParamStr(I + 1).length > 0) && (pas.System.ParamStr(I + 1).charAt(0) !== this.FOptionChar);
              UsedArg = false;
              if (!this.FCaseSensitiveOptions) O = pas.SysUtils.LowerCase(O);
              L = O.length;
              J = 2;
              while (((Result === "") || AllErrors) && (J <= L)) {
                P = pas.System.Pos(O.charAt(J - 1),SO);
                if ((P === 0) || (O.charAt(J - 1) === ":")) {
                  AddToResult(pas.SysUtils.Format($mod.SErrInvalidOption,pas.System.VarRecs(18,pas.SysUtils.IntToStr(I),9,O.charAt(J - 1))))}
                 else {
                  if ((P < SO.length) && (SO.charAt((P + 1) - 1) === ":")) {
                    if (((P + 1) === SO.length) || (SO.charAt((P + 2) - 1) !== ":")) if ((J < L) || !HaveArg) {
                      AddToResult(pas.SysUtils.Format($mod.SErrOptionNeeded,pas.System.VarRecs(18,pas.SysUtils.IntToStr(I),9,O.charAt(J - 1))));
                    };
                    O = O.charAt(J - 1);
                    UsedArg = true;
                  };
                };
                J += 1;
              };
              HaveArg = HaveArg && UsedArg;
              if (HaveArg) {
                I += 1;
                OV = pas.System.ParamStr(I);
              };
            };
            if (HaveArg && ((Result === "") || AllErrors)) if (Opts != null) Opts.Add(O + "=" + OV);
          };
        };
        I += 1;
      };
      return Result;
    };
    this.CheckOptions$1 = function (ShortOptions, Longopts, Opts, NonOpts, AllErrors) {
      var Result = "";
      var L = null;
      var I = 0;
      L = pas.Classes.TStringList.$create("Create$1");
      try {
        for (var $l = 0, $end = rtl.length(Longopts) - 1; $l <= $end; $l++) {
          I = $l;
          L.Add(Longopts[I]);
        };
        Result = this.CheckOptions(ShortOptions,L,Opts,NonOpts,AllErrors);
      } finally {
        L.$destroy("Destroy");
      };
      return Result;
    };
    this.CheckOptions$2 = function (ShortOptions, Longopts, AllErrors) {
      var Result = "";
      Result = this.CheckOptions(ShortOptions,Longopts,null,null,AllErrors);
      return Result;
    };
    this.CheckOptions$3 = function (ShortOptions, LongOpts, AllErrors) {
      var Result = "";
      var L = null;
      var I = 0;
      L = pas.Classes.TStringList.$create("Create$1");
      try {
        for (var $l = 0, $end = rtl.length(LongOpts) - 1; $l <= $end; $l++) {
          I = $l;
          L.Add(LongOpts[I]);
        };
        Result = this.CheckOptions$2(ShortOptions,L,AllErrors);
      } finally {
        L.$destroy("Destroy");
      };
      return Result;
    };
    var SepChars = " \n\r\t";
    this.CheckOptions$4 = function (ShortOptions, LongOpts, AllErrors) {
      var Result = "";
      var L = null;
      var Len = 0;
      var I = 0;
      var J = 0;
      L = pas.Classes.TStringList.$create("Create$1");
      try {
        I = 1;
        Len = LongOpts.length;
        while (I <= Len) {
          while (pas.SysUtils.IsDelimiter(SepChars,LongOpts,I)) I += 1;
          J = I;
          while ((J <= Len) && !pas.SysUtils.IsDelimiter(SepChars,LongOpts,J)) J += 1;
          if (I <= J) L.Add(pas.System.Copy(LongOpts,I,J - I));
          I = J + 1;
        };
        Result = this.CheckOptions$2(ShortOptions,L,AllErrors);
      } finally {
        L.$destroy("Destroy");
      };
      return Result;
    };
    this.GetNonOptions = function (ShortOptions, Longopts) {
      var Result = [];
      var NO = null;
      var I = 0;
      NO = pas.Classes.TStringList.$create("Create$1");
      try {
        this.GetNonOptions$1(ShortOptions,Longopts,NO);
        Result = rtl.arraySetLength(Result,"",NO.GetCount());
        for (var $l = 0, $end = NO.GetCount() - 1; $l <= $end; $l++) {
          I = $l;
          Result[I] = NO.Get(I);
        };
      } finally {
        NO.$destroy("Destroy");
      };
      return Result;
    };
    this.GetNonOptions$1 = function (ShortOptions, Longopts, NonOptions) {
      var S = "";
      S = this.CheckOptions$1(ShortOptions,Longopts,null,NonOptions,true);
      if (S !== "") throw pas.Classes.EListError.$create("Create$1",[S]);
    };
    this.GetEnvironmentList$1 = function (List) {
      this.GetEnvironmentList(List,false);
    };
    this.Log = function (EventType, Msg) {
      if (rtl.eqSet(this.FEventLogFilter,{}) || (EventType in this.FEventLogFilter)) this.DoLog(EventType,Msg);
    };
    this.Log$1 = function (EventType, Fmt, Args) {
      try {
        this.Log(EventType,pas.SysUtils.Format(Fmt,Args));
      } catch ($e) {
        if (pas.SysUtils.Exception.isPrototypeOf($e)) {
          var E = $e;
          this.Log(3,pas.SysUtils.Format('Error formatting message "%s" with %d arguments: %s',pas.System.VarRecs(18,Fmt,18,pas.SysUtils.IntToStr(rtl.length(Args)),18,E.fMessage)));
        } else throw $e
      };
    };
    rtl.addIntf(this,pas.System.IUnknown);
  });
  this.CustomApplication = null;
});
rtl.module("Rtl.BrowserLoadHelper",["System","Classes","SysUtils","JS","Web"],function () {
  "use strict";
  var $mod = this;
  rtl.createClass(this,"TBrowserLoadHelper",pas.Classes.TLoadHelper,function () {
    this.LoadText = function (aURL, aSync, OnLoaded, OnError) {
      var $Self = this;
      function doFetchOK(response) {
        var Result = undefined;
        Result = false;
        if (response.status !== 200) {
          if (OnError != null) OnError("Error " + pas.SysUtils.IntToStr(response.status) + ": " + response.statusText);
        } else response.text().then(function (value) {
          var Result = undefined;
          OnLoaded("" + value);
          return Result;
        });
        return Result;
      };
      function doFetchFail(response) {
        var Result = undefined;
        Result = false;
        OnError("Error 999: unknown error");
        return Result;
      };
      if (aSync) {
        window.fetch(aURL).then(doFetchOK).catch(doFetchFail)}
       else {
        var $with = new XMLHttpRequest();
        $with.open("GET",aURL,false);
        $with.addEventListener("load",function (oEvent) {
          OnLoaded($with.responseText);
        });
        $with.addEventListener("error",function (oEvent) {
          if (OnError != null) OnError(oEvent.message);
        });
        $with.send();
      };
    };
    this.LoadBytes = function (aURL, aSync, OnLoaded, OnError) {
      var $Self = this;
      function doFetchFail(response) {
        var Result = undefined;
        Result = false;
        if (rtl.isObject(response) && rtl.isExt(response,Error)) {
          OnError("Error 999: " + response.message)}
         else OnError("Error 999: unknown error");
        return Result;
      };
      function doFetchOK(response) {
        var Result = undefined;
        Result = false;
        if (response.status !== 200) {
          if (OnError != null) OnError("Error " + pas.SysUtils.IntToStr(response.status) + ": " + response.statusText);
        } else response.blob().then(function (value) {
          var Result = undefined;
          value.arrayBuffer().then(function (arr) {
            var Result = undefined;
            OnLoaded(arr);
            return Result;
          }).catch(doFetchFail);
          return Result;
        });
        return Result;
      };
      function StringToArrayBuffer(str) {
        var Result = null;
        var i = 0;
        var l = 0;
        l = str.length;
        Result = new ArrayBuffer(l * 2);
        var $with = new Uint16Array(Result);
        for (var $l = 1, $end = l; $l <= $end; $l++) {
          i = $l;
          $with[i - 1] = str.charCodeAt(i - 1);
        };
        return Result;
      };
      if (aSync) {
        window.fetch(aURL).then(doFetchOK).catch(doFetchFail)}
       else {
        var $with = new XMLHttpRequest();
        $with.open("GET",aURL,false);
        $with.addEventListener("load",function (oEvent) {
          if ($with.status !== 200) {
            OnError("Error " + pas.SysUtils.IntToStr($with.status) + ": " + $with.statusText)}
           else OnLoaded(StringToArrayBuffer($with.responseText));
        });
        $with.addEventListener("error",function (oEvent) {
          if (OnError != null) OnError(oEvent.message);
        });
        $with.send();
      };
    };
  });
  $mod.$init = function () {
    pas.Classes.SetLoadHelperClass($mod.TBrowserLoadHelper);
  };
});
rtl.module("browserapp",["System","Classes","SysUtils","Types","JS","Web","CustApp"],function () {
  "use strict";
  var $mod = this;
  var $impl = $mod.$impl;
  rtl.createClass(this,"TBrowserApplication",pas.CustApp.TCustomApplication,function () {
    this.GetHTMLElement = function (aID) {
      var Result = null;
      Result = document.getElementById(aID);
      if ((Result === null) && this.LogGetElementErrors()) pas.System.Writeln("Could not find element with ID ",aID);
      return Result;
    };
    this.CreateHTMLElement = function (aTag, aID) {
      var Result = null;
      Result = document.createElement(aTag);
      if (aID !== "") Result.id = aID;
      return Result;
    };
    this.DoRun = function () {
    };
    this.GetConsoleApplication = function () {
      var Result = false;
      Result = true;
      return Result;
    };
    this.LogGetElementErrors = function () {
      var Result = false;
      Result = true;
      return Result;
    };
    this.GetLocation = function () {
      var Result = "";
      Result = "";
      return Result;
    };
    this.GetEnvironmentList = function (List, NamesOnly) {
      var Names = [];
      var i = 0;
      Names = Object.getOwnPropertyNames($impl.EnvNames);
      for (var $l = 0, $end = rtl.length(Names) - 1; $l <= $end; $l++) {
        i = $l;
        if (NamesOnly) {
          List.Add(Names[i])}
         else List.Add(Names[i] + "=" + ("" + $impl.EnvNames[Names[i]]));
      };
    };
    this.ShowException = function (E) {
      var S = "";
      if (E !== null) {
        S = E.$classname + ": " + E.fMessage}
       else if (this.FExceptObjectJS) S = this.FExceptObjectJS.toString();
      window.alert("Unhandled exception caught:" + S);
    };
    this.HandleException = function (Sender) {
      if (pas.SysUtils.Exception.isPrototypeOf(this.FExceptObject)) this.ShowException(this.FExceptObject);
      pas.CustApp.TCustomApplication.HandleException.call(this,Sender);
    };
    rtl.addIntf(this,pas.System.IUnknown);
  });
  this.ReloadEnvironmentStrings = function () {
    var I = 0;
    var S = "";
    var N = "";
    var A = [];
    var P = [];
    if ($impl.EnvNames != null) pas.SysUtils.FreeAndNil({p: $impl, get: function () {
        return this.p.EnvNames;
      }, set: function (v) {
        this.p.EnvNames = v;
      }});
    $impl.EnvNames = new Object();
    S = window.location.search;
    S = pas.System.Copy(S,2,S.length - 1);
    A = S.split("&");
    for (var $l = 0, $end = rtl.length(A) - 1; $l <= $end; $l++) {
      I = $l;
      P = A[I].split("=");
      N = pas.SysUtils.LowerCase(decodeURIComponent(P[0]));
      if (rtl.length(P) === 2) {
        $impl.EnvNames[N] = decodeURIComponent(P[1])}
       else if (rtl.length(P) === 1) $impl.EnvNames[N] = "";
    };
  };
  $mod.$implcode = function () {
    $impl.EnvNames = null;
    $impl.Params = [];
    $impl.ReloadParamStrings = function () {
      $impl.Params = rtl.arraySetLength($impl.Params,"",1);
      $impl.Params[0] = window.location.pathname;
    };
    $impl.GetParamCount = function () {
      var Result = 0;
      Result = rtl.length($impl.Params) - 1;
      return Result;
    };
    $impl.GetParamStr = function (Index) {
      var Result = "";
      Result = $impl.Params[Index];
      return Result;
    };
    $impl.MyGetEnvironmentVariable = function (EnvVar) {
      var Result = "";
      var aName = "";
      aName = pas.SysUtils.LowerCase(EnvVar);
      if ($impl.EnvNames.hasOwnProperty(aName)) {
        Result = "" + $impl.EnvNames[aName]}
       else Result = "";
      return Result;
    };
    $impl.MyGetEnvironmentVariableCount = function () {
      var Result = 0;
      Result = rtl.length(Object.getOwnPropertyNames($impl.EnvNames));
      return Result;
    };
    $impl.MyGetEnvironmentString = function (Index) {
      var Result = "";
      Result = "" + $impl.EnvNames[Object.getOwnPropertyNames($impl.EnvNames)[Index]];
      return Result;
    };
  };
  $mod.$init = function () {
    pas.System.IsConsole = true;
    pas.System.OnParamCount = $impl.GetParamCount;
    pas.System.OnParamStr = $impl.GetParamStr;
    $mod.ReloadEnvironmentStrings();
    $impl.ReloadParamStrings();
    pas.SysUtils.OnGetEnvironmentVariable = $impl.MyGetEnvironmentVariable;
    pas.SysUtils.OnGetEnvironmentVariableCount = $impl.MyGetEnvironmentVariableCount;
    pas.SysUtils.OnGetEnvironmentString = $impl.MyGetEnvironmentString;
  };
},["Rtl.BrowserLoadHelper"]);
rtl.module("webassembly",["System","JS","Web"],function () {
  "use strict";
  var $mod = this;
  rtl.recNewT(this,"TJSWebAssemblyMemoryDescriptor",function () {
    this.initial = 0;
    this.maximum = 0;
    this.$eq = function (b) {
      return (this.initial === b.initial) && (this.maximum === b.maximum);
    };
    this.$assign = function (s) {
      this.initial = s.initial;
      this.maximum = s.maximum;
      return this;
    };
    var $r = $mod.$rtti.$Record("TJSWebAssemblyMemoryDescriptor",{});
    $r.addField("initial",rtl.longint);
    $r.addField("maximum",rtl.longint);
  });
  this.$rtti.$ExtClass("TJSWebAssemblyMemory",{ancestor: pas.JS.$rtti["TJSObject"], jsclass: "WebAssembly.Memory"});
  this.$rtti.$ExtClass("TJSModulesExports",{ancestor: pas.JS.$rtti["TJSObject"], jsclass: "Object"});
  this.$rtti.$ExtClass("TJSWebAssemblyModule",{ancestor: pas.JS.$rtti["TJSObject"], jsclass: "WebAssembly.Module"});
  this.$rtti.$ExtClass("TJSWebAssemblyInstance",{ancestor: pas.JS.$rtti["TJSObject"], jsclass: "WebAssembly.Instance"});
  this.$rtti.$ExtClass("TJSInstantiateResult",{ancestor: pas.JS.$rtti["TJSObject"], jsclass: "anon"});
  this.$rtti.$ExtClass("TJSWebAssembly",{ancestor: pas.JS.$rtti["TJSObject"], jsclass: "WebAssembly"});
  rtl.recNewT(this,"TJSWebAssemblyTableDescriptor",function () {
    this.element = "";
    this.initial = 0;
    this.maximum = 0;
    this.$eq = function (b) {
      return (this.element === b.element) && (this.initial === b.initial) && (this.maximum === b.maximum);
    };
    this.$assign = function (s) {
      this.element = s.element;
      this.initial = s.initial;
      this.maximum = s.maximum;
      return this;
    };
    var $r = $mod.$rtti.$Record("TJSWebAssemblyTableDescriptor",{});
    $r.addField("element",rtl.string);
    $r.addField("initial",rtl.longint);
    $r.addField("maximum",rtl.longint);
  });
  this.$rtti.$ExtClass("TJSWebAssemblyTable",{ancestor: pas.JS.$rtti["TJSObject"], jsclass: "WebAssembly.Table"});
});
rtl.module("wasienv",["System","SysUtils","Classes","JS","webassembly","Types"],function () {
  "use strict";
  var $mod = this;
  var $impl = $mod.$impl;
  this.WASI_ESUCCESS = 0;
  this.WASI_E2BIG = 1;
  this.WASI_EACCES = 2;
  this.WASI_EADDRINUSE = 3;
  this.WASI_EADDRNOTAVAIL = 4;
  this.WASI_EAFNOSUPPORT = 5;
  this.WASI_EAGAIN = 6;
  this.WASI_EALREADY = 7;
  this.WASI_EBADF = 8;
  this.WASI_EBADMSG = 9;
  this.WASI_EBUSY = 10;
  this.WASI_ECANCELED = 11;
  this.WASI_ECHILD = 12;
  this.WASI_ECONNABORTED = 13;
  this.WASI_ECONNREFUSED = 14;
  this.WASI_ECONNRESET = 15;
  this.WASI_EDEADLK = 16;
  this.WASI_EDESTADDRREQ = 17;
  this.WASI_EDOM = 18;
  this.WASI_EDQUOT = 19;
  this.WASI_EEXIST = 20;
  this.WASI_EFAULT = 21;
  this.WASI_EFBIG = 22;
  this.WASI_EHOSTUNREACH = 23;
  this.WASI_EIDRM = 24;
  this.WASI_EILSEQ = 25;
  this.WASI_EINPROGRESS = 26;
  this.WASI_EINTR = 27;
  this.WASI_EINVAL = 28;
  this.WASI_EIO = 29;
  this.WASI_EISCONN = 30;
  this.WASI_EISDIR = 31;
  this.WASI_ELOOP = 32;
  this.WASI_EMFILE = 33;
  this.WASI_EMLINK = 34;
  this.WASI_EMSGSIZE = 35;
  this.WASI_EMULTIHOP = 36;
  this.WASI_ENAMETOOLONG = 37;
  this.WASI_ENETDOWN = 38;
  this.WASI_ENETRESET = 39;
  this.WASI_ENETUNREACH = 40;
  this.WASI_ENFILE = 41;
  this.WASI_ENOBUFS = 42;
  this.WASI_ENODEV = 43;
  this.WASI_ENOENT = 44;
  this.WASI_ENOEXEC = 45;
  this.WASI_ENOLCK = 46;
  this.WASI_ENOLINK = 47;
  this.WASI_ENOMEM = 48;
  this.WASI_ENOMSG = 49;
  this.WASI_ENOPROTOOPT = 50;
  this.WASI_ENOSPC = 51;
  this.WASI_ENOSYS = 52;
  this.WASI_ENOTCONN = 53;
  this.WASI_ENOTDIR = 54;
  this.WASI_ENOTEMPTY = 55;
  this.WASI_ENOTRECOVERABLE = 56;
  this.WASI_ENOTSOCK = 57;
  this.WASI_ENOTSUP = 58;
  this.WASI_ENOTTY = 59;
  this.WASI_ENXIO = 60;
  this.WASI_EOVERFLOW = 61;
  this.WASI_EOWNERDEAD = 62;
  this.WASI_EPERM = 63;
  this.WASI_EPIPE = 64;
  this.WASI_EPROTO = 65;
  this.WASI_EPROTONOSUPPORT = 66;
  this.WASI_EPROTOTYPE = 67;
  this.WASI_ERANGE = 68;
  this.WASI_EROFS = 69;
  this.WASI_ESPIPE = 70;
  this.WASI_ESRCH = 71;
  this.WASI_ESTALE = 72;
  this.WASI_ETIMEDOUT = 73;
  this.WASI_ETXTBSY = 74;
  this.WASI_EXDEV = 75;
  this.WASI_ENOTCAPABLE = 76;
  this.WASI_SIGABRT = 0;
  this.WASI_SIGALRM = 1;
  this.WASI_SIGBUS = 2;
  this.WASI_SIGCHLD = 3;
  this.WASI_SIGCONT = 4;
  this.WASI_SIGFPE = 5;
  this.WASI_SIGHUP = 6;
  this.WASI_SIGILL = 7;
  this.WASI_SIGINT = 8;
  this.WASI_SIGKILL = 9;
  this.WASI_SIGPIPE = 10;
  this.WASI_SIGQUIT = 11;
  this.WASI_SIGSEGV = 12;
  this.WASI_SIGSTOP = 13;
  this.WASI_SIGTERM = 14;
  this.WASI_SIGTRAP = 15;
  this.WASI_SIGTSTP = 16;
  this.WASI_SIGTTIN = 17;
  this.WASI_SIGTTOU = 18;
  this.WASI_SIGURG = 19;
  this.WASI_SIGUSR1 = 20;
  this.WASI_SIGUSR2 = 21;
  this.WASI_SIGVTALRM = 22;
  this.WASI_SIGXCPU = 23;
  this.WASI_SIGXFSZ = 24;
  this.WASI_FILETYPE_UNKNOWN = 0;
  this.WASI_FILETYPE_BLOCK_DEVICE = 1;
  this.WASI_FILETYPE_CHARACTER_DEVICE = 2;
  this.WASI_FILETYPE_DIRECTORY = 3;
  this.WASI_FILETYPE_REGULAR_FILE = 4;
  this.WASI_FILETYPE_SOCKET_DGRAM = 5;
  this.WASI_FILETYPE_SOCKET_STREAM = 6;
  this.WASI_FILETYPE_SYMBOLIC_LINK = 7;
  this.WASI_FDFLAG_APPEND = 0x1;
  this.WASI_FDFLAG_DSYNC = 0x2;
  this.WASI_FDFLAG_NONBLOCK = 0x4;
  this.WASI_FDFLAG_RSYNC = 0x8;
  this.WASI_FDFLAG_SYNC = 0x10;
  this.WASI_RIGHT_FD_DATASYNC = 0x1;
  this.WASI_RIGHT_FD_READ = 0x2;
  this.WASI_RIGHT_FD_SEEK = 0x4;
  this.WASI_RIGHT_FD_FDSTAT_SET_FLAGS = 0x8;
  this.WASI_RIGHT_FD_SYNC = 0x10;
  this.WASI_RIGHT_FD_TELL = 0x20;
  this.WASI_RIGHT_FD_WRITE = 0x40;
  this.WASI_RIGHT_FD_ADVISE = 0x80;
  this.WASI_RIGHT_FD_ALLOCATE = 0x100;
  this.WASI_RIGHT_PATH_CREATE_DIRECTORY = 0x200;
  this.WASI_RIGHT_PATH_CREATE_FILE = 0x400;
  this.WASI_RIGHT_PATH_LINK_SOURCE = 0x800;
  this.WASI_RIGHT_PATH_LINK_TARGET = 0x1000;
  this.WASI_RIGHT_PATH_OPEN = 0x2000;
  this.WASI_RIGHT_FD_READDIR = 0x4000;
  this.WASI_RIGHT_PATH_READLINK = 0x8000;
  this.WASI_RIGHT_PATH_RENAME_SOURCE = 0x10000;
  this.WASI_RIGHT_PATH_RENAME_TARGET = 0x20000;
  this.WASI_RIGHT_PATH_FILESTAT_GET = 0x40000;
  this.WASI_RIGHT_PATH_FILESTAT_SET_SIZE = 0x80000;
  this.WASI_RIGHT_PATH_FILESTAT_SET_TIMES = 0x100000;
  this.WASI_RIGHT_FD_FILESTAT_GET = 0x200000;
  this.WASI_RIGHT_FD_FILESTAT_SET_SIZE = 0x400000;
  this.WASI_RIGHT_FD_FILESTAT_SET_TIMES = 0x800000;
  this.WASI_RIGHT_PATH_SYMLINK = 0x1000000;
  this.WASI_RIGHT_PATH_REMOVE_DIRECTORY = 0x2000000;
  this.WASI_RIGHT_PATH_UNLINK_FILE = 0x4000000;
  this.WASI_RIGHT_POLL_FD_READWRITE = 0x8000000;
  this.WASI_RIGHT_SOCK_SHUTDOWN = 0x10000000;
  this.RIGHTS_ALL = rtl.lw(rtl.lw(rtl.lw(rtl.lw(rtl.lw(rtl.lw(rtl.lw(rtl.lw(rtl.lw(rtl.lw(rtl.lw(rtl.lw(rtl.lw(1 | 2 | 4 | 8 | 16 | 32 | 64 | 128 | 256 | 512 | 1024 | 2048 | 4096 | 8192 | 16384 | 32768 | 65536) | 131072) | 262144) | 524288) | 1048576) | 2097152) | 8388608) | 4194304) | 16777216) | 67108864) | 33554432) | 134217728) | 268435456);
  this.RIGHTS_BLOCK_DEVICE_BASE = 536870911;
  this.RIGHTS_BLOCK_DEVICE_INHERITING = 536870911;
  this.RIGHTS_CHARACTER_DEVICE_BASE = 536870911;
  this.RIGHTS_CHARACTER_DEVICE_INHERITING = 536870911;
  this.RIGHTS_REGULAR_FILE_BASE = rtl.lw(rtl.lw(rtl.lw(rtl.lw(1 | 2 | 4 | 8 | 16 | 32 | 64 | 128 | 256 | 2097152) | 4194304) | 8388608) | 134217728);
  this.RIGHTS_REGULAR_FILE_INHERITING = 0;
  this.RIGHTS_DIRECTORY_BASE = rtl.lw(rtl.lw(rtl.lw(rtl.lw(rtl.lw(rtl.lw(rtl.lw(rtl.lw(rtl.lw(rtl.lw(rtl.lw(8 | 16 | 128 | 512 | 1024 | 2048 | 4096 | 8192 | 16384 | 32768 | 65536) | 131072) | 262144) | 524288) | 1048576) | 2097152) | 8388608) | 16777216) | 67108864) | 33554432) | 134217728);
  this.RIGHTS_DIRECTORY_INHERITING = 264240792 | 148898303;
  this.RIGHTS_SOCKET_BASE = rtl.lw(rtl.lw(rtl.lw(2 | 8 | 64 | 2097152) | 134217728) | 268435456);
  this.RIGHTS_SOCKET_INHERITING = 536870911;
  this.RIGHTS_TTY_BASE = rtl.lw(rtl.lw(2 | 8 | 64 | 2097152) | 134217728);
  this.RIGHTS_TTY_INHERITING = 0;
  this.WASI_CLOCK_MONOTONIC = 0;
  this.WASI_CLOCK_PROCESS_CPUTIME_ID = 1;
  this.WASI_CLOCK_REALTIME = 2;
  this.WASI_CLOCK_THREAD_CPUTIME_ID = 3;
  this.WASI_EVENTTYPE_CLOCK = 0;
  this.WASI_EVENTTYPE_FD_READ = 1;
  this.WASI_EVENTTYPE_FD_WRITE = 2;
  this.WASI_FILESTAT_SET_ATIM = 1 << 0;
  this.WASI_FILESTAT_SET_ATIM_NOW = 1 << 1;
  this.WASI_FILESTAT_SET_MTIM = 1 << 2;
  this.WASI_FILESTAT_SET_MTIM_NOW = 1 << 3;
  this.WASI_O_CREAT = 1 << 0;
  this.WASI_O_DIRECTORY = 1 << 1;
  this.WASI_O_EXCL = 1 << 2;
  this.WASI_O_TRUNC = 1 << 3;
  this.WASI_PREOPENTYPE_DIR = 0;
  this.WASI_DIRCOOKIE_START = 0;
  this.WASI_STDIN_FILENO = 0;
  this.WASI_STDOUT_FILENO = 1;
  this.WASI_STDERR_FILENO = 2;
  this.WASI_WHENCE_CUR = 0;
  this.WASI_WHENCE_END = 1;
  this.WASI_WHENCE_SET = 2;
  rtl.createInterface(this,"IWASI","{A03AC61B-3C68-4DA8-AC4F-53ED01814673}",["args_get","args_sizes_get","clock_res_get","clock_time_get","environ_get","environ_sizes_get","fd_advise","fd_allocate","fd_close","fd_datasync","fd_fdstat_get","fd_fdstat_set_flags","fd_fdstat_set_rights","fd_filestat_get","fd_filestat_set_size","fd_filestat_set_times","fd_pread","fd_prestat_dir_name","fd_prestat_get","fd_pwrite","fd_read","fd_readdir","fd_renumber","fd_seek","fd_sync","fd_tell","fd_write","path_create_directory","path_filestat_get","path_filestat_set_times","path_link","path_open","path_readlink","path_remove_directory","path_rename","path_symlink","path_unlink_file","poll_oneoff","proc_exit","proc_raise","random_get","sched_yield","sock_recv","sock_send","sock_shutdown"],null,function () {
    var $r = this.$rtti;
    $r.addMethod("args_get",1,[["argc",rtl.nativeint],["argvBufSize",rtl.nativeint]],rtl.nativeint);
    $r.addMethod("args_sizes_get",1,[["argc",rtl.nativeint],["argvBufSize",rtl.nativeint]],rtl.nativeint);
    $r.addMethod("clock_res_get",1,[["clockId",rtl.nativeint],["resolution",rtl.nativeint]],rtl.nativeint);
    $r.addMethod("clock_time_get",1,[["clockId",rtl.nativeint],["precision",rtl.nativeint],["time",rtl.nativeint]],rtl.nativeint);
    $r.addMethod("environ_get",1,[["environ",rtl.nativeint],["environBuf",rtl.nativeint]],rtl.nativeint);
    $r.addMethod("environ_sizes_get",1,[["environCount",rtl.nativeint],["environBufSize",rtl.nativeint]],rtl.nativeint);
    $r.addMethod("fd_advise",1,[["fd",rtl.nativeint],["offset",rtl.nativeint],["len",rtl.nativeint],["advice",rtl.nativeint]],rtl.nativeint);
    $r.addMethod("fd_allocate",1,[["fd",rtl.nativeint],["offset",rtl.nativeint],["len",rtl.nativeint]],rtl.nativeint);
    $r.addMethod("fd_close",1,[["fd",rtl.nativeint]],rtl.nativeint);
    $r.addMethod("fd_datasync",1,[["fd",rtl.nativeint]],rtl.nativeint);
    $r.addMethod("fd_fdstat_get",1,[["fd",rtl.nativeint],["bufPtr",rtl.nativeint]],rtl.nativeint);
    $r.addMethod("fd_fdstat_set_flags",1,[["fd",rtl.nativeint],["flags",rtl.nativeint]],rtl.nativeint);
    $r.addMethod("fd_fdstat_set_rights",1,[["fd",rtl.nativeint],["fsRightsBase",rtl.nativeint],["fsRightsInheriting",rtl.nativeint]],rtl.nativeint);
    $r.addMethod("fd_filestat_get",1,[["fd",rtl.nativeint],["bufPtr",rtl.nativeint]],rtl.nativeint);
    $r.addMethod("fd_filestat_set_size",1,[["fd",rtl.nativeint],["stSize",rtl.nativeint]],rtl.nativeint);
    $r.addMethod("fd_filestat_set_times",1,[["fd",rtl.nativeint],["stAtim",rtl.nativeint],["stMtim",rtl.nativeint],["fstflags",rtl.nativeint]],rtl.nativeint);
    $r.addMethod("fd_pread",1,[["fd",rtl.nativeint],["iovs",rtl.nativeint],["iovsLen",rtl.nativeint],["offset",rtl.nativeint],["nread",rtl.nativeint]],rtl.nativeint);
    $r.addMethod("fd_prestat_dir_name",1,[["fd",rtl.nativeint],["pathPtr",rtl.nativeint],["pathLen",rtl.nativeint]],rtl.nativeint);
    $r.addMethod("fd_prestat_get",1,[["fd",rtl.nativeint],["bufPtr",rtl.nativeint]],rtl.nativeint);
    $r.addMethod("fd_pwrite",1,[["fd",rtl.nativeint],["iovs",rtl.nativeint],["iovsLen",rtl.nativeint],["offset",rtl.nativeint],["nwritten",rtl.nativeint]],rtl.nativeint);
    $r.addMethod("fd_read",1,[["fd",rtl.nativeint],["iovs",rtl.nativeint],["iovsLen",rtl.nativeint],["nread",rtl.nativeint]],rtl.nativeint);
    $r.addMethod("fd_readdir",1,[["fd",rtl.nativeint],["bufPtr",rtl.nativeint],["bufLen",rtl.nativeint],["cookie",rtl.nativeint],["bufusedPtr",rtl.nativeint]],rtl.nativeint);
    $r.addMethod("fd_renumber",1,[["afrom",rtl.nativeint],["ato",rtl.nativeint]],rtl.nativeint);
    $r.addMethod("fd_seek",1,[["fd",rtl.nativeint],["offset",rtl.nativeint],["whence",rtl.nativeint],["newOffsetPtr",rtl.nativeint]],rtl.nativeint);
    $r.addMethod("fd_sync",1,[["fd",rtl.nativeint]],rtl.nativeint);
    $r.addMethod("fd_tell",1,[["fd",rtl.nativeint],["offsetPtr",rtl.nativeint]],rtl.nativeint);
    $r.addMethod("fd_write",1,[["fd",rtl.nativeint],["iovs",rtl.nativeint],["iovsLen",rtl.nativeint],["nwritten",rtl.nativeint]],rtl.nativeint);
    $r.addMethod("path_create_directory",1,[["fd",rtl.nativeint],["pathPtr",rtl.nativeint],["pathLen",rtl.nativeint]],rtl.nativeint);
    $r.addMethod("path_filestat_get",1,[["fd",rtl.nativeint],["flags",rtl.nativeint],["pathPtr",rtl.nativeint],["pathLen",rtl.nativeint],["bufPtr",rtl.nativeint]],rtl.nativeint);
    $r.addMethod("path_filestat_set_times",1,[["fd",rtl.nativeint],["fstflags",rtl.nativeint],["pathPtr",rtl.nativeint],["pathLen",rtl.nativeint],["stAtim",rtl.nativeint],["stMtim",rtl.nativeint]],rtl.nativeint);
    $r.addMethod("path_link",1,[["oldFd",rtl.nativeint],["oldFlags",rtl.nativeint],["oldPath",rtl.nativeint],["oldPathLen",rtl.nativeint],["newFd",rtl.nativeint],["newPath",rtl.nativeint],["newPathLen",rtl.nativeint]],rtl.nativeint);
    $r.addMethod("path_open",1,[["dirfd",rtl.nativeint],["dirflags",rtl.nativeint],["pathPtr",rtl.nativeint],["pathLen",rtl.nativeint],["oflags",rtl.nativeint],["fsRightsBase",rtl.nativeint],["fsRightsInheriting",rtl.nativeint],["fsFlags",rtl.nativeint],["fd",rtl.nativeint]],rtl.nativeint);
    $r.addMethod("path_readlink",1,[["fd",rtl.nativeint],["pathPtr",rtl.nativeint],["pathLen",rtl.nativeint],["buf",rtl.nativeint],["bufLen",rtl.nativeint],["bufused",rtl.nativeint]],rtl.nativeint);
    $r.addMethod("path_remove_directory",1,[["fd",rtl.nativeint],["pathPtr",rtl.nativeint],["pathLen",rtl.nativeint]],rtl.nativeint);
    $r.addMethod("path_rename",1,[["oldFd",rtl.nativeint],["oldPath",rtl.nativeint],["oldPathLen",rtl.nativeint],["newFd",rtl.nativeint],["newPath",rtl.nativeint],["newPathLen",rtl.nativeint]],rtl.nativeint);
    $r.addMethod("path_symlink",1,[["oldPath",rtl.nativeint],["oldPathLen",rtl.nativeint],["fd",rtl.nativeint],["newPath",rtl.nativeint],["newPathLen",rtl.nativeint]],rtl.nativeint);
    $r.addMethod("path_unlink_file",1,[["fd",rtl.nativeint],["pathPtr",rtl.nativeint],["pathLen",rtl.nativeint]],rtl.nativeint);
    $r.addMethod("poll_oneoff",1,[["sin",rtl.nativeint],["sout",rtl.nativeint],["nsubscriptions",rtl.nativeint],["nevents",rtl.nativeint]],rtl.nativeint);
    $r.addMethod("proc_exit",1,[["rval",rtl.nativeint]],rtl.nativeint);
    $r.addMethod("proc_raise",1,[["sig",rtl.nativeint]],rtl.nativeint);
    $r.addMethod("random_get",1,[["bufPtr",rtl.nativeint],["bufLen",rtl.nativeint]],rtl.nativeint);
    $r.addMethod("sched_yield",1,[],rtl.nativeint);
    $r.addMethod("sock_recv",1,[],rtl.nativeint);
    $r.addMethod("sock_send",1,[],rtl.nativeint);
    $r.addMethod("sock_shutdown",1,[],rtl.nativeint);
  });
  this.$rtti.$RefToProcVar("TWASIWriteEvent",{procsig: rtl.newTIProcSig([["Sender",pas.System.$rtti["TObject"]],["aOutput",rtl.string,2]])});
  this.$rtti.$ExtClass("TWASIExports",{ancestor: pas.webassembly.$rtti["TJSModulesExports"], jsclass: "Object"});
  this.$rtti.$RefToProcVar("TGetConsoleInputBufferEvent",{procsig: rtl.newTIProcSig([["Sender",pas.System.$rtti["TObject"]],["AInput",pas.JS.$rtti["TJSUint8Array"],1]])});
  this.$rtti.$RefToProcVar("TGetConsoleInputStringEvent",{procsig: rtl.newTIProcSig([["Sender",pas.System.$rtti["TObject"]],["AInput",rtl.string,1]])});
  this.$rtti.$Class("TImportExtension");
  rtl.createClass(this,"TPas2JSWASIEnvironment",pas.System.TObject,function () {
    this.UTF8TextDecoder = null;
    this.$init = function () {
      pas.System.TObject.$init.call(this);
      this.FExitCode = 0;
      this.FImportObject = null;
      this.Finstance = null;
      this.FIsLittleEndian = false;
      this.FModuleInstanceExports = null;
      this.FOnGetConsoleInputBuffer = null;
      this.FOnGetConsoleInputString = null;
      this.FOnStdErrorWrite = null;
      this.FOnStdOutputWrite = null;
      this.FImportExtensions = null;
      this.FWASIImportName = "";
    };
    this.$final = function () {
      this.FImportObject = undefined;
      this.Finstance = undefined;
      this.FModuleInstanceExports = undefined;
      this.FOnGetConsoleInputBuffer = undefined;
      this.FOnGetConsoleInputString = undefined;
      this.FOnStdErrorWrite = undefined;
      this.FOnStdOutputWrite = undefined;
      this.FImportExtensions = undefined;
      pas.System.TObject.$final.call(this);
    };
    this.GetConsoleInputBuffer = function () {
      var Result = null;
      var S = "";
      Result = null;
      if (this.FOnGetConsoleInputBuffer != null) {
        this.FOnGetConsoleInputBuffer(this,{get: function () {
            return Result;
          }, set: function (v) {
            Result = v;
          }})}
       else if (this.FOnGetConsoleInputString != null) {
        S = "";
        this.FOnGetConsoleInputString(this,{get: function () {
            return S;
          }, set: function (v) {
            S = v;
          }});
        Result = $impl.toUTF8Array(S);
      } else Result = new Uint8Array(0);
      return Result;
    };
    this.GetFileBuffer = function (FD) {
      var Result = null;
      Result = new Uint8Array(0);
      return Result;
    };
    this.GetImportObject = function () {
      var Result = null;
      if (!(this.FImportObject != null)) {
        this.FImportObject = new Object();
        this.GetImports(this.FImportObject);
      };
      Result = this.FImportObject;
      return Result;
    };
    this.getiovs = function (view, iovs, iovsLen) {
      var Result = null;
      var I = 0;
      var ArrayBuf = null;
      var Ptr = 0;
      var Buf = 0;
      var BufLen = 0;
      Result = new Array();
      for (var $l = 0, $end = iovsLen - 1; $l <= $end; $l++) {
        I = $l;
        Ptr = iovs + (I * 8);
        Buf = view.getUint32(Ptr,this.FIsLittleEndian);
        BufLen = view.getUint32(Ptr + 4,this.FIsLittleEndian);
        ArrayBuf = new Uint8Array(this.FModuleInstanceExports.memory.buffer,Buf,BufLen);
        Result.push(ArrayBuf);
      };
      return Result;
    };
    this.SetInstance = function (AValue) {
      if (this.Finstance === AValue) return;
      this.Finstance = AValue;
      this.FModuleInstanceExports = this.Finstance.exports;
    };
    this.setBigUint64 = function (View, byteOffset, value, littleEndian) {
      var LowWord = 0;
      var HighWord = 0;
      LowWord = value;
      HighWord = 0;
      if (littleEndian) {
        View.setUint32(byteOffset + 0,LowWord,littleEndian);
        View.setUint32(byteOffset + 4,HighWord,littleEndian);
      } else {
        View.setUint32(byteOffset + 4,LowWord,littleEndian);
        View.setUint32(byteOffset + 0,HighWord,littleEndian);
      };
    };
    this.DoConsoleWrite = function (IsStdErr, aBytes) {
      var S = "";
      // Result=String.fromCharCode.apply(null, new Uint16Array(a));
      S=String.fromCharCode.apply(null, aBytes);
      if (IsStdErr) {
        if (this.FOnStdErrorWrite != null) this.FOnStdErrorWrite(this,S);
      } else {
        if (this.FOnStdOutputWrite != null) this.FOnStdOutputWrite(this,S);
      };
    };
    this.GetImports = function (aImports) {
      aImports["args_get"] = rtl.createCallback(this,"args_get");
      aImports["args_sizes_get"] = rtl.createCallback(this,"args_sizes_get");
      aImports["clock_res_get"] = rtl.createCallback(this,"clock_res_get");
      aImports["clock_time_get"] = rtl.createCallback(this,"clock_time_get");
      aImports["environ_get"] = rtl.createCallback(this,"environ_get");
      aImports["environ_sizes_get"] = rtl.createCallback(this,"environ_sizes_get");
      aImports["fd_advise"] = rtl.createCallback(this,"fd_advise");
      aImports["fd_allocate"] = rtl.createCallback(this,"fd_allocate");
      aImports["fd_close"] = rtl.createCallback(this,"fd_close");
      aImports["fd_datasync"] = rtl.createCallback(this,"fd_datasync");
      aImports["fd_fdstat_get"] = rtl.createCallback(this,"fd_fdstat_get");
      aImports["fd_fdstat_set_flags"] = rtl.createCallback(this,"fd_fdstat_set_flags");
      aImports["fd_fdstat_set_rights"] = rtl.createCallback(this,"fd_fdstat_set_rights");
      aImports["fd_filestat_get"] = rtl.createCallback(this,"fd_filestat_get");
      aImports["fd_filestat_set_size"] = rtl.createCallback(this,"fd_filestat_set_size");
      aImports["fd_filestat_set_times"] = rtl.createCallback(this,"fd_filestat_set_times");
      aImports["fd_pread"] = rtl.createCallback(this,"fd_pread");
      aImports["fd_prestat_dir_name"] = rtl.createCallback(this,"fd_prestat_dir_name");
      aImports["fd_prestat_get"] = rtl.createCallback(this,"fd_prestat_get");
      aImports["fd_pwrite"] = rtl.createCallback(this,"fd_pwrite");
      aImports["fd_read"] = rtl.createCallback(this,"fd_read");
      aImports["fd_readdir"] = rtl.createCallback(this,"fd_readdir");
      aImports["fd_renumber"] = rtl.createCallback(this,"fd_renumber");
      aImports["fd_seek"] = rtl.createCallback(this,"fd_seek");
      aImports["fd_sync"] = rtl.createCallback(this,"fd_sync");
      aImports["fd_tell"] = rtl.createCallback(this,"fd_tell");
      aImports["fd_write"] = rtl.createCallback(this,"fd_write");
      aImports["path_create_directory"] = rtl.createCallback(this,"path_create_directory");
      aImports["path_filestat_get"] = rtl.createCallback(this,"path_filestat_get");
      aImports["path_filestat_set_times"] = rtl.createCallback(this,"path_filestat_set_times");
      aImports["path_link"] = rtl.createCallback(this,"path_link");
      aImports["path_open"] = rtl.createCallback(this,"path_open");
      aImports["path_readlink"] = rtl.createCallback(this,"path_readlink");
      aImports["path_remove_directory"] = rtl.createCallback(this,"path_remove_directory");
      aImports["path_rename"] = rtl.createCallback(this,"path_rename");
      aImports["path_symlink"] = rtl.createCallback(this,"path_symlink");
      aImports["path_unlink_file"] = rtl.createCallback(this,"path_unlink_file");
      aImports["poll_oneoff"] = rtl.createCallback(this,"poll_oneoff");
      aImports["proc_exit"] = rtl.createCallback(this,"proc_exit");
      aImports["proc_raise"] = rtl.createCallback(this,"proc_raise");
      aImports["random_get"] = rtl.createCallback(this,"random_get");
      aImports["sched_yield"] = rtl.createCallback(this,"sched_yield");
      aImports["sock_recv"] = rtl.createCallback(this,"sock_recv");
      aImports["sock_recv"] = rtl.createCallback(this,"sock_recv");
      aImports["sock_shutdown"] = rtl.createCallback(this,"sock_shutdown");
    };
    this.GetTime = function (aClockID) {
      var Result = 0;
      Result = -1;
      var $tmp = aClockID;
      if ($tmp === 0) {
        Result = Date.now()}
       else if ($tmp === 2) {
        Result = Date.now()}
       else if (($tmp === 1) || ($tmp === 3)) Result = Date.now();
      return Result;
    };
    this.getModuleMemoryDataView = function () {
      var Result = null;
      Result = new DataView(this.FModuleInstanceExports.memory.buffer);
      return Result;
    };
    this.AddExtension = function (aExtension) {
      if (!(this.FImportExtensions != null)) this.FImportExtensions = pas.Classes.TFPList.$create("Create");
      this.FImportExtensions.Add(aExtension);
    };
    this.RemoveExtension = function (aExtension) {
      if (this.FImportExtensions != null) this.FImportExtensions.Remove(aExtension);
    };
    this.args_get = function (argv, argvBuf) {
      var Result = 0;
      Result = 0;
      return Result;
    };
    this.args_sizes_get = function (argc, argvBufSize) {
      var Result = 0;
      var View = null;
      View = this.getModuleMemoryDataView();
      View.setUint32(argc,0,this.FIsLittleEndian);
      View.setUint32(argvBufSize,0,this.FIsLittleEndian);
      Result = 0;
      return Result;
    };
    this.clock_res_get = function (clockId, resolution) {
      var Result = 0;
      var view = null;
      view = this.getModuleMemoryDataView();
      this.$class.setBigUint64(view,resolution,0,this.FIsLittleEndian);
      Result = 0;
      return Result;
    };
    this.clock_time_get = function (clockId, precision, time) {
      var Result = 0;
      var view = null;
      var n = 0;
      view = this.getModuleMemoryDataView();
      n = this.GetTime(clockId);
      if (n === -1) {
        Result = 28}
       else {
        this.$class.setBigUint64(view,time,n,this.FIsLittleEndian);
        Result = 0;
      };
      return Result;
    };
    this.environ_get = function (environ, environBuf) {
      var Result = 0;
      Result = 0;
      return Result;
    };
    this.environ_sizes_get = function (environCount, environBufSize) {
      var Result = 0;
      var View = null;
      View = this.getModuleMemoryDataView();
      View.setUint32(environCount,0,this.FIsLittleEndian);
      View.setUint32(environBufSize,0,this.FIsLittleEndian);
      Result = 0;
      return Result;
    };
    this.fd_advise = function (fd, offset, len, advice) {
      var Result = 0;
      window.console.log("Unimplemented: TPas2JSWASIEnvironment.fd_advise");
      Result = 52;
      return Result;
    };
    this.fd_allocate = function (fd, offset, len) {
      var Result = 0;
      window.console.log("Unimplemented: TPas2JSWASIEnvironment.fd_allocate");
      Result = 52;
      return Result;
    };
    this.fd_close = function (fd) {
      var Result = 0;
      window.console.log("Unimplemented: TPas2JSWASIEnvironment.fd_close");
      Result = 52;
      return Result;
    };
    this.fd_datasync = function (fd) {
      var Result = 0;
      window.console.log("Unimplemented: TPas2JSWASIEnvironment.fd_datasync");
      Result = 52;
      return Result;
    };
    this.fd_fdstat_get = function (fd, bufPtr) {
      var Result = 0;
      var View = null;
      View = this.getModuleMemoryDataView();
      View.setUint8(bufPtr,fd);
      View.setUint16(bufPtr + 2,0,this.FIsLittleEndian);
      View.setUint16(bufPtr + 4,0,this.FIsLittleEndian);
      this.$class.setBigUint64(View,bufPtr + 8,0,this.FIsLittleEndian);
      this.$class.setBigUint64(View,bufPtr + 8 + 8,0,this.FIsLittleEndian);
      Result = 0;
      return Result;
    };
    this.fd_fdstat_set_flags = function (fd, flags) {
      var Result = 0;
      window.console.log("Unimplemented: TPas2JSWASIEnvironment.fd_fdstat_set_flags");
      Result = 52;
      return Result;
    };
    this.fd_fdstat_set_rights = function (fd, fsRightsBase, fsRightsInheriting) {
      var Result = 0;
      window.console.log("Unimplemented: TPas2JSWASIEnvironment.fd_fdstat_set_rights");
      Result = 52;
      return Result;
    };
    this.fd_filestat_get = function (fd, bufPtr) {
      var Result = 0;
      window.console.log("Unimplemented: TPas2JSWASIEnvironment.fd_filestat_get");
      Result = 52;
      return Result;
    };
    this.fd_filestat_set_size = function (fd, stSize) {
      var Result = 0;
      window.console.log("Unimplemented: TPas2JSWASIEnvironment.fd_filestat_set_size");
      Result = 52;
      return Result;
    };
    this.fd_filestat_set_times = function (fd, stAtim, stMtim, fstflags) {
      var Result = 0;
      window.console.log("Unimplemented: TPas2JSWASIEnvironment.fd_filestat_set_times");
      Result = 52;
      return Result;
    };
    this.fd_pread = function (fd, iovs, iovsLen, offset, nread) {
      var Result = 0;
      window.console.log("Unimplemented: TPas2JSWASIEnvironment.fd_pread");
      Result = 52;
      return Result;
    };
    this.fd_prestat_dir_name = function (fd, pathPtr, pathLen) {
      var Result = 0;
      window.console.log("Unimplemented: TPas2JSWASIEnvironment.fd_prestat_dir_name");
      Result = 52;
      return Result;
    };
    this.fd_prestat_get = function (fd, bufPtr) {
      var Result = 0;
      window.console.log("Unimplemented: TPas2JSWASIEnvironment.fd_prestat_get");
      Result = 8;
      return Result;
    };
    this.fd_pwrite = function (fd, iovs, iovsLen, offset, nwritten) {
      var Result = 0;
      window.console.log("Unimplemented: TPas2JSWASIEnvironment.fd_pwrite");
      Result = 52;
      return Result;
    };
    this.fd_read = function (fd, iovs, iovsLen, nread) {
      var $Self = this;
      var Result = 0;
      var view = null;
      var bytesRead = 0;
      var bufferBytes = null;
      var Buffers = null;
      function readv(element, index, anArray) {
        var Result = false;
        var b = 0;
        b = 0;
        while ((b < element.byteLength) && (bytesRead < bufferBytes.length)) {
          element[b] = bufferBytes[bytesRead];
          b += 1;
          bytesRead += 1;
        };
        Result = true;
        return Result;
      };
      bytesRead = 0;
      view = this.getModuleMemoryDataView();
      if (fd === 0) {
        bufferBytes = this.GetConsoleInputBuffer();
      } else bufferBytes = this.GetFileBuffer(fd);
      if (bufferBytes.length > 0) {
        Buffers = this.getiovs(view,iovs,iovsLen);
        Buffers.forEach(readv);
      };
      view.setUint32(nread,bytesRead,this.FIsLittleEndian);
      Result = 0;
      return Result;
    };
    this.fd_readdir = function (fd, bufPtr, bufLen, cookie, bufusedPtr) {
      var Result = 0;
      window.console.log("Unimplemented: TPas2JSWASIEnvironment.fd_readdir");
      Result = 52;
      return Result;
    };
    this.fd_renumber = function (afrom, ato) {
      var Result = 0;
      window.console.log("Unimplemented: TPas2JSWASIEnvironment.fd_renumber");
      Result = 52;
      return Result;
    };
    this.fd_seek = function (fd, offset, whence, newOffsetPtr) {
      var Result = 0;
      window.console.log("Unimplemented: TPas2JSWASIEnvironment.fd_seek");
      Result = 52;
      return Result;
    };
    this.fd_sync = function (fd) {
      var Result = 0;
      window.console.log("Unimplemented: TPas2JSWASIEnvironment.fd_sync");
      Result = 52;
      return Result;
    };
    this.fd_tell = function (fd, offsetPtr) {
      var Result = 0;
      window.console.log("Unimplemented: TPas2JSWASIEnvironment.fd_tell");
      Result = 52;
      return Result;
    };
    this.fd_write = function (fd, iovs, iovsLen, nwritten) {
      var $Self = this;
      var Result = 0;
      var view = null;
      var written = 0;
      var bufferBytes = null;
      var Buffers = null;
      function writev(element, index, anArray) {
        var Result = false;
        var b = 0;
        for (var $l = 0, $end = element.byteLength - 1; $l <= $end; $l++) {
          b = $l;
          bufferBytes.push(element[b]);
        };
        written += element.byteLength;
        Result = true;
        return Result;
      };
      bufferBytes = new Array();
      view = this.getModuleMemoryDataView();
      written = 0;
      Buffers = this.getiovs(view,iovs,iovsLen);
      Buffers.forEach(writev);
      if ((fd === 1) || (fd === 2)) this.DoConsoleWrite(fd === 2,bufferBytes);
      view.setUint32(nwritten,written,this.FIsLittleEndian);
      Result = 0;
      return Result;
    };
    this.path_create_directory = function (fd, pathPtr, pathLen) {
      var Result = 0;
      window.console.log("Unimplemented: TPas2JSWASIEnvironment.path_create_directory");
      Result = 52;
      return Result;
    };
    this.path_filestat_get = function (fd, flags, pathPtr, pathLen, bufPtr) {
      var Result = 0;
      window.console.log("Unimplemented: TPas2JSWASIEnvironment.path_filestat_get");
      Result = 52;
      return Result;
    };
    this.path_filestat_set_times = function (fd, fstflags, pathPtr, pathLen, stAtim, stMtim) {
      var Result = 0;
      window.console.log("Unimplemented: TPas2JSWASIEnvironment.path_filestat_set_times");
      Result = 52;
      return Result;
    };
    this.path_link = function (oldFd, oldFlags, oldPath, oldPathLen, newFd, newPath, newPathLen) {
      var Result = 0;
      window.console.log("Unimplemented: TPas2JSWASIEnvironment.path_link");
      Result = 52;
      return Result;
    };
    this.path_open = function (dirfd, dirflags, pathPtr, pathLen, oflags, fsRightsBase, fsRightsInheriting, fsFlags, fd) {
      var Result = 0;
      window.console.log("Unimplemented: TPas2JSWASIEnvironment.path_open");
      Result = 52;
      return Result;
    };
    this.path_readlink = function (fd, pathPtr, pathLen, buf, bufLen, bufused) {
      var Result = 0;
      window.console.log("Unimplemented: TPas2JSWASIEnvironment.path_readlink");
      Result = 52;
      return Result;
    };
    this.path_remove_directory = function (fd, pathPtr, pathLen) {
      var Result = 0;
      window.console.log("Unimplemented: TPas2JSWASIEnvironment.path_remove_directory");
      Result = 52;
      return Result;
    };
    this.path_rename = function (oldFd, oldPath, oldPathLen, newFd, newPath, newPathLen) {
      var Result = 0;
      window.console.log("Unimplemented: TPas2JSWASIEnvironment.path_rename");
      Result = 52;
      return Result;
    };
    this.path_symlink = function (oldPath, oldPathLen, fd, newPath, newPathLen) {
      var Result = 0;
      window.console.log("Unimplemented: TPas2JSWASIEnvironment.path_symlink");
      Result = 52;
      return Result;
    };
    this.path_unlink_file = function (fd, pathPtr, pathLen) {
      var Result = 0;
      window.console.log("Unimplemented: TPas2JSWASIEnvironment.path_unlink_file");
      Result = 52;
      return Result;
    };
    this.poll_oneoff = function (sin, sout, nsubscriptions, nevents) {
      var Result = 0;
      window.console.log("Unimplemented: TPas2JSWASIEnvironment.poll_oneoff");
      Result = 52;
      return Result;
    };
    this.proc_exit = function (rval) {
      var Result = 0;
      this.FExitCode = rval;
      Result = 0;
      return Result;
    };
    this.proc_raise = function (sig) {
      var Result = 0;
      window.console.log("Unimplemented: TPas2JSWASIEnvironment.proc_raise");
      Result = 52;
      return Result;
    };
    this.random_get = function (bufPtr, bufLen) {
      var Result = 0;
      var arr = null;
      var I = 0;
      var View = null;
      arr = new Uint8Array(bufLen);
      window.crypto.getRandomValues(arr);
      View = this.getModuleMemoryDataView();
      for (var $l = 0, $end = arr.length - 1; $l <= $end; $l++) {
        I = $l;
        View.setInt8(bufPtr + I,arr[I]);
      };
      Result = 0;
      return Result;
    };
    this.sched_yield = function () {
      var Result = 0;
      Result = 0;
      return Result;
    };
    this.sock_recv = function () {
      var Result = 0;
      window.console.log("Unimplemented: TPas2JSWASIEnvironment.sock_recv");
      Result = 52;
      return Result;
    };
    this.sock_send = function () {
      var Result = 0;
      window.console.log("Unimplemented: TPas2JSWASIEnvironment.sock_recv");
      Result = 52;
      return Result;
    };
    this.sock_shutdown = function () {
      var Result = 0;
      window.console.log("Unimplemented: TPas2JSWASIEnvironment.sock_shutdown");
      Result = 52;
      return Result;
    };
    this.Create$1 = function () {
      this.FIsLittleEndian = true;
      this.FWASIImportName = "wasi_snapshot_preview1";
      return this;
    };
    this.Destroy = function () {
      pas.SysUtils.FreeAndNil({p: this, get: function () {
          return this.p.FImportExtensions;
        }, set: function (v) {
          this.p.FImportExtensions = v;
        }});
      pas.System.TObject.Destroy.call(this);
    };
    this.GetUTF8StringFromMem = function (aLoc, aLen) {
      var Result = "";
      Result = this.UTF8TextDecoder.decode(this.getModuleMemoryDataView().buffer.slice(aLoc,aLoc + aLen));
      return Result;
    };
    this.AddImports = function (aObject) {
      var Ext = null;
      var I = 0;
      var O = null;
      aObject[this.FWASIImportName] = this.GetImportObject();
      if (this.FImportExtensions != null) for (var $l = 0, $end = this.FImportExtensions.FCount - 1; $l <= $end; $l++) {
        I = $l;
        Ext = rtl.getObject(this.FImportExtensions.Get(I));
        O = new Object();
        Ext.FillImportObject(O);
        aObject[Ext.ImportName()] = O;
      };
    };
    rtl.addIntf(this,$mod.IWASI);
  });
  rtl.createClass(this,"TImportExtension",pas.System.TObject,function () {
    this.$init = function () {
      pas.System.TObject.$init.call(this);
      this.FEnv = null;
    };
    this.$final = function () {
      this.FEnv = undefined;
      pas.System.TObject.$final.call(this);
    };
    this.getModuleMemoryDataView = function () {
      var Result = null;
      Result = this.FEnv.getModuleMemoryDataView();
      return Result;
    };
    this.Create$1 = function (aEnv) {
      this.FEnv = aEnv;
      if (this.FEnv != null) this.FEnv.AddExtension(this);
      return this;
    };
    this.Destroy = function () {
      if (this.FEnv != null) this.FEnv.RemoveExtension(this);
      pas.System.TObject.Destroy.call(this);
    };
  });
  $mod.$implcode = function () {
    $impl.toUTF8Array = function (str) {
      var Result = null;
      var Len = 0;
      var I = 0;
      var P = 0;
      var charCode = 0;
      function push(abyte) {
        Result[P] = abyte;
        P += 1;
      };
      Result = new Uint8Array(str.length * 4);
      P = 0;
      Len = str.length;
      I = 1;
      while (I <= Len) {
        charCode = str.charCodeAt(I - 1);
        if (charCode < 0x80) {
          push(charCode)}
         else if (charCode < 0x800) {
          push(rtl.or(0xc0,Math.floor(charCode / 64)));
          push(rtl.or(0x80,charCode & 0x3f));
        } else if ((charCode < 0xd800) || (charCode >= 0xe000)) {
          push(rtl.or(0xe0,Math.floor(charCode / 4096)));
          push(rtl.or(0x80,Math.floor(charCode / 64) & 0x3f));
          push(rtl.or(0x80,charCode & 0x3f));
        } else {
          I += 1;
          charCode = 0x10000 + rtl.or(rtl.shl(charCode & 0x3ff,10),str.charCodeAt(I - 1) & 0x3ff);
          push(rtl.or(0xf0,Math.floor(charCode / 262144)));
          push(rtl.or(0x80,Math.floor(charCode / 4096) & 0x3f));
          push(rtl.or(0x80,Math.floor(charCode / 64) & 0x3f));
          push(rtl.or(0x80,charCode & 0x3f));
        };
        I += 1;
      };
      Result = Result.slice(0,P);
      return Result;
    };
  };
  $mod.$init = function () {
    (function () {
      var Opts = null;
      Opts = new Object();
      Opts.ignoreBOM = true;
      Opts.fatal = true;
      $mod.TPas2JSWASIEnvironment.UTF8TextDecoder = new TextDecoder("utf-8",Opts);
    })();
  };
},["Web"]);
rtl.module("wasihostapp",["System","Classes","SysUtils","JS","browserapp","Web","webassembly","wasienv"],function () {
  "use strict";
  var $mod = this;
  rtl.recNewT(this,"TStartDescriptor",function () {
    this.Memory = null;
    this.Table = null;
    this.Exported = null;
    this.Instance = null;
    this.$eq = function (b) {
      return (this.Memory === b.Memory) && (this.Table === b.Table) && (this.Exported === b.Exported) && (this.Instance === b.Instance);
    };
    this.$assign = function (s) {
      this.Memory = s.Memory;
      this.Table = s.Table;
      this.Exported = s.Exported;
      this.Instance = s.Instance;
      return this;
    };
    var $r = $mod.$rtti.$Record("TStartDescriptor",{});
    $r.addField("Memory",pas.webassembly.$rtti["TJSWebAssemblyMemory"]);
    $r.addField("Table",pas.webassembly.$rtti["TJSWebAssemblyTable"]);
    $r.addField("Exported",pas.wasienv.$rtti["TWASIExports"]);
    $r.addField("Instance",pas.webassembly.$rtti["TJSWebAssemblyInstance"]);
  });
  this.$rtti.$RefToProcVar("TStartCallBack",{procsig: rtl.newTIProcSig([["Sender",pas.System.$rtti["TObject"]],["aDescriptor",this.$rtti["TStartDescriptor"]]],rtl.boolean)});
  rtl.createClass(this,"TWASIHostApplication",pas.browserapp.TBrowserApplication,function () {
    this.$init = function () {
      pas.browserapp.TBrowserApplication.$init.call(this);
      this.FEnv = null;
      this.FExported = null;
      this.FMemoryDescriptor = pas.webassembly.TJSWebAssemblyMemoryDescriptor.$new();
      this.FRunEntryFunction = "";
      this.FTableDescriptor = pas.webassembly.TJSWebAssemblyTableDescriptor.$new();
    };
    this.$final = function () {
      this.FEnv = undefined;
      this.FExported = undefined;
      this.FMemoryDescriptor = undefined;
      this.FTableDescriptor = undefined;
      pas.browserapp.TBrowserApplication.$final.call(this);
    };
    this.DoStdRead = function (Sender, AInput) {
      AInput.set(window.prompt("Please enter the input for the running webassembly program."));
    };
    this.DoStdWrite = function (Sender, aOutput) {
      window.console.log("Webassembly output: ",aOutput);
    };
    this.CreateWebAssembly = function (aPath, aImportObject) {
      var $Self = this;
      var Result = null;
      function ArrayOK(res2) {
        var Result = undefined;
        Result = WebAssembly.instantiate(res2,aImportObject);
        return Result;
      };
      function fetchOK(res) {
        var Result = undefined;
        Result = res.arrayBuffer().then(ArrayOK,null);
        return Result;
      };
      Result = window.fetch(aPath).then(fetchOK,null);
      return Result;
    };
    this.CreateWasiEnvironment = function () {
      var Result = null;
      Result = pas.wasienv.TPas2JSWASIEnvironment.$create("Create$1");
      return Result;
    };
    this.GetTable = function () {
      var Result = null;
      Result = new WebAssembly.Table(pas.webassembly.TJSWebAssemblyTableDescriptor.$clone(this.FTableDescriptor));
      return Result;
    };
    this.GetMemory = function () {
      var Result = null;
      Result = new WebAssembly.Memory(pas.webassembly.TJSWebAssemblyMemoryDescriptor.$clone(this.FMemoryDescriptor));
      return Result;
    };
    this.Create$1 = function (aOwner) {
      pas.CustApp.TCustomApplication.Create$1.call(this,aOwner);
      this.FEnv = this.CreateWasiEnvironment();
      this.FEnv.FOnStdErrorWrite = rtl.createCallback(this,"DoStdWrite");
      this.FEnv.FOnStdOutputWrite = rtl.createCallback(this,"DoStdWrite");
      this.FEnv.FOnGetConsoleInputString = rtl.createCallback(this,"DoStdRead");
      this.FMemoryDescriptor.initial = 256;
      this.FMemoryDescriptor.maximum = 256;
      this.FTableDescriptor.initial = 0;
      this.FTableDescriptor.maximum = 0;
      this.FTableDescriptor.element = "anyfunc";
      return this;
    };
    this.Destroy = function () {
      pas.SysUtils.FreeAndNil({p: this, get: function () {
          return this.p.FEnv;
        }, set: function (v) {
          this.p.FEnv = v;
        }});
      pas.Classes.TComponent.Destroy.call(this);
    };
    this.StartWebAssembly = function (aPath, DoRun, aCallBack) {
      var $Self = this;
      var ImportObj = null;
      var Res = $mod.TStartDescriptor.$new();
      function InitEnv(aValue) {
        var Result = undefined;
        Result = true;
        Res.Instance = aValue.instance;
        Res.Exported = aValue.instance.exports;
        $Self.FExported = Res.Exported;
        $Self.FEnv.SetInstance(aValue.instance);
        if (aCallBack != null) DoRun = aCallBack($Self,$mod.TStartDescriptor.$clone(Res)) && DoRun;
        if (DoRun) if ($Self.FRunEntryFunction === "") {
          Res.Exported._start()}
         else Res.Exported[$Self.FRunEntryFunction]();
        return Result;
      };
      Res.Memory = this.GetMemory();
      Res.Table = this.GetTable();
      ImportObj = pas.JS.New(["js",pas.JS.New(["mem",Res.Memory,"tbl",Res.Table])]);
      this.FEnv.AddImports(ImportObj);
      this.CreateWebAssembly(aPath,ImportObj).then(InitEnv);
    };
    rtl.addIntf(this,pas.System.IUnknown);
  });
});
rtl.module("program",["System","Classes","JS","SysUtils","wasihostapp","Web","webassembly"],function () {
  "use strict";
  var $mod = this;
  rtl.createClass(this,"TMyApplication",pas.wasihostapp.TWASIHostApplication,function () {
    this.DoRun = function () {
      this.StartWebAssembly("lyff.wasm",true,$mod.wasmStart);
    };
    rtl.addIntf(this,pas.System.IUnknown);
  });
  this.DIM = 100;
  this.wasmDescriptor = pas.wasihostapp.TStartDescriptor.$new();
  this.canvas = null;
  this.keepPlaying = false;
  this.btnStart = null;
  this.btnStop = null;
  this.btnClear = null;
  this.Application = null;
  this.board_init = function (genesisDistribution) {
    var Result = 0;
    Result = rtl.trunc($mod.wasmDescriptor.Instance.exports["board_init"].call(pas.JS.New(["gd",genesisDistribution])));
    return Result;
  };
  this.board_clear = function () {
    $mod.wasmDescriptor.Instance.exports["board_clear"].call(null);
  };
  this.board_step = function () {
    $mod.wasmDescriptor.Instance.exports["board_step"].call(null);
  };
  this.board_ref = function () {
    var Result = 0;
    Result = rtl.trunc($mod.wasmDescriptor.Instance.exports["board_ref"].call(null));
    return Result;
  };
  this.GetBoardBuffer = function () {
    var Result = null;
    Result = new Uint8Array($mod.wasmDescriptor.Instance.exports.memory.buffer,$mod.board_ref());
    return Result;
  };
  this.draw = function () {
    var buffer = null;
    var data = null;
    var x = 0;
    var y = 0;
    var pos = 0;
    var i = 0;
    var offset = 0;
    var alive = 0;
    var doffset = 0;
    buffer = $mod.GetBoardBuffer();
    $mod.canvas.width = 100 + 2;
    $mod.canvas.height = $mod.canvas.width;
    $mod.canvas.style.setProperty("width",pas.SysUtils.IntToStr(100 * 3) + "px");
    $mod.canvas.style.setProperty("height",pas.SysUtils.IntToStr(100 * 3) + "px");
    data = new ImageData($mod.canvas.width,$mod.canvas.height);
    for (x = 1; x <= 100; x++) for (y = 1; y <= 100; y++) {
      pos = (y * (100 + 2)) + x;
      i = rtl.trunc(pos / 8) << 0;
      offset = 1 << (pos % 8);
      alive = buffer[i] & offset;
      if (alive === 0) continue;
      doffset = ((y * $mod.canvas.width) + x) * 4;
      data.data[doffset + 0] = 255;
      data.data[doffset + 3] = 255;
    };
    $mod.canvas.getContext("2d").putImageData(data,0,0);
  };
  this.drawLoop = function () {
    if ($mod.keepPlaying) {
      $mod.board_step();
      $mod.draw();
    };
  };
  this.gameStart = function (event) {
    var Result = false;
    $mod.btnStart.disabled = true;
    $mod.btnStop.disabled = false;
    $mod.btnClear.disabled = true;
    $mod.keepPlaying = true;
    $mod.board_init(12345);
    window.setInterval(rtl.createSafeCallback($mod,"drawLoop"),500);
    return Result;
  };
  this.gameStop = function (event) {
    var Result = false;
    $mod.btnStart.disabled = false;
    $mod.btnStop.disabled = true;
    $mod.btnClear.disabled = false;
    $mod.keepPlaying = false;
    return Result;
  };
  this.gameClear = function (event) {
    var Result = false;
    $mod.board_clear();
    $mod.draw();
    $mod.btnStart.disabled = false;
    $mod.btnStop.disabled = true;
    $mod.btnClear.disabled = true;
    return Result;
  };
  this.wasmStart = function (Sender, aDescriptor) {
    var Result = false;
    $mod.wasmDescriptor.$assign(aDescriptor);
    $mod.canvas = document.getElementById("canvas");
    $mod.btnStart = document.getElementById("btnStart");
    $mod.btnStart.onclick = rtl.createSafeCallback($mod,"gameStart");
    $mod.btnStop = document.getElementById("btnStop");
    $mod.btnStop.onclick = rtl.createSafeCallback($mod,"gameStop");
    $mod.btnClear = document.getElementById("btnClear");
    $mod.btnClear.onclick = rtl.createSafeCallback($mod,"gameClear");
    Result = true;
    return Result;
  };
  $mod.$implcode = function () {
    pas.System.$rtti["TArray<Classes.TPersistentClass>"].eltype = pas.Classes.$rtti["TPersistentClass"];
  };
  $mod.$main = function () {
    $mod.Application = $mod.TMyApplication.$create("Create$1",[null]);
    $mod.Application.Initialize();
    $mod.Application.Run();
  };
});
