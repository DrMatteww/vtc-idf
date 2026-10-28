import { useEffect, useMemo, useState } from 'react';
import {
  FlatList, RefreshControl, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { fermeturesDeLaNuit } from '@/core/fermetures';
import { formatDistance, parDistance } from '@/core/geo';
import { estToiletteDeParc, etatHoraire, ouvert24 } from '@/core/horaires';
import {
  type CodeSection, SOUS_SECTIONS, combienAfficher, dansManger, dansService,
  dansWc, pastillesDe,
} from '@/core/lieux';
import { chercher } from '@/core/recherche';
import { dansLaNuit, hhmm, maintenant, nuitEnCours, titreNuit } from '@/core/temps';
import type { Astuce, Closure, Manger, Service, Toilette } from '@/core/types';
import { useDonnees } from '@/donnees/store';
import { usePosition } from '@/reglages/position';
import { usePrefs } from '@/reglages/preferences';
import { BarreTitre } from '@/ui/barre-titre';
import { BoutonGps } from '@/ui/bouton-gps';
import { Departement, Etiquette } from '@/ui/etiquettes';
import { Etoile } from '@/ui/etoile';
import { Pastilles } from '@/ui/pastilles';
import { SousNav } from '@/ui/sous-nav';
import { couleurs, espaces, polices, rayons, tabulaire, typo } from '@/ui/theme';

type AvecDist = { km?: number };

export default function SurLaRoute() {
  const {
    lieux, lieuxEnCours, assurerLieux, brief, briefEnCours, rafraichirBrief,
  } = useDonnees();
  const { pos, etat: etatGeo, demander } = usePosition();
  const favoris = usePrefs((e) => e.favoris);
  const vehicule = usePrefs((e) => e.vehicule);

  const [section, setSection] = useState<CodeSection>('wc');
  /* Une pastille par sous-section, mémorisée le temps de la session
     seulement : les trois listes ont la leur, parce que « Favoris » existe
     partout mais que « Ouvert 24h » ne veut rien dire pour une astuce.

     Et ce choix ne survit PAS à la fermeture : on a faim de choses
     différentes selon les soirs, et retrouver « Pizza » coché trois jours
     plus tard n'aide personne. */
  const [filtres, setFiltres] = useState<Record<string, string>>({});
  const [quoi, setQuoi] = useState('');

  const [h, setH] = useState(() => maintenant());
  useEffect(() => {
    const t = setInterval(() => setH(maintenant()), 60_000);
    return () => clearInterval(t);
  }, []);

  /* On ne demande la position qu'une fois : une autorisation refusée ne doit
     pas redemander à chaque sous-section. */
  useEffect(() => {
    demander();
  }, [demander]);

  /* Les 860 Ko n'arrivent QUE maintenant — le chauffeur qui ne lit que son
     brief ne les paie jamais. */
  useEffect(() => {
    if (section === 'trafic') rafraichirBrief();
    else assurerLieux();
  }, [section, assurerLieux, rafraichirBrief]);

  const vue = filtres[section] ?? 'all';
  const enFavoris = vue === 'fav';
  const estFavori = useMemo(
    () => (id: string) => favoris.includes(String(id)),
    [favoris],
  );

  function choisirSection(c: CodeSection) {
    setSection(c);
    setQuoi(''); // on ne traîne pas sa recherche d'un onglet à l'autre
  }

  const { items, parcsMasques, fermes } = useMemo(
    () => calculer({ section, vue, quoi, lieux, brief, h, pos, estFavori, vehicule, enFavoris }),
    [section, vue, quoi, lieux, brief, h, pos, estFavori, vehicule, enFavoris],
  );

  const pastilles = pastillesDe(section);
  const chargement = section === 'trafic' ? briefEnCours : lieuxEnCours;
  const aDesDonnees = section === 'trafic' ? !!brief : !!lieux;

  return (
    <SafeAreaView style={s.fond} edges={['top']}>
      <BarreTitre />
      <View style={s.entete}>
        <Text style={s.titre}>Sur la route</Text>
      </View>

      <View style={s.sousnav}>
        <SousNav liste={SOUS_SECTIONS} actif={section} onChoisir={choisirSection} />
      </View>

      {pastilles ? (
        <View style={s.filtres}>
          <Pastilles
            liste={pastilles}
            actif={vue}
            onChoisir={(c) => setFiltres({ ...filtres, [section]: c })}
          />
        </View>
      ) : null}

      {section === 'manger' ? (
        <View style={s.rechercheZone}>
          <TextInput
            style={s.recherche}
            value={quoi}
            onChangeText={setQuoi}
            placeholder="Chercher : mac do, grec, Montreuil…"
            placeholderTextColor={couleurs.texteMuet}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
        </View>
      ) : null}

      <FlatList
        data={items}
        keyExtractor={(it: { id: string }) => it.id}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={s.liste}
        refreshControl={
          <RefreshControl
            refreshing={chargement}
            onRefresh={() => {
              if (section === 'trafic') rafraichirBrief();
              else assurerLieux();
              demander(true);
            }}
            tintColor={couleurs.texteAtenue}
            colors={[couleurs.accent]}
            progressBackgroundColor={couleurs.surface}
          />
        }
        ListHeaderComponent={
          <Entete
            section={section}
            pos={!!pos}
            etatGeo={etatGeo}
            parcsMasques={parcsMasques}
            fermes={fermes}
            quoi={quoi}
            h={h}
            aDesItems={items.length > 0}
          />
        }
        renderItem={({ item }) => (
          <Ligne section={section} item={item} h={h} />
        )}
        ListEmptyComponent={
          <Vide
            section={section}
            chargement={chargement}
            aDesDonnees={aDesDonnees}
            enFavoris={enFavoris}
            quoi={quoi}
            vue={vue}
          />
        }
      />
    </SafeAreaView>
  );
}

/* ======================================================================
   Le calcul. Tout est ici, séparé du rendu, pour que les règles restent
   lisibles d'un bloc.
   ====================================================================== */
function calculer(o: {
  section: CodeSection;
  vue: string;
  quoi: string;
  lieux: ReturnType<typeof useDonnees.getState>['lieux'];
  brief: ReturnType<typeof useDonnees.getState>['brief'];
  h: ReturnType<typeof maintenant>;
  pos: { lat: number; lon: number } | null;
  estFavori: (id: string) => boolean;
  vehicule: 'carburant' | 'electrique';
  enFavoris: boolean;
}): { items: any[]; parcsMasques: number; fermes: boolean } {
  const { section, vue, quoi, lieux, brief, h, pos, estFavori, vehicule, enFavoris } = o;

  if (section === 'trafic') {
    if (!brief) return { items: [], parcsMasques: 0, fermes: false };
    return {
      items: fermeturesDeLaNuit(brief.closures, nuitEnCours(h)),
      parcsMasques: 0,
      fermes: false,
    };
  }

  if (!lieux) return { items: [], parcsMasques: 0, fermes: false };

  if (section === 'astuces') {
    let l: Astuce[] = lieux.astuces ?? [];
    if (enFavoris) l = l.filter((a) => estFavori(a.id));
    /* Une astuce n'a pas forcément de lieu : celles qui en ont un se classent
       par distance, les autres se lisent, c'est tout. */
    const avec = parDistance(l.filter((a) => a.lat != null), pos);
    const sans = l.filter((a) => a.lat == null);
    return { items: [...avec, ...sans], parcsMasques: 0, fermes: false };
  }

  if (section === 'wc') {
    let l: Toilette[] = lieux.toilettes ?? [];
    let parcsMasques = 0;
    /* Les sanisettes « Horaires du parc » sont DANS les parcs de la Ville,
       fermés la nuit : les afficher à trois heures du matin, c'est envoyer un
       chauffeur contre une grille. */
    if (dansLaNuit(h)) {
      const avant = l.length;
      l = l.filter((t) => !estToiletteDeParc(t));
      parcsMasques = avant - l.length;
    }
    l = l.filter((t) => dansWc(t, vue, estFavori));
    const n = combienAfficher({ enFavoris, recherche: false, aUnePosition: !!pos });
    return { items: parDistance(l, pos).slice(0, n), parcsMasques, fermes: false };
  }

  if (section === 'services') {
    /* Une station dont l'automate tourne la nuit reste ouverte, même si sa
       boutique a fermé à 20 h. Pour le reste — lavage, pharmacie — c'est la
       règle habituelle : ce qui est fermé ne s'affiche pas. */
    const l = (lieux.services ?? []).filter(
      (x: Service) =>
        (ouvert24(x) || !x.f?.length || etatHoraire(x, h)) &&
        dansService(x, vue, estFavori, vehicule),
    );
    const n = combienAfficher({ enFavoris, recherche: false, aUnePosition: !!pos });
    return { items: parDistance(l, pos).slice(0, n), parcsMasques: 0, fermes: false };
  }

  // section === 'manger'
  const base: Manger[] = lieux.manger ?? [];
  /* Quand on cherche, on cherche PARTOUT : la recherche l'emporte sur la
     pastille. Taper « mac do » en ayant « Pizza » coché ne doit pas donner
     une liste vide pour une raison invisible à l'écran. */
  const tout = quoi
    ? chercher(base, quoi)
    : base.filter((m) => dansManger(m, vue, estFavori));

  /* Les favoris échappent au filtre « encore ouvert » : c'est une liste qu'on
     a constituée soi-même, on veut la voir en entier. Partout ailleurs, on ne
     montre que ce qui est ouvert — sinon l'onglet ne sert plus à rien à deux
     heures du matin. */
  let l = enFavoris && !quoi ? tout : tout.filter((m) => !m.f?.length || etatHoraire(m, h));

  /* Chercher « mac do » à cinq heures du matin et tomber sur un écran vide
     est pire que la vérité : on montre alors les mêmes adresses, fermées, en
     le disant. */
  let fermes = false;
  if (!l.length && quoi && tout.length) {
    l = tout;
    fermes = true;
  }

  const n = combienAfficher({ enFavoris, recherche: !!quoi, aUnePosition: !!pos });
  return { items: parDistance(l, pos).slice(0, n), parcsMasques: 0, fermes };
}

/* ---- L'en-tête explicatif --------------------------------------------- */
function Entete({
  section, pos, etatGeo, parcsMasques, fermes, quoi, h, aDesItems,
}: {
  section: CodeSection;
  pos: boolean;
  etatGeo: string;
  parcsMasques: number;
  fermes: boolean;
  quoi: string;
  h: ReturnType<typeof maintenant>;
  aDesItems: boolean;
}) {
  const lignes: string[] = [];

  /* La position est facultative : si elle manque, on le dit, et la liste
     fonctionne quand même. */
  if (!pos) {
    lignes.push(
      etatGeo === 'refuse'
        ? 'Position refusée : la liste n’est pas triée par distance.'
        : 'Position indisponible : liste non triée par distance.',
    );
  }

  if (section === 'trafic' && aDesItems) lignes.push(titreNuit(nuitEnCours(h)));

  if (fermes) {
    lignes.push(
      'Rien d’ouvert pour « ' + quoi + ' » à cette heure-ci. Voici les plus proches, fermées.',
    );
  }

  if (section === 'wc' && parcsMasques > 0) {
    lignes.push(
      parcsMasques +
        ' toilettes de parc sont masquées à cette heure-ci : elles sont à l’intérieur des parcs, fermés la nuit.',
    );
  }

  if (section === 'services' && aDesItems) {
    lignes.push(
      '« Pompes 24h/24 » veut dire que l’automate fonctionne : on fait le plein même boutique fermée.',
    );
  }

  if (!lignes.length) return null;
  return (
    <View style={s.notes}>
      {lignes.map((t) => (
        <Text key={t} style={s.note}>{t}</Text>
      ))}
    </View>
  );
}

/* ---- Une ligne --------------------------------------------------------- */
function Ligne({
  section, item, h,
}: {
  section: CodeSection;
  item: any;
  h: ReturnType<typeof maintenant>;
}) {
  if (section === 'trafic') {
    const c = item as Closure;
    return (
      <View style={s.ligne}>
        <View style={s.corps}>
          <View style={s.titreLigne}>
            <Text style={s.nom} numberOfLines={2}>{c.title}</Text>
            <Etiquette texte={hhmm(nuitEnCours(h).debut) + ' → ' + hhmm(nuitEnCours(h).fin)} ton="alerte" />
          </View>
          {c.detail ? <Text style={s.sous} numberOfLines={2}>{c.detail}</Text> : null}
        </View>
      </View>
    );
  }

  if (section === 'astuces') {
    const a = item as Astuce & AvecDist;
    return (
      <View style={s.ligne}>
        <View style={s.corps}>
          <View style={s.titreLigne}>
            <Text style={s.nom} numberOfLines={1}>{a.name}</Text>
            {a.dept ? <Departement dept={a.dept} /> : null}
          </View>
          {a.texte ? <Text style={s.sous}>{a.texte}</Text> : null}
        </View>
        <Droite item={a} avecGps={a.lat != null} />
      </View>
    );
  }

  const tags: { texte: string; ton?: 'ok' | 'alerte' }[] = [];

  if (section === 'wc') {
    const t = item as Toilette;
    if (t.h24) tags.push({ texte: '24/24h', ton: 'ok' });
    else tags.push({ texte: t.open_label || 'horaires inconnus' });
    if (t.pmr) tags.push({ texte: 'PMR' });
    if (t.bebe) tags.push({ texte: 'Bébé' });
  } else if (section === 'services') {
    const v = item as Service;
    const e = etatHoraire(v, h);
    if (v.t !== 'station') tags.push({ texte: v.t === 'lavage' ? 'Lavage' : 'Pharmacie' });
    else {
      if ((v.energie ?? []).includes('carburant')) tags.push({ texte: 'Carburant' });
      if ((v.energie ?? []).includes('electrique')) tags.push({ texte: '⚡ Électrique', ton: 'ok' });
    }
    if (v.pompes24) tags.push({ texte: 'Pompes 24h/24', ton: 'ok' });
    else if (v.h24) tags.push({ texte: '24h/24', ton: 'ok' });
    else if (e) tags.push(e.ouvert
      ? { texte: 'jusqu’à ' + hhmm(e.fin), ton: 'ok' }
      : { texte: 'ouvre à ' + hhmm(e.debut) });
    else if (v.hours) tags.push({ texte: v.hours });
    if (v.boutique) tags.push({ texte: 'Boutique' });
    if (v.wc) tags.push({ texte: 'Toilettes', ton: 'ok' });
    if (v.autoroute) tags.push({ texte: 'Autoroute' });
  } else {
    const m = item as Manger;
    const e = etatHoraire(m, h);
    /* L'heure de fermeture de CETTE nuit, et rien d'autre — c'est la seule
       chose qu'on veut savoir à deux heures du matin. */
    if (e) {
      if (e.h24) tags.push({ texte: '24h/24', ton: 'ok' });
      else if (e.ouvert) tags.push({ texte: 'jusqu’à ' + hhmm(e.fin), ton: 'ok' });
      else tags.push({ texte: 'ouvre à ' + hhmm(e.debut) });
    } else if (m.hours) tags.push({ texte: m.hours });
    else if (m.f?.length) tags.push({ texte: 'fermé maintenant' });
    if (m.drive) tags.push({ texte: 'Drive' });
    if (m.parking) tags.push({ texte: 'Parking', ton: 'ok' });
    if (m.wc) tags.push({ texte: 'Toilettes', ton: 'ok' });
    if (m.price) tags.push({ texte: m.price });
  }

  const lieu = item as (Toilette | Manger | Service) & AvecDist;
  return (
    <View style={s.ligne}>
      <View style={s.corps}>
        <Text style={s.nom} numberOfLines={1}>{lieu.name}</Text>
        <Text style={s.adresse} numberOfLines={1}>{lieu.address}</Text>
        <View style={s.tags}>
          {tags.map((t) => (
            <Etiquette key={t.texte} texte={t.texte} ton={t.ton} />
          ))}
        </View>
      </View>
      <Droite item={lieu} avecGps />
    </View>
  );
}

function Droite({ item, avecGps }: { item: any & AvecDist; avecGps: boolean }) {
  return (
    <View style={s.droite}>
      {item.km !== undefined ? (
        <Text style={s.dist}>{formatDistance(item.km)}</Text>
      ) : null}
      <View style={s.actions}>
        <Etoile id={item.id} />
        {avecGps ? <BoutonGps lat={item.lat} lon={item.lon} /> : null}
      </View>
    </View>
  );
}

/* ---- Les états vides parlent ------------------------------------------- */
function Vide({
  section, chargement, aDesDonnees, enFavoris, quoi, vue,
}: {
  section: CodeSection;
  chargement: boolean;
  aDesDonnees: boolean;
  enFavoris: boolean;
  quoi: string;
  vue: string;
}) {
  let titre = 'Rien à afficher ici';
  let texte = 'Cette liste se remplit au fil des relevés terrain.';

  if (chargement && !aDesDonnees) {
    titre = 'Chargement…';
    texte = 'Les lieux pèsent 860 Ko : ils n’arrivent qu’en ouvrant cet onglet.';
  } else if (!aDesDonnees) {
    titre = 'Pas de connexion';
    texte = 'Ces données arrivent dès que le réseau revient.';
  } else if (section === 'trafic') {
    titre = 'Rien de fermé cette nuit';
    texte = 'Le réseau est libre, ton GPS suffit.';
  } else if (enFavoris) {
    titre = 'Pas encore de favori';
    texte = 'Touche l’étoile sur une ligne pour garder une adresse ici. Elle reste sur ton téléphone.';
  } else if (section === 'manger' && quoi) {
    titre = 'Rien trouvé pour « ' + quoi + ' »';
    texte = 'Essaie le nom de l’enseigne (mac do, kfc), le genre (grec, pizza, station) ou une commune.';
  } else if (section === 'manger' && vue !== 'all') {
    titre = 'Rien d’ouvert dans cette famille';
    texte = 'À cette heure-ci, essaie Tout — ou Grec · Sandwich, qui ferme tard.';
  } else if (section === 'astuces') {
    titre = 'Pas encore d’astuce';
    texte = 'Ce carnet se remplit au fil du terrain : lieux où patienter, heures creuses, entrées à éviter.';
  }

  return (
    <View style={s.vide}>
      <Text style={s.videTitre}>{titre}</Text>
      <Text style={s.videTexte}>{texte}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  fond: { flex: 1, backgroundColor: couleurs.fond },
  entete: { paddingHorizontal: espaces.pad, paddingTop: 16, paddingBottom: 8 },
  titre: { ...typo.titre, color: couleurs.texte },

  sousnav: {
    paddingLeft: espaces.pad,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: couleurs.traitDoux,
  },
  filtres: { paddingLeft: espaces.pad, paddingTop: 10, paddingBottom: 2 },

  rechercheZone: { paddingHorizontal: espaces.pad, paddingTop: 10 },
  recherche: {
    height: 42,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: couleurs.trait,
    borderRadius: rayons.petit,
    backgroundColor: couleurs.surface,
    paddingHorizontal: 12,
    color: couleurs.texte,
    fontFamily: polices.normal,
    fontSize: 15,
  },

  liste: { paddingHorizontal: espaces.pad, paddingBottom: 32 },
  notes: { paddingTop: 12, gap: 6 },
  note: { ...typo.ligneSous, color: couleurs.texteMuet, lineHeight: 18 },

  ligne: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: couleurs.traitDoux,
  },
  corps: { flex: 1, gap: 2 },
  titreLigne: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  nom: { ...typo.ligneTitre, color: couleurs.texte, flexShrink: 1 },
  adresse: { ...typo.ligneSous, color: couleurs.texteAtenue },
  sous: { ...typo.ligneSous, color: couleurs.texteAtenue, lineHeight: 18 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 },

  droite: { alignItems: 'flex-end', gap: 6 },
  dist: { ...typo.ligneSous, ...tabulaire, color: couleurs.texteMuet },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8 },

  vide: {
    marginTop: 40,
    padding: espaces.pad,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: couleurs.trait,
    borderRadius: rayons.carte,
    gap: 4,
  },
  videTitre: { ...typo.carteTitre, color: couleurs.texte },
  videTexte: { ...typo.carteSous, color: couleurs.texteAtenue, lineHeight: 19 },
});
