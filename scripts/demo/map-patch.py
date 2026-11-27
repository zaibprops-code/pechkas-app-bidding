# The decision map carries the demo under demo/ (CLAUDE.md, "Which copy is which").
# After copying a built demo site to <map>/demo, run: python3 scripts/demo/map-patch.py <map>/demo/index.html
# It adds the links back to the map and keeps the map's own pk-… settings when the demo clears its storage.
import sys
p=sys.argv[1]
s=open(p).read()
def once(s,a,b):
    assert s.count(a)==1,(a[:50],s.count(a)); return s.replace(a,b)
s=once(s,'<span class="what">Made-up data</span>','<span class="what">Made-up data</span>\n  <nav class="back" aria-label="Pechkas pages"><a id="to-map" href="../index.html">Decision map</a><a id="to-screens" href="../index.html#screens">Screens</a></nav>')
s=once(s,'.bar button {\n  margin-left: auto;','.bar .back { margin-left: auto; display: flex; gap: 6px; flex: 0 0 auto; }\n.bar .back a { min-height: 32px; display: inline-flex; align-items: center; padding: 0 12px; border-radius: 999px; background: rgba(255,255,255,.14); color: #fff; font: 700 13px var(--font); text-decoration: none; }\n.bar .back a:focus-visible { outline: 3px solid #fff; outline-offset: 2px; }\n.bar button {\n  margin-left: 0;')
s=once(s,'@media (min-width: 860px) {','@media (max-width: 520px) { .bar .what { display: none; } .bar b { display: none; } }\n@media (min-width: 860px) {')
s=once(s,"""  document.getElementById('restart').addEventListener('click', () => {
    try { localStorage.clear(); } catch (e) {}
    location.href = window.__PB;
  });
  // A previous visit's sign-in would point at people this fresh database has not met.
  try { localStorage.clear(); } catch (e) {}""","""  const forget = () => { try { for (const k of Object.keys(localStorage)) if (!k.startsWith('pk-')) localStorage.removeItem(k); } catch (e) {} };
  document.getElementById('restart').addEventListener('click', () => { forget(); location.href = window.__PB + 'index.html'; });
  // A previous visit's sign-in would point at people this fresh database has not met.
  forget();
  document.getElementById('to-map').href = new URL('../index.html', window.__PB).href;
  document.getElementById('to-screens').href = new URL('../index.html#screens', window.__PB).href;""")
head_end=s.index('<div class="bar">')
s='<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n<style>:root{color-scheme:light;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)}body{margin:0}</style>\n'+s[:head_end]+'</head>\n<body>\n'+s[head_end:]+'\n</body>\n</html>\n'
open(p,'w').write(s)