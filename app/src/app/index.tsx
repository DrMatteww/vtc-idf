import { useEffect, useRef, useState } from 'react';
import { AppState, StyleSheet, Text, View } from 'react-native';

import {
  aVenir, enCours, estSortie, libelleCreneau, meilleure,
} from '@/core/demande';
import { fermeturesDeLaNuit } from '@/core/fermetures';
import { fraicheur } from '@/core/fraicheur';
import { meteoMaintenant } from '@/core/meteo';
import {
  aParis, compteARebours, hhmm, libelleJour, maintenant, nuitEnCours, tranche,
} from '@/core/temps';
import type { Closure, Demand } from '@/core/types';
import { useDonnees } from '@/donnees/store';
import { BoutonGps } from '@/ui/bouton-gps';
import { Ecran } from '@/ui/ecran';
import { Departement, Etiquette, Flammes } from '@/ui/etiquettes';
import { couleurs, espaces, polices, rayons, tabulaire, typo } from '@/ui/theme';

/** Fenêtre du bloc « Maintenant » : une heure et demie, pas plus. */
const FENETRE_MIN = 90;

export default function Brief() {
  const { brief, briefDepuisCache, briefErreur, briefEnCours, rafraichirBrief } =
    useDonnees();

  /* L'heure se recalcule toute seule : l'app reste ouverte des heures sur le
     siège passager, et « Ce soir » doit devenir « Cette nuit » sans relance.
     Le compte à rebours suit le même battement. */
  const [h, setH] = useState(() => maintenant());
  useEffect(() => {
    const t = setInterval(() => setH(maintenant()), 30_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    rafraichirBrief();
  }, [rafraichirBrief]);

  /* Rejoue le chargement quand l'écran redevient visible — c'est ce qui se
     passe quand on rouvre l'app sans la relancer. Sans ça, un brief pris à
     Orly resterait affiché deux heures plus tard. */
  const dernier = useRef(Date.now());
  useEffect(() => {
    const sub = AppState.addEventListener('change', (etat) => {
      if (etat !== 'active') return;
      if (Date.now() - dernier.current < 30_000) return;
      dernier.current = Date.now();
      setH(maintenant());
      rafraichirBrief();
    });
    return () => sub.remove();
  }, [rafraichirBrief]);

  const fr = fraicheur(brief?.generated_at, briefDepuisCache, h);
  const meteo = meteoMaintenant(brief?.meteo, null, h);

  const vivant = brief ? enCours(brief.demand, h) : [];
  const vedette = meilleure(aVenir(vivant, -30, FENETRE_MIN, h), h);
  const suite = vivant
    .filter((d) => d.id !== vedette?.id)
    .sort((a, b) => b.volume - a.volume)
    .slice(0, 2)
    .sort((a, b) => aParis(a.start).toMillis() - aParis(b.start).toMillis());

  const nuit = nuitEnCours(h);
  const fermetures = brief ? fermeturesDeLaNuit(brief.closures, nuit) : [];

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
      <View style={s.corps}>
        {!brief ? (
          <EtatVide enCours={briefEnCours} erreur={briefErreur} />
        ) : (
          <>
            <Maintenant d={vedette} now={h} />
            {suite.length ? <Suite liste={suite} /> : null}
            {/* Ce qui est vide disparaît : pas de carte « aucune fermeture »
                qui occupe la moitié de l'écran. */}
            {fermetures.length ? <Attention liste={fermetures} /> : null}
          </>
        )}
      </View>
    </Ecran>
  );
}

/* ---- Le bloc « Maintenant » -------------------------------------------
   Une seule opportunité, la meilleure, et le seul bloc accentué de l'écran. */
function Maintenant({ d, now }: { d: Demand | null; now: ReturnType<typeof maintenant> }) {
  if (!d) {
    /* Si rien d'important n'arrive dans l'heure et demie, on le dit
       franchement plutôt que d'afficher un événement sans intérêt. */
    return (
      <View style={[s.carte, s.carteHero]}>
        <Text style={[s.label, s.labelHero]}>MAINTENANT</Text>
        <Text style={s.titreCarte}>Rien de gros dans l’heure et demie</Text>
        <Text style={s.sousCarte}>
          Regarde « Où aller » pour la suite de la journée.
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

/* ---- La suite ---------------------------------------------------------- */
function Suite({ liste }: { liste: Demand[] }) {
  return (
    <View style={s.carte}>
      <Text style={s.label}>LA SUITE</Text>
      {liste.map((d) => (
        <View key={d.id} style={s.ligne}>
          <Text style={s.heure}>{hhmm(aParis(d.start))}</Text>
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

/* ---- Attention --------------------------------------------------------- */
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
  corps: { flex: 1, paddingHorizontal: espaces.pad, gap: 10 },

  sousTitre: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  date: { ...typo.sousTitre, color: couleurs.texteAtenue },
  point: { width: 6, height: 6, borderRadius: 3, backgroundColor: couleurs.texteMuet },
  pointFrais: { backgroundColor: couleurs.ok },
  fraicheur: { ...typo.sousTitre, color: couleurs.texteMuet },

  meteo: { alignItems: 'center' },
  meteoIco: { fontSize: 25 },
  meteoDeg: { ...typo.sousTitre, ...tabulaire, fontFamily: polices.demi, color: couleurs.texte },

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
  heure: { ...typo.heure, ...tabulaire, color: couleurs.texte, width: 54 },
  ligneTexte: { flex: 1 },
  ligneTitre: { ...typo.ligneTitre, color: couleurs.texte },
  ligneSous: { ...typo.ligneSous, color: couleurs.texteAtenue, marginTop: 1 },
});
