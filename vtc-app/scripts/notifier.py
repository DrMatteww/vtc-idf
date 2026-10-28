#!/usr/bin/env python3
"""Envoie une notification à un SUJET Firebase.

Pourquoi un sujet et pas une liste d'appareils : l'application s'abonne
elle-même à « tous » et à « dept-XX ». Nous n'avons donc aucun jeton
d'appareil à conserver, aucune base d'utilisateurs, et personne à ficher.
On publie vers un sujet ; qui l'écoute ne nous regarde pas.

La clé de service vit dans les secrets de la CI (FCM_SERVICE_ACCOUNT) et
n'entre jamais ni dans l'application — décompilable une fois publiée — ni
dans la page du back office, qui est publique.

Sans la clé, le script tourne À BLANC et écrit ce qu'il aurait envoyé : on
peut donc câbler et vérifier tout le reste avant d'avoir un projet Firebase.
"""

import argparse
import json
import os
import sys
import urllib.error
import urllib.request

FCM = "https://fcm.googleapis.com/v1/projects/{projet}/messages:send"
PORTEE = "https://www.googleapis.com/auth/firebase.messaging"

# Les seuls sujets auxquels l'application s'abonne. Un sujet mal orthographié
# ne provoque aucune erreur côté Firebase — il crée un sujet vide, et la
# notification part dans le vide sans que personne ne le sache. D'où la liste.
SUJETS = ["tous"] + ["dept-" + d for d in ("75", "77", "78", "91", "92", "93", "94", "95")]


def jeton_acces(cle: dict) -> str:
    """Échange la clé de service contre un jeton OAuth2."""
    try:
        from google.oauth2 import service_account  # type: ignore
        from google.auth.transport.requests import Request  # type: ignore
    except ImportError:
        print(
            "google-auth manque. Dans la CI : pip install google-auth.\n"
            "Le script n'en dépend que pour signer le jeton ; build_data.py, lui,\n"
            "reste sans aucune dépendance.",
            file=sys.stderr,
        )
        raise SystemExit(2)

    creds = service_account.Credentials.from_service_account_info(cle, scopes=[PORTEE])
    creds.refresh(Request())
    return creds.token


def envoyer(cle: dict, sujet: str, titre: str, message: str) -> None:
    corps = {
        "message": {
            "topic": sujet,
            "notification": {"title": titre, "body": message},
            "android": {"priority": "HIGH"},
            "apns": {"headers": {"apns-priority": "10"}},
        }
    }
    req = urllib.request.Request(
        FCM.format(projet=cle["project_id"]),
        data=json.dumps(corps).encode("utf-8"),
        headers={
            "Authorization": "Bearer " + jeton_acces(cle),
            "Content-Type": "application/json; charset=UTF-8",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            print("Envoyé :", json.loads(r.read().decode("utf-8")).get("name", "?"))
    except urllib.error.HTTPError as e:
        print("Refus de Firebase :", e.read().decode("utf-8", "replace"), file=sys.stderr)
        raise SystemExit(1)


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--sujet", required=True)
    p.add_argument("--titre", required=True)
    p.add_argument("--message", required=True)
    a = p.parse_args()

    if a.sujet not in SUJETS:
        print("Sujet inconnu : %r. Connus : %s" % (a.sujet, ", ".join(SUJETS)), file=sys.stderr)
        raise SystemExit(2)

    # Une notification ne se rattrape pas : on coupe ce qui dépasserait au
    # lieu de laisser le système tronquer n'importe où.
    titre = a.titre.strip()[:60]
    message = a.message.strip()[:180]
    if not titre or not message:
        print("Titre et message sont obligatoires.", file=sys.stderr)
        raise SystemExit(2)

    brut = os.environ.get("FCM_SERVICE_ACCOUNT", "").strip()
    if not brut:
        print("── ESSAI À BLANC (FCM_SERVICE_ACCOUNT absent) ──")
        print("  sujet   :", a.sujet)
        print("  titre   :", titre)
        print("  message :", message)
        print("Rien n'a été envoyé. Ajoute le secret pour que ce soit réel.")
        return

    envoyer(json.loads(brut), a.sujet, titre, message)


if __name__ == "__main__":
    main()
