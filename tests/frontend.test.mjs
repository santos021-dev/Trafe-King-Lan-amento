import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { signup } from '../server/handlers.js';
import { database, env } from './helpers.mjs';

const html = await fs.readFile(new URL('../index.html',import.meta.url),'utf8');
const script = await fs.readFile(new URL('../assets/js/lista.js',import.meta.url),'utf8');
function setup(fetchImpl) {
  const dom = new JSDOM(html,{url:env.SITE_URL,runScripts:'outside-only'});
  const {window} = dom;
  window.fetch = fetchImpl; window.AbortController = AbortController;
  window.eval(script);
  const form = window.document.querySelector('[data-waitlist]');
  form.elements.name.value='Teste Navegador'; form.elements.email.value='browser@example.com';
  return {dom,window,form,status:window.document.querySelector('#wait-status'),
    button:form.querySelector('button'),submit:()=>form.dispatchEvent(new window.Event('submit',{cancelable:true}))};
}
async function settled(form) {
  for(let i=0;i<150;i++) {
    if(!form.hasAttribute('aria-busy')) return;
    await new Promise(resolve=>setTimeout(resolve,10));
  }
  throw new Error('Form timeout');
}

test('navegador → endpoint → PostgreSQL → resposta → mensagem: fluxo completo local', async () => {
  const db = await database();
  let captured;
  const ui = setup(async (url,init) => {
    captured=JSON.parse(init.body);
    return signup(new Request(env.SITE_URL+url,{...init,headers:{...init.headers,Origin:env.SITE_URL}}),{db,env});
  });
  try {
    ui.submit(); await settled(ui.form);
    assert.match(ui.status.textContent,/Solicitação recebida/);
    const rows = await db.query('SELECT * FROM waitlist.subscribers');
    assert.equal(rows.rows.length,1); assert.equal(rows.rows[0].email,'browser@example.com');
    assert.equal(captured.website,''); assert.equal(captured.consentVersion,'2026-11-15.v1');
    assert.equal(ui.form.elements.email.value,'');
  } finally { ui.dom.window.close(); await db.close(); }
});

test('sucesso só aparece depois do servidor; submissões simultâneas são impedidas', async () => {
  let resolve, calls=0;
  const ui = setup(()=>{calls++;return new Promise(r=>{resolve=r;});});
  try {
    ui.submit(); ui.submit();
    assert.equal(calls,1); assert.equal(ui.button.disabled,true);
    assert.match(ui.status.textContent,/Enviando/); assert.doesNotMatch(ui.status.textContent,/recebida/);
    resolve(Response.json({ok:true})); await settled(ui.form);
    assert.match(ui.status.textContent,/Solicitação recebida/);
  } finally {ui.dom.window.close();}
});

for(const [label, response] of [
  ['erro do banco',()=>Response.json({ok:false,message:'PRIVATE STACK'},{status:503})],
  ['falso ok string',()=>Response.json({ok:'true'})],
  ['HTML de proxy',()=>new Response('<h1>Unavailable</h1>',{status:502})],
  ['falha de rede',()=>Promise.reject(new Error('network'))],
  ['ok com status de erro',()=>Response.json({ok:true},{status:500})]
]) test('front-end não mostra sucesso em '+label,async()=>{
  const ui=setup(response);
  try {
    ui.submit();await settled(ui.form);
    assert.doesNotMatch(ui.status.textContent,/Solicitação recebida|PRIVATE STACK|não foi salvo/);
    assert.match(ui.status.textContent,/Não foi possível confirmar/);
    assert.equal(ui.form.elements.email.value,'browser@example.com');
    assert.equal(ui.button.disabled,false);
  } finally {ui.dom.window.close();}
});

test('validação acessível impede envio de campo vazio',async()=>{
  let calls=0;const ui=setup(()=>{calls++;});
  try {
    ui.form.elements.name.value='';ui.submit();
    assert.equal(calls,0);assert.equal(ui.form.elements.name.getAttribute('aria-invalid'),'true');
    assert.equal(ui.window.document.activeElement,ui.form.elements.name);
  }finally{ui.dom.window.close();}
});
