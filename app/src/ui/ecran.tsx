import { ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { couleurs, espaces, typo } from './theme';

interface Props {
  titre: string;
  sousTitre?: ReactNode;
  /** Le brief tient sans défilement — lui seul passe `fixe`. */
  fixe?: boolean;
  aDroite?: ReactNode;
  children?: ReactNode;
}

/* L'en-tête commun aux quatre onglets : le titre, la date, et le coin haut
   droit (la météo sur le brief). Le fond est posé ici et nulle part ailleurs,
   pour qu'aucun écran ne puisse apparaître clair. */
export function Ecran({ titre, sousTitre, fixe, aDroite, children }: Props) {
  const entete = (
    <View style={s.topbar}>
      <View style={s.titres}>
        <Text style={s.titre}>{titre}</Text>
        {typeof sousTitre === 'string' ? (
          <Text style={s.sousTitre}>{sousTitre}</Text>
        ) : (
          sousTitre
        )}
      </View>
      {aDroite}
    </View>
  );

  return (
    <SafeAreaView style={s.fond} edges={['top']}>
      {fixe ? (
        <View style={s.corps}>
          {entete}
          {children}
        </View>
      ) : (
        <ScrollView
          style={s.corps}
          contentContainerStyle={s.defilant}
          showsVerticalScrollIndicator={false}>
          {entete}
          {children}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  fond: { flex: 1, backgroundColor: couleurs.fond },
  corps: { flex: 1 },
  defilant: { paddingBottom: 24 },
  topbar: {
    paddingHorizontal: espaces.pad,
    paddingTop: 20,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  titres: { flex: 1 },
  titre: { ...typo.titre, color: couleurs.texte },
  sousTitre: { ...typo.sousTitre, color: couleurs.texteAtenue, marginTop: 2 },
});
