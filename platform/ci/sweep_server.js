// A static file server for the browser sweeps, on 127.0.0.1 and a free port.
//
// Why: 1,384 of 1,408 venture index.html pages load their code with
// <script type="module">, and Chromium refuses module scripts from file://
// (CORS, origin "null"). A sweep that opens pages as file:// therefore tests
// a page whose code never ran: on 2026-11-19 the textarea sweep clicked a run
// button on 609 pages and saw 4 of them change. Serving the repository root
// over http:// makes the modules load. Used by check_textarea_edges.js,
// check_input_edges.js and check_page_runtime.js.
//
//   const {serve} = require('./sweep_server.js');
//   const srv = await serve(process.cwd());   // srv.url('ventures/x/index.html'), srv.close()
const http=require('http');const fs=require('fs');const path=require('path');
const TYPES={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.cjs':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif','.webp':'image/webp','.ico':'image/x-icon','.wasm':'application/wasm','.txt':'text/plain; charset=utf-8','.csv':'text/csv; charset=utf-8','.xml':'application/xml','.webmanifest':'application/manifest+json','.woff2':'font/woff2','.md':'text/plain; charset=utf-8'};
function serve(root){
  root=path.resolve(root);
  const server=http.createServer((req,res)=>{
    let p;try{p=decodeURIComponent(new URL(req.url,'http://x').pathname);}catch{res.writeHead(400);return res.end();}
    let f=path.join(root,p);
    if(f!==root&&!f.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
    try{if(fs.statSync(f).isDirectory())f=path.join(f,'index.html');}catch{}
    fs.readFile(f,(err,buf)=>{
      if(err){res.writeHead(404);return res.end();}
      res.writeHead(200,{'content-type':TYPES[path.extname(f).toLowerCase()]||'application/octet-stream'});res.end(buf);
    });
  });
  return new Promise((resolve)=>server.listen(0,'127.0.0.1',()=>{
    const base=`http://127.0.0.1:${server.address().port}/`;
    resolve({base,url:(rel)=>base+rel.split(path.sep).map(encodeURIComponent).join('/'),close:()=>new Promise(r=>server.close(r))});
  }));
}
module.exports={serve};
