#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Serveur local de prévisualisation.

    python3 vtc-app/scripts/serve.py        → http://localhost:8777/preview/

Le dossier servi est fixé en absolu : le serveur peut ainsi démarrer depuis
n'importe quel répertoire de travail.
"""
import functools
import http.server
import os
import socketserver

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8777


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")   # on veut voir ses éditions tout de suite
        super().end_headers()

    def log_message(self, fmt, *args):
        pass


if __name__ == "__main__":
    socketserver.TCPServer.allow_reuse_address = True
    h = functools.partial(Handler, directory=ROOT)
    with socketserver.TCPServer(("127.0.0.1", PORT), h) as srv:
        print("preview : http://localhost:%d/preview/" % PORT, flush=True)
        srv.serve_forever()
