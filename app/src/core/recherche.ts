/* ==========================================================================
   Chercher un lieu par son nom ou sa ville.

   « Je veux un McDo » n'est pas la même question que « qu'est-ce qu'il y a
   autour de moi ». La recherche porte donc sur TOUTE la base, et le tri par
   distance fait le reste : le premier résultat est le plus proche, même s'il
   est à douze kilomètres.

   Personne n'écrit « McDonald's » au volant. On tape « mac do », parfois
   « macdo », et la recherche doit trouver. D'où deux choses : on écrase les
   accents, les majuscules et la ponctuation avant de comparer, et une petite
   table de raccourcis traduit ce qu'on dit en ce qui est écrit dans la base.
   Elle est courte exprès — elle couvre ce qu'un chauffeur tape vraiment, et
   chaque ligne a été vérifiée contre les noms réels des fiches.
   ========================================================================== */

/** Un mot qui commence par @ ne cherche pas un nom : il choisit une famille. */
const ALIAS: Record<string, string> = {
  macdo: 'mcdonald', macdos: 'mcdonald', macdonald: 'mcdonald',
  macdonalds: 'mcdonald', mcdo: 'mcdonald', mcdonalds: 'mcdonald',
  bk: 'burger king', burgerking: 'burger king',
  dominos: 'domino', otacos: "o'tacos", starbuck: 'starbucks',

  /* « grec » ne figure dans presque aucune enseigne, mais c'est le mot qu'on
     emploie — il doit ramener les sandwicheries. */
  grec: '@sandwich', grecs: '@sandwich', kebab: '@sandwich',
  kebabs: '@sandwich', tacos: '@sandwich', sandwich: '@sandwich',
  sandwicherie: '@sandwich', turc: '@sandwich', libanais: '@sandwich',
  pizza: '@pizza', pizzas: '@pizza', pizzeria: '@pizza',
  superette: '@super', supermarche: '@super', supermarches: '@super',
  epicerie: '@super', courses: '@super', alimentation: '@super',
  station: '@station', stations: '@station', essence: '@station',
  carburant: '@station', pompe: '@station', autoroute: '@station',
  autoroutes: '@station', aire: '@station', aires: '@station',
  chaine: '@chaine', chaines: '@chaine', fastfood: '@chaine',
};

export function sansAccent(s: string): string {
  return String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/['’`.\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

interface Cherchable {
  name?: string;
  address?: string;
  t?: string;
}

export function chercher<T extends Cherchable>(liste: T[], q: string): T[] {
  const t = sansAccent(q);
  if (!t) return liste ?? [];

  /* « mac do » en deux mots, « macdo » en un : on essaie d'abord la forme
     recollée, sinon mot à mot. */
  const colle = t.replace(/ /g, '');
  const mots = ALIAS[colle] ? [ALIAS[colle]] : t.split(' ').map((m) => ALIAS[m] ?? m);

  let famille: string | null = null;
  const termes: string[] = [];
  for (const m of mots) {
    if (m.startsWith('@')) famille = m.slice(1);
    else if (m) termes.push(sansAccent(m));
  }

  return (liste ?? []).filter((it) => {
    if (famille && (it.t ?? 'autre') !== famille) return false;
    if (!termes.length) return true;
    const foin = sansAccent((it.name ?? '') + ' ' + (it.address ?? ''));
    return termes.every((terme) => foin.includes(terme));
  });
}
