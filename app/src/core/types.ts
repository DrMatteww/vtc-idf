/* ==========================================================================
   Les contrats des trois JSON.

   ⚠️ Ces types sont dérivés de la DONNÉE RÉELLE, relevée sur
   https://drmatteww.github.io/vtc-idf/data/ le 27 octobre 2026, et pas du
   document `03-les-donnees.md` — qui est incomplet sur deux points :

   - `closures[]` porte `continu` et `road`, absents du document. Or
     `continu` décide si une fermeture s'affiche ou non : le rater, c'est
     perdre six fermetures sur cinquante-sept sans aucun message d'erreur.
   - `manger[]` porte en réalité le schéma complet des services
     (`wc`, `drive`, `boutique`, `autoroute`, `energie`, `pompes24`…), pas
     seulement `o`/`f`/`t`.

   ⚠️ LES NOMS DE CHAMPS SONT CEUX DU JSON, en anglais, sans exception.
   Les franciser imposerait une couche de traduction entre le générateur et
   le client : du code à maintenir en double, et une dérive silencieuse le
   jour où `build_data.py` renomme un champ. Le JSON EST le contrat.
   ========================================================================== */

export type Kind = 'train' | 'flight' | 'concert' | 'sport' | 'salon';

export type Dept = '75' | '77' | '78' | '91' | '92' | '93' | '94' | '95';

/* ---- brief.json -------------------------------------------------------- */

export interface Demand {
  id: string;
  kind: Kind;
  /** La cause, en clair : « 37 arrivées », « 4 arrivées grandes lignes ». */
  title: string;
  /** Le lieu — c'est ce qu'un chauffeur lit en premier. */
  venue: string;
  dept: Dept;
  lat: number;
  lon: number;
  /** ISO 8601 avec décalage explicite. */
  start: string;
  /** null si l'événement est instantané. */
  end: string | null;
  /** Nombre d'arrivées regroupées (trains, vols). */
  count: number | null;
  /**
   * Personnes estimées. NE S'AFFICHE JAMAIS TEL QUEL : il sert au tri et au
   * seuillage en flammes, rien d'autre. Afficher « ~149 courses » a été
   * essayé puis retiré — fausse précision.
   */
  volume: number;
  note: string | null;
}

export type Severity = 'high' | 'medium' | 'low';

export interface Closure {
  id: string;
  kind: 'nuit' | 'chantier' | 'continu';
  title: string;
  detail: string;
  dept: Dept;
  /** « lun-ven », « week-end », ou vide. */
  days: string;
  lat: number | null;
  lon: number | null;
  road?: string;
  severity: Severity;
  from: string;
  to: string;
  /** Absent du document de passation. Décide de l'affichage. */
  continu?: boolean;
}

export interface MeteoPoint {
  dept: Dept;
  lat: number;
  lon: number;
  /** Un état par pas horaire. */
  ciel: string[];
  deg: number[];
  /** 1 = il fait nuit à cette heure. Évite de recalculer lever et coucher. */
  nuit: number[];
}

export interface Meteo {
  /** 29 pas horaires, format « 2026-10-18T19:00 », sans fuseau. */
  heures: string[];
  points: MeteoPoint[];
}

export interface Brief {
  generated_at: string;
  meteo: Meteo;
  demand: Demand[];
  closures: Closure[];
}

/* ---- lieux.json -------------------------------------------------------- */

/**
 * Horaires compacts : sept entrées, de LUNDI à DIMANCHE, en minutes depuis
 * minuit. 540 = 9h00. Une valeur > 1440 déborde sur le lendemain : 1500 = 1h
 * du matin le jour suivant, et la donnée réelle monte jusqu'à 2879.
 * `null` = fermé ce jour-là.
 *
 * Ce format permet de répondre à « est-ce ouvert ? » par une comparaison
 * d'entiers sur mille lieux, sans analyser de texte. À garder.
 */
export type Horaires = (number | null)[];

export interface LieuBase {
  id: string;
  name: string;
  address: string;
  dept: Dept;
  lat: number;
  lon: number;
  h24: boolean;
  src?: string;
}

export interface Toilette extends LieuBase {
  /** Texte à afficher tel quel : « 24/24h », « Horaires du parc »… */
  open_label: string;
  /** Accessible aux personnes à mobilité réduite. */
  pmr: boolean;
  /** Table à langer. */
  bebe: boolean;
}

export type FamilleManger =
  | 'chaine' | 'sandwich' | 'pizza' | 'asiat' | 'super' | 'station' | 'autre';

export type FamilleService = 'station' | 'lavage' | 'pharmacie';

export type Energie = 'carburant' | 'electrique';

export interface LieuHoraire extends LieuBase {
  o: Horaires;
  f: Horaires;
  /** Libellé de secours, quand o/f ne suffit pas. */
  hours?: string;
  /** L'attribut que Google Maps ne donne pas. */
  wc?: boolean;
  boutique?: boolean;
  autoroute?: boolean;
  drive?: boolean;
  energie?: Energie[];
  /** Pompes automatiques la nuit : pour faire le plein, c'est tout ce qui compte. */
  pompes24?: boolean;
  /* Les deux suivants ne viennent que des fiches saisies à la main
     (sources/manger.csv) : OpenStreetMap ne les porte pas, et ce sont
     pourtant deux des questions qu'un chauffeur se pose vraiment. */
  parking?: boolean;
  price?: string;
}

export interface Manger extends LieuHoraire {
  t: FamilleManger;
}

export interface Service extends LieuHoraire {
  t: FamilleService;
}

export interface Astuce {
  id: string;
  name: string;
  address?: string;
  dept?: Dept;
  lat?: number;
  lon?: number;
  texte?: string;
}

export interface Lieux {
  generated_at: string;
  toilettes: Toilette[];
  manger: Manger[];
  services: Service[];
  astuces: Astuce[];
}

/* ---- zones.json -------------------------------------------------------- */

/** [lat, lon, dept] — un centroïde par commune d'Île-de-France. */
export type Commune = [number, number, Dept];

export interface Zones {
  generated_at: string;
  communes: Commune[];
}

/* ---- Position --------------------------------------------------------- */

export interface Position {
  lat: number;
  lon: number;
}
