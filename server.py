#!/usr/bin/env python3
import json
import os
from datetime import date
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.abspath(__file__))
DIST = os.path.join(ROOT, "dist")
DATA_DIR = os.environ.get("BOOK_DATA_DIR", "/var/lib/book")
DATA_FILE = os.path.join(DATA_DIR, "visits.json")

os.makedirs(DATA_DIR, exist_ok=True)


class BookHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIST, **kwargs)

    def do_GET(self):
        path = self.path.split("?", 1)[0]
        if path == "/api/visits/today":
            today = date.today().isoformat()
            try:
                with open(DATA_FILE, "r", encoding="utf-8") as file:
                    data = json.load(file)
            except (FileNotFoundError, json.JSONDecodeError):
                data = {}

            data[today] = int(data.get(today, 0)) + 1
            data = {key: value for key, value in data.items() if key >= today}
            with open(DATA_FILE, "w", encoding="utf-8") as file:
                json.dump(data, file)

            payload = json.dumps({"date": today, "count": data[today]}).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
            return
        super().do_GET()


if __name__ == "__main__":
    server = ThreadingHTTPServer(("0.0.0.0", 8000), BookHandler)
    print("Book server listening on port 8000", flush=True)
    server.serve_forever()
