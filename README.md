# potocki

<p align="center">
  <strong>Encrypted · Compressed · Temporary file drop</strong>
</p>

<p align="center">
  <a href="#"><img src="https://img.shields.io/badge/version-0.2.0-blue.svg" alt="Version"></a>
  <a href="#license"><img src="https://img.shields.io/badge/license-MIT-green.svg" alt="License"></a>
  <a href="#"><img src="https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg" alt="Node"></a>
  <a href="#"><img src="https://img.shields.io/badge/go-%3E%3D1.18-00ADD8.svg" alt="Go"></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white" alt="Node.js">
  <img src="https://img.shields.io/badge/Go-00ADD8?style=for-the-badge&logo=go&logoColor=white" alt="Go">
  <img src="https://img.shields.io/badge/SQLite-07405E?style=for-the-badge&logo=sqlite&logoColor=white" alt="SQLite">
  <img src="https://img.shields.io/badge/uWebSockets.js-2.2.0-0099CC?style=for-the-badge" alt="uWebSockets.js">
  <img src="https://img.shields.io/badge/EJS-B4CA65?style=for-the-badge&logo=ejs&logoColor=white" alt="EJS">
  <img src="https://img.shields.io/badge/Caddy-1F88C0?style=for-the-badge&logo=caddy&logoColor=white" alt="Caddy">
  <img src="https://img.shields.io/badge/xz-FFB13B?style=for-the-badge" alt="xz">
  <img src="https://img.shields.io/badge/AES--256--CBC-003B6F?style=for-the-badge" alt="AES-256-CBC">
</p>

<p align="center">
  <a href="#-features">Features</a> &middot;
  <a href="#-architecture">Architecture</a> &middot;
  <a href="#-installation">Installation</a> &middot;
  <a href="#-usage">Usage</a> &middot;
  <a href="#-api">API</a> &middot;
  <a href="#-configuration">Configuration</a> &middot;
  <a href="#-security">Security</a> &middot;
  <a href="#-license">License</a>
</p>

---

A self-hosted, minimal **file drop** service. Files are encrypted with **AES-256-CBC**, compressed with **xz**, and automatically expire. Built for cheap VPS — runs comfortably on a $0/month free-tier AWS EC2 instance with **<20MB RAM** idle.

The **Go client** handles decryption and decompression locally, so the server never has to do expensive work on download. Bandwidth stays minimal — only the compressed+encrypted file leaves the server.

### Kenapa namanya "potocki"?

Nama **potocki** diambil dari karakter di anime
[*Orb: On the Movements of the Earth*](https://en.wikipedia.org/wiki/Orb:_On_the_Movements_of_the_Earth)
(Chi. — Chikyuu no Undou ni Tsuite). 
> 10% dari hasil kompresi akan diberikan kepada Potocki.
## Features

- **AES-256-CBC encryption** — files encrypted before storage
- **xz compression** — high-ratio compression (saves bandwidth)
- **SHA-256 checksums** — every file verified on download
- **Auto-expiry** — files deleted after 7 days or bandwidth quota
- **Web UI** — clean modern interface (EJS + vanilla JS)
- **CLI** — upload via cURL, download via Go client
- **Live stats** — uploads, downloads, active files, queue depth
- **Rate limited** — per-IP protection (20 req/min default)
- **Concurrent** — async xz + bounded queue (no blocking)
- **Fast** — uWebSockets.js backend, Knex query builder
- **Tiny** — 4.7MB Go client, single static binary

## Architecture

```
┌─────────┐  POST /upload   ┌──────────────────┐    store     ┌──────────┐
│ User A  │ ─────────────▶  │  uWS Server       │ ───────────▶ │  .enc    │
│         │                 │  ┌────────────┐   │              │  on disk │
└─────────┘                 │  │  xz -9     │   │              └──────────┘
                            │  │  AES-256   │   │
                            │  │  SHA-256   │   │
                            │  └────────────┘   │
                            └─────────┬─────────┘
                                      │  GET /d/:id
                                      ▼
                            ┌──────────────────┐
                            │  Token check     │
                            │  Bandwidth check │
                            │  Expiry check    │
                            └─────────┬─────────┘
                                      │
                                      ▼
                            ┌──────────────────┐
┌─────────┐  ./potocki     │  Download .enc   │
│ User B  │ ─────────────▶  │  + decryption key│
│         │                 │  (via token)     │
└─────────┘                 └──────────┬───────┘
                                       │
                                       ▼
                            ┌──────────────────┐
                            │  potocki (Go)   │
                            │  ─ AES decrypt   │
                            │  ─ xz decompress │
                            │  ─ SHA-256 check │
                            └──────────────────┘
```

**Server-side cost per upload:** CPU time for xz compression, one AES-256-CBC encrypt, one SHA-256 hash.

**Server-side cost per download:** zero CPU — just streams the already-encrypted file. All heavy work happens in the Go client.

## Tech Stack

| Layer | Tech |
|-------|------|
| HTTP Server | [uWebSockets.js](https://github.com/uNetworking/uWebSockets.js) |
| Database | [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) + [Knex](https://knexjs.org/) |
| Templates | [EJS](https://ejs.co/) |
| Compression | [xz / LZMA](https://tukaani.org/xz/) |
| Encryption | [AES-256-CBC](https://nodejs.org/api/crypto.html) |
| Hashing | [SHA-256](https://en.wikipedia.org/wiki/SHA-2) |
| Client | [Go 1.18+](https://go.dev/) + [ulikunitz/xz](https://github.com/ulikunitz/xz) |
| Reverse Proxy | [Caddy](https://caddyserver.com/) |
| IDs | [nanoid](https://github.com/ai/nanoid) |

## Installation

### 1. Server Setup

**Requirements:** Node.js 18+, npm, xz-utils

```bash
# Install system deps
sudo apt install -y nodejs npm xz-utils build-essential

# Clone the repo
git clone https://github.com/yourname/potocki
cd potocki/server

# Install Node deps
npm install

# Start the server
npm start
# [potocki] v0.2.0 - database initialized
# [potocki] listening on port 3000
```

The server is now running on `http://localhost:3000`.

### 2. Caddy Reverse Proxy (recommended)

```bash
# Install Caddy
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install caddy

# Edit Caddyfile: replace potocki.example.com with your domain
potocki.example.com {
    reverse_proxy localhost:3000
    request_body {
        max_size 500MB
    }
}

sudo systemctl reload caddy
```

Caddy auto-provisions Let's Encrypt HTTPS certificates.

### 3. Build the Go Client

```bash
cd ../client
go build -ldflags="-s -w" -o potocki .
```

Or download the prebuilt binary from the running server:

```bash
curl -O https://potocki.example.com/bin
chmod +x potocki-linux-amd64
mv potocki-linux-amd64 potocki
```

## Usage

### Upload via Web UI

1. Open `https://potocki.example.com/` in your browser
2. Drop a file in the dropzone
3. Edit the filename if needed
4. Click **Upload**
5. Copy the URL and token to share

### Upload via cURL

```bash
curl -X POST \
  -H "X-Filename: report.pdf" \
  --data-binary @report.pdf \
  https://potocki.example.com/upload
```

Response:
```json
{
  "id": "VKTqV_To",
  "token": "fd_b78064024011769cd0bb45ef27097768a03e805583f6d2e9",
  "name": "report.pdf",
  "size": 1048576,
  "compSize": 524288,
  "sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "expires": 1781048400000,
  "url": "/d/VKTqV_To"
}
```

### Download & Decrypt

The recipient needs both the **URL** and the **token**.

#### With the potocki client (recommended)

```bash
./potocki https://potocki.example.com/d/VKTqV_To fd_b78064024011769cd0bb45ef27097768a03e805583f6d2e9
```

Output:
```
  potocki
  --------
  file:   report.pdf
  size:   1.0 MB
  download... 524 KB
  decrypt...   OK
  decompress... OK
  verify...    OK

  saved:  /home/user/report.pdf
  sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
```

#### With cURL (encrypted file only)

```bash
# 1. Get the decryption key
curl "https://potocki.example.com/api/key/VKTqV_To?token=fd_xxx"

# 2. Download the encrypted file
curl -o report.enc "https://potocki.example.com/dl/VKTqV_To?token=fd_xxx"

# 3. Decrypt + decompress manually (requires xz and openssl)
```

#### Save to a specific directory

```bash
./potocki -o ~/Downloads https://potocki.example.com/d/VKTqV_To fd_xxx
```

#### Show help / version

```bash
./potocki --help
./potocki --version
# potocki v0.2.0
```

## Monitoring

The web UI includes a **Stats** tab with real-time metrics:

| Metric | Description |
|--------|-------------|
| **Total Uploads** | All-time upload count |
| **Active Files** | Files not yet expired and within bandwidth quota |
| **Processing** | Files currently being compressed/encrypted |
| **Queue (Active/Cap)** | Current upload slots in use vs max |
| **Data Uploaded** | Total bytes received (all-time) |
| **Data Downloaded** | Total bytes served (all-time) |
| **Compressed Size** | Total bytes after xz compression |

JSON API:

```bash
curl https://potocki.example.com/api/stats
```

```json
{
  "totalUploads": 6,
  "bytesUploaded": 3987265,
  "bytesDownloaded": 1040,
  "bytesCompressed": 1232,
  "activeFiles": 6,
  "processing": 0,
  "queueActive": 0,
  "queuePending": 0,
  "queueCapacity": 3,
  "bytesUploadedFmt": "3.8 MB",
  "bytesDownloadedFmt": "1.0 KB",
  "bytesCompressedFmt": "1.2 KB"
}
```

## API

All endpoints return JSON unless otherwise noted.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/` | Web UI (upload page) |
| `GET` | `/d/:id` | Download page for a file (HTML) |
| `GET` | `/dl/:id?token=` | Stream encrypted file (binary) |
| `GET` | `/bin` | Download the potocki client binary |
| `GET` | `/api/info/:id` | File metadata (name, size, sha256, expiry) |
| `GET` | `/api/key/:id?token=` | AES key + IV (requires valid token) |
| `GET` | `/api/stats` | Server statistics |
| `POST` | `/upload` | Upload a file (header: `X-Filename`, body: raw bytes) |

## Configuration

All config via environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | HTTP server port |
| `BASE_URL` | `http://localhost:3000` | Public base URL for generated links |
| `MAX_CONCURRENT` | `3` | Max simultaneous uploads processing |
| `MAX_QUEUE` | `20` | Max queued uploads waiting for a slot |
| `RATE_LIMIT_PER_MIN` | `20` | Max requests per IP per minute |

Example:
```bash
MAX_CONCURRENT=5 MAX_QUEUE=50 RATE_LIMIT_PER_MIN=100 PORT=8080 npm start
```

## Retention

Files are auto-deleted when **any** of these is met:

- **7 days** after upload
- **Bandwidth quota** reached:
  - Files &lt; 10MB → 3 GB download bandwidth
  - Files &lt; 500MB → 10 GB download bandwidth
  - Files &ge; 500MB → 15 GB download bandwidth

The cleanup job runs every 5 minutes.

## Security

- **Filename sanitization** — path traversal chars, null bytes, control chars stripped
- **ID validation** — only `a-zA-Z0-9_-` allowed, max 32 chars
- **AES-256-CBC** — random 32-byte key per file, random 16-byte IV
- **SHA-256 verification** — client re-checks checksum after decryption
- **XSS protection** — all user input HTML-escaped
- **Token-gated decryption** — key only sent to authenticated clients
- **Rate limiting** — per-IP request limits
- **Queue limits** — bounded server-side processing to prevent DoS
- **No shell injection** — `xz` invoked via `execFile()` (no shell, no args from user)
- **Path traversal** — IDs from URL sanitized before file system access

### Known limitations

- **Compression ratio varies** — already-compressed files (`.zip`, `.apk`, `.aab`, `.jpg`, `.mp4`) cannot be compressed much further. xz is near-optimal for entropy-encoded data.

## Development

```bash
# Server with auto-reload
cd server
npm run dev

# Client (rebuild)
cd client
go build -o potocki .
```

### Project Structure

```
potocki/
├── server/
│   ├── src/
│   │   ├── app.js                  # uWS entry, EJS rendering, routes
│   │   ├── handlers/
│   │   │   ├── upload.js           # Async xz + AES-256-CBC + rate limit
│   │   │   ├── download.js         # Encrypted file streaming
│   │   │   └── api.js              # /api/info, /api/key
│   │   ├── db/
│   │   │   └── index.js            # Knex + better-sqlite3, schema, queries
│   │   ├── services/
│   │   │   ├── cleanup.js          # Auto-delete expired files
│   │   │   ├── queue.js            # Concurrency limiter
│   │   │   └── stats.js            # Live monitoring stats
│   │   └── utils/
│   │       ├── crypto.js           # Key/IV/token generation, AES
│   │       ├── sanitize.js         # Filename/ID sanitization
│   │       └── version.js          # Single source of truth
│   ├── views/
│   │   ├── index.ejs               # Main UI (upload + docs + stats)
│   │   └── download.ejs            # Download page
│   ├── public/
│   │   └── bin/                    # potocki binary
│   └── package.json
├── client/
│   ├── main.go                     # CLI entry, --help, --version
│   ├── download.go                 # HTTP downloads, JSON parsing
│   ├── decrypt.go                  # AES-256-CBC decrypt + SHA-256 verify
│   └── decompress.go               # xz decompression (with bomb limit)
├── Caddyfile
└── README.md
```

## License

[MIT](LICENSE) © 2026

## Acknowledgments

- [uWebSockets.js](https://github.com/uNetworking/uWebSockets.js) — insanely fast HTTP server
- [ulikunitz/xz](https://github.com/ulikunitz/xz) — pure Go xz reader
- [Knex](https://knexjs.org/) — SQL query builder
- [Caddy](https://caddyserver.com/) — zero-config HTTPS
