# Elevate Tracking Dashboard

Self-hosted analytics dashboard for the Elevate brand. Pulls live data from:
- **Klaviyo** (lists / segments / events / purchases / revenue)
- **Typeform** (reset opt-in submissions)
- **Google Analytics 4** (visitors / sessions / traffic source)

Shows a single funnel view per time range (Daily / Weekly / Monthly / All time):

```
GA4 Visitors  →  Typeform Opt-ins  →  Klaviyo Checkout fills  →  Klaviyo Purchases  →  Revenue
```

**Tech:** Next.js 14 (App Router) + TypeScript + Tailwind CSS. Deploys to Vercel free tier.

---

## Quick start

### 1. Install dependencies

```bash
cd tracking-dashboard
npm install
```

### 2. Create your `.env.local` from the template

```bash
cp .env.local.example .env.local
```

Then fill in the values. See "Getting API keys" below.

### 3. Run locally

```bash
npm run dev
```

Open <http://localhost:3000>. You'll see the dashboard.

If anything is misconfigured, the error appears below the KPI grid (per API). Fix the env var and reload.

### 4. Deploy to Vercel

```bash
# Push to GitHub first
git init && git add . && git commit -m "init"
gh repo create elevate-tracking-dashboard --private --source=. --push

# Or upload the folder to vercel.com directly via "Add New Project"
```

In Vercel project settings → **Environment Variables** → paste every var from your `.env.local`.

---

## Getting API keys

### Klaviyo (private API key)

1. Klaviyo → **Account → Settings → API Keys**
2. Click **Create Private API Key**
3. Name it `Tracking Dashboard`
4. Access level: **Custom Key** → grant **Read** on:
   - Profiles
   - Lists
   - Segments
   - Events
   - Metrics
5. Save the key starting with `pk_...` into `KLAVIYO_PRIVATE_KEY`

You also need:
- **List IDs** for each list you want to track. Find them in Klaviyo URL: `https://www.klaviyo.com/list/VgLXm8/...` → ID is `VgLXm8`.
- **Metric IDs** for "Placed Order" and "Started Checkout". Find them in **Analytics → Metrics** → click each → ID is in the URL.

### Typeform (personal access token)

1. Typeform → click your avatar → **Settings → Personal tokens**
2. **Generate new token** → give it `responses:read` scope
3. Copy the `tfp_...` token into `TYPEFORM_TOKEN`
4. Find your form ID — in the URL `https://form.typeform.com/to/M2D0Bc3U` the ID is `M2D0Bc3U`. Put it in `TYPEFORM_FORM_ID`.

### Google Analytics 4 (service account)

1. **Google Cloud Console** → create a new project (or pick existing)
2. **APIs & Services → Library** → search "Google Analytics Data API" → **Enable**
3. **APIs & Services → Credentials → Create Credentials → Service account**
4. Skip role assignment (no GCP role needed)
5. Click the new service account → **Keys → Add Key → Create new key → JSON** → downloads a JSON file
6. **Critical:** open the JSON file. Get the `client_email` value (looks like `xxx@yyy.iam.gserviceaccount.com`).
7. In **GA4 → Admin → Property Access Management** → **Add user** → paste that email → role: **Viewer** → Add
8. In GA4 → **Admin → Property Settings** → copy your Property ID (e.g. `123456789`) → put in `GA4_PROPERTY_ID`
9. Open the JSON file, copy ALL contents, paste into `GA4_SERVICE_ACCOUNT_JSON` (must be a single-line string — escape any newlines as `\n`)

> Tip: use `node -e "console.log(JSON.stringify(require('./key.json')))"` to get a properly-escaped one-liner.

---

## Testing each API endpoint individually

After setup, you can hit these in the browser to verify each source works:

| Endpoint | What it tests |
|---|---|
| <http://localhost:3000/api/ga4?startDate=7daysAgo&endDate=today> | GA4 connectivity |
| <http://localhost:3000/api/typeform?since=2024-01-01> | Typeform connectivity |
| <http://localhost:3000/api/klaviyo/profiles?listId=VgLXm8&max=10> | Klaviyo connectivity |
| <http://localhost:3000/api/dashboard?range=weekly> | The combined endpoint the UI uses |

If any returns an `error` field, the message tells you exactly what's wrong (bad key, missing permission, wrong list ID, etc.).

---

## Folder structure

```
tracking-dashboard/
├── app/
│   ├── api/
│   │   ├── dashboard/route.ts    ← combined data feed for the UI
│   │   ├── klaviyo/profiles/     ← debug Klaviyo
│   │   ├── typeform/             ← debug Typeform
│   │   └── ga4/                  ← debug GA4
│   ├── layout.tsx
│   ├── page.tsx                  ← the dashboard UI
│   └── globals.css
├── lib/
│   ├── klaviyo.ts                ← Klaviyo API client
│   ├── typeform.ts               ← Typeform API client
│   └── ga4.ts                    ← GA4 Data API client
├── components/                   ← (empty, for future charts)
├── .env.local.example
├── .env.local                    ← YOU create this. Never commit.
├── package.json
├── next.config.mjs
├── tsconfig.json
├── tailwind.config.ts
└── postcss.config.mjs
```

---

## What's tracked (and what's NOT yet)

### ✅ Working out of the box
- Total visitors / pageviews (GA4)
- Traffic source breakdown (GA4) — Source / Medium / Campaign / Sessions / Users
- Typeform opt-in count
- Klaviyo list member counts (Checkout / Friend / Reset Opt-in)
- Purchases count + revenue (from Klaviyo Placed Order events)
- Daily / Weekly / Monthly / All-time toggle

### 🚧 Add later if you want
- **Per-source funnel** — visitors → opt-in → purchase **broken down by utm_source**. This requires the lead popup snippet to already be tagging profiles with `first_utm_source` (see `Tracking-Dashboard-Process.md`). Once data is flowing, modify `app/api/dashboard/route.ts` to filter Klaviyo profiles by property.
- **Charts** — install `recharts` (`npm i recharts`), create components in `/components/`, drop into `app/page.tsx`.
- **Cost per lead** — wire Facebook Marketing API + Google Ads API into new `lib/` clients, add KPI cards for spend.
- **Password protect** — add Next.js middleware checking `DASHBOARD_PASSWORD` env var.

---

## Costs

- **Vercel** — free Hobby tier (more than enough for one viewer)
- **GA4 Data API** — free
- **Klaviyo API** — free (included in your plan)
- **Typeform API** — free with paid Typeform plans

Total: **$0/month** if you're already paying for Typeform.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `KLAVIYO_PRIVATE_KEY env var is missing` | Add it to `.env.local`, restart dev server |
| Klaviyo `403 invalid_scope` | Private key doesn't have read access to that resource. Recreate key with proper scopes. |
| GA4 `403 PERMISSION_DENIED` | Service account email not added to GA4 property as Viewer |
| GA4 `404 NOT_FOUND` | Wrong `GA4_PROPERTY_ID` — use the numeric ID, NOT the `G-XXXXXX` measurement ID |
| Typeform `401 Unauthorized` | Token expired or wrong scope. Generate a new one. |
| Klaviyo lists return 0 even though they have members | The Klaviyo list might be a "Segment" not a "List". Use the segment endpoint instead — see `lib/klaviyo.ts:segmentProfiles`. |
| Dashboard shows `—` for everything | Open `/api/dashboard?range=weekly` directly in browser → check the `errors` field |

---

## Next steps for you

1. ✅ Get all the API keys (15-20 min)
2. ✅ Fill in `.env.local`
3. ✅ Run `npm run dev` → confirm dashboard loads with real data
4. ✅ Test each endpoint individually if something doesn't work
5. ✅ Push to GitHub
6. ✅ Deploy to Vercel
7. ✅ Add the same env vars in Vercel → redeploy
8. ✅ Bookmark the Vercel URL

Done. You have a live dashboard.
