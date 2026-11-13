import {blankProfile, clone, makeDocument, uid} from './workspace.js';
import {newContact, newRecord, normalizeProfile, syncLegacyFields} from './profile.js';
import {archiveImportProfile, importArchiveMatches, mergeProjectDetails} from './resumeImportReview.js';
import {projectDetails} from './projects.js';

const headings = {
  educationEntries:['教育背景','教育经历','学历教育','教育信息','教育','education','academic background'],
  workEntries:['实习与工作经历','实习与工作','实习经历','工作经历','工作经验','职业经历','实习经验','work experience','professional experience','internships','experience','employment'],
  projects:['项目经历','项目经验','项目实践','个人项目','主要项目','代表项目','projects','selected projects','project experience'],
  researchEntries:['研究经历','研究经验','科研经历','科研项目','学术经历','research experience','research','publications'],
  summary:['个人简介','自我评价','个人优势','个人总结','职业概述','简介','关于我','summary','profile','professional summary','about me'],
  skills:['专业能力','专业技能','技能与工具','技能证书','技能与证书','个人技能','技术栈','技能','核心技能','skills','technical skills','skills and tools'],
  header:['个人简历','个人信息','基本信息','联系方式','个人资料','简历','resume','résumé','curriculum vitae','contact','contact information'],
  additional:['其他信息','补充信息','荣誉奖项','荣誉与奖项','奖项','证书','校园经历','志愿经历','社会实践','获奖经历','awards','certifications','activities','volunteering','languages'],
};
const cleanHeading = value => value.toLowerCase().replace(/[\s·|｜/、&与和：:▪■◆#]/gu,'');
const byHeading = new Map(Object.entries(headings).flatMap(([key, aliases]) => aliases.map(alias => [cleanHeading(alias),key])));
const entrySections = ['educationEntries','workEntries','researchEntries','projects'];
const bullet = /^(?:[•●▪◦◆◇·\-–*]\s*|(?:\(?\d{1,2}[.、)）])\s+(?!\d))/u;
const date = /(?:19|20)\d{2}(?:[./年-]\s*(?:0?[1-9]|1[0-2])(?!\d)月?)?年?\s*(?:[—–~～－至到]|-{1,2}|to\b)\s*(?:(?:19|20)\d{2}(?:[./年-]\s*(?:0?[1-9]|1[0-2])(?!\d)月?)?年?|至今|今|现在|present|current|now)/i;
const headingParts = line => {
  const pos = line.search(/[：:]/u);
  if (pos > 0 && pos < 36) {
    const key = byHeading.get(cleanHeading(line.slice(0,pos)));
    if (key) return [key, line.slice(pos+1).trim(), line.slice(0,pos)];
  }
  const key = byHeading.get(cleanHeading(line));
  return key ? [key,'',line] : null;
};
const stripSeparators = value => value.replace(/^[\s|｜·—–-]+|[\s|｜·—–-]+$/gu,'').trim();
const orgEnd = /(?:大学|学院|学校|研究院|研究所|工作室|有限公司|实验室|事务所|集团|公司|University|Laboratory|College|Studio|Inc\.?|Ltd\.?)(?=\s|[·｜|]|$)/i;
const roleStart = /^(?:产品|运营|设计|开发|研究|数据|前端|后端|测试|交互|市场|算法|工程|计算机|信息管理|心理学|软件工程|本科|硕士|博士|BSc|MSc|Product|Software|Research|Engineer|Designer|Intern)/iu;
function identity(line) {
  const when = line.match(date)?.[0] || '';
  const rest = stripSeparators(line.replace(date,''));
  const pieces = rest.split(/\t+|\s{2,}|\s*[|｜]\s*|\s+[·/]\s+/u).map(stripSeparators).filter(Boolean);
  if (pieces.length > 1) return [pieces.slice(0,-1).join(' · '),pieces.at(-1),when];
  const end = orgEnd.exec(rest);
  if (end) {
    const i = end.index + end[0].length;
    return [rest.slice(0,i),stripSeparators(rest.slice(i)),when];
  }
  const pair = rest.match(/^(.{2,60}?)\s+(.{2,45})$/u);
  return pair && roleStart.test(pair[2]) ? [pair[1],pair[2],when] : [rest,'',when];
}

// Keep every unmatched line available for review. Dates, table cells and
// explicit bullets give better record boundaries than splitting at a keyword.
function groupRecords(lines) {
  const records = [];
  let current;
  for (const line of lines) {
    if (!line.trim()) continue;
    const point = bullet.test(line), [org,role,period] = identity(line);
    const suffix = orgEnd.exec(org);
    const heading = !point && line.length <= 135 && !/[；;。！？]/u.test(line)
      && (period || (suffix && suffix.index + suffix[0].length === org.length) || (role && roleStart.test(role)));
    if (period && !org && current && !current.period) { current.period = period; continue; }
    if (!current || (heading && (!current.period || current.organization || current.description))) {
      current = {...newRecord(), organization:point ? '' : org, title:point ? '' : role, period:point ? '' : period};
      records.push(current);
      if (!point) continue;
    }
    if (!point && !current.organization && !current.description) {
      current.organization = org; current.title = role; current.period ||= period; continue;
    }
    const body = line.replace(bullet,'').trim();
    current.description += (current.description ? '\n' : '') + body;
  }
  return records;
}

function readHeader(lines, result) {
  const {profile} = result;
  const add = (type, value) => {
    if (value && !profile.contactItems.some(c => c.value === value)) profile.contactItems.push({...newContact(type),value});
  };
  for (const original of lines) {
    let line = original;
    line = line.replace(/(?:电子邮箱|联系邮箱|邮箱|e-?mail)?\s*[:：]?\s*([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/gi, (_,v) => {add('email',v); return '\t';});
    line = line.replace(/(?:联系电话|手机号?|电话|mobile|tel(?:ephone)?)?\s*[:：]?\s*((?:\+?86[\s-]?)?1[3-9]\d(?:[\s-]?\d){8}(?!\d)|\+\d{1,3}[\s(][\d\s()-]{6,18}\d)/gi, (_,v) => {add('phone',v.trim()); return '\t';});
    line = line.replace(/(?:GitHub|作品集|网站|网址|portfolio|website)?\s*[:：]?\s*((?:https?:\/\/|www\.|github\.com\/)[^\s|｜，；]+)/gi, (_,v) => {add('link',v); return '\t';});
    for (const part of line.split(/\t+|\s{2,}|\s*[|｜]\s*/u).map(stripSeparators).filter(Boolean)) {
      const label = part.match(/^(姓名|name|求职意向|求职目标|目标岗位|应聘岗位|求职岗位|所在城市|城市|所在地|地址|到岗时间|实习安排)\s*[：:]\s*(.+)$/iu);
      if (label) {
        if (/^(姓名|name)$/i.test(label[1])) profile.name = label[2];
        else if (/岗位|求职/u.test(label[1])) result.target = label[2];
        else add(/到岗|实习/u.test(label[1]) ? 'availability' : 'city',label[2]);
      } else if (!profile.name && /^([\p{Script=Han}·]{2,6})\s+(.{2,45}(?:生|师|经理|专员|运营|策划))$/u.test(part)) {
        const [name,...target] = part.split(/\s+/); profile.name = name; result.target ||= target.join(' ');
      } else if (/每周|可实习|可到岗|尽快到岗|每周可出勤/u.test(part)) add('availability',part);
      else if (!profile.name && (/^[\p{Script=Han}·]{2,6}$/u.test(part) || /^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ.' -]{1,55}$/u.test(part))) profile.name = part;
      else if (!result.target && part.length < 45 && /实习生|经理|工程师|运营|设计师|策划|Intern|Engineer|Designer|Manager/i.test(part)) result.target = part;
      else result.other.push(part);
    }
  }
}

export function parseResumeText(text) {
  if (!text.trim()) throw new Error('没有识别到正文，可以换一个文件或粘贴文字。');
  if (text.length > 170000) throw new Error('正文过长，请选择简历所在的页或分文件导入。');
  const groups = Object.fromEntries(Object.keys(headings).map(key => [key,[]]));
  let section = 'header';
  for (const raw of text.replace(/\r\n?/g,'\n').split('\n')) {
    const line = raw.replace(/\u00a0/g,' ').trim();
    if (!line) continue;
    const found = headingParts(line);
    if (!found) { groups[section].push(line); continue; }
    section = found[0];
    if (section === 'additional') groups.additional.push(found[2]);
    if (found[1]) groups[section].push(found[1]);
  }
  const result = {profile:normalizeProfile(blankProfile),target:'',projects:[],other:[]};
  readHeader(groups.header,result);
  for (const key of entrySections) {
    const entries = groupRecords(groups[key]);
    if (entries.length > 100) throw new Error('识别出的经历过多，请校对章节和换行后再导入。');
    if (key === 'projects') result.projects = entries.map(e => ({
      id:e.id,name:e.organization,role:e.title,date:e.period,tags:[],facts:e.description.split('\n').filter(Boolean),
    }));
    else result.profile[key] = entries;
  }
  result.profile.skills = groups.skills.join('\n');
  result.profile.summary = groups.summary.join('\n');
  result.additional = [...result.other,...groups.additional].join('\n');
  delete result.other;
  return result;
}

export function importedResume(parsed, title) {
  const profile = syncLegacyFields(parsed.profile), job = {title:parsed.target, company:'', text:''};
  const doc = makeDocument({profile,job,projects:parsed.projects,template:'application'});
  doc.origin = 'file';
  if (parsed.importSource) doc.importSource = clone(parsed.importSource);
  doc.title = title.trim() || '导入的简历';
  doc.resume = {...doc.resume,sectionOrder:'application',additional:parsed.additional,
    projectBullets:Object.fromEntries(parsed.projects.map(p => [p.id,[...p.facts]]))};
  doc.versions = [{id:uid(),name:'文件导入原稿',time:doc.updatedAt,resume:clone(doc.resume),job:clone(job)}];
  return doc;
}

export function appendImportedResume(state, doc, archive, choices = {}) {
  if (state.documents.some(d => d.id === doc.id)) return state;
  const update = {...state, documents:[...state.documents,doc],activeId:doc.id};
  if (!archive) return update;
  const matches = importArchiveMatches({profile:doc.resume.profileSource,projects:doc.resume.sources},state.profile,state.library);
  const actions = {};
  for(const [id,decision] of Object.entries(choices)) {
    const match=matches.find(m=>m.id===id);
    if(typeof decision==='object' && decision?.action==='merge' && (!match || match.existing.id!==decision.targetId || JSON.stringify(match.existing)!==decision.expected))
      throw Error('资料库中的相似经历已更新，请重新核对后选择入库方式。');
    actions[id]=typeof decision==='string' ? decision : decision.action;
  }
  update.profile = archiveImportProfile(state.profile,doc.resume.profileSource,matches,actions);
  const signature = p => JSON.stringify([p.name,p.role,p.date,p.facts,projectDetails(p)]);
  const known = new Map(state.library.map(p => [signature(p),p]));
  const library = [...state.library], sources = [], usedIds = new Set();
  for (const p of doc.resume.sources) {
    const match = matches.find(m=>m.kind==='projects' && m.id===p.id), choice=actions[p.id];
    const prior = known.get(signature(p)) || (match?.exact ? match.existing : null);
    if(prior?.archived && choice!=='skip') {
      const at=library.findIndex(r=>r.id===prior.id); library[at]={...prior,archived:false};
    }
    if (!prior && choice !== 'skip') {
      if (match && choice==='merge') {
        const at=library.findIndex(r=>r.id===match.existing.id), original=library[at];
        library[at]={...original,facts:[...new Set([...original.facts,...p.facts])],details:mergeProjectDetails(original,p)};
      } else { library.push(clone(p)); known.set(signature(p),p); }
    }
    const existingId = prior?.id || (match && choice==='merge' ? match.existing.id : null);
    const id = existingId && !usedIds.has(existingId) ? existingId : p.id;
    sources.push({...p,id});
    usedIds.add(id);
  }
  // Refer to existing originals when importing an already archived project.
  const resume = {...doc.resume,sources,projectIds:sources.map(p => p.id),
    projectBullets:Object.fromEntries(sources.map((p,i) => [p.id,doc.resume.projectBullets[doc.resume.sources[i].id]]))};
  const evidence = doc.importSource && Object.fromEntries(doc.resume.sources.map((p,i)=>[sources[i].id,doc.importSource.evidence[p.id] || []]));
  update.documents = [...state.documents,{...doc,resume,
    ...(evidence ? {importSource:{...doc.importSource,evidence:{...doc.importSource.evidence,...evidence}}} : {}),
    versions:doc.versions.map(v => ({...v,resume:clone(resume)}))}];
  update.library = library;
  return update;
}
