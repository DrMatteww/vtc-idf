/* ==========================================================================
   Le contenu de l'onglet Infos, en DONNÉE et non en code.

   Pourquoi : c'est la page qui porte la confiance, et c'est donc celle qui
   change le plus souvent — une formulation à ajuster, une source à préciser,
   une mention légale à corriger. La passer par une republication sur les
   magasins, avec une revue Apple à chaque virgule, n'a aucun sens.

   Elle suit donc la même règle que tout le reste du produit : l'application
   lit un fichier, le back office l'écrit, et rien ne transite par un serveur
   à nous.

   Les valeurs ci-dessous sont le repli : elles s'affichent au premier
   lancement, hors ligne, et si le fichier n'est pas encore publié. L'app
   n'est donc jamais vide, même sans réseau et sans back office.
   ========================================================================== */

/** Les blocs interactifs, qui ne sont pas du texte et restent dans le code. */
export type Module =
  | 'echeances'
  | 'gps'
  | 'vehicule'
  | 'suggestions'
  | 'flammes'
  | 'sources'
  | 'version';

export interface BlocTexte {
  id: string;
  type: 'texte';
  titre: string;
  paragraphes: string[];
  actif?: boolean;
}

export interface BlocModule {
  id: string;
  type: 'module';
  module: Module;
  actif?: boolean;
}

export type Bloc = BlocTexte | BlocModule;

export interface Infos {
  blocs: Bloc[];
}

const m = (module: Module): BlocModule => ({ id: module, type: 'module', module, actif: true });

export const INFOS_PAR_DEFAUT: Infos = {
  blocs: [
    m('echeances'),
    m('gps'),
    m('vehicule'),
    {
      id: 'gratuit',
      type: 'texte',
      titre: 'Pourquoi c’est gratuit',
      actif: true,
      paragraphes: [
        'L’appli est gratuite, et le restera. Pas d’abonnement, pas de version payante.',
        'Elle est financée par de la publicité. C’est ce qui paie l’hébergement et le temps passé à tenir les données à jour. Tu le sais dès l’installation, il n’y a rien de caché là-dedans.',
        'L’objectif à terme : remplacer la pub par des réductions négociées pour les chauffeurs — lavage, pneus, entretien, assurance. Plus on est nombreux, plus ça devient possible.',
      ],
    },
    {
      id: 'fichage',
      type: 'texte',
      titre: 'Pas de compte, pas de fichage',
      actif: true,
      paragraphes: [
        'Aucune inscription n’est demandée. Pas de nom, pas de numéro, pas de plaque.',
        'Nous n’avons ni compte, ni serveur, ni base de données, et nous ne recevons rien de ton téléphone. L’appli ne sait pas qui tu es et n’enregistre pas tes trajets. Ta position sert uniquement à trier les lieux par distance, sur ton téléphone, et ne nous est jamais envoyée.',
        'La régie publicitaire, elle, collecte des données pour choisir les annonces — et c’est ce qui permet que l’application reste gratuite. Tu peux refuser : les annonces deviennent moins pertinentes, et rien d’autre ne change.',
      ],
    },
    m('suggestions'),
    m('flammes'),
    m('sources'),
    m('version'),
  ],
};

/**
 * Valide ce qui arrive du fichier. Un back office se trompe, et un onglet
 * Infos cassé est pire qu'un onglet Infos figé : on retombe alors sur le
 * repli plutôt que d'afficher une page blanche.
 */
export function lireInfos(brut: unknown): Infos {
  const blocs = (brut as Infos)?.blocs;
  if (!Array.isArray(blocs) || !blocs.length) return INFOS_PAR_DEFAUT;

  const propres = blocs.filter((b): b is Bloc => {
    if (!b || typeof b !== 'object' || b.actif === false) return false;
    if (b.type === 'module') return typeof (b as BlocModule).module === 'string';
    if (b.type === 'texte') {
      return typeof (b as BlocTexte).titre === 'string'
        && Array.isArray((b as BlocTexte).paragraphes);
    }
    return false;
  });

  return propres.length ? { blocs: propres } : INFOS_PAR_DEFAUT;
}
