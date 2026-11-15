# Light House Surf Camp — Owner's Guide to the Admin Panel

Everything a guest sees that changes — prices, photos, packages, rooms,
treatments, reviews, your WhatsApp number, the deposit percentage, and now
every photograph and the homepage background film — lives in plain files under
`/content`. You never open them by hand. You open
**`yoursite.com/admin`**, click, type, and press Publish.

There is no database and no monthly fee. Each save is a normal commit to your
own GitHub repository, and the site redeploys automatically in about a minute.

---

## Part 1 — What you can edit

| Section in the admin | Controls | Lives in |
|---|---|---|
| **Camp Packages** | The three big cards guests see first (Weekend Taster, 7-Day, 10-Day): name, price, photo, description, what's included | `content/packages.json` |
| **Rooms, Lessons & Treatments** | Everything under "Build Your Own" — every cabana, lesson, rental and Ayurvedic treatment | `content/experiences.json` |
| **Guest Reviews** | The testimonials on the homepage and the reviews page | `content/reviews.json` |
| **Images & Video** | Every photograph on the public site, grouped by page — plus the homepage background film | `content/media-*.json` |
| **Site Settings** | WhatsApp number, email, Instagram, deposit percentage, cancellation wording, card payments, the headline numbers | `content/settings.json` |

Change a price in the admin and it updates **everywhere at once** — the booking
engine, the package cards, the totals in the cart, and any quote already sitting
in a guest's saved basket. That is deliberate: there is nowhere for a stale
price to hide.

---

## Part 2 — Getting the admin online (one-time, ~15 minutes)

You only do this once. The site is hosted on **Vercel**, and you sign in to
the admin with your **GitHub** account — the same account the website's files
already live in. Nothing to install, nothing to pay for.

> **Why GitHub, and not an email and password?** An email login needs a
> service somewhere to hold the passwords. Netlify has one built in, and this
> guide used to describe it. Vercel does not — which is exactly what the error
> *"Unable to access identity settings"* was trying to say. Signing in with
> GitHub needs no extra service at all: the repository already knows who you
> are. Two small files in `/api` do the one job Netlify's service was doing,
> which is to hold a secret the browser must never be shown.

**Step 1. Put the site on Vercel.** *(Skip if it is already there.)*

1. Go to [vercel.com](https://vercel.com) and sign in with GitHub (free).
2. **Add New → Project**, then **Import** the `lighthouse-surf-camp`
   repository.
3. Framework Preset: **Other**. Leave the **Build Command** empty and the
   **Output Directory** as the repository root — this is a plain HTML site,
   there is nothing to build.
4. Click **Deploy**. In under a minute you get an address like
   `lighthouse-surf-camp.vercel.app`.

**Step 2. Create the GitHub login.**

1. Go to **GitHub → your avatar → Settings → Developer settings →
   OAuth Apps → New OAuth App**.
2. Fill it in:

   | Field | Value |
   |---|---|
   | Application name | `Light House Surf Camp admin` |
   | Homepage URL | `https://yoursite.com` |
   | Authorization callback URL | `https://yoursite.com/api/callback` |

   Use your real address — the custom domain if you have one, otherwise the
   `…vercel.app` one. The callback URL has to match **exactly**: `https://`,
   the same spelling, and no trailing slash.
3. Press **Register application**, then **Generate a new client secret**.
   Leave that page open — GitHub will not show you the secret again once you
   navigate away.

**Step 3. Give the two values to Vercel.**

In your Vercel project: **Settings → Environment Variables**. Add these for
**all** environments:

| Name | Value |
|---|---|
| `GITHUB_OAUTH_ID` | the **Client ID** from Step 2 |
| `GITHUB_OAUTH_SECRET` | the **Client secret** from Step 2 |
| `SITE_URL` | your site's address, e.g. `https://lighthousesurfcamp.lk` |

The client secret belongs here and nowhere else. Never paste it into the
admin, into `config.yml`, or into any file in the repository: everything in
the repository is public the moment it deploys. `SITE_URL` is not part of the
login — it is the address the payment pages send guests back to — but set it
now while you are in the right screen.

*Optional, and worth doing:*

| Name | Value |
|---|---|
| `ALLOWED_GITHUB_LOGINS` | your GitHub username, e.g. `lighthousesurfcamplk-stack` |

Without this, any GitHub user who approves the app gets as far as the admin
screen. They cannot change anything — GitHub refuses writes from anyone
without access to your repository — but there is no reason to let them look.
With it, only the usernames you list get in. Separate several with commas.

**Step 4. Redeploy, then log in.**

Environment variables only reach the site on its *next* deploy, so nothing
above takes effect until you trigger one: **Deployments → the top one →
`⋯` → Redeploy**. Then open `https://yoursite.com/admin/`, click
**Login with GitHub**, approve once, and you are in.

**Step 5. Connect your own domain** (when you're ready).

In Vercel: **Settings → Domains → Add** → `lighthousesurfcamp.lk`, then
follow the DNS instructions it gives you. HTTPS is issued automatically and
free.

> **If you ever change the domain**, go back to the OAuth app from Step 2 and
> update its callback URL to `https://<new-domain>/api/callback`, and update
> `SITE_URL`. Those are the only two places your address is written down —
> the admin panel works out where it is running by itself. A login popup
> complaining that the redirect URI does not match is this, and only this.

---

## Part 3 — Day-to-day use

**To log in:** go to `yoursite.com/admin`, click **Login with GitHub**, and
approve if GitHub asks. It will not ask again on that browser.

**To change a price:**
Camp Packages → click the package → change **Price** → **Publish**.
Numbers only. Do not type a `$`; the site adds the currency for you.

**To swap a photo:**
Click the package or room → click the image → **Choose an image** → upload.
Landscape photos at least 1400px wide look best. Fill in **Photo description**
— screen readers read it aloud and Google uses it to understand the picture.

**To swap a picture anywhere else on the site:**
**Images & Video** → pick the page → click the picture → **Choose an image** →
upload → **Publish**. The eight page areas are:

| Entry | Covers |
|---|---|
| Home Page | Hero slideshow and background film, the story photo, the three room teasers, dining, wellness, the four-photo band, the place photo, the closing banner |
| Stay Page | Hero, all seven room photographs, the four-photo band, the closing banner |
| Surf Pages | Lessons hero and feature, all nine surf-spot photos, the rentals hero and four boards, both closing banners |
| Wellness Page | Hero, the three treatment photos, the closing banner |
| Things To Do Page | Hero, the feature photo, all twelve tiles, the closing photo and banner |
| About Page | Hero, both story photos, the closing banner |
| Gallery Page | Hero, the whole photo wall, the six Instagram tiles |
| Packages, Booking & Reviews | The hero of each of those three pages, plus the packages feature and both closing banners |

**Leave a field empty and that spot keeps the picture the site shipped with.**
Nothing breaks, nothing goes blank — an empty field simply means "no change".
That is also how you undo a swap you regret: clear the field and publish.

**To put a moving background behind the homepage headline:**
Images & Video → **Home Page** → **Background film**. There are three fields
and all of them are optional:

- **Desktop film (landscape)** — MP4 (H.264), about 1920×1080, 8–15 seconds,
  **no sound**, under 5 MB.
- **Mobile film (portrait)** — MP4 (H.264), about 1080×1920, same length,
  **no sound**, under 3 MB. Phones are held upright: a landscape film shown on
  one gets cropped to its middle strip, which is why the portrait cut is worth
  filming separately.
- **Still frame while the film loads** — one photograph shown for the moment
  before the first frame arrives. Optional; without it the film fades in over
  the slideshow.

Upload **only one** film and it is used on every screen. Upload **neither** and
the homepage keeps the three-photo slideshow exactly as it is today — the film
is an addition, never a replacement. If a guest's phone refuses to autoplay it
(Low Power Mode does this, and so do some data-saver settings), or if they have
asked their phone to reduce motion, they see the photographs instead. Nobody
ever sees a black rectangle.

Keep the films **silent** — a page that makes noise by itself is the fastest way
to lose a visitor — and keep them **short and calm**. This plays behind your
headline; it is a backdrop, not a showreel.

**To add a new room or treatment:**
Rooms, Lessons & Treatments → **Add Item** → fill in the fields.
The **Internal ID** must be unique, lowercase, with dashes — for example
`stay-garden-cabana`. Pick the right **Tab** so it files itself under Stay,
Surf or Wellness.

**To retire something without deleting it:**
Untick **Show on the website**. It disappears from the site but the record —
and its ID — stays intact, so you can bring it back next season in one click.

**To reorder anything:** drag the handle on the left of each row. The order in
the admin is the order guests see.

**To change your WhatsApp number:**
Site Settings → Contact → **WhatsApp number**. Digits only, country code
first, no `+` and no spaces: `94771066677`. Every WhatsApp button *and* every
booking enquiry on the site picks this one up — so this is the phone that has
to be watched.

Below it sits **Second WhatsApp number** (`94771606203`) — the camp's other
line. It is recorded here so both numbers live in one place, and it is printed
in the site footer next to the first. No booking button routes to it, and the
footer text itself lives in the page templates, so tell your developer if this
number ever changes.

Each number has a matching **as displayed** field — the spaced version guests
read, e.g. `+94 77 106 6677`.

**To change the deposit:**
Site Settings → Booking rules → **Deposit taken online**. It is a decimal:
`0.25` = 25% now, balance on arrival. `0.5` = half now. `1` = pay in full.

### Three rules worth keeping

1. **Never change an Internal ID once it is live.** Guests' saved baskets and
   the whole booking engine look items up by ID. Renaming one empties their
   basket. Change the *Name* freely — that is just the label.
2. **Only publish numbers and reviews you can evidence.** The star rating and
   review count are published as structured data that Google may show in
   search results. Inventing them breaks Google's policy and consumer
   protection law in most of your guests' home countries.
3. **Never paste your PayHere Merchant *Secret* into the admin.** The Merchant
   *ID* is fine and is meant to be public. The secret belongs only in the
   server environment variable — see Part 5.

---

## Part 4 — Editing on your own laptop, without publishing

Useful for trying something out before guests see it.

```bash
npx decap-server
```

Leave that running, start the site in another terminal:

```bash
python -m http.server 5599
```

Then open `http://localhost:5599/admin/`. No login is asked for, and every
save writes straight into your local files. Nothing goes live until you commit
and push. This works because `local_backend: true` is set in `config.yml`.

---

## Part 5 — Turning on card payments (optional)

Bookings work today without this: guests confirm over WhatsApp and pay the
deposit however you agree. Card payments are an upgrade, not a dependency.

**Almost none of this is done in the admin.** That is the point. Card details
and the keys that move money are the one part of the site the browser is not
trusted with, so they live in Vercel's settings instead — where a published
file cannot leak them.

1. Get a **PayHere** merchant account approved. From **Settings → Domains &
   Credentials**, copy the **Merchant ID** and the **Merchant Secret**, and
   add your domain there — PayHere rejects a checkout from a domain it does
   not know.

2. In Vercel: **Settings → Environment Variables** — the same screen as
   Part 2, Step 3. Add

   - `PAYHERE_MERCHANT_ID`
   - `PAYHERE_MERCHANT_SECRET`
   - `PAYHERE_SANDBOX` = `true`

   and make sure `SITE_URL` is set, which is how the payment pages know
   where to send a guest back to. Then redeploy: variables only reach the
   site on its next deploy.

   The **secret** is the one that matters. It signs every amount, and it must
   never appear in this repository, in `settings.json`, in the admin, or
   anywhere the browser can read it. If you ever paste it somewhere public,
   treat it as burned: regenerate it in the PayHere dashboard the same day.

3. *(Recommended)* Create the bookings table so payments are recorded and
   guests get a confirmation. In **Supabase → SQL Editor → New query**,
   paste the contents of `supabase/schema.sql` and press Run. Then add
   `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to the same Vercel
   settings. The service-role key is as sensitive as the merchant secret:
   server only, never in the admin.

   Skipping this does not break payments. You simply lose the stored booking,
   the guest's confirmation email, and the confirmed receipt on the
   thank-you page — the camp is still alerted, and PayHere still has the
   record.

4. In the admin: **Site Settings → Card payments → Accept card payments
   ON**. That single switch is the only payment setting here, and the only
   one the browser is trusted with. (The **Checkout endpoint** beside it
   should stay exactly as it is.)

5. Test end to end with PayHere's published **sandbox test cards**. Walk the
   whole path: build a booking, pay the deposit, and check that the
   thank-you page confirms it and that the booking appears in Supabase.

6. Only once a sandbox payment has completed cleanly: swap the live Merchant
   ID and Secret into Vercel, set `PAYHERE_SANDBOX` to `false`, and redeploy.

### What protects you

- **Prices are never taken from the browser.** When a guest pays, the page
  sends only *which* items and *how many*; the server works out the price
  from the same `content/packages.json` you edit here. Nobody can edit a
  price on their own screen and pay less — and the deposit a guest is shown
  can never differ from the one they are charged.
- **Arriving at the thank-you page is not proof of payment.** Anyone can open
  that address. The booking is marked paid only when PayHere's own servers
  confirm it to ours with a signature; the page then asks what actually
  happened and says only that. A guest who cancels is told the truth, not
  congratulated.

If anything fails mid-payment, the booking form automatically falls back to
WhatsApp rather than leaving the guest stranded.

---

## Part 6 — Firebase, the alternative

You asked about Firebase as an option, so here is an honest comparison rather
than a second set-up guide.

|  | **Decap CMS** (what is installed) | **Firebase** |
|---|---|---|
| Cost | Free, permanently | Free tier, then usage-based |
| Where content lives | Your own GitHub repo | Google's servers |
| Version history | Every edit is a commit you can roll back | Needs to be built |
| Offline / hosting failure | Site is static files — it keeps serving | Depends on Firebase being reachable |
| Speed for the guest | Content ships with the page, zero extra requests | An extra network round-trip per visit |
| Live inventory (real-time availability) | Not possible | Its natural strength |
| Set-up | The 15 minutes above | Project, SDK, security rules, auth, custom admin UI |

For a camp of this size, Decap is the better fit: it is free forever, it cannot
lose your data, and the site keeps working even if the CMS vendor disappears.

**The switch is deliberately cheap if you ever need it.** Every page reads its
content through one file — `assets/js/content.js` — and only from the four
`/content/*.json` documents. Moving to Firebase means rewriting the `getJSON`
function in that single file to read from Firestore. Nothing else on the site
knows or cares where the data came from. The moment to do it is when you want
**live room availability** — real-time inventory is the one thing a git-based
CMS genuinely cannot do.

---

## Troubleshooting

**"I published but the site hasn't changed."**
Give it a minute — Vercel redeploys after each save. Check
**Deployments** in Vercel for a failed build. Then hard-refresh
(`Ctrl+Shift+R`, or `Cmd+Shift+R` on a Mac).

**"Failed to load config.yml"**
YAML is whitespace-sensitive. If you edited `admin/config.yml` by hand, check
you used spaces and not tabs, and that indentation lines up.

**"Unable to access identity settings."**
This site no longer uses Netlify Identity — see Part 2. If you still see
this, your browser is holding an old copy of `admin/config.yml`:
hard-refresh (`Ctrl+Shift+R`, or `Cmd+Shift+R` on a Mac).

**"Cannot sign in yet — set GITHUB_OAUTH_ID and GITHUB_OAUTH_SECRET."**
Exactly what it says: Part 2, Step 3, and then redeploy. Variables you have
saved but not yet deployed do not count.

**"The redirect_uri is not associated with this application."**
GitHub is comparing the address you are on against the callback URL in the
OAuth app, character for character. Open the OAuth app from Part 2, Step 2
and set the callback to `https://<the address in your browser>/api/callback`.
A missing `s` in `https`, a trailing slash, or `www.` are the usual causes.

**"That GitHub account is not allowed to edit this site."**
Your username is not in `ALLOWED_GITHUB_LOGINS`. Correct it in Vercel —
lower case, commas between several — and redeploy.

**The login popup opens and nothing happens.**
Allow pop-ups for your site, and allow cookies: the sign-in uses a one-time
cookie to check that the reply came back from the request you started.

**"I deleted something by accident."**
Nothing is ever really lost. Open your repository on GitHub → **History** on
the relevant file in `/content` → open the version from before the mistake →
copy the value back. Every save is a commit with a timestamp.
