const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const D=require('./fixtures/seed.cjs');
function fixture(){
 const a={id:'admin',name:'Administrador',role:'Administrador',active:true},op={id:'operator',name:'Operador',role:'Operador de Captação',active:true};
 const s={version:1,users:[a,op],contacts:[],payments:[],lists:[{id:'list',name:'Entrada',contacts:[],imports:[]}],tasks:[],audit:[],campaigns:[]};
 D.ensureAutomations(s);D.ensureExtensions(s);return {s,a,op};
}
function contact(s,extra={}){const c={id:D.uid(),name:'Pessoa Teste',email:'pessoa@exemplo.com',phone:'',document:'',type:'PF',origin:'Site',funnel:'Inbound',stage:0,owner:'admin',created:new Date().toISOString(),history:[],...extra};s.contacts.push(c);return c}
function intake(s,a,extra={}){const r=D.saveIntake(s,a,{name:'Entrada do site',origin:'Site',direction:'Inbound',stage:2,owner:a.id,listId:'list',taskText:'Apresentar as obras sociais',days:2,...extra});D.activateIntake(s,a,r.id,true);return r}
function email(s,a,event,extra={}){const r=D.saveAutomation(s,a,{name:event,event,origin:'Site',direction:'Inbound',stage:event==='stage'?2:'',delayMinutes:0,subject:'Olá {{nome}}',body:'Etapa {{etapa}}',...extra});D.setAutomationActive(s,a,r.id,true);return r}

test('AJ-04 aplica ações antes do evento da etapa definitiva e reutiliza boas-vindas uma vez',()=>{
 let {s,a}=fixture();intake(s,a);email(s,a,'registered');email(s,a,'stage');const c=contact(s);
 D.audit(s,a,'Contato cadastrado',c.id,'Site · Inbound');D.processAutomations(s);
 assert.equal(c.stage,2);assert.equal(c.owner,a.id);assert.deepEqual(s.lists[0].contacts,[c.id]);assert.equal(s.tasks.length,1);assert.equal(s.tasks[0].owner,a.id);
 const expected=new Date(c.created);expected.setDate(expected.getDate()+2);assert.equal(s.tasks[0].due,D.month(expected)+'-'+String(expected.getDate()).padStart(2,'0'));
 assert.equal(s.automationRuns.length,2);assert.ok(s.automationRuns.every(r=>r.event.stage===2));
});

test('AJ-04 recarga e edição preservam tarefas, listas e mensagens sem repetir ações',()=>{
 let {s,a}=fixture();const r=intake(s,a);email(s,a,'registered');email(s,a,'stage');const c=contact(s);
 const e=D.audit(s,a,'Contato cadastrado',c.id);D.processAutomations(s);
 assert.equal(s.automationRuns.length,2);assert.ok(s.automationRuns.every(x=>x.status==='simulated'&&x.event.stage===2));
 assert.equal(s.tasks.length,1);assert.match(s.tasks[0].due,/^\d{4}-\d{2}-\d{2}$/);assert.equal(s.intakeRuns[0].rule.version,r.version);
 s=JSON.parse(JSON.stringify(s));D.ensureExtensions(s);D.applyIntake(s,c.id,e.id);D.audit(s,a,'Cadastro atualizado',c.id);D.processAutomations(s);
 assert.equal(s.tasks.length,1);assert.equal(s.automationRuns.length,2);assert.equal(s.campaigns.length,2);assert.equal(s.intakeRuns.length,1);
});

test('AJ-04 bloqueios operacionais e de e-mail preservam cadastro e ações elegíveis',()=>{
 const {s,a}=fixture();intake(s,a);email(s,a,'registered');s.lists=[];const c=contact(s,{email:'',phone:'86999999999'});
 D.audit(s,a,'Contato cadastrado',c.id);D.processAutomations(s);
 assert.equal(c.stage,2);assert.equal(s.tasks.length,1);assert.equal(s.intakeRuns[0].actions.find(x=>x.type==='Lista de entrada').status,'bloqueada');assert.equal(s.automationRuns[0].status,'blocked');assert.equal(s.contacts.length,1);
});

test('AJ-04 regras pausadas não se aplicam retroativamente e conflitos/permissões são validados',()=>{
 const {s,a,op}=fixture(),c=contact(s);D.audit(s,a,'Contato cadastrado',c.id);const r=intake(s,a);
 D.applyIntake(s,c.id,'outro-evento');assert.equal(s.tasks.length,0);
 assert.throws(()=>intake(s,a),/Já existe/);assert.throws(()=>D.saveIntake(s,op,{...r,owner:a.id}),/si mesmo/);
 const whatsapp=contact(s,{origin:'WhatsApp',funnel:'Outbound'});email(s,a,'registered');D.audit(s,a,'Contato cadastrado',whatsapp.id);assert.equal(s.automationRuns.length,0);
});

test('AJ-04 recuperação executa só falhas e preserva histórico, tarefa única e ações realizadas',()=>{
 const {s,a}=fixture();intake(s,a);const c=contact(s);
 s.tasks.unshift=()=>{throw Error('Falha temporária de gravação')};D.audit(s,a,'Contato cadastrado',c.id);
 const run=s.intakeRuns[0];assert.equal(run.actions.find(x=>x.type==='Acompanhamento').status,'falha');assert.equal(s.lists[0].contacts.length,1);
 delete s.tasks.unshift;D.retryIntake(s,a,run.id);assert.equal(s.tasks.length,1);assert.equal(s.lists[0].contacts.length,1);assert.equal(s.intakeRuns.length,1);assert.equal(run.attempts[0].actions[0].previous.status,'falha');assert.equal(run.actions.find(x=>x.type==='Acompanhamento').status,'realizada');
 assert.throws(()=>D.retryIntake(s,a,run.id),/Somente/);
});

test('AJ-05 suspensão preserva débitos vencidos antes do início e não recria intervalo na retomada',()=>{
 const {s,a}=fixture();const c=contact(s,{created:'2020-01-01T12:00:00Z',plan:{mode:'Recorrente',amount:100,due:10,since:'2020-01',status:'Ativo'}});
 D.changeStatus(s,a,c.id,{status:'Suspenso',date:'2020-03-05',reason:'Interrupção institucional'});
 assert.deepEqual(D.pending(s,new Date('2020-05-20T12:00:00')).map(x=>x.period),['2020-01','2020-02']);
 const before=JSON.stringify(c);assert.throws(()=>D.changeStatus(s,a,c.id,{status:'Ativo',date:'2020-02-31',reason:'Retomar'}));assert.equal(JSON.stringify(c),before);
 D.changeStatus(s,a,c.id,{status:'Ativo',date:'2020-05-10',reason:'Retomar'});
 assert.deepEqual(D.pending(s,new Date('2020-06-20T12:00:00')).map(x=>x.period),['2020-01','2020-02','2020-05','2020-06']);
 D.reconcile(s,a,new Date('2020-06-20T12:00:00'));assert.equal(c.plan.status,'Ativo');
 const copy=JSON.parse(JSON.stringify(s));assert.deepEqual(D.pending(copy,new Date('2020-06-20T12:00:00')),D.pending(s,new Date('2020-06-20T12:00:00')));
});

test('AJ-05 competência é mantida se vencimento precede suspensão e recebimento não reativa',()=>{
 const {s,a}=fixture();const c=contact(s,{created:'2020-01-01T12:00:00Z',plan:{mode:'Recorrente',amount:100,due:10,since:'2020-01',status:'Ativo'}});
 D.changeStatus(s,a,c.id,{status:'Suspenso',date:'2020-01-11',reason:'Suspensão após vencimento'});
 assert.deepEqual(D.pending(s,new Date('2020-02-20T12:00:00')).map(x=>x.period),['2020-01']);
 D.payment(s,a,{contactId:c.id,amount:100,date:'2020-02-01',period:'2020-01',destination:'Obras sociais',pix:'PIX-SUSPENSO'});assert.equal(c.plan.status,'Suspenso');
 D.changeStatus(s,a,c.id,{status:'Ativo',date:'2020-02-11',reason:'Retorno após vencimento'});
 assert.equal(D.pending(s,new Date('2020-02-20T12:00:00')).length,0);
});

test('AJ-05 suspensão cancela solicitações automáticas e mantém agradecimentos',()=>{
 const {s,a}=fixture();const c=contact(s,{created:'2020-01-01T12:00:00Z',stage:2,plan:{mode:'Recorrente',amount:100,due:10,since:'2020-01',status:'Ativo'}});
 email(s,a,'registered',{delayMinutes:60});email(s,a,'payment');D.audit(s,a,'Contato cadastrado',c.id);
 D.changeStatus(s,a,c.id,{status:'Suspenso',date:D.today(),reason:'Suspender'});assert.equal(s.automationRuns[0].status,'cancelled');
 D.payment(s,a,{contactId:c.id,amount:100,date:D.today(),period:D.month(),destination:'Obras sociais',pix:'PIX-THANKS'});D.processAutomations(s);
 assert.equal(s.automationRuns.find(r=>r.event.type==='payment').status,'simulated');assert.equal(c.plan.status,'Suspenso');
});

test('AJ-06 segmenta por recebimento efetivo, status e período inclusivo sem duplicar contatos',()=>{
 const {s,a}=fixture();const c=contact(s,{plan:{status:'Suspenso',mode:'Recorrente'}}),other=contact(s,{email:'outro@exemplo.com'});
 s.payments=[{contactId:c.id,date:'2020-02-01',amount:50,destination:'Sopa Fraterna'},{contactId:c.id,date:'2020-02-28',amount:100,destination:'Sopa Fraterna'}];
 assert.deepEqual(D.segmentContacts(s,{status:'Suspenso',destination:'Sopa Fraterna',start:'2020-02-01',end:'2020-02-28'}).map(c=>c.id),[c.id]);
 assert.equal(D.segmentContacts(s,{start:'2020-02-01',end:'2020-02-01'}).length,1);assert.throws(()=>D.segmentContacts(s,{start:'2020-03-01',end:'2020-02-01'}));
 assert.equal(D.addToList(s,a,'list',[c.id,c.id,other.id,'inexistente']),2);assert.equal(D.addToList(s,a,'list',[c.id]),0);assert.equal(D.segmentContacts(s,{},s.lists[0].contacts).length,0);
});

test('AJ-07 adesão sem pagamento recebe condição calculada e primeiro recebimento a remove',()=>{
 const {s,a}=fixture();const c=contact(s);assert.equal(D.enrolled(s,c),false);
 D.convert(s,a,c.id,{mode:'Recorrente',amount:100,due:10});assert.equal(D.enrolled(s,c),true);assert.ok(c.plan.adheredAt);assert.equal(s.payments.length,0);
 assert.equal(D.segmentContacts(s,{enrolled:'yes'}).length,1);
 D.payment(s,a,{contactId:c.id,amount:10,date:D.today(),period:D.month(),destination:'Obras sociais',pix:'PIX-FIRST'});assert.equal(D.enrolled(s,c),false);
 assert.equal(D.segmentContacts(s,{enrolled:'yes'}).length,0);
});

test('AJ-08 simulação e reenvio preservam destinatário, documento e histórico sem novo financeiro',()=>{
 const {s,a}=fixture();const c=contact(s,{plan:{mode:'Pontual',amount:100,since:'2020-01',status:'Ativo'}});
 const p=D.payment(s,a,{contactId:c.id,amount:100,date:D.today(),period:D.month(),destination:'Obras sociais',pix:'PIX-RECEIPT'});
 const d={recipient:'alternativo@exemplo.com',subject:'Seu recibo',body:'Obrigado'};
 const first=D.sendReceipt(s,a,p.id,d);D.sendReceipt(s,a,p.id,d);assert.equal(s.payments.length,1);assert.equal(s.receiptSends.length,2);assert.equal(c.email,'pessoa@exemplo.com');assert.equal(first.receipt,p.receipt);assert.equal(first.status,'simulated');assert.equal(first.snapshot.amount,100);assert.ok(!first.snapshot.attachment);
 p.amount=200;assert.equal(first.snapshot.amount,100);c.optOut=true;assert.throws(()=>D.sendReceipt(s,a,p.id,d),/descadastrado/);assert.equal(s.receiptSends.length,2);
 c.optOut=false;assert.throws(()=>D.sendReceipt(s,a,p.id,{...d,recipient:'inválido'}));assert.equal(s.payments.length,1);
});

test('AJ-09 relatório usa os mesmos filtros e representa período vazio sem reaproveitar totais',()=>{
 const {s}=fixture();const c=contact(s,{stage:2}),d=contact(s,{stage:0});s.payments=[{contactId:c.id,date:'2020-01-02',amount:100,mode:'Pontual'},{contactId:d.id,date:'2020-01-03',amount:200,mode:'Recorrente'}];
 assert.equal(D.reportData(s,{period:'2020-01',stage:'2',mode:'Pontual'}).total,100);assert.equal(D.reportData(s,{period:'2020-01',stage:'0'}).total,200);
 assert.equal(D.reportData(s,{period:'2020-02'}).total,0);assert.equal(D.reportData(s,{period:'2020-02'}).payments.length,0);
});

test('Telas mostram novos controles e escapam texto de regras e tarefas',()=>{
 const {s,a}=fixture();const c=contact(s);D.convert(s,a,c.id,{mode:'Pontual',amount:100});const rule=intake(s,a,{name:'<script>regra</script>',taskText:'<img src=x>'});D.audit(s,a,'Contato cadastrado',c.id);
 let html='';const nodes={'#modal':{addEventListener(){}}};const context=vm.createContext({CRM:D,fixture:s,actor:a,document:{addEventListener(){},querySelector(q){return nodes[q]||{addEventListener(){}}}},capture(x){html=x}});
 vm.runInContext(fs.readFileSync(require.resolve('./fixtures/prototype-app.cjs'),'utf8').split("['pointerdown','keydown']")[0],context);
 const run=code=>vm.runInContext(code,context);run('state=fixture;user=actor;modal=(title,body)=>capture(body);');
 run('capture(intakeRulesHTML())');assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>regra/);
 run(`profile('${c.id}')`);assert.match(html,/Sócio Inscrito/);assert.match(html,/Nenhuma doação financeira registrada/);assert.match(html,/Resultado do pós-cadastro/);assert.match(html,/&lt;img src=x&gt;/);
 run("page='reports';capture(reports())");assert.match(html,/Exportar CSV/);assert.match(html,/Exportar PDF/);
 run("user={role:'Operador de Captação'}");assert.throws(()=>run('reportPrint()'),/restrit|Administrador|administrador/i);
});
