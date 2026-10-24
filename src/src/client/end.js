// End of the race: fade to black, then the results (most buoys first) and a Lobby button.
function showResults(res) {
  $('rlist').innerHTML = res.map((r, i) => '<li' + (i === 0 ? ' class="win"' : '') + '><span class="rk">' + (i + 1) + '</span><span class="dot" style="background:' + r.color + '"></span><span class="rn">' + esc(r.name) + '</span><span class="tag">' + (i === 0 ? 'winner' : '') + '</span><span class="rb">' + r.n + ' / ' + G.nb + '</span></li>').join('');
  $('end').classList.add('show'); setTimeout(() => { if (over) $('end').classList.add('results'); }, 1800); // the picture fades out first, then the results appear
}
function hideResults() { $('end').classList.remove('show', 'results'); }
// The Lobby button goes back to the start dialog (solo or online); a new game then starts from scratch.
$('again').onclick = newGame;
