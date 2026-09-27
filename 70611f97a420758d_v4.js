/**
 * 网上国网 · Cookie 抓取
 *
 * 抓取:打开「网上国网」App → 进「我的 / 积分签到」页,抓 Cookie(t/设备头)+ 签到请求(供 cron 复用)
 *
 * @Author: MaYIHEI <https://github.com/MaYIHEI/paperclip>
 * @Channel: Telegram 频道 https://t.me/mayihei
 * @Updated: 2026-06-22
 */

const $ = new Env("网上国网 [Cookie]");

const KEY = "sgcc_data";                                   // Cookie:t + 设备头
const KEY_ENV = "sgcc_signin";                             // 签到请求体 {data,skey,path}
// 注意:签到接口路径随 App 版本变化 —— 旧版是 /osg-omgmt1042/member/m1/0103514,
// 新版(v3.2.4 / 签到V00000419)已改为 /osg-omgmt1042/member/c1/q022607。
// 因此不再写死路径,改为「URL 含 /member/ 且请求体带 data+skey」动态识别,并存下真实 path。
const SIGNIN_PATH_HINT = "/osg-omgmt1042/member/m1/0103514"; // 仅供参考,不参与判定
const WANT = ["authorization","t","userid","device_token","appguid","appguidnew","devicetokentx","devicetokentxtime","wtoken","appcode","os","version","ip","province","language","wsgwtype","accessmethod","user-agent"];

// ========== 存储 API 兼容层(关键修复) ==========
// 原版只用 $persistentStore(Surge/Loon 原生),但 QX 的重写脚本环境里它不可用,
// 导致 write() 静默失败 → 数据没落盘 → cron 端读 $prefs 读到空,报"缺少 Cookie 或签到请求"。
// 正确做法:QX 用 $prefs,cron 端 Env 库(QX 分支)读的也是 $prefs,两端才对得上。
function read(k){
  try {
    if (typeof $prefs !== "undefined" && $prefs.valueForKey) return $prefs.valueForKey(k);
    if (typeof $persistentStore !== "undefined") return $persistentStore.read(k);
  } catch (e) {}
  return null;
}
function write(v,k){
  try {
    if (typeof $prefs !== "undefined" && $prefs.setValueForKey) return $prefs.setValueForKey(v, k);
    if (typeof $persistentStore !== "undefined") return $persistentStore.write(v, k);
  } catch (e) {}
  return false;
}
// 写入后回读校验:读不回来就通知,避免"显示抓取成功但 cron 读不到"的假象
function writeChecked(v,k,label){
  write(v,k);
  const back = read(k);
  if (back === null || back === undefined || back === "") {
    try { $.msg("⚠️ 网上国网 存储写入失败", label, "存进去读不回来,cron 会报「缺少 Cookie 或签到请求」"); } catch (e) {}
    return false;
  }
  return true;
}

!(function main(){
  if (typeof $request === "undefined") { $.log("[ERROR] 该脚本仅作为 http-request 重写脚本运行"); return $.done(); }
  $.log("[INFO] storage API = " + (typeof $prefs !== "undefined" ? "$prefs" : (typeof $persistentStore !== "undefined" ? "$persistentStore" : "NONE!")));
  try {
    const url = $request.url || "";
    const h = $request.headers || {};
    const low = {};
    for (const k in h) low[k.toLowerCase()] = h[k];

    // ① 抓"提交签到"请求体(动态识别,需 requires-body)
    //    判定条件:URL 含 /member/ 且请求体是 {data, skey} 结构 —— 签到请求的特征
    if (url.indexOf("/member/") > -1) {
      try {
        const b = JSON.parse($request.body || "{}");
        if (b.data && b.skey) {
          // 从真实 URL 提取 path(去掉协议+域名+端口,去掉 query),供 cron 原样复用
          const p = url.replace(/^https?:\/\/[^/]+/, "").split("?")[0];
          const had = read(KEY_ENV);
          let lastPath = null;
          try { lastPath = JSON.parse(had || "{}").path; } catch (e) {}
          writeChecked(JSON.stringify({ data: b.data, skey: b.skey, path: p }), KEY_ENV, "签到请求 " + p);
          // 首次抓到、或路径变化时都通知(路径变化 = App 升级换了签到接口,需重新抓)
          if (!had || lastPath !== p) $.msg("✅ 网上国网 签到请求已抓", "path: " + p, "");
        }
      } catch (e) {}
    }

    // ② 抓 Cookie 头(每次请求都带,t 未变则静默,避免刷屏)
    const t = low["t"], uid = low["userid"];
    if (!t || !uid) return $.done();
    let prevT = null;
    try { prevT = JSON.parse(read(KEY) || "{}").t; } catch (e) {}
    const picked = {};
    WANT.forEach(k => { if (low[k] != null) picked[k] = low[k]; });
    picked._ts = Date.now();
    writeChecked(JSON.stringify(picked), KEY, "Cookie 设备头");
    if (t !== prevT) {
      $.msg("✅ 网上国网 Cookie 获取成功", `userid: ${uid.slice(0,6)}…${uid.slice(-4)}`, `t: ${t.slice(0,6)}…${t.slice(-4)}  共 ${Object.keys(picked).length-1} 项`);
    }
    $.done();
  } catch (e) {
    $.msg("⚠️ 网上国网 抓取异常", e.message || String(e), "");
    $.done();
  }
})();

// prettier-ignore
function Env(t,e){class s{constructor(t){this.env=t}send(t,e="GET"){t="string"==typeof t?{url:t}:t;let s=this.get;return"POST"===e&&(s=this.post),new Promise((e,a)=>{s.call(this,t,(t,s,r)=>{t?a(t):e(s)})})}get(t){return this.send.call(this.env,t)}post(t){return this.send.call(this.env,t,"POST")}}return new class{constructor(t,e){this.name=t,this.http=new s(this),this.data=null,this.dataFile="box.dat",this.logs=[],this.isMute=!1,this.isNeedRewrite=!1,this.logSeparator="\n",this.encoding="utf-8",this.startTime=(new Date).getTime(),Object.assign(this,e),this.log("",`🔔${this.name}, 开始!`)}getEnv(){return"undefined"!=typeof $environment&&$environment["surge-version"]?"Surge":"undefined"!=typeof $environment&&$environment["stash-version"]?"Stash":"undefined"!=typeof module&&module.exports?"Node.js":"undefined"!=typeof $task?"Quantumult X":"undefined"!=typeof $loon?"Loon":"undefined"!=typeof $rocket?"Shadowrocket":void 0}isNode(){return"Node.js"===this.getEnv()}isQuanX(){return"Quantumult X"===this.getEnv()}isSurge(){return"Surge"===this.getEnv()}isLoon(){return"Loon"===this.getEnv()}isShadowrocket(){return"Shadowrocket"===this.getEnv()}isStash(){return"Stash"===this.getEnv()}toObj(t,e=null){try{return JSON.parse(t)}catch{return e}}toStr(t,e=null){try{return JSON.stringify(t)}catch{return e}}getjson(t,e){let s=e;const a=this.getdata(t);if(a)try{s=JSON.parse(this.getdata(t))}catch{}return s}setjson(t,e){try{return this.setdata(JSON.stringify(t),e)}catch{return!1}}getScript(t){return new Promise(e=>{this.get({url:t},(t,s,a)=>e(a))})}loaddata(){if(!this.isNode())return{};{this.fs=this.fs?this.fs:require("fs"),this.path=this.path?this.path:require("path");const t=this.path.resolve(this.dataFile),e=this.path.resolve(process.cwd(),this.dataFile),s=this.fs.existsSync(t),a=!s&&this.fs.existsSync(e);if(!s&&!a)return{};{const a=s?t:e;try{return JSON.parse(this.fs.readFileSync(a))}catch(t){return{}}}}}writedata(){if(this.isNode()){this.fs=this.fs?this.fs:require("fs"),this.path=this.path?this.path:require("path");const t=this.path.resolve(this.dataFile),e=this.path.resolve(process.cwd(),this.dataFile),s=this.fs.existsSync(t),a=!s&&this.fs.existsSync(e),r=JSON.stringify(this.data);s?this.fs.writeFileSync(t,r):a?this.fs.writeFileSync(e,r):this.fs.writeFileSync(t,r)}}getdata(t){return this.getval(t)}setdata(t,e){return this.setval(t,e)}getval(t){switch(this.getEnv()){case"Surge":case"Loon":case"Stash":case"Shadowrocket":return $persistentStore.read(t);case"Quantumult X":return $prefs.valueForKey(t);case"Node.js":return this.data=this.loaddata(),this.data[t];default:return this.data&&this.data[t]||null}}setval(t,e){switch(this.getEnv()){case"Surge":case"Loon":case"Stash":case"Shadowrocket":return $persistentStore.write(t,e);case"Quantumult X":return $prefs.setValueForKey(t,e);case"Node.js":return this.data=this.loaddata(),this.data[e]=t,this.writedata(),!0;default:return this.data&&this.data[e]||null}}initGotEnv(t){this.got=this.got?this.got:require("got"),this.cktough=this.cktough?this.cktough:require("tough-cookie"),this.ckjar=this.ckjar?this.ckjar:new this.cktough.CookieJar,t&&(t.headers=t.headers?t.headers:{},void 0===t.headers.Cookie&&void 0===t.cookieJar&&(t.cookieJar=this.ckjar))}get(t,e=(()=>{})){switch(t.headers&&(delete t.headers["Content-Type"],delete t.headers["Content-Length"],delete t.headers["content-type"],delete t.headers["content-length"]),t.params&&(t.url+="?"+this.queryStr(t.params)),this.getEnv()){case"Surge":case"Loon":case"Stash":case"Shadowrocket":default:this.isSurge()&&this.isNeedRewrite&&(t.headers=t.headers||{},Object.assign(t.headers,{"X-Surge-Skip-Scripting":!1})),$httpClient.get(t,(t,s,a)=>{!t&&s&&(s.body=a,s.statusCode=s.status?s.status:s.statusCode,s.status=s.statusCode),e(t,s,a)});break;case"Quantumult X":this.isNeedRewrite&&(t.opts=t.opts||{},Object.assign(t.opts,{hints:!1})),$task.fetch(t).then(t=>{const{statusCode:s,statusCode:a,headers:r,body:i,bodyBytes:o}=t;e(null,{status:s,statusCode:a,headers:r,body:i,bodyBytes:o},i,o)},t=>e(t&&t.error||"UndefinedError"));break;case"Node.js":let s=require("iconv-lite");this.initGotEnv(t),this.got(t).on("redirect",(t,e)=>{try{if(t.headers["set-cookie"]){const s=t.headers["set-cookie"].map(this.cktough.Cookie.parse).toString();s&&this.ckjar.setCookieSync(s,null),e.cookieJar=this.ckjar}}catch(t){this.logErr(t)}}).then(t=>{const{statusCode:a,statusCode:r,headers:i,rawBody:o}=t,n=s.decode(o,this.encoding);e(null,{status:a,statusCode:r,headers:i,rawBody:o,body:n},n)},t=>{const{message:a,response:r}=t;e(a,r,r&&s.decode(r.rawBody,this.encoding))})}}post(t,e=(()=>{})){const s=t.method?t.method.toLocaleLowerCase():"post";switch(t.body&&t.headers&&!t.headers["Content-Type"]&&!t.headers["content-type"]&&(t.headers["content-type"]="application/x-www-form-urlencoded"),t.headers&&(delete t.headers["Content-Length"],delete t.headers["content-length"]),this.getEnv()){case"Surge":case"Loon":case"Stash":case"Shadowrocket":default:this.isSurge()&&this.isNeedRewrite&&(t.headers=t.headers||{},Object.assign(t.headers,{"X-Surge-Skip-Scripting":!1})),$httpClient[s](t,(t,s,a)=>{!t&&s&&(s.body=a,s.statusCode=s.status?s.status:s.statusCode,s.status=s.statusCode),e(t,s,a)});break;case"Quantumult X":t.method=s,this.isNeedRewrite&&(t.opts=t.opts||{},Object.assign(t.opts,{hints:!1})),$task.fetch(t).then(t=>{const{statusCode:s,statusCode:a,headers:r,body:i,bodyBytes:o}=t;e(null,{status:s,statusCode:a,headers:r,body:i,bodyBytes:o},i,o)},t=>e(t&&t.error||"UndefinedError"));break;case"Node.js":let a=require("iconv-lite");this.initGotEnv(t);const{url:r,...i}=t;this.got[s](r,i).then(t=>{const{statusCode:s,statusCode:r,headers:i,rawBody:o}=t,n=a.decode(o,this.encoding);e(null,{status:s,statusCode:r,headers:i,rawBody:o,body:n},n)},t=>{const{message:s,response:r}=t;e(s,r,r&&a.decode(r.rawBody,this.encoding))})}}time(t,e=null){const s=e?new Date(e):new Date;let a={"M+":s.getMonth()+1,"d+":s.getDate(),"H+":s.getHours(),"m+":s.getMinutes(),"s+":s.getSeconds(),"q+":Math.floor((s.getMonth()+3)/3),S:s.getMilliseconds()};/(y+)/.test(t)&&(t=t.replace(RegExp.$1,(s.getFullYear()+"").substr(4-RegExp.$1.length)));for(let e in a)new RegExp("("+e+")").test(t)&&(t=t.replace(RegExp.$1,1==RegExp.$1.length?a[e]:("00"+a[e]).substr((""+a[e]).length)));return t}queryStr(t){let e="";for(const s in t){let a=t[s];null!=a&&""!==a&&("object"==typeof a&&(a=JSON.stringify(a)),e+=`${s}=${a}&`)}return e=e.substring(0,e.length-1),e}msg(e=t,s="",a="",r){const i=t=>{switch(typeof t){case void 0:return t;case"string":switch(this.getEnv()){case"Surge":case"Stash":default:return{url:t};case"Loon":case"Shadowrocket":return t;case"Quantumult X":return{"open-url":t};case"Node.js":return}case"object":switch(this.getEnv()){case"Surge":case"Stash":case"Shadowrocket":default:{let e=t.url||t.openUrl||t["open-url"];return{url:e}}case"Loon":{let e=t.openUrl||t.url||t["open-url"],s=t.mediaUrl||t["media-url"];return{openUrl:e,mediaUrl:s}}case"Quantumult X":{let e=t["open-url"]||t.url||t.openUrl,s=t["media-url"]||t.mediaUrl,a=t["update-pasteboard"]||t.updatePasteboard;return{"open-url":e,"media-url":s,"update-pasteboard":a}}case"Node.js":return}default:return}};if(!this.isMute)switch(this.getEnv()){case"Surge":case"Loon":case"Stash":case"Shadowrocket":default:$notification.post(e,s,a,i(r));break;case"Quantumult X":$notify(e,s,a,i(r));break;case"Node.js":}if(!this.isMuteLog){let t=["","==============📣系统通知📣=============="];t.push(e),s&&t.push(s),a&&t.push(a),console.log(t.join("\n")),this.logs=this.logs.concat(t)}}log(...t){t.length>0&&(this.logs=[...this.logs,...t]),console.log(t.join(this.logSeparator))}logErr(t,e){switch(this.getEnv()){case"Surge":case"Loon":case"Stash":case"Shadowrocket":case"Quantumult X":default:this.log("",`❗️${this.name}, 错误!`,t);break;case"Node.js":this.log("",`❗️${this.name}, 错误!`,t.stack)}}wait(t){return new Promise(e=>setTimeout(e,t))}done(t={}){const e=(new Date).getTime(),s=(e-this.startTime)/1e3;switch(this.log("",`🔔${this.name}, 结束! 🕛 ${s} 秒`),this.log(),this.getEnv()){case"Surge":case"Loon":case"Stash":case"Shadowrocket":case"Quantumult X":default:$done(t);break;case"Node.js":process.exit(1)}}}(t,e)}
