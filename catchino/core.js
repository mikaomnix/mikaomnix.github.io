/* =====================================================================
   كاتشينو (Catchino) — المحرك المحاسبي (من غير واجهة)
   كل حاجة "حدث" (event) ثابت مايتمسحش؛ الحالة بتتحسب بإعادة تشغيل الأحداث.
   الفلوس كلها بالقروش (أعداد صحيحة) — 1 جنيه = 100 قرش.
   ===================================================================== */
(function (root) {
'use strict';
const AR = '٠١٢٣٤٥٦٧٨٩', FA = '۰۱۲۳۴۵۶۷۸۹';
const normDigits = s => String(s == null ? '' : s).replace(/[٠-٩]/g, d => AR.indexOf(d)).replace(/[۰-۹]/g, d => FA.indexOf(d));
/* ---------- الفلوس ---------- */
const toP = v => { if (typeof v === 'number') return Math.round(v * 100); const s = normDigits(v).replace(/[,٬\s]/g, '').replace(/٫/g, '.'); const n = parseFloat(s); return isNaN(n) ? 0 : Math.round(n * 100); };
const fromP = p => (p || 0) / 100;
const fmt = (p, cur) => { const n = (p || 0) / 100; return n.toLocaleString('ar-EG', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 }) + (cur === false ? '' : ' ' + (cur || 'ج')); };
const pct = (p, rate) => Math.round(p * rate / 100);              // rate بالنسبة المئوية
const uid = () => (root.crypto && root.crypto.randomUUID) ? root.crypto.randomUUID() : 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
/* ---------- الهواتف ---------- */
const normPhone = s => { let d = normDigits(s).replace(/\D/g, ''); if (d.startsWith('0020')) d = d.slice(4); else if (d.startsWith('20') && d.length === 12) d = d.slice(2); if (d.length === 10 && d[0] === '1') d = '0' + d; return d; };
const maskPhone = s => { const d = normPhone(s); return d.length >= 8 ? d.slice(0, 3) + '****' + d.slice(-4) : d; };

/* ---------- مقدمي الخدمة (قابل للتعديل من الإعدادات) ---------- */
const DEFAULT_PROVIDERS = [
  { key: 'vodafone', name: 'Vodafone Cash', kind: 'wallet', words: ['فودافون', 'فودا', 'vodafone', 'voda', 'فوادفون'] },
  { key: 'orange', name: 'Orange Cash', kind: 'wallet', words: ['اورانج', 'أورانج', 'orange', 'اورنج'] },
  { key: 'etisalat', name: 'e& cash', kind: 'wallet', words: ['اتصالات', 'إتصالات', 'etisalat', 'e&', 'اي اند'] },
  { key: 'we', name: 'WE Pay', kind: 'wallet', words: ['وي باي', 'we pay', 'wepay', 'وي'] },
  { key: 'instapay', name: 'InstaPay', kind: 'bank', words: ['انستا', 'إنستا', 'انستاباي', 'instapay', 'insta', 'انستا باي'] },
  { key: 'khazna', name: 'Khazna', kind: 'wallet', words: ['خزنة', 'خزنه', 'khazna'] }
];
const TX_STATUS = {
  pending: 'بانتظار التنفيذ', executed: 'تم التنفيذ — بانتظار الإثبات', proof: 'الإثبات مستورد', review: 'بانتظار المراجعة',
  completed: 'مكتملة', failed: 'فاشلة', cancelled: 'ملغاة', refunded: 'مرتجعة', dispute: 'محل نزاع'
};
const DEAD = ['failed', 'cancelled', 'refunded'];
const isEffective = t => !!t.executedAt && !DEAD.includes(t.status);

/* ---------- محرك العمولات ---------- */
function applyMode(amount, m) {         // m: {mode:'fixed'|'percent'|'tiers', value, tiers:[{upTo,mode,value}], min, max}  (قيم بالقروش، والنسبة رقم)
  if (!m) return 0; let v = 0;
  if (m.mode === 'fixed') v = m.value || 0;
  else if (m.mode === 'percent') v = pct(amount, m.value || 0);
  else if (m.mode === 'tiers') { const t = (m.tiers || []).slice().sort((a, b) => (a.upTo || Infinity) - (b.upTo || Infinity)).find(x => !x.upTo || amount <= x.upTo) || (m.tiers || []).slice(-1)[0]; v = t ? (t.mode === 'percent' ? pct(amount, t.value || 0) : (t.value || 0)) : 0; }
  if (m.min != null && m.min !== '' && v < m.min) v = m.min;
  if (m.max != null && m.max !== '' && m.max > 0 && v > m.max) v = m.max;
  return Math.max(0, Math.round(v));
}
const SCOPE_RANK = { customer: 5, group: 4, wallet: 3, provider: 2, all: 1 };
function pickRule(rules, ctx) {
  const ok = (rules || []).filter(r => r.active !== false && (() => { const s = r.scope || { type: 'all' };
    if (s.type === 'all') return true; if (s.type === 'customer') return s.value === ctx.customerId; if (s.type === 'group') return !!ctx.group && s.value === ctx.group;
    if (s.type === 'wallet') return s.value === ctx.walletId; if (s.type === 'provider') return s.value === ctx.provider; return false; })());
  ok.sort((a, b) => (SCOPE_RANK[(b.scope || {}).type || 'all'] - SCOPE_RANK[(a.scope || {}).type || 'all']) || ((b.priority || 0) - (a.priority || 0)));
  return ok[0] || null;
}
function calcCommission(state, amount, ctx) {
  const rule = pickRule(state.rules ? Object.values(state.rules) : [], ctx), w = ctx.walletId && state.wallets[ctx.walletId];
  let commission = rule ? applyMode(amount, rule) : 0; const payer = rule ? (rule.payer || 'customer') : 'customer';
  if (payer === 'office') commission = 0;
  const fee = w && w.fee ? applyMode(amount, w.fee) : 0;
  return { commission, fee, net: commission - fee, payer, ruleId: rule ? rule.id : null, ruleName: rule ? rule.name : 'بدون قاعدة',
    snapshot: { rule: rule ? JSON.parse(JSON.stringify(rule)) : null, fee: w && w.fee ? JSON.parse(JSON.stringify(w.fee)) : null } };
}

/* ---------- قراية رسايل واتساب (عامية مصرية) ---------- */
const UNITS = { 'واحد': 1, 'اتنين': 2, 'اثنين': 2, 'تلاتة': 3, 'ثلاثة': 3, 'تلات': 3, 'اربعة': 4, 'أربعة': 4, 'اربع': 4, 'خمسة': 5, 'خمس': 5, 'ستة': 6, 'ست': 6, 'سبعة': 7, 'سبع': 7, 'تمانية': 8, 'ثمانية': 8, 'تمن': 8, 'تسعة': 9, 'تسع': 9, 'عشرة': 10, 'عشر': 10, 'حداشر': 11, 'اتناشر': 12, 'خمستاشر': 15, 'عشرين': 20, 'تلاتين': 30, 'اربعين': 40, 'خمسين': 50, 'ستين': 60, 'سبعين': 70, 'تمانين': 80, 'تسعين': 90 };
const HUND = { 'مية': 100, 'ميه': 100, 'مائة': 100, 'مئة': 100, 'ميتين': 200, 'مائتين': 200, 'تلتمية': 300, 'تلاتمية': 300, 'ربعمية': 400, 'اربعمية': 400, 'خمسمية': 500, 'خمسميه': 500, 'ستمية': 600, 'سبعمية': 700, 'تمنمية': 800, 'تسعمية': 900 };
const THOU_FUSED = { 'خمستلاف': 5000, 'خمستالاف': 5000, 'ستلاف': 6000, 'سبعتلاف': 7000, 'تمنتلاف': 8000, 'تسعتلاف': 9000, 'تلاتلاف': 3000, 'تلتلاف': 3000, 'اربعتلاف': 4000, 'عشرتلاف': 10000, 'الفين': 2000, 'ألفين': 2000 };
function wordsAmount(t) {
  const known = x => THOU_FUSED[x] != null || HUND[x] != null || UNITS[x] != null || /^(الف|ألف|الاف|آلاف|تلاف|الآف|مليون)$/.test(x);
  const w = t.replace(/[أإآ]/g, 'ا').split(/\s+/).filter(Boolean); let total = 0, cur = 0, found = false;
  for (let i = 0; i < w.length; i++) { let x = w[i]; if (!known(x) && x.startsWith('و') && known(x.slice(1))) x = x.slice(1);
    if (THOU_FUSED[x] != null) { total += THOU_FUSED[x]; found = true; continue; }
    if (/^(الف|ألف|الاف|آلاف|تلاف|الآف)$/.test(x)) { total += (cur || 1) * 1000; cur = 0; found = true; continue; }
    if (HUND[x] != null) { cur += HUND[x]; found = true; continue; }
    if (UNITS[x] != null) { cur += UNITS[x]; found = true; continue; }
    if (/^(مليون)$/.test(x)) { total += (cur || 1) * 1e6; cur = 0; found = true; continue; }
  }
  return found ? total + cur : 0;
}
function findPhones(t) { const s = normDigits(t).replace(/(\d)[\s\-.]+(?=\d)/g, '$1'); const m = s.match(/(?:\+?20|0020)?0?1[0125]\d{8}/g) || []; return [...new Set(m.map(normPhone).filter(p => /^01[0125]\d{8}$/.test(p)))]; }
function parseMessage(text, providers) {
  const raw = String(text || ''), t = normDigits(raw).replace(/[إأآ]/g, 'ا'), low = t.toLowerCase(); const out = { raw, amount: 0, recipient: '', phones: [], provider: '', hints: [], confidence: 0 };
  out.phones = findPhones(raw); if (out.phones.length) { const after = low.match(/(?:على|علي|ل|لرقم|رقم|الرقم)\s*:?\s*((?:\+?20)?0?1[0125][\d\s\-]{8,12})/); out.recipient = after ? normPhone(after[1]) : out.phones[out.phones.length - 1]; }
  let s = t.replace(/(?:\+?20|0020)?0?1[0125][\d\s\-.]{8,13}/g, ' ');                 // شيل أرقام التليفونات قبل البحث عن المبلغ
  const nums = []; s.replace(/(\d[\d,٬]*(?:[.٫]\d+)?)\s*(k|ك|الف|ألف|الاف|آلاف|تلاف)?/gi, (m, n, mul) => { let v = parseFloat(n.replace(/[,٬]/g, '').replace('٫', '.')); if (isNaN(v)) return; if (mul) v *= 1000; nums.push(v); });
  const plaus = nums.filter(v => v >= 1 && v <= 5e6); let amt = plaus.length ? Math.max(...plaus) : 0;
  if (!amt) amt = wordsAmount(t);
  out.amount = Math.round(amt * 100);
  const P = providers || DEFAULT_PROVIDERS; for (const p of P) { if ((p.words || []).some(w => { const ww = w.toLowerCase().replace(/[إأآ]/g, 'ا'); return ww.length <= 2 ? new RegExp('(^|\\s)' + ww + '(\\s|$)').test(low) : low.includes(ww); })) { out.provider = p.key; break; } }
  if (/العمول[ةه]\s*(علينا|عليا|عليه|عليك|على المكتب|عليكم)/.test(t)) out.hints.push('العميل كتب حاجة عن العمولة — راجعها');
  if (/(حول|حوّل|ابعت|إبعت|ابعتلي|حولي|عايز احول|اشحن|شحن|تحويل|حوالة)/.test(t)) out.hints.push('طلب تحويل');
  out.confidence = (out.amount ? 40 : 0) + (out.recipient ? 35 : 0) + (out.provider ? 15 : 0) + (out.hints.includes('طلب تحويل') ? 10 : 0);
  return out;
}

/* ---------- قراية بيانات صورة الإثبات من نص الـ OCR ---------- */
function extractProof(text, providers) {
  const raw = String(text || ''), t = normDigits(raw), low = t.toLowerCase(); const out = { amount: 0, fee: 0, ref: '', date: '', time: '', phones: [], sender: '', recipient: '', recipientName: '', provider: '', status: '' };
  const num = n => { n = n.replace(/٫/g, '.').replace(/٬/g, ','); if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(n)) n = n.replace(/,/g, ''); else if (/^\d+,\d{1,2}$/.test(n)) n = n.replace(',', '.'); else n = n.replace(/,/g, ''); return parseFloat(n); };
  // الرسوم/المصاريف: بنطلعها لوحدها ومش بنعتبرها المبلغ
  const feeRe = /(?:مصاريف|مصروفات|رسوم|عمولة|fees?|service\s*charge|charges?)[^\d\n]{0,25}(\d[\d,٬]*(?:[.٫]\d{1,2})?)/gi; let fm; while ((fm = feeRe.exec(t))) { const v = num(fm[1]); if (v > 0 && v < 1e5) out.fee = Math.round(v * 100); }
  const clean = t.replace(feeRe, ' '), am = [];
  clean.replace(/(?:تحويل|حولت|حوّلت|ارسال|إرسال|sent|transfer(?:red)?|مبلغ|المبلغ|amount|قيمة|القيمة|total|الإجمالي|الاجمالي)\s*[:\-]?\s*(?:مبلغ\s*)?(\d[\d,٬]*(?:[.٫]\d{1,2})?)/gi, (m, n) => { am.push({ v: num(n), w: 3 }); });
  clean.replace(/(?:egp|le|l\.e)\s*[:\-]?\s*(\d[\d,٬]*(?:[.٫]\d{1,2})?)/gi, (m, n) => { am.push({ v: num(n), w: 2 }); });
  clean.replace(/(\d[\d,٬]*(?:[.٫]\d{1,2})?)\s*(?:egp|le|جنيه|جنية|ج\.م|جم)/gi, (m, n) => { am.push({ v: num(n), w: 2 }); });
  const best = am.filter(x => x.v > 0 && x.v < 5e6).sort((a, b) => b.w - a.w)[0]; if (best) out.amount = Math.round(best.v * 100);
  const ref = t.match(/(?:رقم\s*(?:العملية|المرجع|المعاملة|الحركة)|المرجع|reference|ref(?:erence)?\s*(?:no|number|#)?|transaction\s*(?:id|no|number)|txn\s*id|trx\s*id|operation\s*id)\s*[:#\-]?\s*([A-Za-z0-9]{6,})/i);
  if (ref) out.ref = ref[1]; else { const lone = t.match(/\b(\d{10,16})\b/g); if (lone) { const nonPhone = lone.filter(x => !/^01[0125]\d{8}$/.test(x)); if (nonPhone.length) out.ref = nonPhone[0]; } }
  const d = t.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/) || t.match(/(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/); if (d) out.date = d[0];
  const tm = t.match(/(\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm|ص|م)?/i); if (tm) out.time = tm[0];
  out.phones = findPhones(raw); const to = low.match(/(?:الى|إلى|الي|to|المستلم|المستفيد|receiver|recipient)\s*:?\s*([^\n]{0,40})/i);
  if (to) { const ph = findPhones(to[1]); if (ph.length) out.recipient = ph[0]; else out.recipientName = to[1].replace(/[\d:+]/g, '').trim().slice(0, 30); }
  if (!out.recipient && out.phones.length) out.recipient = out.phones[out.phones.length - 1];
  const fr = low.match(/(?:من|from|المرسل|sender)\s*:?\s*([^\n]{0,30})/i); if (fr) { const ph = findPhones(fr[1]); if (ph.length) out.sender = ph[0]; }
  for (const p of (providers || DEFAULT_PROVIDERS)) { if ((p.words || []).some(w => w.length > 2 && low.includes(w.toLowerCase()))) { out.provider = p.key; break; } }
  if (/(تم\s*استلام|استلمت|وصلك|وصلتك|تم\s*(?:إضافة|اضافة)|إيداع|ايداع|received|credited|deposit)/i.test(t)) out.dir = 'in'; else if (/(تم\s*تحويل|حولت|حوّلت|ارسال|إرسال|sent|transferred|debited)/i.test(t)) out.dir = 'out';
  if (out.dir === 'in') { if (!out.sender && out.phones.length) out.sender = out.phones[0]; if (out.recipient && out.recipient === out.sender) out.recipient = ''; }
  if (/(ناجح|نجاح|تمت|تم التحويل|تم بنجاح|successful|success|completed|done)/i.test(t)) out.status = 'ناجحة'; else if (/(فشل|مرفوض|failed|declined|rejected)/i.test(t)) out.status = 'فاشلة';
  return out;
}
/* مطابقة إثبات بالعمليات المفتوحة */
function matchProof(state, ext, at) {
  const atMs = at ? new Date(at).getTime() : Date.now(); const C = [];
  for (const t of Object.values(state.tx)) { if (['completed', 'failed', 'cancelled', 'refunded'].includes(t.status)) continue; if (t.proofIds && t.proofIds.length && t.status !== 'executed') continue;
    let sc = 0; const why = [];
    if (ext.amount && t.amount === ext.amount) { sc += 50; why.push('نفس المبلغ'); } else if (ext.amount && Math.abs(t.amount - ext.amount) <= 100) { sc += 25; why.push('مبلغ قريب جداً'); }
    if (ext.recipient && t.recipient && normPhone(ext.recipient) === normPhone(t.recipient)) { sc += 30; why.push('نفس رقم المستلم'); }
    else if (ext.phones && t.recipient && ext.phones.includes(normPhone(t.recipient))) { sc += 25; why.push('رقم المستلم ظاهر في الصورة'); }
    const ref = new Date(t.executedAt || t.createdAt).getTime(), dh = Math.abs(atMs - ref) / 36e5; if (dh <= 1) { sc += 15; why.push('في نفس الساعة'); } else if (dh <= 6) { sc += 8; why.push('في نفس اليوم'); }
    const w = t.walletId && state.wallets[t.walletId]; if (ext.provider && ((w && w.provider === ext.provider) || t.provider === ext.provider)) { sc += 5; why.push('نفس الخدمة'); }
    if (sc >= 30) C.push({ txId: t.id, score: Math.min(100, sc), why });
  }
  C.sort((a, b) => b.score - a.score);
  const auto = C.length && C[0].score >= 75 && (!C[1] || C[0].score - C[1].score >= 20) ? C[0].txId : null;
  return { candidates: C.slice(0, 6), suggested: auto, ambiguous: C.length > 1 && !auto, customer: guessCustomer(state, ext) };
}
/* العميل من الأرقام اللي في الصورة: رقمه هو، أو رقم بيحوّل عليه دايماً */
function guessCustomer(state, ext) {
  const ph = [ext.recipient, ext.sender].concat(ext.phones || []).map(normPhone).filter(Boolean);
  for (const p of ph) { if (state.phoneIndex[p]) return { id: state.phoneIndex[p], phone: p, why: p === normPhone(ext.sender) && ext.dir === 'in' ? 'رقم المرسل هو رقم العميل' : p === normPhone(ext.recipient) ? 'رقم المستلم هو رقم العميل' : 'رقم العميل ظاهر في الإثبات' }; }
  for (const p of ph) { if (state.recipIndex[p]) return { id: state.recipIndex[p], phone: p, why: 'رقم بيحوّل عليه العميل ده قبل كده' }; }
  return null;
}
/* استهلاك حدود المحفظة (يومي / شهري) */
function walletUsage(state, walletId, day, startHour) {
  let d = 0, m = 0; const mon = day.slice(0, 7);
  for (const t of Object.values(state.tx)) { if (!isEffective(t) || t.walletId !== walletId || t.kind === 'receive') continue; const td = dayOf(t.executedAt, startHour); if (td === day) d += t.amount; if (td.slice(0, 7) === mon) m += t.amount; }
  return { day: d, month: m };
}

/* ---------- الحالة (من الأحداث) ---------- */
function emptyState() { return { seq: 0, customers: {}, phoneIndex: {}, recipIndex: {}, wallets: {}, rules: {}, tx: {}, proofs: {}, colls: {}, exps: {}, moves: {}, closes: {}, adjusts: {}, payouts: {}, settings: { name: 'مكتبي', currency: 'ج', dayStartHour: 6, cashOpening: 0, providers: DEFAULT_PROVIDERS, alerts: { walletLow: 100000, cashHigh: 0, creditOver: true }, templates: { proof: 'أهلاً {name} 👋\nتم تحويل {amount} على رقم {recipient} ✅\nرقم العملية: {ref}\nالمطلوب: {due}\nشكراً لتعاملك مع {office}' } }, users: {}, audit: [], seen: {}, txNo: 0 }; }
function dayOf(ts, startHour) { const d = new Date(new Date(ts).getTime() - (startHour || 0) * 36e5); const z = n => String(n).padStart(2, '0'); return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate()); }
function apply(state, ev) {
  if (state.seen[ev.id]) return state;                                   // نفس الحدث مايتطبقش مرتين (مزامنة آمنة)
  state.seen[ev.id] = 1; state.seq++; const d = ev.d || {};
  state.audit.push({ id: ev.id, t: ev.t, type: ev.type, by: ev.by || '', dev: ev.dev || '', ref: d.id || '' });
  switch (ev.type) {
    case 'settings.set': state.settings[d.key] = d.value; break;
    case 'user.upsert': state.users[d.id] = Object.assign(state.users[d.id] || {}, d); break;
    case 'cust.upsert': { const c = state.customers[d.id] = Object.assign(state.customers[d.id] || { createdAt: ev.t, phones: [], status: 'active', type: 'فرد', terms: 'after' }, d);
      c.phones = [...new Set((c.phones || []).map(normPhone).filter(Boolean))]; c.phones.forEach(p => state.phoneIndex[p] = c.id); break; }
    case 'wallet.upsert': state.wallets[d.id] = Object.assign(state.wallets[d.id] || { createdAt: ev.t, status: 'active', opening: 0 }, d); break;
    case 'rule.upsert': state.rules[d.id] = Object.assign(state.rules[d.id] || {}, d); break;
    case 'tx.create': if (!state.tx[d.id]) { state.txNo++; state.tx[d.id] = Object.assign({ no: d.no || ('T' + String(state.txNo).padStart(5, '0')), status: 'pending', createdAt: ev.t, proofIds: [], history: [] }, d); state.tx[d.id].history.push({ t: ev.t, s: 'pending', by: ev.by }); } break;
    case 'tx.update': { const t = state.tx[d.id]; if (!t) break; const f = Object.assign({}, d); delete f.id; if (t.executedAt) { delete f.amount; delete f.walletId; delete f.commission; delete f.fee; }  // بعد التنفيذ الفلوس بتتصحح بحركة، مش بتعديل
      Object.assign(t, f); t.history.push({ t: ev.t, s: 'edit', by: ev.by, f: Object.keys(f) }); break; }
    case 'party.adjust': if (!state.adjusts[d.id]) state.adjusts[d.id] = Object.assign({ createdAt: ev.t, reversed: false }, d); break;
    case 'party.adjust.reverse': if (state.adjusts[d.id]) { state.adjusts[d.id].reversed = true; state.adjusts[d.id].reverseReason = d.reason || ''; } break;
    case 'pay.out': if (!state.payouts[d.id]) state.payouts[d.id] = Object.assign({ createdAt: ev.t, reversed: false }, d); break;
    case 'pay.out.reverse': if (state.payouts[d.id]) state.payouts[d.id].reversed = true; break;
    case 'tx.execute': { const t = state.tx[d.id]; if (!t || t.executedAt || DEAD.includes(t.status)) break; if (t.customerId && t.recipient && t.kind !== 'receive') { const rp = normPhone(t.recipient); if (rp && !state.phoneIndex[rp]) state.recipIndex[rp] = t.customerId; } Object.assign(t, { walletId: d.walletId, ref: d.ref || t.ref || '', executedAt: d.executedAt || ev.t, commission: d.commission | 0, fee: d.fee | 0, net: (d.commission | 0) - (d.fee | 0), payer: d.payer || 'customer', ruleSnap: d.ruleSnap || null, status: (t.proofIds && t.proofIds.length) ? 'proof' : 'executed' });
      t.history.push({ t: ev.t, s: t.status, by: ev.by }); break; }
    case 'tx.status': { const t = state.tx[d.id]; if (!t) break; if (d.status === 'refunded' && !t.executedAt) break; if (['failed', 'cancelled'].includes(d.status) && t.status === 'completed') break; t.status = d.status; if (d.reason) t.reason = d.reason; if (d.ref) t.ref = d.ref; t.history.push({ t: ev.t, s: d.status, by: ev.by, r: d.reason || '' }); break; }
    case 'proof.add': if (!state.proofs[d.id]) state.proofs[d.id] = Object.assign({ createdAt: ev.t, txId: null }, d); break;
    case 'proof.update': if (state.proofs[d.id]) Object.assign(state.proofs[d.id], d); break;
    case 'proof.link': { const p = state.proofs[d.id], t = state.tx[d.txId]; if (!p || !t) break; if (p.txId && p.txId !== d.txId && state.tx[p.txId]) state.tx[p.txId].proofIds = state.tx[p.txId].proofIds.filter(x => x !== p.id);
      p.txId = d.txId; p.linkScore = d.score || 0; p.linkWhy = d.why || []; if (!t.proofIds.includes(p.id)) t.proofIds.push(p.id); if (!t.ref && p.ext && p.ext.ref) t.ref = p.ext.ref; if (t.status === 'executed') t.status = 'proof'; t.history.push({ t: ev.t, s: 'proof', by: ev.by }); break; }
    case 'proof.unlink': { const p = state.proofs[d.id]; if (!p || !p.txId) break; const t = state.tx[p.txId]; if (t) { t.proofIds = t.proofIds.filter(x => x !== p.id); if (t.status === 'proof' && !t.proofIds.length) t.status = 'executed'; } p.txId = null; break; }
    case 'coll.add': if (!state.colls[d.id]) state.colls[d.id] = Object.assign({ createdAt: ev.t, reversed: false }, d); break;
    case 'coll.reverse': if (state.colls[d.id]) { state.colls[d.id].reversed = true; state.colls[d.id].reverseReason = d.reason || ''; } break;
    case 'exp.add': if (!state.exps[d.id]) state.exps[d.id] = Object.assign({ createdAt: ev.t, reversed: false }, d); break;
    case 'exp.reverse': if (state.exps[d.id]) state.exps[d.id].reversed = true; break;
    case 'move.add': if (!state.moves[d.id]) state.moves[d.id] = Object.assign({ createdAt: ev.t, reversed: false }, d); break;
    case 'move.reverse': if (state.moves[d.id]) state.moves[d.id].reversed = true; break;
    case 'day.close': state.closes[d.date] = Object.assign({ closedAt: ev.t, by: ev.by, open: false }, d); break;
    case 'day.reopen': if (state.closes[d.date]) { state.closes[d.date].open = true; state.closes[d.date].reopenReason = d.reason; state.closes[d.date].reopenedAt = ev.t; } break;
  }
  return state;
}
function build(events) { const s = emptyState(); events.slice().sort((a, b) => (a.t < b.t ? -1 : a.t > b.t ? 1 : (a.n || 0) - (b.n || 0))).forEach(e => apply(s, e)); return s; }

/* ---------- الأرصدة ---------- */
function balances(state, untilTs) {
  const W = {}; for (const w of Object.values(state.wallets)) W[w.id] = w.opening || 0;
  let cash = state.settings.cashOpening || 0; const until = untilTs ? new Date(untilTs).getTime() : Infinity, inT = t => new Date(t).getTime() <= until;
  for (const t of Object.values(state.tx)) if (isEffective(t) && inT(t.executedAt) && t.walletId && W[t.walletId] != null) { if (t.kind === 'receive') W[t.walletId] += t.amount - (t.fee || 0); else W[t.walletId] -= (t.amount + (t.fee || 0)); }
  for (const c of Object.values(state.colls)) if (!c.reversed && inT(c.date || c.createdAt)) { if (c.method === 'wallet' && c.walletId && W[c.walletId] != null) W[c.walletId] += c.amount; else cash += c.amount; }
  for (const p of Object.values(state.payouts)) if (!p.reversed && inT(p.date || p.createdAt)) { if (p.method === 'wallet' && p.walletId && W[p.walletId] != null) W[p.walletId] -= p.amount; else cash -= p.amount; }
  for (const e of Object.values(state.exps)) if (!e.reversed && inT(e.date || e.createdAt)) { if (e.walletId && W[e.walletId] != null) W[e.walletId] -= e.amount; else cash -= e.amount; }
  for (const m of Object.values(state.moves)) { if (m.reversed || !inT(m.date || m.createdAt)) continue; const a = m.amount || 0, fee = m.fee || 0;
    if (m.kind === 'topup') { cash -= a; if (W[m.to] != null) W[m.to] += a - fee; }            // كاش → محفظة
    else if (m.kind === 'withdraw') { if (W[m.from] != null) W[m.from] -= a + fee; cash += a; }  // محفظة → كاش
    else if (m.kind === 'transfer') { if (W[m.from] != null) W[m.from] -= a + fee; if (W[m.to] != null) W[m.to] += a; }
    else if (m.kind === 'deposit') cash += a; else if (m.kind === 'drawing') cash -= a;
    else if (m.kind === 'adjust') { if (m.account === 'cash') cash += m.delta || 0; else if (W[m.account] != null) W[m.account] += m.delta || 0; }
  }
  const walletsTotal = Object.values(W).reduce((a, b) => a + b, 0);
  return { wallets: W, cash, walletsTotal, liquidity: walletsTotal + cash };
}
/* حساب كل عميل:
   الرصيد = عليه − دفع.  عليه: تحويلات (المبلغ + العمولة) + رصيد افتتاحي عليه + تسويات عليه + كاش صرفناه له.
   دفع: تحصيلات + سحب كاش (حوّل لنا: المبلغ − العمولة) + رصيد افتتاحي له + تسويات له.
   التحصيل بيتوزع على التحويلات: المحدد الأول، والباقي بالأقدم. */
function ledgers(state) {
  const L = {}, txPaid = {}, free = {};
  const get = id => L[id] || (L[id] = { id, due: 0, paid: 0, count: 0, amount: 0, recv: 0, commission: 0, balance: 0, open: [], lastTx: null, opening: 0 });
  for (const c of Object.values(state.customers)) { const o = c.opening || 0; if (!o) continue; const l = get(c.id); l.opening = o; if (o > 0) l.due += o; else { l.paid += -o; free[c.id] = (free[c.id] || 0) - o; } }
  const txs = Object.values(state.tx).filter(isEffective).sort((a, b) => a.executedAt < b.executedAt ? -1 : 1);
  for (const t of txs) { if (!t.customerId) continue; const l = get(t.customerId); l.count++; l.commission += t.commission || 0; l.lastTx = t.executedAt;
    if (t.kind === 'receive') { const cr = t.amount - (t.commission || 0); l.recv += t.amount; l.paid += cr; free[t.customerId] = (free[t.customerId] || 0) + cr; }
    else { const due = t.amount + (t.commission || 0); l.due += due; l.amount += t.amount; txPaid[t.id] = 0; } }
  for (const a of Object.values(state.adjusts)) { if (a.reversed || !a.partyId) continue; const l = get(a.partyId); if (a.delta > 0) l.due += a.delta; else { l.paid += -a.delta; free[a.partyId] = (free[a.partyId] || 0) - a.delta; } }
  for (const p of Object.values(state.payouts)) { if (p.reversed || !p.partyId) continue; const l = get(p.partyId); l.due += p.amount; free[p.partyId] = (free[p.partyId] || 0) - p.amount; }
  const cs = Object.values(state.colls).filter(c => !c.reversed && c.partyId).sort((a, b) => (a.date || a.createdAt) < (b.date || b.createdAt) ? -1 : 1);
  for (const c of cs) { const l = get(c.partyId); l.paid += c.amount; let rest = c.amount;
    for (const a of (c.alloc || [])) { const t = state.tx[a.txId]; if (!t || !isEffective(t) || t.kind === 'receive') continue; const due = t.amount + (t.commission || 0), can = Math.min(a.amount, due - (txPaid[t.id] || 0), rest); if (can > 0) { txPaid[t.id] = (txPaid[t.id] || 0) + can; rest -= can; } }
    free[c.partyId] = (free[c.partyId] || 0) + rest; }
  for (const t of txs) { if (!t.customerId || t.kind === 'receive') continue; const due = t.amount + (t.commission || 0); const need = due - (txPaid[t.id] || 0), f = Math.max(0, free[t.customerId] || 0), take = Math.min(need, f); if (take > 0) { txPaid[t.id] += take; free[t.customerId] -= take; } }
  for (const l of Object.values(L)) { l.balance = l.due - l.paid; l.credit = l.balance < 0 ? -l.balance : 0; }
  for (const t of txs) if (t.customerId && t.kind !== 'receive') { const due = t.amount + (t.commission || 0); if ((txPaid[t.id] || 0) < due) L[t.customerId].open.push({ txId: t.id, due, paid: txPaid[t.id] || 0, rest: due - (txPaid[t.id] || 0) }); }
  return { parties: L, txPaid };
}

/* ---------- تقرير يوم / فترة ---------- */
function report(state, from, to) {     // from/to: 'YYYY-MM-DD' (يوم شغل)
  const H = state.settings.dayStartHour || 0, inR = ts => { const d = dayOf(ts, H); return d >= from && d <= (to || from); };
  const T = Object.values(state.tx), eff = T.filter(t => isEffective(t) && inR(t.executedAt));
  const sum = (a, f) => a.reduce((s, x) => s + (f(x) || 0), 0);
  const created = T.filter(t => inR(t.createdAt));
  const colls = Object.values(state.colls).filter(c => !c.reversed && inR(c.date || c.createdAt)), exps = Object.values(state.exps).filter(e => !e.reversed && inR(e.date || e.createdAt));
  const moves = Object.values(state.moves).filter(m => !m.reversed && inR(m.date || m.createdAt)), pays = Object.values(state.payouts).filter(p => !p.reversed && inR(p.date || p.createdAt));
  const r = {
    from, to: to || from,
    completed: eff.filter(t => t.status === 'completed').length, executed: eff.length,
    failed: created.filter(t => t.status === 'failed').length, cancelled: created.filter(t => t.status === 'cancelled').length, refunded: T.filter(t => t.status === 'refunded' && t.executedAt && inR(t.executedAt)).length,
    pending: T.filter(t => t.status === 'pending').length,
    amount: sum(eff.filter(t => t.kind !== 'receive'), t => t.amount), recvAmount: sum(eff.filter(t => t.kind === 'receive'), t => t.amount), recvCount: eff.filter(t => t.kind === 'receive').length, commission: sum(eff, t => t.commission), fees: sum(eff, t => t.fee), net: sum(eff, t => t.net),
    expenses: sum(exps, e => e.amount), cashIn: sum(colls.filter(c => c.method !== 'wallet'), c => c.amount), walletIn: sum(colls.filter(c => c.method === 'wallet'), c => c.amount),
    cashOut: sum(exps.filter(e => !e.walletId), e => e.amount) + sum(moves.filter(m => m.kind === 'topup' || m.kind === 'drawing'), m => m.amount) + sum(pays.filter(p => p.method !== 'wallet'), p => p.amount), payouts: sum(pays, p => p.amount),
    collected: sum(colls, c => c.amount),
    noProof: eff.filter(t => !(t.proofIds || []).length).map(t => t.id), review: T.filter(t => t.status === 'review' || t.status === 'dispute').map(t => t.id),
    unlinkedProofs: Object.values(state.proofs).filter(p => !p.txId && !p.ignored).map(p => p.id)
  };
  r.profit = r.net - r.expenses;
  const byW = {}; eff.forEach(t => { const k = t.walletId || '-'; const o = byW[k] || (byW[k] = { count: 0, amount: 0, fees: 0 }); o.count++; o.amount += t.amount; o.fees += t.fee || 0; }); r.byWallet = byW;
  return r;
}
/* تحذيرات */
function duplicates(state) {
  const refs = {}, hashes = {}, out = [];
  for (const t of Object.values(state.tx)) if (t.ref && !DEAD.includes(t.status)) (refs[t.ref] = refs[t.ref] || []).push({ kind: 'tx', id: t.id });
  for (const p of Object.values(state.proofs)) { if (p.ext && p.ext.ref && !p.txId) (refs[p.ext.ref] = refs[p.ext.ref] || []).push({ kind: 'proof', id: p.id }); if (p.hash) (hashes[p.hash] = hashes[p.hash] || []).push(p.id); }
  for (const [k, v] of Object.entries(refs)) if (v.filter(x => x.kind === 'tx').length > 1) out.push({ type: 'ref', ref: k, items: v });
  for (const [k, v] of Object.entries(hashes)) if (v.length > 1) out.push({ type: 'image', hash: k, items: v });
  return out;
}
function refExists(state, ref, exceptTx) { if (!ref) return null; return Object.values(state.tx).find(t => t.id !== exceptTx && t.ref === ref && !DEAD.includes(t.status)) || null; }

/* ---------- الصلاحيات ---------- */
const PERMS = { approve: 'اعتماد العمليات', commission: 'تعديل العمولة', collect: 'تسجيل التحصيل', balances: 'تعديل أرصدة الحسابات', reports: 'عرض التقارير', export: 'تصدير البيانات', reopen: 'إعادة فتح يوم مغلق', users: 'إدارة المستخدمين' };
const ROLES = { admin: { name: 'مدير النظام', perms: Object.keys(PERMS) }, operator: { name: 'موظف تنفيذ التحويلات', perms: ['approve', 'collect'] }, collector: { name: 'موظف التحصيل', perms: ['collect'] }, accountant: { name: 'محاسب', perms: ['collect', 'balances', 'reports', 'export'] }, viewer: { name: 'قراءة وتقارير', perms: ['reports'] } };
const can = (user, perm) => !!user && (user.role === 'admin' || (user.perms || (ROLES[user.role] || {}).perms || []).includes(perm));

const API = { guessCustomer, walletUsage, normDigits, toP, fromP, fmt, pct, uid, normPhone, maskPhone, DEFAULT_PROVIDERS, TX_STATUS, DEAD, isEffective, applyMode, pickRule, calcCommission, wordsAmount, findPhones, parseMessage, extractProof, matchProof, emptyState, dayOf, apply, build, balances, ledgers, report, duplicates, refExists, PERMS, ROLES, can };
root.ITCore = API; if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
