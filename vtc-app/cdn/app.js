/* ==========================================================================
   VTC IDF — logique partagée par les 4 onglets GoodBarber
   Hébergé sur le CDN (pas dans GoodBarber) : corriger un bug ici ne demande
   ni republication de l'app ni nouvelle validation Apple.
   ========================================================================== */

var VTC = (function () {
  'use strict';

  // ⚠️ À remplacer par ton URL (GitHub Pages / Cloudflare Pages) après déploiement.
  // window.__VTC_BASE permet de pointer ailleurs sans toucher ce fichier
  // (c'est ce qu'utilise la prévisualisation locale).
  var BASE = window.__VTC_BASE || 'https://TON-COMPTE.github.io/vtc-idf/data/';

  var DEPTS = [
    { code: 'all', label: 'Toute l’IDF' },
    { code: '75',  label: 'Paris' },
    { code: '92',  label: '92' },
    { code: '93',  label: '93' },
    { code: '94',  label: '94' },
    { code: '95',  label: '95' },
    { code: '78',  label: '78' },
    { code: '91',  label: '91' },
    { code: '77',  label: '77' }
  ];

  /* KINDS sert à l'icône de chaque ligne : on garde le détail, parce qu'un
     concert, un match et un salon ne se ressemblent pas sur le terrain.     */
  var KINDS = {
    train:   { label: 'Trains',      ico: '🚆' },
    flight:  { label: 'Vols',        ico: '✈️' },
    concert: { label: 'Concert',     ico: '🎤' },
    sport:   { label: 'Sport',       ico: '⚽' },
    salon:   { label: 'Salon',       ico: '🏢' }
  };

  /* FILTERS sert aux pastilles de l'onglet « Où aller ». Concerts, sport et
     salons sont réunis sous « Événements » : sur trois jours il y a rarement
     les trois à la fois, et trois pastilles dont deux vides, c'est trois
     occasions de cliquer pour ne rien trouver.                              */
  /* Les pastilles sont du texte, sans émoji : trois couleurs vives alignées
     en haut de l'écran tiraient l'œil avant le contenu, et « Trains » se lit
     aussi vite qu'un train dessiné. */
  var FILTERS = [
    { code: 'train',  label: 'Trains',     kinds: ['train'] },
    { code: 'flight', label: 'Vols',       kinds: ['flight'] },
    { code: 'event',  label: 'Événements', kinds: ['concert', 'sport', 'salon'] }
  ];

  function inFilter(kind, code) {
    if (code === 'all') return true;
    for (var i = 0; i < FILTERS.length; i++) {
      if (FILTERS[i].code === code) return FILTERS[i].kinds.indexOf(kind) !== -1;
    }
    return false;
  }

  /* ---- Tranches de la journée -------------------------------------------
     Le titre de l'écran suit l'heure réelle d'ouverture de l'app.          */

  function period(d) {
    var h = d.getHours();
    if (h >= 5  && h < 11) return { key: 'matin', label: 'Ce matin' };
    if (h >= 11 && h < 14) return { key: 'midi',  label: 'Ce midi' };
    if (h >= 14 && h < 18) return { key: 'aprem', label: 'Cet après-midi' };
    if (h >= 18)           return { key: 'soir',  label: 'Ce soir' };
    return { key: 'nuit', label: 'Cette nuit' };
  }

  /* Fin de la tranche courante : sert à séparer « maintenant » du « plus tard ». */
  function periodEnd(d) {
    var h = d.getHours(), end = new Date(d);
    var bounds = [5, 11, 14, 18, 24];
    for (var i = 0; i < bounds.length; i++) {
      if (h < bounds[i]) { end.setHours(bounds[i], 0, 0, 0); return end; }
    }
    end.setHours(24, 0, 0, 0);
    return end;
  }

  /* ---- Chargement des données -------------------------------------------
     Si le réseau tombe, on réaffiche la dernière version connue plutôt que
     de laisser un écran vide : un chauffeur en sous-sol garde son brief.   */

  function load(name, cb) {
    var key = 'vtc_cache_' + name;
    var done = false;

    function fromCache(reason) {
      if (done) return;
      var raw = null;
      try { raw = localStorage.getItem(key); } catch (e) {}
      if (!raw) { done = true; cb(reason || 'offline', null); return; }
      try { done = true; cb(null, JSON.parse(raw), true); }
      catch (e) { done = true; cb('corrupt', null); }
    }

    var to = setTimeout(function () { fromCache('timeout'); }, 8000);

    fetch(BASE + name + '.json', { cache: 'no-store' })
      .then(function (r) {
        if (!r.ok) throw new Error('http ' + r.status);
        return r.json();
      })
      .then(function (json) {
        clearTimeout(to);
        if (done) return;
        done = true;
        try { localStorage.setItem(key, JSON.stringify(json)); } catch (e) {}
        cb(null, json, false);
      })
      .catch(function () { clearTimeout(to); fromCache('network'); });
  }

  /* ---- Temps ------------------------------------------------------------- */

  function hhmm(iso) {
    var d = new Date(iso);
    return ('0' + d.getHours()).slice(-2) + 'h' + ('0' + d.getMinutes()).slice(-2);
  }

  function minutesUntil(iso) {
    return Math.round((new Date(iso).getTime() - Date.now()) / 60000);
  }

  function countdown(iso) {
    var m = minutesUntil(iso);
    if (m < -120) return 'terminé';
    if (m < 0)    return 'en cours';
    if (m === 0)  return 'maintenant';
    if (m < 60)   return 'dans ' + m + ' min';
    var h = Math.floor(m / 60), r = m % 60;
    return 'dans ' + h + ' h' + (r ? ' ' + ('0' + r).slice(-2) : '');
  }

  function dayLabel(d) {
    var j = ['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi'];
    var m = ['janvier','février','mars','avril','mai','juin',
             'juillet','août','septembre','octobre','novembre','décembre'];
    return j[d.getDay()] + ' ' + d.getDate() + ' ' + m[d.getMonth()];
  }

  /* ---- Géolocalisation et distances ------------------------------------- */

  function distKm(lat1, lon1, lat2, lon2) {
    var R = 6371, p = Math.PI / 180;
    var dLat = (lat2 - lat1) * p, dLon = (lon2 - lon1) * p;
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * p) * Math.cos(lat2 * p) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function fmtDist(km) {
    if (km < 1) return Math.round(km * 1000) + ' m';
    return (km < 10 ? km.toFixed(1) : Math.round(km)) + ' km';
  }

  /* `maxAge` dit jusqu'à quel âge une position déjà connue du téléphone fait
     l'affaire. Pour une liste triée par distance, deux minutes suffisent. Pour
     le brief « autour de moi », on demande 0 : on peut fermer l'application à
     Orly et la rouvrir dans Paris, et le secteur n'est alors plus du tout le
     même.                                                                   */
  function locate(cb, maxAge) {
    if (!navigator.geolocation) { cb('unsupported', null); return; }
    navigator.geolocation.getCurrentPosition(
      function (p) {
        rememberGeo('ok');
        cb(null, { lat: p.coords.latitude, lon: p.coords.longitude });
      },
      function (e) {
        if (e.code === 1) rememberGeo('ko');   // refusé : on ne le repropose pas
        cb(e.code === 1 ? 'denied' : 'unavailable', null);
      },
      { enableHighAccuracy: false, timeout: 9000,
        maximumAge: maxAge === undefined ? 120000 : maxAge }
    );
  }

  /* Rejoue `fn` quand l'écran redevient visible — c'est ce qui se passe quand
     on rouvre l'application sans la relancer, ou qu'on revient d'un autre
     onglet. Sans ça, une position prise à Orly resterait affichée à Paris.  */
  function onReopen(fn, minGapMs) {
    var last = Date.now(), gap = minGapMs || 30000;
    function maybe() {
      if (document.visibilityState === 'hidden') return;
      if (Date.now() - last < gap) return;
      last = Date.now();
      fn();
    }
    document.addEventListener('visibilitychange', maybe);
    window.addEventListener('pageshow', maybe);
    window.addEventListener('focus', maybe);
  }

  /* ---- Ouverture du GPS -------------------------------------------------
     Waze et Google Maps acceptent tous deux des coordonnées : on évite les
     erreurs de géocodage d'adresse, fréquentes sur les sanisettes.         */

  function wazeUrl(lat, lon) {
    return 'https://waze.com/ul?ll=' + lat + '%2C' + lon + '&navigate=yes';
  }

  function gmapsUrl(lat, lon, label) {
    var u = 'https://www.google.com/maps/dir/?api=1&destination=' + lat + ',' + lon;
    if (label) u += '&destination_place_id=&travelmode=driving';
    return u;
  }

  /* ---- Waze ou Google Maps ? --------------------------------------------
     Un chauffeur a son GPS et il n'en change pas. Lui proposer les deux à
     chaque ligne, c'est un bouton sur deux qui ne servira jamais, et deux
     fois moins de place pour ce qu'il doit lire. Le choix se fait une fois
     dans Infos et tient dans le téléphone — il ne part nulle part.       */
  var NAV_KEY = 'vtc_nav';
  var NAVS = { waze: 'Waze', gmaps: 'Google Maps' };

  function navPref() {
    try {
      var v = localStorage.getItem(NAV_KEY);
      if (NAVS[v]) return v;
    } catch (e) {}
    return 'waze';                      // le plus répandu chez les chauffeurs
  }

  function setNavPref(v) {
    try { localStorage.setItem(NAV_KEY, NAVS[v] ? v : 'waze'); } catch (e) {}
  }

  /* Un seul bouton, toujours : celui de l'application que le chauffeur a
     choisie. Il se range à droite de la fiche, au niveau du nom.          */
  function navButtons(lat, lon) {
    var gmaps = navPref() === 'gmaps';
    return '<div class="btn-pair btn-pair--seul">' +
      '<a class="btn btn--accent" target="_blank" rel="noopener" href="' +
      (gmaps ? gmapsUrl(lat, lon) : wazeUrl(lat, lon)) + '">' +
      (gmaps ? 'Maps' : 'Waze') + '</a></div>';
  }

  /* Quand il n'y a de place que pour un seul lien — le « Y aller » des
     listes — on suit la même préférence, Waze par défaut.               */
  function navUrl(lat, lon) {
    return navPref() === 'gmaps' ? gmapsUrl(lat, lon) : wazeUrl(lat, lon);
  }

  /* ---- La position a-t-elle déjà été accordée ? -------------------------
     Retenu dès qu'une position arrive, dans n'importe quel onglet. C'est ce
     qui permet au brief de s'ouvrir directement sur « Autour de moi » : si
     le chauffeur a autorisé la localisation, son secteur est ce qu'il veut
     voir en premier, pas toute l'Île-de-France.

     On ne demande pas à `navigator.permissions` : iOS ne répond pas pour la
     géolocalisation dans une WebView. Un fait observé vaut mieux qu'une API
     qui répond « prompt » partout.                                       */
  var GEO_KEY = 'vtc_geo';

  function geoKnown() {
    try { return localStorage.getItem(GEO_KEY); } catch (e) { return null; }
  }

  function rememberGeo(v) {
    try { localStorage.setItem(GEO_KEY, v); } catch (e) {}
  }

  /* ---- Utilitaires d'affichage ------------------------------------------ */

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* On n'affiche pas de nombre de courses. L'estimation reste dans les
     données — elle sert à classer et à choisir le bloc « maintenant » — mais
     l'écrire donnait une fausse précision : personne ne peut promettre
     « 149 courses ». Une note en flammes se lit sans lire, au feu rouge.

     Quatre niveaux, calés pour qu'il y ait à peu près autant de lignes dans
     chacun : trois flammes reste rare, donc ça veut encore dire quelque chose.
     Les seuils sont ici, pas dans le script : les régler ne demande ni de
     régénérer les données ni d'attendre le prochain passage du robot.       */
  var DEMAND_3 = 200;   // 🔥🔥🔥 on y va
  var DEMAND_2 = 100;   // 🔥🔥   ça vaut le détour
  var DEMAND_1 = 45;    // 🔥     il y a de quoi faire

  function demandTag(v) {
    var n = !v || v < DEMAND_1 ? 0 : v >= DEMAND_3 ? 3 : v >= DEMAND_2 ? 2 : 1;
    if (!n) return '';
    return '<span class="tag tag--demand-' + n + '">' +
           new Array(n + 1).join('🔥') + '</span>';
  }

  /* L'émoji d'une catégorie, enveloppé pour être désaturé par la feuille de
     style : dans un écran monochrome, un avion bleu vif fait tache, alors que
     la forme, elle, se reconnaît instantanément — c'est tout ce qu'on lui
     demande. */
  function ico(kind) {
    var k = KINDS[kind];
    return k && k.ico ? '<span class="ico">' + k.ico + '</span> ' : '';
  }

  function deptTag(d) {
    return d ? '<span class="tag tag--dept">' + esc(d === '75' ? 'Paris' : d) + '</span>' : '';
  }

  /* Libellé d'un créneau : un seul horaire, ou une plage si c'est un groupe. */
  function slotLabel(item) {
    if (item.end && item.end !== item.start) return hhmm(item.start) + '–' + hhmm(item.end);
    return hhmm(item.start);
  }

  /* ---- « 22h30 », oui, mais 22h30 de quoi ? --------------------------------
     Pour une gare ou un aéroport, l'heure affichée est celle des arrivées.
     Pour une salle, c'est celle de la SORTIE — le seul moment qui intéresse un
     chauffeur — et elle est estimée, pas officielle : la billetterie ne publie
     que l'heure du billet. Sans le mot « sortie » devant, on lit l'heure du
     concert, et un concert à 22h30 à Bercy, ça n'existe pas.               */
  var SORTIE = { concert: 1, sport: 1, salon: 1 };

  function isSortie(item) {
    return !!SORTIE[item && item.kind];
  }

  /* Une tranche s'écrit sur deux lignes, pas côte à côte : « 14h00–19h00 »
     élargissait la colonne et décalait le titre de cette ligne-là toute seule.
     Empilées, les heures gardent la largeur d'une seule, et tous les titres de
     la liste commencent au même endroit.                                   */
  function timeCell(item) {
    if (!isSortie(item)) return esc(hhmm(item.start));   // arrivées : l'heure du créneau
    var h = '<span class="row__when">sortie</span>' + esc(hhmm(item.start));
    if (item.end && item.end !== item.start) {
      h += '<span class="row__h2">' + esc(hhmm(item.end)) + '</span>';
    }
    return h;
  }

  function subLine(item) {
    var bits = [];
    if (item.venue) bits.push(esc(item.venue));
    if (item.count && item.count > 1) bits.push(item.count + ' arrivées');
    return bits.join(' · ');
  }

  /* Score : ce qui est gros et proche passe devant ce qui est gros et loin
     dans le temps. Sert à choisir LE bloc « maintenant » de l'accueil.     */
  function score(item) {
    var m = minutesUntil(item.start);
    if (m < -30) return -1;
    var vol = item.volume || 5;
    var decay = m <= 0 ? 1 : 1 / (1 + m / 45);
    return vol * decay;
  }

  /* ---- Ce qui est encore devant soi -------------------------------------
     Fin utile d'une ligne. Un créneau d'arrivées porte sa fin — « 18h-20h »
     n'intéresse plus personne à 20h01. Un concert, lui, n'a pas d'heure de
     fin publiée, et c'est pourtant à la SORTIE que la demande arrive : on le
     garde donc affiché le temps qu'il dure, sans écrire nulle part une heure
     de fin qu'on ne connaît pas.                                           */
  var TAIL_MIN = { concert: 150, sport: 120 };

  function endOf(it) {
    if (it.end) return new Date(it.end).getTime();
    return new Date(it.start).getTime() + (TAIL_MIN[it.kind] || 0) * 60000;
  }

  /* La journée de travail se termine à 6 h, comme la nuit. Les arrivées de
     demain n'apparaissent donc qu'à partir de 6 h demain : à 23 h, personne
     ne va se placer pour un TGV de 8 h du matin, et ces lignes-là poussaient
     le reste hors de l'écran. Les événements échappent à la règle : un match
     ou un salon de demain, ça se prépare la veille.                        */
  var DAY_TO_H = 6;

  function dayEnd(now) {
    var d = new Date(now || Date.now());
    var f = new Date(d.getFullYear(), d.getMonth(), d.getDate(), DAY_TO_H, 0, 0, 0);
    if (d.getHours() >= DAY_TO_H) f.setDate(f.getDate() + 1);
    return f;
  }

  var DU_JOUR = { flight: 1, train: 1 };   // ne dépassent pas la journée en cours

  /* ---- L'horizon : aujourd'hui et demain, pas plus ----------------------
     La billetterie publie jusqu'à dix jours à l'avance. Affichés tels quels,
     les concerts de la semaine suivante poussaient la soirée en cours hors de
     l'écran et faisaient une liste qu'on ne lit plus — pour une information
     sans usage au volant : personne ne se place pour un match dans six jours.
     On coupe donc à la fin de la journée de DEMAIN, la journée étant celle du
     chauffeur : elle finit à 6 h du matin, pas à minuit. À 2 h, « aujourd'hui »
     est donc encore la nuit qu'on est en train de faire.                   */
  var HORIZON_J = 2;

  function horizonEnd(now) {
    var d = new Date(now || Date.now());
    if (d.getHours() < DAY_TO_H) d.setDate(d.getDate() - 1);   // encore la veille
    var f = new Date(d.getFullYear(), d.getMonth(), d.getDate(), DAY_TO_H, 0, 0, 0);
    f.setDate(f.getDate() + HORIZON_J);
    return f;
  }

  function live(items, now) {
    var t = now ? +now : Date.now();
    var fin = dayEnd(t).getTime(), hz = horizonEnd(t).getTime();
    return (items || []).filter(function (it) {
      if (endOf(it) <= t) return false;
      if (new Date(it.start).getTime() >= hz) return false;
      if (DU_JOUR[it.kind] && new Date(it.start).getTime() >= fin) return false;
      return true;
    });
  }

  function upcoming(items, fromMin, toMin) {
    return (items || []).filter(function (it) {
      var m = minutesUntil(it.start);
      var mEnd = it.end ? minutesUntil(it.end) : m;
      if (mEnd < fromMin) return false;
      return m <= toMin;
    });
  }

  /* Une fermeture de nuit tient dans une soirée, et le JOUR compte autant que
     l'heure : toutes affichent « 21h00 → 06h00 », donc sans la nuit concernée
     on ne sait pas si c'est ce soir ou mardi prochain. Une perturbation de
     chantier, elle, dure des semaines : on écrit alors la date de fin.      */
  function spanLabel(from, to) {
    var a = new Date(from), b = new Date(to);
    if (b - a <= 20 * 3600 * 1000) return hhmm(from) + ' → ' + hhmm(to);
    return 'jusqu\'au ' + b.getDate() + '/' + (b.getMonth() + 1);
  }

  /* ---- La nuit en cours --------------------------------------------------
     Une « nuit » va de 21 h à 6 h. Avant 6 h du matin on est encore dans
     celle de la veille ; à partir de 6 h, c'est celle du soir qui vient. La
     bascule se fait donc toute seule à la première ouverture après 6 h, sans
     rien attendre du serveur : c'est l'heure du téléphone qui décide.

     Conséquence voulue : la liste ne montre qu'une nuit, jamais toute la
     semaine. Et comme il n'y en a qu'une, inutile d'écrire le jour sur
     chaque ligne.                                                          */
  var NIGHT_FROM_H = 21, NIGHT_TO_H = 6;

  function currentNight(now) {
    var d = new Date(now || Date.now());
    var debut = new Date(d.getFullYear(), d.getMonth(), d.getDate(), NIGHT_FROM_H, 0, 0, 0);
    if (d.getHours() < NIGHT_TO_H) debut.setDate(debut.getDate() - 1);
    var fin = new Date(debut.getTime());
    fin.setDate(fin.getDate() + 1);
    fin.setHours(NIGHT_TO_H, 0, 0, 0);
    return { from: debut, to: fin };
  }

  /* Vrai si la fermeture concerne cette nuit-là : soit elle s'y inscrit, soit
     c'est un chantier qui la recouvre.                                     */
  function inNight(c, nuit) {
    var a = new Date(c.from).getTime(), b = new Date(c.to).getTime();
    return a < nuit.to.getTime() && b > nuit.from.getTime();
  }

  function nightTitle(nuit) {
    var j = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
    var f = nuit.to;
    return 'Nuit de ' + j[nuit.from.getDay()] + ' à ' + j[f.getDay()] +
           ', ' + NIGHT_FROM_H + 'h → ' + NIGHT_TO_H + 'h';
  }

  /* ---- Deux natures de fermeture ----------------------------------------
     Celle qui ne vaut que cette nuit — « A86 extérieur, 21h → 6h » — et
     celle qui dure : bretelle coupée 24h/24, chantier de plusieurs semaines.
     Les mélanger donnait deux faux : un bandeau « 21h00 → 06h00 » sur une
     bretelle fermée en permanence, et un écran vide le week-end, puisque la
     DiRIF ne ferme presque rien la nuit du vendredi au dimanche — ces
     soirs-là, tout ce qu'elle publie est justement du 24h/24.              */
  function isStanding(c) {
    return !!c.continu || c.kind === 'chantier';
  }

  function nightClosures(list, nuit) {
    return (list || []).filter(function (c) {
      return !isStanding(c) && inNight(c, nuit);
    }).sort(function (a, b) { return new Date(a.from) - new Date(b.from); });
  }

  /* Les fermetures permanentes ne sont plus affichées nulle part — décision
     du terrain : une bretelle coupée 24h/24, un chantier déjà en place, Waze
     et Google Maps les connaissent et dévient tout seuls. Ce qu'un GPS ne
     sait pas dire, c'est qu'à 21 h CE SOIR l'A86 ferme : c'est cela, et cela
     seulement, que l'app annonce.

     La fonction reste, et renvoie une liste vide, pour deux raisons : les
     écrans déjà publiés dans GoodBarber l'appellent, et le jour où l'on
     changerait d'avis, le filtre tient en six lignes. isStanding, lui, sert
     toujours : c'est lui qui écarte ces fermetures de la nuit en cours.
     Conséquence assumée : le week-end, la DiRIF ne publiant presque que du
     24h/24, le brief n'a plus de carte rouge et Trafic affiche « rien de
     fermé cette nuit ». C'est la vérité du terrain, pas un écran cassé.   */
  function standingClosures() {
    return [];
  }

  /* L'étiquette rouge. Une fermeture permanente n'a pas de date de fin —
     Sytadin n'en publie aucune — et en inventer une serait pire que de le
     dire : on écrit « en continu ».                                        */
  function closureBadge(c) {
    if (c.continu) return 'en continu';
    return spanLabel(c.from, c.to);
  }

  /* ---- Les familles de « Manger » ---------------------------------------
     Un chauffeur qui cherche à manger à deux heures du matin ne cherche pas
     « un restaurant » : il cherche du sûr (une chaîne — il sait ce qu'il
     trouve, il y a un parking et souvent des toilettes), du rapide (grec,
     kebab, tacos, sandwich), ou de quoi tenir jusqu'au matin (supérette,
     station). Ces quatre-là font des pastilles ; le reste — burger
     indépendant, poulet, asiatique — reste sous « Tout », parce qu'une
     pastille qui ne ramène rien est une déception de plus au volant.

     La catégorie est écrite dans la donnée (champ « t »), jamais devinée
     ici : elle vient des étiquettes d'OpenStreetMap, ou de la colonne « type »
     des fiches saisies à la main.                                          */
  var MANGER = [
    { code: 'all',      label: 'Tout' },
    { code: 'chaine',   label: 'Chaînes' },
    { code: 'sandwich', label: 'Grec · Sandwich' },
    { code: 'pizza',    label: 'Pizza' },
    { code: 'super',    label: 'Supérette' },
    { code: 'station',  label: 'Station' }
  ];

  function inManger(it, code) {
    if (!code || code === 'all') return true;
    return (it.t || 'autre') === code;
  }

  /* ---- Chercher un lieu par son nom ou sa ville -------------------------
     « Je veux un McDo » n'est pas la même question que « qu'est-ce qu'il y a
     autour de moi ». La recherche porte donc sur TOUTE la base, les 1 655
     adresses, et le tri par distance fait le reste : le premier résultat est
     le plus proche, même s'il est à douze kilomètres.

     Personne n'écrit « McDonald's » au volant. On tape « mac do », parfois
     « macdo », et la recherche doit trouver. D'où deux choses : on écrase les
     accents, les majuscules et les espaces avant de comparer, et une petite
     table de raccourcis traduit ce qu'on dit en ce qui est écrit dans la base.
     Elle est courte exprès — elle couvre ce qu'un chauffeur tape vraiment, et
     chaque ligne a été vérifiée contre les noms réels des fiches.          */
  var ALIAS = {
    macdo: 'mcdonald', macdos: 'mcdonald', macdonald: 'mcdonald',
    macdonalds: 'mcdonald', mcdo: 'mcdonald', mcdonalds: 'mcdonald',
    bk: 'burger king', burgerking: 'burger king',
    dominos: 'domino', otacos: "o'tacos", starbuck: 'starbucks',
    /* Un mot qui commence par @ ne cherche pas un nom : il choisit une
       famille. « grec » ne figure dans presque aucune enseigne, mais c'est
       le mot qu'on emploie — il doit ramener les 130 sandwicheries.      */
    grec: '@sandwich', grecs: '@sandwich', kebab: '@sandwich',
    kebabs: '@sandwich', tacos: '@sandwich', sandwich: '@sandwich',
    sandwicherie: '@sandwich', turc: '@sandwich', libanais: '@sandwich',
    pizza: '@pizza', pizzas: '@pizza', pizzeria: '@pizza',
    superette: '@super', supermarche: '@super', supermarches: '@super',
    epicerie: '@super', courses: '@super', alimentation: '@super',
    station: '@station', stations: '@station', essence: '@station',
    carburant: '@station', pompe: '@station',
    chaine: '@chaine', chaines: '@chaine', fastfood: '@chaine'
  };

  function sansAccent(s) {
    s = String(s || '').toLowerCase();
    /* normalize() manque sur de très vieux navigateurs : on retombe alors sur
       une comparaison sans accents, ce qui dégrade la recherche sans la
       casser. Mieux vaut « Vélizy » introuvable en tapant « velizy » qu'un
       écran blanc.                                                         */
    if (s.normalize) s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return s.replace(/['’`.\-]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function chercheManger(list, q) {
    var t = sansAccent(q);
    if (!t) return list;

    /* « mac do » en deux mots, « macdo » en un : on essaie d'abord la forme
       recollée, sinon mot à mot.                                          */
    var mots = ALIAS[t.replace(/ /g, '')]
      ? [ALIAS[t.replace(/ /g, '')]]
      : t.split(' ').map(function (m) { return ALIAS[m] || m; });

    var famille = null, termes = [];
    mots.forEach(function (m) {
      if (m.charAt(0) === '@') famille = m.slice(1);
      else if (m) termes.push(sansAccent(m));
    });

    return (list || []).filter(function (it) {
      if (famille && (it.t || 'autre') !== famille) return false;
      if (!termes.length) return true;
      var foin = sansAccent((it.name || '') + ' ' + (it.address || ''));
      for (var i = 0; i < termes.length; i++) {
        if (foin.indexOf(termes[i]) === -1) return false;
      }
      return true;
    });
  }

  /* ---- Aller d'un onglet à l'autre --------------------------------------
     GoodBarber donne un lien interne par section ; la prévisualisation, elle,
     vit dans une iframe et prévient sa coquille. Un seul endroit à toucher
     si l'un des deux change.                                                */
  function go(url) {
    if (!url) return false;
    if (window.parent && window.parent !== window) {
      try {
        window.parent.postMessage({ vtc: 'goto', url: url }, '*');
        return true;
      } catch (e) {}
    }
    window.location.href = url;
    return true;
  }

  /* ---- La météo, en un coup d'œil ---------------------------------------
     Il pleut, tout le monde commande. Une icône et une température en haut à
     droite du brief : ça se lit sans lire. Cinq états seulement — au-delà,
     une icône de vingt pixels ne veut plus rien dire. La nuit, le soleil
     devient une lune : un grand soleil à deux heures du matin, ça décrédibilise
     tout l'écran.                                                         */
  var METEO_ICO = {
    soleil: '☀️', soleil_nuageux: '⛅', nuageux: '☁️',
    pluie: '🌧️', neige: '🌨️'
  };
  var METEO_NUIT = { soleil: '🌙', soleil_nuageux: '🌙' };

  function heureCle(d) {
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
           'T' + p(d.getHours()) + ':00';
  }

  /* Huit points, un par département : avec une position on prend le plus
     proche, sinon Paris — qui est toujours le premier de la liste. C'est la
     seule différence entre le brief régional et le brief perso côté météo, et
     elle compte : il peut pleuvoir à Melun pendant qu'il fait beau à Cergy.

     Pas de repli sur l'heure la plus proche : si le fichier ne contient pas
     l'heure qu'il est, c'est qu'il date de plus d'un jour et demi. Afficher
     la météo d'hier serait pire que de n'afficher aucune icône.           */
  function meteoNow(meteo, pos, now) {
    if (!meteo || !meteo.heures || !meteo.points || !meteo.points.length) return null;
    var i = -1, cle = heureCle(new Date(now || Date.now()));
    for (var k = 0; k < meteo.heures.length; k++) {
      if (meteo.heures[k] === cle) { i = k; break; }
    }
    if (i < 0) return null;

    var p = meteo.points[0];                       // Paris par défaut
    if (pos) {
      var mieux = Infinity;
      meteo.points.forEach(function (q) {
        var d = distKm(pos.lat, pos.lon, q.lat, q.lon);
        if (d < mieux) { mieux = d; p = q; }
      });
    }
    if (!p.ciel || i >= p.ciel.length) return null;
    return { ciel: p.ciel[i], deg: p.deg[i], nuit: p.nuit[i], dept: p.dept };
  }

  function meteoHtml(m) {
    if (!m) return '';
    var ico = (m.nuit && METEO_NUIT[m.ciel]) || METEO_ICO[m.ciel];
    if (!ico) return '';
    return '<div class="meteo" aria-label="météo">' +
             '<span class="meteo__ico">' + ico + '</span>' +
             '<span class="meteo__deg">' + esc(m.deg) + '°</span>' +
           '</div>';
  }

  /* ---- Manger la nuit ----------------------------------------------------
     Chaque fiche OpenStreetMap porte son ouverture et sa fermeture pour les
     sept jours, en minutes depuis minuit — au-delà de 1440, c'est après
     minuit. On lit le jour où la NUIT a commencé, pas le jour courant : à
     trois heures du matin, le McDonald's qui ferme à 4 h relevait d'hier.  */
  function mangerEtat(it, now) {
    if (!it || !it.f || !it.o) return null;        // fiche saisie à la main
    var t = new Date(now || Date.now());
    var nuit = currentNight(t);
    var base = new Date(nuit.from.getFullYear(), nuit.from.getMonth(),
                        nuit.from.getDate());
    var idx = (base.getDay() + 6) % 7;             // lundi = 0, comme OSM
    var f = it.f[idx], o = it.o[idx];
    if (f === null || f === undefined) return null;      // fermé ce jour-là
    var debut = new Date(base.getTime() + o * 60000);
    var fin = new Date(base.getTime() + f * 60000);
    if (fin <= t) return null;                     // déjà fermé
    return { ouvert: t >= debut, debut: debut, fin: fin, h24: !!it.h24 };
  }

  /* ---- Mes échéances ------------------------------------------------------
     Carte VTC, visite médicale, formation continue : des dates qu'on oublie et
     qui arrêtent l'activité le jour où elles tombent. Tout reste dans le
     téléphone — rien n'est envoyé, rien n'est partagé : ce sont des papiers
     personnels, pas des données d'application.                              */
  var ECH_KEY = 'vtc_echeances';
  /* `rappel` : combien de jours avant on commence à prévenir. La carte VTC a
     le sien, bien plus long — le renouvellement prend environ deux mois en
     préfecture, alors prévenir un mois avant, c'est prévenir trop tard.    */
  var ECHEANCES = [
    { code: 'carte',     label: 'Carte VTC',          duree: '5 ans', rappel: 90 },
    { code: 'medical',   label: 'Visite médicale',     duree: '5 ans, 2 ans après 60 ans', rappel: 30 },
    { code: 'formation', label: 'Formation continue', duree: '5 ans', rappel: 30 },
    { code: 'assurance', label: 'Assurance',          duree: '1 an',  rappel: 30 },
    { code: 'technique', label: 'Contrôle technique',  duree: '1 an',  rappel: 30 }
  ];

  function echeancesLues() {
    try { return JSON.parse(localStorage.getItem(ECH_KEY) || '{}') || {}; }
    catch (e) { return {}; }
  }

  function setEcheance(code, date) {
    var tout = echeancesLues();
    if (date) tout[code] = date; else delete tout[code];
    try { localStorage.setItem(ECH_KEY, JSON.stringify(tout)); } catch (e) {}
  }

  /* Jours restants, en jours pleins : une échéance à 23 h ce soir, c'est
     « aujourd'hui », pas « dans 0,4 jour ».                                */
  function joursAvant(date, now) {
    var d = new Date(date + 'T00:00:00');
    if (isNaN(d.getTime())) return null;
    var t = new Date(now || Date.now());
    t = new Date(t.getFullYear(), t.getMonth(), t.getDate());
    return Math.round((d.getTime() - t.getTime()) / 86400000);
  }

  function echeances(now) {
    var tout = echeancesLues();
    return ECHEANCES.map(function (e) {
      var date = tout[e.code] || '';
      return {
        code: e.code, label: e.label, duree: e.duree, rappel: e.rappel,
        date: date, jours: date ? joursAvant(date, now) : null
      };
    });
  }

  /* La plus urgente, si elle mérite d'apparaître dans le brief. Chacune a son
     propre délai : trois mois pour la carte VTC, un mois pour les autres. */
  function echeanceUrgente(now) {
    var pire = null;
    echeances(now).forEach(function (e) {
      if (e.jours === null || e.jours > (e.rappel || 30)) return;
      if (!pire || e.jours < pire.jours) pire = e;
    });
    return pire;
  }

  /* Rayon du brief « autour de moi ». Dix kilomètres, c'est le quart d'heure
     de route qu'on accepte de faire pour se repositionner.                  */
  var NEAR_KM = 10;

  /* Les codes de locate() sont techniques : on les traduit une seule fois,
     ici, pour que chaque onglet dise la même chose.                        */
  var GEO_MSG = {
    denied: 'Tu as refusé la position. Autorise-la dans les réglages de ton ' +
            'téléphone pour avoir le brief autour de toi.',
    unavailable: 'Position introuvable pour le moment — ça arrive en ' +
                 'souterrain ou en parking.',
    unsupported: 'Ce téléphone ne donne pas la position à l\'application.'
  };

  function geoMessage(err) {
    return GEO_MSG[err] || 'Position indisponible.';
  }

  /* ---- Ouvrir les réglages du téléphone ---------------------------------
     Il n'existe AUCUN moyen standard de le faire depuis une page web. iOS
     bloque les schémas « prefs: » dans une WebView — et Apple refuse les apps
     qui les utilisent ; Android accepte « intent:// » dans Chrome, mais pas
     dans une WebView sauf si l'application hôte le gère.

     La fonction ci-dessous renvoie donc `false` : elle ne sait pas faire, et
     l'interface affiche la marche à suivre à la place. Si le support
     GoodBarber confirme un jour une méthode de son App API pour ça, c'est
     l'unique endroit à modifier — renvoyer `true` après l'avoir appelée.   */
  function openAppSettings() {
    return false;
  }

  function isIOS() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
           (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }

  /* Le chemin exact, par système : c'est ce qui remplace le bouton qu'on ne
     peut pas faire. Mieux vaut quatre mots justes qu'un bouton qui échoue.
     On ne l'affiche que si c'est bien une autorisation qui manque — « position
     introuvable » dans un parking souterrain n'a rien à voir avec les
     réglages, et y envoyer le chauffeur le ferait chercher pour rien.      */
  function settingsHint(err) {
    if (err && err !== 'denied' && err !== 'unsupported') {
      return 'Ressaie dans un instant, ou sors du parking : le ciel dégagé ' +
             'suffit en général.';
    }
    if (isIOS()) {
      return 'Réglages → Confidentialité et sécurité → Service de ' +
             'localisation → cette app → « Lorsque l\'app est active ».';
    }
    if (/Android/.test(navigator.userAgent)) {
      return 'Réglages → Applications → cette app → Autorisations → ' +
             'Position → « Autoriser uniquement si l\'app est utilisée ».';
    }
    return 'Autorise la localisation pour cette application dans les ' +
           'réglages de ton appareil.';
  }

  /* Ne garde que ce qui est à portée. Un élément sans coordonnées est écarté
     plutôt que supposé proche : mieux vaut en montrer moins que faire rouler
     quelqu'un pour rien. L'appelant indique combien ont été écartés.        */
  function near(items, pos, km) {
    if (!pos) return { list: items || [], dropped: 0 };
    var r = km || NEAR_KM, kept = [], dropped = 0;
    (items || []).forEach(function (it) {
      if (it.lat == null || it.lon == null) { dropped++; return; }
      if (distKm(pos.lat, pos.lon, it.lat, it.lon) <= r) kept.push(it);
    });
    return { list: kept, dropped: dropped };
  }

  /* ---- Dans quel département suis-je ? ----------------------------------
     On compare la position au centre des communes franciliennes, chargées
     depuis zones.json. Tout se fait dans le téléphone : la position ne part
     nulle part, contrairement à ce que ferait un géocodage inverse.

     Une exception utile : si un lieu connu de l'application est à moins de
     trois kilomètres, c'est SON département qui gagne. Les terminaux d'Orly
     sont administrativement dans l'Essonne, mais un chauffeur posté là veut
     la pastille sous laquelle sont rangés les vols d'Orly.                 */
  var DEPT_ITEM_KM = 3;

  function deptAt(pos, zones, items) {
    if (!pos) return null;
    var near = null, nd = DEPT_ITEM_KM;
    (items || []).forEach(function (it) {
      if (it.lat == null || it.lon == null || !it.dept) return;
      var d = distKm(pos.lat, pos.lon, it.lat, it.lon);
      if (d < nd) { nd = d; near = it.dept; }
    });
    if (near) return near;

    var best = null, bd = Infinity;
    (zones || []).forEach(function (z) {
      var dlat = z[0] - pos.lat, dlon = (z[1] - pos.lon) * 0.66;
      var d = dlat * dlat + dlon * dlon;      // comparaison seule : pas de racine
      if (d < bd) { bd = d; best = z[2]; }
    });
    return best;
  }

  function activeClosures(closures, horizonMin) {
    var now = Date.now();
    return (closures || []).filter(function (c) {
      var from = new Date(c.from).getTime();
      var to   = new Date(c.to).getTime();
      if (to < now) return false;
      return from <= now + (horizonMin || 180) * 60000;
    });
  }

  /* ---- Fraîcheur des données -------------------------------------------- */

  function freshness(generatedAt, cached) {
    if (!generatedAt) return { stale: true, text: 'données indisponibles' };
    var ageMin = Math.round((Date.now() - new Date(generatedAt).getTime()) / 60000);
    if (cached)       return { stale: true,  text: 'hors ligne · ' + hhmm(generatedAt) };
    if (ageMin > 180) return { stale: true,  text: 'mis à jour à ' + hhmm(generatedAt) };
    return { stale: false, text: 'à jour · ' + hhmm(generatedAt) };
  }

  /* ---- Filtres ----------------------------------------------------------- */

  /* Change la pastille active sans re-créer les boutons : rappeler
     renderChips ajouterait un deuxième écouteur de clic, et chaque clic
     déclencherait deux rendus.                                             */
  function setActiveChip(host, code) {
    Array.prototype.forEach.call(host.querySelectorAll('.chip'), function (c) {
      c.setAttribute('aria-pressed',
        c.getAttribute('data-code') === code ? 'true' : 'false');
    });
  }

  function renderChips(host, list, active, onPick) {
    host.innerHTML = list.map(function (o) {
      return '<button class="chip" type="button" aria-pressed="' +
             (o.code === active ? 'true' : 'false') + '" data-code="' + esc(o.code) + '">' +
             esc(o.label) + '</button>';
    }).join('');
    host.addEventListener('click', function (e) {
      var b = e.target.closest('.chip');
      if (!b) return;
      Array.prototype.forEach.call(host.querySelectorAll('.chip'), function (c) {
        c.setAttribute('aria-pressed', c === b ? 'true' : 'false');
      });
      onPick(b.getAttribute('data-code'));
    });
  }

  return {
    BASE: BASE, DEPTS: DEPTS, KINDS: KINDS,
    period: period, periodEnd: periodEnd, load: load,
    hhmm: hhmm, minutesUntil: minutesUntil, countdown: countdown, dayLabel: dayLabel,
    distKm: distKm, fmtDist: fmtDist, locate: locate,
    wazeUrl: wazeUrl, gmapsUrl: gmapsUrl, navButtons: navButtons,
    esc: esc, demandTag: demandTag, deptTag: deptTag,
    FILTERS: FILTERS, inFilter: inFilter,
    slotLabel: slotLabel, subLine: subLine,
    score: score, upcoming: upcoming, activeClosures: activeClosures,
    live: live, endOf: endOf, dayEnd: dayEnd, horizonEnd: horizonEnd, go: go,
    navUrl: navUrl, navPref: navPref, setNavPref: setNavPref, NAVS: NAVS,
    geoKnown: geoKnown,
    timeCell: timeCell, isSortie: isSortie, ico: ico,
    meteoNow: meteoNow, meteoHtml: meteoHtml,
    mangerEtat: mangerEtat, MANGER: MANGER, inManger: inManger,
    chercheManger: chercheManger, sansAccent: sansAccent,
    ECHEANCES: ECHEANCES, echeances: echeances,
    setEcheance: setEcheance, echeanceUrgente: echeanceUrgente,
    joursAvant: joursAvant,
    spanLabel: spanLabel, near: near, NEAR_KM: NEAR_KM, geoMessage: geoMessage,
    currentNight: currentNight, inNight: inNight, nightTitle: nightTitle,
    nightClosures: nightClosures, standingClosures: standingClosures,
    closureBadge: closureBadge,
    onReopen: onReopen, openAppSettings: openAppSettings, settingsHint: settingsHint,
    deptAt: deptAt,
    freshness: freshness, renderChips: renderChips, setActiveChip: setActiveChip
  };
})();
