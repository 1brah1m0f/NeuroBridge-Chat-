/* AI IMPOSTOR: SPACE SHIP — game-flow screens (owner: flow).
 *   AS.UIFlow.init(App)
 * Role intro ("Şşş!" beat -> CREWMATE / IMPOSTOR reveal with a team lineup), meeting splash
 * (emergency / body reported), voting tablet (discussion / voting / results with voter chips),
 * ejection scene, you-were-killed overlay, end screen (VICTORY / DEFEAT).
 * Driven by App events 'phase', 'snapshot', 'ev:kill', 'lang', 'resize'.
 * DOM: <section class="screen flow-screen ..."> in #screens, killed overlay in #flash-layer.
 * Characters are drawn with AS.Art when present, otherwise with a built-in fallback star-naut.
 * Public: init(App), current() -> scene name | null, showKilled(killerId), refresh().
 * Meetings: question & answer rounds (everyone answers in turn), then voting. Free chat exists only on AI level 3+ after a found body.
 */
(function (AS) {
  'use strict';
  if (AS.isNode) return;

  // ------------------------------------------------------------------ strings
  AS.i18n.add({
    az: {
      'flow.shh': 'Şşş!',
      'flow.crewSub': 'Aramızda {n} AI saxtakar var',
      'flow.crewSub_one': 'Aramızda {n} AI saxtakar var',
      'flow.crewHint': 'Gəmini işlək saxla və AI-ları cavablarından tanı',
      'flow.impSolo': 'Ekipajı gizlicə aradan götür',
      'flow.impTeam': 'Komanda yoldaşların: {names}',
      'flow.impTeam_one': 'Komanda yoldaşın: {names}',
      'flow.impHint': 'Öldür, sabotaj et və heç kimə bildirmə',
      'flow.emergency': 'Təcili yığıncaq!',
      'flow.body': 'Cəsəd tapıldı!',
      'flow.calledBy': '{name} yığıncaq çağırdı',
      'flow.reportedBy': '{name} cəsədi tapdı',
      'flow.whoImp': 'Hansı oyunçu AI-dır?',
      'flow.stage.discussion': 'Suallar',
      'flow.stage.voting': 'Səsvermə bitir',
      'flow.stage.results': 'Nəticələr',
      'flow.voted': 'Səs verdi',
      'flow.skip': 'Keç',
      'flow.skipped': 'Keçənlər',
      'flow.confirm': 'Təsdiqlə',
      'flow.cancel': 'Ləğv et',
      'flow.yourVote': 'Sənin səsin',
      'flow.st.discussion': 'Növbə sənə çatanda cavab ver. Son sualdan sonra səsvermə açılır',
      'flow.st.vote': 'Şübhəli bildiyin oyunçunu seç və ya keç',
      'flow.st.voted': 'Səsin qəbul olundu. Digərləri gözlənilir…',
      'flow.st.dead': 'Ruhlar səs verə bilməz',
      'flow.st.results': 'Səslər sayıldı',
      'flow.dead': 'Ölü',
      'flow.left': 'Ayrıldı',
      'flow.caller': 'Yığıncağı çağıran',
      'flow.ej.was': '{name} AI saxtakar idi.',
      'flow.ej.wasAn': '{name} AI saxtakar idi.',
      'flow.ej.not': '{name} AI deyildi. Real oyunçu idi.',
      'flow.ej.notAn': '{name} AI deyildi. Real oyunçu idi.',
      'flow.ej.out': '{name} kosmosa atıldı.',
      'flow.ej.tie': 'Heç kim atılmadı. (Bərabərlik)',
      'flow.ej.skip': 'Heç kim atılmadı. (Keçildi)',
      'flow.ej.none': 'Heç kim atılmadı.',
      'flow.ej.left': '{n} AI qaldı.',
      'flow.ej.left_one': '{n} AI qaldı.',
      'flow.killed': 'Sən öldürüldün',
      'flow.killedHint': 'Artıq ruhsan — divarlardan keç və tapşırıqlarını bitir',
      'flow.victory': 'Qələbə',
      'flow.defeat': 'Məğlubiyyət',
      'flow.win.crew': 'Real oyunçular qalib gəldi',
      'flow.win.impostor': 'AI saxtakarlar qalib gəldi',
      'flow.impWere': 'AI saxtakarlar',
      'flow.impWere_one': 'AI saxtakar',
      'flow.playAgain': 'Yenidən oyna',
      'flow.lobby': 'Lobbi',
      'flow.menu': 'Əsas menyu',
      'flow.returnLobby': 'Lobbiyə qayıt',
      'flow.waitHost': 'Otaq sahibinin lobbiyə qaytarması gözlənilir…',
    },
    en: {
      'flow.shh': 'Shhh!',
      'flow.crewSub': 'There are {n} AI Impostors among us',
      'flow.crewSub_one': 'There is {n} AI Impostor among us',
      'flow.crewHint': 'Keep the ship running and spot the AIs by how they answer',
      'flow.impSolo': 'Eliminate the crew without getting caught',
      'flow.impTeam': 'Your fellow Impostors: {names}',
      'flow.impTeam_one': 'Your fellow Impostor: {names}',
      'flow.impHint': 'Kill, sabotage and trust no one',
      'flow.emergency': 'Emergency Meeting!',
      'flow.body': 'Dead Body Reported!',
      'flow.calledBy': '{name} called a meeting',
      'flow.reportedBy': '{name} found the body',
      'flow.whoImp': 'Which player is the AI?',
      'flow.stage.discussion': 'Questions',
      'flow.stage.voting': 'Voting ends in',
      'flow.stage.results': 'Results',
      'flow.voted': 'Voted',
      'flow.skip': 'Skip',
      'flow.skipped': 'Skipped',
      'flow.confirm': 'Confirm',
      'flow.cancel': 'Cancel',
      'flow.yourVote': 'Your vote',
      'flow.st.discussion': 'Answer when it is your turn. Voting opens after the last question',
      'flow.st.vote': 'Pick who you suspect — or skip',
      'flow.st.voted': 'Vote cast. Waiting for the others…',
      'flow.st.dead': "Ghosts can't vote",
      'flow.st.results': 'The votes are in',
      'flow.dead': 'Dead',
      'flow.left': 'Left',
      'flow.caller': 'Called the meeting',
      'flow.ej.was': '{name} was an AI Impostor.',
      'flow.ej.wasAn': '{name} was an AI Impostor.',
      'flow.ej.not': '{name} was not an AI. They were a real player.',
      'flow.ej.notAn': '{name} was not an AI. They were a real player.',
      'flow.ej.out': '{name} was ejected.',
      'flow.ej.tie': 'No one was ejected. (Tie)',
      'flow.ej.skip': 'No one was ejected. (Skipped)',
      'flow.ej.none': 'No one was ejected.',
      'flow.ej.left': '{n} AIs remain.',
      'flow.ej.left_one': '{n} AI remains.',
      'flow.killed': 'You were killed',
      'flow.killedHint': "You're a ghost now — float through walls and finish your tasks",
      'flow.victory': 'Victory',
      'flow.defeat': 'Defeat',
      'flow.win.crew': 'Real players win',
      'flow.win.impostor': 'The AI Impostors win',
      'flow.impWere': 'The AI Impostors',
      'flow.impWere_one': 'The AI Impostor',
      'flow.playAgain': 'Play again',
      'flow.lobby': 'Lobby',
      'flow.menu': 'Main menu',
      'flow.returnLobby': 'Return to lobby',
      'flow.waitHost': 'Waiting for the host to return to the lobby…',
    },
  });

  AS.i18n.add({
    az: { 'flow.qa.round': 'Sual {n}/{total}', 'flow.qa.yourTurn': 'Növbə səndədir: cavab yaz', 'flow.qa.waiting': '{name} cavab verir…', 'flow.qa.ready': 'Hazır ol…', 'flow.qa.done': 'Suallar bitdi. İndi səs ver', 'flow.qa.noAnswer': 'cavab vermədi', 'flow.qa.ph': 'Cavabını yaz…', 'flow.qa.phWait': 'Növbə hələ sənə çatmayıb', 'flow.qa.phDone': 'Suallar bitib', 'flow.qa.send': 'Göndər', 'flow.chatClosed': 'Sərbəst çat bağlıdır. Yalnız suallara cavab verilir.', 'flow.chatClosedHint': 'Sərbəst çat yalnız 3-cü səviyyədən başlayaraq və cəsəd tapılanda açılır.' },
    en: { 'flow.qa.round': 'Question {n}/{total}', 'flow.qa.yourTurn': 'Your turn: type your answer', 'flow.qa.waiting': '{name} is answering…', 'flow.qa.ready': 'Get ready…', 'flow.qa.done': 'Questions are over. Time to vote', 'flow.qa.noAnswer': 'no answer', 'flow.qa.ph': 'Type your answer…', 'flow.qa.phWait': 'Not your turn yet', 'flow.qa.phDone': 'Questions are over', 'flow.qa.send': 'Send', 'flow.chatClosed': 'Free chat is closed. Only questions and answers.', 'flow.chatClosedHint': 'Free chat opens only from AI level 3 and only when a body is found.' },
  });

  AS.i18n.add({
    az: { 'flow.chat': 'Çat', 'flow.chatPh': 'Mesaj yaz… (məs: harda idin?)', 'flow.send': 'Göndər', 'flow.typing': '{names} yazır…', 'flow.ghostChat': 'Ruhların çatı (yalnız ölülər görür)', 'flow.chatRate': 'Bir az yavaş yaz' },
    en: { 'flow.chat': 'Chat', 'flow.chatPh': 'Type a message… (e.g. where were you?)', 'flow.send': 'Send', 'flow.typing': '{names} typing…', 'flow.ghostChat': 'Ghost chat (only the dead see it)', 'flow.chatRate': 'Slow down a bit' },
  });

  const t = (k, p) => AS.t(k, p);
  const up = (s) => (AS.i18n.upper ? AS.i18n.upper(s) : String(s).toUpperCase());
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const sameId = (a, b) => a != null && b != null && String(a) === String(b);
  const sfx = (n) => { try { if (AS.Audio) AS.Audio.play(n); } catch (e) { /* ignore */ } };
  function el(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function por(color, hat, size, opts) {
    const url = AS.Art && AS.Art.portraitURL ? AS.Art.portraitURL(color || 'red', hat || 'none', size * 2, opts || {}) : '';
    return '<img class="fl-por" draggable="false" style="width:' + size + 'px;height:' + size + 'px" src="' + url + '" alt="">';
  }
  let App = null, scr = null, scene = null, sceneKey = '', timers = [];
  const pl = (id) => (App.snap && App.snap.players || []).find((p) => sameId(p.id, id));
  function clearTimers() { timers.forEach(clearTimeout); timers = []; }
  function later(fn, ms) { timers.push(setTimeout(fn, ms)); }
  function show(name, html) {
    clearTimers();
    scene = name;
    scr.className = 'screen flow-screen active flow-' + name;
    scr.innerHTML = html;
    return scr;
  }
  function hide() { clearTimers(); scene = null; sceneKey = ''; scr.className = 'screen flow-screen'; scr.innerHTML = ''; chat = null; qaUI = null; }

  // ------------------------------------------------------------------ role intro
  function intro(s) {
    const imp = s.self && s.self.role === 'impostor';
    show('intro', '<div class="fl-shh outline-text">' + esc(t('flow.shh')) + '</div>');
    sfx('whoosh');
    later(() => {
      const team = imp ? s.players.filter((p) => p.role === 'impostor') : s.players.filter((p) => !p.left);
      const nImp = AS.aiCountFor(s.players.filter((p) => !p.left).length);
      const mates = s.players.filter((p) => p.role === 'impostor' && !sameId(p.id, s.you)).map((p) => p.name);
      const sub = imp ? (mates.length ? t('flow.impTeam', { names: mates.join(', '), n: mates.length }) : t('flow.impSolo')) : t('flow.crewSub', { n: nImp });
      show('intro', '<div class="fl-role ' + (imp ? 'imp' : 'crew') + '"><div class="fl-role-t outline-text">' + esc(up(t(imp ? 'role.impostor' : 'role.crew'))) + '</div>' +
        '<div class="fl-role-s">' + esc(sub) + '</div><div class="fl-line">' + team.map((p) => '<div class="fl-mate' + (sameId(p.id, s.you) ? ' me' : '') + '">' + por(p.color, p.hat, 90) + '<span>' + esc(p.name) + '</span></div>').join('') +
        '</div><div class="fl-role-h">' + esc(t(imp ? 'flow.impHint' : 'flow.crewHint')) + '</div></div>');
      sfx(imp ? 'role_impostor' : 'role_crew');
    }, 1500);
  }

  // ------------------------------------------------------------------ meeting
  let chat = null, pick = null, lastStage = null, lastChatId = 0;
  function meetingSplash(s) {
    const m = s.meeting, body = m.body != null;
    const who = pl(m.caller), dead = body ? pl(m.body) : null;
    show('splash', '<div class="fl-splash ' + (body ? 'body' : 'em') + '"><div class="fl-splash-t outline-text">' + esc(up(t(body ? 'flow.body' : 'flow.emergency'))) + '</div>' +
      '<div class="fl-splash-row">' + (who ? por(who.color, who.hat, 120) : '') + (dead ? '<span class="fl-arrow">→</span>' + por(dead.color, dead.hat, 120, { dead: true }) : '') + '</div>' +
      (who ? '<div class="fl-splash-s">' + esc(t(body ? 'flow.reportedBy' : 'flow.calledBy', { name: who.name })) + '</div>' : '') + '</div>');
    sfx(body ? 'body_report' : 'emergency');
  }
  let qaUI = null, qaSig = '';
  function tablet(s) {
    show('meeting', '<div class="fl-tab panel"><div class="fl-tab-main"><div class="fl-tab-head"><b class="outline-text">' + esc(t('flow.whoImp')) + '</b><span class="fl-stage"></span></div>' +
      '<div class="fl-cards"></div><div class="fl-tab-foot"><button class="btn btn--ghost fl-skip"></button><span class="fl-skipvotes"></span><span class="fl-hint"></span></div></div>' +
      '<div class="fl-side">' +
      '<div class="fl-qa"><div class="fl-qa-head"><b class="fl-qa-round"></b><span class="fl-qa-timer"></span></div><div class="fl-qa-q"></div><div class="fl-qa-list"></div><div class="fl-qa-status"></div>' +
      '<form class="fl-qa-form"><input class="input fl-qa-in" maxlength="' + ((s.meeting && s.meeting.qa && s.meeting.qa.maxChars) || 140) + '" autocomplete="off"><button class="btn btn--primary fl-qa-send" type="submit"></button></form></div>' +
      '<div class="fl-chat closed"><div class="fl-chat-head"></div><div class="fl-chat-lock"></div><div class="fl-chat-list"></div><div class="fl-typing"></div>' +
      '<form class="fl-chat-form"><input class="input fl-chat-in" maxlength="120" autocomplete="off"><button class="btn btn--primary fl-chat-send" type="submit"></button></form></div></div></div>');
    lastChatId = 0; pick = null; qaSig = '';
    chat = { box: scr.querySelector('.fl-chat'), list: scr.querySelector('.fl-chat-list'), typing: scr.querySelector('.fl-typing'), input: scr.querySelector('.fl-chat-in'), head: scr.querySelector('.fl-chat-head'), lock: scr.querySelector('.fl-chat-lock') };
    qaUI = { round: scr.querySelector('.fl-qa-round'), timer: scr.querySelector('.fl-qa-timer'), q: scr.querySelector('.fl-qa-q'), list: scr.querySelector('.fl-qa-list'), status: scr.querySelector('.fl-qa-status'), input: scr.querySelector('.fl-qa-in'), send: scr.querySelector('.fl-qa-send') };
    scr.querySelector('.fl-chat-send').textContent = t('flow.send');
    qaUI.send.textContent = t('flow.qa.send');
    chat.input.placeholder = t('flow.chatPh');
    let lastSend = 0;
    scr.querySelector('.fl-chat-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const v = chat.input.value.trim();
      if (!v) return;
      if (performance.now() - lastSend < 800) { App.toast(t('flow.chatRate'), 1200); return; }
      lastSend = performance.now();
      App.send({ type: 'chat', text: v.slice(0, 120) });
      chat.input.value = '';
    });
    let lastTyping = 0;
    chat.input.addEventListener('input', () => { if (performance.now() - lastTyping > 2000) { lastTyping = performance.now(); App.send({ type: 'typing' }); } });
    chat.input.addEventListener('keydown', (e) => e.stopPropagation());
    // question & answer input: enabled only on my turn (the server enforces it too)
    scr.querySelector('.fl-qa-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const v = qaUI.input.value.trim();
      if (!v || qaUI.input.disabled) return;
      App.send({ type: 'answer', text: v });
      qaUI.input.value = '';
      qaUI.input.disabled = true; qaUI.send.disabled = true;
    });
    let lastQT = 0;
    qaUI.input.addEventListener('input', () => { if (performance.now() - lastQT > 1500) { lastQT = performance.now(); App.send({ type: 'typing' }); } });
    qaUI.input.addEventListener('keydown', (e) => e.stopPropagation());
    scr.querySelector('.fl-skip').addEventListener('click', () => choose('skip'));
    updateMeeting(s, true);
  }
  function choose(id) {
    const s = App.snap;
    if (!s || !s.meeting || s.meeting.stage !== 'voting' || s.meeting.myVote != null || !(s.self && s.self.alive)) return;
    if (pick === id) { App.send({ type: 'vote', target: id }); sfx('vote'); pick = null; }
    else { pick = id; sfx('click'); }
    updateMeeting(s, true);
  }
  function updateMeeting(s, force) {
    const m = s.meeting; if (!m || !scr.querySelector('.fl-cards')) return;
    const me = s.self || {};
    const stage = m.stage;
    const st = scr.querySelector('.fl-stage');
    st.textContent = (stage === 'discussion' ? t('flow.stage.discussion') : stage === 'voting' ? t('flow.stage.voting') : t('flow.stage.results')) + ' ' + (m.timer != null ? Math.ceil(m.timer) + 's' : '');
    const sig = [stage, m.voted.join(','), m.myVote, pick, JSON.stringify(m.tally || null), AS.i18n.getLang()].join('|');
    if (force || sig !== sceneKey) {
      sceneKey = sig;
      const canVote = stage === 'voting' && m.myVote == null && me.alive;
      const cards = s.players.filter((p) => !p.left || true).map((p) => {
        const dead = !p.alive, left = p.left;
        const votes = m.tally && m.tally[p.id] ? m.tally[p.id] : null;
        const chips = votes ? '<div class="fl-chips">' + votes.map((v) => { const q = v != null ? pl(v) : null; return q ? por(q.color, q.hat, 22) : '<span class="fl-anon"></span>'; }).join('') + '</div>' : '';
        const picked = pick != null && sameId(pick, p.id);
        return '<div class="fl-card' + (dead ? ' dead' : '') + (left ? ' left' : '') + (picked ? ' picked' : '') + (canVote && !dead ? ' can' : '') + (sameId(m.myVote, p.id) ? ' myvote' : '') + '" data-id="' + esc(p.id) + '">' +
          por(p.color, p.hat, 46, { dead }) + '<div class="fl-card-n"><b>' + esc(p.name) + '</b>' + (sameId(p.id, m.caller) ? ' <small>📣</small>' : '') +
          (dead ? '<small>' + esc(t(left ? 'flow.left' : 'flow.dead')) + '</small>' : '') + chips + '</div>' +
          (m.voted.some((v) => sameId(v, p.id)) && stage !== 'results' ? '<span class="fl-voted">' + esc(t('flow.voted')) + '</span>' : '') +
          (picked ? '<span class="fl-confirm"><button class="btn btn--success btn--sm fl-yes">✔</button><button class="btn btn--danger btn--sm fl-no">✖</button></span>' : '') + '</div>';
      }).join('');
      const box = scr.querySelector('.fl-cards');
      box.innerHTML = cards;
      box.querySelectorAll('.fl-card.can').forEach((c) => c.addEventListener('click', (e) => {
        if (e.target.closest('.fl-no')) { pick = null; updateMeeting(App.snap, true); return; }
        const id = s.players.find((p) => sameId(p.id, c.dataset.id)).id;
        choose(id);
      }));
      const skip = scr.querySelector('.fl-skip');
      skip.textContent = (pick === 'skip' ? '✔ ' : '') + t('flow.skip');
      skip.disabled = !canVote;
      skip.classList.toggle('picked', pick === 'skip');
      const sv = m.tally && m.tally.skip ? m.tally.skip : null;
      scr.querySelector('.fl-skipvotes').innerHTML = sv ? esc(t('flow.skipped')) + ': ' + sv.map((v) => { const q = v != null ? pl(v) : null; return q ? por(q.color, q.hat, 22) : '<span class="fl-anon"></span>'; }).join('') : '';
      scr.querySelector('.fl-hint').textContent = !me.alive ? t('flow.st.dead') : stage === 'discussion' ? t('flow.st.discussion') : stage === 'voting' ? t(m.myVote != null ? 'flow.st.voted' : 'flow.st.vote') : t('flow.st.results');
      if (stage !== lastStage) { if (stage === 'results') sfx('vote_reveal'); lastStage = stage; }
    }
    updateQA(s);
    updateChat(s);
  }
  function updateQA(s) {
    const m = s.meeting, qa = m.qa, me = s.self || {};
    if (!qaUI || !qa) return;
    const lang = AS.i18n.getLang() === 'en' ? 'en' : 'az';
    const turnId = qa.turn ? qa.turn.player : null;
    const myTurn = m.stage === 'discussion' && qa.state === 'turn' && sameId(turnId, s.you) && me.alive && !qa.answers.some((a) => sameId(a.player, s.you));
    qaUI.round.textContent = t('flow.qa.round', { n: Math.max(1, qa.round), total: qa.rounds });
    qaUI.timer.textContent = qa.turn && m.stage === 'discussion' ? Math.ceil(qa.turn.left) + 's' : '';
    qaUI.q.textContent = qa.q ? qa.q[lang] : '';
    const typingIds = (m.typing || []);
    const sig = JSON.stringify([qa.round, qa.state, qa.answers.map((a) => a.player + (a.text ? 1 : 0)), turnId, typingIds.join(','), qa.log.length, lang, m.stage, me.alive]);
    if (sig !== qaSig) {
      qaSig = sig;
      const row = (p, inner, cls) => '<div class="fl-qa-row' + (cls ? ' ' + cls : '') + (sameId(p.id, s.you) ? ' mine' : '') + '">' + por(p.color, p.hat, 26) + '<div><b style="color:' + ((AS.COLOR_BY_ID[p.color] || {}).main || '#fff') + '">' + esc(p.name) + '</b>' + inner + '</div></div>';
      let html = '';
      for (const r of qa.log) {
        if (r.round >= qa.round) continue;
        html += '<div class="fl-qa-rh">' + esc(t('flow.qa.round', { n: r.round, total: qa.rounds })) + ' · ' + esc(r.q[lang]) + '</div>';
        for (const a of r.answers) { const p = pl(a.player); if (p) html += row(p, '<p>' + esc(a.text) + '</p>'); }
      }
      if (qa.round > 0) {
        for (const id of qa.order) {
          const p = pl(id); if (!p) continue;
          const a = qa.answers.find((x) => sameId(x.player, id));
          if (a && a.text) html += row(p, '<p>' + esc(a.text) + '</p>');
          else if (a) html += row(p, '<p class="dim">' + esc(t('flow.qa.noAnswer')) + '</p>', 'skip');
          else if (sameId(id, turnId)) html += row(p, typingIds.some((x) => sameId(x, id)) ? '<p class="dim typing">…</p>' : '<p class="dim">…</p>', 'turn');
        }
      }
      qaUI.list.innerHTML = html;
      qaUI.list.scrollTop = qaUI.list.scrollHeight; // new answers always scroll into view
    }
    let status;
    if (m.stage !== 'discussion') status = t('flow.qa.done');
    else if (myTurn) status = t('flow.qa.yourTurn');
    else if (qa.turn && pl(turnId)) status = t('flow.qa.waiting', { name: pl(turnId).name });
    else status = t('flow.qa.ready');
    qaUI.status.textContent = status;
    qaUI.status.classList.toggle('mine', myTurn);
    if (qaUI.input.disabled === myTurn) {
      qaUI.input.disabled = !myTurn; qaUI.send.disabled = !myTurn;
      qaUI.input.placeholder = myTurn ? t('flow.qa.ph') : m.stage !== 'discussion' ? t('flow.qa.phDone') : t('flow.qa.phWait');
      if (myTurn) { try { qaUI.input.focus(); } catch (e) { /* ignore */ } }
    }
  }
  function updateChat(s) {
    if (!chat) return;
    const m = s.meeting, me = s.self || {};
    chat.head.textContent = me.alive === false ? t('flow.ghostChat') : t('flow.chat');
    chat.box.classList.toggle('closed', !m.freeChat);
    chat.lock.textContent = t('flow.chatClosedHint');
    if (!m.freeChat) return;
    const msgs = m.chat || [];
    const newest = msgs.length ? msgs[msgs.length - 1].id : 0;
    if (newest !== lastChatId) {
      if (newest > lastChatId && lastChatId) sfx('chat');
      lastChatId = newest;
      chat.list.innerHTML = msgs.map((c) => {
        const p = pl(c.player) || { name: '?', color: 'white', hat: 'none' };
        const mine = sameId(c.player, s.you);
        return '<div class="fl-msg' + (mine ? ' mine' : '') + (c.ghost ? ' ghost' : '') + '">' + por(p.color, p.hat, 30, { dead: !!c.ghost }) + '<div><b style="color:' + ((AS.COLOR_BY_ID[p.color] || {}).main || '#fff') + '">' + esc(p.name) + '</b><p>' + esc(c.text) + '</p></div></div>';
      }).join('');
      chat.list.scrollTop = chat.list.scrollHeight; // new messages always scroll into view
    }
    const typing = (m.typing || []).filter((id) => !sameId(id, s.you)).map((id) => (pl(id) || {}).name).filter(Boolean);
    chat.typing.textContent = typing.length ? t('flow.typing', { names: typing.slice(0, 3).join(', ') }) : '';
  }

  // ------------------------------------------------------------------ ejection
  function eject(s) {
    const e = s.ejection || {};
    const p = e.id != null ? pl(e.id) : null;
    let line;
    if (p) {
      if (e.role == null) line = t('flow.ej.out', { name: p.name });
      else line = t(e.role === 'impostor' ? 'flow.ej.was' : 'flow.ej.not', { name: p.name });
    } else line = t(e.reason === 'tie' ? 'flow.ej.tie' : e.reason === 'skip' ? 'flow.ej.skip' : 'flow.ej.none');
    const left = e.impostorsLeft != null ? t('flow.ej.left', { n: e.impostorsLeft }) : '';
    show('eject', '<div class="fl-space"></div>' + (p ? '<div class="fl-tumble">' + por(p.color, p.hat, 140) + '</div>' : '') + '<div class="fl-ej-text outline-text"></div><div class="fl-ej-left"></div>');
    sfx('eject');
    const tx = scr.querySelector('.fl-ej-text');
    let i = 0;
    const chars = Array.from(line);
    const step = () => { if (scene !== 'eject') return; tx.textContent = chars.slice(0, ++i).join(''); if (i < chars.length) later(step, 55); else later(() => { const l = scr.querySelector('.fl-ej-left'); if (l) l.textContent = left; }, 500); };
    later(step, 1200);
  }

  // ------------------------------------------------------------------ killed overlay
  function killed(ev) {
    const k = pl(ev.killer);
    const layer = document.getElementById('flash-layer') || document.body;
    const o = el('div', 'fl-killed', '<div class="fl-killed-in">' + (k ? por(k.color, k.hat, 150, { eyes: 'happy' }) : '') + '<span class="fl-slash"></span>' + por((pl(ev.victim) || {}).color, (pl(ev.victim) || {}).hat, 150, { dead: true }) +
      '</div><div class="fl-killed-t outline-text">' + esc(up(t('flow.killed'))) + '</div><div class="fl-killed-h">' + esc(t('flow.killedHint')) + '</div>');
    layer.appendChild(o);
    setTimeout(() => { o.classList.add('out'); setTimeout(() => o.remove(), 400); }, 2600);
  }

  // ------------------------------------------------------------------ end screen
  function end(s) {
    const r = s.result || { winner: 'crew', reason: 'tasks', impostors: [] };
    const myRole = s.self && s.self.role;
    const won = (r.winner === 'impostor') === (myRole === 'impostor');
    const winners = s.players.filter((p) => !p.left && ((r.winner === 'impostor') === (r.impostors.some((i) => sameId(i, p.id)))));
    const host = sameId(s.hostId, s.you);
    const imps = r.impostors.map((i) => (pl(i) || {}).name).filter(Boolean);
    show('end', '<div class="fl-end ' + (won ? 'win' : 'lose') + ' ' + r.winner + '"><div class="fl-end-t outline-text">' + esc(up(t(won ? 'flow.victory' : 'flow.defeat'))) + '</div>' +
      '<div class="fl-end-s">' + esc(t('flow.win.' + r.winner)) + ' — ' + esc(t('win.' + r.reason)) + '</div>' +
      '<div class="fl-line">' + winners.map((p) => '<div class="fl-mate">' + por(p.color, p.hat, 90, { dead: !p.alive, eyes: 'happy' }) + '<span>' + esc(p.name) + '</span></div>').join('') + '</div>' +
      '<div class="fl-end-s">' + esc(t('flow.impWere', { n: imps.length })) + ': <b class="text-impostor">' + esc(imps.join(', ')) + '</b></div>' +
      '<div class="fl-end-btns"></div></div>');
    sfx(won ? 'victory' : 'defeat');
    const btns = scr.querySelector('.fl-end-btns');
    const b = (key, cls, fn) => { const x = el('button', 'btn ' + cls); x.textContent = t(key); x.onclick = () => { sfx('click'); fn(); }; btns.appendChild(x); };
    if (App.mode === 'local') b('flow.playAgain', 'btn--primary btn--lg', () => { App.send({ type: 'returnLobby' }); setTimeout(() => App.send({ type: 'start' }), 100); });
    if (host) b('flow.returnLobby', 'btn--success', () => App.send({ type: 'returnLobby' }));
    else if (App.mode === 'online') { const w = el('div', 'mm-note'); w.textContent = t('flow.waitHost'); btns.appendChild(w); }
    b('flow.menu', 'btn--ghost', () => App.leave());
  }

  // ------------------------------------------------------------------ driver
  function sync(force) {
    const s = App.snap;
    if (!s || App.screen !== 'game') { if (scene) hide(); return; }
    const ph = s.phase;
    if (ph === 'intro') { if (scene !== 'intro') intro(s); return; }
    if (ph === 'meeting' && s.meeting) {
      if (s.meeting.stage === 'intro') { if (scene !== 'splash') meetingSplash(s); return; }
      if (scene !== 'meeting') tablet(s); else updateMeeting(s, force);
      return;
    }
    if (ph === 'ejecting') { if (scene !== 'eject') eject(s); return; }
    if (ph === 'ended') { if (scene !== 'end') end(s); return; }
    if (scene) hide();
  }

  function init(app) {
    App = app;
    scr = el('section', 'screen flow-screen');
    (document.getElementById('screens') || document.body).appendChild(scr);
    App.on('snapshot', () => sync(false));
    App.on('screen', () => sync(false));
    App.on('lang', () => { if (scene === 'meeting' || scene === 'end') { scene = null; sceneKey = ''; sync(true); } });
    App.on('ev:kill', (ev) => { if (App.snap && sameId(ev.victim, App.snap.you)) killed(ev); });
  }

  AS.UIFlow = { init, current: () => scene, showKilled: (killer) => killed({ killer, victim: App.snap && App.snap.you }), refresh: () => sync(true) };
})(globalThis.AS = globalThis.AS || {});
