const {test}=require('node:test'),assert=require('node:assert/strict'),D=require('./fixtures/seed.cjs');
function fixture(){
 const s=D.seed(),operator={id:'operator',name:'Operador Teste',role:'Operador de Captação',active:true},admin={id:'admin',name:'Admin Teste',role:'Administrador',active:true};
 s.users=[admin,operator];D.ensureAutomations(s);return {s,operator,admin,c:s.contacts.find(c=>!c.plan&&c.funnel==='Inbound')};
}
function rule(s,a,extra={}){const r=D.saveAutomation(s,a,{name:'Regra teste',event:'registered',origin:'',direction:'Inbound',stage:'',delayMinutes:0,subject:'Olá, {{nome}}',body:'Origem: {{origem}}. Etapa: {{etapa}}.',...extra});D.setAutomationActive(s,a,r.id,true);return r}
function register(s,a,c){return D.audit(s,a,'Contato cadastrado',c.id,c.origin+' · '+c.funnel)}

test('Administrador e Operador configuram; acesso inativo ou perfil inválido não configura',()=>{
 const {s,admin,operator}=fixture();
 for(const a of [admin,operator]){const r=rule(s,a);assert.equal(r.updatedBy,a.id);D.setAutomationActive(s,a,r.id,false);assert.equal(r.active,false)}
 for(const a of [{...operator,role:'Visitante'},{...operator,id:'inexistente'},null])assert.throws(()=>rule(s,a));
 operator.active=false;assert.throws(()=>rule(s,operator));
});
test('Modelos iniciais pausados e ativação sem disparo retroativo nem alteração dos dados existentes',()=>{
 const {s,operator}=fixture(),contacts=JSON.stringify(s.contacts),payments=JSON.stringify(s.payments);
 assert.equal(s.automations.length,3);assert.ok(s.automations.every(r=>!r.active));
 for(const r of s.automations)D.setAutomationActive(s,operator,r.id,true);
 D.ensureAutomations(s);D.processAutomations(s);assert.equal(s.automationRuns.length,0);
 assert.equal(JSON.stringify(s.contacts),contacts);assert.equal(JSON.stringify(s.payments),payments);
});
test('Cadastro Inbound dispara uma vez e edições não repetem as boas-vindas',()=>{
 const {s,operator,c}=fixture();rule(s,operator);const e=register(s,operator,c);
 assert.equal(s.automationRuns.length,1);const r=s.automationRuns[0];
 D.queueAutomations(s,{id:e.id,contactId:c.id,type:'registered',at:e.at,stage:c.stage});
 D.audit(s,operator,'Cadastro atualizado',c.id);D.processAutomations(s);D.processAutomations(s);
 assert.equal(s.automationRuns.length,1);assert.equal(r.status,'simulated');
 assert.match(r.subject,new RegExp(c.name));assert.match(r.body,new RegExp(c.origin));
 assert.equal(s.campaigns.filter(m=>m.automationRunId===r.id).length,1);
 assert.equal(c.history.find(h=>h.action==='Automação: envio simulado').actor,'system');
 c.funnel='Outbound';register(s,operator,c);assert.equal(s.automationRuns.length,1);
});
test('Intervalo persiste na recarga, evita antecipação e mantém exatamente um envio por evento',()=>{
 let {s,operator,c}=fixture();rule(s,operator,{delayMinutes:60});register(s,operator,c);
 let r=s.automationRuns[0];assert.equal(Date.parse(r.dueAt)-Date.parse(r.scheduledAt),3600000);
 D.processAutomations(s,new Date(Date.parse(r.dueAt)-1));assert.equal(r.status,'scheduled');
 s=JSON.parse(JSON.stringify(s));D.ensureAutomations(s);r=s.automationRuns[0];
 D.processAutomations(s,new Date(r.dueAt));assert.equal(r.status,'simulated');
 D.processAutomations(s,new Date(r.dueAt));assert.equal(s.campaigns.filter(m=>m.automationRunId===r.id).length,1);
});
test('Simular agora antecipa somente a execução escolhida',()=>{
 const {s,operator,c}=fixture();rule(s,operator,{delayMinutes:60});register(s,operator,c);register(s,operator,c);
 const [a,b]=s.automationRuns;D.processAutomations(s,new Date(),a.id);
 assert.equal(a.status,'simulated');assert.equal(b.status,'scheduled');
});
test('Pausar e editar cancelam pendências; reativar não recria eventos anteriores',()=>{
 const {s,operator,c}=fixture(),r=rule(s,operator,{delayMinutes:60});register(s,operator,c);
 D.setAutomationActive(s,operator,r.id,false);assert.equal(s.automationRuns[0].status,'cancelled');
 D.setAutomationActive(s,operator,r.id,true);D.processAutomations(s,new Date(Date.now()+7200000));assert.equal(s.automationRuns[0].status,'cancelled');
 register(s,operator,c);const snapshot=s.automationRuns[0].rule.subject;
 D.saveAutomation(s,operator,{...r,subject:'Outro assunto'},r.id);
 assert.equal(r.active,false);assert.equal(s.automationRuns[0].status,'cancelled');assert.equal(s.automationRuns[0].rule.subject,snapshot);
});
test('Descadastro, e-mail inválido e mudança de origem bloqueiam o envio no momento da execução',()=>{
 for(const change of [c=>c.optOut=true,c=>c.email='',c=>c.origin='Evento']){
  const {s,operator,c}=fixture();c.origin='Site';rule(s,operator,{origin:'Site',delayMinutes:10});register(s,operator,c);
  change(c);const r=s.automationRuns[0];D.processAutomations(s,new Date(),r.id);
  assert.equal(r.status,'blocked');assert.ok(r.detail);assert.equal(s.campaigns.filter(m=>m.automationRunId===r.id).length,0);
 }
});
test('Saída cancela cadência e retomada cria novo evento sem ressuscitar os envios cancelados',()=>{
 const {s,operator,c}=fixture();rule(s,operator,{event:'stage',direction:'',delayMinutes:60});
 const next=(c.stage+1)%4;D.move(s,operator,c.id,next);assert.equal(s.automationRuns.length,1);
 D.exitCadence(s,operator,c.id,{reason:'Sem retorno',date:D.today()});assert.equal(s.automationRuns[0].status,'cancelled');
 D.resumeCadence(s,operator,c.id,next,'Retomada');assert.equal(s.automationRuns.length,2);assert.equal(s.automationRuns[0].status,'scheduled');
 D.processAutomations(s,new Date(),s.automationRuns[0].id);assert.equal(s.automationRuns[0].status,'simulated');assert.equal(s.automationRuns[1].status,'cancelled');
});
test('Etapa e condições filtram o evento; mudança de etapa posterior bloqueia a mensagem antiga',()=>{
 const {s,operator,c}=fixture();rule(s,operator,{event:'stage',stage:1,delayMinutes:60});
 c.stage=0;D.move(s,operator,c.id,1);assert.equal(s.automationRuns.length,1);
 D.move(s,operator,c.id,2);assert.equal(s.automationRuns.length,1);
 D.processAutomations(s,new Date(),s.automationRuns[0].id);assert.equal(s.automationRuns[0].status,'blocked');
});
test('Contribuição dispara agradecimento, preserva recibo e não envia anexo ou duplica financeiro',()=>{
 const {s,operator}=fixture(),c=s.contacts.find(c=>c.plan),r=rule(s,operator,{event:'payment',direction:'',body:'Obrigado, {{nome}}! {{valor}} · {{recibo}}'});
 D.exitCadence(s,operator,c.id,{reason:'Momento inadequado',date:D.today()});
 const before=s.payments.length,p=D.payment(s,operator,{contactId:c.id,amount:30,date:D.today(),period:D.month(),destination:D.DESTINATIONS[0],pix:'PIX-AUTO-TEST'});
 const run=s.automationRuns[0];assert.equal(run.ruleId,r.id);assert.equal(run.event.paymentId,p.id);
 D.processAutomations(s);assert.equal(run.status,'simulated');assert.match(run.body,new RegExp(p.receipt));assert.match(run.body,/30,00/);
 assert.equal(s.payments.length,before+1);assert.equal(run.attachment,undefined);
 assert.throws(()=>D.payment(s,operator,{...p}));assert.equal(s.automationRuns.length,1);
});
test('Falha por variável ausente preserva tentativas e só permite nova tentativa após corrigir o dado',()=>{
 const {s,operator,c}=fixture();rule(s,operator);register(s,operator,c);c.name='';const run=s.automationRuns[0];
 D.processAutomations(s);assert.equal(run.status,'failed');assert.equal(run.attempts.length,1);assert.match(run.detail,/nome/);
 c.name='Nome corrigido';D.retryAutomation(s,operator,run.id);D.processAutomations(s);
 assert.equal(run.status,'simulated');assert.equal(run.attempts.length,2);assert.ok(run.transitions.some(t=>t.status==='failed'));
 assert.throws(()=>D.retryAutomation(s,operator,run.id));
 assert.equal(s.campaigns.filter(m=>m.automationRunId===run.id).length,1);
});
test('Valida modelos e intervalos antes de modificar regras ou cancelar envios',()=>{
 const {s,operator,c}=fixture(),r=rule(s,operator,{delayMinutes:60});register(s,operator,c);const before=JSON.stringify(s);
 for(const data of [{body:'Olá {{inexistente}}'},{body:'{{valor}}'},{body:'Olá {{nome'},{subject:''},{delayMinutes:-1},{delayMinutes:Infinity},{event:'desconhecido'},{stage:99}])assert.throws(()=>D.saveAutomation(s,operator,{...r,...data},r.id));
 assert.equal(JSON.stringify(s),before);
});
test('Tela e revisão estão disponíveis para Operador e escapam o texto dos modelos',()=>{
 const vm=require('node:vm'),fs=require('node:fs'),{s,operator,c}=fixture();
 const r=rule(s,operator,{subject:'<script>{{nome}}</script>'});register(s,operator,c);D.processAutomations(s);
 const context=vm.createContext({CRM:D,document:{addEventListener(){},querySelector(){return {addEventListener(){}}}},fixture:s,operator});
 vm.runInContext(fs.readFileSync(require.resolve('./fixtures/prototype-app.cjs'),'utf8').split("['pointerdown','keydown']")[0],context);
 const run=code=>vm.runInContext(code,context);run("state=fixture;user=operator;page='emails';emailTab='automations'");
 const html=run('content()');assert.match(html,/Nova automação/);assert.match(html,/automation-edit/);assert.match(html,/automation-pause/);assert.match(html,/Envio simulado/);assert.doesNotMatch(html,/<script>/);
 let body='';context.capture=value=>body=value;run("modal=(title,html)=>capture(html)");run('automationRunDetail(state.automationRuns[0].id)');assert.match(body,/Sistema/);assert.match(body,/&lt;script&gt;/);
 assert.equal(r.active,true);
});
test('Operador conclui as duas etapas do formulário e ativa a regra pela revisão',()=>{
 const vm=require('node:vm'),fs=require('node:fs'),{s,operator,c}=fixture();
 const nodes={};for(const name of ['event','origin','stage','direction','subject','body','delay','unit'])nodes['[name='+name+']']={value:'',closest(){return this}};
 nodes['[data-action=automation-back]']={};nodes['[data-action=automation-activate]']={};nodes['#modal']={addEventListener(){},querySelector(s){return nodes[s]}};
 let submit,formHtml='',preview='';
 const context=vm.createContext({CRM:D,document:{addEventListener(){},querySelector(s){return nodes[s]||{addEventListener(){}}}},fixture:s,operator,captureForm(html,fn){formHtml=html;submit=fn},captureModal(html){preview=html}});
 const run=code=>vm.runInContext(code,context);
 run(fs.readFileSync(require.resolve('./fixtures/prototype-app.cjs'),'utf8').split("['pointerdown','keydown']")[0]);
 run("state=fixture;user=operator;formModal=(title,body,fn)=>captureForm(body,fn);modal=(title,body)=>captureModal(body);save=()=>D.processAutomations(state);render=()=>{};closeModal=()=>{};activeUser=()=>{};toast=()=>{};automationForm()");
 assert.match(formHtml,/1 de 2/);
 nodes['[name=event]'].value='stage';nodes['[name=origin]'].value='Instagram';nodes['[name=stage]'].value='1';nodes['[name=event]'].onchange();
 assert.equal(nodes['[name=direction]'].disabled,true);assert.equal(nodes['[name=direction]'].value,'Inbound');
 submit({name:'Regra do operador',event:'stage',origin:'Instagram',stage:'1'});assert.match(formHtml,/2 de 2/);
 submit({subject:'Olá {{nome}}',body:'Continuar conversa',delay:'2',unit:'60'});
 const rule=s.automations.find(r=>r.name==='Regra do operador');assert.equal(rule.delayMinutes,120);assert.equal(rule.active,false);assert.equal(rule.direction,'Inbound');assert.equal(rule.stage,1);assert.match(preview,/Maria Exemplo/);
 nodes['[data-action=automation-activate]'].onclick({stopPropagation(){}});assert.equal(rule.active,true);
 c.origin='Instagram';c.stage=0;D.move(s,operator,c.id,1);assert.equal(s.automationRuns[0].status,'scheduled');
 assert.equal(s.automationRuns[0].rule.updatedBy,operator.id);
});
