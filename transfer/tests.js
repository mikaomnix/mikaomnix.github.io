/* اختبارات آلية للمحرك المحاسبي — بتشتغل في Node وجوه التطبيق (صفحة «اختبارات النظام») */
(function (root) {
'use strict';
function run(C) {
  const R = []; const ok = (name, cond, info) => R.push({ name, pass: !!cond, info: info == null ? '' : String(info) });
  let n = 0; const T0 = Date.parse('2026-10-09T08:00:00Z'); const ev = (type, d, mins) => ({ id: 'e' + (++n), n, t: new Date(T0 + (mins || n) * 60000).toISOString(), type, d, by: 'tester', dev: 'test' });
  const E = [];
  const push = (type, d, m) => { const e = ev(type, d, m); E.push(e); return e; };
  // إعداد: خزنة 10,000 ومحفظة فودافون 50,000 ورسوم 5 ج، وقاعدة عمولة 20 ج
  push('settings.set', { key: 'cashOpening', value: C.toP(10000) });
  push('wallet.upsert', { id: 'w1', provider: 'vodafone', name: 'فودافون كاش 1', number: '01000000001', opening: C.toP(50000), fee: { mode: 'fixed', value: C.toP(5) } });
  push('wallet.upsert', { id: 'w2', provider: 'instapay', name: 'انستاباي', opening: C.toP(20000), fee: { mode: 'percent', value: 0.1, min: C.toP(0.5), max: C.toP(20) } });
  push('rule.upsert', { id: 'r1', name: 'افتراضي', active: true, scope: { type: 'all' }, mode: 'fixed', value: C.toP(20) });
  push('rule.upsert', { id: 'r2', name: 'تجار — شرائح', active: true, scope: { type: 'group', value: 'تاجر' }, mode: 'tiers', tiers: [{ upTo: C.toP(1000), mode: 'fixed', value: C.toP(5) }, { upTo: C.toP(10000), mode: 'percent', value: 0.3 }, { mode: 'percent', value: 0.25 }], min: C.toP(5), max: C.toP(100) });
  // 1) عميل جديد مربوط برقم
  push('cust.upsert', { id: 'c1', name: 'محمد علي', phones: ['0101 234 5678', '+201112223334'], type: 'فرد', terms: 'after' });
  let S = C.build(E);
  ok('١) إضافة عميل وربطه برقمين', S.phoneIndex['01012345678'] === 'c1' && S.phoneIndex['01112223334'] === 'c1');
  // 2) طلب تحويل 5000 من رسالة
  const msg = C.parseMessage('يا إسلام عايز أحول 5000 جنيه على رقم 01098765432 فودافون كاش');
  ok('٢) قراية رسالة: المبلغ ٥٠٠٠', msg.amount === C.toP(5000), msg.amount);
  ok('٢) قراية رسالة: رقم المستلم', msg.recipient === '01098765432', msg.recipient);
  ok('٢) قراية رسالة: الخدمة فودافون', msg.provider === 'vodafone', msg.provider);
  const tests = [['عايز خمسة آلاف', 5000], ['حول لي ٥٠٠٠', 5000], ['ابعت 2500 على الرقم ده 01234567890', 2500], ['حول 10000 جنيه، والعمولة علينا', 10000], ['عايز خمستلاف على انستا', 5000], ['حول 2.5 الف', 2500], ['ابعت ألف وخمسمية', 1500], ['حول المبلغ ده من فضلك', 0]];
  tests.forEach(([t, v]) => { const p = C.parseMessage(t); ok('٢) «' + t + '» = ' + v, p.amount === C.toP(v), C.fromP(p.amount)); });
  ok('٢) «العمولة علينا» بتطلع تنبيه', C.parseMessage('حول 10000 جنيه، والعمولة علينا').hints.some(h => h.includes('العمولة')));
  push('tx.create', { id: 't1', customerId: 'c1', phone: '01012345678', recipient: msg.recipient, amount: msg.amount, provider: 'vodafone', rawMessage: msg.raw });
  S = C.build(E); ok('٢) الطلب اتعمل بحالة «بانتظار التنفيذ»', S.tx.t1 && S.tx.t1.status === 'pending');
  // 6) العمولة والرسوم: 20 - 5 = 15
  const cm = C.calcCommission(S, C.toP(5000), { customerId: 'c1', walletId: 'w1', provider: 'vodafone' });
  ok('٦) عمولة ٢٠ ورسوم ٥ وصافي ١٥', cm.commission === C.toP(20) && cm.fee === C.toP(5) && cm.net === C.toP(15), [cm.commission, cm.fee, cm.net].map(C.fromP).join('/'));
  push('tx.execute', { id: 't1', walletId: 'w1', commission: cm.commission, fee: cm.fee, payer: cm.payer, ruleSnap: cm.snapshot });
  S = C.build(E); let B = C.balances(S);
  ok('٦) المحفظة اتخصم منها ٥٠٠٥', B.wallets.w1 === C.toP(50000 - 5005), C.fromP(B.wallets.w1));
  ok('٦) الخزنة ماتأثرتش بالتحويل (العمولة مش كاش لحد ما تتحصل)', B.cash === C.toP(10000), C.fromP(B.cash));
  // 3+4) صورة إثبات
  const ocr = 'Vodafone Cash\nتم تحويل مبلغ 5,000.00 جنيه بنجاح\nإلى 01098765432\nرقم العملية: 004512345678\n09/10/2026 10:15 AM';
  const ext = C.extractProof(ocr);
  ok('٤) OCR: المبلغ', ext.amount === C.toP(5000), C.fromP(ext.amount)); ok('٤) OCR: رقم العملية', ext.ref === '004512345678', ext.ref); ok('٤) OCR: المستلم', ext.recipient === '01098765432', ext.recipient); ok('٤) OCR: الحالة ناجحة', ext.status === 'ناجحة', ext.status); ok('٤) OCR: الخدمة', ext.provider === 'vodafone', ext.provider);
  push('proof.add', { id: 'p1', hash: 'h1', ext }); S = C.build(E);
  // 5) ربط الإثبات
  const m = C.matchProof(S, ext, E[E.length - 1].t);
  ok('٥) المطابقة اقترحت العملية الصحيحة', m.candidates[0] && m.candidates[0].txId === 't1' && m.suggested === 't1', JSON.stringify(m.candidates[0]));
  push('proof.link', { id: 'p1', txId: 't1', score: m.candidates[0].score, why: m.candidates[0].why }); push('tx.status', { id: 't1', status: 'completed' });
  S = C.build(E); ok('٥) العملية بقت مكتملة ورقم المرجع اتسجل', S.tx.t1.status === 'completed' && S.tx.t1.ref === '004512345678');
  // 7+8) تحصيل جزئي 3000 من 5020
  push('coll.add', { id: 'k1', partyId: 'c1', amount: C.toP(3000), method: 'cash' }); S = C.build(E); let L = C.ledgers(S);
  ok('٨) المتبقي على العميل ٢٠٢٠ بالظبط', L.parties.c1.balance === C.toP(2020), C.fromP(L.parties.c1.balance));
  B = C.balances(S); ok('٧) الخزنة زادت ٣٠٠٠', B.cash === C.toP(13000), C.fromP(B.cash));
  // 9) عمليات تانية لنفس العميل + عميل تاجر بشرائح
  push('cust.upsert', { id: 'c2', name: 'محل النور', phones: ['01155555555'], type: 'تاجر', group: 'تاجر' });
  push('tx.create', { id: 't2', customerId: 'c1', recipient: '01011111111', amount: C.toP(1000) });
  let S2 = C.build(E); let c2 = C.calcCommission(S2, C.toP(1000), { customerId: 'c1', walletId: 'w1' }); push('tx.execute', { id: 't2', walletId: 'w1', commission: c2.commission, fee: c2.fee });
  push('tx.create', { id: 't3', customerId: 'c2', recipient: '01022222222', amount: C.toP(8000) });
  S2 = C.build(E); const c3 = C.calcCommission(S2, C.toP(8000), { customerId: 'c2', group: 'تاجر', walletId: 'w2', provider: 'instapay' });
  ok('٩) شرائح التاجر: ٨٠٠٠ × ٠٫٣٪ = ٢٤ ج', c3.commission === C.toP(24), C.fromP(c3.commission));
  ok('٩) رسوم انستاباي ٠٫١٪ = ٨ ج', c3.fee === C.toP(8), C.fromP(c3.fee));
  push('tx.execute', { id: 't3', walletId: 'w2', commission: c3.commission, fee: c3.fee });
  S = C.build(E); L = C.ledgers(S);
  ok('٩) العميل الأول: عمليتين وعليه ٣٠٤٠', L.parties.c1.count === 2 && L.parties.c1.balance === C.toP(3040), C.fromP(L.parties.c1.balance));
  // تحصيل مخصص لعملية معينة
  push('coll.add', { id: 'k2', partyId: 'c1', amount: C.toP(1020), method: 'wallet', walletId: 'w1', alloc: [{ txId: 't2', amount: C.toP(1020) }] }); S = C.build(E); L = C.ledgers(S);
  ok('٧) التحصيل المخصص سدد العملية التانية بالكامل', L.txPaid.t2 === C.toP(1020) && L.parties.c1.balance === C.toP(2020), C.fromP(L.txPaid.t2));
  // 11) رقم مرجع مكرر
  push('tx.status', { id: 't3', status: 'review', ref: '004512345678' }); S = C.build(E);
  ok('١١) اكتشاف رقم مرجع مكرر', C.duplicates(S).some(d => d.type === 'ref' && d.ref === '004512345678') && !!C.refExists(S, '004512345678', 't3'));
  push('tx.status', { id: 't3', status: 'completed', ref: 'IP99887766' });
  push('proof.add', { id: 'p2', hash: 'h1', ext: {} }); S = C.build(E); ok('١١) اكتشاف صورة مكررة', C.duplicates(S).some(d => d.type === 'image'));
  // 18) مرتجع + إلغاء + تسوية
  push('tx.create', { id: 't4', customerId: 'c2', recipient: '01033333333', amount: C.toP(500) }); push('tx.status', { id: 't4', status: 'cancelled', reason: 'العميل لغى' });
  S = C.build(E); const before = C.balances(S).wallets.w2;
  push('tx.status', { id: 't3', status: 'refunded', reason: 'الرقم غلط والفلوس رجعت' }); S = C.build(E); B = C.balances(S);
  ok('١٨) المرتجع رجّع ٨٠٠٨ للمحفظة', B.wallets.w2 - before === C.toP(8008), C.fromP(B.wallets.w2 - before));
  ok('١٨) الملغي مالوش أي أثر مالي', !C.isEffective(S.tx.t4));
  L = C.ledgers(S); ok('١٨) المرتجع اتشال من حساب التاجر', !L.parties.c2 || L.parties.c2.balance === 0, L.parties.c2 ? C.fromP(L.parties.c2.balance) : 0);
  push('move.add', { id: 'm1', kind: 'adjust', account: 'w1', delta: -C.toP(50), reason: 'فرق تسوية مع كشف فودافون' }); S = C.build(E);
  ok('١٨) التسوية اتسجلت كحركة (مش تعديل رصيد)', C.balances(S).wallets.w1 === C.toP(50000 - 5005 - 1005 + 1020 - 50), C.fromP(C.balances(S).wallets.w1));
  push('exp.add', { id: 'x1', amount: C.toP(100), category: 'مواصلات' }); push('move.add', { id: 'm2', kind: 'topup', to: 'w1', amount: C.toP(2000) });
  // 10) إقفال اليوم
  S = C.build(E); const day = C.dayOf(E[E.length - 1].t, S.settings.dayStartHour); const r = C.report(S, day);
  ok('١٠) التقرير: عمليتين ساريين (بعد المرتجع)', r.executed === 2, r.executed);
  ok('١٠) التقرير: إجمالي التحويلات ٦٠٠٠', r.amount === C.toP(6000), C.fromP(r.amount));
  ok('١٠) التقرير: عمولات ٤٠ ورسوم ١٠ وصافي ٣٠', r.commission === C.toP(40) && r.fees === C.toP(10) && r.net === C.toP(30));
  ok('١٠) التقرير: صافي بعد المصروفات -٧٠', r.profit === C.toP(-70), C.fromP(r.profit));
  ok('١٠) التقرير: كاش محصل ٣٠٠٠ + محفظة ١٠٢٠', r.cashIn === C.toP(3000) && r.walletIn === C.toP(1020));
  B = C.balances(S); ok('١٠) الخزنة = ١٠٠٠٠ + ٣٠٠٠ − ١٠٠ − ٢٠٠٠ = ١٠٩٠٠', B.cash === C.toP(10900), C.fromP(B.cash));
  ok('١٠) المرتجعة ظاهرة في التقرير', r.refunded === 1);
  // اتزان: إجمالي السيولة = الافتتاحي − التحويلات − الرسوم + التحصيل − المصروفات + التسويات
  const exp = C.toP(10000 + 50000 + 20000) - C.toP(6000) - C.toP(10) + C.toP(3000 + 1020) - C.toP(100) - C.toP(50);
  ok('اتزان: السيولة كلها مضبوطة على كل الحركات', B.liquidity === exp, C.fromP(B.liquidity) + ' = ' + C.fromP(exp));
  // 13) المزامنة: نفس الأحداث مرتين مايتحسبوش مرتين
  const S3 = C.build(E.concat(E.map(e => Object.assign({}, e))));
  ok('١٣) نفس الحدث مرتين (إعادة مزامنة) مايخصمش مرتين', C.balances(S3).liquidity === B.liquidity && Object.keys(S3.tx).length === Object.keys(S.tx).length);
  // ترتيب مختلف (جهازين) نفس النتيجة
  const S4 = C.build(E.slice().reverse()); ok('١٣) أحداث جاية بترتيب مختلف من جهازين = نفس الأرصدة', C.balances(S4).liquidity === B.liquidity);
  // 15) نسخة احتياطية واستعادة
  const back = JSON.parse(JSON.stringify(E)); const S5 = C.build(back); const L5 = C.ledgers(S5);
  ok('١٥) الاستعادة: نفس عدد الأحداث والعمليات والأرصدة', back.length === E.length && Object.keys(S5.tx).length === Object.keys(S.tx).length && C.balances(S5).cash === B.cash && L5.parties.c1.balance === C.ledgers(S).parties.c1.balance);
  // 16) الصلاحيات
  ok('١٦) موظف التحصيل مايقدرش يعدّل الأرصدة', !C.can({ role: 'collector' }, 'balances') && C.can({ role: 'collector' }, 'collect'));
  ok('١٦) القراءة بس مايقدرش يعتمد عمليات', !C.can({ role: 'viewer' }, 'approve') && C.can({ role: 'admin' }, 'reopen'));
  // تعديل بعد التنفيذ ممنوع على الفلوس
  push('tx.update', { id: 't1', amount: C.toP(9999), notes: 'ملاحظة' }); S = C.build(E);
  ok('مبلغ عملية منفذة مايتعدلش بصمت (التصحيح بحركة)', S.tx.t1.amount === C.toP(5000) && S.tx.t1.notes === 'ملاحظة');
  // رسالة فودافون كاش الحقيقية: «5.00 جنيه» ومعاها مصاريف خدمة
  const sms = C.extractProof('تم تحويل 5.00 جنيه لرقم 01007007277 مصاريف الخدمة 1 جنيه. رصيدك الحالي 120.50 جنيه. اطلب #9* للمزيد');
  ok('OCR: «5.00 جنيه» = ٥ ج مش ٥٠٠٠', sms.amount === C.toP(5), C.fromP(sms.amount)); ok('OCR: مصاريف الخدمة ١ ج اتعرفت لوحدها', sms.fee === C.toP(1), C.fromP(sms.fee)); ok('OCR: «5,00» = ٥ ج', C.extractProof('تم ارسال 5,00 جنيه').amount === C.toP(5)); ok('OCR: «5,000.00 EGP» = ٥٠٠٠', C.extractProof('Amount: 5,000.00 EGP').amount === C.toP(5000));
  // الصورة تتعرّف على العميل من رقمه حتى من غير طلب مفتوح
  push('cust.upsert', { id: 'c3', name: 'محمد', phones: ['01007007277'] }); S = C.build(E);
  const g = C.matchProof(S, sms, E[E.length - 1].t); ok('الصورة عرفت العميل من رقمه من غير طلب', g.customer && g.customer.id === 'c3', JSON.stringify(g.customer));
  ok('رقم بيحوّل عليه العميل بيتحفظ ويتعرف', C.guessCustomer(S, { recipient: '01098765432' }) && C.guessCustomer(S, { recipient: '01098765432' }).id === 'c1');
  // رصيد افتتاحي + تسوية
  push('cust.upsert', { id: 'c4', name: 'عم حسن', phones: ['01200000001'], opening: C.toP(1500) }); push('cust.upsert', { id: 'c5', name: 'تاجر ليه فلوس', phones: ['01200000002'], opening: -C.toP(800) });
  S = C.build(E); L = C.ledgers(S); ok('رصيد افتتاحي عليه ١٥٠٠', L.parties.c4.balance === C.toP(1500)); ok('رصيد افتتاحي له ٨٠٠', L.parties.c5.balance === -C.toP(800));
  push('party.adjust', { id: 'a1', partyId: 'c4', delta: -C.toP(500), reason: 'خصم اتفقنا عليه' }); S = C.build(E); L = C.ledgers(S); ok('التسوية نزلت المديونية لـ ١٠٠٠', L.parties.c4.balance === C.toP(1000));
  const cashBeforeAdj = C.balances(S).cash; ok('التسوية مالهاش أثر على الخزنة', cashBeforeAdj === B.cash);
  // سحب كاش: العميل حوّل ١٠٠٠ على محفظتنا وعمولة ١٠، وخد ٩٩٠ كاش
  const w1b = C.balances(S).wallets.w1;
  push('tx.create', { id: 't9', kind: 'receive', customerId: 'c5', amount: C.toP(1000) }); push('tx.execute', { id: 't9', walletId: 'w1', commission: C.toP(10), fee: 0 }); push('pay.out', { id: 'o1', partyId: 'c5', amount: C.toP(990), method: 'cash' });
  S = C.build(E); B = C.balances(S); L = C.ledgers(S);
  ok('سحب الكاش: المحفظة زادت ١٠٠٠', B.wallets.w1 - w1b === C.toP(1000), C.fromP(B.wallets.w1 - w1b)); ok('سحب الكاش: الخزنة نقصت ٩٩٠', cashBeforeAdj - B.cash === C.toP(990), C.fromP(cashBeforeAdj - B.cash)); ok('سحب الكاش: رصيد العميل ماتغيرش (له ٨٠٠ زي ما هو)', L.parties.c5.balance === -C.toP(800), C.fromP(L.parties.c5.balance));
  const r2 = C.report(S, C.dayOf(E[E.length - 1].t, S.settings.dayStartHour)); ok('التقرير: سحب الكاش منفصل عن التحويلات', r2.recvAmount === C.toP(1000) && r2.amount === C.toP(6000) && r2.payouts === C.toP(990), [r2.recvAmount, r2.amount, r2.payouts].map(C.fromP).join('/'));
  ok('حدود المحفظة: استهلاك اليوم ٦٠٠٠ (الإرسال بس)', C.walletUsage(S, 'w1', C.dayOf(E[E.length - 1].t, 6), 6).day === C.toP(6000), C.fromP(C.walletUsage(S, 'w1', C.dayOf(E[E.length - 1].t, 6), 6).day));
  // دقة القروش
  ok('دقة الفلوس: ٠٫١ + ٠٫٢ = ٠٫٣ بالظبط', C.toP(0.1) + C.toP(0.2) === C.toP(0.3)); ok('تحويل الأرقام العربية', C.toP('١٬٢٣٤٫٥٠') === 123450);
  return R;
}
root.ITTests = { run }; if (typeof module !== 'undefined' && module.exports) module.exports = { run };
})(typeof window !== 'undefined' ? window : globalThis);
