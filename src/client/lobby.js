addEventListener('error', e => { const d = document.getElementById('err'); d.style.display = 'block'; d.textContent += (e.message || 'error') + ' ' + (e.filename || '').split('/').pop() + ':' + (e.lineno || '') + '\n'; });
const $ = id => document.getElementById(id), ctx = $('c').getContext('2d');
$('ver').textContent = VERSION;
const vw = () => $('c').clientWidth, vh = () => $('c').clientHeight;
let electedDone = false, joinRetry = null, joinInfo = null, gotRoster = false, lobbyTimer = null, startMsg = null, peer, roster = [], coordConns = [], lobbyConn = null, hostConn = null, sim = null, links = {}, me = 0, iAmHost = false;
let G = null, snaps = [], fx = [], local = null, sc = 1, ox = 0, oy = 0, pressed = false, lastSend = 0, over = null;
let netNote = '';
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// status line under the dialog: the connection note (muted) and the current message; kind 'err' marks a problem
const msg = (t, kind) => { const el = $('msg'); el.className = kind || ''; el.innerHTML = (netNote ? '<div class="note">' + esc(netNote).replace(/\n/g, '<br>') + '</div>' : '') + (t ? '<div class="main">' + esc(t).replace(/\n/g, '<br>') + '</div>' : ''); el.style.display = netNote || t ? '' : 'none'; };
const myName = () => $('name').value.trim() || 'Player' + Math.floor(Math.random() * 90 + 10);

// ---------- lobby ----------
const urlq = new URLSearchParams(location.search);
// development links: ?field=caves&corridor=240&loops=30&rough=80&tilt=80&seed=7 (cave tuning is not in the dialog)
const COLS = ['cyan', 'magenta', 'lightgreen', 'yellow', 'orange']; // the ships' colours, in order
const fillSelect = (sel, items, none) => { sel.innerHTML = (none ? '<option value="none">None</option>' : '') + items.map(d => '<option value="' + d.id + '">' + d.label + '</option>').join(''); };
const fillWeapons = (sel, none) => fillSelect(sel, VOD.list('weapons'), none); // dialogs list whatever is registered: playfields in src/playfields, weapons in src/weapons
fillSelect($('field'), VOD.list('playfields')); fillSelect($('sfield'), VOD.list('playfields'));
if (urlq.get('field') && VOD.playfields[urlq.get('field')]) $('field').value = $('sfield').value = urlq.get('field');
fillWeapons($('sweapon'), true); fillWeapons($('pweapon'), false);
const weaponLabel = id => (VOD.weapons[id] || { label: '' }).label;
const weaponsOnline = () => $('weaponsOn').checked; // weapons in an online game: only when the host switched them on; then every player picks their own
const gameOpts = (fresh, weapons, field) => Object.assign({}, ((VOD.playfields[field] || {}).client || {}).opts ? VOD.playfields[field].client.opts(urlq, fresh) : {}, { weapons });
function onIncoming(c, m) {
  if (m.t === 'hello') { const had = roster.find(r => r.pid === m.pid); if (had) { if (VOD.weapons[m.weapon]) had.weapon = m.weapon; if (!electedDone) showRoster(); return; } // a repeated hello (the joiner is not sure we heard it) is not a second player
    if (roster.length >= 5 || electedDone) { c.send({ t: 'full' }); return; } roster.push({ pid: m.pid, name: m.name, weapon: VOD.weapons[m.weapon] ? m.weapon : 'gun', conn: c }); coordConns.push(c); showRoster(); }
  else if (m.t === 'weapon') { const r = roster.find(r => r.pid === c.metadata_pid); if (r && !electedDone && VOD.weapons[m.w]) { r.weapon = m.w; showRoster(); } }
  else if (m.t === 'join') { links[m.pid] = c; if (sim && sim.started) { const i = roster.findIndex(r => r.pid === m.pid); if (i >= 0) c.send(sim.init(i)); } else maybeLaunch(); } // a joiner that missed the start gets it again
  else if (m.t === 'fire' && sim) { const i = roster.findIndex(r => r.pid === c.metadata_pid); sim.fire(i, m.target); }
  else if (m.t === 'detonate' && sim) { const i = roster.findIndex(r => r.pid === c.metadata_pid); sim.detonate(i); }
  else if (m.t === 'thrust' && sim) { const i = roster.findIndex(r => r.pid === c.metadata_pid); sim.setThrust(i, m.k, m.x, m.y); }
}
// Housekeeping while the game is being set up: every 2 s, repeat whatever might have been lost on the way (the relay can drop messages while it reconnects). All of it is safe to receive twice.
const sendHello = () => { if (lobbyConn && joinInfo) lobbyConn.send({ t: 'hello', pid: joinInfo.pid, name: joinInfo.name, weapon: $('pweapon').value }); };
let tickN = 0;
function lobbyTick() {
  if (!peer) return; tickN++;
  if (!lobbyConn) { if (startMsg && coordConns.every(c => links[c.metadata_pid])) { clearInterval(lobbyTimer); lobbyTimer = null; return; } // the game's creator; once everybody is in the game: done
    if (startMsg) coordConns.forEach(c => { if (!links[c.metadata_pid]) c.send(startMsg); }); else if (roster.length > 1 && tickN % 2 === 0) showRoster(); } // the start message again for anybody who has not joined; or the roster again
  else { if (G) { clearInterval(lobbyTimer); lobbyTimer = null; return; }
    if (hostConn) hostConn.send({ t: 'join', pid: peer.id }); else sendHello(); } // not in yet: join again / hello again
}
const startLobbyTimer = () => { clearInterval(lobbyTimer); lobbyTimer = setInterval(lobbyTick, 2000); };
const gameCode = () => ($('code').value.toLowerCase().replace(/[^a-z0-9_-]/g, '').replace(/^[-_]+|[-_]+$/g, '') || 'a'); // the code is not secret: anyone who types it can join
function showBlocked(txt) { const d = document.getElementById('err'); d.style.display = 'block'; d.textContent += txt + '\n'; }
document.addEventListener('securitypolicyviolation', e => showBlocked('Blocked by the page security policy: ' + e.blockedURI + ' (' + e.violatedDirective + ')'));
addEventListener('pagehide', () => { try { if (peer) peer.destroy(); } catch (_) {} });
function newPeer(id, ready) {
  if (peer) { try { peer.destroy(); } catch (_) {} peer = null; }
  netNote = ''; msg('Connecting...'); startPeer(relayConfig() ? 'relay' : 'local', id, ready);
}
function startPeer(kind, id, ready) {
  if (kind === 'local' && typeof BroadcastChannel === 'undefined') { msg('This browser cannot connect players here.', 'err'); return; }
  const rc = relayConfig(); let opened = false, dead = false, tm;
  const fail = why => { if (dead) return; dead = true; clearTimeout(tm); try { p.destroy(); } catch (_) {} msg((kind === 'relay' ? 'Could not connect to the relay: ' : 'Connection error: ') + why + '.', 'err'); };
  const p = peer = kind === 'relay' ? new RelayPeer(id, { base: rc.base, key: rc.key, room: 'g-' + gameCode() }) : new LocalPeer(id);
  tm = setTimeout(() => { if (!opened) fail('no answer in 20 seconds'); }, 20000); // the transport itself retries a few times within this
  p.on('open', i => { if (dead) return; opened = true; clearTimeout(tm); netNote = 'Connection: ' + (kind === 'relay' ? 'relay (' + rc.host + ')' : 'same browser only (development)'); msg(''); ready(i); });
  p.on('error', e => {
    if (dead) return;
    if (e.type === 'unavailable-id') { dead = true; clearTimeout(tm); msg('The game ID "' + gameCode() + '" is already in use. Pick another ID.', 'err'); }
    else if (e.type === 'peer-unavailable' && joinRetry && joinRetry()) return; // the host may just be reconnecting: try again a few times
    else if (e.type === 'peer-unavailable') msg('No game found with the ID "' + gameCode() + '". Check the ID, and that the host has pressed Host game.' + (!rc ? ' To play with others, open this page with the relay address and key.' : ''), 'err');
    else if (!opened) fail(e.type === 'relay-refused' ? 'the secret is wrong, or the relay is unreachable' : e.type || 'error'); else msg('Network error (' + e.type + ').', 'err');
  });
  p.on('reconnecting', () => { if (opened) msg('Connection to the relay lost, reconnecting...'); });
  p.on('reconnected', () => { if (opened) { msg(''); lobbyTick(); } });
  p.on('disconnected', () => { if (opened) msg('Lost the connection to the relay and could not get it back. Reload the page to try again.', 'err'); });
  p.on('connection', c => c.on('data', m => { if (m.pid) c.metadata_pid = m.pid; onIncoming(c, m); }));
}
const fieldName = f => (VOD.playfields[f] || { label: '' }).label;
function renderLobby(names, field, you, isHost, picks) { // the open-game panel: game ID, playfield, who is in, and (when weapons are on) what each carries
  $('setup').style.display = 'none'; $('panel').style.display = ''; $('pgid').textContent = gameCode(); $('pfield').textContent = field ? fieldName(field) : '';
  $('plist').innerHTML = names.map((n, i) => '<li><span class="dot" style="background:' + COLS[i % COLS.length] + '"></span><span>' + esc(n) + '</span><span class="tag">' + [picks ? weaponLabel(picks[i]) : '', i === 0 ? 'host' : '', i === you ? 'you' : ''].filter(Boolean).join(' &middot; ') + '</span></li>').join('');
  $('pweaprow').style.display = picks ? '' : 'none'; if (picks && picks[you] && $('pweapon').value !== picks[you]) $('pweapon').value = picks[you];
  $('start').style.display = isHost ? '' : 'none'; $('pnote').className = isHost ? '' : 'wait';
  $('pnote').textContent = isHost ? 'Share the game ID with the other players, then press Start game when everybody is in.' : 'Waiting for the host to start the game';
}
function showRoster() { const names = roster.map(r => r.name), field = $('field').value; if (roster.length) roster[0].weapon = $('pweapon').value; const picks = weaponsOnline() ? roster.map(r => r.weapon) : null; renderLobby(names, field, 0, true, picks);
  coordConns.forEach((c, i) => c.send({ t: 'roster', names, field, picks, you: i + 1 })); }
$('pweapon').onchange = () => { if (iAmHostOfLobby()) showRoster(); else if (lobbyConn) lobbyConn.send({ t: 'weapon', w: $('pweapon').value, pid: peer.id }); };
$('weaponsOn').onchange = () => { if (roster.length && !lobbyConn) showRoster(); };
const iAmHostOfLobby = () => roster.length > 0 && !lobbyConn;
function leaveLobby() { clearInterval(lobbyTimer); lobbyTimer = null; gotRoster = false; joinRetry = null; startMsg = null; try { if (peer) peer.destroy(); } catch (_) {} peer = null; iAmHost = false; roster = []; coordConns = []; lobbyConn = hostConn = null; links = {}; sim = null; electedDone = false; netNote = ''; msg('');
  $('panel').style.display = 'none'; $('setup').style.display = ''; }
$('leave').onclick = leaveLobby;
// back to the start dialog from a finished (or abandoned) game: throw the game state away and leave the connection
function newGame() { clearInterval(loopId); resetGameState(); soloMode = false;
  leaveLobby(); $('lobby').style.display = ''; $('bnew').style.display = 'none'; $('hud').innerHTML = ''; }
$('create').onclick = () => { const name = myName();
  newPeer('vodjs-' + gameCode(), id => { roster = [{ pid: id, name }]; showRoster(); startLobbyTimer(); }); };
$('join').onclick = () => { const name = myName();
  newPeer(null, id => { msg('Looking for game "' + gameCode() + '"...'); let tries = 0, opened = false; joinInfo = { pid: id, name };
    const giveUp = setTimeout(() => { if (!opened) msg('Could not reach game "' + gameCode() + '". Check the ID, and that the host has pressed Host game.', 'err'); }, 30000);
    const attempt = () => { lobbyConn = peer.connect('vodjs-' + gameCode(), { reliable: true });
      lobbyConn.on('open', () => { if (opened) return; opened = true; joinRetry = null; clearTimeout(giveUp); sendHello(); msg(''); renderLobby([], null, -1, false); startLobbyTimer(); });
      lobbyConn.on('data', m => {
        if (m.t === 'full') { leaveLobby(); msg('That game is full or has already started.', 'err'); }
        if (m.t === 'roster') { gotRoster = true; renderLobby(m.names, m.field, m.you, false, m.picks); }
        if (m.t === 'host') elected(m.hostId, m.roster, m.field, m.opts);
      }); };
    joinRetry = () => { if (opened || ++tries >= 5) return false; setTimeout(() => { if (!opened && peer) attempt(); }, 1500); return true; };
    attempt(); }); };
// the game's creator is the host
$('start').onclick = () => { $('start').style.display = 'none'; electedDone = true;
  const list = roster.map(r => ({ pid: r.pid, name: r.name })), field = $('field').value, opts = gameOpts(false, weaponsOnline() ? roster.map(r => r.weapon) : null, field);
  startMsg = { t: 'host', hostId: roster[0].pid, roster: list, field, opts }; coordConns.forEach(c => c.send(startMsg)); elected(roster[0].pid, list, field, opts); };
function elected(hostId, list, field, opts) {
  if (hostConn || sim) return; // the start message may arrive more than once
  roster = list; me = list.findIndex(r => r.pid === peer.id); iAmHost = hostId === peer.id;
  if (iAmHost) { sim = new VOD.Host(list.map(r => r.name), field, opts); msg('You are the host: keep this tab visible while playing.'); maybeLaunch(); setTimeout(() => maybeLaunch(true), 8000); }
  else { msg('Connecting to the host...'); hostConn = peer.connect(hostId, { reliable: true });
    setTimeout(() => { if (!G) msg('Could not connect to the host.', 'err'); }, 15000);
    hostConn.on('open', () => hostConn.send({ t: 'join', pid: peer.id })); hostConn.on('data', onHostMsg); }
}
let soloMode = false, soloName = '', loopId = null;
function startSolo(fresh) { roster = [{ pid: 'me', name: soloName }]; me = 0; iAmHost = true; const w = $('sweapon').value === 'none' ? null : $('sweapon').value; // with a weapon, solo practice gets a practice target
  sim = new VOD.Host(w ? [soloName, 'Target'] : [soloName], $('sfield').value, Object.assign(gameOpts(fresh, w ? [w, w] : null, $('sfield').value), { dummy: !!w })); maybeLaunch(true); }
$('solo').onclick = () => { soloMode = true; soloName = myName(); startSolo(false); };
// "New" (solo only): throw the game away and start again with a new random layout and the current settings, for quick tuning
$('bnew').onclick = () => { clearInterval(loopId); resetGameState(); startSolo(true); };
function maybeLaunch(force) {
  if (!sim || sim.started) return;
  if (!force && !roster.every((r, i) => i === me || links[r.pid])) return;
  sim.started = true; $('lobby').style.display = 'none'; $('bnew').style.display = soloMode ? '' : 'none';
  roster.forEach((r, i) => { if (links[r.pid]) links[r.pid].send(sim.init(i)); });
  onHostMsg(sim.init(me));
  let last = performance.now(), lastSnap = 0;
  loopId = setInterval(() => { const n = performance.now(); sim.step((n - last) / 1000); last = n;
    if (n - lastSnap >= 50) { lastSnap = n; const s = sim.snapshot(); roster.forEach((r, i) => links[r.pid] && links[r.pid].send(sim.snapshotFor(s, i))); onHostMsg(sim.snapshotFor(s, me)); } }, 16);
}

