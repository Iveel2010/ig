This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Deployment (Signaling server + Next.js)

This repo contains two components:

- The Next.js app at the repository root (web client).
- A minimal signaling server in `signaling-server` that uses WebSockets to pair peers.

Quick deploy options:

1. Deploy web (Next.js) to Vercel

- Import this repo into Vercel (https://vercel.com/new).
- In Vercel project settings set the environment variable `NEXT_PUBLIC_SIGNALING_SERVER_URL` to the public WebSocket URL of your signaling server (for example `wss://your-signaling.example.com`).

2. Deploy signaling server as a container (any Docker host / Fly / Render)

Using Docker locally or on a host:

```bash
# from repo root
docker build -t ometv-signaling ./signaling-server
docker run -p 8080:8080 -e PORT=8080 -d ometv-signaling
```

Using Fly.io (example):

```bash
# install flyctl and login
flyctl launch --name ometv-signaling --region ord --dockerfile signaling-server/Dockerfile
flyctl deploy
```

Using Render / Railway: create a new Web Service, point it to the `signaling-server` folder, set the start command to `node index.js`, and set the port to `8080`.

3. After deploying the signaling server, set `NEXT_PUBLIC_SIGNALING_SERVER_URL` in Vercel to `wss://<your-signaling-host>` and redeploy the Next.js project.

Notes / production concerns:

- Add a TURN server for reliable NAT traversal (coturn or a managed TURN provider).
- Add authentication, rate-limiting, abuse moderation, and persistence for reporting before any public deployment.
- Use TLS (wss/wss) for the signaling server in production.
