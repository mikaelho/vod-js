// The standard ship. Add another file here (VOD.ship('name', {...})) for a different hull; the host picks one with opts.ship (default 'standard').
VOD.ship('standard', {
  label: 'Standard',
  shape: [[0,12],[6,6],[6,0],[12,6],[30,6],[36,12],[36,18],[30,24],[12,24],[6,30],[6,24],[0,18]], // outline in px, nose to the right, 36 x 30
  hp: 100,     // hull points
  power: 100   // maximum thrust per tick, in px of velocity change over the tick
});
