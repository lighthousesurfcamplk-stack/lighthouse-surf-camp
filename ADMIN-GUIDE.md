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

You only do this once. Pick **Option A** unless you have a reason not to.

### Option A — Netlify login (recommended: no GitHub account needed)

**Step 1. Put the site on Netlify.**

1. Go to [app.netlify.com](https://app.netlify.com) and sign up (free).
2. **Add new site → Import an existing project → GitHub**.
3. Authorise Netlify, then choose the `lighthouse-surf-camp` repository.
4. Leave the build command **empty** and the publish directory as **`.`**
   (this is a plain HTML site — there is nothing to build).
5. Click **Deploy**. In under a minute you get a URL like
   `lighthouse-surf-camp.netlify.app`.

**Step 2. Turn on logins.**

1. In your new site: **Site configuration → Identity → Enable Identity**.
2. Under **Registration preferences**, choose **Invite only**.
   *Do not skip this.* "Open" means anyone on the internet could register
   themselves and start editing your prices.
3. Under **Services → Git Gateway**, click **Enable Git Gateway**.
   This is what lets the admin panel save to GitHub on your behalf.

**Step 3. Invite yourself.**

1. Go to the **Identity** tab → **Invite users**.
2. Enter your own email address and send.
3. Open the email, click **Accept the invite**, and set a password.
4. You land on `/admin` and you are in.

**Step 4. Connect your own domain** (when you're ready).

**Domain management → Add a domain** → `lighthousesurfcamp.lk`, then follow
Netlify's DNS instructions. HTTPS is issued automatically and free.

> If your Netlify site does not offer Identity, use Option B instead — the
> admin panel itself is identical either way.

---

### Option B — GitHub login

Use this if you would rather sign in with your GitHub account.

1. Open `admin/config.yml`.
2. Comment out the `backend: git-gateway` block and uncomment the
   `backend: github` block below it.
3. You need an OAuth client, because GitHub will not accept a login from a
   static page directly. The standard route is to deploy a small, free,
   open-source OAuth relay (for example `decap-cms-github-oauth-provider`)
   and put its address in `base_url`.
4. In **GitHub → Settings → Developer settings → OAuth Apps → New OAuth App**,
   set the callback URL to `https://<your-oauth-relay>/callback`, then paste
   the Client ID and Secret into the relay's environment variables.

Option A avoids all of this, which is why it is the default.

---

## Part 3 — Day-to-day use

**To log in:** go to `yoursite.com/admin`, enter your email and password.

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
first, no `+` and no spaces: `94702828819`. Every WhatsApp button on the
site picks it up.

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

1. Get a **PayHere** merchant account approved.
2. Deploy `server/payhere-server.js` (any Node host — Netlify Functions,
   Render, Railway, a small VPS).
3. Set the **`PAYHERE_MERCHANT_SECRET`** environment variable **on that server
   only**. It must never appear in this repository, in `settings.json`, or
   anywhere the browser can read it. The whole reason the hash is generated
   server-side is to keep that secret off the guest's device.
4. In the admin: Site Settings → Card payments →
   fill in **Merchant ID**, point **Hash endpoint** at your deployed server,
   leave **Sandbox mode ON**, and turn **Accept card payments ON**.
5. Test end-to-end with PayHere's sandbox test cards.
6. Only once a sandbox payment has completed cleanly, turn **Sandbox mode OFF**.

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
Give it a minute — Netlify redeploys after each save. Check
**Deploys** in Netlify for a failed build. Then hard-refresh
(`Ctrl+Shift+R`, or `Cmd+Shift+R` on a Mac).

**"Failed to load config.yml"**
YAML is whitespace-sensitive. If you edited `admin/config.yml` by hand, check
you used spaces and not tabs, and that indentation lines up.

**"I can't log in."**
Confirm Identity is enabled and that you accepted the emailed invite. Invited
users must set a password before the first login.

**"I deleted something by accident."**
Nothing is ever really lost. Open your repository on GitHub → **History** on
the relevant file in `/content` → open the version from before the mistake →
copy the value back. Every save is a commit with a timestamp.
