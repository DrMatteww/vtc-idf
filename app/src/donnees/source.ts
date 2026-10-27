/* ==========================================================================
   Le chargement des trois fichiers.

   L'application ne contient aucune donnée : elle télécharge trois JSON servis
   en statique et n'écrit jamais rien côté serveur. Pas d'authentification,
   pas de pagination, pas d'API tierce à gérer — c'est tout l'intérêt du
   montage décrit au § 4.1 du dossier, et il ne change pas au portage.
   ========================================================================== */

import { lireCache, ecrireCache } from './cache';
import type { Brief, Lieux, Zones } from '@/core/types';

export const BASE = 'https://drmatteww.github.io/vtc-idf/data/';

/** Au-delà, on sert le cache. Un chauffeur n'attend pas un écran qui tourne. */
export const DELAI_MS = 8000;

export type NomFichier = 'brief' | 'lieux' | 'zones';

export interface Chargement<T> {
  donnees: T | null;
  /** Vrai si ça vient du disque faute de réseau : l'écran doit le dire. */
  depuisCache: boolean;
  erreur: 'reseau' | 'delai' | 'illisible' | null;
}

async function charger<T>(nom: NomFichier): Promise<Chargement<T>> {
  const replie = (erreur: Chargement<T>['erreur']): Chargement<T> => {
    const brut = lireCache(nom);
    if (!brut) return { donnees: null, depuisCache: false, erreur };
    try {
      return { donnees: JSON.parse(brut) as T, depuisCache: true, erreur: null };
    } catch {
      return { donnees: null, depuisCache: false, erreur: 'illisible' };
    }
  };

  const ctrl = new AbortController();
  const minuteur = setTimeout(() => ctrl.abort(), DELAI_MS);

  try {
    const r = await fetch(BASE + nom + '.json', {
      cache: 'no-store',
      signal: ctrl.signal,
    });
    clearTimeout(minuteur);
    if (!r.ok) return replie('reseau');

    const texte = await r.text();
    let donnees: T;
    try {
      donnees = JSON.parse(texte) as T;
    } catch {
      return replie('illisible');
    }

    /* On écrit le cache APRÈS avoir réussi à analyser : un fichier tronqué ne
       doit jamais remplacer une version saine. */
    ecrireCache(nom, texte);
    return { donnees, depuisCache: false, erreur: null };
  } catch (e) {
    clearTimeout(minuteur);
    const avorte = e instanceof Error && e.name === 'AbortError';
    return replie(avorte ? 'delai' : 'reseau');
  }
}

export const chargerBrief = () => charger<Brief>('brief');
export const chargerLieux = () => charger<Lieux>('lieux');
export const chargerZones = () => charger<Zones>('zones');
