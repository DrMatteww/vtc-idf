import {
  Barlow_400Regular,
  Barlow_500Medium,
  Barlow_600SemiBold,
  Barlow_700Bold,
  useFonts,
} from '@expo-google-fonts/barlow';
import { DarkTheme, ThemeProvider } from 'expo-router';
import { NativeTabs } from 'expo-router/native-tabs';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { couleurs } from '@/ui/theme';

SplashScreen.preventAutoHideAsync();

/* Le thème de navigation. Il n'existe qu'en sombre : pas de bascule, pas de
   `useColorScheme`. Un écran blanc à 23h dans un habitacle éblouit et abîme
   la vision nocturne — c'est un choix de sécurité avant d'être esthétique.
   `userInterfaceStyle: "dark"` est verrouillé dans app.json pour la même
   raison : un chauffeur dont le téléphone est en mode clair ne doit pas
   recevoir cet écran-là en blanc. */
const themeSombre = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: couleurs.fond,
    card: couleurs.fond,
    text: couleurs.texte,
    border: couleurs.trait,
    primary: couleurs.accent,
  },
};

export default function Layout() {
  const [policesPretes, erreurPolices] = useFonts({
    Barlow_400Regular,
    Barlow_500Medium,
    Barlow_600SemiBold,
    Barlow_700Bold,
  });

  /* On n'attend pas les polices indéfiniment. Barlow est embarquée dans
     l'app, donc le cas est rare, mais s'il arrive on affiche l'écran avec la
     police système plutôt que de laisser le splash : du texte lisible tout
     de suite vaut mieux que la bonne police plus tard. C'est la même règle
     que le `display=swap` de la version WebView. */
  useEffect(() => {
    if (policesPretes || erreurPolices) SplashScreen.hideAsync();
  }, [policesPretes, erreurPolices]);

  if (!policesPretes && !erreurPolices) return null;

  return (
    <ThemeProvider value={themeSombre}>
      <StatusBar style="light" />
      <NativeTabs
        backgroundColor={couleurs.fond}
        iconColor={{ default: couleurs.texteMuet, selected: couleurs.accent }}
        labelStyle={{
          default: { color: couleurs.texteMuet },
          selected: { color: couleurs.accent },
        }}>
        <NativeTabs.Trigger name="index">
          <NativeTabs.Trigger.Icon sf="clock" md="schedule" />
          <NativeTabs.Trigger.Label>Brief</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>

        <NativeTabs.Trigger name="ou-aller">
          <NativeTabs.Trigger.Icon sf="mappin.and.ellipse" md="place" />
          <NativeTabs.Trigger.Label>Où aller</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>

        {/* « Route » et non « Sur la route » : une barre d'onglets native
            tronque au-delà de sept ou huit caractères, et un libellé coupé
            se lit moins bien qu'un libellé court. */}
        <NativeTabs.Trigger name="sur-la-route">
          <NativeTabs.Trigger.Icon sf="car" md="directions_car" />
          <NativeTabs.Trigger.Label>Route</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>

        <NativeTabs.Trigger name="infos">
          <NativeTabs.Trigger.Icon sf="info.circle" md="info" />
          <NativeTabs.Trigger.Label>Infos</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
      </NativeTabs>
    </ThemeProvider>
  );
}
