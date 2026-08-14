# Light House Surf Camp — Website

A modern, mobile-friendly, SEO-optimized website for **Light House Surf Camp**, Arugam Bay, Sri Lanka — with an online booking flow and PayHere card-payment integration.

---

## 📁 What's inside

```
Light House Surf Camp/
├── index.html          # Home
├── lessons.html        # Surf Lessons
├── packages.html       # Surf Camp Packages
├── rentals.html        # Surfboard Rentals
├── gallery.html        # Gallery
├── reviews.html        # Reviews
├── about.html          # About Us
├── book.html           # Contact & Book Now (online booking + payment)
├── thank-you.html      # Post-payment confirmation page
├── assets/
│   ├── css/style.css   # All styling (premium cinematic theme)
│   └── js/main.js      # Nav, mobile menu, scroll animations
└── server/             # Payment backend (PayHere)
    ├── payhere-server.js
    ├── package.json
    └── .env.example
```

## ▶️ View it now

Just **double-click `index.html`** — the whole site works offline in any browser. Images load from the web, so keep an internet connection for the photos.

---

## 🌐 Putting it online (hosting)

The site is plain HTML/CSS/JS, so hosting is free and easy:

1. **Netlify** or **Vercel** — drag-and-drop the `Light House Surf Camp` folder. Done. (Recommended.)
2. **GitHub Pages** — push the folder to a repo, enable Pages.
3. **Any cPanel host** — upload the files to `public_html`.

Then point your domain (e.g. `lighthousesurfcamp.lk`) at the host.

---

## 💳 Turning on real card payments (PayHere)

> Stripe is **not** available to Sri Lankan businesses, so the booking uses **PayHere** — the standard Sri Lankan gateway that accepts Visa, Mastercard, Amex, and local cards.

Right now the **Book Now** page works immediately and sends bookings via **WhatsApp** (no setup needed). To accept card deposits online, do this once:

### Step 1 — Get a PayHere account
Sign up at **https://www.payhere.lk**, complete business verification, and from the dashboard copy your **Merchant ID** and **Merchant Secret**.

### Step 2 — Deploy the payment server
The card secret can never live in the browser, so a tiny backend signs each payment. Deploy the `server/` folder to a free Node host (**Render.com** is easiest):

```bash
cd server
npm install
# set env vars PAYHERE_MERCHANT_ID and PAYHERE_MERCHANT_SECRET
npm start
```

On Render: New → Web Service → connect the repo → Build `npm install` → Start `npm start` → add the two environment variables from `.env.example`.

### Step 3 — Flip the switch in `book.html`
Near the bottom of `book.html`, edit the `CONFIG` block:

```js
const CONFIG = {
  payHereEnabled: true,                              // ← change to true
  payHereMerchantId: "1XXXXXX",                      // ← your Merchant ID
  hashEndpoint: "https://your-server.onrender.com/api/payhere-hash",
  notifyUrl:   "https://your-server.onrender.com/api/payhere-notify",
  returnUrl:   "https://lighthousesurfcamp.lk/thank-you.html",
  cancelUrl:   "https://lighthousesurfcamp.lk/book.html",
  ...
};
```

Test in PayHere **sandbox** first (the form already points at `sandbox.payhere.lk`). When you're happy, change the form `action` in `book.html` from `sandbox.payhere.lk` to `www.payhere.lk` to go live.

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

- **Prices** live in two places — the `packages`/`lessons`/`rentals` pages (display) and the `PKG_*` / `data-price` values in `book.html` (booking maths). Update both.
- **Photos** are your own, optimized for web and stored in `assets/img/` (cabanas, dome, restaurant, drone, garden). To add more, drop JPGs into `assets/img/` and reference them. A few surf-action / board shots on the Surf and Rentals pages are still royalty-free stock — swap them for your own surf photos when you have them.
- **Contact details** (WhatsApp, email, Instagram) appear in the footer of each page and in the `CONFIG` block of `book.html`.

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
