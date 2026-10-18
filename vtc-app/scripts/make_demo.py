#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Écrit un brief.json de démonstration, avec des horaires calés sur l'heure
courante : l'écran est donc toujours pertinent au moment où on l'ouvre.

    python3 scripts/make_demo.py --out cdn/data

Sert à juger le design et à tester l'intégration GoodBarber avant d'avoir
une clé SNCF. Le vrai build_data.py écrase ce fichier.
"""

import argparse
import json
import os
from datetime import datetime, timedelta, timezone

TZ = timezone(timedelta(hours=2))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="cdn/data")
    args = ap.parse_args()

    now = datetime.now(TZ)

    def at(minutes):
        return (now + timedelta(minutes=minutes)).replace(second=0, microsecond=0).isoformat()

    demand = [
        {"id": "demo-1", "kind": "train", "title": "4 arrivées grandes lignes — Bordeaux, Rennes, Nantes",
         "venue": "Gare Montparnasse", "dept": "75", "lat": 48.8413, "lon": 2.3200,
         "start": at(42), "end": at(72), "count": 4, "volume": 1200},

        {"id": "demo-2", "kind": "concert", "title": "Concert — sortie de salle",
         "venue": "Accor Arena", "dept": "75", "lat": 48.8386, "lon": 2.3787,
         "start": at(135), "end": None, "volume": 2400},

        {"id": "demo-3", "kind": "train", "title": "3 arrivées grandes lignes — Lyon, Marseille",
         "venue": "Gare de Lyon", "dept": "75", "lat": 48.8443, "lon": 2.3744,
         "start": at(88), "end": at(110), "count": 3, "volume": 900},

        {"id": "demo-4", "kind": "salon", "title": "Fermeture du salon",
         "venue": "Paris Expo Porte de Versailles", "dept": "75", "lat": 48.8323, "lon": 2.2875,
         "start": at(200), "end": None, "volume": 4800},

        {"id": "demo-5", "kind": "sport", "title": "Match — coup de sifflet final",
         "venue": "Paris La Défense Arena", "dept": "92", "lat": 48.8958, "lon": 2.2286,
         "start": at(260), "end": None, "volume": 4800},

        {"id": "demo-6", "kind": "flight", "title": "6 arrivées long-courrier",
         "venue": "Roissy CDG — Terminal 2E", "dept": "93", "lat": 49.0043, "lon": 2.5709,
         "start": at(310), "end": at(355), "count": 6, "volume": 1500},
    ]

    closures = [
        {"id": "demo-cl1", "title": "A86 fermée vers Créteil",
         "detail": "Entre Thiais et la sortie 25, déviation par la N186",
         "dept": "94", "days": "lun-ven",
         "from": now.replace(hour=21, minute=0, second=0, microsecond=0).isoformat(),
         "to": (now.replace(hour=5, minute=0, second=0, microsecond=0)
                + timedelta(days=1)).isoformat()},
        {"id": "demo-cl2", "title": "Tunnel de Saint-Cloud fermé",
         "detail": "Sens province-Paris, travaux de nuit",
         "dept": "92", "days": "lun-ven",
         "from": now.replace(hour=21, minute=30, second=0, microsecond=0).isoformat(),
         "to": (now.replace(hour=5, minute=0, second=0, microsecond=0)
                + timedelta(days=1)).isoformat()},
    ]

    os.makedirs(args.out, exist_ok=True)
    path = os.path.join(args.out, "brief.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump({"generated_at": now.replace(second=0, microsecond=0).isoformat(),
                   "demo": True, "demand": demand, "closures": closures},
                  f, ensure_ascii=False, separators=(",", ":"))
    print("brief.json de démo écrit dans %s" % path)


if __name__ == "__main__":
    main()
