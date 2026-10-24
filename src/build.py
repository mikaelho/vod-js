#!/usr/bin/env python3
"""Builds index.html (one self-contained page) and dist/host.js (the simulation alone, for Node tests) from shell.html + lib/ + src/.
Deterministic: files are included in the order set below; the folders ships/, playfields/ and weapons/ are included whole, sorted by file name,
so a new module is picked up by dropping one file in the right folder. Prints one line. Usage: python3 build.py"""
import re, glob, os
os.chdir(os.path.dirname(os.path.abspath(__file__)))
CORE = ['src/core/registry.js', 'src/core/host.js']
MODULES = [sorted(glob.glob('src/%s/*.js' % d)) for d in ('ships', 'playfields', 'weapons')]
CLIENT = ['src/version.js', 'src/net/transport.js', 'src/client/lobby.js', 'src/client/game.js', 'src/client/render.js', 'src/client/sound.js', 'src/client/end.js']
host = CORE + [f for g in MODULES for f in g]
read = lambda f: open(f).read()
version = re.search(r"VERSION = '([^']+)'", read('src/version.js')).group(1)
scripts = ['lib/Box2dWeb-2.1.a.3.js'] + host + CLIENT
page = read('shell.html').replace('<!--SCRIPTS-->', '\n'.join('<script>' + read(f) + '</script>' for f in scripts)).replace('<title>VoD</title>', '<title>VoD ' + version + '</title>')
open('index.html', 'w').write(page)
os.makedirs('dist', exist_ok=True)
open('dist/host.js', 'w').write('\n'.join(read(f) for f in host))   # Node: Box2D must already be a global; require('./dist/host.js') returns the Host class
print('built index.html %s %d KB | modules: %s' % (version, len(page) // 1024, ' '.join(os.path.basename(f)[:-3] for g in MODULES for f in g)))
