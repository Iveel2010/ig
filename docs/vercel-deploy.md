# Vercel deployment (Next.js)

This repo includes an automated GitHub Action to build and deploy the Next.js app to Vercel.

Files added:

- `.github/workflows/vercel-deploy.yml` — CI that builds and runs the Vercel deploy action on pushes to `main`.
- `vercel.json` — minimal Vercel config for the Next.js build.

Before the workflow can deploy you'll need to configure a few secrets and environment variables.

1. Create a Vercel token

```bash
# (install vercel CLI first: npm i -g vercel)
vercel login
vercel tokens create ci-token
```

Copy the token value and add it to your GitHub repository secrets as `VERCEL_TOKEN`.

2. Get `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID`

- You can find these in the Vercel dashboard: Project Settings -> General -> Project ID, and Organization Settings -> General -> ID.
- Or use the Vercel API:

```bash
curl -H "Authorization: Bearer $VERCEL_TOKEN" https://api.vercel.com/v1/projects
```

3. Add those values to GitHub repository secrets (`Settings → Secrets → Actions`). Add `VERCEL_TOKEN`, `VERCEL_ORG_ID`, and `VERCEL_PROJECT_ID`.

4. Set the runtime environment variable for the signaling server in Vercel (project settings → Environment Variables):

- Key: `NEXT_PUBLIC_SIGNALING_SERVER_URL`
- Value: `wss://<your-signaling-host>`

You can also add it using the Vercel CLI:

```bash
vercel --token "$VERCEL_TOKEN" env add NEXT_PUBLIC_SIGNALING_SERVER_URL production "wss://<your-signaling-host>"
```

5. Push to `main` to trigger the workflow and deploy:

```bash
git add .
git commit -m "Add Vercel deploy workflow"
git push origin main
```

If you'd like me to run the deploy now I can: either provide a temporary `VERCEL_TOKEN` and the `VERCEL_PROJECT_ID`/`VERCEL_ORG_ID`, or follow the steps above and I'll watch the GitHub Action run. Do you want me to proceed with a deploy now?
