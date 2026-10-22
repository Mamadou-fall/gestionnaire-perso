/* Gestionnaire perso : tout reste dans ce téléphone (localStorage). Aucun serveur. */
'use strict';
const KEY = 'gp_data_v1', HIDE = 'gp_hide', UNTIL = 'gp_until';
const ACC = [
  { id: 'epargne', n: 'Épargne', sub: 'Mis de côté', c: 'var(--epargne)' },
  { id: 'uba',     n: 'UBA',     sub: 'Banque',      c: 'var(--uba)' },
  { id: 'cash',    n: 'Cash',    sub: 'En main',     c: 'var(--cash)' },
  { id: 'wave',    n: 'Wave',    sub: 'Pour dépenser', c: 'var(--wave)', cls: 'wave' }
];
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = n => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' F';
const digits = s => parseInt(String(s).replace(/\D/g, ''), 10) || 0;
const pad2 = n => String(n).padStart(2, '0');
const dstr = d => d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
const today = () => dstr(new Date());
const dlabel = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }); };
const mlabel = (y, m) => new Date(y, m, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

/* ---------- Données ---------- */
let D = null;
function load() { try { const r = JSON.parse(localStorage.getItem(KEY)); if (r && r.acc && Array.isArray(r.tx)) return r; } catch (e) {} return null; }
function save() { try { localStorage.setItem(KEY, JSON.stringify(D)); } catch (e) { toast('Impossible d’enregistrer : le stockage du navigateur est plein ou bloqué.'); } }
const blank = (salt, hash) => ({ v: 1, salt, hash, acc: { epargne: 0, uba: 0, cash: 0, wave: 0 }, tx: [] });
const total = () => ACC.reduce((s, a) => s + (D.acc[a.id] || 0), 0);

/* ---------- Code (PBKDF2 ; repli simple si le navigateur n'a pas crypto.subtle) ---------- */
const b64 = u => btoa(String.fromCharCode(...u));
async function hashCode(code, salt) {
  if (window.crypto && crypto.subtle) {
    const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(code), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode(salt), iterations: 120000 }, k, 256);
    return b64(new Uint8Array(bits));
  }
  let h = 5381; const s = salt + code; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return 'x' + h;
}
const newSalt = () => b64(crypto.getRandomValues(new Uint8Array(12)));

/* ---------- Écran du coffre ---------- */
let mode = 'unlock', buf = '', first = '', fails = 0, unlocked = false;
const dots = () => document.querySelectorAll('#dots i').forEach((d, i) => d.classList.toggle('on', i < buf.length));
function setLock(title, sub) { $('#lockTitle').textContent = title; $('#lockSub').textContent = sub; $('#lockErr').textContent = ''; buf = ''; dots(); }
function showLock() {
  unlocked = false; closeSheet(); $('#app').hidden = true; $('#lock').hidden = false; document.body.style.overflow = 'hidden';
  D = null; D = load();
  if (!D) { mode = 'setup'; first = ''; setLock('Crée ton code', 'Choisis un code à 4 chiffres'); $('#forgot').style.visibility = 'hidden'; }
  else { mode = 'unlock'; setLock('Gestionnaire perso', 'Entre ton code'); $('#forgot').style.visibility = 'visible'; }
}
function bad(msg) { const d = $('#dots'); d.classList.remove('shake'); void d.offsetWidth; d.classList.add('shake'); $('#lockErr').textContent = msg; buf = ''; setTimeout(dots, 380); }
async function press(k) {
  const wait = Number(localStorage.getItem(UNTIL) || 0) - Date.now();
  if (mode === 'unlock' && wait > 0) { $('#lockErr').textContent = 'Trop d’essais. Réessaie dans ' + Math.ceil(wait / 1000) + ' s.'; return; }
  if (k === 'del') { buf = buf.slice(0, -1); dots(); return; }
  if (buf.length >= 4) return;
  buf += k; dots(); $('#lockErr').textContent = '';
  if (buf.length < 4) return;
  const code = buf;
  if (mode === 'setup') { first = code; mode = 'confirm'; setTimeout(() => setLock('Confirme ton code', 'Entre-le une deuxième fois'), 160); return; }
  if (mode === 'confirm') {
    if (code !== first) { mode = 'setup'; first = ''; setTimeout(() => { setLock('Crée ton code', 'Choisis un code à 4 chiffres'); bad('Les deux codes sont différents. Recommence.'); }, 200); return; }
    const salt = newSalt(); D = blank(salt, await hashCode(code, salt)); save(); enter(); return;
  }
  const ok = (await hashCode(code, D.salt)) === D.hash;
  if (ok) { fails = 0; localStorage.removeItem(UNTIL); enter(); }
  else { fails++; if (fails >= 5) { localStorage.setItem(UNTIL, String(Date.now() + 30000)); fails = 0; bad('Trop d’essais. Attends 30 secondes.'); } else bad('Code incorrect.'); }
}
$('#pad').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; if (b.dataset.d) press(b.dataset.d); else if (b.id === 'back') press('del'); });
document.addEventListener('keydown', e => { if ($('#lock').hidden) return; if (/^\d$/.test(e.key)) press(e.key); else if (e.key === 'Backspace') press('del'); });
$('#forgot').addEventListener('click', () => {
  openSheet(`<h3>Code oublié ?</h3><p>Le code ne peut pas être retrouvé. La seule solution est de <b>tout effacer</b> (soldes et dépenses) et de repartir de zéro. Si tu as une sauvegarde, tu pourras la restaurer ensuite dans Réglages.</p>
  <div class="btns"><button class="btn ghost" data-close>Annuler</button><button class="btn danger" id="wipe">Tout effacer</button></div>`,
  () => $('#wipe').onclick = () => { localStorage.removeItem(KEY); localStorage.removeItem(UNTIL); closeSheet(); showLock(); });
});

/* ---------- Entrée dans l'application ---------- */
function enter() {
  unlocked = true; $('#lock').hidden = true; $('#app').hidden = false; document.body.style.overflow = '';
  applyHide(); go('home'); resetIdle();
}
$('#lockNow').addEventListener('click', showLock);
let hideT = 0;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) hideT = Date.now();
  else if (unlocked && Date.now() - hideT > 30000) showLock();
});
let idleT; function resetIdle() { clearTimeout(idleT); idleT = setTimeout(() => { if (unlocked) showLock(); }, 120000); }
['pointerdown', 'keydown', 'scroll'].forEach(ev => document.addEventListener(ev, () => { if (unlocked) resetIdle(); }, { passive: true }));

/* ---------- Masquer les montants ---------- */
const EYE_ON = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
const EYE_OFF = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3l18 18"/><path d="M10.6 5.1A10.6 10.6 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.2M6.4 6.4A16.8 16.8 0 0 0 2 12s3.5 7 10 7a10 10 0 0 0 4.1-.9"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>';
function applyHide() { const h = localStorage.getItem(HIDE) === '1'; document.body.classList.toggle('hide', h); $('#eye').innerHTML = h ? EYE_OFF : EYE_ON; }
$('#eye').addEventListener('click', () => { localStorage.setItem(HIDE, localStorage.getItem(HIDE) === '1' ? '0' : '1'); applyHide(); });

/* ---------- Navigation ---------- */
let view = 'home', sm = { y: new Date().getFullYear(), m: new Date().getMonth() };
function go(v) {
  view = v;
  ['home', 'spend', 'stats'].forEach(n => { $('#v-' + n).hidden = n !== v; });
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.v === v));
  if (v === 'home') renderHome(); if (v === 'spend') renderSpend(); if (v === 'stats') renderStats();
  window.scrollTo(0, 0);
}
$('#tabs').addEventListener('click', e => { const b = e.target.closest('button'); if (b) go(b.dataset.v); });

const spentOn = k => D.tx.filter(t => t.d === k).reduce((s, t) => s + t.amt, 0);

/* ---------- Accueil ---------- */
function renderHome() {
  $('#total').textContent = fmt(total());
  $('#heroSub').textContent = 'Épargne + UBA + Cash + Wave';
  $('#cards').innerHTML = ACC.map(a => `<button class="card ${a.cls || ''}" data-a="${a.id}" style="--c:${a.c}">
    <span class="nm"><i></i>${a.n}</span><span class="sub">${a.sub}</span>
    <span class="am">${fmt(D.acc[a.id] || 0)}</span>
    <svg class="pen" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/></svg></button>`).join('');
  $('#todayVal').textContent = fmt(spentOn(today()));
}
$('#cards').addEventListener('click', e => { const b = e.target.closest('.card'); if (b) editAcc(b.dataset.a); });
$('#addFromHome').addEventListener('click', () => { go('spend'); setTimeout(() => $('#sAmt').focus(), 60); });

function editAcc(id) {
  const a = ACC.find(x => x.id === id);
  openSheet(`<h3>${a.n}</h3><p>Solde actuel : <b>${fmt(D.acc[id])}</b></p>
    <label class="fld"><span>Montant (F)</span><input id="eAmt" inputmode="numeric" placeholder="0" autocomplete="off"></label>
    <div class="btns">
      <button class="btn full" id="eSet">Remplacer le solde par ce montant</button>
      <button class="btn ghost" id="eAdd">+ Ajouter</button><button class="btn ghost" id="eSub">− Retirer</button>
    </div>
    ${id === 'wave' ? '<p class="hint" style="margin-top:12px">Les dépenses enregistrées dans l’onglet Dépenses se retirent déjà toutes seules de Wave.</p>' : ''}`,
  () => {
    const inp = $('#eAmt'); bindMoney(inp); setTimeout(() => inp.focus(), 80);
    const done = msg => { save(); closeSheet(); go(view); toast(msg + ' ' + a.n + ' : ' + fmt(D.acc[id])); };
    $('#eSet').onclick = () => { if (inp.value === '') return toast('Écris un montant.'); D.acc[id] = digits(inp.value); done('Solde mis à jour.'); };
    $('#eAdd').onclick = () => { const v = digits(inp.value); if (!v) return toast('Écris un montant.'); D.acc[id] += v; done('Ajouté.'); };
    $('#eSub').onclick = () => { const v = digits(inp.value); if (!v) return toast('Écris un montant.'); if (v > D.acc[id]) return toast('Il n’y a que ' + fmt(D.acc[id]) + ' sur ' + a.n + '.'); D.acc[id] -= v; done('Retiré.'); };
  });
}

/* ---------- Dépenses ---------- */
function bindMoney(inp) { inp.addEventListener('input', () => { const v = digits(inp.value); inp.value = inp.value.replace(/\D/g, '') === '' ? '' : String(v).replace(/\B(?=(\d{3})+(?!\d))/g, ' '); }); }
bindMoney($('#sAmt'));
function renderSpend() {
  if (!$('#sDate').value) $('#sDate').value = today();
  $('#sDate').max = today();
  $('#sHint').className = 'hint'; $('#sHint').textContent = 'Wave : ' + fmt(D.acc.wave) + ' (la dépense sera retirée de ce compte)';
  const list = [...D.tx].sort((a, b) => b.d.localeCompare(a.d) || b.t - a.t);
  if (!list.length) { $('#spendList').innerHTML = '<p class="empty">Aucune dépense pour l’instant.<br>Ta première dépense apparaîtra ici.</p>'; return; }
  let html = '', cur = '', n = 0;
  for (const t of list) {
    if (++n > 80) break;
    if (t.d !== cur) { cur = t.d; html += `<div class="dayhead"><span>${esc(dlabel(cur))}</span><span>${fmt(spentOn(cur))}</span></div>`; }
    html += `<div class="row"><span class="n">${esc(t.note || 'Dépense')}</span><span class="a">${fmt(t.amt)}</span><button class="x" data-del="${t.id}" aria-label="Supprimer cette dépense">×</button></div>`;
  }
  $('#spendList').innerHTML = html;
}
$('#spendForm').addEventListener('submit', e => {
  e.preventDefault();
  const amt = digits($('#sAmt').value), d = $('#sDate').value || today(), h = $('#sHint');
  if (!amt) { h.className = 'hint bad'; h.textContent = 'Écris le montant dépensé.'; return; }
  if (d > today()) { h.className = 'hint bad'; h.textContent = 'La date ne peut pas être dans le futur.'; return; }
  if (amt > D.acc.wave) { h.className = 'hint bad'; h.textContent = 'Il ne reste que ' + fmt(D.acc.wave) + ' sur Wave. Ajoute d’abord de l’argent sur Wave (Accueil).'; return; }
  D.tx.push({ id: uid(), d, amt, note: $('#sNote').value.trim().slice(0, 40), t: Date.now() }); D.acc.wave -= amt; save();
  $('#sAmt').value = ''; $('#sNote').value = ''; $('#sDate').value = today();
  renderSpend(); toast('Enregistré. Wave : ' + fmt(D.acc.wave) + ' · Aujourd’hui : ' + fmt(spentOn(today())));
});
$('#spendList').addEventListener('click', e => {
  const b = e.target.closest('[data-del]'); if (!b) return; const t = D.tx.find(x => x.id === b.dataset.del); if (!t) return;
  openSheet(`<h3>Supprimer cette dépense ?</h3><p>${esc(t.note || 'Dépense')} · ${fmt(t.amt)} · ${esc(dlabel(t.d))}<br>Le montant sera remis sur Wave.</p>
    <div class="btns"><button class="btn ghost" data-close>Annuler</button><button class="btn danger" id="yesDel">Supprimer</button></div>`,
  () => $('#yesDel').onclick = () => { D.tx = D.tx.filter(x => x.id !== t.id); D.acc.wave += t.amt; save(); closeSheet(); renderSpend(); toast('Supprimée. Wave : ' + fmt(D.acc.wave)); });
});

/* ---------- Statistiques ---------- */
function renderStats() {
  const { y, m } = sm, now = new Date(), nd = new Date(y, m + 1, 0).getDate(), pre = y + '-' + pad2(m + 1) + '-';
  $('#mLabel').textContent = mlabel(y, m);
  const per = Array(nd).fill(0); D.tx.forEach(t => { if (t.d.startsWith(pre)) per[Number(t.d.slice(8)) - 1] += t.amt; });
  const tot = per.reduce((a, b) => a + b, 0), isNow = y === now.getFullYear() && m === now.getMonth();
  const elapsed = isNow ? now.getDate() : (new Date(y, m, 1) > now ? 0 : nd);
  $('#mTotal').textContent = fmt(tot);
  $('#mAvg').textContent = fmt(elapsed ? tot / elapsed : 0);
  const mx = Math.max(...per), mi = per.indexOf(mx);
  $('#mMax').innerHTML = mx > 0 ? fmt(mx) + `<small>${esc(dlabel(pre + pad2(mi + 1)))}</small>` : '—';
  $('#mNext').style.visibility = isNow || new Date(y, m, 1) > now ? 'hidden' : 'visible';
  // graphique
  const W = 340, H = 150, top = 14, bot = 22, bw = W / nd, ch = H - top - bot;
  let bars = '', lab = '';
  per.forEach((v, i) => {
    const h = mx ? Math.max(v ? 3 : 0, (v / mx) * ch) : 0, x = i * bw + bw * 0.14, w = bw * 0.72;
    const isMax = v > 0 && i === mi, isToday = isNow && i + 1 === now.getDate();
    bars += `<rect x="${x.toFixed(1)}" y="${(top + ch - h).toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="2.5" fill="${isMax ? '#dcb561' : '#3f7a61'}"><title>${i + 1} : ${fmt(v)}</title></rect>`;
    if (!v) bars += `<rect x="${x.toFixed(1)}" y="${top + ch - 2}" width="${w.toFixed(1)}" height="2" rx="1" fill="#25382f"/>`;
    if (i === 0 || (i + 1) % 5 === 0) lab += `<text x="${(i * bw + bw / 2).toFixed(1)}" y="${H - 5}" text-anchor="middle" font-size="10" fill="${isToday ? '#dcb561' : '#98a89e'}">${i + 1}</text>`;
  });
  $('#chart').innerHTML = tot ? `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Dépenses par jour">${bars}${lab}</svg>` : '<p class="empty" style="padding:30px 0">Aucune dépense ce mois-ci.</p>';
  $('#dayList').innerHTML = per.map((v, i) => v ? [i, v] : null).filter(Boolean).reverse()
    .map(([i, v]) => `<div class="row"><span class="n">${esc(dlabel(pre + pad2(i + 1)))}</span><span class="a">${fmt(v)}</span></div>`).join('');
}
$('#mPrev').addEventListener('click', () => { sm = { y: sm.m ? sm.y : sm.y - 1, m: sm.m ? sm.m - 1 : 11 }; renderStats(); });
$('#mNext').addEventListener('click', () => { sm = { y: sm.m < 11 ? sm.y : sm.y + 1, m: sm.m < 11 ? sm.m + 1 : 0 }; renderStats(); });

/* ---------- Réglages ---------- */
$('#gear').addEventListener('click', () => {
  openSheet(`<h3>Réglages</h3><p>Tes données restent seulement dans ce téléphone.</p>
    <p style="margin-bottom:8px"><b style="color:var(--ink)">Changer le code</b></p>
    <label class="fld"><span>Code actuel</span><input id="cOld" type="password" inputmode="numeric" maxlength="4" autocomplete="off"></label>
    <label class="fld"><span>Nouveau code (4 chiffres)</span><input id="cNew" type="password" inputmode="numeric" maxlength="4" autocomplete="off"></label>
    <button class="btn wide" id="cGo">Changer le code</button><p class="hint" id="cMsg" style="margin-top:8px"></p>
    <div class="sep"></div>
    <p style="margin-bottom:8px"><b style="color:var(--ink)">Sauvegarde</b><br>À faire de temps en temps : si tu changes de téléphone ou vides le navigateur, sans sauvegarde tout est perdu.</p>
    <div class="btns"><button class="btn ghost" id="bk">Sauvegarder</button><button class="btn ghost" id="rs">Restaurer</button></div>
    <input type="file" id="rsFile" accept="application/json,.json" hidden>
    <div class="sep"></div><button class="btn danger wide" id="wipeAll">Tout effacer</button>`,
  () => {
    $('#cGo').onclick = async () => {
      const o = $('#cOld').value, n = $('#cNew').value, m = $('#cMsg'); m.className = 'hint bad';
      if (!/^\d{4}$/.test(n)) return m.textContent = 'Le nouveau code doit avoir 4 chiffres.';
      if ((await hashCode(o, D.salt)) !== D.hash) return m.textContent = 'Le code actuel est incorrect.';
      D.salt = newSalt(); D.hash = await hashCode(n, D.salt); save(); closeSheet(); toast('Code changé.');
    };
    $('#bk').onclick = () => {
      const b = new Blob([JSON.stringify(D)], { type: 'application/json' }), a = document.createElement('a');
      a.href = URL.createObjectURL(b); a.download = 'gestionnaire-perso-' + today() + '.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 3000); toast('Sauvegarde téléchargée.');
    };
    $('#rs').onclick = () => $('#rsFile').click();
    $('#rsFile').onchange = e => {
      const f = e.target.files[0]; if (!f) return; const r = new FileReader();
      r.onload = () => { try {
        const j = JSON.parse(r.result); if (!j.acc || !Array.isArray(j.tx) || !j.salt || !j.hash) throw 0;
        openSheet(`<h3>Restaurer cette sauvegarde ?</h3><p>Les données actuelles seront remplacées, et le code redevient celui de la sauvegarde.</p><div class="btns"><button class="btn ghost" data-close>Annuler</button><button class="btn" id="yesRs">Restaurer</button></div>`,
          () => $('#yesRs').onclick = () => { D = j; save(); closeSheet(); showLock(); toast('Sauvegarde restaurée. Entre ton code.'); });
      } catch (x) { toast('Ce fichier n’est pas une sauvegarde valide.'); } };
      r.readAsText(f);
    };
    $('#wipeAll').onclick = () => openSheet(`<h3>Tout effacer ?</h3><p>Soldes, dépenses et code seront supprimés définitivement.</p><div class="btns"><button class="btn ghost" data-close>Annuler</button><button class="btn danger" id="yesWipe">Effacer</button></div>`,
      () => $('#yesWipe').onclick = () => { localStorage.removeItem(KEY); closeSheet(); showLock(); });
  });
});

/* ---------- Fenêtre et message ---------- */
function openSheet(html, after) { $('#sheetBox').innerHTML = html; $('#sheet').hidden = false; after && after(); }
function closeSheet() { $('#sheet').hidden = true; $('#sheetBox').innerHTML = ''; }
$('#sheet').addEventListener('click', e => { if (e.target.closest('[data-close]')) closeSheet(); });
let tt; function toast(m) { const t = $('#toast'); t.textContent = m; t.hidden = false; clearTimeout(tt); tt = setTimeout(() => t.hidden = true, 3200); }

showLock();
if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
