FROM node:20-bookworm-slim AS frontend-build

WORKDIR /app
COPY package.json ./
COPY scripts ./scripts
COPY app.js index.html styles.css README.md robots.txt sitemap.xml site.webmanifest favicon.ico ./
COPY 38LaThuRockefellerGuiChoConTrai.pdf ./
COPY assets ./assets
COPY scratch ./scratch
RUN npm run build

FROM python:3.12-slim

WORKDIR /app
COPY --from=frontend-build /app/dist ./dist
COPY server.py ./server.py

ENV BOOK_DATA_DIR=/var/lib/book
RUN mkdir -p /var/lib/book/documents
VOLUME ["/var/lib/book"]

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD python3 -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/documents', timeout=3)"

CMD ["python3", "server.py"]
