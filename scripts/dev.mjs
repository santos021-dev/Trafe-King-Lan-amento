import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { build, root } from './build.mjs';
import { signup, unsubscribe, privacyContact, processEmails } from '../server/handlers.js';
import { handleWebhook } from '../api/resend-webhook.js';
import { methodNotAllowed } from '../server/http.js';

build();
const routes = {
  '/api/lista-de-espera': request => request.method === 'POST'
    ? signup(request, { schedule: task => { void task(); } }) : methodNotAllowed('POST'),
  '/api/descadastro': request => request.method === 'POST' ? unsubscribe(request) : methodNotAllowed('POST'),
  '/api/privacidade': request => request.method === 'GET' ? privacyContact() : methodNotAllowed('GET'),
  '/api/processar-emails': request => ['GET','POST'].includes(request.method) ? processEmails(request) : methodNotAllowed('GET, POST'),
  '/api/resend-webhook': handleWebhook
};
const port = Number(process.env.PORT || 3000);
const base = 'http://localhost:' + port;
const dist = path.resolve(root, 'dist');
const types = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8',
  '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.svg':'image/svg+xml', '.woff2':'font/woff2', '.txt':'text/plain; charset=utf-8' };
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, base);
    let response;
    if (url.pathname.startsWith('/api/')) {
      const route = routes[url.pathname];
      if (!route) { res.writeHead(404); res.end(); return; }
      const request = new Request(url, { method:req.method, headers:req.headers,
        ...(!['GET','HEAD'].includes(req.method) ? { body:req, duplex:'half' } : {}) });
      response = await route(request);
    } else {
      if (!['GET','HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return; }
      let file = path.resolve(dist, '.' + decodeURIComponent(url.pathname));
      if (!file.startsWith(dist + path.sep) && file !== dist) { res.writeHead(403); res.end(); return; }
      if ((await fs.stat(file)).isDirectory()) file = path.join(file, 'index.html');
      const type = types[path.extname(file)];
      if (!type) { res.writeHead(404); res.end(); return; }
      response = new Response(await fs.readFile(file), { headers:{ 'Content-Type':type } });
    }
    res.writeHead(response.status, { ...Object.fromEntries(response.headers), 'X-Content-Type-Options':'nosniff', 'Referrer-Policy':'no-referrer' });
    res.end(req.method === 'HEAD' ? undefined : Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    res.writeHead(error.code === 'ENOENT' ? 404 : 500, { 'Content-Type':'application/json' });
    res.end(JSON.stringify({ ok:false, message:'Solicitação não concluída.' }));
  }
});
server.requestTimeout = 10000;
server.headersTimeout = 10000;
server.listen(port, '127.0.0.1', () => console.log('Trafe King. em ' + base + ' (banco real configurado por .env.local)'));
