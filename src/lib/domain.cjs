(function(root){
'use strict';
const STAGES=['Aprendizado e descoberta','Reconhecimento do problema','Consideração da solução','Decisão de doação'], ORIGINS=['Instagram','Site','Indicação','E-mail','Evento','WhatsApp'], DESTINATIONS=['Obras sociais','Sopa Fraterna','Reforço de Luz','Escola Esperança'];
const uid=()=>globalThis.crypto?.randomUUID?.()||'id-'+Date.now().toString(36)+Math.random().toString(36).slice(2);
const today=()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')};
const month=(date=new Date())=>typeof date==='string'?date.slice(0,7):date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0');
const emailValid=x=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x);
const AUTO_EVENTS={registered:'Cadastro Inbound',stage:'Entrada em etapa',payment:'Contribuição registrada'};
const AUTO_SYSTEM={id:'system',name:'Sistema'};
function ensureAutomations(s){
 if(!Array.isArray(s.automations))s.automations=[
  {id:'auto-welcome',name:'Boas-vindas',event:'registered',origin:'',direction:'Inbound',stage:'',delayMinutes:0,subject:'Bem-vindo(a), {{nome}}!',body:'Olá, {{nome}}! Obrigado por conhecer a Luz da Esperança. Será uma alegria caminhar com você.'},
  {id:'auto-stage',name:'Acompanhamento de etapa',event:'stage',origin:'',direction:'',stage:'',delayMinutes:1440,subject:'Vamos continuar nossa conversa, {{nome}}?',body:'Olá, {{nome}}! Queremos continuar nossa conversa sobre como você pode apoiar as obras sociais da Luz da Esperança.'},
  {id:'auto-thanks',name:'Agradecimento por contribuição',event:'payment',origin:'',direction:'',stage:'',delayMinutes:0,subject:'Obrigado por sua contribuição, {{nome}}!',body:'Olá, {{nome}}! Recebemos sua contribuição de {{valor}}. Obrigado por apoiar a Luz da Esperança.'}
 ].map(r=>({...r,active:false,version:1,updatedAt:new Date().toISOString(),updatedByName:'Sistema'}));
 if(!Array.isArray(s.automationRuns))s.automationRuns=[];
 return s;
}
function automationAccess(s,a){if(!a||!['Administrador','Operador de Captação'].includes(a.role)||!s.users.some(u=>u.id===a.id&&u.active&&u.role===a.role))throw Error('Entre com um acesso ativo para configurar automações.')}
function validateAutomation(d){
 const name=String(d.name||'').trim(),subject=String(d.subject||'').trim(),body=String(d.body||'').trim();
 if(!name||name.length>120||!subject||subject.length>180||!body||body.length>10000)throw Error('Informe nome, assunto e mensagem dentro dos limites.');
 if(!Object.hasOwn(AUTO_EVENTS,d.event)||d.origin&&!ORIGINS.includes(d.origin)||d.direction&&!['Inbound','Outbound'].includes(d.direction)||d.stage!==''&&(!Number.isInteger(Number(d.stage))||Number(d.stage)<0||Number(d.stage)>=STAGES.length))throw Error('Selecione evento e condições válidos.');
 if(d.event==='registered'&&d.direction&&d.direction!=='Inbound')throw Error('Boas-vindas se aplicam somente a cadastros Inbound.');
 if(['Site','Instagram'].includes(d.origin)&&d.direction==='Outbound')throw Error('Site e Instagram permitem somente Inbound.');
 const delayMinutes=Number(d.delayMinutes);
 if(!Number.isFinite(delayMinutes)||delayMinutes<0||delayMinutes>525600||!Number.isInteger(delayMinutes))throw Error('Defina um intervalo em minutos entre zero e um ano.');
 const allowed=['nome','origem','etapa',...(d.event==='payment'?['valor','recibo']:[])];
 for(const template of [subject,body]){
  const rest=template.replace(/\{\{\s*([a-z]+)\s*\}\}/g,(_,key)=>{if(!allowed.includes(key))throw Error('Variável não disponível: '+key);return ''});
  if(rest.includes('{{')||rest.includes('}}'))throw Error('Confira as variáveis da mensagem.');
 }
 return {name,event:d.event,origin:d.origin||'',direction:d.event==='registered'?'Inbound':d.direction||'',stage:d.event==='stage'&&d.stage!==''?Number(d.stage):'',delayMinutes,subject,body};
}
function finishAutomationRun(s,run,status,detail,at=new Date().toISOString()){
 run.status=status;run.detail=detail;run.updatedAt=at;
 (run.transitions??=[]).push({status,detail,at});
 audit(s,AUTO_SYSTEM,'Automação: '+({scheduled:'agendada',processing:'processada',simulated:'envio simulado',blocked:'bloqueada',failed:'falhou',cancelled:'cancelada'}[status]||status),run.contactId,run.rule.name+' · '+detail);
}
function cancelAutomationRuns(s,predicate,detail){
 ensureAutomations(s);
 for(const run of s.automationRuns)if(run.status==='scheduled'&&predicate(run))finishAutomationRun(s,run,'cancelled',detail);
}
function saveAutomation(s,a,data,id=''){
 automationAccess(s,a);const dataValid=validateAutomation(data);ensureAutomations(s);
 const existing=id?s.automations.find(r=>r.id===id):null;if(id&&!existing)throw Error('Automação não encontrada.');
 if(existing)cancelAutomationRuns(s,r=>r.ruleId===id,'Regra editada; revise e ative novamente.');
 const rule={...dataValid,id:existing?.id||uid(),active:false,version:(existing?.version||0)+1,updatedAt:new Date().toISOString(),updatedBy:a.id,updatedByName:a.name};
 if(existing)Object.assign(existing,rule);else s.automations.unshift(rule);
 audit(s,a,'Automação salva',null,rule.name+' · Pausada, aguardando revisão');return rule;
}
function setAutomationActive(s,a,id,active){
 automationAccess(s,a);ensureAutomations(s);const rule=s.automations.find(r=>r.id===id);if(!rule)throw Error('Automação não encontrada.');
 if(active)validateAutomation(rule);
 if(rule.active===Boolean(active))return;
 rule.active=Boolean(active);rule.updatedAt=new Date().toISOString();rule.updatedBy=a.id;rule.updatedByName=a.name;
 if(!active)cancelAutomationRuns(s,r=>r.ruleId===id,'Regra pausada.');
 audit(s,a,active?'Automação ativada':'Automação pausada',null,rule.name);
}
function automationMatches(rule,c,event){return (!rule.origin||rule.origin===c.origin)&&(!rule.direction||rule.direction===c.funnel)&&(rule.event!=='registered'||c.funnel==='Inbound')&&(rule.event!=='stage'||rule.stage===''||rule.stage===event.stage)}
function queueAutomations(s,event){
 ensureAutomations(s);const c=s.contacts.find(c=>c.id===event.contactId);if(!c)return;
 for(const rule of s.automations){
  if(!rule.active||rule.event!==event.type||!automationMatches(rule,c,event))continue;
  if(s.automationRuns.some(r=>r.ruleId===rule.id&&r.event.id===event.id&&r.event.type===event.type))continue;
  const at=event.at||new Date().toISOString(),run={id:uid(),ruleId:rule.id,rule:{...rule},contactId:c.id,contactName:c.name,event:{...event},recipient:c.email,scheduledAt:at,dueAt:new Date(Date.parse(at)+rule.delayMinutes*60000).toISOString(),status:'scheduled',attempts:[],transitions:[]};
  s.automationRuns.unshift(run);finishAutomationRun(s,run,'scheduled','Execução prevista para '+run.dueAt,at);
 }
}
function automationBlock(s,run){
 const c=s.contacts.find(c=>c.id===run.contactId),rule=s.automations.find(r=>r.id===run.ruleId);
 if(!rule?.active)return 'Regra pausada ou indisponível.';
 if(!c)return 'Contato não encontrado.';
 if(c.optOut)return 'Contato descadastrado de e-mails.';
 if(c.plan?.status==='Suspenso'&&run.event.type!=='payment')return 'Doador suspenso; solicitações de contribuição interrompidas.';
 if(!emailValid(c.email||''))return 'Contato sem e-mail válido.';
 if(run.event.type!=='payment'&&outsideCadence(c))return 'Contato fora da cadência principal.';
 if(!automationMatches(run.rule,c,run.event))return 'Contato não atende mais às condições da regra.';
 if(run.event.type==='stage'&&c.stage!==run.event.stage)return 'Contato já está em outra etapa.';
 if(run.event.type==='payment'&&!s.payments.some(p=>p.id===run.event.paymentId&&p.contactId===c.id))return 'Contribuição não encontrada.';
 return '';
}
function renderAutomationMessage(s,rule,event,c){
 const p=event.paymentId?s.payments.find(p=>p.id===event.paymentId&&p.contactId===c.id):null;
 const values={nome:c.name,origem:c.origin,etapa:STAGES[event.stage??c.stage],valor:p?Number(p.amount).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}):null,recibo:p?.receipt};
 const render=template=>template.replace(/\{\{\s*([a-z]+)\s*\}\}/g,(_,key)=>{const value=values[key];if(value==null||String(value).trim()==='')throw Error('Dado obrigatório ausente: '+key);return String(value)});
 return {subject:render(rule.subject),body:render(rule.body)};
}
function processAutomations(s,now=new Date(),onlyId=''){
 ensureAutomations(s);let count=0;
 for(const run of s.automationRuns){
  if(run.status!=='scheduled'||onlyId&&run.id!==onlyId||!onlyId&&Date.parse(run.dueAt)>now.getTime())continue;
  count++;const at=now.toISOString(),blocked=automationBlock(s,run);
  if(blocked){finishAutomationRun(s,run,'blocked',blocked,at);continue}
  const attempt={at,status:'processing'};run.attempts.push(attempt);finishAutomationRun(s,run,'processing','Preparando envio simulado.',at);
  try{
   const c=s.contacts.find(c=>c.id===run.contactId),message=renderAutomationMessage(s,run.rule,run.event,c);
   run.recipient=c.email;run.subject=message.subject;run.body=message.body;
   // This is a local simulation. No provider is contacted and no delivery is claimed.
   s.campaigns.unshift({id:uid(),...message,contacts:[c.id],at,actor:AUTO_SYSTEM.id,automationRunId:run.id,simulated:true});
   attempt.status='simulated';finishAutomationRun(s,run,'simulated','Envio simulado para '+run.recipient+'. Nenhum e-mail real foi enviado.',at);
  }catch(err){attempt.status='failed';attempt.detail=err.message;finishAutomationRun(s,run,'failed',err.message,at)}
 }
 return count;
}
function retryAutomation(s,a,id){
 automationAccess(s,a);ensureAutomations(s);const run=s.automationRuns.find(r=>r.id===id);
 if(!run||run.status!=='failed')throw Error('Somente execuções com falha podem ser tentadas novamente.');
 const blocked=automationBlock(s,run);if(blocked)throw Error(blocked);
 finishAutomationRun(s,run,'scheduled','Nova tentativa solicitada por '+a.name);run.dueAt=new Date().toISOString();
 audit(s,a,'Nova tentativa de automação',run.contactId,run.rule.name);
}
function documentValid(value,type){const d=String(value).replace(/\D/g,'');if(!d)return true;if(/^(\d)\1+$/.test(d))return false;if(type==='PF'){if(d.length!==11)return false;for(let size=9;size<=10;size++){const sum=[...d.slice(0,size)].reduce((s,n,i)=>s+Number(n)*(size+1-i),0);if((sum*10%11)%10!==Number(d[size]))return false}return true}if(d.length!==14)return false;for(let size=12;size<=13;size++){let w=size-7;const sum=[...d.slice(0,size)].reduce((s,n)=>{let v=s+Number(n)*w;w=w===2?9:w-1;return v},0),r=sum%11;if((r<2?0:11-r)!==Number(d[size]))return false}return true}
function validateContact(d,contacts,id,detailsOnly=false){if(!String(d.name||'').trim())throw Error('Informe o nome ou razão social.');if(!d.email&&!d.phone)throw Error('Informe pelo menos um e-mail ou telefone.');if(d.email&&!emailValid(d.email))throw Error('Informe um e-mail válido.');if(d.phone&&!/^\d{10,11}$/.test(d.phone.replace(/\D/g,'')))throw Error('Informe um telefone com DDD.');if(!documentValid(d.document||'',d.type))throw Error('CPF ou CNPJ inválido. Confira os dígitos.');if(contacts.some(c=>c.id!==id&&((d.email&&c.email.toLowerCase()===d.email.toLowerCase())||(d.document&&c.document?.replace(/\D/g,'')===d.document.replace(/\D/g,'')))))throw Error('Já existe um contato com este e-mail ou CPF/CNPJ.');if(!detailsOnly&&['Site','Instagram'].includes(d.origin)&&d.funnel!=='Inbound')throw Error('Contatos de origem '+d.origin+' devem ser Inbound.');if(!ORIGINS.includes(d.origin)||!['Inbound','Outbound'].includes(d.funnel)||!Number.isInteger(Number(d.stage))||Number(d.stage)<0||Number(d.stage)>3)throw Error('Selecione origem, funil e etapa válidos.')}
function audit(s,a,action,contactId,details=''){const e={id:uid(),at:new Date().toISOString(),actor:a.id,actorName:a.name,action,contactId,details};s.audit.unshift(e);if(contactId)s.contacts.find(c=>c.id===contactId)?.history.unshift(e);
 if(contactId){
  if(action==='Contato cadastrado')applyIntake(s,contactId,e.id);
  const c=s.contacts.find(c=>c.id===contactId),base={id:e.id,contactId,at:e.at,stage:c?.stage};
  if(action==='Contato cadastrado')queueAutomations(s,{...base,type:'registered'});
  if(['Contato cadastrado','Etapa alterada','Retomada da cadência'].includes(action))queueAutomations(s,{...base,type:'stage'});
  if(action==='Doação recebida'){const p=s.payments.find(p=>p.contactId===contactId&&details.endsWith(p.receipt));if(p)queueAutomations(s,{...base,type:'payment',paymentId:p.id})}
  if(action==='Saída da cadência')cancelAutomationRuns(s,r=>r.contactId===contactId&&r.event.type!=='payment','Contato retirado da cadência principal.');
 }
 return e}
const LOSS_REASONS=['Sem interesse','Sem disponibilidade financeira','Sem retorno','Momento inadequado','Outros'];
const LOSS_STAGES=['Perda registrada','Em análise','Retomada agendada','Em reaproximação','Encerrado sem retomada'];
const lossStage=c=>c?.cadenceExit?.lossStage??0;
function moveLoss(s,a,id,stage,note='',followUpDate=''){
 const c=s.contacts.find(c=>c.id===id);
 if(!outsideCadence(c))throw Error('Contato não está no funil de perdas.');
 if(!Number.isInteger(stage)||stage<0||stage>=LOSS_STAGES.length)throw Error('Etapa de perdas inválida.');
 if(stage===2&&(!/^\d{4}-\d{2}-\d{2}$/.test(followUpDate)||!Number.isFinite(Date.parse(followUpDate))||new Date(followUpDate+'T12:00:00').toISOString().slice(0,10)!==followUpDate||followUpDate<today()))throw Error('Informe uma data de retomada válida, a partir de hoje.');
 const scheduled=stage===2?followUpDate:'';
 if(lossStage(c)===stage&&(c.cadenceExit.followUpDate||'')===scheduled&&!String(note).trim())return;
 c.cadenceExit.lossStage=stage;c.cadenceExit.followUpDate=scheduled;
 audit(s,a,'Etapa de perdas alterada',id,LOSS_STAGES[stage]+(scheduled?' · Retomada: '+scheduled:'')+(String(note).trim()?' · '+String(note).trim():''));
}
const outsideCadence=c=>Boolean(c?.cadenceExit);
function exitCadence(s,a,id,d){
 const c=s.contacts.find(c=>c.id===id);
 if(!c||outsideCadence(c))throw Error('Contato inválido ou já fora da cadência.');
 if(!LOSS_REASONS.includes(d.reason))throw Error('Selecione um motivo de perda válido.');
 const note=String(d.note||'').trim();
 if(d.reason==='Outros'&&!note)throw Error('Explique o motivo em Outros.');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(d.date||'')||!Number.isFinite(Date.parse(d.date))||new Date(d.date+'T12:00:00').toISOString().slice(0,10)!==d.date||d.date>today()||d.date<c.created.slice(0,10))throw Error('Informe uma data entre o cadastro e hoje.');
 const e=audit(s,a,'Saída da cadência',id,d.reason+' · '+d.date+(note?' · '+note:''));
 c.cadenceExit={reason:d.reason,note,date:d.date,stage:c.stage,lossStage:0,actor:a.id,actorName:a.name,at:e.at};
 return c.cadenceExit;
}
function resumeCadence(s,a,id,stage,reason){
 const c=s.contacts.find(c=>c.id===id);
 if(!c||!outsideCadence(c))throw Error('Contato não está fora da cadência.');
 if(!Number.isInteger(stage)||stage<0||stage>=STAGES.length)throw Error('Etapa inválida.');
 if(!String(reason||'').trim())throw Error('Informe o motivo da retomada.');
 const previous={...c.cadenceExit};
 c.stage=stage;delete c.cadenceExit;
 const e=audit(s,a,'Retomada da cadência',id,STAGES[stage]+' · '+String(reason).trim());
 (c.cadenceEpisodes??=[]).push({...previous,resumedAt:e.at,resumedBy:a.id,resumedByName:a.name,resumeStage:stage,resumeReason:String(reason).trim()});
}
function move(s,a,id,stage,note=''){const c=s.contacts.find(c=>c.id===id);if(!c||!Number.isInteger(stage)||stage<0||stage>3)throw Error('Etapa inválida.');if(c.stage===stage)return;if(outsideCadence(c))throw Error('Retome a cadência antes de mover a etapa.');c.stage=stage;audit(s,a,'Etapa alterada',id,STAGES[stage]+(note?' · '+note:''))}
function convert(s,a,id,d){const c=s.contacts.find(c=>c.id===id);if(!c||c.plan)throw Error('Contato já possui um plano.');if(outsideCadence(c))throw Error('Retome a cadência antes de converter em doador.');if(!['Recorrente','Pontual'].includes(d.mode)||!Number.isFinite(d.amount)||d.amount<=0)throw Error('Informe modalidade e valor maior que zero.');if(d.mode==='Recorrente'&&(!Number.isInteger(d.due)||d.due<1||d.due>28))throw Error('Escolha vencimento entre os dias 1 e 28.');c.plan={mode:d.mode,amount:d.amount,due:d.mode==='Recorrente'?d.due:null,since:month(),adheredAt:new Date().toISOString(),status:'Ativo'};move(s,a,id,3);audit(s,a,'Conversão em doador',id,d.mode+' · R$ '+d.amount.toFixed(2))}
function pending(s,now=new Date()){const list=[],end=month(now),dateNow=now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0')+'-'+String(now.getDate()).padStart(2,'0');s.contacts.filter(c=>c.plan?.mode==='Recorrente'&&!['Pausado','Cancelado'].includes(c.plan.status)).forEach(c=>{let date=new Date(c.plan.since+'-01T12:00:00');while(month(date)<=end){const period=month(date),paid=s.payments.filter(p=>p.contactId===c.id&&p.period===period).reduce((s,p)=>s+p.amount,0),due=period+'-'+String(c.plan.due).padStart(2,'0');if(!suspendedPeriod(c,period)&&paid<c.plan.amount)list.push({contactId:c.id,name:c.name,period,due,amount:c.plan.amount-paid,overdue:due<dateNow});date.setMonth(date.getMonth()+1)}});return list.sort((a,b)=>a.due.localeCompare(b.due))}
function payment(s,a,d){const c=s.contacts.find(c=>c.id===d.contactId);if(!c?.plan)throw Error('Selecione um doador cadastrado.');if(!Number.isFinite(d.amount)||d.amount<=0)throw Error('Informe um valor monetário maior que zero.');if(!/^\d{4}-\d{2}-\d{2}$/.test(d.date)||!Number.isFinite(Date.parse(d.date))||d.date>today())throw Error('Informe uma data válida, até hoje.');if(!DESTINATIONS.includes(d.destination))throw Error('Selecione a destinação.');if(c.plan.mode==='Recorrente'&&(!/^\d{4}-(0[1-9]|1[0-2])$/.test(d.period||'')||d.period<c.plan.since))throw Error('Competência inválida ou anterior à adesão.');if(!d.pix?.trim()&&!d.attachment)throw Error('Informe a referência Pix ou anexe um comprovante.');if(d.pix&&s.payments.some(p=>p.pix===d.pix.trim()))throw Error('Este código Pix já foi lançado.');const p={...d,pix:d.pix?.trim()||'',id:uid(),mode:c.plan.mode,at:new Date().toISOString(),actor:a.id,actorName:a.name,receipt:'LUZ-'+String(s.payments.length+1).padStart(5,'0')};s.payments.unshift(p);audit(s,a,'Doação recebida',c.id,'R$ '+d.amount.toFixed(2)+' · '+d.destination+' · '+p.receipt);if(c.plan.status==='Inadimplente'&&!pending(s).some(x=>x.contactId===c.id&&x.overdue)){c.plan.status='Ativo';audit(s,a,'Doador reativado',c.id,'Pendências quitadas')}return p}
function reconcile(s,a,now=new Date()){const last=month(new Date(now.getFullYear(),now.getMonth()-1,1,12)),previous=month(new Date(now.getFullYear(),now.getMonth()-2,1,12));s.contacts.filter(c=>c.plan?.mode==='Recorrente'&&c.plan.status==='Ativo').forEach(c=>{if(c.plan.since>previous)return;if([last,previous].every(period=>!suspendedPeriod(c,period)&&!s.payments.some(p=>p.contactId===c.id&&p.period===period))){c.plan.status='Inadimplente';audit(s,a,'Inadimplência identificada',c.id,'Dois meses consecutivos sem pagamento confirmado. Reengajamento pendente.');s.tasks.unshift({id:uid(),contactId:c.id,text:'Retomar contato com '+c.name,done:false,at:now.toISOString()})}})}
function parseCSV(text){text=text.replace(/^\uFEFF/,'');const sep=text.split(/\r?\n/)[0].includes(';')?';':',';let rows=[],row=[],cell='',quoted=false;for(let i=0;i<text.length;i++){const ch=text[i];if(ch==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++}else quoted=!quoted}else if(ch===sep&&!quoted){row.push(cell.trim());cell=''}else if((ch==='\n'||ch==='\r')&&!quoted){if(ch==='\r'&&text[i+1]==='\n')i++;row.push(cell.trim());if(row.some(Boolean))rows.push(row);row=[];cell=''}else cell+=ch}if(quoted)throw Error('CSV inválido: aspas não fechadas.');row.push(cell.trim());if(row.some(Boolean))rows.push(row);return rows}
function importRows(s,a,list,rows){if(rows.length<2)throw Error('Arquivo sem contatos.');const h=rows[0].map(x=>String(x).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim()),ni=h.findIndex(x=>['nome','name','razao social'].includes(x)),ei=h.findIndex(x=>['email','e-mail'].includes(x)),pi=h.findIndex(x=>['telefone','phone','whatsapp'].includes(x));if(ni<0||ei<0)throw Error('O arquivo precisa de colunas nome e email. Baixe o modelo.');const r={imported:0,duplicates:0,invalid:0,rows:[]};rows.slice(1).forEach((row,i)=>{const name=String(row[ni]||'').trim(),email=String(row[ei]||'').trim().toLowerCase();if(!name||!emailValid(email)){r.invalid++;r.rows.push('Linha '+(i+2)+': nome ou e-mail inválido');return}if(s.contacts.some(c=>c.email.toLowerCase()===email)){r.duplicates++;r.rows.push('Linha '+(i+2)+': e-mail duplicado');return}const c={id:uid(),name,email,phone:pi>=0?String(row[pi]||''):'',type:'PF',document:'',origin:'E-mail',funnel:'Outbound',stage:0,created:new Date().toISOString(),owner:a.id,optOut:false,history:[]};s.contacts.unshift(c);list.contacts.push(c.id);r.imported++;audit(s,a,'Contato importado',c.id,list.name)});list.imports.unshift({...r,at:new Date().toISOString()});audit(s,a,'Lista importada',null,list.name+' · '+r.imported+' contatos');return r}
function send(s,a,ids,subject,body){if(!subject.trim()||!body.trim())throw Error('Informe assunto e mensagem.');const eligible=[...new Set(ids)].map(id=>s.contacts.find(c=>c.id===id)).filter(c=>c?.email&&emailValid(c.email)&&!c.optOut);if(!eligible.length)throw Error('Nenhum destinatário elegível. Confira e-mails e descadastros.');s.campaigns.unshift({id:uid(),subject,body,contacts:eligible.map(c=>c.id),at:new Date().toISOString(),actor:a.id});eligible.forEach(c=>audit(s,a,'E-mail enviado',c.id,subject+'\n'+body));return eligible.length}
function createEmptyState(){return {version:1,users:[],contacts:[],payments:[],lists:[],campaigns:[],audit:[],tasks:[],resets:[]}}
// Operational intake is independent of email eligibility and only runs for new registrations.
function ensureExtensions(s){
 s.intakeRules??=[];s.intakeRuns??=[];s.receiptSends??=[];
 return s;
}
function validateIntake(s,a,d){
 automationAccess(s,a);
 if(!String(d.name||'').trim()||!ORIGINS.includes(d.origin)||!['Inbound','Outbound'].includes(d.direction))throw Error('Informe nome, origem e classificação.');
 if(['Site','Instagram'].includes(d.origin)&&d.direction!=='Inbound')throw Error('Site e Instagram devem ser Inbound.');
 if(d.stage!==''&&(!Number.isInteger(Number(d.stage))||Number(d.stage)<0||Number(d.stage)>3))throw Error('Etapa inválida.');
 if(d.owner&&!s.users.some(u=>u.id===d.owner&&u.active))throw Error('Responsável deve estar ativo.');
 if(d.owner&&a.role!=='Administrador'&&d.owner!==a.id)throw Error('Operador só pode atribuir a si mesmo.');
 if(d.listId&&!s.lists.some(l=>l.id===d.listId))throw Error('Lista não encontrada.');
 const taskText=String(d.taskText||'').trim(),days=Number(d.days);
 if(taskText&&(!Number.isInteger(days)||days<0||days>365))throw Error('Informe prazo entre zero e 365 dias.');
 return {name:String(d.name).trim(),origin:d.origin,direction:d.direction,stage:d.stage===''?'':Number(d.stage),owner:d.owner||'',listId:d.listId||'',taskText,days:taskText?days:0};
}
function saveIntake(s,a,d,id=''){
 ensureExtensions(s);const data=validateIntake(s,a,d),old=s.intakeRules.find(r=>r.id===id);
 if(id&&!old)throw Error('Regra não encontrada.');
 const r={...data,id:old?.id||uid(),active:false,version:(old?.version||0)+1,updatedBy:a.id,updatedByName:a.name,updatedAt:new Date().toISOString()};
 if(old)Object.assign(old,r);else s.intakeRules.push(r);
 audit(s,a,'Regra pós-cadastro salva',null,r.name+' · Pausada');return r;
}
function activateIntake(s,a,id,active){
 ensureExtensions(s);automationAccess(s,a);const r=s.intakeRules.find(r=>r.id===id);if(!r)throw Error('Regra não encontrada.');
 if(a.role!=='Administrador'&&r.updatedBy!==a.id)throw Error('Somente o autor ou Administrador pode alterar a ativação desta regra.');
 if(active){validateIntake(s,a,r);if(s.intakeRules.some(x=>x.id!==id&&x.active&&x.origin===r.origin&&x.direction===r.direction))throw Error('Já existe uma regra ativa para esta origem e classificação.');}
 r.active=Boolean(active);audit(s,a,active?'Regra pós-cadastro ativada':'Regra pós-cadastro pausada',null,r.name);
}
function applyIntake(s,contactId,eventId){
 ensureExtensions(s);const c=s.contacts.find(c=>c.id===contactId);if(!c)return;
 if(s.intakeRuns.some(r=>r.contactId===contactId))return;
 const rule=s.intakeRules.find(r=>r.active&&r.origin===c.origin&&r.direction===c.funnel);
 const run={id:uid(),contactId,eventId,at:new Date().toISOString(),rule:rule?{...rule}:null,actions:[]};s.intakeRuns.push(run);
 if(!rule){audit(s,AUTO_SYSTEM,'Pós-cadastro: sem regra',contactId,'Nenhuma ação operacional configurada para esta origem e classificação.');return run;}
 for(const type of [rule.stage!==''&&'Etapa inicial',rule.owner&&'Responsável',rule.listId&&'Lista de entrada',rule.taskText&&'Acompanhamento'].filter(Boolean))run.actions.push(executeIntakeAction(s,c,run,type));
 return run;
}
function executeIntakeAction(s,c,run,type){
 const rule=run.rule,at=new Date().toISOString();let status='realizada',detail;
 const blocked=message=>{const e=Error(message);e.intakeBlocked=true;throw e};
 try{
  if(type==='Etapa inicial'){if(outsideCadence(c))blocked('Contato fora da cadência.');c.stage=rule.stage;detail=STAGES[c.stage];}
  if(type==='Responsável'){const u=s.users.find(u=>u.id===rule.owner&&u.active);if(!u)blocked('Responsável indisponível.');c.owner=u.id;detail=u.name;}
  if(type==='Lista de entrada'){const l=s.lists.find(l=>l.id===rule.listId);if(!l)blocked('Lista indisponível.');if(!l.contacts.includes(c.id))l.contacts.push(c.id);detail=l.name;}
  if(type==='Acompanhamento'){
   if(!s.users.some(u=>u.id===c.owner&&u.active))blocked('Responsável indisponível para a tarefa.');
   let task=s.tasks.find(t=>t.intakeRunId===run.id);if(!task){const due=new Date(c.created);due.setDate(due.getDate()+rule.days);task={id:uid(),contactId:c.id,text:rule.taskText,owner:c.owner,due:todayOf(due),done:false,at,intakeRunId:run.id};s.tasks.unshift(task);}
   detail=task.text+' · Vencimento '+task.due;
  }
 }catch(e){status=e.intakeBlocked?'bloqueada':'falha';detail=e.message}
 audit(s,AUTO_SYSTEM,'Pós-cadastro: '+status,c.id,rule.name+' · versão '+rule.version+' · '+type+' · '+detail);
 return {type,status,detail,at};
}
function retryIntake(s,a,id){
 automationAccess(s,a);const run=s.intakeRuns?.find(r=>r.id===id);if(!run||!run.actions.some(x=>x.status==='falha'))throw Error('Somente ações com falha podem ser recuperadas.');
 const c=s.contacts.find(c=>c.id===run.contactId);if(!c)throw Error('Contato não encontrado.');
 const active=s.intakeRules.find(r=>r.id===run.rule.id);if(!active?.active||active.version!==run.rule.version)throw Error('A regra original foi pausada ou alterada.');
 if(c.origin!==run.rule.origin||c.funnel!==run.rule.direction)throw Error('Contato não atende mais à regra original.');
 const attempt={at:new Date().toISOString(),actor:a.id,actions:[]};(run.attempts??=[]).push(attempt);
 for(const x of run.actions.filter(x=>x.status==='falha')){const result=executeIntakeAction(s,c,run,x.type);attempt.actions.push({previous:{...x},result:{...result}});Object.assign(x,result);}
 audit(s,a,'Recuperação pós-cadastro',c.id,run.rule.name);
}
const todayOf=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
const DONOR_STATUSES=['Ativo','Inadimplente','Pausado','Suspenso','Cancelado'];
const enrolled=(s,c)=>Boolean(c?.plan&&!s.payments.some(p=>p.contactId===c.id&&p.amount>0));
function suspendedPeriod(c,period){
 const due=period+'-'+String(c.plan.due).padStart(2,'0');
 return (c.plan.suspensions||[]).some(r=>due>=r.start&&(!r.end||due<r.end));
}
function changeStatus(s,a,id,d){
 automationAccess(s,a);const c=s.contacts.find(c=>c.id===id);if(!c?.plan||!DONOR_STATUSES.includes(d.status))throw Error('Doador ou status inválido.');
 const reason=String(d.reason||'').trim();if(!reason)throw Error('Informe o motivo.');
 if(!validDate(d.date)||d.date>today()||d.date<(c.plan.adheredAt?.slice(0,10)||c.plan.since+'-01')||d.date<(c.plan.statusDate||c.plan.suspensions?.at(-1)?.end||c.plan.suspensions?.at(-1)?.start||''))throw Error('Data inválida, anterior à adesão ou à última alteração.');
 if(c.plan.status===d.status)return;
 const before=c.plan.status;
 c.plan.suspensions??=[];
 if(before==='Suspenso'){const open=c.plan.suspensions.find(x=>!x.end);if(open)open.end=d.date;}
 if(d.status==='Suspenso')c.plan.suspensions.push({start:d.date,end:null,actor:a.id,reason});
 c.plan.status=d.status;c.plan.statusDate=d.date;
 if(d.status==='Suspenso')cancelAutomationRuns(s,r=>r.contactId===id&&r.event.type!=='payment','Doador suspenso; solicitações de contribuição interrompidas.');
 audit(s,a,'Status do doador alterado',id,before+' → '+d.status+' · '+d.date+' · '+reason);
}
function validDate(v){return /^\d{4}-\d{2}-\d{2}$/.test(v||'')&&Number.isFinite(Date.parse(v))&&new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v}
function segmentContacts(s,f={},exclude=[]){
 if(f.start&&!validDate(f.start)||f.end&&!validDate(f.end)||f.start&&f.end&&f.start>f.end)throw Error('Informe um período de pagamento válido.');
 return s.contacts.filter(c=>!exclude.includes(c.id)&&(!f.q||(c.name+' '+c.email).toLocaleLowerCase('pt-BR').includes(f.q.toLocaleLowerCase('pt-BR')))&&(!f.link||(f.link==='donors'?Boolean(c.plan):!c.plan))&&(!f.status||c.plan?.status===f.status)&&(!f.mode||c.plan?.mode===f.mode)&&(!f.enrolled||enrolled(s,c))&&(!f.origin||c.origin===f.origin)&&(!f.direction||c.funnel===f.direction)&&(!(f.destination||f.start||f.end)||s.payments.some(p=>p.contactId===c.id&&(!f.destination||p.destination===f.destination)&&(!f.start||p.date>=f.start)&&(!f.end||p.date<=f.end))));
}
function addToList(s,a,id,ids){
 automationAccess(s,a);const l=s.lists.find(l=>l.id===id);if(!l)throw Error('Lista não encontrada.');
 const added=[...new Set(ids)].filter(id=>s.contacts.some(c=>c.id===id)&&!l.contacts.includes(id));
 l.contacts.push(...added);audit(s,a,'Contatos adicionados à lista',null,l.name+' · '+added.length);return added.length;
}
function receiptSnapshot(s,id){
 const p=s.payments.find(p=>p.id===id),c=s.contacts.find(c=>c.id===p?.contactId);if(!p||!c)throw Error('Recibo não encontrado.');
 return {paymentId:p.id,receipt:p.receipt,contactId:c.id,donor:c.name,amount:p.amount,date:p.date,period:p.period,mode:p.mode,destination:p.destination};
}
function sendReceipt(s,a,id,d){
 automationAccess(s,a);ensureExtensions(s);const snapshot=receiptSnapshot(s,id),c=s.contacts.find(c=>c.id===snapshot.contactId);
 if(c.optOut)throw Error('Contato descadastrado de e-mails. Use impressão/PDF.');
 if(!emailValid(String(d.recipient||'').trim())||!String(d.subject||'').trim()||!String(d.body||'').trim())throw Error('Informe destinatário válido, assunto e mensagem.');
 const run={id:uid(),...snapshot,recipient:d.recipient.trim(),subject:d.subject.trim(),body:d.body.trim(),snapshot,at:new Date().toISOString(),actor:a.id,actorName:a.name,status:'simulated'};
 s.receiptSends.unshift(run);audit(s,a,'Recibo: envio simulado',c.id,snapshot.receipt+' · '+run.recipient+' · Nenhum e-mail real foi enviado.');return run;
}
function reportData(s,f={}){
 const period=f.period||month();
 const payments=s.payments.filter(p=>p.date.startsWith(period)&&(!f.mode||p.mode===f.mode)&&(!f.stage||String(s.contacts.find(c=>c.id===p.contactId)?.stage)===String(f.stage)));
 const contacts=s.contacts.filter(c=>month(c.created)===period&&(!f.stage||String(c.stage)===String(f.stage)));
 return {period,payments,contacts,total:payments.reduce((sum,p)=>sum+p.amount,0)};
}
function ensureMailings(s){s.mailings??=[];s.mailingRuns??=[];return s}
function validateMailing(s,d){
 const subject=String(d.subject||'').trim(),body=String(d.body||'').trim();
 if(!subject||subject.length>180||!body||body.length>10000)throw Error('Informe assunto e mensagem dentro dos limites.');
 if(!['once','recurring'].includes(d.kind))throw Error('Escolha envio único ou recorrente.');
 const contacts=[...new Set(d.contacts||[])];if(!contacts.length||contacts.some(id=>!s.contacts.some(c=>c.id===id)))throw Error('Selecione destinatários existentes.');
 if(!contacts.some(id=>{const c=s.contacts.find(c=>c.id===id);return emailValid(c.email||'')&&!c.optOut}))throw Error('Nenhum destinatário possui e-mail válido e autorização para envio.');
 const startAt=d.startAt||'';if(startAt&&!Number.isFinite(Date.parse(startAt)))throw Error('Informe data e hora válidas para o envio.');
 const frequency=d.kind==='recurring'?d.frequency:'';
 if(d.kind==='recurring'&&!['daily','weekly','monthly'].includes(frequency))throw Error('Escolha frequência diária, semanal ou mensal.');
 const weekday=['weekly','monthly'].includes(frequency)&&d.weekday!=null&&d.weekday!==''?Number(d.weekday):null;
 if(weekday!==null&&(!Number.isInteger(weekday)||weekday<0||weekday>6))throw Error('Escolha um dia da semana válido.');
 const monthWeek=frequency==='monthly'&&weekday!==null?Number(d.monthWeek??1):null;
 if(monthWeek!==null&&![1,2,3,4,-1].includes(monthWeek))throw Error('Escolha primeira, segunda, terceira, quarta ou última ocorrência no mês.');
 const endDate=d.kind==='recurring'?(d.endDate||''):'';
 if(endDate&&(!validDate(endDate)||endDate<today()||endDate<todayOf(firstMailingAt({kind:d.kind,frequency,weekday,monthWeek,startAt}))))throw Error('O término deve ser uma data válida, a partir do primeiro envio e de hoje.');
 return {subject,body,kind:d.kind,contacts,startAt:startAt?new Date(startAt).toISOString():'',frequency,weekday,monthWeek,endDate};
}
function monthlyWeekday(base,weekday,week){
 const d=new Date(base);d.setDate(1);
 if(Number(week)===-1){d.setMonth(d.getMonth()+1);d.setDate(0);d.setDate(d.getDate()-(d.getDay()-Number(weekday)+7)%7);}
 else d.setDate(1+(Number(weekday)-d.getDay()+7)%7+7*(Number(week)-1));
 return d;
}
function firstMailingAt(m,now=new Date()){
 const at=m.startAt&&Date.parse(m.startAt)>now.getTime()?new Date(m.startAt):new Date(now);
 if(m.kind==='recurring'&&m.frequency==='weekly'&&m.weekday!=null&&m.weekday!=='')at.setDate(at.getDate()+(Number(m.weekday)-at.getDay()+7)%7);
 if(m.kind==='recurring'&&m.frequency==='monthly'&&m.weekday!=null&&m.weekday!==''){
  let candidate=monthlyWeekday(at,m.weekday,m.monthWeek??1);
  if(candidate<at){const next=new Date(at);next.setDate(1);next.setMonth(next.getMonth()+1);candidate=monthlyWeekday(next,m.weekday,m.monthWeek??1);}
  return candidate;
 }
 return at;
}
function saveMailing(s,a,d,id=''){
 automationAccess(s,a);ensureMailings(s);const data=validateMailing(s,d),old=s.mailings.find(m=>m.id===id);
 if(id&&!old)throw Error('E-mail não encontrado.');
 const m={...data,id:old?.id||uid(),version:(old?.version||0)+1,status:'draft',nextAt:null,anchorAt:null,occurrence:0,activated:false,updatedAt:new Date().toISOString(),updatedBy:a.id,updatedByName:a.name};
 if(old)Object.assign(old,m);else s.mailings.unshift(m);
 audit(s,a,'E-mail salvo para revisão',null,m.subject+' · '+(m.kind==='once'?'Único':'Recorrente')+' · versão '+m.version);return m;
}
// Calendar intervals retain local wall time. Monthly mailings return to the original
// day after short months (31 Jan -> 28 Feb -> 31 Mar).
function mailingOccurrence(m,index){
 const anchor=new Date(m.anchorAt),d=new Date(anchor);
 if(m.frequency==='monthly'){d.setDate(1);d.setMonth(anchor.getMonth()+index);if(m.weekday!=null&&m.weekday!=='')return monthlyWeekday(d,m.weekday,m.monthWeek??1);const last=new Date(d.getFullYear(),d.getMonth()+1,0).getDate();d.setDate(Math.min(anchor.getDate(),last));}
 else d.setDate(anchor.getDate()+index*(m.frequency==='weekly'?7:1));
 return d;
}
function nextMailingOccurrence(m,after){
 const anchor=new Date(m.anchorAt),step=m.frequency==='weekly'?7:1;
 let index=Math.max(m.occurrence+1,m.frequency==='monthly'?(after.getFullYear()-anchor.getFullYear())*12+after.getMonth()-anchor.getMonth():Math.floor((after-anchor)/86400000/step));
 let at=mailingOccurrence(m,index);while(at<=after){index++;at=mailingOccurrence(m,index)}
 return {index,at};
}
function setMailingStatus(s,a,id,status,now=new Date()){
 automationAccess(s,a);ensureMailings(s);const stored=s.mailings.find(m=>m.id===id);if(!stored)throw Error('E-mail não encontrado.');const m={...stored};
 if(!['active','paused','cancelled'].includes(status))throw Error('Situação inválida.');
 if(status===m.status)return stored;
 if(['completed','cancelled'].includes(m.status))throw Error('Este envio foi concluído ou cancelado. Edite e revise para criar uma nova versão.');
 if(status==='active'){
  validateMailing(s,m);
  if(m.activated&&m.kind==='recurring'){const pending=mailingOccurrence(m,m.occurrence),next=pending>now?{index:m.occurrence,at:pending}:nextMailingOccurrence(m,now);m.occurrence=next.index;m.nextAt=next.at.toISOString();}
  else{m.anchorAt=firstMailingAt(m,now).toISOString();m.occurrence=0;m.nextAt=m.anchorAt;}
  if(m.endDate&&todayOf(new Date(m.nextAt))>m.endDate)throw Error('Não há envio disponível antes da data de término.');
  m.activated=true;
 }else m.nextAt=null;
 m.status=status;m.updatedAt=now.toISOString();Object.assign(stored,m);audit(s,a,{'active':'E-mail ativado','paused':'E-mail pausado','cancelled':'E-mail cancelado'}[status],null,m.subject);return stored;
}
function mailingBlock(c,m){
 if(!c)return 'Contato não encontrado.';
 if(c.optOut)return 'Contato descadastrado de e-mails.';
 if(!emailValid(c.email||''))return 'Contato sem e-mail válido.';
 if(m.kind==='recurring'&&outsideCadence(c))return 'Contato fora da cadência principal.';
 if(m.kind==='recurring'&&c.plan?.status==='Suspenso')return 'Doador suspenso.';
 return '';
}
function processMailings(s,now=new Date(),onlyId=''){
 ensureMailings(s);let count=0;
 for(const m of s.mailings){
  if(m.status!=='active'||!m.nextAt||onlyId&&m.id!==onlyId||!onlyId&&Date.parse(m.nextAt)>now.getTime())continue;
  const dueAt=m.nextAt;
  if(m.endDate&&todayOf(now)>m.endDate){m.status='completed';m.nextAt=null;audit(s,AUTO_SYSTEM,'Recorrência encerrada',null,m.subject+' · Data de término alcançada.');count++;continue;}
  let run=s.mailingRuns.find(r=>r.mailingId===m.id&&r.version===m.version&&r.occurrence===m.occurrence);
  if(!run){
   run={id:uid(),mailingId:m.id,version:m.version,occurrence:m.occurrence,kind:m.kind,subject:m.subject,body:m.body,dueAt,at:now.toISOString(),configuredBy:m.updatedByName,status:'processing',results:[]};s.mailingRuns.unshift(run);
   for(const id of m.contacts){
    const c=s.contacts.find(c=>c.id===id),blocked=mailingBlock(c,m);
    const result={contactId:id,name:c?.name||'Contato removido',recipient:c?.email||'',status:blocked?'blocked':'simulated',detail:blocked||'Envio simulado. Nenhum e-mail real foi enviado.'};
    run.results.push(result);
    if(c)audit(s,AUTO_SYSTEM,blocked?'E-mail: destinatário bloqueado':'E-mail: envio simulado',id,m.subject+' · '+result.detail);
   }
   const eligible=run.results.filter(r=>r.status==='simulated');
   if(eligible.length)s.campaigns.unshift({id:uid(),subject:m.subject,body:m.body,contacts:eligible.map(r=>r.contactId),at:run.at,actor:AUTO_SYSTEM.id,simulated:true,mailingRunId:run.id});
   run.status=eligible.length?'simulated':'blocked';
   audit(s,AUTO_SYSTEM,'Execução de e-mail: '+(eligible.length?'simulada':'bloqueada'),null,m.subject+' · '+eligible.length+' simulados · '+(run.results.length-eligible.length)+' bloqueados');count++;
  }
  if(m.kind==='once'){m.status='completed';m.nextAt=null;}
  else{
   const next=nextMailingOccurrence(m,new Date(Math.max(now.getTime(),Date.parse(dueAt))));
   run.skipped=Math.max(0,next.index-m.occurrence-1);m.occurrence=next.index;
   if(m.endDate&&todayOf(next.at)>m.endDate){m.status='completed';m.nextAt=null;}else m.nextAt=next.at.toISOString();
  }
 }
 return count;
}
function simulateMailing(s,a,id){automationAccess(s,a);const m=s.mailings?.find(m=>m.id===id);if(m?.status!=='active')throw Error('Ative o e-mail antes de simular.');audit(s,a,'Simulação de e-mail solicitada',null,m.subject);return processMailings(s,new Date(),id)}
function repairContactOrigins(s){
 for(const c of s.contacts||[]){
  if(!['Site','Instagram'].includes(c.origin)||c.funnel==='Inbound')continue;
  const previous=c.funnel;c.funnel='Inbound';c.history??=[];s.audit??=[];
  audit(s,AUTO_SYSTEM,'Origem e direção corrigidas',c.id,c.origin+' / '+previous+' → '+c.origin+' / Inbound');
 }
 return s;
}
function repairLegacyHistory(s){
  const actions={'Doa??o recebida':'Doação recebida','Convers?o em doador':'Conversão em doador'};
  const entries=[...(s.audit||[]),...(s.contacts||[]).flatMap(c=>c.history||[])];
  for(const entry of entries){
    if(!Object.prototype.hasOwnProperty.call(actions,entry.action))continue;
    const original=entry.action;
    entry.action=actions[original];
    if(typeof entry.details==='string'){
      const pattern=original==='Doa??o recebida'?/^(R\$ \d+\.\d{2}) \? (.+) \? (LUZ-\d+)$/:/^(Recorrente|Pontual) \? (R\$ \d+\.\d{2})$/;
      entry.details=entry.details.replace(pattern,original==='Doa??o recebida'?'$1 · $2 · $3':'$1 · $2');
    }
  }
  return repairContactOrigins(s);
}
const api={repairContactOrigins,firstMailingAt,ensureMailings,saveMailing,setMailingStatus,processMailings,simulateMailing,mailingOccurrence,mailingBlock,ensureExtensions,saveIntake,activateIntake,applyIntake,retryIntake,DONOR_STATUSES,enrolled,suspendedPeriod,changeStatus,validDate,segmentContacts,addToList,receiptSnapshot,sendReceipt,reportData,AUTO_EVENTS,ensureAutomations,saveAutomation,setAutomationActive,queueAutomations,processAutomations,retryAutomation,cancelAutomationRuns,renderAutomationMessage,LOSS_STAGES,lossStage,moveLoss,LOSS_REASONS,outsideCadence,exitCadence,resumeCadence,repairLegacyHistory,STAGES,ORIGINS,DESTINATIONS,uid,today,month,emailValid,documentValid,validateContact,audit,move,convert,payment,pending,reconcile,parseCSV,importRows,send,createEmptyState};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.CRM=api;
})(globalThis);
