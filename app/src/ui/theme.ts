/* ==========================================================================
   Le système de design, transposé d'app.css.
   Les valeurs sont celles de la WebView, aux mêmes pixels : elles ont été
   réglées dans un habitacle de nuit, pas dans un navigateur, et ce contexte
   n'a pas changé. Les justifications sont dans
   passation/01-le-produit.md § 1.6.
   ========================================================================== */

export const couleurs = {
  /* Fonds — gris neutres. Pas de noir pur : sur OLED, le défilement bave. */
  fond: '#0A0A0B',
  surface: '#121214',
  surface2: '#1B1B1F',
  trait: '#2A2A31',
  traitDoux: '#1E1E23',

  /* Textes */
  texte: '#F4F4F5',
  texteAtenue: '#9A9AA3',
  texteMuet: '#63636C',

  /* Sémantique — trois couleurs, trois significations, rien d'autre.
     Une interface qui a six couleurs n'en a aucune. */
  accent: '#FFFFFF', // action : c'est ici qu'on appuie
  accentEncre: '#0A0A0B',
  alerte: '#FF4433', // fermeture, forte demande : le seul rouge
  alerteFond: '#2B100C',
  alerteTrait: '#5A1F18',
  ok: '#35D07F', // ouvert, disponible
  okFond: '#0D2418',
} as const;

export const rayons = {
  carte: 3, // des angles vifs : un instrument de travail a des arêtes
  petit: 2,
} as const;

/* Au-delà, le texte s'étire et devient pénible à lire. Relevé sur un iPhone
   pliable, où la barre d'onglets native devient un rail vertical à droite et
   où le contenu occupait toute la largeur : les lignes faisaient le double
   d'une longueur lisible, et le rail recouvrait les boutons de droite.

   Sur un téléphone ordinaire cette limite ne se voit pas — la largeur est
   déjà inférieure. */
export const LARGEUR_MAX = 620;

export const espaces = {
  pad: 16,
  /* Cible tactile minimale : on tape au pouce, d'une main, parfois en
     roulant au pas. En natif, on l'obtient par hitSlop plutôt que par des
     marges, pour ne pas déformer la mise en page. */
  tap: 48,
} as const;

/* Les familles chargées par expo-font dans _layout.tsx. Barlow est un
   grotesque dessiné d'après la signalisation routière. */
export const polices = {
  normal: 'Barlow_400Regular',
  moyen: 'Barlow_500Medium',
  demi: 'Barlow_600SemiBold',
  gras: 'Barlow_700Bold',
} as const;

/* L'échelle typographique, reprise d'app.css. C'est la TYPOGRAPHIE qui fait
   la hiérarchie, pas la couleur. Les chiffres sont les stars : partout où une
   heure s'affiche, `tabulaire` doit être appliqué. */
export const typo = {
  titre: { fontFamily: polices.gras, fontSize: 27, letterSpacing: -0.4 },
  sousTitre: { fontFamily: polices.moyen, fontSize: 13, letterSpacing: 0.1 },
  etiquette: { fontFamily: polices.gras, fontSize: 11, letterSpacing: 1.4 },
  carteTitre: { fontFamily: polices.demi, fontSize: 19, letterSpacing: -0.2 },
  carteSous: { fontFamily: polices.normal, fontSize: 14 },
  heureGeante: { fontFamily: polices.gras, fontSize: 38, letterSpacing: -1.2 },
  heure: { fontFamily: polices.demi, fontSize: 17, letterSpacing: -0.3 },
  ligneTitre: { fontFamily: polices.demi, fontSize: 15, letterSpacing: -0.1 },
  ligneSous: { fontFamily: polices.normal, fontSize: 12.5 },
  corps: { fontFamily: polices.normal, fontSize: 16 }, // jamais en dessous
  petit: { fontFamily: polices.moyen, fontSize: 13 },
} as const;

/* À appliquer sur TOUT ce qui est un chiffre : les heures s'alignent en
   colonne et ne dansent pas quand elles changent. */
export const tabulaire = { fontVariant: ['tabular-nums' as const] };
