#!/usr/bin/env python3
import json
from email import policy
from email.parser import BytesParser
import os
import re
import uuid
from datetime import date, datetime, timezone
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.abspath(__file__))
DIST = os.path.join(ROOT, "dist")
DATA_DIR = os.environ.get("BOOK_DATA_DIR", "/var/lib/book")
DATA_FILE = os.path.join(DATA_DIR, "visits.json")
DOCUMENTS_DIR = os.path.join(DATA_DIR, "documents")
DOCUMENTS_FILE = os.path.join(DATA_DIR, "documents.json")
MAX_FILE_SIZE = 100 * 1024 * 1024
MAX_STORAGE_BYTES = 50 * 1024 * 1024 * 1024

os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(DOCUMENTS_DIR, exist_ok=True)


def read_documents():
    try:
        with open(DOCUMENTS_FILE, "r", encoding="utf-8") as file:
            return json.load(file)
    except (FileNotFoundError, json.JSONDecodeError):
        return []


def write_documents(documents):
    temporary = f"{DOCUMENTS_FILE}.tmp"
    with open(temporary, "w", encoding="utf-8") as file:
        json.dump(documents, file, ensure_ascii=False, indent=2)
    os.replace(temporary, DOCUMENTS_FILE)


def json_response(handler, payload, status=200):
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Cache-Control", "no-store")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def form_field_name(part):
    return part.get_param("name", header="content-disposition")


def prune_old_documents(documents, incoming_size):
    """Remove oldest stored PDFs until the new upload fits within the quota."""
    def document_size(document):
        file_path = os.path.join(DOCUMENTS_DIR, document.get("storedName", ""))
        try:
            return os.path.getsize(file_path)
        except OSError:
            return int(document.get("size", 0) or 0)

    total_size = sum(document_size(document) for document in documents)
    removed = 0
    remaining = list(documents)
    oldest_first = sorted(remaining, key=lambda item: item.get("timestamp", ""))

    for document in oldest_first:
        if total_size + incoming_size <= MAX_STORAGE_BYTES:
            break
        file_path = os.path.join(DOCUMENTS_DIR, os.path.basename(document.get("storedName", "")))
        try:
            os.remove(file_path)
        except OSError:
            pass
        total_size -= document_size(document)
        remaining.remove(document)
        removed += 1

    if total_size + incoming_size > MAX_STORAGE_BYTES:
        raise ValueError("File mới lớn hơn dung lượng lưu trữ còn cho phép.")
    return remaining, removed


class BookHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIST, **kwargs)

    def do_GET(self):
        path = self.path.split("?", 1)[0]
        if path == "/api/documents":
            json_response(self, read_documents())
            return

        document_match = re.fullmatch(r"/api/documents/([a-f0-9-]+)/file", path)
        if document_match:
            document = next((item for item in read_documents() if item["id"] == document_match.group(1)), None)
            if not document:
                self.send_error(404, "Document not found")
                return
            file_path = os.path.join(DOCUMENTS_DIR, document["storedName"])
            if not os.path.isfile(file_path):
                self.send_error(404, "Document file not found")
                return
            self.send_response(200)
            self.send_header("Content-Type", "application/pdf")
            self.send_header("Content-Length", str(os.path.getsize(file_path)))
            self.end_headers()
            with open(file_path, "rb") as file:
                self.wfile.write(file.read())
            return

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

    def do_POST(self):
        if self.path.split("?", 1)[0] != "/api/documents":
            self.send_error(404, "Not found")
            return

        content_length = int(self.headers.get("Content-Length", "0"))
        if content_length <= 0 or content_length > MAX_FILE_SIZE + 2 * 1024 * 1024:
            json_response(self, {"error": "File vượt quá giới hạn 100 MB."}, 413)
            return

        content_type = self.headers.get("Content-Type", "")
        if not content_type.startswith("multipart/form-data"):
            json_response(self, {"error": "Yêu cầu phải là multipart/form-data."}, 400)
            return

        body = self.rfile.read(content_length)
        message = BytesParser(policy=policy.default).parsebytes(
            f"Content-Type: {content_type}\r\nMIME-Version: 1.0\r\n\r\n".encode() + body
        )
        upload = next((part for part in message.iter_parts() if form_field_name(part) == "file"), None)
        if not upload or not upload.get_filename():
            json_response(self, {"error": "Chưa có file PDF."}, 400)
            return

        file_name = os.path.basename(upload.get_filename()).replace('"', "'").replace("\r", "").replace("\n", "")
        if not file_name.lower().endswith(".pdf"):
            json_response(self, {"error": "Chỉ chấp nhận file PDF."}, 400)
            return

        file_data = upload.get_payload(decode=True) or b""
        if len(file_data) > MAX_FILE_SIZE:
            json_response(self, {"error": "File vượt quá giới hạn 100 MB."}, 413)
            return

        if len(file_data) > MAX_STORAGE_BYTES:
            json_response(self, {"error": "File lớn hơn giới hạn lưu trữ 50 GB."}, 413)
            return

        documents, removed_count = prune_old_documents(read_documents(), len(file_data))
        document_id = str(uuid.uuid4())
        stored_name = f"{document_id}.pdf"
        with open(os.path.join(DOCUMENTS_DIR, stored_name), "wb") as file:
            file.write(file_data)

        pages_part = next((part for part in message.iter_parts() if form_field_name(part) == "pages"), None)
        try:
            pages = max(1, int(pages_part.get_content() if pages_part else "1"))
        except ValueError:
            pages = 1
        document = {
            "id": document_id,
            "name": file_name,
            "size": len(file_data),
            "pages": pages,
            "storedName": stored_name,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        write_documents([document] + documents)
        document["removedOldDocuments"] = removed_count
        json_response(self, document, 201)


if __name__ == "__main__":
    server = ThreadingHTTPServer(("0.0.0.0", 8000), BookHandler)
    print("Book server listening on port 8000", flush=True)
    server.serve_forever()
