/* ==========================================================================
   Le temps. Transposé d'app.js.

   RÈGLE ABSOLUE DE CE FICHIER : tout est en Europe/Paris, par un fuseau
   NOMMÉ, jamais un décalage fixe. Le changement d'heure a déjà causé un bug
   dans ce projet (passation/04-architecture-et-portage.md § 4.5), et un
   téléphone réglé sur un autre fuseau ne doit rien changer à ce qu'affiche
   l'application : un chauffeur qui roule à Roissy lit des heures de Roissy.
   ========================================================================== */

import { DateTime } from 'luxon';

export const ZONE = 'Europe/Paris';

/** Maintenant, en heure de Paris. Le seul point d'entrée du temps. */
export function maintenant(): DateTime {
  return DateTime.now().setZone(ZONE);
}

/** Convertit un instant quelconque en heure de Paris. */
export function aParis(iso: string | Date | number): DateTime {
  if (typeof iso === 'string') return DateTime.fromISO(iso, { zone: ZONE });
  if (iso instanceof Date) return DateTime.fromJSDate(iso, { zone: ZONE });
  return DateTime.fromMillis(iso, { zone: ZONE });
}

/* ---- Les tranches de la journée ---------------------------------------
   Le titre de l'écran suit l'heure réelle d'ouverture de l'app. Ce détail
   fait énormément pour la sensation que l'app parle de maintenant.        */

export type CleTranche = 'matin' | 'midi' | 'aprem' | 'soir' | 'nuit';

export interface Tranche {
  cle: CleTranche;
  libelle: string;
}

export function tranche(d: DateTime = maintenant()): Tranche {
  const h = d.hour;
  if (h >= 5 && h < 11) return { cle: 'matin', libelle: 'Ce matin' };
  if (h >= 11 && h < 14) return { cle: 'midi', libelle: 'Ce midi' };
  if (h >= 14 && h < 18) return { cle: 'aprem', libelle: 'Cet après-midi' };
  if (h >= 18) return { cle: 'soir', libelle: 'Ce soir' };
  return { cle: 'nuit', libelle: 'Cette nuit' };
}

/** Fin de la tranche courante : sépare « maintenant » du « plus tard ». */
export function finDeTranche(d: DateTime = maintenant()): DateTime {
  const bornes = [5, 11, 14, 18, 24];
  for (const b of bornes) {
    if (d.hour < b) return d.startOf('day').plus({ hours: b });
  }
  return d.startOf('day').plus({ hours: 24 });
}

/* ---- Libellés ---------------------------------------------------------
   Écrits à la main plutôt que délégués au formatage local : la casse et la
   forme (« mercredi 28 octobre », sans l'année) sont des choix de lecture,
   et ils ne doivent pas changer avec la langue du téléphone.              */

const JOURS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
const MOIS = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
];

export function libelleJour(d: DateTime = maintenant()): string {
  return JOURS[d.weekday - 1] + ' ' + d.day + ' ' + MOIS[d.month - 1];
}

/** « 22h47 ». Jamais « 22:47 » : le h est ce qu'on lit en France. */
export function hhmm(d: DateTime): string {
  return d.toFormat("HH'h'mm");
}

/* ---- Le fuseau fonctionne-t-il vraiment ? -----------------------------
   Luxon s'appuie sur Intl pour résoudre un fuseau nommé. Selon le moteur
   JavaScript embarqué, Intl peut être tronqué et `setZone` échouer
   silencieusement — on se retrouve alors sur l'heure de l'appareil sans
   aucune erreur. On vérifie donc, au lieu de supposer.

   Appelé par l'écran Infos pendant le développement.                      */
export interface DiagnosticFuseau {
  ok: boolean;
  zone: string;
  zoneAppareil: string;
  heureParis: string;
  decalageMin: number;
  intlPresent: boolean;
  detail: string;
}

export function diagnosticFuseau(): DiagnosticFuseau {
  const intlPresent =
    typeof Intl !== 'undefined' && typeof Intl.DateTimeFormat === 'function';
  const d = DateTime.now().setZone(ZONE);
  const valide = d.isValid && d.zoneName === ZONE;
  return {
    ok: intlPresent && valide,
    zone: d.zoneName ?? '—',
    zoneAppareil: DateTime.now().zoneName ?? '—',
    heureParis: d.toFormat("HH'h'mm"),
    decalageMin: d.offset,
    intlPresent,
    detail: valide
      ? 'fuseau nommé résolu'
      : (d.invalidReason ?? 'setZone a échoué sans erreur'),
  };
}
