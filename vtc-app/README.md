# VTC IDF — V1

Appli chauffeur VTC pour l'Île-de-France : quatre onglets HTML à coller dans
GoodBarber, alimentés par un fichier JSON régénéré automatiquement.

---

## 1. Voir le résultat tout de suite

```bash
python3 vtc-app/scripts/make_demo.py --out vtc-app/cdn/data
python3 vtc-app/scripts/serve.py
```

Puis ouvre **http://localhost:8777/preview/** — sur ton ordinateur, ou sur ton
téléphone en remplaçant `localhost` par l'adresse IP locale du Mac. La barre du
bas imite celle de GoodBarber.

Les toilettes affichées sont de **vraies données** ; le brief, lui, est une
démonstration calée sur l'heure courante.

### Si le serveur refuse de démarrer

```
can't open file '.../serve.py': [Errno 1] Operation not permitted
```

macOS n'autorise pas ce processus à lire `~/Desktop` (Réglages → Confidentialité
et sécurité → Fichiers et dossiers, ou Accès complet au disque). Deux sorties :

* accorder l'accès au Bureau — `scripts/serve.py` remarche tel quel ;
* ou servir un **miroir** du projet posé hors du Bureau, ce que fait
  `~/.vtc-preview/` : `sync.sh` recopie le projet dans `root/`, `serve.py` le
  sert sur le même port. À relancer après chaque édition :

```bash
sh ~/.vtc-preview/sync.sh
```

Pour voir le vrai brief — aucune clé n'est nécessaire, les trains apparaissent
en horaire théorique :

```bash
python3 vtc-app/scripts/build_data.py --only brief --out vtc-app/cdn/data
```

---

## 2. Comment c'est monté

```
  Script (tous les ¼ d'heure)  →  brief.json sur GitHub Pages  →  les 4 onglets
```

Les onglets ne font qu'afficher. Toute l'intelligence est dans le script, qui
tourne **ailleurs** que dans l'app. Trois conséquences qui comptent :

- ta clé SNCF n'est jamais exposée dans le code de l'application ;
- corriger un bug d'affichage ne demande **ni republication ni validation Apple**,
  puisque `app.css` et `app.js` sont hébergés hors de GoodBarber ;
- si le script casse un soir, l'app continue d'afficher la dernière version
  connue au lieu d'un écran vide.

```
vtc-app/
  cdn/              → à publier sur GitHub Pages (c'est ce que l'app télécharge)
    app.css           le design
    app.js            la logique commune aux 4 onglets
    data/*.json       les données générées
  goodbarber/       → à coller dans les 4 sections GoodBarber
  scripts/
    build_data.py     génère les JSON
    make_demo.py      brief de démonstration
    sources/*.csv     ce que tu remplis à la main
    .cache/           extrait de l'horaire des vols (régénéré, non versionné)
  preview/          → prévisualisation locale (régénérée, ne pas éditer)
```

---

## 3. Déployer

1. Crée un dépôt GitHub (public, pour que Pages soit gratuit) et pousse ce dossier.
2. Active **Settings → Pages → Deploy from branch → `gh-pages`**.
3. *Facultatif mais recommandé* : crée ta clé SNCF sur
   <https://numerique.sncf.com/startup/api/> (gratuite), puis ajoute-la dans
   **Settings → Secrets → Actions** sous le nom `SNCF_TOKEN`. Sans elle les
   trains s'affichent quand même, en horaire théorique ; avec elle ils passent
   en temps réel. Tout le reste — vols, événements, matchs — est en accès
   libre et ne demande rien à personne (§ 6).
4. Lance le workflow une première fois à la main (onglet **Actions**).

Ton adresse sera `https://TON-COMPTE.github.io/TON-DEPOT/`.

**Remplace ensuite `https://TON-COMPTE.github.io/vtc-idf/` par cette adresse**
dans les 5 fichiers concernés :

```bash
grep -rl "TON-COMPTE" vtc-app/ | xargs sed -i '' \
  's|https://TON-COMPTE.github.io/vtc-idf/|https://TON-COMPTE.github.io/TON-DEPOT/|g'
```

---

## 4. Intégrer dans GoodBarber

Crée **quatre sections de type HTML / code personnalisé**, dans cet ordre :

| Onglet | Fichier | Titre suggéré |
|---|---|---|
| 1 | `goodbarber/01-brief.html` | Brief |
| 2 | `goodbarber/02-ou-aller.html` | Où aller |
| 3 | `goodbarber/03-sur-la-route.html` | Sur la route |
| 4 | `goodbarber/04-infos.html` | Infos |

Le titre de l'onglet 1 reste fixe dans la barre du bas (GoodBarber ne sait pas
l'animer), mais **le titre affiché dans la page suit l'heure réelle** : Ce matin,
Ce midi, Cet après-midi, Ce soir, Cette nuit.

### Les trois tests à faire en premier

Ils sont bloquants : inutile d'avancer sur le contenu avant de les avoir passés.

1. **Appel réseau** — l'onglet 4 s'affiche sans rien télécharger. Si l'onglet 1
   reste sur « Pas de connexion », la section n'a pas le droit d'appeler ton
   domaine : cherche une option de domaines autorisés côté GoodBarber.
2. **Lien sortant** — appuie sur *Waze* dans l'onglet 3. L'application doit
   s'ouvrir. Si rien ne se passe, il faudra autoriser les schémas externes.
3. **Géolocalisation** — l'onglet 3 doit demander ta position puis afficher une
   distance. Sinon la liste fonctionne quand même, mais sans tri par distance.

### Les quatre sections prêtes à coller

    python3 scripts/make_goodbarber.py

Écrit `goodbarber/export/`, soit **quatre sections autonomes** : la feuille de
style et le script partagés sont recopiés à l'intérieur de chacune. Il n'y a
donc **rien à héberger à part les trois fichiers de données**, ce qui est ce
qu'il faut pour un premier essai en web app : on colle, ça marche.

Une seule ligne à renseigner, tout en haut de chaque fichier :

```html
<script>window.__VTC_BASE = 'https://TON-COMPTE.github.io/vtc-idf/data/';</script>
```

Chaque section pèse une soixantaine de kilo-octets, dont l'essentiel est le
script partagé, recopié quatre fois. **Pour la production, repasse à la version
de `goodbarber/`** : elle appelle `app.css` et `app.js` depuis le CDN, donc
corriger un bug ne demande pas de recoller les quatre sections.

Ces fichiers sont générés : on édite `cdn/` ou `goodbarber/`, puis on relance
le script.

### La barre d'onglets

C'est **GoodBarber qui la fournit**, configurée dans son back-office : native,
avec les icônes de ton choix, et elle garde l'onglet actif toute seule. C'est
ce qui est en place.

`goodbarber/menu.html` contient une barre équivalente en HTML, dans le même
langage visuel que la sous-barre de *Sur la route*. Elle n'est **pas utilisée**
— elle reste là au cas où une offre ou un gabarit ne proposerait pas de
navigation native. Elle a besoin des liens internes de GoodBarber, décrits
juste en dessous.

### La carte « Attention » : elle se déplie sur place

Le brief ne montre qu'une fermeture, celle qui arrive. Un clic **sur la carte
rouge** ouvre les autres **dans le brief**, sous une ligne « Nuit de lundi à
mardi, 21h → 6h » ; un second clic referme. Rien à configurer, rien à brancher :
c'est le comportement par défaut, et c'est celui qui est en place.

C'est aussi, à l'usage, mieux que le saut d'onglet prévu au départ : un geste au
lieu de deux, et on ne perd pas le brief de vue. La première fermeture n'est pas
répétée dans la liste dépliée — « Voir les 17 autres », et ce sont bien dix-sept
lignes nouvelles.

**Si tu préfères quand même ouvrir l'onglet *Trafic*** : chez GoodBarber, un
lien interne n'a rien de spécial, c'est l'adresse de ton application suivie du
raccourci de la section —

```
https://mon-app.goodbarber.app/sur-la-route#trafic
```

L'app reconnaît son propre domaine et reste dedans au lieu d'ouvrir le
navigateur ([documentation GoodBarber][gb-liens]). Pour l'adresse exacte : ouvre
la section en mode web app et recopie la barre d'adresse, puis ajoute `#trafic`.
Elle se renseigne dans `GOTO_TRAFIC`, en haut de `01-brief.html` ; remplie, la
carte saute dans *Trafic* au lieu de se déplier. Le `#trafic` est ce que lit
`03-sur-la-route.html` pour ouvrir la bonne sous-section (`#wc`, `#manger`,
`#trafic`, `#astuces`). C'est le même mécanisme dont `menu.html` aurait besoin.

[gb-liens]: https://goodbarber.com/help/plugins-api-documentation-r108/basic-methods-a271

### Un réglage à finir

- La carte « Un bon plan à partager ? » a été retirée de `04-infos.html` : elle
  ouvrait l'application mail du chauffeur, et une boîte de réception interne à
  GoodBarber fera mieux — pas d'adresse exposée, et les retours terrain
  arrivent tous au même endroit. Le gabarit de message (Lieu, Adresse,
  Parking, Toilettes, Horaires) est dans l'historique du dépôt, prêt à être
  rebranché.

---

## 5. Ton travail hebdomadaire — environ 20 minutes

Tout est dans `scripts/sources/`, en CSV séparé par des points-virgules
(ouvrable dans Numbers ou Excel). Une ligne avec `actif=0` est ignorée : c'est
le cas des lignes d'exemple livrées.

**`evenements.csv`** — le plus important, le dimanche soir.

```
date;fin;type;titre;salle;jauge;note;actif
2026-10-18;23:15;concert;Orelsan;bercy;;;1
```

`fin` est l'heure de **sortie** : fin du concert, coup de sifflet final,
fermeture du salon. C'est à ce moment que la demande arrive, pas au début.
`salle` est un code de `salles.csv` — les coordonnées, le département et la
capacité sont retrouvés tout seuls. `type` vaut `concert`, `sport` ou `salon`.

Depuis la V1.1, deux agendas ouverts remplissent **une partie** de ce travail
tout seuls (§ 6). Ta ligne reste prioritaire : dès qu'elle existe pour une
salle un jour donné, l'événement automatique du même jour est écarté. Autrement
dit, tu n'as plus à tout saisir — mais tout ce que tu saisis gagne.

**`salles.csv`** — le référentiel des salles, à toucher rarement. Deux colonnes
servent aux agendas automatiques :

- `alias` : les noms sous lesquels la salle apparaît ailleurs, séparés par `|`.
  Paris La Défense Arena se fait appeler « Plenitude Arena » depuis qu'elle a
  changé de sponsor ; c'est pour ça que les deux y figurent. Un lieu dont le nom
  ne correspond à aucun alias n'entre jamais dans le brief, même s'il est à
  cinquante mètres.
- `type_defaut` : `concert`, `sport` ou `salon`, utilisé quand l'agenda ne dit
  pas de quoi il s'agit.

`gares.csv` porte deux identifiants : `stop_area` pour l'API temps réel et
`gtfs_nom` pour l'horaire théorique. Les deux doivent désigner la même gare.

**`equipes.csv`** — la correspondance club → stade pour les matchs repris
automatiquement. À ne toucher que si un club déménage.

**`fermetures.csv`** — une ligne couvre toutes les nuits concernées.

```
id;titre;detail;dept;heure_debut;heure_fin;jours;valide_jusqu_au;actif
a86;A86 fermée vers Créteil;Entre Thiais et la sortie 25;94;21:00;05:00;lun-ven;2026-12-31;1
```

**`manger.csv`** — les fiches terrain, en plus des 869 fast-foods de nuit repris
d'OpenStreetMap. C'est le contenu qui n'existe nulle part ailleurs : parking,
toilettes, tranche de prix. Il passe devant la reprise automatique.

**`astuces.csv`** — le carnet : `titre;texte;dept;lat;lon;actif`. Les
coordonnées sont facultatives. C'est ce qui aura de la valeur quand tu iras
négocier des partenariats.

---

### « L'heure de mise à jour ne bouge pas »

En local, non : `brief.json` ne change que lorsqu'on lance `build_data.py`
soi-même. L'horodatage affiché est celui du fichier, pas celui de la lecture —
c'est voulu, c'est ce qui permet de voir d'un coup d'œil qu'on regarde des
données vieilles de trois heures.

En production, la GitHub Action régénère le brief **tous les quarts d'heure**
(`cron: '*/15 * * * *'`) et l'heure suit toute seule. L'application, elle, ne
garde jamais une copie quand le réseau répond : `VTC.load` interroge le serveur
avec `cache: 'no-store'` et ne se rabat sur la copie locale qu'en cas d'échec —
l'écran affiche alors « hors ligne ».

**Mais le quart d'heure est une intention, pas une horloge.** Le planificateur
de GitHub est une file d'attente : mesuré sur ce dépôt le 19 octobre 2026,
alors que la ligne disait « minute 7 », les exécutions sont parties à 08h40,
07h48, 06h44, 05h32 et 04h47 — **de 25 à 42 minutes de retard**, et GitHub
se réserve d'en sauter quand la charge monte. C'est exactement ce qui avait
donné l'impression que « l'heure ne bouge pas ». Viser le quart d'heure donne
donc, en pratique, une mise à jour toutes les 15 à 45 minutes au lieu de 60 à
100.

S'y ajoutent **jusqu'à 10 minutes de cache** côté Pages : les fichiers sont
servis avec `Cache-Control: max-age=600`, et `cache: 'no-store'` ne concerne
que le navigateur, pas le réseau de diffusion qui est devant. Descendre sous le
quart d'heure paierait donc des exécutions pour rafraîchir un fichier que le
cache garde de toute façon.

Le coût, lui, est nul : le dépôt est **public**, les minutes d'Action y sont
illimitées, et une exécution dure une trentaine de secondes. Côté sources, 96
exécutions par jour font 960 appels SNCF et 1 536 appels Ticketmaster, loin
sous leurs quotas gratuits. Enfin, soyons honnêtes sur le gain : ce qui change
vraiment d'un quart d'heure à l'autre, ce sont **les retards de trains**. La
météo est horaire, les fermetures et les événements sont publiés pour la
journée.

## 5 bis. Le système de design

L'habillage de départ — fond bleu nuit, ambre partout, cartes très arrondies,
dégradés — a été jugé « ça fait IA », et c'était juste : c'est la signature
visuelle par défaut de tout ce qui se génère aujourd'hui. Il a été refait en
regardant ce que font les applications du métier — Uber Driver, Flighty,
Transit — qui partagent trois partis pris.

**1. Noir neutre, pas bleu nuit.** `#0A0A0B` et des gris sans teinte. Le bleu
habille, le gris disparu laisse exister le contenu. Pas de noir pur non plus :
sur un écran OLED, le défilement bave.

**2. La typographie fait la hiérarchie, pas la couleur.** Une seule famille,
**Barlow**, un grotesque dessiné d'après la signalisation routière, chargée en
`display=swap` — si le réseau traîne, le texte s'affiche immédiatement dans la
police système. Quatre graisses, des chiffres tabulaires partout où il y a des
horaires. Une heure lointaine est grise, une heure proche est blanche : le
contraste se fait en luminosité, pas en teinte.

**3. Des angles vifs.** 3 px sur les cartes, 2 px sur les boutons, les
pastilles et les étiquettes. Les grands rayons appartiennent aux applications
grand public ; un instrument de travail a des arêtes.

Trois couleurs, trois significations, et rien d'autre :

| Couleur | Ce qu'elle dit | Où |
|---|---|---|
| blanc plein | **agis ici** | le bouton principal d'un écran, la pastille active |
| rouge `#FF4433` | **attention** | fermetures, forte demande |
| vert `#35D07F` | **ouvert** | 24h/24, parking, toilettes disponibles |

Quelques conséquences concrètes :

- **Le blanc plein ne se mérite qu'une fois par écran.** Sur chaque ligne d'une
  liste, il ne voudrait plus rien dire : les boutons de navigation des listes
  sont contournés.
- **Les dégradés sont remplacés par un filet vertical** de 3 px à gauche de la
  carte : il désigne sans colorer tout le bloc.
- **Les émojis de catégorie sont désaturés** (`.ico`, `filter: grayscale(1)`) :
  un avion bleu vif fait tache, sa forme se reconnaît quand même
  instantanément. Les flammes gardent leur couleur — c'est une note, pas une
  icône — mais ont perdu leur aplat rouge, qui concurrençait le rouge des
  fermetures.
- **Les pastilles de filtre n'ont plus d'émoji** : trois couleurs vives
  alignées en haut de l'écran tiraient l'œil avant le contenu.
- **Une ligne de liste fait exactement deux lignes de texte**, toujours. Le nom
  du lieu et son libellé se coupent plutôt que de passer à la ligne et de
  pousser la pastille de département ou la note en flammes vers le bas. La
  liste *Où aller* est passée de sept à onze lignes visibles sur un iPhone, et
  les fiches de lieux de quatre à neuf.
- **La commune est écrite avant la rue** — « Nanterre · 138 avenue François
  Arago ». Une ligne se coupe par la droite : ce qui doit survivre à la coupe,
  c'est la ville, pas le numéro. Du coup la pastille de département a disparu
  des fiches de lieux, où elle répétait l'information en plus court.
- **Les capitales vont aux étiquettes qui désignent** — un département, une
  alerte — pas aux horaires : « JUSQU'À 00H00 » est plus large et moins lisible
  que « jusqu'à 00h00 ».
- **Les toilettes d'OpenStreetMap sont présentées comme les sanisettes de
  Paris** : la rue en titre, la commune en dessous. C'est ce qu'on tape dans un
  GPS, et les deux sources ne se distinguent plus à l'œil.

## 6. D'où viennent les données

| Source | Ce qu'elle donne | Clé | Coût | Limite de volume |
|---|---|---|---|---|
| API SNCF (Navitia) | arrivées grandes lignes, **temps réel** | `SNCF_TOKEN` | gratuit | 5 000 req./jour annoncées |
| data.gouv.fr — GTFS SNCF | arrivées grandes lignes, horaire théorique | **aucune** | gratuit | aucune annoncée |
| data.gouv.fr — programme Air France | arrivées CDG et Orly | **aucune** | gratuit | aucune annoncée |
| opendata.paris.fr — Que faire à Paris | concerts, salons | **aucune** | gratuit | aucune annoncée |
| OpenDataSoft — miroir OpenAgenda | concerts, salons | **aucune** | gratuit | aucune annoncée |
| openfootball | matchs de Ligue 1 à domicile | **aucune** | gratuit | aucune annoncée |
| opendata.paris.fr — sanisettes | toilettes | **aucune** | gratuit | aucune annoncée |
| OpenStreetMap (Overpass) | toilettes de banlieue | **aucune** | gratuit | instances bénévoles, souvent saturées |
| geo.api.gouv.fr | centre des communes d'IDF | **aucune** | gratuit | aucune annoncée |
| transport.data.gouv.fr — DATEX II | perturbations routières DiRIF | **aucune** | gratuit | aucune annoncée |

Deux secrets GitHub, **tous les deux facultatifs et gratuits**. `SNCF_TOKEN`
fait passer les trains de l'horaire théorique au temps réel. `TICKETMASTER_KEY`
ajoute la programmation des grandes salles — c'est lui qui apporte l'Accor
Arena, Paris La Défense Arena et La Seine Musicale. Sans eux, le brief s'écrit
quand même, avec moins de contenu. Tout le reste est en accès libre, et c'est
délibéré : une app gratuite financée par la publicité ne peut pas dépendre d'un
abonnement.

---

### Les trains — temps réel avec la clé, théorique sans

La SNCF publie **deux** choses. L'API Navitia donne le temps réel, retards et
voies compris, et demande une clé gratuite. Et, sur data.gouv.fr **sans aucune
clé**, le GTFS complet du réseau TGV / Intercités / TER : 5,5 Mo, mis à jour
chaque jour, valable jusqu'au 31 mars 2027.

Le script essaie la clé d'abord. Si elle est absente, invalide, hors quota, ou
si l'API ne répond rien, il se rabat **tout seul** sur le GTFS et ajoute
« horaire théorique » au libellé. L'application n'est donc jamais vide de
trains, et la clé reste un vrai gain plutôt qu'un préalable.

**Deux pièges trouvés au premier passage avec une vraie clé**, tous les deux
corrigés — à relire si tu ajoutes une gare :

1. **L'API ne trie pas, et elle tronque.** Elle renvoie les arrivées dans
   l'ordre chronologique, RER compris. Gare de Lyon, 177 des 200 premières
   réponses sont des RER : on ne voyait que les trois premières heures de la
   fenêtre, soit treize TGV au lieu de cinquante-deux. Il faut exclure les
   modes de banlieue **côté serveur** (`FORBIDDEN_MODES`), pas après coup.
   Attention, le filtre inverse (`filter=physical_mode.id=…LongDistanceTrain`)
   est un piège : il renvoie une erreur 400 sur une gare qui n'a aucun train
   longue distance, comme Saint-Lazare.
2. **Les marques régionales ont changé.** La table attendait « TER » et
   « INTERCITES » : la SNCF ne renvoie plus rien de tel. Chaque région a sa
   marque — TER HDF, Rémi, Fluo, MOBIGO, NOMAD, Aléop — et il existe des
   libellés sans marque, comme « additional service » qui désigne les Eurostar
   gare du Nord (numéros 9000 à 9499, vérifié). La table a été refaite à partir
   de ce que l'API renvoie réellement.

Les dix identifiants `stop_area` de `gares.csv` ont été **vérifiés un par un**
avec une vraie clé : deux étaient faux (Marne-la-Vallée et Roissy CDG 2 TGV
renvoyaient 404), et pour Marne-la-Vallée il existe deux gares homonymes — il
fallait celle du TGV, pas celle du RER. La colonne `verifie` est maintenant
à `1` partout.

Comment on sépare les grandes lignes du TER, puisque le GTFS ne porte pas la
notion de « TGV » : un numéro de ligne de la forme `601A` ou `421E` désigne une
relation grandes lignes, le mot « TGV » dans le nom de ligne tranche aussi, et
un numéro de train de quatre chiffres au plus est une grande ligne quand un TER
en porte six. Vérifié sur une journée entière : **543 arrêts retenus, tous TGV
ou Intercités ; 238 écartés, tous TER ou banlieue** — y compris les pièges,
comme le « K2+ Paris – Cherbourg » qui est bien un Intercités et le « K8+
Paris – Orléans » qui est bien un TER.

À un terminus tout le monde descend ; à un arrêt de passage — Massy, Roissy ou
Marne-la-Vallée sur un Lille–Méditerranée — on ne compte que 35 % des places
(`STOPOVER_SHARE`). Vérifié sur l'horaire complet : **les sept gares
parisiennes sont à 100 % des terminus, les trois gares d'interconnexion à 98 %
des arrêts de passage**. D'où la colonne `terminus` de `gares.csv`, que la voie
temps réel utilise — l'horaire théorique, lui, connaît le statut arrêt par
arrêt. Sans ça, le temps réel surestimait Roissy CDG 2 TGV d'un facteur trois.

Les villes d'origine ne sont pas affichées. Elles l'ont été, et c'était une
erreur : « 3 arrivées grandes lignes — Saint-Nazaire - Le Croisic, Rennes -
BPL, Tours » noyait les trois informations qui comptent vraiment, à savoir
combien de monde, dans quelle gare, et à quelle tranche horaire.

Attention, le jeu de données **« API Théorique et Temps réel SNCF »** sur
data.gouv.fr ne contient aucune donnée : c'est une fiche qui renvoie vers le
portail développeur, donc vers la clé. Le fichier utilisable est le GTFS du
jeu « Réseau SNCF TGV, Intercités et TER », sur transport.data.gouv.fr.

### Les vols — horaire théorique, pas tableau d'affichage

Aéroports de Paris ne publie pas ses arrivées en données ouvertes, et son site
refuse les robots. En revanche **Air France dépose son programme de vols
complet sur data.gouv.fr**, au format SSIM — l'horaire théorique officiel du
transport aérien. Le script y lit 36 000 segments à destination de Roissy et
d'Orly, avec le terminal d'arrivée et la configuration cabine exacte de chaque
avion.

Trois choses à savoir, parce qu'elles se voient dans l'application :

- **Seules Air France, KLM et Transavia y sont.** C'est l'essentiel du
  programme d'Orly 3 et un peu plus de la moitié de celui de Roissy, mais
  easyJet, Vueling, Delta ou Emirates en sont absents. Chaque ligne de la
  timeline porte la mention « AF/KLM/Transavia », pour que ce ne soit jamais
  pris pour un tableau d'affichage complet.
- **C'est l'horaire théorique, pas le temps réel.** Aucun retard, aucune
  annulation. Un vol annoncé à 22 h 10 peut se poser à 23 h.
- **Les heures du fichier sont en UTC**, pas en heure locale comme la norme
  SSIM le prévoit — point vérifié, pas supposé, parce qu'une première version
  lue en heure locale décalait toutes les arrivées de deux heures. Deux
  contrôles le prouvent : les durées de vol (New York–Roissy tombait à 1 h 25,
  Tokyo–Roissy à 22 h 30 ; en UTC on retrouve 7 h 25 et 14 h 30, les vrais
  temps de vol) et le **couvre-feu d'Orly**, fermé de 23 h 30 à 6 h —
  l'activité brute du fichier s'arrête à 20 h 59 et reprend à 4 h, soit
  exactement 6 h 00 – 22 h 59 une fois les deux heures ajoutées. Le décalage
  est donné vol par vol dans le fichier, ce qui règle aussi le changement
  d'heure.
- Le même avion est publié une fois par compagnie qui le vend (l'AF703 est
  aussi le KL2269) ; le script les recolle en comparant escale d'origine,
  minute d'arrivée, terminal et type d'appareil.

Le regroupement suit la règle commune à toute la timeline (voir « Comment la
timeline est découpée », plus bas) : **une ligne par aéroport et par tranche de
deux heures**. La ligne n'affiche que **« Roissy »** ou **« Orly »** :
le terminal, le chauffeur le voit sur place, et l'écrire noyait l'information
utile. En revanche le bouton *Y aller* vise le terminal le plus chargé de la
tranche, parce que c'est là que la file se forme. Une tranche qui pèse moins
de huit courses est écartée : un avion isolé en pleine nuit n'est pas une file
d'attente (`MIN_FLIGHT_RIDES`).

Le fichier pèse 80 Mo. Le script en garde un extrait dans `scripts/.cache/` et
renvoie l'ETag à data.gouv, qui répond « 304 non modifié » en quelques octets
tant que le programme n'a pas changé. Le workflow conserve ce cache d'une
semaine sur l'autre. Si le cache disparaît, tout fonctionne pareil : c'est
juste 80 Mo et douze secondes de plus.

Deux autres compagnies déposent leur programme au même endroit : **Corsair**
(ressource `be46259c-a191-4a40-9b6c-c526d1401f02`, mais son dépôt actuel ne
commence qu'en mai 2027) et **TUI fly** (`b203e0f8-7a40-4540-80ec-abc8197c00bd`,
qui s'arrête le 20 octobre 2026). Pour les ajouter le jour où elles seront à
jour, une ligne dans `SSIM_SOURCES` suffit : le reste du code ne change pas,
les périodes hors validité sont ignorées toutes seules.

Les coordonnées des terminaux sont dans **`sources/terminaux.csv`**, relevées
dans OpenStreetMap. Elles pointent sur le bâtiment, pas sur la zone de prise en
charge VTC : la colonne `verifie` est à `0` partout, et c'est à corriger sur le
terrain. Les départements aussi sont discutables — les terminaux de Roissy sont
administrativement à Roissy-en-France (95) et ceux d'Orly à Paray-Vieille-Poste
(91), alors que `gares.csv` classe la gare TGV de CDG en 93. Le fichier est là
pour que tu mettes ce qui t'arrange dans tes filtres.

### Les événements — deux agendas, et toujours ton CSV

Deux jeux de données ouverts, interrogés tous les deux en API OpenDataSoft, donc
avec le même code :

- **Que faire à Paris** (Ville de Paris) : couvre l'Accor Arena, l'Adidas Arena,
  le Zénith, Jean-Bouin, Roland-Garros et la Porte de Versailles.
- **Miroir OpenDataSoft d'OpenAgenda** : couvre Paris La Défense Arena et les
  salons de la Porte de Versailles.

Pour chaque salle de `salles.csv`, le script demande ce qui se passe dans un
rayon de 400 m, puis **ne garde que les lieux dont le nom correspond à un alias
du référentiel**. Le filtre géographique attrape forcément les voisins — la
Cinémathèque à côté de l'Accor Arena, le Dôme de Paris à la Porte de Versailles
— et c'est l'alias qui tranche.

Ce que ça donne vraiment, mesuré sur trois semaines à la mise en service : une
quinzaine d'événements, dont les cinq jours du Salon du chocolat avec une
fermeture à 19 h chaque soir, et les concerts du Zénith avec des sorties entre
22 h et 23 h 30. C'est réel, mais **ce n'est pas complet** :

- **le Stade de France n'est dans aucun des deux**, ni La Seine Musicale, ni
  Villepinte, ni Le Bourget, ni Longchamp, ni Charléty, ni Yves-du-Manoir ;
- l'Accor Arena n'y apparaît que pour une partie de sa programmation.

Ton dimanche soir reste donc utile, et c'est pour ça que la saisie manuelle
garde la priorité.

**L'heure de sortie.** C'est le point qui compte, et c'est pourquoi ces deux
sources ont été choisies plutôt qu'une billetterie : elles donnent le début
**et** la fin, jour par jour. Un salon de cinq jours produit cinq créneaux de
fermeture, pas un seul. Quand la fin manque quand même, le script applique une
durée par défaut — **2 h 30 pour un concert, 2 h pour du sport, 8 h pour un
salon** — et c'est une hypothèse, pas une mesure.

**Une seule ligne automatique par salle et par journée.** Les billetteries
publient la même soirée sous plusieurs formules (« concert », « concert +
after », « full experience ») : sans cette règle, le Zénith sortait sept fois
le même soir, dont une à 6 h du matin. Le script retient l'heure que l'agenda
répète le plus et le titre le plus court. Conséquence assumée : pour annoncer
une matinée **et** une soirée dans la même salle, il faut passer par le CSV.

### La billetterie — ce qui comble enfin le trou des grandes salles

**Ticketmaster Discovery** couvre ce qu'aucun agenda ouvert ne connaissait :
l'Accor Arena, Paris La Défense Arena, La Seine Musicale, l'Adidas Arena, le
Stade de France, le Mondial de l'Auto Porte de Versailles. La clé est gratuite
et immédiate sur <https://developer.ticketmaster.com> — c'est la **Consumer
Key** qu'il faut, pas le Consumer Secret, qui ne sert qu'aux flux OAuth de
l'API Commerce. Quota : 5 000 appels par jour, le brief en fait un par heure.

Sur le référentiel, ça représente plus de cinq cents événements à venir, contre
une trentaine pour les deux agendas ouverts réunis.

**Le piège à ne jamais oublier : `locale=*`.** Sans ce paramètre, l'API renvoie
32 événements pour toute la France, tous à Roland-Garros, et on conclut que le
catalogue français est vide — c'est exactement l'erreur commise ici avant de la
corriger. Le paramètre ne filtre pas sur la langue, il débloque le catalogue
localisé.

Le rattachement se fait par **identifiant de salle** (colonne `ticketmaster` de
`salles.csv`), pas par géographie. Attention aux noms : l'Accor Arena apparaît
aussi en « Accorhotels Arena », et **Paris La Défense Arena est référencée sous
« Plenitude Arena »**, son nom de sponsor — c'est cette fiche-là qui porte les
90 événements, l'autre est vide. Ticketmaster référence aussi les *parkings*
des salles comme des lieux distincts : d'où le rattachement par identifiant,
qui ne s'y trompe pas.

Seules les **grandes salles** sont mappées. La Seine Musicale a trois fiches
(Grande Seine 6 000 places, Petite Seine et Auditorium 1 150) : seule la Grande
Seine est retenue, pour rester dans le périmètre des salles de plus de 5 000
places.

**Limite** : Ticketmaster ne donne que l'heure de **début**. La sortie est donc
calculée (§ *Les heures de sortie*). Quand un agenda ouvert annonce le même
événement avec sa vraie heure de fin, c'est lui qui l'emporte — c'est à ça que
sert le drapeau `_sure` dans `merge_events`.

### Les heures de sortie, et pourquoi elles ne sont pas évidentes

C'est le cœur du produit, et c'est là qu'on se trompe le plus facilement.

**L'heure du billet n'est pas l'heure du concert.** Celle que Ticketmaster
annonce est l'ouverture des portes ; entre elle et l'entrée en scène il y a la
première partie, soit à peu près une heure. Sans cette correction
(`DOORS_TO_SHOW_MIN`), l'application plaçait Youssou Ndour à 21 h 30 et Céline
Dion à 22 h — une heure trop tôt, repéré sur le terrain. Ça ne vaut que pour
les concerts : sur un match ou un salon, l'heure annoncée est la bonne.

**Un salon ne sort pas, il se vide.** Pas d'heure de fin unique : la demande
monte du début d'après-midi jusqu'à la fermeture. Les salons sont donc affichés
en **tranche** — « Paris Expo, 14 h → 19 h » — et pas en instant
(`SALON_RUSH_FROM`). Quand la source ne donne pas l'heure de fermeture, on la
suppose à 19 h (`SALON_CLOSE_AT`) : les salons franciliens ferment entre 18 h
et 20 h. C'est mieux que « début + 8 h », qui plaçait la fermeture du Mondial
de l'Auto à 17 h parce que la première séance ouvrait à 9 h.

**La vraie heure bat toujours l'heure supposée.** Les deux agendas ouverts
donnent la fin réelle, Ticketmaster non. Quand les deux annoncent le même
concert, c'est l'agenda qui fixe l'heure. Et la saisie manuelle bat tout le
monde.

Récapitulatif des hypothèses, toutes des constantes en haut du script :

| Cas | Hypothèse |
|---|---|
| Concert (heure du billet) | + 1 h d'ouverture des portes, puis 2 h 30 de spectacle |
| Match de Ligue 1 (coup d'envoi) | + 2 h, le temps que le stade se vide |
| Salon sans heure de fin | tranche 14 h → 19 h |
| Événement d'agenda avec fin réelle | aucune hypothèse, on prend la fin annoncée |

#### L'heure affichée porte son nom : « sortie »

Ce tableau produit une heure — 23 h 30 pour un concert dont le billet dit 20 h
à l'Accor Arena — et cette heure était affichée **toute seule**. On la lisait
alors comme l'heure du concert, et « un concert à Bercy à 22 h 30, ça n'existe
pas » : c'était juste, et c'était notre faute d'affichage.

Les lignes de salle portent donc désormais le mot **sortie** au-dessus de
l'heure, dans le brief comme dans *Où aller* (`VTC.timeCell`). Les arrivées,
elles, gardent l'heure nue de leur créneau — personne ne se demande ce que
signifie « 08h00 » en face de Roissy. Une note sous la liste rappelle que cette
sortie est **estimée à partir de l'heure du billet**, la billetterie ne
publiant pas d'heure de fin.

Pour un salon, la ligne porte la tranche entière — ce qui a rendu inutile le
« — jusqu'à 19h00 » qu'on collait au titre : il a été retiré. **Les deux heures
sont empilées**, pas côte à côte : « 14h00–19h00 » élargissait la colonne et
décalait le titre de cette ligne-là toute seule, au milieu d'une liste alignée.

```
SORTIE
14h00    🏢 Paris Expo Porte de Versailles
19h00       Mondial de l'Auto 2026
``` **Attention à ne pas confondre avec l'ouverture** : le Mondial de
l'Auto ouvre à 10 h, Ticketmaster annonce deux séances à 9 h et 13 h, et aucun
de ces horaires n'est affiché. 14 h, c'est **notre** choix (`SALON_RUSH_FROM`) :
l'heure à partir de laquelle le salon commence à se vider pour de bon.

### Une requête par salle, et pourquoi ça compte

Ticketmaster accepte plusieurs `venueId` dans la même requête. Il n'en honore
pas la moitié, **sans jamais le dire** : sur les seize salles du référentiel,
six répondaient, et le Stade de France n'apparaissait jamais — interrogé seul,
il renvoie pourtant ses neuf événements, dont le match NFL du 25 octobre. On
l'avait conclu « absent des sources » : c'était faux, c'était la requête.

Le script fait donc **une requête par salle**. Seize appels au lieu d'un, pour
un quota de 5 000 par jour : c'est le prix d'un référentiel complet.

Seize appels **par exécution**, en revanche, c'était de la dépense pure :
quand le brief s'est mis à tourner tous les quarts d'heure, ça faisait 1 536
appels par jour pour une programmation qui est annoncée des semaines à
l'avance. Les réponses sont donc gardées sur le disque six heures
(`TM_CACHE_S`), soit **quatre relevés par jour, 64 appels**. Deux conditions
pour que ça marche, et la seconde est celle qu'on oublie :

1. **l'URL doit être stable d'une exécution à l'autre.** Elle contenait
   l'heure courante (`startDateTime`), donc elle changeait à chaque fois et
   aucun cache ne pouvait servir. Les dates sont maintenant arrondies à la
   journée. Effet de bord heureux : les spectacles **commencés il y a une
   heure** reviennent dans la réponse — or c'est exactement eux qui
   intéressent un chauffeur, puisque leur sortie est à venir. Avec
   `startDateTime = maintenant`, Ticketmaster les écartait en silence ;
2. **le dossier `scripts/.cache` doit survivre d'une exécution à l'autre.**
   `actions/cache` n'enregistre qu'en cas d'échec sur la clé exacte : avec une
   clé hebdomadaire, tout ce qui était téléchargé après la première exécution
   de la semaine était **jeté à la fin du job**. La clé change donc toutes les
   heures : la première exécution de l'heure récupère la précédente, travaille
   et réenregistre ; les trois suivantes retombent sur la clé exacte. Au
   passage, ça divise aussi par quatre les visites à Sytadin.

| Avant | Après |
|---|---|
| 52 événements, 6 salles | 100+ événements, toutes les salles qui en ont |
| Stade de France invisible | NFL Paris Game, 25/10, sortie 16h30, trois flammes |

**Au-delà de trois jours, seules les très grandes salles restent** (`BIG_VENUE_SEATS`
à 20 000 places, `TM_DAYS_BIG` à dix jours). Un match NFL au Stade de France ou
la Paris Games Week, ça se prépare une semaine à l'avance ; un concert de
6 000 places dans dix jours, non — ça ferait une liste qu'on ne lit plus.

#### Les heures de billet qui n'en sont pas

Un billet de salon daté porte souvent `00:00` ou `23:59` : c'est une date, pas
une heure de visite. La Paris Games Week s'affichait donc à **23h59**. Ces
deux cas retombent maintenant sur la tranche de l'après-midi, et le
regroupement « un événement par salle et par jour » se fait sur le jour
**affiché** — sans quoi le billet de 23h59 finissait « le lendemain » et
échappait au dédoublonnage. Les titres de salon sont coupés au premier tiret :
après, c'est le type de billet (« — Billet Daté — Entrée… »), pas
l'événement.

Autre fiche qui n'est pas un événement : **« PASS 3 JOURS - PARIS GRAND SLAM
2027 »**, à l'Accor Arena, datée d'aujourd'hui 10 h. C'est un abonnement mis
en vente ce matin ; le tournoi, lui, est en février 2027, et il ne se passe
rien à l'Accor Arena à 10 h. Ces fiches commencent toutes par le type de
billet — `TM_BILLET` écarte `pass`, `billet`, `abonnement`, `forfait` en début
de titre. À ne pas confondre avec la coupure au premier tiret des salons : là,
le type de billet est **après** le nom ; ici il est **avant**.

#### Plenitude Arena

Paris La Défense Arena s'appelle désormais **Plenitude Arena**, et c'est sous ce
nom que Ticketmaster la publie. Le référentiel affiche le nouveau nom et garde
les anciens en alias, pour que la saisie manuelle continue de les reconnaître.

### Le football — la seule source fiable pour le sport

Ni « Que faire à Paris » ni OpenAgenda ne connaissent les matchs : les clubs
n'y publient pas. C'était le plus gros trou, parce qu'un soir de match au Parc
des Princes, ce sont 47 000 personnes qui sortent en vingt minutes — le plus
gros événement récurrent d'Île-de-France.

Les calendriers **openfootball** (dépôt GitHub, domaine public, sans clé)
donnent la Ligue 1 avec la date et l'heure du coup d'envoi. Le script prend
les matchs **à domicile** des clubs listés dans `sources/equipes.csv` et pose
l'heure de sortie à **coup d'envoi + 2 h** : 1 h 45 de jeu et d'arrêts, plus le
temps que le stade se vide.

```
equipe;salle;competition;note;actif
Paris Saint-Germain;pdp;Ligue 1;;1
Paris FC;jeanbouin;Ligue 1;à vérifier : le club a changé de stade récemment;1
```

**Vérifie la ligne Paris FC** : le club a déménagé récemment et la colonne
`salle` est ce qui décide où l'app t'envoie.

Deux limites à connaître :

- **La Ligue ne fixe les horaires qu'environ cinq semaines à l'avance.** Au
  moment d'écrire ces lignes, 21 matchs de la saison n'ont pas encore d'heure
  officielle : ils sont ignorés, pas devinés. Ils réapparaissent tout seuls dès
  que l'horaire est publié.
- Le fichier est tenu par des bénévoles : un report de dernière minute peut y
  manquer. Ta ligne de CSV reste prioritaire.

Les matchs sont comptés à **12 % de la jauge**, comme une saisie manuelle et
non comme un agenda : un match de championnat remplit le stade, on n'a pas le
doute qu'on a sur une annonce d'agenda.

Il reste le **Stade de France**, qui n'est couvert par rien : équipe de France,
finales de Top 14, grands concerts. 80 000 places, et c'est de la saisie
manuelle.

### Un seul filtre « Événements »

L'onglet *Où aller* a quatre pastilles : Tout, Trains, Vols, Événements. Les
concerts, le sport et les salons sont réunis sous la dernière, parce que sur
trois jours il y a rarement les trois à la fois : trois pastilles dont deux
vides, c'est trois occasions de cliquer pour ne rien trouver.

Le détail n'est pas perdu pour autant — chaque ligne garde son icône, 🎤 pour
un concert, ⚽ pour un match, 🏢 pour un salon — et le champ `kind` reste dans
les données, puisque c'est lui qui décide de l'heure de sortie. Pour revenir à
une pastille par type, tout est dans `FILTERS`, en haut de `app.js`.

### Le trafic — Sytadin, et ce que l'autorisation couvre

**Lis ce paragraphe avant de toucher au connecteur trafic.**

Le pied de page de `sytadin.fr` porte la mention « © Toute reproduction
interdite sans l'accord écrit préalable de la Direction des routes
Île-de-France ». Le projet a donc commencé sans cette source.

**La DiRIF a ensuite été appelée directement et a autorisé la reprise de
l'INFORMATION de fermeture. Ce qui reste interdit, c'est la réutilisation de
leur CARTE.** Le connecteur s'en tient strictement à ça : il lit les tableaux
de `fermetures_nocturnes.jsp.html`, rien d'autre — aucune image, aucune
cartographie, aucun fond de plan. La source est citée dans l'onglet *Infos*.

Deux conseils de prudence, parce que cette autorisation est le seul titre à
utiliser la source :

- **Garde-en une trace écrite.** Un accord donné au téléphone se perd ; un
  courriel de confirmation à la DiRIF, archivé, vaut mieux. C'est aussi ce qui
  te protège si quelqu'un chez eux change d'avis dans deux ans.
- **Si tu ajoutes un jour une carte à l'application, n'y mets pas la leur.**
  C'est exactement la limite qu'ils ont posée.

Ce que ça apporte : **une vingtaine de fermetures par nuit en semaine**, axe par
axe, rédigées pour des humains — « A14 DEUX SENS, entre Orgeval (A13) et
Nanterre (A86) », « N13 DEUX SENS, tunnel de Neuilly-sur-Seine ». Sans
commune mesure avec ce que donnent les données ouvertes. Le niveau de gêne de
la DiRIF alimente la gravité : relevé sur une semaine complète, le vocabulaire
se limite à **Moyen**, **Local** et **Fort**.

Sytadin ne rafraîchit ses tableaux qu'une fois par jour — c'est écrit dans le
code source de la page — et ne renvoie pas d'ETag. Le connecteur garde donc les
pages **six heures en cache** : ça fait une douzaine de requêtes par jour sur un
service public au lieu d'une centaine. Merci de ne pas enlever ce cache.

### Le trafic — le complément en données ouvertes

La même DiRIF alimente le flux **DATEX II national** publié sur
transport.data.gouv.fr, sous Licence Ouverte et sans clé. Il donne autre chose :
des **chantiers qui durent** — « N118 à Sèvres, sortie 1 vers D7 fermée 24h/24
jusqu'en 2027 » — là où Sytadin donne la nuit qui vient. Le flux ne porte aucune
période récurrente, vérifié ; il ne remplace donc pas Sytadin.

Quand les deux parlent du même axe, **Sytadin gagne** et la ligne DATEX est
écartée : c'est mieux écrit. En pratique ça ramène la douzaine de chantiers
DATEX à trois ou quatre, ceux que Sytadin ne mentionne pas.

Limite du flux ouvert : un enregistrement sur six seulement porte un texte
lisible, d'où un libellé reconstruit à partir du lieu (« sur bretelle de
sortie — De Versailles vers Rueil-Malmaison »).

### Deux briefs : toute l'IDF, ou autour de toi

L'onglet *Brief* a deux pastilles. **Toute l'IDF** donne le meilleur de la
région. **Autour de moi** ne garde que ce qui est à moins de **10 km** de ta
position (`NEAR_KM` dans `app.js`) — arrivées, événements et fermetures
comprises.

**L'application s'ouvre sur le brief perso dès que la position a été
accordée une fois.** Un chauffeur qui lance l'app veut voir son secteur, pas la
région : un clic sur l'icône, et il y est. *Toute l'IDF* reste à un clic,
juste au-dessus. Le fait que la position marche est retenu (`localStorage`,
clé `vtc_geo`) dès qu'une position arrive, **dans n'importe quel onglet** — pas
`navigator.permissions`, qui ne répond pas pour la géolocalisation dans une
WebView iOS. Un refus écrit `ko` et l'application repasse sur *Toute l'IDF* :
atterrir sur « position bloquée » à chaque ouverture serait le plus sûr moyen de
la faire désinstaller.

Au retour dans l'application, le brief perso revient de la même façon — sauf
si le chauffeur vient de demander toute l'Île-de-France : on ne lui reprend pas
son choix dans les dix minutes.

**La pastille ne mémorise rien, et la position encore moins.** La distinction
compte : on ferme l'application à Orly, on la rouvre une heure plus tard dans
Paris, et le secteur doit suivre. Le brief relit donc la position à chaque
ouverture, en exigeant une mesure fraîche (`maximumAge: 0`), et la relit encore
quand l'écran redevient visible — c'est ce que fait `VTC.onReopen`. Un
anti-rebond de trente secondes évite de solliciter le GPS pour un simple
aller-retour entre deux onglets.

Tout se passe **dans le téléphone**. La position n'est envoyée nulle part, et
le JSON publié est le même pour tout le monde : c'est le filtre qui est local.
Autrement dit, personne ne sait où tu es, pas même le serveur.

Ce que ça donne depuis trois endroits, sur les données du jour :

| Depuis | Demande à 10 km | Fermetures à 10 km |
|---|---|---|
| Roissy CDG | 11 | 4 — A104 Mitry-Mory, N2 Compans |
| Orly | 8 | 10 — A6a vers Porte d'Orléans, N406 Créteil |
| Bercy | 36 | 19 — périphérique extérieur, tunnel de Neuilly |

**Si la position est refusée ou indisponible**, l'écran n'affiche **que**
l'explication — pas le brief régional. Montrer toute l'Île-de-France à la place
serait pire que rien : on croirait lire son propre secteur. La pastille *Toute
l'IDF* est juste au-dessus pour y revenir d'un geste.

Le message s'adapte à la cause, parce que les deux n'appellent pas le même
geste :

| Cause | Ce qui s'affiche |
|---|---|
| Autorisation refusée | le chemin exact dans les réglages, différent sur iPhone et sur Android |
| Position introuvable | « ressaie dans un instant, ou sors du parking » — ça n'a rien à voir avec les réglages |

Dans les deux cas, un bouton **Réessayer** relance la mesure. C'est lui qui sert
après avoir autorisé la position dans les réglages : on revient dans l'app, on
appuie, le brief local apparaît.

### Le bouton « ouvrir les réglages » : pourquoi il n'y en a pas

Il n'existe **aucun moyen standard** d'ouvrir les réglages du téléphone depuis
une page web, et c'est ce qu'est une section GoodBarber :

- **iOS** bloque les schémas `prefs:` / `App-Prefs:` dans une WebView, et Apple
  refuse les applications qui les utilisent. Seul du code natif peut le faire.
- **Android** accepte `intent://…ACTION_APPLICATION_DETAILS_SETTINGS` dans
  Chrome, mais pas dans une WebView, sauf si l'application hôte le gère
  explicitement.

GoodBarber expose bien une *App API* aux sections en code personnalisé, mais sa
documentation publique ne mentionne aucune méthode pour ouvrir les réglages ni
pour redemander une autorisation. **À vérifier auprès de leur support** : c'est
la seule piste.

Si la réponse est oui, il y a **un seul endroit à modifier** : la fonction
`openAppSettings()` dans `app.js`. Elle renvoie `false` aujourd'hui, et c'est ce
`false` qui fait afficher la marche à suivre plutôt qu'un bouton. Qu'elle
appelle la méthode native et renvoie `true`, et le bouton *Réessayer* ouvrira
les réglages — le reste de l'interface n'a pas à changer.

En attendant, le chemin écrit en toutes lettres fait le travail : quatre mots
justes valent mieux qu'un bouton qui échoue silencieusement.

**Une limite à connaître** : en mode local, un élément sans coordonnées est
écarté plutôt que supposé proche. C'est le cas de treize fermetures sur
soixante-douze, dont la description ne nomme aucun lieu géocodable — « Accès
D311 échangeur 2 ». Elles restent visibles dans *Sur la route*.

### Une seule nuit à la fois

L'onglet *Trafic* n'affiche que **la nuit en cours**, jamais la semaine. Une
nuit va de 21 h à 6 h : avant 6 h du matin on est encore dans celle de la
veille, à partir de 6 h c'est celle du soir qui vient. **La bascule se fait
donc toute seule à la première ouverture après 6 h**, sans rien attendre du
serveur — c'est l'heure du téléphone qui décide, pas la date du fichier. Le
JSON contient toujours trois nuits, l'application choisit la bonne.

Conséquences voulues sur l'affichage :

- **Pas de jour sur les lignes.** Puisqu'il n'y en a qu'une, le bandeau rouge
  dit seulement « 21h00 → 06h00 ». La nuit concernée est écrite une fois, en
  tête de liste : « Nuit de samedi à dimanche, 21h → 6h ».
- **Deux lignes par fermeture, pas trois** : l'axe et l'horaire ensemble sur la
  première, le détail en dessous. Le département a été retiré — l'axe le dit
  déjà, et un badge de plus ne faisait que pousser le texte vers le bas.

Un week-end, le bloc de la nuit est souvent vide : la DiRIF ne ferme presque
rien de 21 h à 6 h du vendredi soir au dimanche soir. L'écran le dit plutôt que
de laisser croire à une panne.

#### Ce qui dure : retiré, et pourquoi

Il y a eu un second bloc, « Fermé en continu, jour et nuit » : les 24h/24 de
Sytadin (`kind: "continu"`) et les chantiers DATEX, mis à part parce que leur
coller un bandeau « 21h00 → 06h00 » était faux. Il existait surtout parce que
le bloc de la nuit est vide tous les week-ends.

**Il a été retiré le 19 octobre 2026**, à la demande du chauffeur, et
l'argument est meilleur que celui qui l'avait fait naître : une bretelle coupée
en permanence ou un chantier déjà en place, **Waze et Google Maps les
connaissent et dévient tout seuls**. Les afficher, c'était doubler le GPS sur
son propre terrain. Ce qu'aucun GPS ne sait dire, en revanche, c'est qu'**à
21 h ce soir l'A86 ferme** : on s'y prépare, on ne la découvre pas. C'est la
seule chose que l'app annonce désormais.

Conséquence assumée, et visible : le week-end, le brief n'a plus de carte rouge
et *Trafic* affiche « Rien de fermé cette nuit ». C'est vrai, et c'est une
bonne nouvelle — pas un écran cassé.

Côté code, les données n'ont pas changé : `build_data.py` continue de produire
les lignes `continu` et `chantier` (elles coûtent trois lignes de JSON, et les
jeter nous priverait de l'historique le jour où l'on changerait d'avis). C'est
`VTC.standingClosures` qui renvoie désormais une **liste vide** — une fonction
plutôt qu'une suppression, parce que les écrans déjà publiés dans GoodBarber
l'appellent, et qu'un onglet qui plante sur `undefined is not a function` chez
un chauffeur en service serait un prix absurde à payer. `isStanding`, lui, sert
toujours : c'est lui qui écarte ces fermetures de la nuit en cours.

Sytadin ne publie **aucune date de réouverture** pour ses 24h/24 : en inventer
une aurait été pire que de l'écrire. Le `to` stocké dans le JSON est seulement
le dernier jour où la fermeture apparaît à leur programme — il sert à la faire
disparaître d'elle-même, jamais à être affiché.

Dernier détail, trouvé en route : le dédoublonnage avec DATEX ne compare plus
que les fermetures **de nuit**. Une bretelle d'A15 coupée en continu avait fait
disparaître les deux chantiers DATEX de l'A15, qui sont ailleurs sur l'axe.

### Seulement les grands axes

Les fermetures affichées se limitent aux **autoroutes, aux nationales
structurantes, au périphérique et aux voies sur berges** (`MAJOR_AXIS` dans le
script) :

| Gardé | Écarté |
|---|---|
| `A…` — A3, A86, A14, A6a… | `D…` — D1004 entre Vaudoy-en-Brie et Cerneux |
| `N` + 1 à 3 chiffres — N118, N13, N406… | `N` + 4 chiffres — N1104, N1014, qui sont des bretelles |
| `BP`, `VSB` | `V` — voirie locale, « Forum », « Souterrain Concorde » |

Le raisonnement : une départementale coupée en pleine Brie, le GPS la contourne
tout seul pendant le trajet. Ce qui mérite d'être su **à l'avance**, c'est
l'autoroute ou la nationale qu'on aurait prise — là, le détour se décide avant
de partir. Sur une semaine, ça retire neuf lignes sur soixante-douze, et toutes
les neuf sont du bruit.

### Situer les fermetures : le géocodage

Sytadin décrit ses fermetures en toutes lettres — « Entre Nanterre (A86) et
Pont de Neuilly » — sans la moindre coordonnée. Pour que le brief local puisse
les situer, le script géocode le premier lieu reconnu de chaque description
avec l'**API Adresse de l'État** (api-adresse.data.gouv.fr) : gratuite, sans
clé, sous Licence Ouverte.

Deux garde-fous, parce qu'un géocodeur dit rarement « je ne sais pas » :

- **un score minimum** (0,5) et **une boîte englobante Île-de-France**. Sans
  eux, « Tunnel de Chennevières » renvoyait un tunnel du Havre, avec un score
  de 0,37 ;
- **chaque nom n'est demandé qu'une fois**, le résultat est gardé pour toujours
  dans `scripts/.cache/geocodage.json`. Les mêmes axes reviennent toutes les
  semaines : en régime établi, le géocodeur n'est quasiment plus appelé.

Résultat : **56 fermetures situées sur 69**. Les treize autres ne nomment aucun
lieu — « Echangeur n° 100, bretelle d'accès ».

### Manger la nuit

À deux heures du matin, la question n'est pas « où bien manger » mais « qu'est-ce
qui est encore ouvert ». Aucune base publique ne répond à ça. OpenStreetMap, si.

Ce qu'on y trouve en Île-de-France, mesuré :

| | |
|---|---|
| fast-foods recensés | **7 186** |
| avec leurs horaires | **3 046** (42 %) |
| encore ouverts entre 23 h et 6 h, en Île-de-France | **848** après nettoyage |
| dont ouverts après minuit | plus de 400 |
| dont 24 h/24 | 23 |
| avec un drive | 76 |

Répartition réelle : **360 à Paris**, 96 en Seine-Saint-Denis, 89 dans le
Val-de-Marne, 82 dans les Hauts-de-Seine, 68 en Seine-et-Marne, 58 dans
l'Essonne, 48 dans le Val-d'Oise, 47 dans les Yvelines. Les plus tardifs
ferment à 6 h : Burger King au 80 avenue du Général-Leclerc (Paris 14e),
McDonald's 111 cours de Vincennes (Paris 20e).

#### Les courses de nuit : supérettes et supermarchés

Un fast-food n'est pas toujours ce qu'on cherche. Une seconde requête ramène
les **commerces** ouverts tard, avec le même filtre de nuit : **253 supérettes
et supermarchés** en Île-de-France, Monoprix, Monop', Casino, CocciMarket,
Franprix, Carrefour City et Market — ceux de Paris principalement, ce qui
correspond à ce qu'on voit la nuit.

#### Six familles, et pourquoi celles-là

Un chauffeur qui cherche à manger à deux heures du matin ne cherche pas « un
restaurant » : il cherche **du sûr** (une chaîne : il sait ce qu'il trouve, il
y a un parking et souvent des toilettes), **du rapide** (grec, kebab, tacos,
sandwich), ou **de quoi tenir jusqu'au matin** (supérette, station).

| Pastille | Ce qu'elle contient | Combien |
|---|---|---|
| Tout | tout, y compris ce qui n'a pas de famille | 1 132 |
| ★ Favoris | ce que le chauffeur a étoilé lui-même | sa liste |
| Chaînes | marque reconnue : McDonald's, KFC, Burger King, Subway, O'Tacos… | 376 |
| Grec · Sandwich | `cuisine` = kebab, sandwich, turkish, french_tacos, lebanese | 130 |
| Pizza | `cuisine` = pizza | 57 |
| Supérette | `shop` = supermarket ou convenience | 253 |
| Autoroute | aires avec boutique, fichier officiel des carburants | 31 |

Le reste — burger indépendant, poulet, asiatique, 267 + 14 fiches — n'a pas de
pastille et vit sous « Tout ». C'est volontaire : **une pastille qui ne ramène
rien est une déception de plus au volant**, et à trois heures du matin on ne
cherche pas un poke.

La catégorie est écrite **dans la donnée** (champ `t`), jamais devinée par
l'application : elle vient des étiquettes OpenStreetMap via `categorie()`, ou
de la colonne `type` des fiches saisies à la main. L'ordre de lecture compte :
station, puis commerce, puis marque, puis cuisine — sans quoi un Carrefour
City serait rangé dans « Chaînes » au lieu de « Supérette ».

Conséquence assumée : quelques enseignes d'aéroport taguées `convenience` dans
OpenStreetMap — Brioche Dorée, Pret A Manger au terminal 2E — se retrouvent en
« Supérette ». C'est l'étiquette de la base, et pour un chauffeur à Roissy à
trois heures du matin, savoir qu'il y a quelque chose d'ouvert dans le
terminal est exactement ce qu'il veut.

#### Les stations : 554 retirées, 31 gardées

Première version : toutes les stations-service d'OpenStreetMap ouvertes la
nuit, soit **554 points**. Le chauffeur a tranché, et il avait les chiffres du
terrain : *« à part celle de l'A1 dans le 93, aucune station Carrefour n'ouvre
la nuit »*.

Il avait raison deux fois. D'abord sur les noms : sur les **69 fiches nommées
Carrefour, 59 étaient des stations-service** — Flins, Bay 2, Garges,
Chambourcy. Dans OpenStreetMap, la station d'un hypermarché porte le nom de
l'enseigne et pas le sien : `name=Carrefour`, `amenity=fuel`,
`opening_hours=24/7`. Ensuite sur le fond : ce `24/7` décrit **les pompes**. Un
automate ne vend pas de sandwich.

Les stations ne viennent donc plus d'OpenStreetMap, mais du **fichier officiel
des prix des carburants** (`data.economie.gouv.fr`, sans clé, licence ouverte),
qui dit exactement ce qu'il faut :

| Champ | Ce qu'il donne |
|---|---|
| `pop` | `R` route ou **`A` autoroute** — le filtre demandé |
| `services_service` | « Boutique alimentaire », « Toilettes publiques » |
| `horaires` | les horaires de la **station**, jour par jour, pas ceux des pompes |

Mesuré en Île-de-France : **827 stations, dont 38 sur autoroute, dont 31 avec
une boutique alimentaire** — et parmi elles l'aire de **La Courneuve sur l'A1**,
exactement celle que le chauffeur citait de mémoire. Ce sont ces 31 qui
restent, les 554 autres sont parties.

Sur les 31, **17 publient une semaine complète d'horaires** (souvent
`00.00-00.00`, qui est la convention du fichier pour « en continu ») ; les 14
autres portent « horaires non publiés » et restent affichées. On ne les
convertit **pas** en 24h/24, même si sur une aire d'autoroute c'est
vraisemblable : une fiche fausse est pire qu'une fiche vague. 29 des 31 ont des
toilettes publiques, affichées comme telles.

Le nom vient de l'adresse, pas de l'enseigne : *« AUTOROUTE A1 - AIRE DE LA
COURNEUVE OUEST - SENS LILLE/PARIS »* devient **« Aire de La Courneuve Ouest ·
A1 »**. Un chauffeur reconnaît une aire à son nom et à son autoroute, pas à sa
marque de carburant. Le sens de circulation reste dans l'adresse, sous le nom.

Garde-fou : le filtre qui écarte les stations d'OpenStreetMap est posé **à la
lecture**, pas seulement dans la requête. Sans ça, une panne d'Overpass ferait
ressortir les 554 stations depuis la graine livrée avec le projet — un retour
en arrière silencieux, le pire genre.

#### Six familles, et pourquoi celles-là

Un chauffeur qui cherche à manger à deux heures du matin ne cherche pas « un
restaurant » : il cherche **du sûr** (une chaîne : il sait ce qu'il trouve, il
y a un parking et souvent des toilettes), **du rapide** (grec, kebab, tacos,
sandwich), ou **de quoi tenir jusqu'au matin** (supérette, station).

| Pastille | Ce qu'elle contient | Combien |
|---|---|---|
| Tout | tout, y compris ce qui n'a pas de famille | 1 655 |
| Chaînes | marque reconnue : McDonald's, KFC, Burger King, Subway, O'Tacos… | 376 |
| Grec · Sandwich | `cuisine` = kebab, sandwich, turkish, french_tacos, lebanese | 130 |
| Pizza | `cuisine` = pizza | 57 |
| Supérette | `shop` = supermarket ou convenience | 257 |
| Station | `amenity` = fuel avec une boutique | 554 |

Le reste — burger indépendant, poulet, asiatique, 267 + 14 fiches — n'a pas de
pastille et vit sous « Tout ». C'est volontaire : **une pastille qui ne ramène
rien est une déception de plus au volant**, et à trois heures du matin on ne
cherche pas un poke.

La catégorie est écrite **dans la donnée** (champ `t`), jamais devinée par
l'application : elle vient des étiquettes OpenStreetMap via `categorie()`, ou
de la colonne `type` des fiches saisies à la main. L'ordre de lecture compte :
station, puis commerce, puis marque, puis cuisine — sans quoi un Carrefour
City serait rangé dans « Chaînes » au lieu de « Supérette ».

Conséquence assumée : quelques enseignes d'aéroport taguées `convenience` dans
OpenStreetMap — Brioche Dorée, Pret A Manger au terminal 2E — se retrouvent en
« Supérette ». C'est l'étiquette de la base, et pour un chauffeur à Roissy à
trois heures du matin, savoir qu'il y a quelque chose d'ouvert dans le
terminal est exactement ce qu'il veut.

#### « Les Carrefour affichés 24h/24, ce sont les stations »

Signalé par le chauffeur, vérifié dans la donnée, et il avait raison : sur les
**69 fiches nommées Carrefour, 59 sont des stations-service** — Flins, Bay 2,
Garges, Chambourcy. Dans OpenStreetMap, la station d'un hypermarché porte le
nom de l'enseigne et pas le sien : `name=Carrefour`, `amenity=fuel`,
`shop=convenience;gas`, `opening_hours=24/7`. Affiché tel quel, l'écran disait
« Carrefour · 24h/24 » et laissait croire que le magasin était ouvert en pleine
nuit.

La catégorie, elle, était juste — ces fiches étaient bien rangées en
« Station ». C'est le **nom** qui mentait. Il est donc préfixé : « Station
Carrefour », « Station TotalEnergies », sauf quand il contient déjà *station*
ou *relais* (`E.Leclerc Station Service` est laissé tel quel). Les 554 stations
disent maintenant ce qu'elles sont.

Et ce qui reste en « Supérette » après correction est exactement ce que le
chauffeur décrit : **Carrefour City, Market et Express, à Paris principalement**
— ce sont eux qui ouvrent la nuit, pas les hypermarchés.

Dernier point d'honnêteté, écrit dans la note sous la liste : pour une station,
`24/7` décrit le plus souvent **les pompes**. 627 des 650 stations retenues
portent `24/7`, ce qui ne veut pas dire que la boutique sert des sandwichs à
4 h du matin.

#### Chercher une enseigne : « mac do » doit trouver McDonald's

Les pastilles répondent à « qu'est-ce qu'il y a autour de moi ». Elles ne
répondent pas à « je veux un McDo ». D'où un champ de recherche, qui porte sur
**toute la base** — les 1 655 adresses — et non sur les cinq lignes affichées :
le tri par distance fait le reste, le premier résultat est le plus proche même
s'il est à douze kilomètres.

Trois choses le rendent utilisable au volant :

- **on écrase accents, majuscules, apostrophes et espaces** avant de comparer.
  `velizy` trouve Vélizy, `mcdo` trouve McDonald's ;
- **une table de raccourcis** traduit ce qu'on dit en ce qui est écrit dans la
  base. `mac do`, `macdo`, `mcdo` → McDonald's (226 adresses) ; `bk` → Burger
  King (46) ; `dominos` → Domino's ;
- **certains mots choisissent une famille plutôt qu'un nom.** `grec`, `kebab`
  et `tacos` ne figurent dans presque aucune enseigne, mais c'est ce qu'on
  tape : ils ramènent les 130 sandwicheries. Pareil pour `pizza`, `station`,
  `essence`, `supérette`, `courses`.

Plusieurs mots se cumulent : `mcdo paris` donne 68 résultats. Et la recherche
**l'emporte sur la pastille** — chercher « mac do » avec *Pizza* coché ne doit
pas donner une liste vide pour une raison invisible à l'écran.

Dernier détail, celui qui évite la mauvaise surprise : si rien n'est **ouvert**
à cette heure-ci, l'écran ne reste pas vide. Il montre les mêmes adresses avec
l'étiquette « fermé maintenant » et le dit en une ligne — vérifié à 5 h du
matin sur « pizza ».

#### Les favoris : une étoile, et rien qui sorte du téléphone

Une étoile sur chaque ligne de *Manger*, une pastille **★ Favoris** en tête des
familles. Trois décisions :

- **la liste ne quitte pas le téléphone.** Elle est dans `localStorage`, comme
  le choix du GPS et les échéances. L'app n'a pas de compte, n'envoie rien, et
  n'a pas à en avoir pour ça ;
- **on ne garde que des identifiants, pas des fiches.** Le jour où un
  fast-food change d'horaires dans OpenStreetMap, le favori suit. Et si une
  fiche disparaît de la base, son identifiant reste dans la liste sans rien
  casser ;
- **les favoris échappent au filtre « encore ouvert ».** Partout ailleurs on
  ne montre que ce qui est ouvert — sinon l'onglet ne sert à rien à deux
  heures du matin. Mais une liste qu'on a constituée soi-même, on veut la voir
  en entier, avec l'horaire de chacun. Les adresses fermées y portent
  « fermé maintenant ».

L'étoile est sur **les trois listes** — Manger, Toilettes, Astuces — et chacune
a sa pastille *★ Favoris*. Une astuce sans lieu garde la sienne : « éviter la
porte de Bagnolet après 18 h » se range aussi bien qu'une adresse.

Côté code, un seul écouteur de clic posé sur le conteneur, jamais un par
étoile : la liste est réécrite à chaque filtre, et rattacher douze écouteurs à
chaque fois finit toujours par en oublier un. L'étoile touchée est redessinée
sur place — sauf dans la liste des favoris, où retirer une ligne doit la faire
disparaître.

**Les identifiants ont dû changer pour ça.** Les sanisettes de Paris portaient
`wc-0`, `wc-1`… c'est-à-dire leur **rang dans le fichier**. Une sanisette
retirée du jeu de données décalait tous les suivants, et chaque favori aurait
désigné la sanisette d'à côté — silencieusement, une semaine plus tard, à la
reconstruction. Elles portent maintenant leurs coordonnées
(`wc48.85525_2.36050`), et les fiches saisies à la main portent un identifiant
tiré de leur nom (`manger-chez-momo`) plutôt que leur ligne de CSV. Ajouter une
adresse au milieu du fichier ne déplace plus rien.

#### Ajouter ses propres adresses

`manger.csv` sert à ça, et c'est le contenu qui n'existe nulle part ailleurs :
les sandwicheries de quartier qu'OpenStreetMap ignore, les supermarchés ouverts
tard, les fiches avec parking et toilettes.

```
nom;adresse;dept;lat;lon;horaires;type;parking;toilettes;prix;actif
Chez Momo;12 rue de la Gare, Montreuil;93;48.8632;2.4430;lun-sam 11h-2h, dim 12h-minuit;sandwich;oui;non;€;1
```

- **`horaires`** s'écrit comme on parle : `11h-2h`, `24/24`, `lun-sam 11h-2h,
  dim 12h-minuit`, `9h à 23h30`. Les règles de jours se séparent par une
  **virgule**, jamais par un point-virgule — c'est le séparateur du fichier.
  Le texte est traduit en syntaxe OpenStreetMap puis analysé par `parse_opening`,
  déjà éprouvé sur trois mille fiches : la fiche se range alors toute seule
  dans « encore ouvert », avec son heure de fermeture. Ce qui n'est pas compris
  n'est **pas deviné** : le script le dit dans son journal, la ligne garde son
  texte et reste visible à toute heure ;
- **`type`** vaut `chaine`, `sandwich`, `pizza`, `super`, `station`, `asiat` ou
  `autre` — c'est ce qui décide de la pastille ;
- **`actif`** à `0` met la ligne de côté sans la supprimer.

Ces fiches passent **devant** les reprises automatiques à distance égale : ce
qu'un chauffeur a vérifié vaut mieux que ce qu'une base affirme.

#### Overpass refuse depuis GitHub : la graine

Les cinq miroirs Overpass refusent les requêtes venant des serveurs GitHub.
C'est à ça que sert `scripts/graine/` : une copie de la dernière bonne réponse,
livrée avec le projet, utilisée seulement si tout le reste échoue. **Elle
contient désormais aussi `overpass-courses.json.gz`** — sans quoi les 807
supérettes et stations auraient disparu en ligne sans prévenir, alors que tout
marchait en local.

Vérifié en simulant la panne, miroirs pointés vers un domaine inexistant :
848 fast-foods et 807 commerces sortent quand même, avec la même répartition
par famille.

#### Lire des horaires écrits par des humains

`opening_hours` est une syntaxe à part entière — jours fériés, semaines paires,
« sunset ». Le script n'en lit que la partie courante, qui couvre
l'écrasante majorité des fiches, et **ignore ce qu'il ne comprend pas** : une
fiche absente vaut mieux qu'une fiche fausse. Ce qu'il traite :

| Écrit dans OSM | Compris |
|---|---|
| `24/7` | ouvert en permanence |
| `Mo-Su 09:00-01:00` | tous les jours, ferme à 1 h |
| `Mo-Th 09:00-24:00; Fr 09:00-01:00; Sa 10:00-01:00` | un horaire par jour |
| `Fr-Mo 18:00-02:00` | la plage de jours qui passe le dimanche |
| `Mo-Fr 07:00-19:00; Su off` | le jour de fermeture |
| `11:30-14:30,18:30-22:30` | deux services, on garde la fin la plus tardive |

Et deux garde-fous nés de saisies réelles : **`Mo-Sa 23:30-20:00`** (vingt
heures d'affilée) et **`14:00-14:00`** (durée nulle, qui devenait vingt-quatre
heures). Toute plage de plus de vingt heures est ignorée — c'est une faute de
frappe, pas un restaurant.

Chaque fiche porte son ouverture et sa fermeture **pour les sept jours**, en
minutes depuis minuit ; au-delà de 1440, c'est après minuit. L'application lit
le jour où la **nuit** a commencé, pas le jour courant : à trois heures du
matin, le McDonald's qui ferme à 4 h relevait d'hier. Elle n'affiche que ce qui
est encore ouvert, avec l'heure de fermeture de cette nuit-là.

Ces 869 fiches pèsent 180 Ko — d'où les identifiants courts et les drapeaux
écrits seulement quand ils valent 1.

### Un cache pour Overpass

Les miroirs Overpass sont tenus par des bénévoles et refusent deux grosses
requêtes à la suite : observé ici même, les toilettes passent et les
fast-foods qui suivent reçoivent des `500`. Les réponses sont donc **gardées
une semaine** (`scripts/.cache/overpass-*.json.gz`) — OpenStreetMap ne bouge pas
d'un jour à l'autre. Si tous les miroirs refusent, le script **ressert la
dernière réponse connue, même périmée** : des toilettes d'il y a trois semaines
valent mieux qu'un écran vide.

Un piège trouvé en route : **un miroir peut répondre `200` avec une liste
vide**. On a failli mettre zéro toilette en cache pour une semaine. Une réponse
vide n'est pas une réponse : le script passe au miroir suivant.

### Les toilettes en banlieue

Les sanisettes de la Ville de Paris s'arrêtent au périphérique, et **aucune
collectivité francilienne ne publie les siennes** — vérifié sur data.gouv, où
l'on trouve Dijon, Angers, Le Havre ou Tours, mais rien autour de Paris.

La seule couverture de banlieue est **OpenStreetMap**, interrogé via Overpass :
**1 419 toilettes en accès public** dans les sept départements hors Paris — 286
en Seine-et-Marne, 273 dans l'Essonne, 243 dans les Hauts-de-Seine, 220 dans
les Yvelines, 158 en Seine-Saint-Denis, 128 dans le Val-de-Marne, 111 dans le
Val-d'Oise.

> Ce chiffre était annoncé à 2 044 : il était faux, et il comptait des toilettes
> de l'Oise et de l'Eure-et-Loir ramenées de force en Île-de-France, plus des
> toilettes parisiennes attribuées à une commune voisine. Voir juste en dessous.

Paris garde ses sanisettes : le fichier de la Ville est plus riche (statut,
horaires, accès PMR, table à langer) et additionner deux sources sur le même
trottoir n'apporterait que des doublons.

**Des horaires à une minute.** Le fichier de la Ville publie des plages
manifestement fausses. En comptant sur les 581 sanisettes en service, tout ce
qui dure moins de trois heures se répartit en deux familles, l'une et l'autre
invraisemblables :

| Plage publiée | Durée | Combien |
|---|---|---|
| `21h59 - 22h00`, `23h57 - 23h58`, `00h01 - 00h02`… | 1 à 2 min | 12 |
| `00h00 - 01h00` | 60 min | 13 |

Aucune sanisette n'ouvre deux minutes par jour, ni une heure en pleine nuit :
ce sont des relevés d'automate, pas des horaires. **La plus courte plage
crédible du fichier dépasse les trois heures**, donc écarter tout ce qui est en
dessous (`HORAIRE_MINI_MIN`) ne retire rien de légitime — 25 fiches sur 581,
qui affichent « horaires inconnus ».

On ne les convertit **pas** en « 24h/24 », même si c'est l'hypothèse la plus
probable : rien dans la source ne le dit, et envoyer quelqu'un à trois heures
du matin sur une supposition serait pire que de ne rien écrire. Si tu vérifies
sur le terrain, `manger.csv` et le carnet d'astuces sont là pour ça.

**Ce que ça vaut, et ce que ça ne vaut pas.** Ce sont des contributions, pas un
registre : le nom manque presque toujours, et surtout les horaires. L'application
affiche donc l'adresse et la distance, et n'écrit « 24h/24 » que lorsque c'est
renseigné. C'est dit dans l'onglet *Sur la route*, sous la liste.

**Attribution obligatoire.** Les données OpenStreetMap sont sous licence ODbL :
la mention « © les contributeurs OpenStreetMap » est dans l'onglet *Infos*. Ne
la retire pas, c'est la condition d'usage.

**Un piège de machine, pas de code.** Overpass refuse la poignée de main TLS
des Python un peu anciens (macOS 3.9 : `SSLV3_ALERT_HANDSHAKE_FAILURE`) alors
que `curl` passe, et l'instance française limite fortement le débit. D'où la
liste `OVERPASS_MIRRORS`, essayée dans l'ordre. Sur Python 3.11 — celui de la
GitHub Action — `overpass-api.de` répond normalement. La lecture de la réponse
(`parse_toilets_osm`) est séparée du téléchargement pour pouvoir être vérifiée
hors ligne, et une panne d'Overpass laisse simplement les sanisettes de Paris.

### Trouver l'adresse d'un point : la leçon du Burger King de Montrouge

OpenStreetMap donne des coordonnées, rarement une adresse. On déduisait donc la
commune en cherchant **le centre communal le plus proche**. C'était faux, et
pas qu'un peu :

| Affiché | Réalité (Base Adresse Nationale) |
|---|---|
| Burger King à **Montrouge** | 80 avenue du Général-Leclerc, **Paris 14e** |
| McDonald's à **Montrouge** | 5 avenue du Général-Leclerc, **Paris 14e** |
| McDonald's à **Saint-Mandé** | 282 avenue Daumesnil, **Paris 12e** |
| McDonald's à **Saint-Mandé** | 116 boulevard Diderot, **Paris 12e** |

La raison est géométrique : le centre de Montrouge est à un kilomètre de la
porte d'Orléans, celui de Paris à cinq. **Toute une bande intérieure du
périphérique était donc expulsée vers la petite couronne**, et un McDonald's de
Chartres était ramené en Île-de-France faute de mieux.

La correction tient en trois niveaux, du plus sûr au moins sûr (`situer`) :

1. **ce que la fiche OSM dit d'elle-même** (`addr:housenumber`, `addr:street`,
   `addr:city`) — rare mais fiable ;
2. **la Base Adresse Nationale**, géocodage inverse officiel, gratuit et sans
   clé. Son point d'entrée CSV prend un fichier de coordonnées et rend
   l'adresse, le code postal, la commune et le code INSEE : 2 800 points en une
   requête, `HTTP 200` en moins d'une seconde ;
3. **la commune la plus proche**, qui ne sert plus que de dernier recours.

Deux bénéfices en plus de l'adresse exacte : le **code INSEE donne le vrai
département**, donc les points de l'Oise, de l'Eure et de l'Eure-et-Loir que le
rectangle Overpass ramassait sont enfin écartés (2 016 → 1 419 toilettes,
869 → 848 fast-foods) ; et les toilettes parisiennes mal attribuées ne font
plus doublon avec les sanisettes.

Les réponses sont **gardées dans `scripts/.cache/adresses.json`**, les échecs
compris : au deuxième build, la BAN n'est plus appelée du tout.

### La recharge électrique, retirée

La section *Énergie* a été supprimée : Google Maps, Waze et les applications
spécialisées (Chargemap et consorts) font ce travail mieux, avec les tarifs et
la disponibilité en temps réel que nous n'avions pas. Le code du téléchargeur
a été retiré, pas seulement l'onglet.

### Comment la timeline est découpée

Une ligne = **un lieu et une tranche de deux heures**, pour les gares comme
pour les aéroports (`BAND_HOURS` dans le script). Les bornes affichées sont
**rondes** — 20 h → 22 h, 22 h → minuit — et pas l'heure du premier train de
la tranche : une heure ronde se retient, « 20 h 42 → 21 h 51 » ne se retient
pas. À heure égale, le lieu qui rapporte le plus est affiché en premier.

C'est le résultat de trois corrections successives. Au départ, des demi-heures
par terminal et par gare : plus de quatre-vingts lignes pour une soirée, dont
une majorité à un seul train ou un seul avion, et les concerts noyés dedans.
Puis des heures. Puis ces tranches de deux heures aux bornes rondes, qui
ramènent la même soirée à une quarantaine de lignes — une par lieu, deux fois
dans la soirée.

Les événements, eux, gardent **leur heure à eux**, pas une tranche : un concert
annoncé à 22 h 30 s'affiche à 22 h 30.

**Cette heure est celle du début, pas de la fin.** La billetterie ne publie pas
d'heure de fin, et l'application n'en affiche aucune — sauf pour les salons,
qui ont une heure de fermeture (« jusqu'à 19h00 »). Une durée par défaut existe
bien dans le code (`TAIL_MIN` : 2 h 30 pour un concert, 2 h pour un match), mais
elle ne sert qu'à **garder la ligne affichée** pendant que l'événement a lieu :
c'est à la sortie que la demande arrive, il serait absurde de faire disparaître
le concert à l'heure où il commence. Elle n'est jamais écrite à l'écran.

Pour élargir ou resserrer, `BAND_HOURS` est la seule valeur à changer.

### Ce qui est passé disparaît, demain attend 6 h, et après-demain n'existe pas

Trois règles, une seule fonction (`VTC.live` dans `app.js`), appliquées au
brief comme à *Où aller* :

- **Une tranche finie disparaît à la seconde où elle finit.** « 18h-20h » n'a
  plus rien à dire à 20 h 01. Il y avait auparavant une tolérance de trente
  minutes, qui faisait traîner la tranche de 18 h jusqu'à 20 h 30.
- **Les trains et les vols s'arrêtent à 6 h du matin**, comme la nuit. Les
  arrivées de demain ne s'affichent donc qu'à partir de 6 h demain : à 23 h,
  personne ne va se placer pour un TGV de 8 h, et ces lignes poussaient le
  reste hors de l'écran. Les **événements échappent à la règle** — un match ou
  un salon, ça se prépare la veille : la section « Demain » ne contient plus
  qu'eux.
- **La liste s'arrête à la fin de la journée de demain** (`HORIZON_J = 2`).
  Ticketmaster publie à dix jours ; affichée telle quelle, la liste mélangeait
  la soirée en cours et les concerts de la semaine suivante, qui la poussaient
  hors de l'écran. Au volant, un match dans six jours n'est pas une
  information : c'est du bruit entre soi et ce qu'on cherche. La coupure se
  fait à **6 h du matin**, comme le reste — à 2 h, « aujourd'hui » est encore
  la nuit qu'on est en train de faire, et on ne perd pas la soirée en cours en
  passant minuit.

### La météo, en haut à droite

Il pleut, tout le monde commande. C'était le seul signal de demande qu'on
n'exploitait pas, et c'est le moins cher de tous.

**Open-Meteo** : gratuit, sans clé, sans inscription, sans quota affiché —
mesuré à `HTTP 200` en 0,5 s. Le script lui demande l'heure par heure sur 36
heures, **déjà convertie en heure de Paris** : pas de fuseau à recalculer,
c'est là que ce projet s'est le plus trompé. L'application choisit l'heure
courante elle-même, donc un téléphone qui lit un fichier vieux de trois heures
affiche quand même la bonne.

Cinq états, pas davantage — au-delà, une icône de vingt pixels ne veut plus
rien dire :

| État | Codes OMM | Icône |
|---|---|---|
| soleil | 0 | ☀️, 🌙 la nuit |
| soleil nuageux | 1, 2 | ⛅, 🌙 la nuit |
| nuageux | 3, 45, 48 | ☁️ |
| neige | 71 → 77, 85, 86 | 🌨️ |
| pluie | tout le reste | 🌧️ |

L'icône est au-dessus, la température dessous : une forme se reconnaît de plus
loin qu'un chiffre, et c'est elle qui dit s'il va falloir rouler sous la pluie.
**Un grand soleil à deux heures du matin décrédibiliserait tout l'écran**, d'où
la lune : Open-Meteo donne `is_day` heure par heure, on ne le devine pas.

#### Huit points, et celui qui te concerne

Un seul point pour toute l'Île-de-France, c'était annoncer le ciel de Nanterre
à quelqu'un qui roule à Melun — il y avait déjà un degré d'écart entre les deux
au premier essai, et le soleil à Cergy pendant que Paris était couvert.

Le script interroge donc **huit points, un par département**, groupés dans une
seule requête — Open-Meteo les accepte et renvoie une liste dans l'ordre
demandé. L'application prend **le plus proche du chauffeur quand il regarde son
brief perso**, et Paris pour le brief régional. Paris est toujours le premier
point de la liste : c'est le repli naturel.

Les heures ne sont écrites qu'une fois, chaque point ne porte que ses valeurs :
huit points sur trente-sept heures tiennent en **7 Ko**.

### Mes échéances

Carte VTC, visite médicale, formation continue, assurance, contrôle technique :
cinq dates qui arrêtent l'activité le jour où elles tombent, et qu'on oublie.
Elles se saisissent dans **Réglages**, et le **brief prévient à temps** — une
ligne discrète tout en bas, parce qu'une page web ne sait pas envoyer de
notification. Chaque échéance a son propre délai (`rappel` dans `app.js`) :
**trois mois pour la carte VTC**, parce que son renouvellement prend environ
deux mois en préfecture et qu'un mois d'avance arriverait déjà trop tard ; un
mois pour les quatre autres. C'est aussi pour ça que ça vit dans le brief : c'est l'écran qu'on
ouvre tous les jours.

Tout est en `localStorage` (clé `vtc_echeances`). **Rien n'est envoyé nulle
part** : ce sont des papiers personnels, pas des données d'application. La
contrepartie est dite à l'écran : changer de téléphone, c'est les resaisir.

L'onglet *Infos* s'appelle désormais **Réglages** : ce qu'on y fait passe avant
ce qu'on y lit, et les échéances sont en premier. Pense à renommer la section
dans GoodBarber pour que le libellé de l'onglet suive.

### Astuces, à la place de Pause

Le sous-onglet *Pause* est devenu **Astuces**, en dernière position. C'est le
carnet du chauffeur : ce qui s'apprend en roulant et ne se trouve dans aucune
base — un lieu où patienter sans amende, l'heure où la recharge coûte moins
cher, une entrée de parking qu'il vaut mieux éviter.

Il se remplit dans `scripts/sources/astuces.csv` :

```
titre;texte;dept;lat;lon;actif
```

**Les coordonnées sont facultatives** : une astuce peut ne concerner aucun
endroit précis. Quand elles sont là, la fiche porte son bouton GPS et se classe
par distance, les autres se lisent, c'est tout.

### Cinq lieux, pas douze

Quand la position est accordée, les sous-onglets *Toilettes*, *Manger* et
*Astuces* n'affichent que **les cinq plus proches**. Douze lignes triées par
distance, c'est onze de trop : la sixième est déjà trop loin pour qu'on y aille.
Sans position, la liste n'est pas triée par distance — on en montre douze,
faute de mieux, et l'écran le dit.

### Waze ou Google Maps, une fois pour toutes

Un chauffeur a son GPS et il n'en change pas. Proposer les deux sur chaque
fiche, c'était un bouton sur deux qui ne servait jamais. Le choix se fait dans
**Infos → Ton GPS**, et il n'y a que deux réponses : *Waze* (par défaut, le plus
répandu chez les chauffeurs) ou *Google Maps*. Pas de troisième option « les
deux » : c'était exactement le problème qu'on voulait résoudre.

Le réglage est gardé dans le téléphone (`localStorage`, clé `vtc_nav`) et relu
par les autres onglets à leur prochain affichage. Il vaut aussi pour le « Y
aller » d'*Où aller*, qui n'a la place que d'un lien.

**Le bouton se range à droite**, au niveau du nom et de l'adresse : la fiche
passe de trois lignes à deux, et l'écran tient huit lieux au lieu de quatre.

### Les lignes coupées : pourquoi il n'y en a pas

Un RER interrompu, c'est la meilleure nouvelle de la journée pour un chauffeur.
L'information n'est pourtant pas dans l'application, et ce n'est pas faute
d'avoir cherché.

**L'API SNCF ne publie que des trains, jamais des lignes.** 600 perturbations
examinées sur six pages : **100 % au niveau du train** (`embedded_type: trip`),
zéro au niveau de la ligne. `/lines/{id}/disruptions` répond `404`, et le
rapport de trafic du réseau Transilien répond `no_solution`. Avec ça on peut
écrire « ce train est supprimé », pas « le RER B est interrompu ».

**La bonne source existe** : c'est celle qui alimente les écrans d'Île-de-France
Mobilités, `prim.iledefrance-mobilites.fr/marketplace/general-message`. Elle
couvre métro, RER, Transilien, tram et bus. Elle répond
`401 {"message":"No API key found in request"}` : il faut une clé gratuite.

Le bouton d'inscription du portail ne répond pas toujours. Le formulaire est
atteignable directement :

```
https://connect.iledefrance-mobilites.fr/auth/realms/connect-b2b/protocol/openid-connect/registrations?client_id=prim&redirect_uri=https://prim.iledefrance-mobilites.fr/fr/&response_type=code&scope=openid%20email
```

Une fois la clé en place (`IDFM_TOKEN`), le brief pourra porter une ligne — et
seulement quand il y a quelque chose à dire. Tant que la clé n'est pas là,
**rien n'est écrit** : mieux vaut pas de ligne qu'une ligne qui ne sait pas.

### Ce qui a été testé et écarté

Pour les vols :

| Testé | Résultat |
|---|---|
| Site de Paris Aéroport | protégé par Imperva, renvoie une page anti-robot |
| data.gouv / data.iledefrance | seulement du trafic mensuel agrégé, inutilisable pour un brief |
| OpenSky Network | `HTTP 403` sans compte ; et ne donne que des atterrissages passés, sans terminal |
| AviationStack | `HTTP 401` sans clé ; offre gratuite annoncée à 100 requêtes **par mois** — le brief en demande 720 |
| AeroDataBox (RapidAPI) | `HTTP 401` sans clé ; palier gratuit annoncé en « unités », de l'ordre de 600/mois |
| FlightAware AeroAPI | `HTTP 401` sans clé ; facturé à la requête |

Pour les événements :

| Testé | Résultat |
|---|---|
| Recherche géographique Ticketmaster | `latlong` + `radius` renvoie zéro autour de Paris, même avec `locale=*`. Le rattachement se fait donc par identifiant de salle, ce qui est de toute façon plus sûr |
| Bandsintown | `HTTP 403`, l'`app_id` libre d'autrefois ne passe plus |
| API OpenAgenda directe | demande une clé — d'où le passage par le miroir OpenDataSoft, qui n'en demande pas |
| `evenements-publics-cibul` (data.iledefrance.fr) | c'est le **même** export OpenAgenda, pré-filtré sur l'Île-de-France. Testé côte à côte avec le miroir national : exactement les 29 mêmes événements dans les salles du référentiel. Il est bien tenu à jour (contrairement à ce qu'indique sa fiche), mais il n'apporte rien de plus |
| TheSportsDB | répond avec la clé de test publique et donne les matchs de Ligue 1, mais l'usage commercial est payant et il faut maintenir une table équipe → stade |
| Sites des salles (Accor Arena, Stade de France, Seine Musicale, La Défense Arena) | cinq CMS différents, aucun flux structuré : le `wp-json` de La Seine Musicale n'expose pas ses événements, le Stade de France n'a pas de JSON:API et filtre les robots |
| Viparis | site en Nuxt, pas d'API publique, et son `sitemap.xml` ne contient pas le calendrier des salons |

Reste la saisie du dimanche soir pour ce que personne ne couvre : Charléty,
Yves-du-Manoir, et tout ce qui se décide à la dernière minute. Le Parc des
Princes hors Ligue 1 n'est pas un souci — ce qui s'y vend passe par
Ticketmaster.

---

## 7. Ce qui n'est pas fini, et qu'il faut savoir

- **Les identifiants `stop_area` de gares.csv ne sont pas vérifiés.** La
  colonne `verifie` est à `0`. Au premier passage avec ta clé, le script
  écrira « vérifie le stop_area » pour celles qui échouent — et se rabattra
  sur l'horaire théorique, qui, lui, est déjà vérifié sur les dix gares. Le bon identifiant se
  trouve ainsi :
  ```bash
  curl -H "Authorization: TA_CLE" \
    "https://api.sncf.com/v1/coverage/sncf/places?q=Montparnasse&type[]=stop_area"
  ```
- **Les vols sont branchés, mais partiels et théoriques** : Air France, KLM et
  Transavia seulement, sans retards (§ 6). Le jour où un compte Ticketmaster ou
  une API temps réel entre dans le budget, c'est là qu'il faut regarder.
- **Les coordonnées des salles et des terminaux pointent sur le site**, pas sur
  le point de prise en charge. C'est à corriger sur le terrain, salle par salle
  et terminal par terminal (`sources/salles.csv`, `sources/terminaux.csv`) — et
  c'est précisément ce qu'aucun concurrent n'aura.
- **Heure d'hiver** : réglé. `PARIS_TZ` n'est plus figé, il sort de
  `paris_tz_at()`, qui applique la règle européenne du changement d'heure. Il
  fallait le faire pour dater correctement une sortie de concert ou une arrivée
  de vol tombant après le 25 octobre.
- **Les événements automatiques ne couvrent pas tout** : rien au Stade de
  France ni à La Seine Musicale, une partie seulement de l'Accor Arena (§ 6).
  La saisie du dimanche soir reste la source la plus fiable, et elle est
  prioritaire sur les agendas.
- **La publicité** reste à brancher : vérifie si la régie GoodBarber s'affiche
  bien au-dessus d'une section HTML. Sinon il faudra une bannière dans le HTML.

---

## 8. Comment la demande est estimée

L'application n'affiche **aucun chiffre** de demande. Elle affiche trois
niveaux :

| Affiché | Sens | Quand |
|---|---|---|
| 🔥🔥🔥 rouge plein | On y va | à partir de 200 courses estimées |
| 🔥🔥 rouge sourd | Ça vaut le détour | à partir de 100 |
| 🔥 rouge discret | Il y a de quoi faire | à partir de 45 |
| rien | Pas de quoi se déplacer exprès | en dessous |

C'est un choix délibéré, et un retour en arrière assumé : une version
précédente écrivait « ~149 courses ». C'était une fausse précision. Personne ne
peut promettre 149 courses, et le chiffre obligeait à se dédire dans la phrase
juste en dessous. Une note en flammes dit la même chose sans mentir, et se lit
sans lire — au feu rouge, on compte des flammes, on ne déchiffre pas un nombre.

Les seuils sont calés pour qu'il y ait à peu près autant de lignes dans chaque
niveau : trois flammes reste rare, donc ça veut encore dire quelque chose. Le
barème est expliqué dans l'application, onglet *Infos*.

Sur fond sombre, « plus foncé » se verrait **moins**. C'est donc la densité qui
monte, pas l'obscurité : « forte » garde un fond sourd et un texte rouge clair,
« très forte » passe en rouge plein. C'est celle-là qu'on repère du coin de
l'œil au volant.

**Les seuils sont dans `app.js`** (`DEMAND_HIGH`, `DEMAND_SOME`), pas dans le
script de données : les régler ne demande pas de régénérer quoi que ce soit, ni
d'attendre le prochain passage du robot.

### L'estimation qui est derrière

Elle reste calculée et stockée dans `brief.json` : c'est elle qui classe les
lieux au sein d'une tranche et qui choisit le bloc « Maintenant ». Elle se
calcule en deux temps, séparés dans le code pour qu'on puisse discuter chaque
hypothèse sans toucher à l'autre.

**1. Combien de personnes sortent.** Propre à chaque source :

| Source | Hypothèse |
|---|---|
| Train | 60 % des places du train (`TRAIN_EXIT_SHARE`), et seulement 35 % de ce total à un arrêt intermédiaire comme Massy |
| Vol | places réellement installées dans l'avion (le SSIM donne la configuration cabine exacte) × 85 % de remplissage × la part qui ne repart pas en correspondance — 65 % en long-courrier, 90 % sur un vol intérieur |
| Salle, saisie à la main | 85 % de la jauge (`HALL_EXIT_SURE`) |
| Salle, reprise d'un agenda | 50 % de la jauge (`HALL_EXIT_AUTO`), parce qu'on ignore si la salle sera pleine et si l'événement n'occupe pas qu'un hall |

**2. Combien de courses ça fait.** Deux taux, les mêmes pour tout le monde :
**8 % des gens qui sortent commandent une voiture** (`VTC_TAKE_RATE`) plutôt que
le métro, le RER, un proche ou un bus, et **une course emmène 1,5 personne**
(`PEOPLE_PER_RIDE`).

Les vols portent en plus un multiplicateur par rapport au train, qui sert de
référence : **× 2,4 en long-courrier, × 1,7 en moyen-courrier, × 1 sur un vol
intérieur**. Un passager d'avion prend beaucoup plus souvent une voiture — pas
de métro à Roissy, des valises, et des atterrissages à des heures où le RER est
rare. Un vol intérieur à Orly se rapproche du train, c'est souvent un habitué
qui file à l'Orlyval.

### Ce que ça ne dit pas

**Ce n'est pas ta demande à toi.** C'est ce que la zone peut générer, toutes
plateformes et tous chauffeurs confondus, taxis compris. « Très forte demande »
veut dire « c'est là qu'il faut être », pas « tu vas enchaîner ».

Toutes ces hypothèses sont des constantes nommées en haut de `build_data.py`.
Si l'expérience du terrain te dit qu'elles sont fausses, ce sont des nombres à
changer, pas du code à réécrire — et c'est toi qui as les vraies données.
