/* ==========================================================================
   « Sur la route » : les règles des cinq sous-sections.
   Transposé d'app.js (fonction route()).
   ========================================================================== */

import type { Manger, Service, Toilette } from './types';

export type CodeSection = 'wc' | 'manger' | 'services' | 'trafic' | 'astuces';

export interface SousSection {
  code: CodeSection;
  libelle: string;
  /** Le fichier d'où vient la donnée. */
  fichier: 'lieux' | 'brief';
}

export const SOUS_SECTIONS: SousSection[] = [
  { code: 'wc', libelle: 'Toilettes', fichier: 'lieux' },
  { code: 'manger', libelle: 'Manger', fichier: 'lieux' },
  { code: 'services', libelle: 'Services', fichier: 'lieux' },
  { code: 'trafic', libelle: 'Trafic', fichier: 'brief' },
  { code: 'astuces', libelle: 'Astuces', fichier: 'lieux' },
];

/* ---- Les familles de « Manger » ---------------------------------------
   Un chauffeur qui cherche à manger à deux heures du matin ne cherche pas
   « un restaurant » : il cherche du sûr (une chaîne — il sait ce qu'il
   trouve, il y a un parking et souvent des toilettes), du rapide (grec,
   kebab, tacos, sandwich), ou de quoi tenir jusqu'au matin (supérette,
   station). Ces quatre-là font des pastilles ; le reste — burger
   indépendant, poulet, asiatique — reste sous « Tout », parce qu'une
   pastille qui ne ramène rien est une déception de plus au volant.

   La catégorie est écrite dans la donnée (champ « t »), jamais devinée.  */
export const PASTILLES_MANGER = [
  { code: 'all', libelle: 'Tout' },
  { code: 'fav', libelle: '★ Favoris' },
  { code: 'chaine', libelle: 'Chaînes' },
  { code: 'sandwich', libelle: 'Grec · Sandwich' },
  { code: 'pizza', libelle: 'Pizza' },
  { code: 'super', libelle: 'Supérette' },
  { code: 'station', libelle: 'Autoroute' },
];

export const PASTILLES_WC = [
  { code: 'all', libelle: 'Toutes' },
  { code: 'fav', libelle: '★ Favoris' },
  { code: '24', libelle: 'Ouvert 24h' },
];

/* Trois natures, et c'est tout. Les pastilles « 24h/24 » et « Électrique »
   ont été retirées : la première parce que la liste ne montre déjà que ce qui
   est ouvert, la seconde parce qu'elle est devenue un RÉGLAGE — le chauffeur
   dit une fois ce qu'il conduit, et l'app ne lui montre plus que les stations
   qui le concernent. */
export const PASTILLES_SERVICES = [
  { code: 'all', libelle: 'Tout' },
  { code: 'fav', libelle: '★ Favoris' },
  { code: 'station', libelle: 'Stations' },
  { code: 'lavage', libelle: 'Lavage' },
  { code: 'pharma', libelle: 'Pharmacie' },
];

export const PASTILLES_ASTUCES = [
  { code: 'all', libelle: 'Toutes' },
  { code: 'fav', libelle: '★ Favoris' },
];

export function pastillesDe(section: CodeSection) {
  switch (section) {
    case 'wc': return PASTILLES_WC;
    case 'manger': return PASTILLES_MANGER;
    case 'services': return PASTILLES_SERVICES;
    case 'astuces': return PASTILLES_ASTUCES;
    default: return null; // Trafic n'a pas de filtre : une seule nuit
  }
}

/* ---- Ce que conduit le chauffeur --------------------------------------
   Une station sans borne n'intéresse pas un électrique, et réciproquement.
   Plutôt qu'une pastille à recliquer chaque nuit, c'est un réglage. Par
   défaut « carburant », qui est encore le cas de la plupart des chauffeurs —
   et qui ne retire rien à personne, puisque toutes les stations en vendent. */
export type Vehicule = 'carburant' | 'electrique';

export function pourMoi(s: Service, vehicule: Vehicule): boolean {
  /* Un lavage ou une pharmacie ne vend pas d'énergie : ils sont montrés à
     tout le monde. Seules les stations sont filtrées. */
  if (s.t !== 'station') return true;
  if (vehicule !== 'electrique') return true;
  return (s.energie ?? []).includes('electrique');
}

export function dansService(
  s: Service,
  code: string,
  estFavori: (id: string) => boolean,
  vehicule: Vehicule,
): boolean {
  if (!pourMoi(s, vehicule)) return false;
  if (!code || code === 'all') return true;
  if (code === 'fav') return estFavori(s.id);
  if (code === 'station') return s.t === 'station';
  if (code === 'lavage') return s.t === 'lavage';
  if (code === 'pharma') return s.t === 'pharmacie';
  return true;
}

export function dansManger(
  m: Manger,
  code: string,
  estFavori: (id: string) => boolean,
): boolean {
  if (!code || code === 'all') return true;
  if (code === 'fav') return estFavori(m.id);
  return (m.t ?? 'autre') === code;
}

export function dansWc(
  t: Toilette,
  code: string,
  estFavori: (id: string) => boolean,
): boolean {
  if (!code || code === 'all') return true;
  if (code === 'fav') return estFavori(t.id);
  if (code === '24') return !!t.h24;
  return true;
}

/* ---- Combien on en montre ---------------------------------------------
   Position connue : CINQ suffisent, et ce sont vraiment les cinq d'à côté.
   Un chauffeur veut le plus proche, pas un annuaire.

   Sans position, la liste n'est pas triée par distance — on en montre alors
   davantage, faute de mieux. En recherche, dix : on cherche une enseigne
   précise, pas ce qui est autour. Et une liste de favoris se montre en
   entier, c'est la sienne.                                                */
export function combienAfficher(o: {
  enFavoris: boolean;
  recherche: boolean;
  aUnePosition: boolean;
}): number {
  if (o.enFavoris) return 50;
  if (o.recherche) return 10;
  return o.aUnePosition ? 5 : 12;
}
