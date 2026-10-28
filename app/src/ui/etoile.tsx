import { Pressable, StyleSheet, Text } from 'react-native';

import { usePrefs } from '@/reglages/preferences';
import { couleurs } from './theme';

/* L'étoile. Un bouton, pas un lien : elle ne doit JAMAIS ouvrir le GPS par
   erreur. La liste reste sur le téléphone et nulle part ailleurs. */
export function Etoile({ id }: { id: string }) {
  const favoris = usePrefs((e) => e.favoris);
  const bascule = usePrefs((e) => e.basculeFavori);
  const on = favoris.includes(String(id));

  return (
    <Pressable
      onPress={() => bascule(id)}
      hitSlop={14}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      accessibilityLabel={on ? 'Retirer des favoris' : 'Garder en favori'}
      style={s.zone}>
      <Text style={[s.etoile, on && s.pleine]}>{on ? '★' : '☆'}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  zone: { paddingHorizontal: 2, justifyContent: 'center' },
  etoile: { fontSize: 18, color: couleurs.texteMuet },
  pleine: { color: couleurs.texte },
});
