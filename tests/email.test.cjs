const {test}=require('node:test'),assert=require('node:assert/strict');
const D=require('./fixtures/seed.cjs');
function fixture(){
 const a={id:'admin',name:'Admin',role:'Administrador',active:true},op={id:'operator',name:'Operador',role:'Operador de Captação',active:true};
 const s={users:[a,op],contacts:[{id:'lead',name:'Pessoa Teste',email:'pessoa@exemplo.com',origin:'Site',funnel:'Inbound',stage:0,history:[],created:new Date().toISOString()}],payments:[],lists:[],tasks:[],audit:[],campaigns:[]};
 D.ensureMailings(s);return {s,a,op,c:s.contacts[0]};
}
function create(s,a,extra={}){return D.saveMailing(s,a,{subject:'Novidades',body:'Nossa mensagem',kind:'once',contacts:['lead'],startAt:'',...extra})}
const start=()=>new Date(2030,0,31,10,15);

test('E-mail único exige revisão, executa uma vez e persiste concluído após recarga',()=>{
 let {s,a}=fixture();const m=create(s,a);assert.equal(m.status,'draft');D.processMailings(s,start());assert.equal(s.mailingRuns.length,0);
 D.setMailingStatus(s,a,m.id,'active',start());D.processMailings(s,start());D.processMailings(s,start());
 assert.equal(m.status,'completed');assert.equal(s.mailingRuns.length,1);assert.equal(s.campaigns.length,1);assert.equal(s.mailingRuns[0].status,'simulated');
 assert.equal(s.contacts[0].history[0].actor,'system');s=JSON.parse(JSON.stringify(s));D.processMailings(s,new Date(2030,2,1));assert.equal(s.mailingRuns.length,1);
 assert.throws(()=>D.setMailingStatus(s,a,m.id,'active'),/concluído/);
});

test('Agendamento único não antecipa e simulação escolhida não dispara outros e-mails',()=>{
 const {s,a}=fixture(),now=start(),future=new Date(now.getTime()+3600000),m=create(s,a,{startAt:future.toISOString()}),other=create(s,a,{startAt:future.toISOString()});
 D.setMailingStatus(s,a,m.id,'active',now);D.setMailingStatus(s,a,other.id,'active',now);D.processMailings(s,now);assert.equal(s.mailingRuns.length,0);
 D.processMailings(s,now,m.id);assert.equal(s.mailingRuns.length,1);assert.equal(m.status,'completed');assert.equal(other.status,'active');
 D.processMailings(s,future);assert.equal(s.mailingRuns.length,2);
});

test('Recorrências diária, semanal e mensal calculam próximos horários por calendário',()=>{
 for(const [frequency,day,month] of [['daily',1,1],['weekly',7,1],['monthly',28,1]]){
  const {s,a}=fixture(),now=start(),m=create(s,a,{kind:'recurring',frequency});D.setMailingStatus(s,a,m.id,'active',now);D.processMailings(s,now);
  const next=new Date(m.nextAt);assert.equal(next.getDate(),day);assert.equal(next.getMonth(),month);assert.equal(next.getHours(),10);assert.equal(next.getMinutes(),15);assert.equal(m.status,'active');
 }
 const m={anchorAt:start().toISOString(),frequency:'monthly'};assert.equal(D.mailingOccurrence(m,2).getDate(),31);assert.equal(D.mailingOccurrence(m,2).getMonth(),2);
 m.anchorAt=new Date(2032,0,31,10).toISOString();assert.equal(D.mailingOccurrence(m,1).getDate(),29);
});

test('Reabrir após vários períodos executa uma ocorrência e ignora o atraso sem rajada',()=>{
 let {s,a}=fixture();const m=create(s,a,{kind:'recurring',frequency:'daily'});D.setMailingStatus(s,a,m.id,'active',start());D.processMailings(s,start());
 s=JSON.parse(JSON.stringify(s));const reopened=new Date(2030,1,10,11);D.processMailings(s,reopened);D.processMailings(s,reopened);
 assert.equal(s.mailingRuns.length,2);assert.ok(s.mailingRuns[0].skipped>=8);assert.ok(Date.parse(s.mailings[0].nextAt)>reopened.getTime());assert.equal(s.campaigns.length,2);
});

test('Recorrência semanal espera o dia escolhido e preserva dia e horário após recarga',()=>{
 let {s,a}=fixture();const now=new Date(2030,0,31,10,15),weekday=(now.getDay()+3)%7,m=create(s,a,{kind:'recurring',frequency:'weekly',weekday});
 D.setMailingStatus(s,a,m.id,'active',now);let due=new Date(m.nextAt);assert.equal(due.getDay(),weekday);assert.equal(due.getDate(),3);assert.equal(due.getMonth(),1);assert.equal(due.getHours(),10);
 D.processMailings(s,now);assert.equal(s.mailingRuns.length,0);D.processMailings(s,due);assert.equal(s.mailingRuns.length,1);
 s=JSON.parse(JSON.stringify(s));due=new Date(s.mailings[0].nextAt);assert.equal(due.getDay(),weekday);assert.equal(due.getHours(),10);assert.equal(due.getMinutes(),15);
 D.processMailings(s,due);assert.equal(s.mailingRuns.length,2);
});

test('Dia semanal alinha agendamento, aceita domingo e valida término e dia inválido',()=>{
 const {s,a}=fixture(),now=new Date(2030,0,31,10),scheduled=new Date(2030,1,1,14,30),m=create(s,a,{kind:'recurring',frequency:'weekly',weekday:'0',startAt:scheduled.toISOString()});
 D.setMailingStatus(s,a,m.id,'active',now);const due=new Date(m.nextAt);assert.equal(due.getDay(),0);assert.equal(due.getDate(),3);assert.equal(due.getHours(),14);assert.equal(due.getMinutes(),30);
 for(const weekday of [-1,7,'inválido',1.5])assert.throws(()=>create(s,a,{kind:'recurring',frequency:'weekly',weekday}));
 assert.throws(()=>create(s,a,{kind:'recurring',frequency:'weekly',weekday:0,startAt:scheduled.toISOString(),endDate:'2030-02-02'}));
 const legacy=create(s,a,{kind:'recurring',frequency:'weekly'});D.setMailingStatus(s,a,legacy.id,'active',now);assert.equal(legacy.nextAt,now.toISOString());
});

test('Pausa mantém primeiro envio futuro e retomada não recupera períodos passados',()=>{
 const {s,a}=fixture(),now=start(),scheduled=new Date(2030,1,1,10),m=create(s,a,{kind:'recurring',frequency:'weekly',startAt:scheduled.toISOString()});
 D.setMailingStatus(s,a,m.id,'active',now);D.setMailingStatus(s,a,m.id,'paused',now);D.setMailingStatus(s,a,m.id,'active',new Date(2030,0,31,11));assert.equal(m.nextAt,scheduled.toISOString());
 D.setMailingStatus(s,a,m.id,'paused',now);D.processMailings(s,new Date(2030,2,1));assert.equal(s.mailingRuns.length,0);
 D.setMailingStatus(s,a,m.id,'active',new Date(2030,2,1,11));assert.ok(Date.parse(m.nextAt)>new Date(2030,2,1,11).getTime());assert.equal(s.mailingRuns.length,0);
 D.setMailingStatus(s,a,m.id,'cancelled');assert.equal(m.nextAt,null);assert.throws(()=>D.setMailingStatus(s,a,m.id,'active'));
});

test('Mensal envia na ocorrência escolhida do dia da semana sem repetir no mesmo mês',()=>{
 let {s,a}=fixture();const now=new Date(2030,0,15,9,30),m=create(s,a,{kind:'recurring',frequency:'monthly',weekday:1,monthWeek:1});
 D.setMailingStatus(s,a,m.id,'active',now);const due=new Date(m.nextAt);assert.equal(due.getMonth(),1);assert.equal(due.getDay(),1);assert.ok(due.getDate()<=7);assert.equal(due.getHours(),9);assert.equal(due.getMinutes(),30);
 D.processMailings(s,now);assert.equal(s.mailingRuns.length,0);D.processMailings(s,due);assert.equal(s.mailingRuns.length,1);
 s=JSON.parse(JSON.stringify(s));const next=new Date(s.mailings[0].nextAt);assert.equal(next.getMonth(),2);assert.equal(next.getDay(),1);assert.ok(next.getDate()<=7);
 D.processMailings(s,next);D.processMailings(s,next);assert.equal(s.mailingRuns.length,2);
});

test('Mensal permite última sexta e quarta ocorrência, inclusive em fevereiro bissexto',()=>{
 for(const monthWeek of [-1,4]){
  const {s,a}=fixture(),now=new Date(2032,1,1,14,45),m=create(s,a,{kind:'recurring',frequency:'monthly',weekday:5,monthWeek});
  D.setMailingStatus(s,a,m.id,'active',now);const due=new Date(m.nextAt);assert.equal(due.getMonth(),1);assert.equal(due.getDay(),5);assert.ok(due.getDate()>=22&&due.getDate()<=29);assert.equal(due.getHours(),14);
  D.processMailings(s,due);const next=new Date(m.nextAt);assert.equal(next.getMonth(),2);assert.equal(next.getDay(),5);assert.ok(next.getDate()>=22);
 }
 const {s,a}=fixture();assert.throws(()=>create(s,a,{kind:'recurring',frequency:'monthly',weekday:1,monthWeek:5}));
 assert.throws(()=>create(s,a,{kind:'recurring',frequency:'monthly',weekday:1,monthWeek:1,startAt:new Date(2030,0,15,10).toISOString(),endDate:'2030-01-31'}));
});

test('Término é inclusivo; abertura após término não dispara mensagem vencida',()=>{
 const {s,a}=fixture(),m=create(s,a,{kind:'recurring',frequency:'daily',endDate:'2030-02-01'});D.setMailingStatus(s,a,m.id,'active',start());D.processMailings(s,start());
 D.processMailings(s,new Date(2030,1,1,10,15));assert.equal(s.mailingRuns.length,2);assert.equal(m.status,'completed');assert.equal(m.nextAt,null);
 const late=create(s,a,{kind:'recurring',frequency:'daily',endDate:'2030-02-01'});D.setMailingStatus(s,a,late.id,'active',start());D.processMailings(s,new Date(2030,1,2,10));assert.equal(s.mailingRuns.length,2);assert.equal(late.status,'completed');
});

test('Elegibilidade é revalidada por destinatário e recorrências respeitam perdas e suspensão',()=>{
 const {s,a,c}=fixture();s.contacts.push({...c,id:'outro',name:'Outro',email:'outro@exemplo.com',history:[]});
 const m=create(s,a,{kind:'recurring',frequency:'daily',contacts:['lead','outro','lead']});assert.equal(m.contacts.length,2);D.setMailingStatus(s,a,m.id,'active',start());
 c.optOut=true;D.processMailings(s,start());let run=s.mailingRuns[0];assert.equal(run.results[0].status,'blocked');assert.equal(run.results[1].status,'simulated');assert.equal(s.campaigns[0].contacts.length,1);
 c.optOut=false;c.cadenceExit={reason:'Sem interesse'};s.contacts[1].plan={status:'Suspenso'};D.processMailings(s,new Date(2030,1,1,10,15));run=s.mailingRuns[0];assert.equal(run.status,'blocked');assert.equal(s.campaigns.length,1);
 c.cadenceExit=null;c.email='novo@exemplo.com';s.contacts.pop();D.processMailings(s,new Date(2030,1,2,10,15));run=s.mailingRuns[0];assert.equal(run.results[0].recipient,'novo@exemplo.com');assert.match(run.results[1].detail,/não encontrado/);
});

test('Editar exige nova revisão e preserva conteúdo das execuções anteriores',()=>{
 const {s,a}=fixture(),m=create(s,a,{kind:'recurring',frequency:'daily'});D.setMailingStatus(s,a,m.id,'active',start());D.processMailings(s,start());
 const old={...s.mailingRuns[0]};D.saveMailing(s,a,{...m,subject:'Mensagem alterada'},m.id);assert.equal(m.status,'draft');assert.equal(m.nextAt,null);assert.equal(m.version,2);
 D.processMailings(s,new Date(2030,1,1));assert.equal(s.mailingRuns.length,1);assert.equal(s.mailingRuns[0].subject,old.subject);
 D.setMailingStatus(s,a,m.id,'active',new Date(2030,1,1));D.processMailings(s,new Date(2030,1,1));assert.equal(s.mailingRuns.length,2);assert.equal(s.mailingRuns[0].version,2);
});

test('Validação e permissões não alteram uma programação válida em caso de erro',()=>{
 const {s,a,op}=fixture();for(const user of [a,op])assert.equal(create(s,user).updatedBy,user.id);
 const m=create(s,a),before=JSON.stringify(m);
 for(const extra of [{subject:''},{body:''},{kind:'outro'},{kind:'recurring',frequency:'hourly'},{contacts:[]},{contacts:['inexistente']},{startAt:'inválido'},{kind:'recurring',frequency:'daily',endDate:'2030-02-31'}])assert.throws(()=>D.saveMailing(s,a,{...m,...extra},m.id));
 assert.equal(JSON.stringify(m),before);op.active=false;assert.throws(()=>create(s,op));assert.throws(()=>D.setMailingStatus(s,null,m.id,'active'));
 const expired=create(s,a,{kind:'recurring',frequency:'monthly',endDate:'2030-02-01'}),snapshot=JSON.stringify(expired);assert.throws(()=>D.setMailingStatus(s,a,expired.id,'active',new Date(2030,2,1)));assert.equal(JSON.stringify(expired),snapshot);
});

test('Nova tela centraliza automações e histórico anterior sem item Automações no menu',()=>{
 const fs=require('node:fs'),vm=require('node:vm'),{s,a}=fixture();D.ensureAutomations(s);D.ensureExtensions(s);s.campaigns.push({id:'antigo',subject:'Mensagem anterior',body:'Texto',contacts:['lead'],at:new Date().toISOString()});
 const nodes={'#app':{},'#modal':{addEventListener(){}}};const context=vm.createContext({CRM:D,fixture:s,actor:a,document:{documentElement:{dataset:{theme:'light'}},addEventListener(){},querySelector(q){return nodes[q]||{addEventListener(){}}}}});
 const run=code=>vm.runInContext(code,context);run(fs.readFileSync(require.resolve('./fixtures/prototype-app.cjs'),'utf8').split("['pointerdown','keydown']")[0]);
 run("state=fixture;user=actor;page='emails';bindPage=()=>{};render()");assert.match(nodes['#app'].innerHTML,/data-id="emails"/);assert.doesNotMatch(nodes['#app'].innerHTML,/data-id="automations"[^>]*aria-current/);assert.doesNotMatch(nodes['#app'].innerHTML,/nav-item[^>]*data-id="automations"/);
 run("emailTab='automations'");assert.match(run('content()'),/Tratamento pós-cadastro/);assert.match(run('content()'),/Nova automação/);
 run("emailTab='history'");assert.match(run('content()'),/Mensagem anterior/);
 const c=s.contacts[0];create(s,a,{subject:'<script>mensagem</script>'});run("emailTab='messages'");assert.match(run('content()'),/&lt;script&gt;/);assert.doesNotMatch(run('content()'),/<script>/);
});
