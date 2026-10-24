addEventListener('error', e => { const d = document.getElementById('err'); d.style.display = 'block'; d.textContent += (e.message || 'error') + ' ' + (e.filename || '').split('/').pop() + ':' + (e.lineno || '') + '\n'; });
const $ = id => document.getElementById(id), ctx = $('c').getContext('2d');
$('ver').textContent = VERSION;
const vw = () => $('c').clientWidth, vh = () => $('c').clientHeight;
let electedDone = false, peer, roster = [], coordConns = [], lobbyConn = null, hostConn = null, sim = null, links = {}, me = 0, iAmHost = false;
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
const hostWeapon = () => $('weaponsOn').checked ? $('pweapon').value : null; // the weapon of an online game: only when the host switched weapons on
const gameOpts = (fresh, weapon, field) => Object.assign({}, ((VOD.playfields[field] || {}).client || {}).opts ? VOD.playfields[field].client.opts(urlq, fresh) : {}, { weapon });
function onIncoming(c, m) {
  if (m.t === 'hello') { if (roster.length >= 5 || electedDone) { c.send({ t: 'full' }); return; } roster.push({ pid: m.pid, name: m.name, conn: c }); coordConns.push(c); showRoster(); }
  else if (m.t === 'join') { links[m.pid] = c; maybeLaunch(); }
  else if (m.t === 'fire' && sim) { const i = roster.findIndex(r => r.pid === c.metadata_pid); sim.fire(i, m.target); }
  else if (m.t === 'detonate' && sim) { const i = roster.findIndex(r => r.pid === c.metadata_pid); sim.detonate(i); }
  else if (m.t === 'thrust' && sim) { const i = roster.findIndex(r => r.pid === c.metadata_pid); sim.setThrust(i, m.k, m.x, m.y); }
}
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
  tm = setTimeout(() => { if (!opened) fail('no answer in 8 seconds'); }, 8000);
  p.on('open', i => { if (dead) return; opened = true; clearTimeout(tm); netNote = 'Connection: ' + (kind === 'relay' ? 'relay (' + rc.host + ')' : 'same browser only (development)'); msg(''); ready(i); });
  p.on('error', e => {
    if (dead) return;
    if (e.type === 'unavailable-id') { dead = true; clearTimeout(tm); msg('The game ID "' + gameCode() + '" is already in use. Pick another ID.', 'err'); }
    else if (e.type === 'peer-unavailable') msg('No game found with the ID "' + gameCode() + '". Check the ID, and that the host has pressed Host game.' + (!rc ? ' To play with others, open this page with the relay address and key.' : ''), 'err');
    else if (!opened) fail(e.type === 'relay-refused' ? 'the secret is wrong, or the relay is unreachable' : e.type || 'error'); else msg('Network error (' + e.type + ').', 'err');
  });
  p.on('disconnected', () => { if (opened) msg('Lost the connection to the relay.', 'err'); });
  p.on('connection', c => c.on('data', m => { if (m.pid) c.metadata_pid = m.pid; onIncoming(c, m); }));
}
const fieldName = f => (VOD.playfields[f] || { label: '' }).label;
function renderLobby(names, field, you, isHost, weapon) { // the open-game panel: game ID, playfield, who is in
  $('setup').style.display = 'none'; $('panel').style.display = ''; $('pgid').textContent = gameCode(); $('pfield').textContent = field ? fieldName(field) : '';
  $('plist').innerHTML = names.map((n, i) => '<li><span class="dot" style="background:' + COLS[i % COLS.length] + '"></span><span>' + esc(n) + '</span><span class="tag">' + [i === 0 ? 'host' : '', i === you ? 'you' : ''].filter(Boolean).join(' &middot; ') + '</span></li>').join('');
  $('pweaprow').style.display = isHost && $('weaponsOn').checked ? '' : 'none'; $('pwbadge').style.display = !isHost && weapon ? '' : 'none'; $('pwbadge').textContent = weapon ? 'Weapon: ' + weaponLabel(weapon) : '';
  $('start').style.display = isHost ? '' : 'none'; $('pnote').className = isHost ? '' : 'wait';
  $('pnote').textContent = isHost ? 'Share the game ID with the other players, then press Start game when everybody is in.' : 'Waiting for the host to start the game';
}
function showRoster() { const names = roster.map(r => r.name), field = $('field').value, weapon = hostWeapon(); renderLobby(names, field, 0, true, weapon);
  coordConns.forEach((c, i) => c.send({ t: 'roster', names, field, weapon, you: i + 1 })); }
$('pweapon').onchange = () => { if (roster.length) showRoster(); };
function leaveLobby() { try { if (peer) peer.destroy(); } catch (_) {} peer = null; iAmHost = false; roster = []; coordConns = []; lobbyConn = hostConn = null; links = {}; sim = null; electedDone = false; netNote = ''; msg('');
  $('panel').style.display = 'none'; $('setup').style.display = ''; }
$('leave').onclick = leaveLobby;
// back to the start dialog from a finished (or abandoned) game: throw the game state away and leave the connection
function newGame() { clearInterval(loopId); resetGameState(); soloMode = false;
  leaveLobby(); $('lobby').style.display = ''; $('bnew').style.display = 'none'; $('hud').innerHTML = ''; }
$('create').onclick = () => { const name = myName();
  newPeer('vodjs-' + gameCode(), id => { roster = [{ pid: id, name }]; showRoster(); }); };
$('join').onclick = () => { const name = myName();
  newPeer(null, id => { msg('Looking for game "' + gameCode() + '"...'); lobbyConn = peer.connect('vodjs-' + gameCode(), { reliable: true });
    const giveUp = setTimeout(() => msg('Could not reach game "' + gameCode() + '". Check the ID, and that the host has pressed Host game.', 'err'), 12000);
    lobbyConn.on('open', () => { clearTimeout(giveUp); lobbyConn.send({ t: 'hello', pid: id, name }); msg(''); renderLobby([], null, -1, false); });
    lobbyConn.on('data', m => {
      if (m.t === 'full') { leaveLobby(); msg('That game is full or has already started.', 'err'); }
      if (m.t === 'roster') renderLobby(m.names, m.field, m.you, false, m.weapon);
      if (m.t === 'host') elected(m.hostId, m.roster, m.field, m.opts);
    }); }); };
// the game's creator is the host
$('start').onclick = () => { $('start').style.display = 'none'; electedDone = true;
  const list = roster.map(r => ({ pid: r.pid, name: r.name })), field = $('field').value, opts = gameOpts(false, hostWeapon(), field);
  coordConns.forEach(c => c.send({ t: 'host', hostId: roster[0].pid, roster: list, field, opts })); elected(roster[0].pid, list, field, opts); };
function elected(hostId, list, field, opts) {
  roster = list; me = list.findIndex(r => r.pid === peer.id); iAmHost = hostId === peer.id;
  if (iAmHost) { sim = new VOD.Host(list.map(r => r.name), field, opts); msg('You are the host: keep this tab visible while playing.'); maybeLaunch(); setTimeout(() => maybeLaunch(true), 8000); }
  else { msg('Connecting to the host...'); hostConn = peer.connect(hostId, { reliable: true });
    setTimeout(() => { if (!G) msg('Could not connect to the host.', 'err'); }, 15000);
    hostConn.on('open', () => hostConn.send({ t: 'join', pid: peer.id })); hostConn.on('data', onHostMsg); }
}
let soloMode = false, soloName = '', loopId = null;
function startSolo(fresh) { roster = [{ pid: 'me', name: soloName }]; me = 0; iAmHost = true; const w = $('sweapon').value === 'none' ? null : $('sweapon').value; // with a weapon, solo practice gets a practice target
  sim = new VOD.Host(w ? [soloName, 'Target'] : [soloName], $('sfield').value, Object.assign(gameOpts(fresh, w, $('sfield').value), { dummy: !!w })); maybeLaunch(true); }
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
    if (n - lastSnap >= 50) { lastSnap = n; const s = sim.snapshot(); roster.forEach((r, i) => links[r.pid] && links[r.pid].send(s)); onHostMsg(s); } }, 16);
}

