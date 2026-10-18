# Mettre les données en ligne avec GitHub — pas à pas

> **C'est fait.** Le dépôt `DrMatteww/vtc-idf` est en place, les deux clés sont
> dans les secrets, l'Action tourne et les données sont publiées sur
> **https://drmatteww.github.io/vtc-idf/data/**. Tu n'as rien à refaire : ce
> guide reste là pour comprendre ce qui tourne, et pour les fois où tu voudras
> y toucher — modifier un référentiel, relancer une mise à jour, lire un
> journal d'exécution.
>
> Les trois endroits à connaître :
>
> - **Actions** → l'onglet qui montre les exécutions, et le bouton
>   *Run workflow* pour en forcer une ;
> - **vtc-app/scripts/sources/** → tes référentiels : `astuces.csv`,
>   `evenements.csv`, `manger.csv` ;
> - **Settings → Secrets** → tes deux clés, si tu les renouvelles un jour.

Tu n'as jamais utilisé GitHub : ce guide suppose exactement ça. Compte une
demi-heure la première fois. À la fin, tu auras une adresse comme

    https://tonpseudo.github.io/vtc-idf/data/brief.json

que tu colleras dans les quatre sections GoodBarber, et les données se
régénéreront **toutes les heures, toutes seules**, sans que tu aies à ouvrir
quoi que ce soit.

---

## Ce que GitHub va faire pour toi

Trois choses, et c'est tout :

1. **Garder le code** — les scripts qui vont chercher les trains, les vols, les
   événements et les fermetures.
2. **Les exécuter toutes les heures**, gratuitement, sur leurs machines. C'est
   ce qu'on appelle une *Action*.
3. **Publier les fichiers produits** à une adresse publique, que l'application
   va lire. C'est ce qu'on appelle *Pages*.

Tu n'as rien à laisser allumé chez toi.

---

## 1. Créer le compte

Sur **github.com**, bouton *Sign up*. Adresse e-mail, mot de passe, nom
d'utilisateur — **ce nom apparaîtra dans l'adresse de tes données**, choisis-le
court et sans accent. Le plan gratuit suffit pour tout ce qui suit.

Confirme l'e-mail qu'ils t'envoient, sinon rien ne marchera à l'étape 5.

## 2. Créer le dépôt

Un « dépôt » (*repository*), c'est un dossier de projet.

En haut à droite, le **+** puis *New repository*.

| Champ | Ce que tu mets |
|---|---|
| Repository name | `vtc-idf` |
| Description | *(laisse vide)* |
| **Public / Private** | **Public** — obligatoire |
| Add a README file | **décoché** |

> **Pourquoi public ?** Sur le plan gratuit, la publication de fichiers (Pages)
> ne fonctionne **que** sur un dépôt public. Ce n'est pas un problème ici : les
> données sont déjà publiques (horaires SNCF, programmes de salles, fermetures
> de la DiRIF), et **tes deux clés n'iront jamais dans le dépôt** — elles vont
> dans un coffre séparé, à l'étape 4.

Puis *Create repository*.

## 3. Envoyer les fichiers

J'ai préparé un dossier propre sur ton Bureau : **`vtc-github`**. Il contient le
dossier `vtc-app` et rien d'inutile.

Sur la page du dépôt vide, clique **uploading an existing file** (ou
*Add file → Upload files*).

**a) Le dossier de l'application.** Ouvre le Finder, et fais glisser le dossier
**`vtc-app`** (celui qui est dans `vtc-github`) dans la zone de la page. GitHub
affiche la liste des fichiers au fur et à mesure — il y en a une centaine,
laisse-le finir. En bas, bouton vert **Commit changes**.

**b) Le fichier qui déclenche tout.** Il est dans un dossier que le Finder
cache, alors on va l'écrire directement sur GitHub. Sur la page du dépôt :
*Add file* → **Create new file**. Dans la case du nom, tape exactement :

    .github/workflows/vtc-data.yml

(les barres obliques créent les dossiers toutes seules). Dans la grande zone en
dessous, colle **tout** le contenu du fichier **`vtc-data.yml`**, qui est à la
racine du dossier `vtc-github` sur ton Bureau — ouvre-le avec TextEdit, Cmd+A,
Cmd+C. Puis **Commit changes**.

> Le nom doit être au caractère près, point du début compris. S'il est faux,
> l'onglet *Actions* de l'étape 5 restera désespérément vide.

## 4. Mettre les deux clés à l'abri

*Settings* (en haut du dépôt) → dans la colonne de gauche, *Secrets and
variables* → **Actions** → bouton **New repository secret**.

Deux secrets, un par clé :

| Name | Secret |
|---|---|
| `SNCF_TOKEN` | ta clé SNCF |
| `TICKETMASTER_KEY` | ta clé Ticketmaster (la *Consumer Key*) |

Le nom doit être écrit exactement comme ci-dessus, en majuscules. Une fois
enregistrée, une clé ne peut plus être relue, même par toi — c'est normal, et
c'est le but. Tu peux la remplacer à tout moment.

> Si tu sautes cette étape, tout fonctionne quand même : les trains passent en
> horaire théorique et les concerts disparaissent. Rien ne casse.

## 5. Lancer une première fois

Onglet **Actions**. GitHub demande peut-être de confirmer que tu veux activer
les Actions : *I understand my workflows, go ahead and enable them*.

Dans la colonne de gauche, clique **Données VTC**, puis à droite le bouton
**Run workflow** → **Run workflow**.

Une ligne apparaît avec un rond orange qui tourne. Trois à cinq minutes la
première fois (elle télécharge le programme des vols). Clique dessus pour voir
le détail si tu veux : chaque étape se déplie.

- **Rond vert** → c'est passé.
- **Croix rouge** → clique sur l'étape rouge, le message d'erreur est en bas.
  Envoie-le-moi, je saurai.

## 6. Ouvrir la publication

L'exécution vient de créer une branche nommée `gh-pages`. Il reste à dire à
GitHub de la servir.

*Settings* → colonne de gauche, **Pages** :

- **Source** : *Deploy from a branch*
- **Branch** : `gh-pages`, dossier `/ (root)`
- **Save**

Attends une ou deux minutes. La page affiche alors en haut :
*Your site is live at https://tonpseudo.github.io/vtc-idf/*

## 7. Vérifier

Dans ton navigateur, ouvre :

    https://tonpseudo.github.io/vtc-idf/data/brief.json

Tu dois voir un long texte qui commence par `{"generated_at":"2026-...`. C'est
laid, c'est normal, c'est le fichier que l'application lit.

Si tu as une page **404**, c'est que l'étape 5 ou 6 n'est pas terminée. Attends
deux minutes et recharge.

## 8. Brancher l'application

Dans **chacune** des quatre sections GoodBarber, la ligne tout en haut :

```html
<script>window.__VTC_BASE = 'https://tonpseudo.github.io/vtc-idf/data/';</script>
```

Remplace `tonpseudo` par ton nom d'utilisateur. **Garde le slash final**, sinon
l'adresse des fichiers est fausse.

C'est fini. À partir de maintenant, l'Action tourne toute seule toutes les
heures et republie le brief ; les lieux se régénèrent le lundi matin.

---

## Quand quelque chose cloche

| Ce que tu vois | Ce que c'est |
|---|---|
| L'onglet *Actions* est vide | Le fichier `.github/workflows/vtc-data.yml` est mal nommé ou mal placé. Recommence l'étape 3b. |
| Croix rouge, **exit code 2** | Python n'a pas trouvé son script : les fichiers ne sont pas là où l'Action les cherche. Voir juste en dessous. |
| Croix rouge, autre message | Ouvre l'étape rouge, lis les dernières lignes. Envoie-les-moi. |
| 404 sur l'adresse du JSON | Pages n'est pas configuré (étape 6), ou la branche `gh-pages` n'existe pas encore (l'étape 5 n'a pas abouti). |
| L'app dit « Pas de connexion » | L'adresse dans `window.__VTC_BASE` est fausse. Vérifie le slash final, et ouvre l'adresse dans un navigateur pour comparer. |
| Les trains sont là mais pas les concerts | Le secret `TICKETMASTER_KEY` manque ou son nom est mal orthographié. |
| Les toilettes ou les fast-foods manquent | Les miroirs OpenStreetMap sont tenus par des bénévoles et refusent parfois une grosse requête. Le script en essaie cinq, puis ressert sa dernière réponse connue — sauf la toute première fois, où il n'en a pas. Relance *Run workflow* un peu plus tard. |
| L'heure de mise à jour ne bouge plus | Regarde l'onglet *Actions* : GitHub met en pause les exécutions programmées d'un dépôt resté **60 jours sans activité**. Un clic sur *Run workflow* les réveille. |

### « exit code 2 » : une histoire de chemin

C'est l'erreur la plus courante du premier envoi, et elle n'a rien à voir avec
le code. Quand on fait glisser **le contenu** d'un dossier au lieu du dossier
lui-même, les fichiers arrivent à la racine du dépôt : l'Action cherche
`vtc-app/scripts/build_data.py`, ne trouve rien, et Python s'arrête avec le
code 2.

**Comment savoir** : ouvre la page d'accueil de ton dépôt.

- Tu vois un seul dossier **`vtc-app`** → c'est la bonne disposition.
- Tu vois **`cdn`**, **`goodbarber`**, **`preview`**, **`scripts`** côte à côte
  → le contenu est arrivé à la racine.

**Les deux fonctionnent désormais** : l'Action regarde où sont les fichiers au
lieu de le supposer. Il suffit de remplacer le fichier d'automatisation par sa
nouvelle version :

1. dans ton dépôt, ouvre `.github/workflows/vtc-data.yml` ;
2. clique l'icône **crayon** en haut à droite ;
3. sélectionne tout (Cmd+A) et colle le nouveau contenu ;
4. **Commit changes**, puis *Actions* → **Run workflow**.

La première étape s'appelle maintenant *Trouver l'application* et écrit dans le
journal où elle a trouvé les fichiers.

### Lire un journal d'exécution

Onglet *Actions* → clique l'exécution en rouge → clique **build** à gauche. Les
étapes se déplient une par une ; celle qui porte la croix rouge contient le
message. Les dernières lignes avant « Process completed » sont les seules qui
comptent — c'est ça qu'il faut m'envoyer.

## Changer quelque chose plus tard

Pour modifier un fichier : clique dessus dans le dépôt, puis l'icône **crayon**
en haut à droite, édite, *Commit changes*. Pour en remplacer un en entier :
*Add file → Upload files* et redépose-le, GitHub écrase l'ancien.

Les fichiers que tu toucheras le plus souvent sont les référentiels, dans
`vtc-app/scripts/sources/` — en particulier `astuces.csv` (ton carnet),
`evenements.csv` (les dates que les billetteries ne donnent pas) et
`manger.csv`. Après chaque modification, un clic sur *Run workflow* applique le
changement tout de suite au lieu d'attendre l'heure suivante.
