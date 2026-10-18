# Les quatre sections, prêtes à coller

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

## Après un changement

Ces fichiers sont **générés**. On ne les modifie pas à la main : on édite
`cdn/app.css`, `cdn/app.js` ou `goodbarber/*.html`, puis on relance

    python3 scripts/make_goodbarber.py

et on recolle les sections modifiées. Pour la production, mieux vaut passer à
la version CDN (`goodbarber/*.html` tels quels) : une correction dans app.js
profite alors aux quatre sections sans rien recoller.
