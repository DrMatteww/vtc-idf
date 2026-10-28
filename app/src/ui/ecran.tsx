import { ReactNode } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { BarreTitre } from './barre-titre';
import { couleurs, espaces, typo } from './theme';

interface Props {
  titre: string;
  sousTitre?: ReactNode;
  /** Le brief tient sans défilement — lui seul passe `fixe`. */
  fixe?: boolean;
  aDroite?: ReactNode;
  /** Fournir ces deux-là active « tirer pour recharger ». */
  onRafraichir?: () => void;
  rafraichit?: boolean;
  children?: ReactNode;
}

/* L'en-tête commun aux quatre onglets : la marque, le titre, la date, et le
   coin haut droit (la météo sur le brief). Le fond est posé ici et nulle part
   ailleurs, pour qu'aucun écran ne puisse apparaître clair. */
export function Ecran({
  titre, sousTitre, fixe, aDroite, onRafraichir, rafraichit, children,
}: Props) {
  /* La barre d'onglets est native et FLOTTE au-dessus du contenu : sans
     réserve en bas, la dernière ligne d'un écran long passe dessous et il
     faut remonter au doigt pour la lire. On réserve sa hauteur plus la zone
     sûre du téléphone. */
  const insets = useSafeAreaInsets();
  const basDePage = { paddingBottom: insets.bottom + HAUTEUR_ONGLETS };
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

  /* Même sur le brief, qui tient sans défilement, on utilise un ScrollView :
     c'est ce qui permet de TIRER POUR RECHARGER. Un chauffeur ne doit pas
     avoir à fermer et rouvrir l'application pour savoir ce qui a changé. */
  return (
    <SafeAreaView style={s.fond} edges={['top']}>
      <BarreTitre />
      <ScrollView
        style={s.corps}
        contentContainerStyle={[fixe ? s.fixe : s.defilant, basDePage]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          onRafraichir ? (
            <RefreshControl
              refreshing={!!rafraichit}
              onRefresh={onRafraichir}
              tintColor={couleurs.texteAtenue}
              colors={[couleurs.accent]}
              progressBackgroundColor={couleurs.surface}
            />
          ) : undefined
        }>
        {entete}
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

/* Hauteur d'une barre d'onglets native, iOS comme Android. */
export const HAUTEUR_ONGLETS = 64;

const s = StyleSheet.create({
  fond: { flex: 1, backgroundColor: couleurs.fond },
  corps: { flex: 1 },
  defilant: {},
  fixe: { flexGrow: 1 },
  topbar: {
    paddingHorizontal: espaces.pad,
    paddingTop: 16,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  titres: { flex: 1 },
  titre: { ...typo.titre, color: couleurs.texte },
  sousTitre: { ...typo.sousTitre, color: couleurs.texteAtenue, marginTop: 2 },
});
