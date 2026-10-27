# Light House Surf Camp — Website

A modern, mobile-friendly, SEO-optimized website for **Light House Surf Camp**, Arugam Bay, Sri Lanka — with an online booking flow and PayHere card-payment integration.

---

## 📁 What's inside

```
Light House Surf Camp/
├── index.html          # Home — and 11 more pages beside it (lessons,
│                       #   packages, rentals, gallery, reviews, about,
│                       #   stay, wellness, things-to-do, book, thank-you)
├── de/ fr/ it/ es/     # The same 12 pages, generated per language.
├── ru/ ja/ he/ ch/     #   English lives at the root; ch/ is Swiss German.
├── assets/
│   ├── css/style.css   # Every style on the site
│   └── js/
│       ├── main.js     # Nav, mobile menu, scroll animations
│       ├── content.js  # Reads content/*.json into the page
│       ├── booking.js  # The booking cart and the handoff to PayHere
│       └── thanks.js   # Confirms the payment on thank-you.html
├── content/            # What the owner edits in /admin — prices, rooms,
│                       #   photos, settings. Plain JSON, committed to git.
├── i18n/               # One dictionary per language (en.json is generated)
├── tools/              # i18n-tag.js marks the English copy, i18n-build.js
│                       #   generates the 96 translated pages + sitemap
├── netlify/functions/  # The payment backend. Nothing here runs in the
│   ├── _payhere.js     #   browser, and only this code holds the secrets.
│   ├── payhere-checkout.js
│   ├── payhere-notify.js
│   └── payhere-status.js
├── supabase/schema.sql # Run once, creates the bookings table
└── server/             # The same payment API as a standalone Express app,
    ├── payhere-server.js  #   for hosts that are not Netlify. Optional.
    ├── package.json
    └── .env.example    # Every environment variable, documented
```

## ▶️ View it now

Just **double-click `index.html`** — the whole site works offline in any browser. Images load from the web, so keep an internet connection for the photos.

---

## 🌐 Putting it online (hosting)

The site is plain HTML/CSS/JS with no build step, so hosting is free and easy:

1. **Netlify** — connect the repo and deploy. (Recommended, and the only
   option that also runs the card payments: `netlify.toml` is already set up
   to publish the folder as-is and deploy `netlify/functions/` alongside it.)
2. **GitHub Pages** or **any cPanel host** — upload the files. Everything
   works except card payments, which need somewhere to run server code;
   bookings fall back to WhatsApp on their own.

Then point your domain (e.g. `lighthousesurfcamp.lk`) at the host.

> **One rule:** do not create a folder called `api/` in the project root. The
> `/api/*` addresses are rewritten to the Netlify functions, and a real
> folder of that name would shadow them.

---

## 💳 Turning on real card payments (PayHere)

> Stripe is **not** available to Sri Lankan businesses, so the booking uses **PayHere** — the standard Sri Lankan gateway that accepts Visa, Mastercard, Amex, and local cards.

Right now the **Book Now** page works immediately and sends bookings via **WhatsApp** (no setup needed). To accept card deposits online, do this once:

### Step 1 — Get a PayHere account
Sign up at **https://www.payhere.lk**, complete business verification, and from **Settings → Domains & Credentials** copy your **Merchant ID** and **Merchant Secret**. Add your domain there too, or PayHere will reject the checkout.

### Step 2 — Put the keys in Netlify
Netlify → **Site configuration → Environment variables**. The names and what each one does are documented in `server/.env.example`; only the first three are required:

| Variable | Value |
|---|---|
| `PAYHERE_MERCHANT_ID` | from the PayHere dashboard |
| `PAYHERE_MERCHANT_SECRET` | from the PayHere dashboard — **server only, never commit it** |
| `PAYHERE_SANDBOX` | `true` while testing, `false` to take real money |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | optional — needed to store bookings and confirm them |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | optional — instant alert to the camp |
| `RESEND_API_KEY`, `BOOKING_EMAIL_FROM` | optional — confirmation email to the guest |

The merchant **secret** signs every amount. It is the one value that must never reach the browser, `content/settings.json`, or a commit. `.gitignore` keeps `.env` out of git; everything else is on you.

### Step 3 — Create the bookings table
In Supabase: **SQL Editor → New query**, paste `supabase/schema.sql`, Run. That is the whole database. Row Level Security is on with no policies on purpose, so nothing but the service-role key — which lives only in Netlify — can read or write it.

Skip this and payments still work; the camp is still alerted and PayHere still has the receipt. You just lose the stored booking, the guest's confirmation email, and the confirmation on `thank-you.html`.

### Step 4 — Switch it on
In **/admin → Settings → Card payments**, turn **Accept card payments** on. That is the only payment setting in the admin, and it is the only one the browser is trusted with.

Test with PayHere's published **sandbox test cards** while `PAYHERE_SANDBOX=true`. When the whole flow works end to end, swap in the live credentials and set `PAYHERE_SANDBOX=false`.

### How the money is kept honest
Worth knowing, because it is the reason this is four steps instead of one:

- **The browser never sends a price.** It sends `[{id, qty}]`, and the server reprices the cart from the same `content/*.json` the page rendered from. A guest cannot settle an $890 trip for $1 by editing the request, and the displayed deposit and the charged deposit cannot drift apart.
- **The guest's return is not proof of payment.** Anyone can open `thank-you.html`. What marks a booking paid is PayHere's own server-to-server callback to `/api/payhere-notify`, checked against a signature made with the merchant secret. The page then *asks* `/api/payhere-status` what happened, and says only what is true.
- **The amount is checked again on the way back.** If the callback's amount or currency does not match what was quoted, it is logged loudly rather than trusted quietly.

**Until you finish this, every "Pay" click safely falls back to WhatsApp — so you never lose a booking.**

---

## 🔍 SEO — already built in

- Unique title, meta description & keywords on every page (targeting *Surf Lessons Sri Lanka, Surf Camp Sri Lanka, Learn to Surf Sri Lanka, Best Surf Camp Sri Lanka, Surf School Sri Lanka*).
- `LocalBusiness` / `SportsActivityLocation` structured data (rich results in Google).
- Open Graph tags for clean WhatsApp/Facebook/Instagram link previews.
- Canonical URLs, semantic headings, descriptive image `alt` text.

**Next SEO steps:** create a free **Google Business Profile**, submit the site to **Google Search Console**, and add a `sitemap.xml` once your domain is live.

---

## ✏️ Editing content

- **Everything is edited in `/admin`** (Netlify CMS, invite-only). Prices, rooms, photos, opening copy and settings all write back to `content/*.json` as ordinary commits, so every change is in the git history and revertible.
- **Prices live in exactly one place** — `content/packages.json` and its siblings. The booking page, the quoted deposit and the amount actually charged all read from that same file, which is why they cannot disagree.
- **Photos** are your own, optimized for web and stored in `assets/img/` (cabanas, dome, restaurant, drone, garden). To add more, drop JPGs into `assets/img/` and reference them. A few surf-action / board shots on the Surf and Rentals pages are still royalty-free stock — swap them for your own surf photos when you have them.
- **Contact details** (WhatsApp, email, Instagram) live in `content/settings.json` and are hydrated into every page's footer.
- **Translations:** edit the English copy in the root `.html` files, then run `node tools/i18n-tag.js` (marks the new strings) and `node tools/i18n-build.js` (regenerates all 96 translated pages and `sitemap.xml`). Translators work in `i18n/<lang>.json`.

---

## ⭐ Guest review form (with photo upload)

The **Reviews** page has a "Leave a Review" form (name, star rating, text, photo upload with live preview). To receive submissions **including photos** by email, set up a free **Formspree** form:

1. Sign up at **https://formspree.io**, create a form, and copy its endpoint (looks like `https://formspree.io/f/abcdwxyz`).
2. In `reviews.html`, replace `YOUR_FORM_ID` in the form's `action` with your real endpoint.
3. In the small `<script>` just below the form, set `FORMSPREE_READY = true`.

Formspree emails you each review with the attached photos. **Until you do this, the form still works** — it routes the review to your WhatsApp/email (guests attach photos in WhatsApp), so you never lose feedback.

---

Built for Light House Surf Camp 🌊 — Arugam Bay, Sri Lanka.
"# lighthouse-surf-camp" 
