#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Construit preview/ : les 4 onglets servis en local, avec une barre d'onglets
qui imite GoodBarber. Les URLs du CDN sont remplacées par des chemins
relatifs, donc la prévisualisation suit toujours les fichiers réels.

    python3 scripts/make_preview.py && python3 -m http.server 8777 -d preview
"""

import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SRC = os.path.join(ROOT, "goodbarber")
OUT = os.path.join(ROOT, "preview")

TABS = [
    ("01-brief.html", "Brief", "&#128196;"),
    ("02-ou-aller.html", "Où aller", "&#128205;"),
    ("03-sur-la-route.html", "Sur la route", "&#128663;"),
    ("04-infos.html", "Infos", "&#8505;"),
]

CDN = re.compile(r"https://TON-COMPTE\.github\.io/vtc-idf/")


def main():
    os.makedirs(OUT, exist_ok=True)

    for name, _, _ in TABS:
        html = open(os.path.join(SRC, name), encoding="utf-8").read()
        html = CDN.sub("../cdn/", html)
        # app.js pointe vers le CDN pour ses données : on le redirige en local.
        # Les liens internes de GoodBarber n'existent pas en local : on les
        # remplace par les fichiers de la prévisualisation, pour pouvoir
        # vérifier qu'un clic sur « Attention » tombe bien sur le trafic.
        wrapper = (
            "<!doctype html><html lang=fr><head><meta charset=utf-8>"
            "<meta name=viewport content='width=device-width,initial-scale=1'>"
            "<title>%s</title></head><body>\n"
            "<script>window.__VTC_BASE='../cdn/data/';"
            "window.__VTC_GOTO={trafic:'03-sur-la-route.html#trafic'};"
            "</script>\n%s\n</body></html>"
        ) % (name, html)
        open(os.path.join(OUT, name), "w", encoding="utf-8").write(wrapper)

    nav = "".join(
        "<button data-src='%s'%s><span>%s</span>%s</button>" %
        (n, " class=on" if i == 0 else "", ico, label)
        for i, (n, label, ico) in enumerate(TABS)
    )

    shell = """<!doctype html>
<html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>VTC IDF — prévisualisation</title>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600;700&display=swap">
<style>
  html,body{margin:0;height:100%%;background:#0A0A0B;overflow:hidden;
    font-family:Barlow,-apple-system,BlinkMacSystemFont,Roboto,sans-serif}
  iframe{position:fixed;inset:0 0 58px 0;width:100%%;height:calc(100%% - 58px);border:0}
  nav{position:fixed;bottom:0;left:0;right:0;height:58px;display:flex;
    background:#121214;border-top:1px solid #2A2A31;
    padding-bottom:env(safe-area-inset-bottom,0)}
  nav button{flex:1;background:none;border:0;border-top:2px solid transparent;
    color:#63636C;font-size:10.5px;letter-spacing:.3px;
    font-weight:600;display:flex;flex-direction:column;align-items:center;
    justify-content:center;gap:3px;cursor:pointer;font-family:inherit}
  nav button span{font-size:18px;line-height:1;filter:grayscale(1);opacity:.8}
  nav button.on{color:#F4F4F5;border-top-color:#FFF}
  nav button.on span{opacity:1}
</style></head><body>
<iframe id="f" src="01-brief.html"></iframe>
<nav id="n">%s</nav>
<script>
  var n=document.getElementById('n'),f=document.getElementById('f');
  function aller(src){
    var fichier=String(src).split('#')[0];
    [].forEach.call(n.children,function(c){
      c.className=c.getAttribute('data-src')===fichier?'on':'';});
    f.src=src;
  }
  n.addEventListener('click',function(e){
    var b=e.target.closest('button'); if(!b)return;
    aller(b.getAttribute('data-src'));
  });
  /* Un onglet qui renvoie vers un autre : GoodBarber a ses liens internes,
     la prévisualisation a cette coquille. */
  window.addEventListener('message',function(e){
    var d=e.data||{}; if(d.vtc!=='goto'||!d.url)return; aller(d.url);
  });
</script></body></html>""" % nav

    open(os.path.join(OUT, "index.html"), "w", encoding="utf-8").write(shell)
    print("preview/ prêt — ouvre preview/index.html")


if __name__ == "__main__":
    main()
