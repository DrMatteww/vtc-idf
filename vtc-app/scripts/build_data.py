#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Génère les fichiers JSON consommés par l'appli VTC IDF.

    python3 scripts/build_data.py --out cdn/data

Sorties :
    brief.json    — demande (trains, vols, événements) + fermetures → chaque heure
    lieux.json    — toilettes, zones de pause, manger           → une fois par semaine
    zones.json    — centre des communes d'IDF (détection du département)

Aucune dépendance externe : stdlib seulement, pour tourner dans une GitHub
Action sans étape d'installation. Une source indisponible est signalée et
ignorée ; les autres sont quand même écrites.

Variables d'environnement :
    SNCF_TOKEN   clé gratuite obtenue sur https://numerique.sncf.com/startup/api/
                 (sans elle, les trains sont simplement absents du brief)

    TICKETMASTER_KEY  Consumer Key gratuite de developer.ticketmaster.com
                      (sans elle, la billetterie est absente du brief ; les
                      agendas ouverts et les matchs restent là)

Les vols, les agendas d'événements et les matchs n'ont besoin d'aucune clé :
ils viennent de data.gouv.fr, d'opendata.paris.fr, du miroir OpenDataSoft
d'OpenAgenda et d'openfootball, tous en accès libre. Voir le README pour ce
qu'ils couvrent réellement — et surtout ce qu'ils ne couvrent pas.
"""

import argparse
import csv
import gzip
import io
import json
import os
import re
import sys
from html.parser import HTMLParser
import unicodedata
import urllib.error
import urllib.parse
import time
import urllib.request
import xml.etree.ElementTree as ET
import zipfile
from datetime import datetime, timedelta, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
SOURCES = os.path.join(HERE, "sources")


def paris_tz_at(when):
    """Fuseau de Paris à une date donnée. On applique la règle européenne
    (heure d'été du dernier dimanche de mars au dernier dimanche d'octobre)
    plutôt que d'exiger le paquet tzdata, que la stdlib n'embarque pas
    partout. C'est ce qui permet de dater correctement une sortie de concert
    ou une arrivée de vol située après le changement d'heure."""
    def last_sunday(year, month):
        d = datetime(year, month, 31)
        return d - timedelta(days=(d.weekday() + 1) % 7)
    naive = when.replace(tzinfo=None)
    start = last_sunday(naive.year, 3) + timedelta(hours=2)    # 01:00 UTC
    end = last_sunday(naive.year, 10) + timedelta(hours=3)     # 01:00 UTC
    return timezone(timedelta(hours=2 if start <= naive < end else 1))


# Fuseau courant, recalculé à chaque exécution : le script tourne toutes les
# heures, il ne traverse donc jamais un changement d'heure en cours de route.
PARIS_TZ = paris_tz_at(datetime.now(timezone.utc) + timedelta(hours=1))

UA = "vtc-idf-builder/1.0 (+contact@example.com)"

# Un RER bondé n'amène pas de clients VTC : il y a du métro en face. On ne
# garde que les grandes lignes, et on estime le nombre de places par marque.
#
# Cette table a été refaite à partir de ce que l'API renvoie VRAIMENT, et pas
# de ce qu'on croyait. L'ancienne version attendait « TER » et « INTERCITES » :
# la SNCF ne renvoie plus rien de tel, chaque région ayant sa marque — TER HDF,
# Rémi, Fluo, MOBIGO, NOMAD, Aléop — qui sont toutes du train régional, donc
# écartées. Pour la revérifier un jour :
#
#   curl -H "Authorization: TA_CLE" \
#     "https://api.sncf.com/v1/coverage/sncf/stop_areas/STOP_AREA/arrivals?count=200&duration=43200" \
#     | grep -o '"commercial_mode":"[^"]*"' | sort | uniq -c
#
# « additional service » est le libellé sans marque des Eurostar et ex-Thalys
# gare du Nord : numéros 9000 à 9499, vérifié.
TRAIN_MODES = {
    "TGV INOUI": 510,
    "OUIGO": 1200,
    "OUIGO Train Classique": 800,
    "TGV Lyria": 500,
    "DB SNCF": 450,              # Paris-Est ↔ Allemagne
    "Eurostar": 900,
    "additional service": 500,
    "Intercités": 400,
    "Intercités de nuit": 350,
    "NOMAD RÉSA": 400,           # Paris-Normandie, réservation obligatoire
}

# Exclus côté serveur, et c'est indispensable : l'API renvoie les arrivées dans
# l'ordre chronologique, sans trier. Gare de Lyon, 177 des 200 premières sont
# des RER — sans cette exclusion on ne voyait que les trois premières heures de
# la fenêtre, et treize TGV au lieu de cinquante-deux.
FORBIDDEN_MODES = [
    "physical_mode:RapidTransit",   # RER
    "physical_mode:LocalTrain",     # Transilien
    "physical_mode:Metro",
    "physical_mode:Tramway",
    "physical_mode:Bus",
    "physical_mode:Coach",
]

# --- De « gens qui sortent » à « courses » --------------------------------
# Le chiffre affiché dans l'application est un nombre de COURSES, pas un
# nombre de personnes : c'est la seule unité qu'un chauffeur peut comparer à
# sa soirée. On l'obtient en deux temps, écrits séparément pour qu'on puisse
# discuter chaque hypothèse sans toucher à l'autre.
#
# 1. combien de personnes sortent vraiment — propre à chaque source, plus bas ;
# 2. combien de courses ça fait, avec les deux taux ci-dessous.
#
# Ces chiffres restent des ORDRES DE GRANDEUR. Ils servent à comparer deux
# créneaux entre eux, jamais à promettre un chiffre d'affaires : la moitié de
# ces courses partira chez un confrère, en taxi ou en VTC d'une autre plateforme.
VTC_TAKE_RATE = 0.08      # part qui commande une voiture plutôt que le métro,
                          # le RER, un proche ou un bus
PEOPLE_PER_RIDE = 1.5     # on monte rarement seul, rarement à quatre

# Part des places d'un train dont les occupants descendent et quittent la gare.
TRAIN_EXIT_SHARE = 0.6

# Part de la jauge d'une salle qui sort à la fin. Une ligne saisie à la main
# désigne un vrai événement complet ; une ligne reprise d'un agenda peut
# n'occuper qu'un hall du parc des expositions, d'où la prudence.
HALL_EXIT_SURE = 0.85
HALL_EXIT_AUTO = 0.50


def rides(people):
    """Personnes qui sortent → courses, arrondi à l'entier."""
    return int(round(people * VTC_TAKE_RATE / PEOPLE_PER_RIDE))

# Largeur des tranches de la timeline, en heures. Un chauffeur ne raisonne pas
# en demi-heures : il décide où il passe sa soirée. Une ligne par gare et par
# tranche de deux heures — « Gare de Lyon, 20 h → 22 h, 11 arrivées » — se lit
# d'un coup d'œil, là où le découpage fin produisait une cinquantaine de lignes
# dont beaucoup à un seul train.
BAND_HOURS = 2


def band(dt):
    """Début de la tranche qui contient dt (20 h 47 → 20 h, 21 h 12 → 20 h)."""
    return dt.replace(hour=(dt.hour // BAND_HOURS) * BAND_HOURS,
                      minute=0, second=0, microsecond=0)


def band_end(slot):
    return slot + timedelta(hours=BAND_HOURS)


def log(msg):
    sys.stderr.write(msg + "\n")


def http_json(url, headers=None, timeout=30):
    """Certaines API (Opendatasoft) répondent en gzip même sans qu'on le
    demande : on décompresse si nécessaire plutôt que de planter."""
    req = urllib.request.Request(url, headers=dict(headers or {}, **{"User-Agent": UA}))
    with urllib.request.urlopen(req, timeout=timeout) as r:
        raw = r.read()
        if r.headers.get("Content-Encoding") == "gzip" or raw[:2] == b"\x1f\x8b":
            raw = gzip.GzipFile(fileobj=io.BytesIO(raw)).read()
    return json.loads(raw.decode("utf-8"))


def read_csv(name):
    path = os.path.join(SOURCES, name)
    if not os.path.exists(path):
        log("  ! %s absent" % name)
        return []
    with open(path, newline="", encoding="utf-8") as f:
        rows = [r for r in csv.DictReader(f, delimiter=";")
                if r.get("actif", "1").strip() not in ("0", "non", "")]
    return rows


def iso(dt):
    return dt.replace(microsecond=0).isoformat()


# --------------------------------------------------------------------------
# Trains
# --------------------------------------------------------------------------

def navitia(path, params, token):
    url = "https://api.sncf.com/v1/" + path + "?" + urllib.parse.urlencode(params, doseq=True)
    return http_json(url, headers={"Authorization": token})


def fetch_trains(token, hours=12):
    """Arrivées grandes lignes dans les gares franciliennes, regroupées par
    gare et par créneau de 30 minutes : « Montparnasse, 4 arrivées entre
    22h40 et 23h10 » est lisible ; quarante lignes de TGV ne le sont pas."""
    gares = read_csv("gares.csv")
    if not gares:
        return []

    now = datetime.now(PARIS_TZ)
    frm = now.strftime("%Y%m%dT%H%M%S")
    raw = []

    for g in gares:
        try:
            res = navitia(
                "coverage/sncf/stop_areas/%s/arrivals" % g["stop_area"],
                {"from_datetime": frm, "count": 200,
                 "data_freshness": "realtime", "duration": hours * 3600,
                 "forbidden_uris[]": FORBIDDEN_MODES},
                token,
            )
        except urllib.error.HTTPError as e:
            if e.code in (401, 403):
                log("  ! SNCF : clé refusée (HTTP %s)" % e.code)
                return []                      # inutile d'insister sur 10 gares
            log("  ! %s : HTTP %s (vérifie le stop_area)" % (g["nom"], e.code))
            continue
        except Exception as e:                                  # noqa: BLE001
            log("  ! %s : %s" % (g["nom"], e))
            continue

        for a in res.get("arrivals", []):
            info = a.get("display_informations", {})
            mode = info.get("commercial_mode", "")
            if mode not in TRAIN_MODES:
                continue
            stamp = a.get("stop_date_time", {}).get("arrival_date_time")
            if not stamp:
                continue
            try:
                dt = datetime.strptime(stamp, "%Y%m%dT%H%M%S").replace(tzinfo=PARIS_TZ)
            except ValueError:
                continue
            seats = TRAIN_MODES[mode]
            if (g.get("terminus") or "1").strip() == "0":
                seats = int(seats * STOPOVER_SHARE)
            raw.append({
                "gare": g["nom"], "dept": g["dept"],
                "lat": float(g["lat"]), "lon": float(g["lon"]),
                "dt": dt, "mode": mode, "seats": seats,
            })

    # Regroupement par gare et par tranche
    buckets = {}
    for t in raw:
        buckets.setdefault((t["gare"], band(t["dt"])), []).append(t)

    out = []
    for (gare, slot), group in sorted(buckets.items(), key=lambda kv: kv[0][1]):
        group.sort(key=lambda t: t["dt"])
        seats = sum(t["seats"] for t in group)
        # On ne dit ni d'où viennent les trains ni à quelle minute exacte :
        # le chauffeur lit « Gare de Lyon, 20 h → 22 h, 10 arrivées ».
        label = "%d arrivée%s grandes lignes" % (len(group), "s" if len(group) > 1 else "")
        out.append({
            "id": "train-%s-%s" % (gare.lower().replace(" ", "")[:12], slot.strftime("%d%H%M")),
            "kind": "train",
            "title": label,
            "venue": gare,
            "dept": group[0]["dept"],
            "lat": group[0]["lat"], "lon": group[0]["lon"],
            "start": iso(slot),
            "end": iso(band_end(slot)),
            "count": len(group),
            "volume": rides(seats * TRAIN_EXIT_SHARE),
        })
    return out


# --------------------------------------------------------------------------
# Trains sans clé : horaire théorique GTFS de la SNCF
# --------------------------------------------------------------------------

# L'API SNCF donne le temps réel, retards compris, mais elle demande une clé.
# La SNCF publie aussi, sur data.gouv.fr et sans clé, le GTFS complet du
# réseau TGV / Intercités / TER. C'est le même marché que les vols : horaire
# théorique contre liberté d'accès.
#
# Ce connecteur ne sert donc que de FILET : il ne s'active que si SNCF_TOKEN
# est absent, pour que l'application ne soit jamais vide. Dès que la clé est
# là, c'est le temps réel qui gagne.
GTFS_SNCF = "9ae758ec-cd7a-40cd-a890-bb3963224942"

# Un numéro de ligne « 601A » ou « 421E » désigne une relation grandes lignes ;
# les TER et la banlieue portent des codes « C3 », « K10 ». C'est le critère le
# plus sûr, complété par la mention « TGV » dans le nom de la ligne et par le
# numéro de train (quatre chiffres au plus pour les grandes lignes, six pour
# un TER). Vérifié sur une journée entière : les 543 arrêts retenus sont tous
# des TGV ou des Intercités, les 238 écartés tous des TER ou de la banlieue.
GTFS_MAIN_LINE = re.compile(r"^\d{3}[A-Z]$")

GTFS_SEATS = {"OUIGO": 1200, "TGV": 510, "IC": 400}

# À un terminus tout le monde descend ; à un arrêt intermédiaire — Massy, Roissy
# ou Marne-la-Vallée sur un Lille–Méditerranée — une minorité seulement.
# Vérifié sur l'horaire complet : les sept gares parisiennes sont à 100 % des
# terminus, les trois gares d'interconnexion à 98 % des arrêts de passage.
# D'où la colonne `terminus` de gares.csv, utilisée par la voie temps réel —
# l'horaire théorique, lui, connaît le statut arrêt par arrêt.
STOPOVER_SHARE = 0.35


def gtfs_line_label(long_name):
    """« Paris - Brest TGV » → « Brest » : ce qui intéresse le chauffeur,
    c'est d'où arrivent les gens, pas la nomenclature de la ligne."""
    s = re.sub(r"\bTGV\b", "", long_name or "", flags=re.I)
    s = re.sub(r"(?i)^\s*paris\s*-\s*", "", s.strip())
    s = re.sub(r"(?i)\s*-\s*paris\s*$", "", s.strip())
    return " ".join(s.split()).strip(" -") or (long_name or "").strip()


def parse_gtfs_sncf(raw, gtfs_names):
    """Extrait du GTFS les arrêts grandes lignes des gares du référentiel.

    Le fichier fait 84 Mo décompressés ; on n'en garde que 9 500 lignes, soit
    une centaine de kilo-octets. `gtfs_names` fait correspondre le nom de
    l'arrêt GTFS au code de gares.csv."""
    zf = zipfile.ZipFile(io.BytesIO(raw))

    def table(name):
        return csv.DictReader(io.TextIOWrapper(zf.open(name), encoding="utf-8-sig"))

    stop2gare = {}
    for s in table("stops.txt"):
        nom = s.get("stop_name") or ""
        for prefixe, code in gtfs_names.items():
            if nom.startswith(prefixe):
                stop2gare[s["stop_id"]] = code
                break

    routes = {r["route_id"]: r for r in table("routes.txt")}
    trips = {t["trip_id"]: t for t in table("trips.txt")}

    rows, services = [], set()
    for st in table("stop_times.txt"):
        gare = stop2gare.get(st["stop_id"])
        if not gare or st.get("drop_off_type") == "1":
            continue                              # on ne descend pas ici
        trip = trips.get(st["trip_id"])
        if not trip:
            continue
        route = routes.get(trip["route_id"], {})
        court = route.get("route_short_name") or ""
        long_name = route.get("route_long_name") or ""
        num = trip.get("trip_headsign") or ""
        grande = (GTFS_MAIN_LINE.match(court) or "TGV" in long_name.upper()
                  or (num.isdigit() and len(num) <= 4))
        if not grande:
            continue
        try:
            h, m, _ = st["arrival_time"].split(":")
            minute = int(h) * 60 + int(m)
        except (KeyError, ValueError):
            continue
        if num.isdigit() and len(num) == 4 and num[:2] in ("76", "77"):
            cat = "OUIGO"
        elif "TGV" in long_name.upper():
            cat = "TGV"
        else:
            cat = "IC"
        rows.append([gare, trip["service_id"], minute, cat,
                     1 if st.get("pickup_type") == "1" else 0,
                     gtfs_line_label(long_name)])
        services.add(trip["service_id"])

    calendrier = {}
    for c in table("calendar_dates.txt"):
        if c.get("exception_type") == "1" and c["service_id"] in services:
            calendrier.setdefault(c["service_id"], []).append(c["date"])
    return {"rows": rows, "cal": calendrier}


def fetch_trains_gtfs(hours=12):
    """Arrivées grandes lignes d'après l'horaire théorique, sans clé."""
    gares = {}
    for g in read_csv("gares.csv"):
        prefixe = (g.get("gtfs_nom") or "").strip()
        if not prefixe:
            continue
        try:
            gares[prefixe] = {"nom": g["nom"], "dept": g["dept"],
                              "lat": float(g["lat"]), "lon": float(g["lon"])}
        except (KeyError, ValueError):
            log("  ! gare illisible : %r" % g.get("nom"))
    if not gares:
        return []

    codes = {p: p for p in gares}
    try:
        data = cached_extract(GTFS_SNCF,
                              lambda raw: parse_gtfs_sncf(raw, codes), "gtfs")
    except Exception as e:                                      # noqa: BLE001
        log("  ! GTFS SNCF : %s" % e)
        return []

    now = datetime.now(PARIS_TZ)
    horizon = now + timedelta(hours=hours)
    # Un service daté du 16 peut arriver le 17 à 00 h 40 : le GTFS écrit alors
    # « 24:40:00 ». On déplie donc la veille, le jour même et le lendemain.
    jours = {(now + timedelta(days=d)).strftime("%Y%m%d") for d in (-1, 0, 1)}
    par_service = {}
    for sid, dates in data.get("cal", {}).items():
        gardees = [d for d in dates if d in jours]
        if gardees:
            par_service[sid] = gardees

    raw = []
    for gare_pref, sid, minute, cat, terminus, ligne in data.get("rows", []):
        place = gares.get(gare_pref)
        if not place:
            continue
        for d in par_service.get(sid, ()):
            jour = datetime.strptime(d, "%Y%m%d")
            dt = jour + timedelta(minutes=minute)
            dt = dt.replace(tzinfo=paris_tz_at(dt))
            if not (now - timedelta(minutes=10) <= dt <= horizon):
                continue
            seats = GTFS_SEATS.get(cat, 450)
            if not terminus:
                seats = int(seats * STOPOVER_SHARE)
            raw.append({"place": place, "dt": dt, "seats": seats, "ligne": ligne})

    buckets = {}
    for t in raw:
        buckets.setdefault((t["place"]["nom"], band(t["dt"])), []).append(t)

    out = []
    for (gare, slot), group in sorted(buckets.items(), key=lambda kv: kv[0][1]):
        group.sort(key=lambda t: t["dt"])
        place = group[0]["place"]
        label = "%d arrivée%s grandes lignes — horaire théorique" % (
            len(group), "s" if len(group) > 1 else "")
        out.append({
            "id": "train-%s-%s" % (gare.lower().replace(" ", "")[:12],
                                   slot.strftime("%d%H%M")),
            "kind": "train",
            "title": label,
            "venue": gare,
            "dept": place["dept"],
            "lat": place["lat"], "lon": place["lon"],
            "start": iso(slot),
            "end": iso(band_end(slot)),
            "count": len(group),
            "volume": rides(sum(t["seats"] for t in group) * TRAIN_EXIT_SHARE),
        })
    return out


# --------------------------------------------------------------------------
# Vols (horaire théorique SSIM publié sur data.gouv.fr)
# --------------------------------------------------------------------------

# Aéroports de Paris ne publie pas ses arrivées en données ouvertes, et son
# site est protégé contre les robots. Air France publie en revanche son
# programme de vols complet sur data.gouv.fr, au format SSIM — l'horaire
# théorique officiel du transport aérien. C'est gratuit, sans clé et sans
# quota ; en échange on n'a que les compagnies qui publient, et aucun retard.
#
# Conséquence à connaître : le brief ne montre que les arrivées Air France,
# KLM et Transavia. C'est l'essentiel du programme d'Orly 3 et un peu plus de
# la moitié de celui de Roissy, mais easyJet, Delta, Emirates ou Vueling en
# sont absents. Le libellé affiché le dit, pour ne pas laisser croire à un
# tableau d'affichage complet.
SSIM_SOURCES = [
    # (libellé affiché, identifiant de ressource data.gouv.fr)
    # Le libellé est abrégé parce qu'il est répété sur chaque ligne de la
    # timeline : écrit en toutes lettres, il la faisait passer sur deux rangs.
    ("AF/KLM/Transavia", "240d45de-fcff-42ed-9e97-5e351d032fea"),
]
DATAGOUV_RESOURCE = "https://www.data.gouv.fr/api/1/datasets/r/%s"

CACHE = os.path.join(HERE, ".cache")

# Nombre de sièges quand la configuration cabine manque dans le fichier.
# Valeurs prudentes, au milieu des aménagements courants chez Air France.
EQUIP_SEATS = {
    "318": 131, "319": 143, "320": 174, "32N": 180, "32A": 174,
    "321": 212, "32Q": 212, "223": 148, "221": 120,
    "E90": 100, "E95": 110, "CR9": 90, "AT7": 72, "AT5": 48,
    "73H": 189, "738": 189, "7M8": 189, "73W": 149, "737": 149,
    "772": 280, "77W": 300, "773": 300, "788": 250, "789": 279, "781": 300,
    "332": 260, "333": 290, "339": 290, "346": 270,
    "359": 324, "35K": 350, "388": 516, "74H": 364,
}
DEFAULT_SEATS = 170

# Gros porteurs : ils arrivent d'un vol long, avec des valises de soute.
WIDEBODY = {"772", "77W", "773", "787", "788", "789", "781", "332", "333",
            "339", "346", "359", "35K", "388", "74H", "74E", "744", "764", "767"}

# Aéroports de France métropolitaine : une arrivée depuis Nice ou Toulouse,
# c'est un voyageur avec un bagage cabine, souvent un abonné du RER.
FRANCE_AIRPORTS = {
    "NCE", "MRS", "TLS", "BOD", "LYS", "NTE", "MPL", "SXB", "LIL", "BES",
    "RNS", "CFE", "BIQ", "PUF", "TLN", "AJA", "BIA", "CLY", "FSC", "PGF",
    "BZR", "EGC", "LDE", "LRH", "RDZ", "BVE", "AUR", "CCF", "DOL", "ETZ",
    "GNB", "MLH", "NCY", "QXB", "URO", "TUF", "EBU", "ANE", "RCO", "LME",
    "MEN", "OBS", "DIJ", "ORY", "CDG", "BVA",
}

# Part des sièges comptée comme « personnes qui sortent et peuvent prendre une
# voiture », pour rester sur la même échelle que les trains (0,6 par place).
# Deux effets se combinent, écrits séparément pour qu'on puisse les discuter :
#   — la part qui sort vraiment de l'aéroport : à Roissy, beaucoup de
#     long-courriers repartent en correspondance sans jamais passer la porte ;
#     sur un vol intérieur à Orly, presque tout le monde sort ;
#   — la part qui prend une voiture plutôt que le RER, l'Orlyval ou le car :
#     c'est là que le long-courrier gagne, avec ses valises, son décalage
#     horaire et ses arrivées avant le premier train.
LOAD_FACTOR = 0.85
FLIGHT_EXIT = {"long": 0.65, "moyen": 0.70, "interieur": 0.90}
# Multiplicateur par rapport à un voyageur de train, qui sert de référence
# (VTC_TAKE_RATE). Un passager d'avion prend beaucoup plus souvent une voiture :
# il n'y a pas de métro à Roissy, il a des valises, et il atterrit à des heures
# où le RER est rare. Un vol intérieur à Orly se rapproche du train — c'est
# souvent un habitué qui file à l'Orlyval.
FLIGHT_VTC = {"long": 2.40, "moyen": 1.70, "interieur": 1.00}

# Nom affiché de l'aéroport : la ligne principale dit où aller, le détail des
# terminaux est dans le libellé en dessous.
AIRPORT_NAMES = {"CDG": "Roissy", "ORY": "Orly"}

# En dessous de ce nombre de courses, la tranche ne vaut pas le déplacement :
# un seul avion moyen-courrier en pleine nuit, ce n'est pas une file d'attente.
# Elle est écartée plutôt que d'allonger la timeline pour rien.
MIN_FLIGHT_RIDES = 8

SSIM_MONTHS = {m: i + 1 for i, m in enumerate(
    ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"])}


def ssim_date(txt):
    """« 29MAR26 » → date. Renvoie None sur un champ vide ou illisible."""
    txt = txt.strip()
    if len(txt) != 7:
        return None
    try:
        return datetime(2000 + int(txt[5:7]), SSIM_MONTHS[txt[2:5]], int(txt[0:2]))
    except (KeyError, ValueError):
        return None


def ssim_minutes(txt):
    """« 2030 » → 1230 minutes depuis minuit, **en UTC**.

    Point vérifié plutôt que supposé : la norme SSIM prévoit des heures
    locales, mais le fichier d'Air France publie des heures UTC. Deux preuves.
    Les durées de vol : avec une lecture en heure locale, New York–Roissy
    tombait à 1 h 25 et Tokyo–Roissy à 22 h 30 ; en UTC on obtient 7 h 25 et
    14 h 30, c'est-à-dire les vrais temps de vol. Et le couvre-feu d'Orly,
    fermé de 23 h 30 à 6 h : l'activité brute du fichier s'arrête à 20 h 59 et
    reprend à 4 h — plus deux heures, ça donne exactement 6 h 00 – 22 h 59.
    """
    txt = txt.strip()
    if len(txt) != 4 or not txt.isdigit():
        return None
    return int(txt[:2]) * 60 + int(txt[2:])


def ssim_offset(txt):
    """« -0400 » → −240 minutes. C'est le décalage local de l'escale, celui
    qu'il faut AJOUTER aux heures du fichier pour obtenir l'heure affichée
    dans l'aérogare (voir ssim_minutes)."""
    txt = txt.strip()
    if len(txt) != 5 or txt[0] not in "+-" or not txt[1:].isdigit():
        return None
    mins = int(txt[1:3]) * 60 + int(txt[3:5])
    return -mins if txt[0] == "-" else mins


def parse_ssim(text):
    """Extrait les segments passagers arrivant à CDG et Orly d'un fichier
    SSIM. Un enregistrement de type 3 est une ligne de 200 caractères à
    colonnes fixes ; on ne garde que les champs utiles, parce que le fichier
    d'Air France pèse 80 Mo pour 36 000 segments franciliens."""
    legs = []
    for line in text.splitlines():
        if len(line) < 192 or line[0] != "3":
            continue
        if line[54:57] not in ("CDG", "ORY"):
            continue
        if line[13] not in ("J", "S", "U"):      # vols passagers programmés
            continue
        frm, to = ssim_date(line[14:21]), ssim_date(line[21:28])
        dep_min, arr_min = ssim_minutes(line[39:43]), ssim_minutes(line[61:65])
        dep_tz, arr_tz = ssim_offset(line[47:52]), ssim_offset(line[65:70])
        if None in (frm, to, dep_min, arr_min, dep_tz, arr_tz):
            continue
        # La configuration cabine (« J30W21Y228 ») donne le nombre de sièges
        # exact du vol : bien mieux qu'une moyenne par type d'appareil.
        cfg = line[172:192].strip()
        seats = sum(int(n) for n in re.findall(r"[A-Z](\d+)", cfg)) if cfg else 0
        legs.append({
            "ap": line[54:57],
            "term": line[70:72].strip() or "*",
            "orig": line[36:39].strip(),
            "days": line[28:35],
            "from": frm.strftime("%Y-%m-%d"),
            "to": to.strftime("%Y-%m-%d"),
            "dep": dep_min, "arr": arr_min,
            "dtz": dep_tz, "atz": arr_tz,
            "eq": line[72:75].strip(),
            "seats": seats,
        })
    return legs


def cached_extract(resource_id, parse, label):
    """Télécharge une ressource data.gouv, la découpe, et garde l'extrait.

    Les gros fichiers d'horaires ne changent que quelques fois par an. On
    renvoie donc l'ETag du téléchargement précédent : le serveur répond
    « 304 non modifié » en quelques octets et on relit l'extrait local. Sans
    cache, tout fonctionne pareil — c'est juste le fichier entier à chaque
    fois."""
    os.makedirs(CACHE, exist_ok=True)
    cle = "".join(c for c in resource_id if c.isalnum())[-12:]
    extract = os.path.join(CACHE, "%s-%s.json.gz" % (label, cle))
    tag_file = os.path.join(CACHE, "%s-%s.etag" % (label, cle))

    etag = ""
    if os.path.exists(extract) and os.path.exists(tag_file):
        with open(tag_file, encoding="utf-8") as f:
            etag = f.read().strip()

    headers = {"User-Agent": UA}
    if etag:
        headers["If-None-Match"] = etag
    url = resource_id if resource_id.startswith("http") else DATAGOUV_RESOURCE % resource_id
    try:
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=300) as r:
            raw = r.read()
            new_tag = r.headers.get("ETag", "")
    except urllib.error.HTTPError as e:
        if e.code == 304 and os.path.exists(extract):
            with gzip.open(extract, "rt", encoding="utf-8") as f:
                return json.load(f)
        raise

    data = parse(raw)
    with gzip.open(extract, "wt", encoding="utf-8") as f:
        json.dump(data, f, separators=(",", ":"))
    if new_tag:
        with open(tag_file, "w", encoding="utf-8") as f:
            f.write(new_tag)
    return data


def ssim_legs(resource_id):
    return cached_extract(resource_id,
                          lambda raw: parse_ssim(raw.decode("latin-1")), "ssim")


def flight_tier(leg):
    """Trois familles, parce qu'elles ne valent pas la même course."""
    if leg["eq"] in WIDEBODY:
        return "long"
    if leg["orig"] in FRANCE_AIRPORTS:
        return "interieur"
    return "moyen"


def leg_arrivals(leg, days_back=1, days_ahead=2):
    """Déplie un segment en arrivées datées, à l'heure de Roissy ou d'Orly.

    Les jours d'exploitation portent sur le jour de DÉPART : un vol parti de
    New York le dimanche soir se pose à Roissy le lundi matin. Tout se calcule
    donc en UTC, puis on ajoute le décalage de l'escale d'arrivée que le
    fichier fournit — ce qui règle au passage le changement d'heure, puisque
    le décalage est donné vol par vol."""
    out = []
    frm = datetime.strptime(leg["from"], "%Y-%m-%d")
    to = datetime.strptime(leg["to"], "%Y-%m-%d")
    today = datetime.now(timezone.utc).replace(tzinfo=None, hour=0, minute=0,
                                               second=0, microsecond=0)
    for d in range(-days_back, days_ahead + 1):
        day = today + timedelta(days=d)
        if not (frm <= day <= to):
            continue
        if str(day.isoweekday()) not in leg["days"]:
            continue
        dep_utc = day + timedelta(minutes=leg["dep"])
        arr_utc = day + timedelta(minutes=leg["arr"])
        if arr_utc < dep_utc:                    # le vol a franchi minuit
            arr_utc += timedelta(days=1)
        tz = timezone(timedelta(minutes=leg["atz"]))
        out.append((arr_utc + timedelta(minutes=leg["atz"])).replace(tzinfo=tz))
    return out


def fetch_flights(hours=12):
    """Arrivées à Roissy et Orly, regroupées par terminal et par créneau de
    30 minutes, comme les trains. Aucune clé : si data.gouv ne répond pas, la
    source est simplement absente du brief."""
    terminaux = {}
    for t in read_csv("terminaux.csv"):
        try:
            terminaux[(t["aeroport"], t["terminal"])] = {
                "nom": t["nom"], "dept": t["dept"],
                "lat": float(t["lat"]), "lon": float(t["lon"])}
        except (KeyError, ValueError):
            log("  ! terminal illisible : %r" % t.get("nom"))
    if not terminaux:
        return []

    now = datetime.now(PARIS_TZ)
    horizon = now + timedelta(hours=hours)
    raw = []

    for label, resource_id in SSIM_SOURCES:
        try:
            legs = ssim_legs(resource_id)
        except Exception as e:                                  # noqa: BLE001
            log("  ! vols %s : %s" % (label, e))
            continue
        log("  %s : %d segments franciliens" % (label, len(legs)))
        for leg in legs:
            place = terminaux.get((leg["ap"], leg["term"])) or \
                    terminaux.get((leg["ap"], "*"))
            if not place:
                continue
            tier = flight_tier(leg)
            seats = leg["seats"] or EQUIP_SEATS.get(leg["eq"], DEFAULT_SEATS)
            for dt in leg_arrivals(leg):
                if not (now - timedelta(minutes=15) <= dt <= horizon):
                    continue
                raw.append({
                    "label": label, "place": place, "dt": dt, "tier": tier,
                    "ap": leg["ap"], "term": leg["term"], "orig": leg["orig"],
                    "eq": leg["eq"], "seats": seats,
                })
    if not raw:
        return []

    # Un même vol physique est publié une fois par compagnie qui le vend :
    # l'AF703 de Roissy est aussi le KL2269. Même escale d'origine, même
    # minute, même terminal, même appareil : c'est le même avion.
    unique = {}
    for f in raw:
        unique[(f["ap"], f["term"], f["dt"], f["orig"], f["eq"])] = f

    # Regroupement par aéroport et par tranche, pas par terminal et par
    # demi-heure. Découper Roissy terminal par terminal donnait huit lignes
    # parallèles pour la même soirée, dont beaucoup à un seul avion : illisible
    # dans la timeline. Un chauffeur décide d'abord d'aller à Roissy ou à
    # Orly ; le terminal se lit ensuite, et il est écrit sur la ligne du lieu.
    buckets = {}
    for f in unique.values():
        buckets.setdefault((f["ap"], band(f["dt"])), []).append(f)

    out = []
    for (ap, slot), group in sorted(buckets.items(), key=lambda kv: kv[0][1]):
        group.sort(key=lambda f: f["dt"])
        par_terminal = {}
        for f in group:
            v = f["seats"] * LOAD_FACTOR * FLIGHT_EXIT[f["tier"]] * FLIGHT_VTC[f["tier"]]
            par_terminal[f["term"]] = par_terminal.get(f["term"], 0) + v
        courses = rides(sum(par_terminal.values()))
        if courses < MIN_FLIGHT_RIDES:
            continue

        # La ligne n'affiche que « Roissy » ou « Orly » : un chauffeur choisit
        # d'abord l'aéroport, le terminal il le voit sur place. En revanche le
        # bouton « Y aller » vise le terminal le plus chargé de la tranche,
        # parce que c'est là que la file se forme.
        dominant = max(par_terminal, key=lambda t: par_terminal[t])
        place = next((f["place"] for f in group if f["term"] == dominant),
                     group[0]["place"])

        out.append({
            "id": "vol-%s-%s" % (ap.lower(), slot.strftime("%d%H")),
            "kind": "flight",
            "title": "%d arrivée%s" % (len(group), "s" if len(group) > 1 else ""),
            "venue": AIRPORT_NAMES.get(ap, ap),
            "dept": place["dept"],
            "lat": place["lat"], "lon": place["lon"],
            "start": iso(slot),
            "end": iso(band_end(slot)),
            "count": len(group),
            "volume": courses,
        })
    return out


# --------------------------------------------------------------------------
# Événements : saisie manuelle + agendas ouverts
# --------------------------------------------------------------------------

# Ce qui intéresse un chauffeur, c'est l'heure de SORTIE. La plupart des API de
# billetterie ne donnent que l'heure de début ; ces deux agendas-là donnent les
# deux, ce qui est la raison principale de les avoir choisis. Quand la fin
# manque quand même, on applique la durée ci-dessous — une hypothèse, pas une
# mesure, et c'est pour ça que le CSV rempli à la main reste prioritaire.
DEFAULT_DURATION_MIN = {"concert": 150, "sport": 120, "salon": 480}

# L'heure imprimée sur un billet de concert n'est pas celle où l'artiste entre
# en scène : c'est l'ouverture des portes. Entre les deux il y a la première
# partie, et à peu près une heure. Sans cette correction, l'application
# annonçait Youssou Ndour à 21 h 30 et Céline Dion à 22 h, soit une heure trop
# tôt — constaté sur le terrain. Ça ne vaut que pour les concerts : sur un
# match ou un salon, l'heure annoncée est la bonne.
DOORS_TO_SHOW_MIN = 60

# Un salon ne « sort » pas à une heure précise : il se vide par vagues tout
# l'après-midi, de plus en plus fort jusqu'à la fermeture. On affiche donc une
# tranche plutôt qu'un instant, de SALON_RUSH_FROM à la fermeture.
SALON_RUSH_FROM = 14

# Heure de fermeture supposée quand la source ne la donne pas. Les salons
# franciliens ferment entre 18 h et 20 h ; 19 h est le milieu honnête. C'est
# mieux que « début + 8 h », qui plaçait la fermeture du Mondial de l'Auto à
# 17 h parce que la première séance ouvrait à 9 h.
SALON_CLOSE_AT = 19


def estimate_end(kind, debut):
    """Fin supposée d'un événement dont la source ne donne que le début."""
    if kind == "salon":
        ferme = debut.replace(hour=SALON_CLOSE_AT, minute=0, second=0, microsecond=0)
        return ferme if ferme > debut else debut + timedelta(hours=2)
    duree = DEFAULT_DURATION_MIN.get(kind, 150)
    if kind == "concert":
        duree += DOORS_TO_SHOW_MIN      # l'heure du billet est celle des portes
    return debut + timedelta(minutes=duree)


def event_window(kind, debut, fin):
    """(début affiché, fin affichée) d'un événement.

    Un concert ou un match se résume à sa sortie : un seul instant, celui où
    les gens cherchent une voiture. Un salon, lui, s'étale — d'où une tranche
    qui commence en début d'après-midi et finit à la fermeture."""
    if kind != "salon":
        return fin, None

    # Un billet de salon daté porte souvent 00:00 ou 23:59 : c'est une date,
    # pas une heure de visite. La Paris Games Week s'affichait à 23h59.
    if debut.hour == 0 or debut.hour >= 22:
        jour = debut.date()
        if debut.hour >= 22:
            pass                         # 23:59 désigne bien ce jour-là
        debut = datetime(jour.year, jour.month, jour.day, SALON_RUSH_FROM)
        fin = debut.replace(hour=SALON_CLOSE_AT)
    rush = debut.replace(hour=SALON_RUSH_FROM, minute=0, second=0, microsecond=0)
    start = max(debut, rush)
    return (start, fin) if fin > start else (fin, None)


# Deux agendas ouverts, sans clé, sans quota affiché, tous deux en API
# OpenDataSoft v2.1 — donc une seule mécanique pour les deux.
# Ils sont complémentaires et aucun n'est complet : « Que faire à Paris »
# couvre l'Accor Arena, l'Adidas Arena et le Zénith ; le miroir OpenAgenda
# couvre Paris La Défense Arena et les salons de la Porte de Versailles.
# Ni l'un ni l'autre ne connaît le Stade de France.
ODS_EVENT_SOURCES = [
    {
        "label": "Que faire à Paris",
        "url": ("https://opendata.paris.fr/api/explore/v2.1/catalog/datasets/"
                "que-faire-a-paris-/records"),
        "geo": "lat_lon", "end": "date_end", "name": "address_name",
        "title": "title", "tags": "qfap_tags",
        "slots": "pairs", "slots_field": "occurrences",
        "fallback": ("date_start", "date_end"),
    },
    {
        "label": "OpenAgenda",
        "url": ("https://public.opendatasoft.com/api/explore/v2.1/catalog/datasets/"
                "evenements-publics-openagenda/records"),
        "geo": "location_coordinates", "end": "lastdate_end", "name": "location_name",
        "title": "title_fr", "tags": "keywords_fr",
        "slots": "json", "slots_field": "timings",
        "fallback": ("firstdate_begin", "lastdate_end"),
    },
]

# Le filtre géographique attrape les voisins immédiats : la Cinémathèque à côté
# de l'Accor Arena, le Dôme de Paris à la Porte de Versailles. Le nom du lieu
# doit donc correspondre à un alias de salles.csv — et ces mots-là désignent
# toujours un équipement de quartier, jamais la grande salle.
EXCLUDE_WORDS = ("gymnase", "creche", "bibliotheque", "centre paris anim",
                 "musee", "conservatoire", "ludotheque", "mediatheque")

# Mots qui décident du type quand l'agenda ne le dit pas clairement. Le type
# par défaut de la salle (colonne type_defaut) sert de dernier recours.
KIND_WORDS = (
    ("salon", ("salon", "foire", "mondial de", "congres", "convention",
               "exposition universelle", "biennale")),
    ("sport", ("match", "football", "rugby", "basket", "handball", "tournoi",
               "championnat", "finale", "meeting", "grand prix", "course",
               "jumping", "psg", "coupe de france")),
    ("concert", ("concert", "tournee", "live", "festival", "spectacle",
                 "show", "dj", "en concert")),
)


def strip_accents(txt):
    return (txt.replace("é", "e").replace("è", "e").replace("ê", "e")
               .replace("ë", "e").replace("à", "a").replace("â", "a")
               .replace("ä", "a").replace("î", "i").replace("ï", "i")
               .replace("ô", "o").replace("ö", "o").replace("ù", "u")
               .replace("û", "u").replace("ü", "u").replace("ç", "c"))


def normalize(txt):
    """« Stade Jean-Bouin » → « stade jean bouin », pour comparer des noms de
    lieux qui ne s'écrivent jamais deux fois pareil."""
    out = []
    for ch in strip_accents((txt or "").lower()):
        out.append(ch if ch.isalnum() else " ")
    return " ".join("".join(out).split())


def load_salles():
    salles = {}
    for s in read_csv("salles.csv"):
        try:
            s["lat"], s["lon"] = float(s["lat"]), float(s["lon"])
        except (KeyError, ValueError):
            log("  ! coordonnées illisibles pour la salle %r" % s.get("code"))
            continue
        s["aliases"] = [normalize(a) for a in (s.get("alias") or s["nom"]).split("|")
                        if normalize(a)]
        salles[s["code"]] = s
    return salles


def guess_kind(title, tags, default):
    blob = normalize("%s %s" % (title or "", tags if isinstance(tags, str)
                                else " ".join(tags or [])))
    for kind, words in KIND_WORDS:
        if any(w in blob for w in words):
            return kind
    return default or "concert"


def naive_iso(txt):
    """Les deux agendas affichent l'heure locale, mais pas toujours avec le bon
    décalage (« 08FEB2023 19:00:00+02:00 » en plein hiver). On ne garde donc
    que l'heure murale et on y recolle le fuseau de Paris."""
    if not txt or len(txt) < 16:
        return None
    try:
        return datetime.strptime(txt[:16], "%Y-%m-%dT%H:%M")
    except ValueError:
        return None


def event_slots(src, rec):
    """Renvoie les couples (début, fin) de chaque jour de l'événement. Un salon
    de trois jours ferme trois fois : c'est trois créneaux de demande, pas un."""
    field = rec.get(src["slots_field"])
    slots = []
    if src["slots"] == "pairs" and field:
        for pair in str(field).split(";"):
            if "_" not in pair:
                continue
            a, b = pair.split("_", 1)
            slots.append((naive_iso(a), naive_iso(b)))
    elif src["slots"] == "json" and field:
        try:
            for t in json.loads(field):
                slots.append((naive_iso(t.get("begin")), naive_iso(t.get("end"))))
        except (ValueError, TypeError, AttributeError):
            pass
    if not slots:
        a, b = src["fallback"]
        slots = [(naive_iso(rec.get(a)), naive_iso(rec.get(b)))]
    return [(a, b) for a, b in slots if a]


def near(salle, lat, lon):
    """Vrai si le point est à moins de 400 m environ de la salle. L'API a déjà
    fait le vrai filtre géographique ; ce calcul-ci sert seulement à savoir
    laquelle des quinze salles est concernée, d'où l'approximation en degrés."""
    if lat is None or lon is None:
        return False
    dlat = (lat - salle["lat"]) / 0.0036
    dlon = (lon - salle["lon"]) / 0.0055
    return dlat * dlat + dlon * dlon <= 1.0


def ods_records(src, points, pages=3, limit=100):
    """Une seule requête par agenda pour les quinze salles, plutôt que quinze :
    les clauses `distance` s'additionnent avec des `or`. Les résultats sont
    triés par date de fin croissante, donc les premières pages couvrent
    l'horizon qui nous intéresse."""
    clause = " or ".join("distance(%s, geom'POINT(%s %s)', 400m)"
                         % (src["geo"], lon, lat) for lat, lon in points)
    rows = []
    for page in range(pages):
        url = src["url"] + "?" + urllib.parse.urlencode({
            "limit": limit, "offset": page * limit,
            "where": "(%s) and %s > now()" % (clause, src["end"]),
            "order_by": src["end"],
            "select": ",".join([src["name"], src["title"], src["tags"],
                                src["slots_field"], src["geo"],
                                src["fallback"][0], src["fallback"][1]]),
        })
        res = http_json(url, timeout=60)
        batch = res.get("results", [])
        rows.extend(batch)
        if len(batch) < limit:
            break
    return rows


def record_point(src, rec):
    pt = rec.get(src["geo"]) or {}
    if isinstance(pt, dict):
        return pt.get("lat"), pt.get("lon")
    return None, None


def fetch_events_api(days=3):
    """Ce que les deux agendas ouverts annoncent dans les salles du
    référentiel. Le référentiel décide : un lieu absent de salles.csv n'entre
    jamais dans le brief, même s'il se trouve juste à côté."""
    salles = load_salles()
    if not salles:
        return []
    points = [(s["lat"], s["lon"]) for s in salles.values()]

    now = datetime.now(PARIS_TZ)
    horizon = now + timedelta(days=days)
    out = []

    for source in ODS_EVENT_SOURCES:
        try:
            rows = ods_records(source, points)
        except Exception as e:                                  # noqa: BLE001
            log("  ! %s : %s" % (source["label"], e))
            continue

        found = 0
        for rec in rows:
            name = normalize(rec.get(source["name"]) or "")
            if not name or any(w in name for w in EXCLUDE_WORDS):
                continue
            lat, lon = record_point(source, rec)
            salle = None
            for s in salles.values():
                if any(a in name for a in s["aliases"]) and near(s, lat, lon):
                    salle = s
                    break
            if not salle:
                continue
            title = (rec.get(source["title"]) or "").strip()
            if not title:
                continue
            kind = guess_kind(title, rec.get(source["tags"]),
                              salle.get("type_defaut"))
            for begin, fin in event_slots(source, rec):
                # La vraie heure de fin, quand l'agenda la donne, l'emporte sur
                # toute hypothèse : c'est le drapeau `_sure` qui le dit.
                sure = bool(fin and fin > begin)
                if not sure:
                    fin = estimate_end(kind, begin)
                limite = now.replace(tzinfo=None)
                if not (limite - timedelta(hours=2)
                        <= fin <= horizon.replace(tzinfo=None)):
                    continue
                debut_aff, fin_aff = event_window(kind, begin, fin)
                debut_aff = debut_aff.replace(tzinfo=paris_tz_at(debut_aff))
                fin_aff = fin_aff.replace(tzinfo=paris_tz_at(fin_aff)) if fin_aff else None
                cap = int(salle.get("capacite") or 0)
                out.append({
                    # Le jour AFFICHÉ, pas la fin calculée : un salon dont le
                    # billet porte 23h59 finissait « le lendemain » et
                    # échappait au regroupement.
                    "_key": (salle["code"], debut_aff.strftime("%Y-%m-%d")),
                    "_sure": sure,
                    "id": "ev-%s-%s-auto" % (salle["code"],
                                             fin.strftime("%Y%m%d%H%M")),
                    "kind": kind,
                    "title": title,
                    "venue": salle["nom"],
                    "dept": salle["dept"],
                    "lat": salle["lat"], "lon": salle["lon"],
                    "start": iso(debut_aff),
                    "end": iso(fin_aff) if fin_aff else None,
                    "volume": rides(cap * HALL_EXIT_AUTO),
                    "note": source["label"],
                })
                found += 1
        log("  %s : %d lignes lues, %d créneaux retenus"
            % (source["label"], len(rows), found))
    return out


def fetch_events(days=3):
    """evenements.csv ne porte qu'un code de salle : les coordonnées, le
    département et la capacité viennent de salles.csv. Remplir une ligne
    prend dix secondes."""
    salles = load_salles()
    now = datetime.now(PARIS_TZ)
    horizon = now + timedelta(days=days)
    out = []

    for e in read_csv("evenements.csv"):
        salle = salles.get(e.get("salle", "").strip())
        if not salle:
            log("  ! salle inconnue : %r (ligne %r)" % (e.get("salle"), e.get("titre")))
            continue
        try:
            start = datetime.strptime("%s %s" % (e["date"], e["fin"]), "%Y-%m-%d %H:%M")
        except (KeyError, ValueError):
            log("  ! date/heure illisible : %r" % e.get("titre"))
            continue
        start = start.replace(tzinfo=paris_tz_at(start))
        if not (now - timedelta(hours=2) <= start <= horizon):
            continue

        cap = int(e.get("jauge") or salle.get("capacite") or 0)
        out.append({
            "_key": (salle["code"], e["date"]),
            "id": "ev-%s-%s" % (salle["code"], e["date"].replace("-", "")),
            "kind": e.get("type", "concert").strip(),
            "title": e["titre"].strip(),
            "venue": salle["nom"],
            "dept": salle["dept"],
            "lat": salle["lat"], "lon": salle["lon"],
            "start": iso(start),
            "end": None,
            "volume": rides(cap * HALL_EXIT_SURE),
            "note": e.get("note", "").strip() or None,
        })
    return out


def merge_events(manual, auto):
    """Fusionne la saisie manuelle et les agendas, la main d'abord.

    Deux règles, nées de ce que les agendas renvoient vraiment :

    1. Un événement automatique est écarté dès qu'une ligne manuelle existe
       pour la même salle le même jour. Une ligne vérifiée un dimanche soir
       vaut mieux que n'importe quel agrégateur.

    2. On ne garde qu'un seul événement automatique par salle et par journée.
       Les billetteries publient la même soirée sous plusieurs formules —
       « concert », « concert + after », « full experience » — et on se
       retrouvait avec sept sorties du Zénith le même soir, dont une à 6 h du
       matin. On retient l'heure de sortie que l'agenda répète le plus, la
       plus tôt en cas d'égalité, et le titre le plus court du lot, qui est
       presque toujours le moins commercial. Pour annoncer une matinée *et*
       une soirée dans la même salle, il faut passer par le CSV.
    """
    manual_days = {e["_key"] for e in manual}
    groups = {}
    for e in auto:
        if e["_key"] in manual_days:
            continue
        groups.setdefault(e["_key"], []).append(e)

    merged = list(manual)
    for key, group in groups.items():
        # Une source qui connaît la VRAIE heure de fin l'emporte sur une
        # estimation. Les agendas ouverts la donnent, Ticketmaster non : quand
        # les deux annoncent le même concert, c'est l'agenda qui fixe l'heure.
        sures = [e for e in group if e.get("_sure")]
        group = sures or group
        hours = {}
        for e in group:
            hours.setdefault(e["start"], []).append(e)
        best = sorted(hours.items(), key=lambda kv: (-len(kv[1]), kv[0]))[0][1]
        merged.append(min(best, key=lambda e: len(e["title"])))

    for e in merged:
        e.pop("_key", None)
        e.pop("_sure", None)
    return merged


# --------------------------------------------------------------------------
# Billetterie : Ticketmaster Discovery
# --------------------------------------------------------------------------

# C'est la source qui comble le trou des agendas ouverts : l'Accor Arena, le
# Zénith, La Seine Musicale, l'Adidas Arena et le Stade de France y sont, avec
# leur programmation complète.
#
# PIÈGE, et il a coûté une conclusion fausse : sans `locale=*`, l'API ne
# renvoie que 32 événements pour toute la France, tous à Roland-Garros, et on
# croit le catalogue français vide. Avec, on en trouve plus de cinq cents dans
# le seul référentiel. Le paramètre ne filtre pas sur la langue, il débloque
# le catalogue localisé — à ne jamais retirer.
#
# Le rattachement se fait par identifiant de salle (colonne `ticketmaster` de
# salles.csv), pas par géographie : c'est exact, et ça évite de confondre une
# salle avec son parking, que Ticketmaster référence aussi.
TICKETMASTER_URL = "https://app.ticketmaster.com/discovery/v2/events.json"

# Segments Ticketmaster → types de l'application. Tout le reste retombe sur le
# type par défaut de la salle : au parc des expositions, « Miscellaneous »
# veut dire salon.
TM_SEGMENTS = {"Music": "concert", "Sports": "sport", "Arts & Theatre": "concert"}

# Les fiches qui vendent un droit d'entrée plutôt qu'une soirée : « PASS 3
# JOURS », « ABONNEMENT SAISON », « FORFAIT WEEK-END ». Ticketmaster les date
# du jour de leur mise en vente, ce qui faisait apparaître un événement
# fantôme à une salle où il ne se passait rien. À ne pas confondre avec la
# coupure au premier tiret appliquée aux salons : là, le type de billet est
# APRÈS le nom (« Paris Games Week 2026 - Billet Daté ») ; ici il est avant.
TM_BILLET = re.compile(r"^(pass|billets?|abonnements?|forfaits?)\b", re.I)


# Au-delà de trois jours, on ne garde que les très grandes salles. Un match NFL
# au Stade de France ou un salon à la Porte de Versailles, ça se sait une
# semaine à l'avance et ça change une journée de travail ; un concert de 6 000
# places dans dix jours, non — ça ferait une liste qu'on ne lit plus.
BIG_VENUE_SEATS = 20000
TM_DAYS_BIG = 10

# Durée de vie du cache de la billetterie. Une programmation ne bouge pas à
# l'échelle de l'heure : elle est annoncée des semaines à l'avance, et ce qui
# arrive encore — un report, une annulation — se compte en jours. Six heures
# donnent quatre relevés par jour, soit soixante-quatre appels au lieu des
# mille cinq cents que ferait un quart d'heure sans cache. Le cache n'a de
# sens que si le dossier scripts/.cache survit d'une exécution à l'autre :
# c'est ce que fait l'étape « Cache des sources lourdes » du workflow, dont la
# clé change toutes les heures pour que ce qui est écrit ici soit réellement
# repris par l'exécution suivante.
TM_CACHE_S = 6 * 3600


def fetch_events_ticketmaster(days=3, pages=3, size=100, days_big=TM_DAYS_BIG):
    """Événements à venir dans les salles du référentiel, via la billetterie.

    Sans clé, la source est simplement absente : le reste du brief est écrit
    comme si elle n'existait pas."""
    key = os.environ.get("TICKETMASTER_KEY", "").strip()
    if not key:
        return []

    salles = load_salles()
    par_id = {}
    for s in salles.values():
        for vid in (s.get("ticketmaster") or "").split("|"):
            if vid.strip():
                par_id[vid.strip()] = s
    if not par_id:
        return []

    now = datetime.now(PARIS_TZ)
    out = []

    # UNE REQUÊTE PAR SALLE. En empilant tous les `venueId` dans une seule
    # requête, Ticketmaster n'en honore qu'une partie, sans rien dire : sur
    # seize salles, six répondaient, et le Stade de France — interrogé seul,
    # il renvoie bien ses neuf événements dont le match NFL — n'apparaissait
    # jamais. Seize requêtes, c'est le prix d'un référentiel complet.
    # Les dates de la requête sont ARRONDIES À LA JOURNÉE. Avec l'heure
    # courante dedans, l'URL changeait à chaque exécution et aucun cache ne
    # pouvait servir : seize appels toutes les quinze minutes pour une
    # programmation annoncée des semaines à l'avance. Arrondie, l'URL est la
    # même toute la journée, et TM_CACHE_S décide du reste. Les événements
    # déjà passés que ramène le début de journée sont écartés plus bas, par le
    # même filtre qu'avant.
    debut_jour = now.replace(hour=0, minute=0, second=0, microsecond=0)

    for vid, salle in par_id.items():
        cap = int(salle.get("capacite") or 0)
        jours = max(days, days_big) if cap >= BIG_VENUE_SEATS else days
        horizon = now + timedelta(days=jours)
        fin_jour = horizon.replace(hour=23, minute=59, second=0, microsecond=0)
        events = []
        for page in range(pages):
            params = [
                ("venueId", vid),
                ("apikey", key),
                ("locale", "*"),                 # sans ça, catalogue français vide
                ("size", size), ("page", page), ("sort", "date,asc"),
                ("startDateTime", debut_jour.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")),
                ("endDateTime", fin_jour.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")),
            ]
            url = TICKETMASTER_URL + "?" + urllib.parse.urlencode(params)
            try:
                res = cached_json(url, "tm-%s-%s-p%d" % (vid, debut_jour.date(), page),
                                  TM_CACHE_S)
            except urllib.error.HTTPError as e:
                log("  ! Ticketmaster : HTTP %s%s" % (e.code,
                    " (clé refusée)" if e.code in (401, 403) else ""))
                return out
            except Exception as e:                              # noqa: BLE001
                log("  ! Ticketmaster (%s) : %s" % (salle["nom"], e))
                break
            lot = (res.get("_embedded") or {}).get("events") or []
            events += lot
            if len(lot) < size:
                break

        for ev in events:
            start = (ev.get("dates") or {}).get("start") or {}
            if start.get("timeTBA") or start.get("noSpecificTime") or not start.get("localTime"):
                continue                 # sans heure, on ne devine pas la sortie
            try:
                debut = datetime.strptime("%s %s" % (start["localDate"], start["localTime"][:5]),
                                          "%Y-%m-%d %H:%M")
            except (KeyError, ValueError):
                continue

            segment = ""
            for c in ev.get("classifications") or []:
                segment = ((c.get("segment") or {}).get("name") or "")
                if segment:
                    break
            kind = TM_SEGMENTS.get(segment) or (salle.get("type_defaut") or "concert")
            titre = (ev.get("name") or "").strip().title()

            # « PASS 3 JOURS - PARIS GRAND SLAM 2027 », Accor Arena, aujourd'hui
            # 10 h : ce n'est pas un événement, c'est un abonnement mis en vente,
            # et la date portée est celle de la vente, pas celle du tournoi — qui
            # a lieu en février 2027. Rien n'arrive à l'Accor Arena ce matin-là.
            # Ces fiches commencent toutes par le type de billet ; les vraies,
            # par le nom de l'artiste ou de la compétition.
            if TM_BILLET.match(titre):
                continue
            if kind == "salon":
                # « Paris Games Week 2026 - Billet Daté - Entrée… » : après le
                # tiret, c'est le type de billet, pas l'événement.
                titre = titre.split(" - ")[0].strip() or titre

            # Ticketmaster ne donne que l'heure de DÉBUT, et pour un concert
            # c'est l'ouverture des portes : voir DOORS_TO_SHOW_MIN.
            fin = estimate_end(kind, debut)
            if not (now.replace(tzinfo=None) - timedelta(hours=2)
                    <= fin <= horizon.replace(tzinfo=None)):
                continue
            debut_aff, fin_aff = event_window(kind, debut, fin)
            debut_aff = debut_aff.replace(tzinfo=paris_tz_at(debut_aff))
            fin_aff = fin_aff.replace(tzinfo=paris_tz_at(fin_aff)) if fin_aff else None

            out.append({
                "_key": (salle["code"], debut_aff.strftime("%Y-%m-%d")),
                "_sure": False,          # Ticketmaster ne donne pas la fin
                "id": "ev-%s-%s-tm" % (salle["code"], fin.strftime("%Y%m%d%H%M")),
                "kind": kind,
                "title": titre,
                "venue": salle["nom"],
                "dept": salle["dept"],
                "lat": salle["lat"], "lon": salle["lon"],
                "start": iso(debut_aff),
                "end": iso(fin_aff) if fin_aff else None,
                "volume": rides(cap * HALL_EXIT_AUTO),
                "note": "Ticketmaster",
            })

    log("  Ticketmaster : %d événements retenus dans %d salles"
        % (len(out), len(par_id)))
    return out


# --------------------------------------------------------------------------
# Football : calendrier de Ligue 1 (openfootball, domaine public)
# --------------------------------------------------------------------------

# Ni « Que faire à Paris » ni OpenAgenda ne connaissent les matchs : les clubs
# n'y publient pas. Or un soir de match au Parc des Princes, ce sont 47 000
# personnes qui sortent en vingt minutes — c'est le plus gros événement
# récurrent d'Île-de-France. Les calendriers openfootball sont libres, sans
# clé, et donnent la date et l'heure du coup d'envoi.
#
# Deux limites, documentées dans le README : la Ligue ne fixe les horaires
# qu'environ cinq semaines à l'avance (un match sans heure est ignoré), et le
# fichier est tenu par des bénévoles, donc un report de dernière minute peut
# ne pas y être. La ligne saisie à la main reste prioritaire.
FOOTBALL_URL = ("https://raw.githubusercontent.com/openfootball/football.json/"
                "master/%s/fr.1.json")

# Durée d'un match, échauffement de sortie compris : 1 h 45 de jeu et
# d'arrêts, plus le temps que le stade se vide.
MATCH_DURATION_MIN = 120


def football_season(when):
    """« 2026-27 » : une saison va d'août à juin."""
    y = when.year if when.month >= 7 else when.year - 1
    return "%d-%s" % (y, str(y + 1)[2:])


def fetch_football(days=3):
    """Matchs à domicile des clubs franciliens listés dans equipes.csv."""
    clubs = {}
    for r in read_csv("equipes.csv"):
        key = normalize(r.get("equipe", ""))
        if key:
            clubs[key] = r
    if not clubs:
        return []

    salles = load_salles()
    now = datetime.now(PARIS_TZ)
    horizon = now + timedelta(days=days)
    out = []
    sans_heure = 0

    for season in {football_season(now), football_season(horizon)}:
        try:
            data = http_json(FOOTBALL_URL % season, timeout=30)
        except Exception as e:                                  # noqa: BLE001
            log("  ! Ligue 1 %s : %s" % (season, e))
            continue

        for m in data.get("matches", []):
            home = normalize(m.get("team1") or "")
            club = next((c for k, c in clubs.items() if k and k in home), None)
            if not club:
                continue
            salle = salles.get(club.get("salle", "").strip())
            if not salle:
                log("  ! salle inconnue pour %r" % club.get("equipe"))
                continue
            if not m.get("time"):
                sans_heure += 1          # horaire pas encore fixé par la Ligue
                continue
            try:
                kickoff = datetime.strptime("%s %s" % (m["date"], m["time"]),
                                            "%Y-%m-%d %H:%M")
            except (KeyError, ValueError):
                continue
            end = kickoff + timedelta(minutes=MATCH_DURATION_MIN)
            end = end.replace(tzinfo=paris_tz_at(end))
            if not (now - timedelta(hours=2) <= end <= horizon):
                continue
            cap = int(salle.get("capacite") or 0)
            out.append({
                "_key": (salle["code"], end.strftime("%Y-%m-%d")),
                "_sure": True,           # le coup d'envoi est une heure officielle
                "id": "ev-%s-%s-foot" % (salle["code"], end.strftime("%Y%m%d")),
                "kind": "sport",
                "title": "%s – %s" % (m.get("team1"), m.get("team2")),
                "venue": salle["nom"],
                "dept": salle["dept"],
                "lat": salle["lat"], "lon": salle["lon"],
                "start": iso(end),       # l'heure de sortie, comme le CSV
                "end": None,
                # Un match de championnat remplit le stade : même hypothèse
                # qu'une ligne vérifiée à la main.
                "volume": rides(cap * HALL_EXIT_SURE),
                "note": club.get("competition") or "Ligue 1",
            })
    if sans_heure:
        log("  %d match(s) sans horaire officiel, ignorés" % sans_heure)
    return out


# --------------------------------------------------------------------------
# Fermetures nocturnes : Sytadin (DiRIF)
# --------------------------------------------------------------------------

# AUTORISATION — à ne pas perdre de vue si quelqu'un reprend ce code. Le pied
# de page de sytadin.fr interdit toute reproduction sans accord écrit. La DiRIF
# a été appelée et a autorisé la reprise de l'INFORMATION de fermeture ; ce qui
# reste interdit, c'est la réutilisation de leur CARTE. On ne récupère donc que
# les tableaux, jamais les images ni la cartographie, et la source est citée
# dans l'onglet Infos. Voir le README pour le détail.
#
# C'est de loin la meilleure source trafic du projet : les fermetures de la
# nuit, axe par axe, rédigées pour des humains — « A14 DEUX SENS, entre Orgeval
# et Nanterre ». Une vingtaine par nuit en semaine.
SYTADIN_BASE = "https://www.sytadin.fr/sys/"
SYTADIN_PAGE = SYTADIN_BASE + "fermetures_nocturnes.jsp.html"

# Les fermetures courent de 21 h à 6 h : c'est le titre même du tableau.
SYTADIN_FROM_H = 21
SYTADIN_TO_H = 6

# On ne garde que les GRANDS AXES. Une départementale coupée entre Vaudoy-en-Brie
# et Cerneux, le GPS la contourne tout seul : l'afficher ne fait qu'allonger la
# liste. Ce qui mérite d'être su à l'avance, c'est une autoroute, une nationale
# structurante, le périphérique ou les voies sur berges — là où un détour se
# décide avant de partir, pas au dernier moment.
#
#   A…      autoroutes : A3, A86, A14, A6a…
#   N + 1 à 3 chiffres : nationales structurantes, N118, N13, N406…
#   BP, VSB : périphérique parisien et voies sur berges
#
# Écartés : les départementales (D1004), les bretelles à quatre chiffres
# (N1104, N1014) et la voirie locale (V).
MAJOR_AXIS = re.compile(r"^(?:A\d+[a-z]?|N\d{1,3}|BP|VSB)$", re.I)


def grand_axe(titre):
    mots = (titre or "").split()
    return bool(mots) and bool(MAJOR_AXIS.match(mots[0]))

# Niveau de gêne affiché par la DiRIF → gravité interne. Relevé sur une semaine
# complète, le vocabulaire se limite à ces trois valeurs : Moyen (85 fois),
# Local (42) et Fort (4). Aucune ligne sans niveau, mais le défaut reste
# « high » : une fermeture dont on ne sait rien vaut mieux vue que cachée.
SYTADIN_SEVERITY = {"local": "low", "moyen": "medium", "fort": "high"}

MOIS_FR = {m: i + 1 for i, m in enumerate(
    ["janvier", "février", "mars", "avril", "mai", "juin", "juillet",
     "août", "septembre", "octobre", "novembre", "décembre"])}


class _Fermetures(HTMLParser):
    """Les fermetures sont dans des <table> précédées d'un <h4> (fermetures ou
    travaux). Chaque <tr> porte trois <td> : le niveau de gêne en image, l'axe
    et son sens, puis la description."""

    def __init__(self):
        HTMLParser.__init__(self, convert_charrefs=True)
        self.h4 = ""
        self.buf = ""
        self.titre = False
        self.in_tbody = False
        self.row = None
        self.cell = None
        self.gene = ""
        self.rows = []
        self.liens = []          # (texte du jour, url)
        self.a_href = None
        self.a_txt = ""

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "h4":
            self.titre, self.buf = True, ""
        elif tag == "tbody":
            self.in_tbody = True
        elif tag == "tr" and self.in_tbody:
            self.row, self.gene = [], ""
        elif tag == "td" and self.row is not None:
            self.cell = ""
        elif tag == "img" and self.row is not None and not self.gene:
            self.gene = (a.get("alt") or a.get("title") or "").strip()
        elif tag == "a" and "fermetures_nocturnes" in (a.get("href") or ""):
            self.a_href, self.a_txt = a["href"], ""

    def handle_endtag(self, tag):
        if tag == "h4":
            self.h4 = " ".join(self.buf.split())
            self.titre = False
        elif tag == "tbody":
            self.in_tbody = False
        elif tag == "td" and self.row is not None:
            self.row.append(" ".join((self.cell or "").split()))
            self.cell = None
        elif tag == "tr" and self.row is not None:
            cells = [c for c in self.row if c]
            if len(cells) >= 2:
                self.rows.append({"h4": self.h4, "gene": self.gene,
                                  "axe": cells[0], "desc": cells[1]})
            self.row = None
        elif tag == "a" and self.a_href is not None:
            self.liens.append((" ".join(self.a_txt.split()), self.a_href))
            self.a_href = None

    def handle_data(self, d):
        if self.titre:
            self.buf += d
        if self.cell is not None:
            self.cell += d
        if self.a_href is not None:
            self.a_txt += d


def cached_page(url, max_age_s=6 * 3600):
    """Sytadin ne rafraîchit ses tableaux qu'une fois par jour (c'est écrit
    dans son code source) et ne renvoie pas d'ETag : un cache daté suffit, et
    évite de taper un service public toutes les heures pour rien."""
    os.makedirs(CACHE, exist_ok=True)
    cle = "".join(c for c in url if c.isalnum())[-24:]
    path = os.path.join(CACHE, "page-%s.html.gz" % cle)
    if os.path.exists(path) and time.time() - os.path.getmtime(path) < max_age_s:
        with gzip.open(path, "rt", encoding="utf-8") as f:
            return f.read()
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        html = r.read().decode("utf-8", "replace")
    with gzip.open(path, "wt", encoding="utf-8") as f:
        f.write(html)
    return html


def cached_json(url, nom, max_age_s=6 * 3600):
    """Comme cached_page, mais pour une API qui répond en JSON — et avec un
    NOM de fichier donné par l'appelant plutôt que déduit de l'URL : l'URL de
    la billetterie contient la clé, et une clé n'a rien à faire dans un nom de
    fichier, encore moins dans un cache qu'on recopie d'une exécution à
    l'autre. Seule la réponse est écrite sur le disque.

    Sert à ce qui ne bouge pas à l'échelle de l'heure : une programmation de
    salle est annoncée des semaines à l'avance. Pour la réponse soit servie du
    cache, il faut que l'URL soit STABLE d'une exécution à l'autre — d'où les
    dates arrondies à la journée côté Ticketmaster.                        """
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, "json-%s.json.gz" % nom)
    if os.path.exists(path) and time.time() - os.path.getmtime(path) < max_age_s:
        try:
            with gzip.open(path, "rt", encoding="utf-8") as f:
                return json.load(f)
        except (OSError, ValueError):
            pass                      # cache illisible : on redemande, voilà tout
    res = http_json(url, timeout=45)
    try:
        with gzip.open(path, "wt", encoding="utf-8") as f:
            json.dump(res, f)
    except OSError:
        pass                          # pas de disque : tant pis, on a la réponse
    _purger_json(3 * 86400)
    return res


def _purger_json(age_s):
    # Ces noms de fichiers portent une date — une salle, un jour, une page —
    # donc ils s'accumuleraient. Trois jours suffisent : au-delà, le fichier
    # ne sera plus jamais demandé.
    try:
        for f in os.listdir(CACHE):
            if not f.startswith("json-"):
                continue
            chemin = os.path.join(CACHE, f)
            if time.time() - os.path.getmtime(chemin) > age_s:
                os.remove(chemin)
    except OSError:
        pass


def jour_francais(txt):
    """« lundi 19 octobre 2026 » → date."""
    mots = txt.lower().split()
    try:
        jour = int(mots[1])
        mois = MOIS_FR[mots[2]]
        annee = int(mots[3])
        return datetime(annee, mois, jour)
    except (IndexError, ValueError, KeyError):
        return None


# --- Géocodage des fermetures -------------------------------------------
# Sytadin décrit ses fermetures en toutes lettres — « Entre Nanterre (A86) et
# Pont de Neuilly » — sans coordonnées. Pour que le brief « autour de moi »
# puisse les situer, on géocode le premier lieu reconnu de la description avec
# l'API Adresse de l'État (api-adresse.data.gouv.fr) : gratuite, sans clé, sous
# Licence Ouverte. Chaque nom n'est demandé qu'une fois, le résultat est gardé
# pour toujours dans le cache — les mêmes axes reviennent toutes les semaines.
BAN_URL = "https://api-adresse.data.gouv.fr/search/"
BAN_MIN_SCORE = 0.5

# Boîte englobante de l'Île-de-France élargie : au-delà, c'est une homonymie.
# « Tunnel de Chennevières » renvoyait un tunnel du Havre, avec un score de
# 0,37 — la combinaison score + boîte écarte ce genre de méprise.
IDF_BOX = (48.1, 49.3, 1.4, 3.6)

# Codes de route, à ne pas confondre avec des noms de lieux.
RE_ROUTE = re.compile(r"^(?:[AND]\d+[a-z]?|BP|VSB|RN\d+|D\d+)$", re.I)

# Mots de liaison et vocabulaire routier : ils ouvrent une description sans
# jamais désigner un lieu.
MOTS_VIDES = {
    "entre", "et", "vers", "sortie", "acces", "accès", "bretelle", "echangeur",
    "échangeur", "tunnel", "souterrain", "sens", "deux", "paris", "province",
    "interieur", "intérieur", "exterieur", "extérieur", "travaux", "hors",
    "voie", "circulation", "de", "du", "des", "la", "le", "les", "au", "aux",
    "a", "à", "n", "no", "n°", "sur", "dans", "forum",
}

def _geo_cache():
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, "geocodage.json")
    if os.path.exists(path):
        try:
            with open(path, encoding="utf-8") as f:
                return path, json.load(f)
        except ValueError:
            pass
    return path, {}


def geocode(nom, cache):
    """(lat, lon, département) d'un lieu francilien, ou None.

    Le département vient du code postal que l'API Adresse renvoie déjà : pas
    un appel de plus, et c'est lui qui permet ensuite de filtrer les
    fermetures par département. `cache` est partagé par l'appelant pour
    n'écrire le fichier qu'une fois."""
    cle = nom.lower().strip()
    if cle in cache:
        v = cache[cle]
        return tuple(v) if v else None
    params = {"q": nom, "limit": 1, "lat": 48.85, "lon": 2.35}
    try:
        res = http_json(BAN_URL + "?" + urllib.parse.urlencode(params), timeout=20)
    except Exception:                                           # noqa: BLE001
        return None                      # on ne mémorise pas un échec réseau
    trouve = None
    for f in res.get("features", [])[:1]:
        props, geo = f.get("properties", {}), f.get("geometry", {})
        coords = geo.get("coordinates") or []
        if len(coords) != 2 or (props.get("score") or 0) < BAN_MIN_SCORE:
            continue
        lon, lat = float(coords[0]), float(coords[1])
        if not (IDF_BOX[0] <= lat <= IDF_BOX[1] and IDF_BOX[2] <= lon <= IDF_BOX[3]):
            continue
        cp = str(props.get("postcode") or "")
        dept = cp[:2] if cp[:2] in IDF_DEPTS else ""
        trouve = (round(lat, 5), round(lon, 5), dept)
    cache[cle] = list(trouve) if trouve else None
    return trouve


def lieux_candidats(texte):
    """« Entre Nanterre (A86) et Pont de Neuilly (24h/24) » → ['Nanterre',
    'Pont de Neuilly'].

    On découpe D'ABORD sur les séparateurs, et on nettoie chaque morceau
    ensuite. Une première version cherchait directement des suites de mots
    capitalisés : elle ramenait « Entre Nanterre » et « Roissy-en-France A3
    vers province », que le géocodeur ne reconnaissait évidemment pas."""
    texte = re.sub(r"24\s*h\s*/\s*24", " ", texte, flags=re.I)
    morceaux = re.split(r"[(),/]|\bentre\b|\bet\b|\bà\b", texte, flags=re.I)

    out = []
    for brut in morceaux:
        mot = brut.strip(" -'’.\t")
        mot = re.sub(r"^[ld]['’]", "", mot, flags=re.I)        # l'Hay → Hay
        mots = [m for m in mot.split() if m.lower() not in MOTS_VIDES]
        mot = " ".join(mots).strip(" -'’")
        # « D19-Créteil » : le nom de commune suit le code de route, collé.
        tiret = re.match(r"^[AND]\d+\s*-\s*(.+)$", mot, re.I)
        if tiret:
            mot = tiret.group(1).strip()
        mot = re.sub(r"\b(?:n[°o]?\s*)?\d+\b", " ", mot)      # échangeur 2
        mot = " ".join(m for m in mot.split() if not RE_ROUTE.match(m)).strip(" -'’")
        if len(mot) < 4 or not any(c.isupper() for c in mot):
            continue
        if mot not in out:
            out.append(mot)
    return out


def fetch_sytadin(days=3):
    """Fermetures nocturnes des prochaines nuits, telles que la DiRIF les
    publie. Si le site ne répond pas, la source disparaît sans bruit."""
    try:
        accueil = cached_page(SYTADIN_PAGE)
    except Exception as e:                                      # noqa: BLE001
        log("  ! Sytadin : %s" % e)
        return []

    index = _Fermetures()
    index.feed(accueil)
    aujourdhui = datetime.now(PARIS_TZ).replace(tzinfo=None, hour=0, minute=0,
                                                second=0, microsecond=0)
    pages = []
    vus = set()
    for texte, href in index.liens:
        d = jour_francais(texte)
        if not d or d in vus:
            continue
        if not (aujourdhui <= d <= aujourdhui + timedelta(days=days)):
            continue
        vus.add(d)
        pages.append((d, urllib.parse.urljoin(SYTADIN_BASE, href)))

    geo_path, geo = _geo_cache()
    nouveaux = 0
    out = []
    # Les fermetures permanentes reviennent à l'identique sur chaque page de
    # la semaine : on les regroupe au lieu de les répéter sept fois.
    continus = {}
    for d, url in sorted(pages):
        try:
            html_jour = cached_page(url)
        except Exception as e:                                  # noqa: BLE001
            log("  ! Sytadin %s : %s" % (d.date(), e))
            continue
        p = _Fermetures()
        p.feed(html_jour)
        debut = d.replace(hour=SYTADIN_FROM_H)
        fin = d + timedelta(days=1)
        fin = fin.replace(hour=SYTADIN_TO_H)
        for r in p.rows:
            travaux = "travaux" in r["h4"].lower()
            detail = r["desc"]
            if travaux:
                detail = "Travaux — " + detail

            point = None
            for nom in lieux_candidats(r["desc"]):
                avant = len(geo)
                point = geocode(nom, geo)
                nouveaux += len(geo) - avant
                if point:
                    break

            if not grand_axe(r["axe"]):
                continue                 # départementale ou voirie locale

            # Une bretelle fermée 24h/24 n'est pas la fermeture du soir : elle
            # ne commence pas à 21 h et ne rouvre pas à 6 h, donc le bandeau
            # « 21h00 → 06h00 » serait faux. La cacher pour autant laissait
            # l'écran vide tout le week-end : du vendredi au dimanche, c'est
            # TOUT ce que la DiRIF publie — dont l'A14 vers Paris entre
            # Nanterre et le pont de Neuilly. On la garde donc à part, sans
            # horaire inventé : l'app écrit « en continu ».
            permanent = bool(re.search(r"24\s*h\s*/\s*24", r["desc"], re.I))
            if permanent:
                detail = re.sub(r"\s*\(\s*24\s*h\s*/\s*24\s*\)\s*$", "",
                                detail).strip()

            ferm = {
                "id": "syt-%s-%d" % (d.strftime("%m%d"), len(out)),
                "kind": "nuit",
                "title": r["axe"],
                "detail": detail,
                "dept": "",
                "days": "",
                "severity": SYTADIN_SEVERITY.get(r["gene"].lower(), "high"),
                "road": r["axe"].split()[0] if r["axe"].split() else "",
                "from": iso(debut.replace(tzinfo=paris_tz_at(debut))),
                "to": iso(fin.replace(tzinfo=paris_tz_at(fin))),
            }
            if point:
                ferm["lat"], ferm["lon"] = point[0], point[1]
                if len(point) > 2 and point[2]:
                    ferm["dept"] = point[2]

            if permanent:
                # Valable du premier au dernier jour où Sytadin l'annonce : si
                # elle disparaît de leurs pages, elle disparaît de l'app sans
                # qu'on ait eu à deviner une date de réouverture.
                cle = (r["axe"], detail.lower())
                debut_jour = d.replace(hour=0)
                garde = continus.get(cle)
                if garde:
                    garde["to"] = ferm["to"]
                    continue
                ferm["id"] = "syt-continu-%d" % len(continus)
                ferm["kind"] = "continu"
                ferm["continu"] = True
                ferm["from"] = iso(debut_jour.replace(tzinfo=paris_tz_at(debut_jour)))
                continus[cle] = ferm
                continue

            out.append(ferm)

    if nouveaux:
        with open(geo_path, "w", encoding="utf-8") as f:
            json.dump(geo, f, ensure_ascii=False, separators=(",", ":"))
        log("  %d lieu(x) géocodé(s) et mis en cache" % nouveaux)
    out.extend(continus.values())
    situes = sum(1 for c in out if "lat" in c)
    log("  %d fermetures Sytadin (dont %d en continu), %d situées"
        % (len(out), len(continus), situes))
    return out


# --------------------------------------------------------------------------
# Trafic : perturbations du réseau routier national en Île-de-France
# --------------------------------------------------------------------------

# Sytadin affiche exactement ce qu'il faut — les fermetures de la nuit, bien
# rédigées — mais son site porte la mention « Toute reproduction interdite sans
# l'accord écrit préalable de la DiRIF ». On ne le recopie donc pas.
#
# La même direction des routes alimente en revanche le flux DATEX II national
# publié sur transport.data.gouv.fr, sous Licence Ouverte et sans clé. On y
# retrouve ses perturbations avec le numéro de route, la commune, le
# département, les coordonnées et les dates — parfois avec un texte lisible,
# souvent sans, d'où le libellé reconstruit plus bas.
#
# Ce que ça donne et ce que ça ne donne pas : des perturbations qui durent
# (chantiers de plusieurs semaines, bretelles fermées 24h/24), pas le détail
# des fermetures nocturnes récurrentes — le flux ne porte aucune période
# récurrente. Pour un chauffeur c'est complémentaire : une bretelle fermée
# pendant un mois, un GPS ne la signale qu'une fois qu'on est dessus.
DATEX_EVENTS_URL = "https://transport.data.gouv.fr/resources/79174/download"
DATEX_SOURCE = "DIR Île-de-France"
D2 = "{http://datex2.eu/schema/2/2_0}"

IDF_DEPTS = ("75", "77", "78", "91", "92", "93", "94", "95")


def datex_text(parent, want):
    """Les commentaires DATEX sont typés : description, locationDescriptor…"""
    out = []
    for bloc in parent.iter():
        if bloc.tag.split("}")[-1] not in ("generalPublicComment", "comment"):
            continue
        ctype = bloc.find(".//" + D2 + "commentType")
        val = bloc.find(".//" + D2 + "value")
        if val is None or not (val.text or "").strip():
            continue
        if ctype is not None and (ctype.text or "").strip() == want:
            out.append(val.text.strip())
    return out


def parse_datex(raw):
    """Garde les situations de la DiRIF et n'en retient que l'utile."""
    root = ET.fromstring(raw)
    out = []
    for sit in root.iter():
        if sit.tag.split("}")[-1] != "situation":
            continue
        if DATEX_SOURCE not in ET.tostring(sit, encoding="unicode"):
            continue

        champs = {}
        route = ville = ""
        noeuds = list(sit.iter())
        for i, e in enumerate(noeuds):
            nom, val = e.tag.split("}")[-1], (e.text or "").strip()
            if not val:
                continue
            if nom in ("overallSeverity", "overallStartTime", "overallEndTime",
                       "latitude", "longitude", "externalLocationCode",
                       "referentIdentifier") and nom not in champs:
                champs[nom] = val
            # « value » puis « tpegOtherPointDescriptorType » : le type suit la valeur
            if nom == "tpegOtherPointDescriptorType":
                for j in range(max(0, i - 4), i):
                    prec = noeuds[j]
                    if prec.tag.split("}")[-1] == "value" and (prec.text or "").strip():
                        if val == "linkName" and not route:
                            route = prec.text.strip()
                        elif val == "townName" and not ville:
                            ville = prec.text.strip()

        desc = datex_text(sit, "description")
        lieu = datex_text(sit, "locationDescriptor")
        out.append({
            "route": route, "ville": ville,
            "desc": desc[0] if desc else "",
            "lieu": [x for x in lieu if x != DATEX_SOURCE],
            "sev": champs.get("overallSeverity", ""),
            "from": champs.get("overallStartTime", ""),
            "to": champs.get("overallEndTime", ""),
            "lat": champs.get("latitude"), "lon": champs.get("longitude"),
            "code": champs.get("externalLocationCode") or champs.get("referentIdentifier", ""),
        })
    return out


def iso_datex(txt):
    """« 2026-10-18T10:00:00.000+02:00 » → datetime, ou None."""
    if not txt or len(txt) < 19:
        return None
    try:
        base = datetime.strptime(txt[:19], "%Y-%m-%dT%H:%M:%S")
    except ValueError:
        return None
    signe = txt[-6:]
    if len(signe) == 6 and signe[0] in "+-" and signe[3] == ":":
        mins = int(signe[1:3]) * 60 + int(signe[4:6])
        return base.replace(tzinfo=timezone(timedelta(
            minutes=-mins if signe[0] == "-" else mins)))
    return base.replace(tzinfo=paris_tz_at(base))


def fetch_roadworks(days=14):
    """Perturbations en cours ou à venir sur le réseau national francilien."""
    try:
        rows = cached_extract(DATEX_EVENTS_URL, parse_datex, "datex")
    except Exception as e:                                      # noqa: BLE001
        log("  ! trafic DATEX : %s" % e)
        return []

    now = datetime.now(PARIS_TZ)
    horizon = now + timedelta(days=days)
    out = []
    for i, r in enumerate(rows):
        debut, fin = iso_datex(r["from"]), iso_datex(r["to"])
        if not debut:
            continue
        if fin and fin < now:
            continue                      # terminé
        if debut > horizon:
            continue                      # trop loin pour intéresser ce soir

        # Le texte de la DiRIF quand il existe, sinon on reconstruit à partir
        # du lieu : « sur bretelle de sortie », « De Les Ulis vers Sèvres ».
        detail = r["desc"]
        if not detail or len(detail) < 12:
            morceaux = [x for x in r["lieu"] if not x.startswith("Point particulier")]
            detail = " — ".join(morceaux[:2])
        titre = " ".join(x for x in (r["route"], ("à " + r["ville"]) if r["ville"] else "") if x)
        if not titre.strip() or not grand_axe(titre):
            continue

        dept = r["code"][:2] if r["code"][:2] in IDF_DEPTS else ""
        try:
            lat, lon = float(r["lat"]), float(r["lon"])
        except (TypeError, ValueError):
            continue
        out.append({
            "id": "dx-%d" % i,
            "kind": "chantier",
            "title": titre.strip(),
            "detail": detail.strip(),
            "dept": dept,
            "days": "",
            "lat": lat, "lon": lon,
            "severity": r["sev"],
            "from": iso(debut.astimezone(PARIS_TZ)),
            "to": iso(fin.astimezone(PARIS_TZ)) if fin else iso(horizon),
        })
    return out


# --------------------------------------------------------------------------
# Météo
# --------------------------------------------------------------------------
# Il pleut, tout le monde commande : c'est le signal de demande le plus simple
# qui soit, et le seul qu'on n'exploitait pas.
#
# Open-Meteo : gratuit, sans clé, sans inscription, sans quota affiché, et il
# répond en une demi-seconde. On lui demande l'heure par heure sur 36 heures,
# déjà convertie en heure de Paris — pas de fuseau à recalculer, c'est là que
# ce projet s'est le plus trompé.
#
# Un seul point, Paris centre : l'application n'affiche qu'une icône, et une
# averse à Melun pendant qu'il fait beau à Nanterre, ça n'entre pas dans une
# icône. C'est une limite assumée, écrite dans les Infos.
METEO_URL = "https://api.open-meteo.com/v1/forecast"
METEO_HEURES = 36

# Huit points, un par département : l'application prend le plus proche du
# chauffeur quand il regarde son brief perso, et Paris sinon. Un seul point
# pour toute l'Île-de-France, c'était annoncer le soleil de Nanterre à quelqu'un
# qui roule sous l'averse de Melun — il y avait déjà un degré d'écart entre les
# deux au premier essai. Open-Meteo accepte les points groupés dans une seule
# requête et répond une liste, dans l'ordre demandé.
#
# Paris EN PREMIER : c'est le point par défaut, celui du brief régional.
METEO_POINTS = [
    ("75", 48.8566, 2.3522),      # Paris
    ("92", 48.8920, 2.2070),      # Nanterre
    ("93", 48.9100, 2.4400),      # Bobigny
    ("94", 48.7900, 2.4600),      # Créteil
    ("95", 49.0400, 2.0700),      # Cergy
    ("78", 48.8040, 2.1300),      # Versailles
    ("91", 48.6300, 2.4400),      # Évry
    ("77", 48.5400, 2.6600),      # Melun
]


# Codes OMM (WMO 4677), regroupés dans les cinq états qu'on sait dessiner.
# Au-delà, c'est illisible sur une icône de vingt pixels.
def meteo_etat(code):
    if code in (0,):
        return "soleil"
    if code in (1, 2):
        return "soleil_nuageux"
    if code in (3, 45, 48):
        return "nuageux"
    if code in (71, 73, 75, 77, 85, 86):
        return "neige"
    return "pluie"            # bruine, pluie, averse, orage : même conséquence


def fetch_meteo():
    """Heure par heure et point par point : ciel, température, jour ou nuit.

    Les heures sont communes aux huit points — on ne les écrit qu'une fois,
    chaque point ne porte que ses valeurs. L'application retrouve l'heure
    courante par son indice : les données sont régénérées toutes les heures,
    mais un téléphone peut lire un fichier plus vieux."""
    params = urllib.parse.urlencode({
        "latitude": ",".join(str(p[1]) for p in METEO_POINTS),
        "longitude": ",".join(str(p[2]) for p in METEO_POINTS),
        "hourly": "weather_code,temperature_2m,is_day",
        "timezone": "Europe/Paris",
        "forecast_days": 2,
    })
    try:
        res = http_json(METEO_URL + "?" + params, timeout=25)
    except Exception as e:                                      # noqa: BLE001
        log("  ! météo : %s" % e)
        return {}

    # Un seul point interrogé renverrait un objet, plusieurs une liste.
    blocs = res if isinstance(res, list) else [res]
    if len(blocs) != len(METEO_POINTS):
        log("  ! météo : %d points demandés, %d reçus" % (len(METEO_POINTS), len(blocs)))
        return {}

    debut = datetime.now(PARIS_TZ).replace(minute=0, second=0, microsecond=0,
                                           tzinfo=None)
    fin = debut + timedelta(hours=METEO_HEURES)

    # Les indices à garder sont calculés sur le premier point ; tous les
    # points partagent le même axe de temps, c'est la même requête.
    heures_src = (blocs[0].get("hourly") or {}).get("time") or []
    gardes = []
    heures = []
    for i, t in enumerate(heures_src):
        try:
            quand = datetime.strptime(t, "%Y-%m-%dT%H:%M")
        except ValueError:
            continue
        if debut <= quand <= fin:
            gardes.append(i)
            heures.append(t)
    if not heures:
        return {}

    points = []
    for (dept, lat, lon), bloc in zip(METEO_POINTS, blocs):
        h = bloc.get("hourly") or {}
        codes, temps, jours = (h.get("weather_code") or [],
                               h.get("temperature_2m") or [],
                               h.get("is_day") or [])
        try:
            points.append({
                "dept": dept, "lat": lat, "lon": lon,
                "ciel": [meteo_etat(int(codes[i])) for i in gardes],
                "deg": [int(round(float(temps[i]))) for i in gardes],
                "nuit": [0 if jours[i] else 1 for i in gardes],
            })
        except (IndexError, TypeError, ValueError):
            log("  ! météo : point %s incomplet, ignoré" % dept)
    if not points:
        return {}
    return {"heures": heures, "points": points}


# --------------------------------------------------------------------------
# Fermetures de nuit
# --------------------------------------------------------------------------

def fetch_closures(days=7):
    """Les fermetures franciliennes sont surtout récurrentes : 21h → 5h du
    lundi au vendredi. Une ligne de CSV engendre donc une occurrence par
    nuit concernée, sur les jours à venir."""
    now = datetime.now(PARIS_TZ)
    out = []

    for c in read_csv("fermetures.csv"):
        try:
            h_from = datetime.strptime(c["heure_debut"], "%H:%M").time()
            h_to = datetime.strptime(c["heure_fin"], "%H:%M").time()
        except (KeyError, ValueError):
            log("  ! horaires illisibles : %r" % c.get("titre"))
            continue

        valid_to = None
        if c.get("valide_jusqu_au"):
            try:
                valid_to = datetime.strptime(c["valide_jusqu_au"], "%Y-%m-%d").replace(tzinfo=PARIS_TZ)
            except ValueError:
                pass

        jours = (c.get("jours") or "lun-ven").strip().lower()
        for d in range(days):
            day = (now + timedelta(days=d)).replace(hour=0, minute=0, second=0, microsecond=0)
            if valid_to and day > valid_to + timedelta(days=1):
                continue
            wd = day.weekday()                       # 0 = lundi
            if jours == "lun-ven" and wd > 4:
                continue
            if jours == "week-end" and wd < 5:
                continue

            start = day.replace(hour=h_from.hour, minute=h_from.minute)
            end = day.replace(hour=h_to.hour, minute=h_to.minute)
            if end <= start:                         # franchit minuit
                end += timedelta(days=1)
            if end < now:
                continue
            out.append({
                "id": "cl-%s-%s" % (c.get("id", "x"), day.strftime("%m%d")),
                "kind": "nuit",
                "title": c["titre"].strip(),
                "detail": (c.get("detail") or "").strip(),
                "dept": (c.get("dept") or "").strip(),
                "days": jours,
                "from": iso(start),
                "to": iso(end),
            })
    return out


# --------------------------------------------------------------------------
# Zones : de quelle commune — donc de quel département — on est le plus proche
# --------------------------------------------------------------------------

# L'onglet « Où aller » s'ouvre sur le département où se trouve le chauffeur.
# Pour le deviner SANS envoyer sa position à qui que ce soit, on embarque le
# centre des 1 266 communes franciliennes : l'application cherche la plus
# proche, en local. C'est 27 Ko, 7 Ko une fois compressés, et ça ne bouge
# jamais — les limites communales changent une fois par décennie.
#
# L'alternative aurait été un géocodage inverse à chaque ouverture : exact,
# mais ça revenait à envoyer la position du chauffeur à un serveur, après lui
# avoir promis le contraire.
ZONES_URL = ("https://geo.api.gouv.fr/departements/%s/communes"
             "?fields=nom,codeDepartement,centre&format=json")


def fetch_communes():
    """Centre de chaque commune d'Île-de-France : (lat, lon, département, nom).

    Sert deux fois : à l'application pour deviner le département depuis la
    position, et au script pour nommer la commune d'une toilette OSM."""
    out = []
    for dep in IDF_DEPTS:
        try:
            communes = http_json(ZONES_URL % dep, timeout=40)
        except Exception as e:                                  # noqa: BLE001
            log("  ! communes %s : %s" % (dep, e))
            continue
        for c in communes:
            pt = (c.get("centre") or {}).get("coordinates")
            if not pt or len(pt) != 2:
                continue
            out.append((round(pt[1], 4), round(pt[0], 4),
                        c["codeDepartement"], c.get("nom") or ""))
    return out


def zones_pour_app(communes):
    """Le nom ne sert pas à l'application : on ne lui envoie que le point et
    le département, soit 7 Ko compressés au lieu de 20."""
    return [[lat, lon, dep] for lat, lon, dep, _ in communes]


# --------------------------------------------------------------------------
# Lieux
# --------------------------------------------------------------------------

# Le fichier de la Ville publie des horaires manifestement faux : « 23h57 -
# 23h58 », « 06h00 - 06h02 », « 21h59 - 22h00 » — des plages d'une à deux
# minutes. Aucune sanisette n'ouvre deux minutes par jour ; ce sont des relevés
# d'automate, pas un horaire d'ouverture.
#
# On ne les corrige pas en « 24h/24 » : la source ne le dit nulle part, et
# envoyer quelqu'un à trois heures du matin sur une supposition serait pire que
# de ne rien écrire. L'application affiche donc « horaires inconnus », ce qui
# est exactement ce qu'on sait.
#
# Le seuil est à trois heures, et ce n'est pas arbitraire : en dessous, le
# fichier ne contient que deux familles de valeurs, l'une et l'autre
# invraisemblables — douze plages d'une à deux minutes, et treize « 00h00 -
# 01h00 ». La plus courte plage crédible publiée dépasse les trois heures, donc
# le seuil n'écarte rien de légitime.
HORAIRE_MINI_MIN = 180


def horaire_credible(h):
    """Le libellé d'horaire s'il veut dire quelque chose, sinon une chaîne vide."""
    m = re.match(r"^\s*(\d{1,2})h(\d{2})\s*-\s*(\d{1,2})h(\d{2})\s*$", h or "")
    if not m:
        return (h or "").strip()          # « 24/24h », « Horaires du parc »…
    debut = int(m.group(1)) * 60 + int(m.group(2))
    fin = int(m.group(3)) * 60 + int(m.group(4))
    if fin <= debut:
        fin += 1440                        # franchit minuit
    return h.strip() if fin - debut >= HORAIRE_MINI_MIN else ""


def fetch_toilets():
    """Sanisettes de la Ville de Paris : données ouvertes, sans clé."""
    out, offset = [], 0
    while offset < 1000:
        url = ("https://opendata.paris.fr/api/explore/v2.1/catalog/datasets/"
               "sanisettesparis/records?limit=100&offset=%d" % offset)
        try:
            res = http_json(url)
        except Exception as e:                                  # noqa: BLE001
            log("  ! sanisettes : %s" % e)
            break
        rows = res.get("results", [])
        if not rows:
            break
        for r in rows:
            if r.get("statut") != "En service":
                continue
            pt = r.get("geo_point_2d") or {}
            if not pt.get("lat"):
                continue
            horaire = horaire_credible((r.get("horaire") or "").strip())
            arr = (r.get("arrondissement") or "").strip()
            out.append({
                # L'identifiant est construit sur les COORDONNÉES, jamais sur
                # le rang dans la liste : il sert aux favoris, qui vivent sur
                # le téléphone et doivent survivre à la reconstruction
                # hebdomadaire. Une sanisette retirée du jeu de données
                # décalait tous les rangs suivants — et chaque favori
                # désignait alors la sanisette d'à côté.
                "id": "wc%.5f_%.5f" % (pt["lat"], pt["lon"]),
                "name": (r.get("adresse") or "Sanisette").strip().title(),
                "address": "Paris %s" % (arr[-2:].lstrip("0") + "e" if arr.startswith("75") else arr),
                "dept": "75",
                "lat": round(pt["lat"], 6), "lon": round(pt["lon"], 6),
                "h24": horaire == "24/24h",
                "open_label": horaire or None,
                "pmr": r.get("acces_pmr") == "Oui",
                "bebe": r.get("relais_bebe") == "Oui",
            })
        offset += 100
        if offset >= res.get("total_count", 0):
            break
    return out


# --- Toilettes de banlieue : OpenStreetMap -------------------------------
# Les sanisettes de la Ville de Paris s'arrêtent au périphérique. Au-delà,
# aucune collectivité francilienne ne publie ses toilettes — vérifié sur
# data.gouv, où l'on ne trouve que Dijon, Angers ou Le Havre. La seule
# couverture de banlieue est OpenStreetMap : 1 360 points en accès public
# hors Paris, contre zéro ailleurs.
#
# Le contrat est clair, et il faut le dire dans l'application : ce sont des
# contributions, pas un registre. Le NOM manque presque toujours, et surtout
# les HORAIRES : à peine une sur dix en porte. On affiche donc la commune et
# la distance, et « 24h/24 » seulement quand c'est écrit. Un chauffeur
# préviendra toujours mieux qu'un fichier : c'est à ça que sert manger.csv.
# Plusieurs instances Overpass, essayées dans l'ordre : le service est tenu
# par des bénévoles et tombe régulièrement. Celle d'OpenStreetMap France est
# en tête — c'est la plus proche des données qui nous intéressent, et la seule
# qui accepte la poignée de main TLS des Python un peu anciens.
OVERPASS_MIRRORS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.osm.ch/api/interpreter",
    "https://overpass.openstreetmap.fr/api/interpreter",
]
OVERPASS_WC = ('[out:json][timeout:180];'
               'nwr["amenity"="toilets"](48.12,1.45,49.24,3.56);'
               'out center tags;')

# Un « access » absent veut dire ouvert à tous dans la pratique ; on écarte
# les toilettes de clients, privées ou réservées.
WC_ACCESS_OK = ("", "yes", "public", "permissive")


# --------------------------------------------------------------------------
# Adresses : géocodage inverse officiel
# --------------------------------------------------------------------------
# OpenStreetMap donne des coordonnées, rarement une adresse. On déduisait donc
# la commune du centre communal le plus proche — et c'était faux dès qu'on
# approchait d'une grande commune : le Burger King de la porte d'Orléans, qui
# est au 80 avenue du Général-Leclerc à PARIS 14e, était annoncé à Montrouge,
# dont le centre est à un kilomètre quand celui de Paris est à cinq. Même
# erreur à Saint-Mandé pour trois adresses du 12e.
#
# La Base Adresse Nationale fait ça correctement, gratuitement et sans clé :
# son point d'entrée CSV prend un fichier de coordonnées et rend l'adresse, le
# code postal, la commune et le code INSEE — cinq points en 0,2 s. On garde
# tout en cache : une adresse ne bouge pas.
BAN_REVERSE_URL = "https://api-adresse.data.gouv.fr/reverse/csv/"
BAN_LOT = 1000                         # points par requête


def _multipart(champs, fichier):
    """Construit un corps multipart/form-data à la main (pas de dépendance)."""
    limite = "----vtcidf%d" % int(time.time())
    corps = []
    for cle, val in champs.items():
        corps.append("--%s\r\nContent-Disposition: form-data; name=\"%s\"\r\n\r\n%s\r\n"
                     % (limite, cle, val))
    nom, contenu = fichier
    corps.append("--%s\r\nContent-Disposition: form-data; name=\"data\"; "
                 "filename=\"%s\"\r\nContent-Type: text/csv\r\n\r\n%s\r\n"
                 % (limite, nom, contenu))
    corps.append("--%s--\r\n" % limite)
    return ("multipart/form-data; boundary=%s" % limite,
            "".join(corps).encode("utf-8"))


def _reverse_cache():
    """Le cache des adresses, amorcé au besoin par la copie livrée.

    Une adresse ne change pas : repartir de zéro sur une machine neuve, c'est
    deux mille huit cents interrogations de la BAN pour réapprendre ce qu'on
    sait déjà. La copie du projet évite ça, et les points qu'elle ne connaît pas
    sont demandés normalement."""
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, "adresses.json")
    for source in (path, os.path.join(GRAINE, "adresses.json")):
        if os.path.exists(source):
            try:
                with open(source, encoding="utf-8") as f:
                    return path, json.load(f)
            except Exception:                                   # noqa: BLE001
                pass
    return path, {}


def ban_reverse(points):
    """[(lat, lon)] → {"lat,lon": {"adresse":…, "ville":…, "dept":…}}.

    Ce qui n'est pas trouvé n'est pas inventé : la clé est simplement absente,
    et l'appelant se rabat sur la commune la plus proche."""
    path, cache = _reverse_cache()
    manquants = []
    for lat, lon in points:
        cle = "%.5f,%.5f" % (lat, lon)
        if cle not in cache:
            manquants.append((cle, lat, lon))
    if manquants:
        log("  %d adresse(s) à résoudre auprès de la BAN" % len(manquants))
    for i in range(0, len(manquants), BAN_LOT):
        lot = manquants[i:i + BAN_LOT]
        csv_txt = "lat,lon\n" + "\n".join("%s,%s" % (la, lo) for _, la, lo in lot)
        ctype, corps = _multipart({"latitude": "lat", "longitude": "lon"},
                                  ("points.csv", csv_txt))
        req = urllib.request.Request(BAN_REVERSE_URL, data=corps,
                                     headers={"Content-Type": ctype, "User-Agent": UA})
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                texte = r.read().decode("utf-8", "replace")
        except Exception as e:                                  # noqa: BLE001
            log("  ! BAN inverse : %s" % e)
            break
        lignes = list(csv.DictReader(io.StringIO(texte)))
        for (cle, _, _), ligne in zip(lot, lignes):
            ville = (ligne.get("result_district") or ligne.get("result_city") or "").strip()
            ville = re.sub(r"\s+Arrondissement$", "", ville)   # « Paris 14e » suffit
            code = (ligne.get("result_citycode") or "").strip()
            if not ville:
                # On retient aussi les échecs : sans ça, une vingtaine de points
                # en pleine forêt étaient redemandés à chaque build.
                cache[cle] = {}
                continue
            cache[cle] = {
                "adresse": (ligne.get("result_name") or "").strip(),
                "ville": ville,
                "dept": code[:2] if len(code) >= 2 else "",
            }
        time.sleep(1)                   # on ne martyrise pas un service public
    if manquants:
        with open(path, "w", encoding="utf-8") as f:
            json.dump(cache, f, ensure_ascii=False, separators=(",", ":"))
    return cache


def situer(lat, lon, adresses, communes, tags=None):
    """(adresse, ville, département) d'un point, du plus sûr au moins sûr.

    1. ce que la fiche OpenStreetMap dit elle-même ;
    2. la Base Adresse Nationale ;
    3. à défaut, la commune la plus proche — approximatif, et c'est pour ça
       que ça vient en dernier.
    """
    t = tags or {}
    rue = " ".join(x for x in [(t.get("addr:housenumber") or "").strip(),
                               (t.get("addr:street") or "").strip()] if x)
    ban = adresses.get("%.5f,%.5f" % (lat, lon)) or {}
    ville = ban.get("ville") or (t.get("addr:city") or "").strip()
    dept = ban.get("dept") or (t.get("addr:postcode") or "")[:2]
    if not ville or not dept:
        nom_commune, dep_commune = commune_la_plus_proche(lat, lon, communes)
        ville = ville or nom_commune
        dept = dept or dep_commune
    return (rue or ban.get("adresse") or ""), ville, dept


def commune_la_plus_proche(lat, lon, communes):
    """(nom, département) de la commune dont le centre est le plus proche."""
    best, bd = None, 1e9
    for c_lat, c_lon, dep, nom in communes:
        dlat = c_lat - lat
        dlon = (c_lon - lon) * 0.66
        d = dlat * dlat + dlon * dlon
        if d < bd:
            bd, best = d, (nom, dep)
    return best or ("", "")


# Copies de secours livrées avec le projet : elles ne servent que lorsqu'il n'y
# a ni réponse fraîche ni cache. Voir `overpass` et `_reverse_cache`.
GRAINE = os.path.join(HERE, "graine")


def overpass(requete, nom, max_age_s=7 * 86400):
    """Interroge Overpass en changeant de miroir, et garde la réponse.

    OpenStreetMap ne bouge pas d'un jour à l'autre, et les miroirs publics
    refusent deux grosses requêtes à la suite — observé ici même : les
    toilettes passent, les fast-foods qui suivent reçoivent des 500. Une
    semaine de cache règle les deux, et évite de taper quatre fois par jour un
    service tenu par des bénévoles.
    """
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, "overpass-%s.json.gz" % nom)
    if os.path.exists(path) and time.time() - os.path.getmtime(path) < max_age_s:
        with gzip.open(path, "rt", encoding="utf-8") as f:
            return json.load(f)

    for miroir in OVERPASS_MIRRORS:
        url = miroir + "?" + urllib.parse.urlencode({"data": requete})
        try:
            res = http_json(url, timeout=280)
        except Exception as e:                                  # noqa: BLE001
            log("  ! Overpass %s : %s" % (miroir.split("/")[2], e))
            continue
        # Un miroir peut répondre 200 avec une liste vide — base incomplète ou
        # requête abandonnée de son côté. Observé ici : on aurait mis en cache
        # zéro toilette pour une semaine. Une réponse vide n'est pas une
        # réponse : on passe au miroir suivant.
        if not (res.get("elements") if isinstance(res, dict) else None):
            log("  ! Overpass %s : réponse vide, miroir suivant"
                % miroir.split("/")[2])
            continue
        with gzip.open(path, "wt", encoding="utf-8") as f:
            json.dump(res, f, ensure_ascii=False)
        return res

    # Tous les miroirs ont refusé : on se rabat sur la dernière réponse
    # connue, même périmée. Des toilettes d'il y a trois semaines valent mieux
    # qu'un écran vide.
    if os.path.exists(path):
        log("  ! Overpass injoignable : on garde la réponse du %s"
            % time.strftime("%d/%m", time.localtime(os.path.getmtime(path))))
        with gzip.open(path, "rt", encoding="utf-8") as f:
            return json.load(f)

    # Et s'il n'y a même pas de cache — première exécution sur une machine
    # neuve — il reste la copie livrée avec le projet. C'est exactement ce qui
    # s'est produit au premier passage sur GitHub : les cinq miroirs ont
    # refusé, et l'application s'est retrouvée sans toilettes de banlieue ni
    # fast-foods de nuit. Cette copie n'est jamais préférée à une réponse
    # fraîche : dès qu'un miroir répond, elle est oubliée.
    graine = os.path.join(GRAINE, "overpass-%s.json.gz" % nom)
    if os.path.exists(graine):
        log("  ! Overpass injoignable et pas de cache : copie livrée avec le projet")
        with gzip.open(graine, "rt", encoding="utf-8") as f:
            return json.load(f)
    return None


def adresses_osm(res):
    """Résout en une fois les adresses de tous les points d'une réponse
    Overpass. Le cache fait que seuls les nouveaux points coûtent une
    requête — d'un build à l'autre, il n'y en a pratiquement aucun."""
    pts = []
    for el in res.get("elements", []):
        centre = el.get("center") or {}
        lat = centre.get("lat", el.get("lat"))
        lon = centre.get("lon", el.get("lon"))
        if lat is not None and lon is not None:
            pts.append((round(float(lat), 5), round(float(lon), 5)))
    return ban_reverse(pts)


def fetch_toilets_osm(communes):
    """Toilettes publiques d'Île-de-France hors Paris, d'après OpenStreetMap.

    Paris garde ses sanisettes : le fichier de la Ville est plus riche
    (statut, horaires, accès PMR, table à langer) et éviter le doublon vaut
    mieux que d'additionner deux sources sur le même trottoir."""
    if not communes:
        return []
    res = overpass(OVERPASS_WC, "toilettes")
    if res is None:
        return []
    return parse_toilets_osm(res, communes, adresses_osm(res))


# --------------------------------------------------------------------------
# Manger la nuit
# --------------------------------------------------------------------------
# À deux heures du matin, la question n'est pas « où bien manger » mais « qu'est-ce
# qui est encore ouvert ». OpenStreetMap connaît 7 200 fast-foods en Île-de-France,
# dont 2 600 avec leurs horaires — 42 %, c'est partiel mais c'est beaucoup : il
# en reste près de 1 100 ouverts entre 23 h et 6 h, dont 583 après minuit.
#
# On ne garde que ceux-là. Un fast-food qui ferme à 22 h n'a rien à faire dans
# une application de chauffeur de nuit.
OVERPASS_MANGER = ('[out:json][timeout:240];'
                   'nwr["amenity"="fast_food"]["opening_hours"]'
                   '(48.12,1.45,49.24,3.56);'
                   'out center tags;')

# Les courses de nuit : supérettes, supermarchés, et les boutiques de stations
# service — qui sont, à trois heures du matin, le seul endroit ouvert dans
# beaucoup de communes. Même filtre que les fast-foods : on ne garde que ce qui
# vit après 23 h. Mesuré sur l'Île-de-France : 4 549 commerces portent des
# horaires, 882 passent minuit, dont 661 ouverts 24h/24 — et la moitié sont des
# stations.
OVERPASS_COURSES = ('[out:json][timeout:240];'
                    'nwr["shop"~"^(supermarket|convenience)$"]["opening_hours"]'
                    '(48.12,1.45,49.24,3.56);'
                    'out center tags;')

# ---- Les stations : plus d'OpenStreetMap, le fichier officiel ------------
# Première version : toutes les stations-service d'OpenStreetMap ouvertes la
# nuit, soit 554 points. Le chauffeur a tranché, et il avait les chiffres du
# terrain : « à part celle de l'A1 dans le 93, aucune station Carrefour n'ouvre
# la nuit ». Ce qu'on affichait venait de `opening_hours` posé sur un nœud
# `amenity=fuel` — c'est-à-dire, neuf fois sur dix, l'horaire des POMPES. Un
# automate 24h/24 ne vend pas de sandwich.
#
# Le fichier officiel des prix des carburants dit, lui, ce qu'on veut savoir :
#   pop                     R (route) ou A (autoroute) — le filtre demandé ;
#   services_service        « Boutique alimentaire », « Toilettes publiques » ;
#   horaires                les horaires de la STATION, jour par jour.
# Gratuit, sans clé, licence ouverte. Mesuré en Île-de-France : 827 stations,
# dont 38 sur autoroute, dont 31 avec une boutique alimentaire — et parmi
# elles l'aire de La Courneuve sur l'A1, exactement celle que le chauffeur
# citait de mémoire.
PRIX_CARBURANTS = ("https://data.economie.gouv.fr/api/explore/v2.1/catalog/"
                   "datasets/prix-des-carburants-en-france-flux-instantane-v2/records")

# ---- Les catégories, et pourquoi celles-là ------------------------------
# Un chauffeur qui cherche à manger à deux heures du matin ne cherche pas « un
# restaurant » : il cherche soit du sûr (une chaîne : il sait ce qu'il trouve,
# il y a un parking et des toilettes), soit du rapide et pas cher (grec,
# tacos, sandwich), soit de quoi tenir jusqu'au matin (supérette, station).
# Ces catégories-là se déduisent des étiquettes d'OpenStreetMap ; les autres
# — « healthy », « poke », « bagel » — n'ont pas de sens à cette heure-là et
# retombent dans « autre », visible sous « Tout ».
CHAINES = {
    "mcdonald's", "mcdonalds", "burger king", "kfc", "quick", "subway",
    "o'tacos", "otacos", "domino's pizza", "domino's", "pizza hut",
    "five guys", "big fernand", "class'croute", "pret a manger", "exki",
    "cojean", "sushi shop", "starbucks", "paul", "brioche dorée",
    "la croissanterie", "bagelstein", "pomme de pain", "columbus café",
}
CUISINE_SANDWICH = {"kebab", "sandwich", "turkish", "french_tacos", "lebanese",
                    "tacos", "shawarma"}
CUISINE_ASIAT = {"asian", "chinese", "japanese", "sushi", "thai", "vietnamese",
                 "korean", "poke"}


def categorie(tags):
    """Catégorie d'un lieu, et nom de repli quand la fiche n'en porte pas."""
    boutique = (tags.get("shop") or "").lower()
    if tags.get("amenity") == "fuel" or "gas" in boutique:
        return "station", "Station"
    if boutique:
        return "super", ("Supermarché" if "supermarket" in boutique else "Supérette")

    nom = (tags.get("brand") or tags.get("name") or "").strip().lower()
    if nom in CHAINES:
        return "chaine", "Fast-food"
    cuisines = {c.strip() for c in (tags.get("cuisine") or "").lower().split(";")}
    if cuisines & CUISINE_SANDWICH:
        return "sandwich", "Sandwicherie"
    if "pizza" in cuisines:
        return "pizza", "Pizzeria"
    if cuisines & CUISINE_ASIAT:
        return "asiat", "Restaurant"
    return "autre", "Fast-food"


# On retient un établissement dès qu'il est encore ouvert à 23 h un jour de la
# semaine. L'application, elle, n'affiche que ceux qui sont ouverts à l'heure
# qu'il est.
NUIT_DES = 23 * 60

JOURS_OSM = {"mo": 0, "tu": 1, "we": 2, "th": 3, "fr": 4, "sa": 5, "su": 6}
RE_PLAGE = re.compile(r"(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})")
RE_JOURS = re.compile(r"\b(mo|tu|we|th|fr|sa|su)\b(?:\s*-\s*(mo|tu|we|th|fr|sa|su))?",
                      re.I)


def parse_opening(oh):
    """« Mo-Th 09:00-01:00; Fr-Sa 09:00-02:00 » → ouverture et fermeture par jour.

    Deux listes de sept valeurs, en minutes depuis minuit ; une fermeture
    supérieure à 1440 veut dire « après minuit ». `None` quand c'est fermé.

    Ce n'est pas un analyseur complet de la syntaxe `opening_hours` — elle
    accepte les jours fériés, les semaines paires, les « sunset ». On traite ce
    qui couvre l'écrasante majorité des fiches, et on ignore le reste : une
    fiche mal comprise est une fiche absente, jamais une fiche fausse.
    """
    texte = (oh or "").strip()
    if not texte:
        return None, None
    if re.sub(r"\s", "", texte) == "24/7":
        return [0] * 7, [1440] * 7

    ouverts = [None] * 7
    fermes = [None] * 7
    for regle in texte.split(";"):
        regle = regle.strip()
        if not regle:
            continue
        plages = RE_PLAGE.findall(regle)
        jours = []
        for m in RE_JOURS.finditer(regle):
            a = JOURS_OSM[m.group(1).lower()]
            b = JOURS_OSM[m.group(2).lower()] if m.group(2) else a
            j = a
            while True:                       # Sa-Su, mais aussi Fr-Mo
                jours.append(j)
                if j == b:
                    break
                j = (j + 1) % 7
        if not jours:
            jours = list(range(7))            # pas de jour cité : tous les jours

        if not plages:
            if re.search(r"\boff\b|ferm", regle, re.I):
                for j in jours:
                    ouverts[j] = fermes[j] = None
            continue

        for j in jours:
            for h1, m1, h2, m2 in plages:
                debut = int(h1) * 60 + int(m1)
                fin = int(h2) * 60 + int(m2)
                if fin <= debut:
                    fin += 1440               # franchit minuit
                # Saisies fantaisistes rencontrées telles quelles dans OSM :
                # « Mo-Sa 23:30-20:00 » (vingt heures d'affilée), « 14:00-14:00 »
                # (durée nulle, qui devient vingt-quatre heures). On ne les
                # corrige pas, on les ignore : une fiche absente vaut mieux
                # qu'une fiche fausse.
                if fin - debut > 20 * 60:
                    continue
                if fermes[j] is None or fin > fermes[j]:
                    fermes[j] = fin
                    ouverts[j] = debut
    return ouverts, fermes


JOURS_FR = [("lun", "Mo"), ("mar", "Tu"), ("mer", "We"), ("jeu", "Th"),
            ("ven", "Fr"), ("sam", "Sa"), ("dim", "Su")]
RE_HEURE_FR = re.compile(r"\b(\d{1,2})\s*h\s*(\d{2})?", re.I)


def horaires_vers_osm(txt):
    """« lun-sam 11h-2h ; dim 12h-minuit » → « Mo-Sa 11:00-02:00; Su 12:00-00:00 »

    Personne ne va saisir la syntaxe d'OpenStreetMap à la main. On accepte donc
    ce qu'on écrit naturellement — « 11h-2h », « 24/24 », « lun-ven 10h30-1h »
    — et on le traduit avant de le donner à parse_opening, qui est déjà testé
    sur trois mille fiches. Ce qui n'est pas compris n'est pas deviné : la
    ligne garde son texte d'origine, affiché tel quel, et le lieu reste
    visible à toute heure plutôt que de disparaître à tort.
    """
    t = (txt or "").strip().lower()
    if not t:
        return ""
    if re.sub(r"[^0-9]", "", t).startswith(("2424", "247")):
        return "24/7"                 # 24/24, 24h/24, 24h sur 24, 24/7, 7j/7…
    t = t.replace("minuit", "0h").replace("midi", "12h")
    t = re.sub(r"\s+(à|a|au)\s+", "-", t)
    for fr, osm in JOURS_FR:
        t = re.sub(r"\b%s[a-z]*\b" % fr, osm, t)
    t = RE_HEURE_FR.sub(lambda m: "%02d:%s" % (int(m.group(1)), m.group(2) or "00"), t)
    t = re.sub(r"\b(\d):(\d{2})", r"0\1:\2", t)        # 9:30 → 09:30
    return t.replace(",", ";")


def fetch_manger_osm(communes):
    """Fast-foods ouverts la nuit, d'après OpenStreetMap."""
    res = overpass(OVERPASS_MANGER, "manger")
    if res is None:
        return []
    return parse_manger_osm(res, communes, adresses_osm(res))


RE_ROUTE = re.compile(r"\b(?:A|RN|N)\s?(\d{1,3}[A-Za-z]?)\b", re.I)
RE_AIRE = re.compile(r"\bAIRE\s+(?:DE\s+|DES\s+|DU\s+|D'\s*)?(.+?)\s*$", re.I)


def horaires_station(txt):
    """Les sept jours du fichier officiel → nos deux listes de minutes.

    Renvoie (None, None) dès qu'une journée manque : une semaine à trous
    ferait disparaître la station un jour sur deux, ce qui est pire que de
    dire « horaires non publiés ». Mesuré : 17 fiches sur 31 sont complètes.
    « 00.00-00.00 » et « 01.00-01.00 » veulent dire ouvert en continu — c'est
    la convention du fichier, pas une erreur de saisie."""
    try:
        h = json.loads(txt or "{}")
    except ValueError:
        return None, None
    jours = h.get("jour") or []
    if len(jours) != 7:
        return None, None
    ouverts, fermes, vus = [None] * 7, [None] * 7, 0
    for i, j in enumerate(jours):
        if j.get("@ferme"):
            vus += 1
            continue
        plage = j.get("horaire")
        if isinstance(plage, list):
            plage = plage[0] if plage else None
        if not plage:
            continue
        try:
            a = [int(x) for x in plage["@ouverture"].replace(".", ":").split(":")[:2]]
            b = [int(x) for x in plage["@fermeture"].replace(".", ":").split(":")[:2]]
        except (KeyError, ValueError, IndexError):
            continue
        vus += 1
        debut, fin = a[0] * 60 + a[1], b[0] * 60 + b[1]
        if fin <= debut:
            fin = debut + 1440                 # continu, ou passe minuit
        ouverts[i], fermes[i] = debut, fin
    return (ouverts, fermes) if vus == 7 else (None, None)


def nom_station(adresse, ville):
    """« AUTOROUTE A1 - AIRE DE LA COURNEUVE » → « Aire de La Courneuve · A1 ».

    Le fichier officiel ne donne pas la marque, mais l'adresse porte mieux :
    un chauffeur reconnaît une aire à son nom et à son autoroute, pas à son
    enseigne."""
    brut = " ".join((adresse or "").split())
    route = RE_ROUTE.search(brut)
    route = ("A" + route.group(1).upper()) if route else ""
    aire = RE_AIRE.search(brut)
    if aire:
        # « AIRE DE LA COURNEUVE OUEST - SENS PROVINCE PARIS » : après le
        # tiret ou « sens », c'est le sens de circulation. Il est déjà dans
        # l'adresse, sous le nom ; le répéter mangerait la ligne.
        court = re.split(r"\s+-\s+|\s+sens\s+", aire.group(1), 1, re.I)[0]
        return "Aire de " + court.title()[:26].strip() + (" · " + route if route else "")
    return "Station " + (route or ville or "").strip()


def fetch_stations_autoroute():
    """Aires d'autoroute avec boutique, d'après le fichier officiel des prix."""
    depts = ",".join('"%s"' % d for d in sorted(IDF_DEPTS))
    champs = ("id,cp,ville,adresse,latitude,longitude,horaires,"
              "horaires_automate_24_24,services_service")
    lignes, total = [], 1
    for depart in range(0, 500, 100):
        params = {"where": 'code_departement in (%s) and pop="A"' % depts,
                  "limit": 100, "offset": depart, "select": champs}
        try:
            res = http_json(PRIX_CARBURANTS + "?" + urllib.parse.urlencode(params),
                            timeout=40)
        except Exception as e:                                  # noqa: BLE001
            log("  ! prix des carburants : %s" % e)
            break
        lignes += res.get("results") or []
        total = res.get("total_count") or 0
        if len(lignes) >= total:
            break

    out, sans_horaire = [], 0
    for r in lignes:
        # Sans boutique alimentaire, il n'y a rien à manger : la station n'a
        # rien à faire dans cet onglet, même ouverte toute la nuit.
        services = r.get("services_service") or []
        if "Boutique alimentaire" not in services:
            continue
        try:
            lat, lon = float(r["latitude"]) / 100000.0, float(r["longitude"]) / 100000.0
        except (KeyError, TypeError, ValueError):
            continue
        dept = str(r.get("cp") or "")[:2]
        if dept not in IDF_DEPTS:
            continue
        ville = (r.get("ville") or "").strip().title()
        item = {
            "id": "st%s" % r.get("id"),
            "name": nom_station(r.get("adresse"), ville),
            "address": " · ".join(x for x in (ville, " ".join(
                (r.get("adresse") or "").split()).title()) if x),
            "dept": dept,
            "lat": round(lat, 5), "lon": round(lon, 5),
            "t": "station",
        }
        ouverts, fermes = horaires_station(r.get("horaires"))
        if ouverts:
            item["o"], item["f"] = ouverts, fermes
            if all(f is not None and f - ouverts[i] >= 23 * 60
                   for i, f in enumerate(fermes)):
                item["h24"] = 1
        else:
            # Pas d'horaires dans le fichier : on l'écrit sur la fiche plutôt
            # que de laisser une ligne muette, et on ne la fait PAS passer
            # pour une 24h/24 — même si, sur une aire d'autoroute, c'est
            # souvent le cas. Une fiche fausse est pire qu'une fiche vague.
            item["hours"] = "horaires non publiés"
            sans_horaire += 1
        if "Toilettes publiques" in services:
            item["wc"] = True
        out.append(item)
    if sans_horaire:
        log("    dont %d sans horaires publiés (affichées quand même)" % sans_horaire)
    return out


def fetch_courses_osm(communes):
    """Supérettes, supermarchés et boutiques de stations ouverts la nuit."""
    res = overpass(OVERPASS_COURSES, "courses")
    if res is None:
        return []
    return parse_manger_osm(res, communes, adresses_osm(res), prefixe="co")


def parse_manger_osm(res, communes, adresses=None, prefixe="mo"):
    """Séparé du téléchargement pour être testable sur une réponse enregistrée.

    Sert aux deux requêtes — fast-foods et courses : mêmes champs, même règle
    de nuit, seule la catégorie change, et elle se lit dans les étiquettes."""
    adresses = adresses or {}
    out = []
    for el in res.get("elements", []):
        tags = el.get("tags") or {}
        lat = el.get("lat", (el.get("center") or {}).get("lat"))
        lon = el.get("lon", (el.get("center") or {}).get("lon"))
        if lat is None or lon is None:
            continue
        ouverts, fermes = parse_opening(tags.get("opening_hours"))
        if not fermes or not any(f and f > NUIT_DES for f in fermes):
            continue                          # ferme avant 23 h tous les jours
        cat, defaut = categorie(tags)
        # Les stations ne viennent plus d'OpenStreetMap mais du fichier
        # officiel des prix : on les écarte ici, y compris si une réponse
        # gardée en cache ou la graine livrée avec le projet en contient
        # encore. Sans ce filtre, une panne d'Overpass ramènerait les 554
        # stations qu'on vient justement de retirer.
        #
        # Pourquoi les retirer : dans OpenStreetMap, la station d'un
        # hypermarché porte le nom de l'enseigne — « Carrefour », « C. C.
        # Carrefour » — avec amenity=fuel et 24/7. L'écran disait donc
        # « Carrefour · 24h/24 » alors que ce 24/7 décrit les POMPES, et que
        # le magasin de Flins ou de Bay 2 est fermé la nuit. Le chauffeur
        # l'avait vu avant moi.
        if cat == "station":
            continue
        nom = (tags.get("name") or tags.get("brand") or defaut).strip()
        h24 = 1 if re.sub(r"\s", "", tags.get("opening_hours") or "") == "24/7" else 0
        rue, ville, dept = situer(lat, lon, adresses, communes, tags)
        # Le rectangle Overpass déborde sur l'Oise, l'Eure et l'Eure-et-Loir :
        # tant que les adresses venaient du centre communal le plus proche, ces
        # points étaient ramenés de force en Île-de-France. Avec le vrai code
        # INSEE, on peut enfin les écarter — un McDonald's à Chartres n'a rien
        # à faire ici.
        if dept not in IDF_DEPTS:
            continue
        item = {
            "id": "%s%s" % (prefixe, el.get("id")),
            "name": nom,
            # La commune d'abord : la ligne se coupe par la droite, et savoir
            # qu'on parle de Nanterre importe plus que le numéro de la rue.
            "address": " · ".join(x for x in (ville, rue) if x),
            "dept": dept,
            "lat": round(float(lat), 5), "lon": round(float(lon), 5),
            "o": ouverts, "f": fermes,
            "t": cat,
        }
        # Drapeaux écrits seulement quand ils valent quelque chose : sur neuf
        # cents fiches, deux clés à zéro, c'est trente kilo-octets pour rien.
        if h24:
            item["h24"] = 1
        if tags.get("drive_through") == "yes":
            item["drive"] = 1
        out.append(item)
    return out


def parse_toilets_osm(res, communes, adresses=None):
    """Découpage de la réponse Overpass, séparé du téléchargement pour être
    vérifiable hors ligne sur une réponse enregistrée."""
    adresses = adresses or {}
    out = []
    for el in res.get("elements", []):
        tags = el.get("tags", {})
        if (tags.get("access") or "") not in WC_ACCESS_OK:
            continue
        centre = el.get("center") or {}
        lat = centre.get("lat", el.get("lat"))
        lon = centre.get("lon", el.get("lon"))
        if lat is None or lon is None:
            continue
        rue, nom_commune, dep = situer(lat, lon, adresses, communes, tags)
        if dep == "75" or dep not in IDF_DEPTS:
            continue                      # Paris a ses sanisettes ; hors IDF, non
        horaires = (tags.get("opening_hours") or "").strip()
        out.append({
            "id": "wcosm-%s" % el.get("id"),
            # La rue en titre, la commune en dessous : c'est la présentation
            # des sanisettes de Paris, et c'est ce qu'on tape dans un GPS.
            "name": (rue or tags.get("name") or "Toilettes publiques").strip(),
            "address": nom_commune,
            "dept": dep,
            "lat": round(float(lat), 6), "lon": round(float(lon), 6),
            "h24": "24/7" in horaires,
            "open_label": horaires or None,
            "pmr": tags.get("wheelchair") == "yes",
            "bebe": tags.get("changing_table") == "yes",
            "src": "osm",
        })
    return out


def _cle(txt):
    """« Chez Momo » → « chez-momo ». Sert d'identifiant stable."""
    t = unicodedata.normalize("NFD", (txt or "").lower())
    t = "".join(c for c in t if unicodedata.category(c) != "Mn")
    return re.sub(r"-+", "-", re.sub(r"[^a-z0-9]+", "-", t)).strip("-")[:40]


def manual_places(name, kind):
    """Fiches relevées sur le terrain. C'est le contenu que Google Maps n'a
    pas — parking, toilettes, tranche de prix — et donc celui qui a de la
    valeur, aussi bien pour le chauffeur que pour négocier plus tard."""
    out = []
    for i, r in enumerate(read_csv(name)):
        try:
            lat, lon = float(r["lat"]), float(r["lon"])
        except (KeyError, ValueError):
            log("  ! coordonnées illisibles : %r" % r.get("nom"))
            continue
        item = {
            # Même raison que pour les sanisettes : un identifiant assis sur
            # le NOM, pas sur la ligne du fichier. Ajouter une adresse en
            # milieu de CSV ne doit pas déplacer les favoris du chauffeur.
            "id": "%s-%s" % (kind, _cle(r["nom"]) or i),
            "name": r["nom"].strip(),
            "address": (r.get("adresse") or "").strip(),
            "dept": (r.get("dept") or "").strip(),
            "lat": lat, "lon": lon,
        }
        if kind == "manger":
            horaires = (r.get("horaires") or "").strip()
            item.update({
                "hours": horaires,
                "t": (r.get("type") or "autre").strip().lower() or "autre",
                "parking": (r.get("parking") or "").strip().lower() in ("1", "oui", "o"),
                "wc": (r.get("toilettes") or "").strip().lower() in ("1", "oui", "o"),
                "price": (r.get("prix") or "").strip(),
            })
            # Les horaires saisis à la main sont analysés comme ceux
            # d'OpenStreetMap : la fiche se range alors toute seule dans
            # « encore ouvert », avec son heure de fermeture affichée. Faute de
            # quoi elle resterait visible à midi comme à quatre heures du
            # matin, ce qui est exactement le défaut qu'on reproche aux
            # annuaires.
            ouverts, fermes = parse_opening(horaires_vers_osm(horaires))
            if fermes and any(f is not None for f in fermes):
                item["o"], item["f"] = ouverts, fermes
                if horaires_vers_osm(horaires) == "24/7":
                    item["h24"] = 1
            else:
                log("  ! horaires non compris pour %r : %r — fiche affichée "
                    "en permanence" % (item["name"], horaires))
        else:
            item["note"] = (r.get("note") or "").strip()
        out.append(item)
    return out


def fetch_astuces():
    """Le carnet du chauffeur : ce qui s'apprend en roulant et ne se trouve
    dans aucune base. Un lieu où patienter sans amende, l'heure où la recharge
    coûte moins cher, une entrée de parking qu'il vaut mieux éviter.

    Les coordonnées sont facultatives : une astuce peut ne concerner aucun
    endroit précis. Quand elles sont là, la fiche porte son bouton GPS et se
    classe par distance comme le reste."""
    out = []
    for i, r in enumerate(read_csv("astuces.csv")):
        titre = (r.get("titre") or "").strip()
        if not titre:
            continue
        item = {
            "id": "astuce-%d" % i,
            "name": titre,
            "note": (r.get("texte") or "").strip(),
            "dept": (r.get("dept") or "").strip(),
        }
        try:
            item["lat"], item["lon"] = float(r["lat"]), float(r["lon"])
        except (KeyError, ValueError, TypeError):
            pass                      # astuce sans lieu : c'est permis
        out.append(item)
    return out


# --------------------------------------------------------------------------

def write(out_dir, name, payload):
    os.makedirs(out_dir, exist_ok=True)
    path = os.path.join(out_dir, name + ".json")
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))
    os.replace(tmp, path)                    # écriture atomique : jamais de JSON tronqué servi
    log("  → %s (%.1f Ko)" % (name + ".json", os.path.getsize(path) / 1024))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=os.path.join(HERE, "..", "cdn", "data"))
    ap.add_argument("--only", choices=["brief", "lieux"],
                    help="ne régénérer qu'un fichier")
    args = ap.parse_args()
    out = os.path.abspath(args.out)
    now = datetime.now(PARIS_TZ)

    if args.only in (None, "brief"):
        log("brief…")
        token = os.environ.get("SNCF_TOKEN", "").strip()
        trains = []
        if token:
            trains = fetch_trains(token)
            log("  %d créneaux de trains (temps réel)" % len(trains))
        # Pas de clé, clé invalide, quota dépassé, API en panne : on se rabat
        # sur l'horaire théorique publié en accès libre. Moins bon — aucun
        # retard — mais l'application n'est jamais vide de trains.
        if not trains:
            if token:
                log("  ! l'API SNCF n'a rien renvoyé : repli sur l'horaire théorique")
            else:
                log("  ! SNCF_TOKEN absent : repli sur l'horaire théorique GTFS")
            trains = fetch_trains_gtfs()
            log("  %d créneaux de trains (théorique)" % len(trains))
        flights = fetch_flights()
        log("  %d créneaux de vols" % len(flights))
        manual = fetch_events()
        auto = fetch_events_ticketmaster() + fetch_events_api() + fetch_football()
        events = merge_events(manual, auto)
        log("  %d événements (%d saisis à la main, %d repris des agendas)"
            % (len(events), len(manual), len(events) - len(manual)))
        closures = fetch_closures()
        nuits = fetch_sytadin()
        trafic = fetch_roadworks()
        # Sytadin est la meilleure source sur un axe donné : quand il annonce
        # déjà une fermeture sur l'A86, la perturbation DATEX de l'A86 ferait
        # doublon, en moins bien écrit. On ne compare que les fermetures de
        # nuit : une bretelle coupée en continu ne dit rien du chantier que
        # DATEX signale ailleurs sur le même axe, et s'en servir pour filtrer
        # faisait disparaître les deux chantiers de l'A15.
        axes = {c["road"] for c in nuits
                if c.get("road") and c.get("kind") == "nuit"}
        trafic = [c for c in trafic if c["title"].split()[0] not in axes]
        log("  %d fermetures saisies, %d nuits Sytadin, %d chantiers DATEX"
            % (len(closures), len(nuits), len(trafic)))
        # La saisie manuelle d'abord, puis le plus grave : c'est la première
        # de la liste que le brief met en avant.
        poids = {"high": 0, "medium": 1, "low": 2}
        closures = closures + sorted(
            nuits + trafic, key=lambda c: (poids.get(c.get("severity"), 3), c["from"]))
        meteo = fetch_meteo()
        log("  météo : %d heures sur %d points"
            % (len(meteo.get("heures") or []), len(meteo.get("points") or [])))
        write(out, "brief", {
            "generated_at": iso(now),
            "meteo": meteo,
            # À heure égale, le plus gros d'abord : dans une tranche, le chauffeur
            # doit lire en premier l'endroit qui rapporte le plus.
            "demand": sorted(trains + flights + events,
                             key=lambda d: (d["start"], -d.get("volume", 0))),
            "closures": closures,
        })

    if args.only in (None, "lieux"):
        log("lieux…")
        wc = fetch_toilets()
        log("  %d sanisettes en service" % len(wc))
        communes = fetch_communes()
        log("  %d communes franciliennes" % len(communes))
        if communes:
            write(out, "zones", {"generated_at": iso(now),
                                 "communes": zones_pour_app(communes)})
        banlieue = fetch_toilets_osm(communes)
        log("  %d toilettes de banlieue (OpenStreetMap)" % len(banlieue))
        manger_nuit = fetch_manger_osm(communes)
        log("  %d fast-foods ouverts la nuit (OpenStreetMap)" % len(manger_nuit))
        courses = fetch_courses_osm(communes)
        log("  %d supérettes et supermarchés ouverts la nuit" % len(courses))
        stations = fetch_stations_autoroute()
        log("  %d aires d'autoroute avec boutique" % len(stations))
        a_la_main = manual_places("manger.csv", "manger")
        log("  %d fiches saisies à la main" % len(a_la_main))
        write(out, "lieux", {
            "generated_at": iso(now),
            "toilettes": wc + banlieue,
            "astuces": fetch_astuces(),
            # Les fiches du terrain d'abord : à distance égale, ce qui a été
            # vérifié par un chauffeur passe devant ce qui vient d'une base.
            "manger": a_la_main + manger_nuit + courses + stations,
        })

    log("terminé.")


if __name__ == "__main__":
    main()

# NOTE heure d'hiver : PARIS_TZ n'est plus figé, il sort de paris_tz_at() qui
# applique la règle européenne. Si un jour l'Europe abandonne le changement
# d'heure, il suffira de renvoyer un fuseau constant depuis cette fonction.
