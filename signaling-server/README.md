Signaling server for local development

Usage:

1. Install dependencies

```bash
cd signaling-server
npm install
```

2. Run server

```bash
npm start
```

The server listens on `PORT` (default 8080). For the Next.js client set `NEXT_PUBLIC_SIGNALING_SERVER_URL` to `ws://localhost:8080`.

This is a minimal demo signaling server — for production use a hardened server and TURN servers.
