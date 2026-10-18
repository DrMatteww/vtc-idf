#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Construit goodbarber/export/ : les quatre sections prêtes à coller dans
GoodBarber, chacune AUTONOME — la feuille de style et le script partagés sont
recopiés dedans.

    python3 scripts/make_goodbarber.py

Pourquoi autonome : pour un premier essai en web app, il n'y a qu'une chose à
héberger, les trois fichiers de données. Pas de CDN à monter, pas d'URL à
deviner. En production, la version de `goodbarber/` est préférable : app.css et
app.js y sont appelés depuis un CDN, et corriger un bug ne demande pas de
recoller les quatre sections.

Une seule ligne à changer dans chaque fichier, tout en haut : l'adresse des
données.
"""

import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SRC = os.path.join(ROOT, "goodbarber")
OUT = os.path.join(SRC, "export")

SECTIONS = [
    ("01-brief.html", "Brief"),
    ("02-ou-aller.html", "Où aller"),
    ("03-sur-la-route.html", "Sur la route"),
    ("04-infos.html", "Réglages"),
]

CDN_CSS = re.compile(r'\s*<link rel="stylesheet" href="https://TON-COMPTE\.github\.io/vtc-idf/app\.css">')
CDN_JS = re.compile(r'\s*<script src="https://TON-COMPTE\.github\.io/vtc-idf/app\.js"></script>')

# L'adresse publique réelle, celle que la GitHub Action alimente.
CDN = "https://drmatteww.github.io/vtc-idf/"

# L'adresse où l'Action publie brief.json, lieux.json et zones.json. Le slash
# final compte : sans lui, l'application demanderait « …/vtc-idfbrief.json ».
BASE_DONNEES = "https://drmatteww.github.io/vtc-idf/data/"

ENTETE_CDN = """<!-- =========================================================================
     VTC IDF — section « %s »
     À COLLER DANS GOODBARBER : section de type « Custom » / contenu HTML.
     Le style et la logique sont appelés depuis l'adresse publique : corriger
     un bug plus tard ne demandera pas de recoller cette section.
     Rien à modifier ici.
     ========================================================================= -->
"""

ENTETE = """<!-- =========================================================================
     VTC IDF — section « %s »
     À COLLER DANS GOODBARBER : section de type « Custom » / contenu HTML.
     Ce bloc est autonome : il contient déjà tout le style et toute la logique.

     UNE SEULE CHOSE À RENSEIGNER, la ligne ci-dessous : l'adresse où sont
     publiés brief.json, lieux.json et zones.json.
     ========================================================================= -->
<script>window.__VTC_BASE = '%s';</script>
"""


def main():
    os.makedirs(OUT, exist_ok=True)
    css = open(os.path.join(ROOT, "cdn", "app.css"), encoding="utf-8").read()
    js = open(os.path.join(ROOT, "cdn", "app.js"), encoding="utf-8").read()

    for nom, titre in SECTIONS:
        html = open(os.path.join(SRC, nom), encoding="utf-8").read()
        # Les deux appels au CDN laissent la place au contenu lui-même. On
        # vérifie qu'ils ont bien été trouvés : sans ça, une section collée
        # dans GoodBarber irait chercher un fichier qui n'existe pas.
        if not (CDN_CSS.search(html) and CDN_JS.search(html)):
            raise SystemExit("! appel CDN introuvable dans %s" % nom)
        html = CDN_CSS.sub("\n<style>\n" + css + "\n</style>", html, count=1)
        html = CDN_JS.sub("\n<script>\n" + js + "\n</script>", html, count=1)
        bloc = (ENTETE % (titre, BASE_DONNEES)) + html
        chemin = os.path.join(OUT, nom)
        open(chemin, "w", encoding="utf-8").write(bloc)
        print("  %-22s %6.1f Ko" % (nom, os.path.getsize(chemin) / 1024))

    lisez = """# Les quatre sections, prêtes à coller

Chaque fichier de ce dossier est **une section GoodBarber complète**. Il
contient le style, la logique et le contenu : rien d'autre à héberger que les
données.

## Dans GoodBarber

1. Crée quatre sections de type **Custom** (contenu HTML libre), dans cet ordre :
   Brief, Où aller, Sur la route, Réglages.
2. Dans chacune, colle **tout** le contenu du fichier correspondant.
3. Dans `01-brief.html`, renseigne `GOTO_TRAFIC` avec le lien interne que
   GoodBarber donne pour « Sur la route », **suivi de `#trafic`**.
4. Dans `04-infos.html`, remplace les deux `contact@example.com` par ton adresse.

## Les données

Les trois fichiers `brief.json`, `lieux.json` et `zones.json` doivent être
accessibles en HTTP, à l'adresse indiquée tout en haut de chaque section
(`window.__VTC_BASE`). Le plus simple est GitHub Pages : voir la section
« Déployer » du README. Tant que cette adresse n'est pas valable, les écrans
affichent « Pas de connexion » — c'est le comportement prévu, rien n'est cassé.

## Si les accents s'affichent de travers

« 22h00â€“00h00 » au lieu de « 22h00–00h00 », « Ã  » au lieu de « à » : la page
qui entoure la section n'est pas en UTF-8. Ce n'est pas le contenu collé — il
est en UTF-8 — mais la déclaration d'encodage de la page, qui doit être faite
avant. Dans GoodBarber c'est le cas par défaut ; si ça arrive quand même,
c'est là qu'il faut regarder.

## Après un changement

Ces fichiers sont **générés**. On ne les modifie pas à la main : on édite
`cdn/app.css`, `cdn/app.js` ou `goodbarber/*.html`, puis on relance

    python3 scripts/make_goodbarber.py

et on recolle les sections modifiées. Pour la production, mieux vaut passer à
la version CDN (`goodbarber/*.html` tels quels) : une correction dans app.js
profite alors aux quatre sections sans rien recoller.
"""
    open(os.path.join(OUT, "LISEZ-MOI.md"), "w", encoding="utf-8").write(lisez)
    print("export/ prêt — quatre sections autonomes + LISEZ-MOI.md")

    # --- La version légère, celle de la production -----------------------
    # Elle appelle la feuille de style et le script depuis l'adresse publique
    # au lieu de les recopier : chaque section passe de soixante kilo-octets à
    # une dizaine, assez court pour tenir dans un message, et une correction
    # dans app.js profite aux quatre sections sans rien recoller.
    out_cdn = os.path.join(SRC, "export-cdn")
    os.makedirs(out_cdn, exist_ok=True)
    for nom, titre in SECTIONS:
        html = open(os.path.join(SRC, nom), encoding="utf-8").read()
        # L'ordre compte : on insère l'adresse des données AVANT de remplacer
        # les URL du CDN. Dans l'autre sens, le motif « TON-COMPTE » n'existe
        # plus, la substitution ne trouve rien et la section part sans savoir
        # où chercher ses données — elle s'affiche alors en « hors ligne ».
        if not CDN_JS.search(html):
            raise SystemExit("! appel à app.js introuvable dans %s" % nom)
        html = CDN_JS.sub(
            "\n<script>window.__VTC_BASE = 'https://TON-COMPTE.github.io/vtc-idf/data/';</script>"
            "\n<script src=\"https://TON-COMPTE.github.io/vtc-idf/app.js\"></script>",
            html, count=1)
        html = html.replace("https://TON-COMPTE.github.io/vtc-idf/", CDN)
        if "__VTC_BASE" not in html or "TON-COMPTE" in html:
            raise SystemExit("! section %s mal assemblée" % nom)
        bloc = (ENTETE_CDN % titre) + html
        chemin = os.path.join(out_cdn, nom)
        open(chemin, "w", encoding="utf-8").write(bloc)
        print("  %-22s %6.1f Ko  (version légère)" % (nom, os.path.getsize(chemin) / 1024))


if __name__ == "__main__":
    main()
