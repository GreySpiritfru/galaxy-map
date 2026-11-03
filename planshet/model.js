import {articleText, buildAliases, mentions, buildSearchIndex} from '../js/linker.js?v=248';

export let C = null;
let pending;
// Планшет карты (02.11.2026, перенос планшета шаг 5; из mock/n6): данные — файлы корня репозитория,
// свои здесь только черновые подписи статей (presentation.json) и ключи справочника (reference-articles.json).
const BASE = new URL('../', import.meta.url);
const HERE = new URL('./', import.meta.url);
const list = value => Array.isArray(value) ? value : [];
const unique = values => [...new Set(values.filter(Boolean))];
const bare = url => String(url || '').split('#')[0].replace(/\/+$/, '');
const docId = entry => entry.file.replace(/^articles\//, '').replace(/\.json$/, '');
const truth = v => v === true || /^(true|1)$/i.test(String(v ?? ''));
const finite = (x,y) => Number.isFinite(x) && Number.isFinite(y);
export const viewKind = r => r?.kind === 'world' ? (r.flags.story ? 'story' : 'place') : r?.kind;

/* Общие данные с картой (02.11.2026, v=226): карта уже скачала и разобрала world/characters (с правками редактора,
   ещё не доехавшими до GitHub), индекс статей, системы, схему корабля, модули — js/planshet.js передаёт их сюда
   (setShared) вместе с общим кэшем копий статей (loadDoc из js/reader.js). Чего нет — качаем сами, как раньше. */
let shared = {};
export function setShared(data) { shared = data || {}; }
const take = (key, base, path) => shared[key] != null ? Promise.resolve(shared[key]) : json(base, path);
const fetchDoc = entry => shared.loadDoc ? shared.loadDoc(entry) : json(BASE, entry.file);

async function json(base,path) {
  const response = await fetch(new URL(path,base), {cache:'no-cache'});
  if (!response.ok) throw new Error(`N6: ${path}: HTTP ${response.status}`);
  return response.json();
}

export function resolveModule(doc, selector) {
  if (!doc) return {status:'unavailable',reason:'Документ недоступен',blocks:null};
  const occurrences = new Map();
  function walk(nodes) {
    if (!Array.isArray(nodes)) return;
    nodes.forEach((node,index) => {
      if (!node || typeof node !== 'object') return;
      if (node.id) {
        if (!occurrences.has(node.id)) occurrences.set(node.id,[]);
        occurrences.get(node.id).push({node,parent:nodes,index});
      }
      walk(node.c);
    });
  }
  walk(doc.c);
  const failed = reason => ({status:'invalid',reason,blocks:null});
  if (!selector || !['sibling-range','node'].includes(selector.type)) return failed('Неизвестный селектор');
  const from = occurrences.get(selector.from) || [];
  if (from.length !== 1) return failed(from.length ? 'Повтор начальной границы' : 'Начальная граница отсутствует');
  if (selector.type === 'node') return {status:'ok',reason:'',blocks:[from[0].node]};
  if (!selector.to) return failed('Конечная граница обязательна');
  const to = occurrences.get(selector.to) || [];
  if (to.length !== 1) return failed(to.length ? 'Повтор конечной границы' : 'Конечная граница отсутствует');
  if (from[0].parent !== to[0].parent) return failed('Границы находятся в разных контейнерах');
  if (from[0].index > to[0].index) return failed('Обратный порядок границ');
  return {status:'ok',reason:'',blocks:from[0].parent.slice(from[0].index,to[0].index+1)};
}

export function load() {
  if (C) return Promise.resolve(C);
  if (!pending) pending = loadAll().catch(error => { pending = null; throw error; });
  return pending;
}

async function loadAll() {
  let [world,characters,articlesIndex,news,shipLore,bld,schema,systemList,systemLore,systemNames,epochs,moduleRegistry,relations,worldFlags,shipRecords,presentation,referenceArticles] = await Promise.all([
    take('world',BASE,'world.json'),take('characters',BASE,'characters.json'),take('articlesIndex',BASE,'articles/index.json'),json(BASE,'news.json'),
    take('shipLore',BASE,'ship/lore.json'),take('bld',BASE,'ship/bld/buildings.json'),json(BASE,'ship/schema.json'),
    take('systemList',BASE,'systems/manifest.json'),take('systemLore',BASE,'systems/lore.json'),take('systemNames',BASE,'systems/names.json'),json(BASE,'lore/epochs.json'),
    take('moduleRegistry',BASE,'modules.json'),take('relations',BASE,'relations.json'),null,take('shipRecords',BASE,'ship/records.json'),json(HERE,'presentation.json'),json(HERE,'reference-articles.json')
  ]);
  // Карта отдаёт свои объекты — планшет работает с копиями (данные карты не трогает).
  world=structuredClone(world); characters=structuredClone(characters);
  // Признаки world — прямо в world.json (с 02.11.2026), отдельного файла нет.
  worldFlags={items:Object.fromEntries(world.map(p=>[p.id,{story:p.story===true,location:p.location===true,alliance:p.alliance===true}]))};
  const records=[],raw={},docs={},diagnostics=[],documentEntries=Object.entries(articlesIndex.articles || articlesIndex);
  /* Копии статей (v=226): сразу — только нужные для показа (статьи лора, источники модулей); анкеты и прочее нужны
     лишь поиску по тексту — догружаются в фоне после показа (C.full, ниже). До v=226 планшет ждал все ~32 файла. */
  const loreIds=['4tRzyNaVfEQ','y7G2E4B490h','SEOWfJxAewY','gf7sBYkW_di','toTVpow7sb1'].map(id=>'tt/greyspirit/'+id);
  const needNow=new Set([...loreIds,...Object.values(moduleRegistry.modules||{}).map(m=>m.articleId)]);
  const loadDocs = entries => Promise.all(entries.map(async ([url,entry]) => {
    try { docs[docId(entry)] = await fetchDoc(entry); }
    catch (error) { diagnostics.push({type:'document',id:docId(entry),reason:error.message}); }
  }));
  const isNow=([,entry])=>needNow.has(docId(entry));
  const withFile=documentEntries.filter(([,entry])=>entry?.file);
  await loadDocs(withFile.filter(isNow));
  function add(value) {
    if (records.some(r=>r.id===value.id)) throw new Error(`N6: duplicate record ${value.id}`);
    const r = {aliases:[],source:{type:value.kind,key:value.id},parentId:null,links:[],
      content:{intro:'',ownDocument:null,moduleRefs:[]},context:{placeIds:[],peopleIds:[]},mapTargets:[],
      capabilities:{read:true,edit:false,save:false,sendData:false,adapter:'mock-stub'},
      summary:'',text:'',image:'',images:[],places:[],people:[],...value};
    r.aliases=unique([r.title,r.shortTitle,...list(r.aliases),...list(news.aliases?.[r.id])]);
    records.push(r); return r;
  }
  const gallery = lore => list(lore?.img).map(path=>path.startsWith('../')?path.slice(3):'ship/'+path);
  const targets = p => {
    const out=[];
    if (finite(p.x,p.y)) out.push({type:'galaxy',x:p.x,y:p.y,id:p.id});
    if (finite(p.systemX,p.systemY) && p.parent?.startsWith('system:')) out.push({type:'system',systemId:p.parent,x:p.systemX,y:p.systemY,id:p.id});
    if (finite(p.submapX,p.submapY)) out.push({type:'ship',recordId:'phenome',x:p.submapX,y:p.submapY,id:p.id});
    return out;
  };
  for (const p of world) {
    const flags=worldFlags.items[p.id];
    if (!flags) throw new Error(`N6: explicit world flags missing: ${p.id}`);
    raw[p.id]={...p,flags};
    const brief=news.briefs?.[p.id]||{};
    add({id:p.id,kind:'world',title:p.title,shortTitle:p.shortTitle,aliases:p.aliases,image:p.image,images:list(p.images),
      source:{type:'world',key:p.id},flags,parentId:p.parent||null,links:list(p.links),
      content:{intro:p.description||'',ownDocument:null,moduleRefs:[]},context:{storyId:flags.story?p.id:null,placeIds:[],peopleIds:[]},mapTargets:targets(p),
      summary:brief.summary||p.description||'',text:[p.description,p.recruit,...list(brief.known),...list(brief.dangers),...list(brief.playing).map(x=>[x.place,x.text].join(': '))].filter(Boolean).join('\n'),
      updated:brief.updated||p.updated||'',completed:truth(p.completed)});
  }
  const ownerByUrl=new Map(characters.filter(p=>p.sheetUrl).map(p=>[bare(p.sheetUrl),p.id]));
  const entriesByUrl=new Map(documentEntries.map(([url,e])=>[bare(url),e]));
  const charText=(p,sheet)=>[p.race,p.role,p.description,sheet&&docs[sheet]&&articleText(docs[sheet])].filter(Boolean).join('\n');
  for (const p of characters) {
    raw[p.id]=p;
    const title=p.name||p.title||'',noInitials=title.replace(/^(?:\p{L}\.\s*)+/u,''),entry=entriesByUrl.get(bare(p.sheetUrl)),sheet=entry?docId(entry):null;
    add({id:p.id,kind:'character',title,shortTitle:p.shortTitle,aliases:unique([...list(p.aliases),noInitials,noInitials.split(/\s+/)[0]]),
      source:{type:'characters',key:p.id},parentId:p.parent||null,links:list(p.links),image:p.image||'',images:list(p.images),sheet,
      content:{intro:p.description||'',ownDocument:sheet,moduleRefs:[]},context:{storyId:worldFlags.items[p.parent]?.story?p.parent:null,placeIds:[],peopleIds:[]},mapTargets:targets(p),
      summary:p.description||'',text:charText(p,sheet)});
  }
  for (const [url,entry] of documentEntries) {
    if (!entry?.file || ownerByUrl.has(bare(url))) continue;
    const id=docId(entry);
    // Неиспользуемые копии старых анкет остаются документами зеркала, без самостоятельного архивного вида.
    if (!loreIds.includes(id)) continue;
    add({id,kind:'article',title:entry.title,source:{type:'articles',key:url,file:entry.file},url,
      text:articleText(docs[id]),updated:entry.updated||'',content:{intro:'',ownDocument:id,moduleRefs:[]}});
  }
  docs['lore/epochs']={c:epochs.nodes};
  add({id:'lore/epochs',kind:'article',title:'Эпохи Фенома',text:articleText(docs['lore/epochs']),noLink:true,
    source:{type:'epochs',key:'mock/epochs.json'},content:{intro:'',ownDocument:'lore/epochs',moduleRefs:[]}});
  for (const slug of systemList) {
    const title=/^[a-z]/i.test(slug)?slug.toUpperCase():slug.split('_').map(w=>w.charAt(0).toUpperCase()+w.slice(1)).join(' ');
    add({id:'system:'+slug,kind:'system',slug,title,aliases:Object.entries(systemNames).filter(([,name])=>name===title).map(([name])=>name),
      source:{type:'systems',key:slug},image:`systems/${slug}.svg`,lore:systemLore[slug],mapTargets:[{type:'system',systemId:'system:'+slug}],
      text:title,content:{intro:'',ownDocument:null,moduleRefs:[]}});
  }
  for (const z of shipRecords.zones) {
    const source=schema.zones.find(s=>s.id===z.sourceKey),lore=shipLore.zones?.[z.sourceKey]||{},images=gallery(lore);
    if (!source) diagnostics.push({type:'zone',id:z.id,reason:'Район отсутствует в схеме'});
    raw[z.id]={...source,id:z.id,parent:'phenome'};
    add({id:z.id,kind:'zone',title:z.name,source:{type:'ship-zone',key:z.sourceKey},parentId:'phenome',
      zone:z.name,part:source?.part||'',poly:source?.poly||[],text:lore.text||'',images,image:images[0]||'',noLink:true,
      content:{intro:lore.text||'',ownDocument:null,moduleRefs:[]},mapTargets:source?[{type:'ship',recordId:'phenome',zoneId:z.id}]:[]});
  }
  for (const b of shipRecords.buildings) {
    const original=bld.items.find(x=>x.name===b.sourceKey)||{},lore=shipLore.buildings?.[b.sourceKey]||{};
    const schemaZones=schema.zones.filter(z=>list(z.buildings).includes(b.sourceKey));
    const explicit=original.zone||b.zone;
    const explicitZone=shipRecords.zones.find(z=>z.id===explicit||z.name===explicit);
    const schemaZone=shipRecords.zones.find(z=>z.sourceKey===schemaZones[0]?.id);
    if (explicit && !explicitZone) diagnostics.push({type:'building-zone',id:b.id,reason:'Явный район не найден',zone:explicit});
    if (schemaZones.length>1 || (explicitZone&&schemaZone&&explicitZone.id!==schemaZone.id)) diagnostics.push({type:'building-zone-conflict',id:b.id,explicit:explicitZone?.id,schema:schemaZones.map(z=>z.id)});
    const zone=explicitZone||schemaZone,images=gallery(lore);
    if (!images.length&&original.file) images.push('ship/bld/'+original.file);
    raw[b.id]={...original,id:b.id,parent:zone?.id||null,draft:!!b.draft};
    add({id:b.id,kind:'building',title:b.name,source:{type:'ship-building',key:b.sourceKey},parentId:zone?.id||null,
      zone:zone?.name||'',zoneId:zone?.id||null,draft:!!b.draft,images,image:images[0]||'',text:lore.text||'',noLink:true,
      content:{intro:lore.text||'',ownDocument:null,moduleRefs:[]},mapTargets:finite(original.x,original.y)?[{type:'ship',recordId:'phenome',buildingId:b.id,x:original.x,y:original.y}]:[]});
  }
  for (const n of list(news.items)) {
    const placeIds=unique([...list(n.places),relations.newsPlaces?.[n.id]]);
    raw[n.id]=n;
    add({id:n.id,kind:'news',title:n.title,source:{type:'news',key:n.id},story:n.story||null,places:placeIds,people:list(n.people),
      context:{storyId:n.story||null,placeIds,peopleIds:list(n.people)},summary:n.happened||'',text:[n.text,n.happened,n.why,n.now].filter(Boolean).join('\n'),
      content:{intro:n.happened||'',ownDocument:null,moduleRefs:[]}});
  }
  // Финальная регистрация закончена. Ниже только проекции и индексы; поздних add нет.
  const byId=new Map(records.map(r=>[r.id,r]));
  const resolvedModules=Object.fromEntries(Object.entries(moduleRegistry.modules).map(([moduleId,m])=>{
    const resolved={...m,moduleId,...resolveModule(docs[m.articleId],m.selector)};
    if (resolved.status!=='ok') diagnostics.push({type:'module',id:moduleId,reason:resolved.reason});
    return [moduleId,resolved];
  }));
  for (const rel of relations.items) {
    const from=byId.get(rel.from),to=byId.get(rel.to),module=resolvedModules[rel.moduleId];
    if (!from||!to) {diagnostics.push({type:'relation',id:rel.id,reason:'Запись отношения не найдена'});continue;}
    if (rel.type==='material') {
      if (rel.mode==='embed'&&from.kind==='character') {diagnostics.push({type:'forbidden-embed',id:rel.id,reason:'Персонаж допускает только переход'});continue;}
      if (rel.moduleId&&!module) {diagnostics.push({type:'relation-module',id:rel.id,reason:'Модуль не найден'});continue;}
      from.content.moduleRefs.push({relationId:rel.id,recordId:rel.to,moduleId:rel.moduleId||null,mode:rel.mode||'link',order:rel.order||0});
    }
  }
  // Совместимость article.ref/url: общий материал не становится ownDocument мировой точки.
  // Наличие проекции модулей не стирает точный адрес старой кнопки «Статья».
  for (const p of world) {
    if (!p.article) continue;
    const url=p.article.url||referenceArticles.refs[p.article.ref];
    const entry=documentEntries.find(([source])=>bare(source)===bare(url))?.[1];
    const r=byId.get(p.id),id=entry&&docId(entry),anchor=String(url||'').split('#')[1]||undefined;
    r.content.legacyArticle={recordId:id||null,url:url||null,anchor,label:p.article.label||''};
    if (!id||!byId.has(id)) {
      diagnostics.push({type:'legacy-article',id:p.id,reason:'Источник старой ссылки на статью не найден'});
      continue;
    }
    if (!r.content.moduleRefs.some(ref=>ref.recordId===id)) r.content.moduleRefs.push({relationId:null,recordId:id,moduleId:null,mode:'link',anchor,order:1000,origin:'temporary-legacy-migration'});
  }
  for (const r of records) for (const id of [r.context.storyId,...r.context.placeIds,...r.context.peopleIds].filter(Boolean)) {
    if (!byId.has(id)) diagnostics.push({type:'context',id:r.id,target:id,reason:'Контекст ссылается на неизвестный ID'});
  }
  for (const r of records) r.content.moduleRefs.sort((a,b)=>a.order-b.order);
  const mods={articles:Object.fromEntries(Object.keys(moduleRegistry.sources).map(id=>[id,id])),points:{},newsPlaces:{}};
  for (const r of records) if (r.content.moduleRefs.some(ref=>ref.mode==='embed')) mods.points[r.id]={short:true,modules:r.content.moduleRefs.filter(ref=>ref.mode==='embed').map(ref=>{
    const m=resolvedModules[ref.moduleId];return {art:m.articleId,from:m.selector.from,to:m.selector.to,title:m.title,moduleId:m.moduleId};
  })};
  for (const [id,buildingId] of Object.entries(relations.newsPlaces||{})) mods.newsPlaces[id]=byId.get(buildingId)?.title;
  const children=new Map(),allies=new Map(records.map(r=>[r.id,new Set()]));
  for (const r of records) {
    if (r.parentId) {if (!children.has(r.parentId))children.set(r.parentId,[]);children.get(r.parentId).push(r.id);}
    for (const id of r.links) if (byId.has(id)) {allies.get(r.id).add(id);allies.get(id).add(r.id);}
  }
  const table=buildAliases(records),refs=mentions(records,table),pop=Object.fromEntries(Object.entries(refs).map(([id,items])=>[id,items.length]));
  const searchIndex=buildSearchIndex(records);
  C={raw,records,byId,docs,news,table,refs,pop,mods,diagnostics,searchIndex,children,allies,
    world,characters,articlesIndex,shipLore,schema,systemList,systemLore,systemNames,moduleRegistry,relations,resolvedModules,
    presentation,annotations:presentation.annotations,shipRecords,referenceArticles,documentPolicy:'lazy-full-text'};
  // Остальные копии (анкеты) — в фоне; потом текст персонажей, упоминания и поисковый индекс пересчитываются.
  C.full=loadDocs(withFile.filter(e=>!isNow(e))).then(()=>{
    for (const r of records) if (r.kind==='character') r.text=charText(raw[r.id],r.sheet);
    C.table=buildAliases(records); C.refs=mentions(records,C.table);
    C.pop=Object.fromEntries(Object.entries(C.refs).map(([id,items])=>[id,items.length]));
    C.searchIndex=buildSearchIndex(records);
    C.documentPolicy='full';
  });
  return C;
}

export function pointModules(id) {
  return (C?.byId.get(id)?.content.moduleRefs||[]).filter(ref=>ref.mode==='embed').map(ref=>{
    const m=C.resolvedModules[ref.moduleId];
    return {moduleId:m.moduleId,title:m.title,art:m.articleId,from:m.selector.from,to:m.selector.to,blocks:m.blocks,status:m.status,reason:m.reason};
  });
}
export function alsoIn(ids,artId) {
  return C.records.filter(r=>r.content.moduleRefs.some(ref=>{
    const m=C.resolvedModules[ref.moduleId];return ref.mode==='embed'&&m?.articleId===artId&&ids.has(m.selector.from);
  })).map(r=>r.id);
}
