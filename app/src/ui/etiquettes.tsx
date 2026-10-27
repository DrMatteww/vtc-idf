import { StyleSheet, Text, View } from 'react-native';

import { flammes as niveau } from '@/core/demande';
import { couleurs, polices, rayons } from './theme';

/* ---- La note de demande ------------------------------------------------
   Détail de rendu qui compte sur fond sombre : c'est la DENSITÉ qui augmente
   avec l'intensité, pas l'obscurité — « plus foncé » se verrait moins.

   Les flammes gardent leur couleur alors que les autres émojis de l'app sont
   désaturés : ce n'est pas une icône, c'est une note.                      */
export function Flammes({ volume }: { volume: number | null | undefined }) {
  const n = niveau(volume);
  if (!n) return null;
  return (
    <View style={[s.tag, n === 2 && s.flam2, n === 3 && s.flam3]}>
      {/* letterSpacing négatif : les flammes se touchent, elles font bloc */}
      <Text style={s.flammes}>{'🔥'.repeat(n)}</Text>
    </View>
  );
}

export function Etiquette({ texte, ton }: { texte: string; ton?: 'ok' | 'alerte' }) {
  return (
    <View style={[s.tag, ton === 'ok' && s.ok, ton === 'alerte' && s.alerte]}>
      <Text
        style={[
          s.texte,
          ton === 'ok' && s.texteOk,
          ton === 'alerte' && s.texteAlerte,
        ]}>
        {texte}
      </Text>
    </View>
  );
}

/** Paris s'écrit « Paris », les autres par leur numéro. */
export function Departement({ dept }: { dept: string }) {
  return <Etiquette texte={dept === '75' ? 'Paris' : dept} />;
}

const s = StyleSheet.create({
  tag: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: couleurs.trait,
    borderRadius: rayons.petit,
    paddingHorizontal: 5,
    paddingVertical: 1,
    alignSelf: 'flex-start',
  },
  texte: {
    fontFamily: polices.demi,
    fontSize: 10,
    letterSpacing: 0.3,
    color: couleurs.texteAtenue,
  },
  flammes: { fontSize: 10, letterSpacing: -1, color: couleurs.texte },
  flam2: { borderColor: '#5E251E' },
  flam3: { borderColor: couleurs.alerte, backgroundColor: couleurs.alerteFond },
  ok: { borderColor: '#1C4A33' },
  texteOk: { color: couleurs.ok },
  alerte: { borderColor: couleurs.alerteTrait, backgroundColor: couleurs.alerteFond },
  texteAlerte: { color: '#FF8574' },
});
