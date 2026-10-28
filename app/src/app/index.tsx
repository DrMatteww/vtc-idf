import { useEffect, useRef, useState } from 'react';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';

import {
  aVenir, enCours, estSortie, libelleCreneau, meilleure,
} from '@/core/demande';
import { fermeturesDeLaNuit } from '@/core/fermetures';
import { fraicheur } from '@/core/fraicheur';
import { RAYON_KM, proches } from '@/core/geo';
import { meteoMaintenant } from '@/core/meteo';
import {
  aParis, compteARebours, estLeLendemain, hhmm, libelleJour, maintenant,
  nuitEnCours, tranche,
} from '@/core/temps';
import type { Closure, Demand } from '@/core/types';
import { useDonnees } from '@/donnees/store';
import {
  geoDejaAccordee, messageGeo, ouvrirReglages, peutOuvrirReglages, usePosition,
} from '@/reglages/position';
import { ecrire, lireParmi } from '@/reglages/stockage';
import { BoutonGps } from '@/ui/bouton-gps';
import { Ecran } from '@/ui/ecran';
import { Departement, Etiquette, Flammes } from '@/ui/etiquettes';
import { Pastilles } from '@/ui/pastilles';
import { couleurs, espaces, polices, rayons, tabulaire, typo } from '@/ui/theme';

/** Fenêtre du bloc « Maintenant » : une heure et demie, pas plus. */
const FENETRE_MIN = 90;

/* Deux briefs, un bouton. Le choix tient d'une session à l'autre. */
type Mode = 'idf' | 'autour';
const MODES = [
  { code: 'idf' as const, libelle: 'Toute l’Île-de-France' },
  { code: 'autour' as const, libelle: 'Autour de moi' },
];
const CLE_MODE = 'vtc_brief_mode';

export default function Brief() {
  const { brief, briefDepuisCache, briefErreur, briefEnCours, rafraichirBrief } =
    useDonnees();
  const { pos, etat: etatGeo, demander } = usePosition();

  /* Si la position a déjà été accordée une fois, le brief s'ouvre sur le
     secteur du chauffeur : c'est ce qu'il veut voir en premier. Sinon, toute
     l'Île-de-France — et aucune fenêtre d'autorisation ne s'ouvre au premier
     lancement, ce qui serait la pire des entrées en matière. */
  const [mode, setMode] = useState<Mode>(() =>
    lireParmi<Mode>(CLE_MODE, ['idf', 'autour'], geoDejaAccordee() ? 'autour' : 'idf'),
  );

  const [h, setH] = useState(() => maintenant());
  useEffect(() => {
    const t = setInterval(() => setH(maintenant()), 30_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    rafraichirBrief();
  }, [rafraichirBrief]);

  /* Pour le brief local on exige une position NEUVE : on peut fermer l'app à
     Orly et la rouvrir dans Paris. */
  useEffect(() => {
    if (mode === 'autour') demander(true);
  }, [mode, demander]);

  const dernier = useRef(Date.now());
  useEffect(() => {
    const sub = AppState.addEventListener('change', (etat) => {
      if (etat !== 'active') return;
      if (Date.now() - dernier.current < 30_000) return;
      dernier.current = Date.now();
      setH(maintenant());
      rafraichirBrief();
      if (mode === 'autour') demander(true);
    });
    return () => sub.remove();
  }, [rafraichirBrief, demander, mode]);

  function choisir(m: Mode) {
    setMode(m);
    ecrire(CLE_MODE, m);
  }

  const local = mode === 'autour' && !!pos;
  const fr = fraicheur(brief?.generated_at, briefDepuisCache, h);
  /* La météo du bon département : il peut pleuvoir à Melun pendant qu'il fait
     beau à Cergy. Sans position, c'est Paris. */
  const meteo = meteoMaintenant(brief?.meteo, pos, h);

  const tout = brief ? enCours(brief.demand, h) : [];
  const vivant = local ? proches(tout, pos, RAYON_KM).liste : tout;

  const vedette = meilleure(aVenir(vivant, -30, FENETRE_MIN, h), h);
  const suite = vivant
    .filter((d) => d.id !== vedette?.id)
    .sort((a, b) => b.volume - a.volume)
    .slice(0, 2)
    .sort((a, b) => aParis(a.start).toMillis() - aParis(b.start).toMillis());

  const fermetures = brief ? fermeturesDeLaNuit(brief.closures, nuitEnCours(h)) : [];
  const geoKo = mode === 'autour' && (etatGeo === 'refuse' || etatGeo === 'indisponible');

  return (
    <Ecran
      fixe
      titre={tranche(h).libelle}
      sousTitre={
        <View style={s.sousTitre}>
          <Text style={s.date}>{libelleJour(h)}</Text>
          {brief ? (
            <>
              <View style={[s.point, !fr.perime && s.pointFrais]} />
              <Text style={s.fraicheur}>{fr.texte}</Text>
            </>
          ) : null}
        </View>
      }
      aDroite={
        meteo ? (
          <View style={s.meteo}>
            <Text style={s.meteoIco}>{meteo.icone}</Text>
            <Text style={s.meteoDeg}>{meteo.deg}°</Text>
          </View>
        ) : null
      }>
      <View style={s.pastilles}>
        <Pastilles liste={MODES} actif={mode} onChoisir={choisir} />
      </View>

      <View style={s.corps}>
        {/* La géolocalisation est facultative : si elle manque, on l'explique
            et on continue d'afficher le brief régional. On ne bloque jamais
            un écran sur une permission refusée. */}
        {geoKo ? <BandeauGeo etat={etatGeo} /> : null}

        {!brief ? (
          <EtatVide enCours={briefEnCours} erreur={briefErreur} />
        ) : (
          <>
            <Maintenant d={vedette} now={h} local={local} />
            {suite.length ? <Suite liste={suite} now={h} /> : null}
            {fermetures.length ? <Attention liste={fermetures} /> : null}
          </>
        )}
      </View>
    </Ecran>
  );
}

function BandeauGeo({ etat }: { etat: 'refuse' | 'indisponible' }) {
  return (
    <View style={s.bandeau}>
      <Text style={s.bandeauTexte}>{messageGeo(etat)}</Text>
      <Text style={s.bandeauNote}>Le brief régional reste affiché.</Text>
      {peutOuvrirReglages(etat) ? (
        <Pressable onPress={ouvrirReglages} hitSlop={10} style={s.lien}>
          <Text style={s.lienTexte}>Ouvrir les réglages</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/* ---- Le bloc « Maintenant » -------------------------------------------
   Une seule opportunité, la meilleure, et le seul bloc accentué de l'écran. */
function Maintenant({
  d, now, local,
}: {
  d: Demand | null;
  now: ReturnType<typeof maintenant>;
  local: boolean;
}) {
  if (!d) {
    return (
      <View style={[s.carte, s.carteHero]}>
        <Text style={[s.label, s.labelHero]}>MAINTENANT</Text>
        <Text style={s.titreCarte}>
          {local
            ? 'Rien de gros autour de toi dans l’heure et demie'
            : 'Rien de gros dans l’heure et demie'}
        </Text>
        <Text style={s.sousCarte}>
          {local
            ? 'Essaie « Toute l’Île-de-France », ou regarde « Où aller ».'
            : 'Regarde « Où aller » pour la suite de la journée.'}
        </Text>
      </View>
    );
  }

  return (
    <View style={[s.carte, s.carteHero]}>
      <Text style={[s.label, s.labelHero]}>MAINTENANT</Text>

      <View style={s.ligneHaute}>
        <Text style={s.heureGeante}>
          {estSortie(d) ? hhmm(aParis(d.start)) : libelleCreneau(d)}
        </Text>
        {estSortie(d) ? <Text style={s.sortie}>sortie</Text> : null}
      </View>

      <Text style={s.titreCarte}>{d.venue}</Text>
      <Text style={s.sousCarte}>{d.title}</Text>

      <View style={s.tags}>
        <Flammes volume={d.volume} />
        <Departement dept={d.dept} />
        <Etiquette texte={compteARebours(d.start, now)} />
      </View>

      <View style={s.pied}>
        <BoutonGps lat={d.lat} lon={d.lon} />
      </View>
    </View>
  );
}

function Suite({ liste, now }: { liste: Demand[]; now: ReturnType<typeof maintenant> }) {
  return (
    <View style={s.carte}>
      <Text style={s.label}>LA SUITE</Text>
      {liste.map((d) => (
        <View key={d.id} style={s.ligne}>
          <View style={s.colonneHeure}>
            {/* Un salon qui dure quatre jours produit quatre lignes à 14h00.
                Sans le jour, elles sont indiscernables. */}
            {estLeLendemain(d.start, now) ? (
              <Text style={s.demain}>demain</Text>
            ) : null}
            <Text style={s.heure}>{hhmm(aParis(d.start))}</Text>
          </View>
          <View style={s.ligneTexte}>
            {/* Le lieu en premier : c'est ce qu'un chauffeur lit. */}
            <Text style={s.ligneTitre} numberOfLines={1}>{d.venue}</Text>
            <Text style={s.ligneSous} numberOfLines={1}>{d.title}</Text>
          </View>
          <Flammes volume={d.volume} />
        </View>
      ))}
    </View>
  );
}

function Attention({ liste }: { liste: Closure[] }) {
  const c = liste[0];
  return (
    <View style={[s.carte, s.carteAlerte]}>
      <Text style={[s.label, s.labelAlerte]}>ATTENTION</Text>
      <Text style={s.titreCarte}>{c.title}</Text>
      {c.detail ? (
        <Text style={s.sousCarte} numberOfLines={2}>{c.detail}</Text>
      ) : null}
      <View style={s.tags}>
        <Etiquette texte={hhmm(aParis(c.from)) + ' → ' + hhmm(aParis(c.to))} ton="alerte" />
        <Departement dept={c.dept} />
        {liste.length > 1 ? (
          <Etiquette texte={'+ ' + (liste.length - 1) + ' autre' + (liste.length > 2 ? 's' : '')} />
        ) : null}
      </View>
    </View>
  );
}

/* ---- Les états vides parlent ------------------------------------------- */
function EtatVide({ enCours, erreur }: { enCours: boolean; erreur: string | null }) {
  if (enCours) {
    return (
      <View style={s.carte}>
        <Text style={s.sousCarte}>Chargement…</Text>
      </View>
    );
  }
  return (
    <View style={s.carte}>
      <Text style={s.titreCarte}>Pas de données</Text>
      <Text style={s.sousCarte}>
        {erreur === 'delai'
          ? 'Le réseau n’a pas répondu. Reviens dès que tu as du signal.'
          : 'Pas de réseau, et rien en mémoire. Dès que tu auras du signal une fois, le brief restera disponible hors ligne.'}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  pastilles: { paddingLeft: espaces.pad, paddingBottom: 10 },
  corps: { flex: 1, paddingHorizontal: espaces.pad, gap: 10 },

  sousTitre: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  date: { ...typo.sousTitre, color: couleurs.texteAtenue },
  point: { width: 6, height: 6, borderRadius: 3, backgroundColor: couleurs.texteMuet },
  pointFrais: { backgroundColor: couleurs.ok },
  fraicheur: { ...typo.sousTitre, color: couleurs.texteMuet },

  meteo: { alignItems: 'center' },
  meteoIco: { fontSize: 25 },
  meteoDeg: { ...typo.sousTitre, ...tabulaire, fontFamily: polices.demi, color: couleurs.texte },

  bandeau: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: couleurs.trait,
    borderRadius: rayons.carte,
    padding: 12,
    gap: 2,
  },
  bandeauTexte: { ...typo.ligneSous, color: couleurs.texteAtenue, lineHeight: 18 },
  bandeauNote: { ...typo.ligneSous, color: couleurs.texteMuet },
  lien: { marginTop: 6, minHeight: 24, justifyContent: 'center' },
  lienTexte: { ...typo.ligneSous, fontFamily: polices.demi, color: couleurs.texte },

  carte: {
    backgroundColor: couleurs.surface,
    borderColor: couleurs.trait,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: rayons.carte,
    padding: espaces.pad,
  },
  carteHero: { borderLeftWidth: 3, borderLeftColor: couleurs.accent },
  carteAlerte: { borderLeftWidth: 3, borderLeftColor: couleurs.alerte },

  label: { ...typo.etiquette, color: couleurs.texteMuet, marginBottom: 10 },
  labelHero: { color: couleurs.texte },
  labelAlerte: { color: couleurs.alerte },

  ligneHaute: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  heureGeante: { ...typo.heureGeante, ...tabulaire, color: couleurs.texte },
  sortie: { ...typo.etiquette, color: couleurs.texteMuet },

  titreCarte: { ...typo.carteTitre, color: couleurs.texte, marginTop: 2 },
  sousCarte: { ...typo.carteSous, color: couleurs.texteAtenue, marginTop: 3, lineHeight: 19 },

  tags: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, flexWrap: 'wrap' },
  pied: { marginTop: 14, alignItems: 'flex-start' },

  ligne: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: couleurs.traitDoux,
  },
  colonneHeure: { width: 54 },
  demain: { ...typo.etiquette, fontSize: 9, color: couleurs.texteMuet },
  heure: { ...typo.heure, ...tabulaire, color: couleurs.texte },
  ligneTexte: { flex: 1 },
  ligneTitre: { ...typo.ligneTitre, color: couleurs.texte },
  ligneSous: { ...typo.ligneSous, color: couleurs.texteAtenue, marginTop: 1 },
});
