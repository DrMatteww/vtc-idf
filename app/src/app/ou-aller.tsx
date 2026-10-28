import { useEffect, useMemo, useRef, useState } from 'react';
import { AppState, SectionList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  DEPTS, dansFiltre, enCours, estImminent, estSortie, FILTRES,
} from '@/core/demande';
import { departementA } from '@/core/geo';
import { aParis, hhmm, maintenant, sectionDe } from '@/core/temps';
import type { Demand, Dept } from '@/core/types';
import { useDonnees } from '@/donnees/store';
import { usePosition } from '@/reglages/position';
import { LienGps } from '@/ui/bouton-gps';
import { Departement, Flammes } from '@/ui/etiquettes';
import { Pastilles } from '@/ui/pastilles';
import { couleurs, espaces, polices, rayons, tabulaire, typo } from '@/ui/theme';

const TYPES = [
  { code: 'all', libelle: 'Tout' },
  ...FILTRES.map((f) => ({ code: f.code, libelle: f.libelle })),
];

export default function OuAller() {
  const { brief, briefEnCours, rafraichirBrief, zones, assurerZones } = useDonnees();
  const { pos, demander } = usePosition();

  const [type, setType] = useState('all');
  const [dept, setDept] = useState<string>('all');

  /* ⚠️ Le département n'est PAS mémorisé d'une session à l'autre, contrairement
     à ce qu'annonce 02-les-ecrans.md : la version livrée le redéduit de la
     position à chaque ouverture, et son commentaire dit pourquoi — un
     chauffeur qui ouvre l'app dans le 94 doit voir le 94, même s'il
     consultait Paris la veille. Un clic sur une autre pastille l'emporte pour
     la session en cours. On suit le code livré, pas le document. */
  const choisiALaMain = useRef(false);
  const deduit = useRef<string | null>(null);

  const [h, setH] = useState(() => maintenant());
  useEffect(() => {
    const t = setInterval(() => setH(maintenant()), 30_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    rafraichirBrief();
    assurerZones();
    demander();
  }, [rafraichirBrief, assurerZones, demander]);

  /* Redéduction au retour au premier plan : on a pu rouler entre-temps. */
  useEffect(() => {
    const sub = AppState.addEventListener('change', (e) => {
      if (e !== 'active') return;
      setH(maintenant());
      demander(true);
    });
    return () => sub.remove();
  }, [demander]);

  useEffect(() => {
    if (choisiALaMain.current || !pos || !zones) return;
    const d = departementA(pos, zones.communes, brief?.demand ?? []);
    if (!d || d === deduit.current) return;
    deduit.current = d;
    setDept(d);
  }, [pos, zones, brief]);

  function choisirDept(code: string) {
    choisiALaMain.current = true;
    setDept(code);
  }

  const sections = useMemo(() => {
    if (!brief) return [];
    const items = enCours(brief.demand, h)
      .filter((d) => dansFiltre(d.kind, type))
      .filter((d) => dept === 'all' || d.dept === dept)
      .sort((a, b) => aParis(a.start).toMillis() - aParis(b.start).toMillis());

    const groupes: { title: string; data: Demand[] }[] = [];
    for (const it of items) {
      const titre = sectionDe(it.start, h);
      const dernier = groupes[groupes.length - 1];
      if (dernier && dernier.title === titre) dernier.data.push(it);
      else groupes.push({ title: titre, data: [it] });
    }
    return groupes;
  }, [brief, type, dept, h]);

  return (
    <SafeAreaView style={s.fond} edges={['top']}>
      <View style={s.entete}>
        <Text style={s.titre}>Où aller</Text>
      </View>

      <View style={s.filtres}>
        <Pastilles liste={TYPES} actif={type} onChoisir={setType} />
      </View>
      <View style={s.filtresBas}>
        <Pastilles liste={DEPTS} actif={dept} onChoisir={choisirDept} />
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(it) => it.id}
        stickySectionHeadersEnabled
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.liste}
        renderSectionHeader={({ section }) => (
          <Text style={s.section}>{section.title}</Text>
        )}
        renderItem={({ item }) => <Ligne d={item} now={h} />}
        ListEmptyComponent={<Vide enCours={briefEnCours} aDesDonnees={!!brief} />}
        ListFooterComponent={sections.length ? <Note /> : undefined}
      />
    </SafeAreaView>
  );
}

function Ligne({ d, now }: { d: Demand; now: ReturnType<typeof maintenant> }) {
  const sortie = estSortie(d);
  const imminent = estImminent(d, now);
  /* Les arrivées sont groupées par créneaux de deux heures : afficher le
     seul début laisserait lire « 14h00 » comme passé à 15h46, alors que le
     créneau court jusqu\u2019à 16h. On montre donc la plage dès qu\u2019il y en a une. */
  const plage = !!d.end && d.end !== d.start;

  return (
    <View style={s.ligne}>
      {/* Une tranche s'écrit sur deux lignes, pas côte à côte : « 14h00–19h00 »
          élargissait la colonne et décalait le titre de cette ligne-là toute
          seule. Empilées, les heures gardent la largeur d'une seule, et tous
          les titres commencent au même endroit. */}
      <View style={s.colonneHeure}>
        {sortie ? <Text style={s.sortie}>sortie</Text> : null}
        <Text style={[s.heure, imminent && s.heureImminente]}>
          {hhmm(aParis(d.start))}
        </Text>
        {plage ? (
          <Text style={s.heure2}>{hhmm(aParis(d.end!))}</Text>
        ) : null}
      </View>

      <View style={s.corps}>
        {/* Le lieu porte son département, la cause porte la demande : deux
            lignes au lieu de trois, sur un écran qu'on lit au feu rouge. */}
        <View style={s.ligneTitre}>
          <Text style={s.nom} numberOfLines={1}>{d.venue || d.title}</Text>
          <Departement dept={d.dept} />
        </View>
        <View style={s.ligneSous}>
          <Text style={s.quoi} numberOfLines={1}>{d.title}</Text>
          <Flammes volume={d.volume} />
        </View>
      </View>

      {d.lat ? <LienGps lat={d.lat} lon={d.lon} /> : null}
    </View>
  );
}

function Vide({ enCours, aDesDonnees }: { enCours: boolean; aDesDonnees: boolean }) {
  if (enCours && !aDesDonnees) {
    return (
      <View style={s.vide}>
        <Text style={s.videTexte}>Chargement…</Text>
      </View>
    );
  }
  if (!aDesDonnees) {
    return (
      <View style={s.vide}>
        <Text style={s.videTitre}>Pas de connexion</Text>
        <Text style={s.videTexte}>Reviens dès que tu as du réseau.</Text>
      </View>
    );
  }
  /* Jamais de liste vide silencieuse : on dit pourquoi. */
  return (
    <View style={s.vide}>
      <Text style={s.videTitre}>Rien avec ces filtres</Text>
      <Text style={s.videTexte}>Élargis le département ou le type d’événement.</Text>
    </View>
  );
}

function Note() {
  return (
    <Text style={s.note}>
      Pour une salle, l’heure affichée est celle de la <Text style={s.gras}>sortie</Text>,
      estimée à partir de l’heure du billet : la billetterie ne publie pas d’heure
      de fin. Pour un salon, c’est la tranche où ça sort le plus, de 14 h à la
      fermeture — pas les horaires d’ouverture.
    </Text>
  );
}

const s = StyleSheet.create({
  fond: { flex: 1, backgroundColor: couleurs.fond },
  entete: { paddingHorizontal: espaces.pad, paddingTop: 20, paddingBottom: 10 },
  titre: { ...typo.titre, color: couleurs.texte },

  filtres: { paddingLeft: espaces.pad, paddingBottom: 6 },
  filtresBas: { paddingLeft: espaces.pad, paddingBottom: 8 },

  liste: { paddingHorizontal: espaces.pad, paddingBottom: 32 },
  section: {
    ...typo.etiquette,
    color: couleurs.texteMuet,
    backgroundColor: couleurs.fond,
    paddingTop: 14,
    paddingBottom: 6,
  },

  ligne: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: couleurs.traitDoux,
  },
  colonneHeure: { width: 52 },
  sortie: { ...typo.etiquette, fontSize: 9, color: couleurs.texteMuet },
  heure: { ...typo.heure, ...tabulaire, color: couleurs.texteAtenue },
  heureImminente: { color: couleurs.texte },
  heure2: { ...typo.ligneSous, ...tabulaire, color: couleurs.texteMuet },

  corps: { flex: 1, gap: 2 },
  ligneTitre: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  nom: { ...typo.ligneTitre, color: couleurs.texte, flexShrink: 1 },
  ligneSous: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  quoi: { ...typo.ligneSous, color: couleurs.texteAtenue, flexShrink: 1 },

  vide: {
    marginTop: 40,
    padding: espaces.pad,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: couleurs.trait,
    borderRadius: rayons.carte,
    gap: 4,
  },
  videTitre: { ...typo.carteTitre, color: couleurs.texte },
  videTexte: { ...typo.carteSous, color: couleurs.texteAtenue },

  note: {
    ...typo.ligneSous,
    color: couleurs.texteMuet,
    lineHeight: 18,
    marginTop: 20,
  },
  gras: { fontFamily: polices.demi, color: couleurs.texteAtenue },
});
