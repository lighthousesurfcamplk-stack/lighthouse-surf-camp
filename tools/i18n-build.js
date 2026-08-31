/* =========================================================================
   i18n-build.js — generates the STATIC per-language pages.

   WHY STATIC FILES AND NOT CLIENT-SIDE SWITCHING
   ----------------------------------------------
   A JS language switcher swaps text after the page loads. Googlebot indexes
   ONE url with ONE language, so the Russian, German and French copy is never
   indexed — you get zero multilingual SEO from it. This build instead emits
   real files:

       /index.html      /packages.html        (English, the source of truth)
       /ru/index.html   /ru/packages.html
       /de/index.html   /de/packages.html
       /fr/index.html   /fr/packages.html

   Each is a complete HTML document in that language, with its own <title>,
   meta description, canonical, and <html lang>. Google can crawl and rank
   every one of them independently.

   HOW A PAGE IS TRANSLATED
   ------------------------
   tools/i18n-tag.js stamped every copy-bearing element in the English HTML
   with data-i18n="key" (and every <img alt> with data-i18n-alt="key").
   This script walks those keys, looks each one up in i18n/<lang>.json, and
   swaps the content. A key with no translation falls back to English, so a
   half-finished dictionary still produces a valid, shippable page.

   Run:  node tools/i18n-build.js
   ========================================================================= */
const fs = require('fs');
const path = require('path');
const schema = require('./i18n-schema');

const ROOT = path.resolve(__dirname, '..');
const ORIGIN = 'https://lighthousesurfcamp.lk';

/* The languages we emit. `en` is the source and lives at the site root.
   To add a language: create i18n/<code>.json and add a row here.

   `code`     is BOTH the hreflang value and the dictionary filename, so the
              two can never drift apart.
   `dir`      is the URL segment. English is the source and has none.
   `flag`     is a regional-indicator pair. It is decoration only — it sits in
              an aria-hidden span, because a flag is a country and never a
              language, and a screen reader announcing "flag of Israel" where
              the user needs "Hebrew" is worse than silence. `name` carries
              the meaning, written in the language it names (endonym), which
              is the one string a visitor who cannot read the current page is
              still guaranteed to recognise.
   `menuLabel` is the word "Language" in that language, for the switcher's
              own accessible name — the switcher is the one control that must
              work for someone who landed on the WRONG language.
   `rtl`      stamps dir="rtl" on <html>. See the RTL block in style.css.

   Swiss row, flagged deliberately: 🇨🇭 is a country with four official
   languages, so "Swiss German/French" cannot be one URL. /ch/ is de-CH
   (Swiss Standard German — ~62% of residents); French-speaking Switzerland
   is already served by /fr/, and hreflang="de-CH" is exactly the mechanism
   for "German, but for Switzerland". The copy differs from /de/ where it
   genuinely differs: ß is never written in Switzerland (always ss), and the
   Helvetisms differ (Velo, Znüni, parkieren). If you would rather /ch/ were
   fr-CH, swap the two fields — nothing else in this file needs to change. */
const ALL_LANGS = [
  { code: 'en',    dir: '',   label: 'EN', flag: '🇬🇧', name: 'English',   menuLabel: 'Language', htmlLang: 'en',    ogLocale: 'en_US' },
  { code: 'de',    dir: 'de', label: 'DE', flag: '🇩🇪', name: 'Deutsch',   menuLabel: 'Sprache',  htmlLang: 'de',    ogLocale: 'de_DE' },
  { code: 'de-CH', dir: 'ch', label: 'CH', flag: '🇨🇭', name: 'Schweiz',   menuLabel: 'Sprache',  htmlLang: 'de-CH', ogLocale: 'de_CH' },
  { code: 'fr',    dir: 'fr', label: 'FR', flag: '🇫🇷', name: 'Français',  menuLabel: 'Langue',   htmlLang: 'fr',    ogLocale: 'fr_FR' },
  { code: 'it',    dir: 'it', label: 'IT', flag: '🇮🇹', name: 'Italiano',  menuLabel: 'Lingua',   htmlLang: 'it',    ogLocale: 'it_IT' },
  { code: 'es',    dir: 'es', label: 'ES', flag: '🇪🇸', name: 'Español',   menuLabel: 'Idioma',   htmlLang: 'es',    ogLocale: 'es_ES' },
  { code: 'ru',    dir: 'ru', label: 'RU', flag: '🇷🇺', name: 'Русский',   menuLabel: 'Язык',     htmlLang: 'ru',    ogLocale: 'ru_RU' },
  { code: 'ja',    dir: 'ja', label: 'JA', flag: '🇯🇵', name: '日本語',     menuLabel: '言語',      htmlLang: 'ja',    ogLocale: 'ja_JP' },
  { code: 'he',    dir: 'he', label: 'HE', flag: '🇮🇱', name: 'עברית',     menuLabel: 'שפה',      htmlLang: 'he',    ogLocale: 'he_IL', rtl: true }
];

/* A language is only real once its dictionary exists. Without this guard a
   row added here before its i18n/<code>.json is written would still get a
   directory, a switcher entry, an hreflang tag and a sitemap URL — all
   pointing at a page whose copy is 100% English. That is not a missing
   translation, it is duplicate content under a language claim, and Google's
   documented response is to discard the hreflang cluster for the WHOLE
   site, taking the languages that were correct down with it. Skipping the
   row costs one log line; shipping it costs the cluster. */
const LANGS = ALL_LANGS.filter(l =>
  !l.dir || fs.existsSync(path.join(ROOT, 'i18n', l.code + '.json')));

/* Pages that exist in every language. Everything else stays English-only for
   now; the switcher sends visitors on those pages to the translated HOME page
   rather than to a 404, and — importantly — those pages emit NO hreflang, so
   we never tell Google a translation exists when it does not. */
const TRANSLATED_PAGES = ['index', 'packages'];

/* Every page on the site, needed so links can be rewritten correctly. */
const ALL_PAGES = ['index','about','gallery','lessons','packages','rentals',
                   'reviews','stay','things-to-do','wellness','book','thank-you'];

const read = f => fs.readFileSync(f, 'utf8');
const load = code => {
  const p = path.join(ROOT, 'i18n', code + '.json');
  return fs.existsSync(p) ? JSON.parse(read(p)) : {};
};

/* Public URL for a page in a language — used by canonical, og:url, hreflang
   and the sitemap so all four always agree. Disagreement between them is the
   single most common reason Google ignores hreflang. */
function urlFor(lang, page) {
  const base = lang.dir ? ORIGIN + '/' + lang.dir : ORIGIN;
  return page === 'index' ? base + '/' : base + '/' + page + '.html';
}

/* ---------------------------------------------------------------------
   Content replacement
   Finds <tag ... data-i18n="key" ...> ... </tag> and swaps the inner HTML.
   Tag matching is depth-aware so nested same-name tags cannot fool it.
   --------------------------------------------------------------------- */
function translateContent(html, dict, stats) {
  const re = /<([a-zA-Z][\w-]*)\b[^>]*\bdata-i18n="([^"]+)"[^>]*>/g;
  let out = '', last = 0, m;
  while ((m = re.exec(html))) {
    const [openTag, tagName, key] = [m[0], m[1].toLowerCase(), m[2]];
    const contentStart = m.index + openTag.length;

    // Walk forward to the matching close tag.
    const scan = new RegExp('<(/?)' + tagName + '\\b[^>]*>', 'gi');
    scan.lastIndex = contentStart;
    let depth = 1, closeAt = -1, closeLen = 0, s;
    while ((s = scan.exec(html))) {
      if (s[1] === '/') { depth--; if (!depth) { closeAt = s.index; closeLen = s[0].length; break; } }
      else if (!/\/>$/.test(s[0])) depth++;
    }
    if (closeAt === -1) continue;

    const replacement = Object.prototype.hasOwnProperty.call(dict, key) ? dict[key] : null;
    if (replacement === null) { stats.missing.push(key); continue; }
    stats.hit++;

    out += html.slice(last, contentStart) + replacement;
    last = closeAt;
    re.lastIndex = closeAt + closeLen;
  }
  return out + html.slice(last);
}

/* Image alt text carries the Arugam Bay keywords, so it is translated too —
   otherwise the localised pages lose their image SEO entirely. */
function translateAlts(html, dict, stats) {
  return html.replace(/<img\b[^>]*>/gi, tag => {
    const k = tag.match(/\bdata-i18n-alt="([^"]+)"/);
    if (!k || !Object.prototype.hasOwnProperty.call(dict, k[1])) {
      if (k) stats.missing.push(k[1]);
      return tag;
    }
    stats.hit++;
    const esc = dict[k[1]].replace(/"/g, '&quot;');
    return tag.replace(/\balt\s*=\s*"[^"]*"/i, 'alt="' + esc + '"');
  });
}

/* ---------------------------------------------------------------------
   Path rewriting
   A page at /ru/index.html cannot use href="assets/…" — that resolves to
   /ru/assets/…. Everything relative gets a ../ prefix. Using ../ rather
   than a root-absolute /assets/ keeps the site working if it is ever served
   from a sub-folder.
   --------------------------------------------------------------------- */
function rewritePaths(html, lang) {
  if (!lang.dir) return html;

  // assets, sitemap, robots, manifest…
  html = html.replace(/\b(href|src|content)="(assets\/[^"]*)"/g, '$1="../$2"');
  html = html.replace(/\bhref="(favicon[^"]*)"/g, 'href="../$1"');

  // Internal page links: same-language if that page is translated, else back
  // to the English original one level up.
  html = html.replace(/\bhref="([a-z0-9-]+)\.html((?:#[^"]*)?)"/gi, (full, page, hash) =>
    TRANSLATED_PAGES.includes(page)
      ? 'href="' + page + '.html' + hash + '"'
      : 'href="../' + page + '.html' + hash + '"');

  return html;
}

/* ---------------------------------------------------------------------
   <head> rewriting: language, canonical, social, hreflang
   --------------------------------------------------------------------- */
function rewriteHead(html, lang, page, dict) {
  const meta = (dict.$pages && dict.$pages[page]) || {};
  const self = urlFor(lang, page);

  /* data-root tells the runtime how far it is from the site root.
     assets/js/content.js fetches /content/*.json to hydrate CMS prices;
     that path is relative, so from /ru/index.html a bare "content/"
     would resolve to /ru/content/ and 404 — every price on the page
     would silently fall back to the hard-coded HTML. Stamping the
     prefix here keeps the language list in ONE place (LANGS, above)
     instead of duplicating it inside the JS, and it keeps working if a
     language is ever nested deeper. English sits at the root, so it
     gets no attribute and content.js falls back to "". */
  const root = lang.dir ? ' data-root="../"' : '';

  /* Direction is a document-level fact, not a styling choice: it drives the
     bidi algorithm, so an RTL page served as dir="ltr" mis-orders every line
     that mixes Hebrew with a Latin word or a price — "מ-$190" renders with
     the number on the wrong side. Setting it here means the RTL CSS can key
     off [dir="rtl"] and needs no per-page class. */
  const dir = lang.rtl ? ' dir="rtl"' : '';
  html = html.replace(/<html[^>]*>/i,
    '<html lang="' + lang.htmlLang + '"' + dir + root + '>');

  /* Every head field falls back to the English original when the dictionary
     has no translation for it. Without this guard an empty $pages block
     silently blanks the <title> of the page it is building — which is exactly
     the kind of SEO damage that is invisible until traffic drops. */
  const set = (pattern, value) => { if (value) html = html.replace(pattern, value); };
  set(/<title>[\s\S]*?<\/title>/i, meta.title && '<title>' + meta.title + '</title>');
  set(/<meta name="description" content="[^"]*">/i,
      meta.description && '<meta name="description" content="' + meta.description + '">');
  set(/<meta name="keywords" content="[^"]*">/i,
      meta.keywords && '<meta name="keywords" content="' + meta.keywords + '">');
  set(/<meta property="og:title" content="[^"]*">/i,
      meta.ogTitle && '<meta property="og:title" content="' + meta.ogTitle + '">');
  set(/<meta property="og:description" content="[^"]*">/i,
      meta.ogDescription && '<meta property="og:description" content="' + meta.ogDescription + '">');
  set(/<meta property="og:image:alt" content="[^"]*">/i,
      meta.ogImageAlt && '<meta property="og:image:alt" content="' + meta.ogImageAlt + '">');
  set(/<meta name="twitter:title" content="[^"]*">/i,
      meta.ogTitle && '<meta name="twitter:title" content="' + meta.ogTitle + '">');
  set(/<meta name="twitter:description" content="[^"]*">/i,
      meta.ogDescription && '<meta name="twitter:description" content="' + meta.ogDescription + '">');

  html = html.replace(/<meta property="og:locale" content="[^"]*">/i,
                      '<meta property="og:locale" content="' + lang.ogLocale + '">');
  html = html.replace(/<link rel="canonical" href="[^"]*">/i,
                      '<link rel="canonical" href="' + self + '">');
  html = html.replace(/<meta property="og:url" content="[^"]*">/i,
                      '<meta property="og:url" content="' + self + '">');

  /* hreflang: every language version of THIS page points at every other,
     including itself, plus x-default for the language picker fallback.
     Emitted only for pages that genuinely exist in every language. */
  html = html.replace(/\n?\s*<link rel="alternate" hreflang="[^"]*" href="[^"]*">/g, '');
  if (TRANSLATED_PAGES.includes(page)) {
    const tags = LANGS.map(l =>
      '<link rel="alternate" hreflang="' + l.code + '" href="' + urlFor(l, page) + '">')
      .concat('<link rel="alternate" hreflang="x-default" href="' + urlFor(LANGS[0], page) + '">')
      .join('\n');
    html = html.replace(/(<link rel="canonical" href="[^"]*">)/i, '$1\n' + tags);
  }

  /* Tell search engines and screen readers what language the structured
     data describes. Stripped first so re-running never stacks duplicates. */
  html = html.replace(/,\s*"inLanguage"\s*:\s*"[a-zA-Z-]+"/g, '');
  html = html.replace(/("@type"\s*:\s*"(?:Resort|ItemList|BreadcrumbList)")/g,
                      '$1, "inLanguage": "' + lang.htmlLang + '"');

  return html;
}

/* ---------------------------------------------------------------------
   Language switcher — REAL LINKS, not a JS swapper.
   Each entry is an <a href> to the actual translated URL, so it is
   crawlable, middle-clickable, and works with JS disabled.
   --------------------------------------------------------------------- */
function switcherHTML(currentLang, page, fromLangDir, variant) {
  /* On an English-only page (stay, gallery…) there is no translated
     equivalent, so the switcher offers that language's HOME page rather
     than a 404. */
  const target = TRANSLATED_PAGES.includes(page) ? page : 'index';
  const hrefFor = l => {
    if (l.code === currentLang.code) return target + '.html';          // stay put
    if (l.dir === '') return (fromLangDir ? '../' : '') + target + '.html';
    return (fromLangDir ? '../' : '') + l.dir + '/' + target + '.html';
  };

  /* The two copies of the switcher live in the same document, so their menu
     ids must differ or aria-controls on one button would point at the
     other's list. */
  const id = 'lang-menu-' + variant;

  const items = LANGS.map(l => {
    const on = l.code === currentLang.code;
    return '<li><a href="' + hrefFor(l) + '" hreflang="' + l.code + '" lang="' + l.htmlLang + '"' +
           /* Each option is written in its own language, so each needs its own
              direction — otherwise the Hebrew endonym renders reversed inside
              an LTR menu. */
           (l.rtl ? ' dir="rtl"' : '') +
           (on ? ' class="on" aria-current="true"' : '') + '>' +
           '<span class="lang-flag" aria-hidden="true">' + l.flag + '</span>' +
           '<span class="lang-name">' + l.name + '</span></a></li>';
  }).join('');

  /* Deliberately NOT a <select>. A native select cannot contain an anchor, so
     its options are invisible to crawlers, un-middle-clickable and dead with
     JS off — which would throw away the entire reason these pages have static
     per-language URLs. This is the disclosure pattern instead: a button that
     owns aria-expanded, over a plain list of real links. It looks like a
     select, and unlike one it is still a set of nine indexable hrefs.

     aria-hidden on the flag is not an oversight. A flag names a country, never
     a language, and "flag of Switzerland" tells a screen-reader user nothing
     about which of four languages they are choosing. The endonym beside it
     carries the meaning; the emoji is decoration. */
  return '<div class="lang lang-' + variant + '" data-lang>' +
    '<button class="lang-toggle" type="button" aria-expanded="false" aria-controls="' + id + '"' +
      ' aria-label="' + currentLang.menuLabel + ': ' + currentLang.name + '">' +
      '<span class="lang-flag" aria-hidden="true">' + currentLang.flag + '</span>' +
      '<span class="lang-code">' + currentLang.label + '</span>' +
      '<svg class="lang-caret" viewBox="0 0 10 6" fill="none" stroke="currentColor" stroke-width="1.6"' +
        ' stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' +
        '<path d="M1 1.3 5 4.7 9 1.3"/></svg>' +
    '</button>' +
    '<ul class="lang-menu" id="' + id + '" aria-label="' + currentLang.menuLabel + '">' + items + '</ul>' +
  '</div>';
}

/* The switcher is injected TWICE, because the nav has two layouts:

     desktop  — a row in .nav-cta beside the Book Now button
     mobile   — the last item in the slide-in drawer

   At 375px the nav bar already carries the logo, Book Now and the burger;
   a four-item language row does not fit beside them. Each copy is hidden at
   the other breakpoint in CSS, so only one is ever visible or focusable. */
function injectSwitcher(html, lang, page) {
  const copy = variant => switcherHTML(lang, page, !!lang.dir, variant);

  /* Strip EVERY switcher variant before re-injecting, rather than trying to
     patch whichever one is already there. Three shapes have shipped from this
     script over time — an unclassed <ul class="lang">, the classed
     bar/drawer <ul> pair, and now the <div> dropdown — and the CSS shows a
     bare .lang at every width, so a leftover copy renders as a second
     switcher beside the real one. Strip-then-inject makes the function
     idempotent by construction: whatever shape the last build left, this one
     starts from a clean nav. Order matters — the drawer copy is stripped
     first, because it is a <div class="lang lang-drawer"> that the bar
     pattern below must not be able to reach into. */
  html = html
    /* Current shape, drawer copy: a <div> switcher inside its wrapper <li>.
       The strip has to run to the wrapper's own </div></li> and must not stop
       at an option's </li> — hence naming the closing </ul></div> pair. */
    .replace(/\s*<li class="lang-li"><div class="lang [^"]*"[\s\S]*?<\/ul><\/div><\/li>/g, '')
    /* Legacy shape, drawer copy: a <ul> switcher inside the wrapper <li>.
       An earlier non-greedy pattern stopped at the last option's "</li>
       followed by </ul>", leaving the wrapper's own </ul></li> behind; the
       next build then added a fresh wrapper in front of it and one orphaned
       pair accumulated per run until the nav list was structurally garbage.
       Naming the opening <ul class="lang lang-drawer"> removes the ambiguity. */
    .replace(/\s*<li class="lang-li"><ul class="lang lang-drawer"[\s\S]*?<\/ul><\/li>/g, '')
    /* Current shape, bar and solo copies. */
    .replace(/\s*<div class="lang(?: [^"]*)?" data-lang>[\s\S]*?<\/ul><\/div>/g, '')
    /* Legacy shape, bar and unclassed copies. */
    .replace(/\s*<ul class="lang(?: lang-bar)?" aria-label="[^"]*">[\s\S]*?<\/ul>/g, '');

  /* Heal the closers those earlier runs orphaned. A clean nav list always ends
     with the last link, then </ul>, then <div class="nav-cta">, so anything
     else sitting between the two is leftover scaffolding — collapse it back to
     that one shape. This is a no-op on a clean file; on a checkout still
     carrying the damage it repairs itself on the next build instead of needing
     a hand edit, which is what makes the strip-then-inject contract above hold
     for real inputs and not only for pristine ones. */
  html = html.replace(/<\/a><\/li>(?:\s|<\/ul>|<\/li>)*<div class="nav-cta">/,
    '</a></li>\n  </ul>\n  <div class="nav-cta">');

  /* thank-you.html has a stripped-back nav with no slide-in drawer, so the
     usual two-copy pattern does not apply: a .lang-bar there would be hidden
     below 1180px with no drawer copy to take over, leaving mobile visitors no
     switcher at all. Pages without a drawer get the .lang-solo variant, which
     the CSS shows at every width. */
  if (!/id="primary-nav"/.test(html)) {
    return html.replace(/(<div class="nav-cta">\s*)/, '$1' + copy('solo') + '\n    ');
  }

  html = html.replace(/(<div class="nav-cta">\s*)/, '$1' + copy('bar') + '\n    ');
  /* The drawer copy is injected at the TOP of the list, not the bottom.
     On a phone the switcher used to sit below nine links, so a visitor who
     needed another language had to scroll the whole menu to find it. DOM
     order and visual order now agree, which also keeps the Tab order
     honest — the CSS order:-1 is only a fallback for a page that has not
     been rebuilt yet. */
  html = html.replace(/(<ul class="nav-links" id="primary-nav">)(\s*)/,
    '$1$2<li class="lang-li">' + copy('drawer') + '</li>$2');
  return html;
}

/* ---------------------------------------------------------------------
   Build
   --------------------------------------------------------------------- */
function build() {
  const report = [];

  for (const lang of LANGS) {
    const dict = lang.code === 'en' ? {} : load(lang.code);

    for (const page of ALL_PAGES) {
      const src = path.join(ROOT, page + '.html');
      if (!fs.existsSync(src)) continue;

      // English pages are edited in place: they only gain the switcher and
      // (on translated pages) the hreflang block. Their copy is untouched.
      if (lang.code === 'en') {
        let html = read(src);
        html = injectSwitcher(html, lang, page);
        html = rewriteHead(html, lang, page, { $pages: {} });
        html = schema.rebuildFaq(html, lang.htmlLang).html;
        fs.writeFileSync(src, html);
        continue;
      }

      // Other languages: only the translated pages are emitted.
      if (!TRANSLATED_PAGES.includes(page)) continue;

      const stats = { hit: 0, missing: [] };
      const schemaStats = { hit: 0, missing: [], broken: [] };
      let html = read(src);
      html = translateContent(html, dict, stats);
      html = translateAlts(html, dict, stats);
      html = rewriteHead(html, lang, page, dict);
      html = injectSwitcher(html, lang, page);
      html = schema.rebuildFaq(html, lang.htmlLang).html;
      html = schema.translateSchemaText(html, dict, schemaStats);
      html = rewritePaths(html, lang);
      html = html.replace(/style\.css\?v=(\d+)/g, 'style.css?v=$1');

      const outDir = path.join(ROOT, lang.dir);
      fs.mkdirSync(outDir, { recursive: true });
      fs.writeFileSync(path.join(outDir, page + '.html'), html);

      const total = stats.hit + stats.missing.length;
      report.push('  ' + lang.dir + '/' + page + '.html  ' + stats.hit + '/' + total +
        ' translated' + (stats.missing.length ? '  (' + stats.missing.length + ' fell back to English)' : ''));

      /* Structured data is invisible in the browser, so a missing $schema
         entry would ship English inside a Russian page with nothing on
         screen to give it away. Report it in the same place as the copy
         coverage, and name the strings so the gap is actionable. */
      if (schemaStats.missing.length || schemaStats.broken.length) {
        report.push('      schema: ' + schemaStats.hit + ' translated, ' +
          schemaStats.missing.length + ' left in English ' +
          JSON.stringify(schemaStats.missing.slice(0, 4)) +
          (schemaStats.broken.length ? ', ' + schemaStats.broken.length + ' unparseable block(s)' : ''));
      }
    }
  }

  const skipped = ALL_LANGS.filter(l => !LANGS.includes(l));
  if (skipped.length) {
    console.log('Skipped (no i18n/<code>.json yet): ' +
      skipped.map(l => l.code).join(', ') +
      '  — not linked, not in hreflang, not in the sitemap.');
  }
  console.log('English pages updated in place (switcher + hreflang).');
  console.log('Generated:');
  report.forEach(r => console.log(r));
  return report;
}

/* ---------------------------------------------------------------------
   Sitemap — one entry per URL, each carrying xhtml:link alternates.
   This is the form Google recommends: it states the whole language cluster
   in one place, so the alternates cannot drift out of sync with the pages.
   --------------------------------------------------------------------- */
function sitemap() {
  const today = new Date().toISOString().slice(0, 10);
  const priority = { index: '1.0', packages: '0.9', book: '0.9', stay: '0.8',
    lessons: '0.8', rentals: '0.8', wellness: '0.7', 'things-to-do': '0.7',
    reviews: '0.7', gallery: '0.6', about: '0.6' };
  const freq = { index: 'weekly', packages: 'weekly', reviews: 'weekly', book: 'monthly', about: 'yearly' };

  const rows = [];
  for (const page of ALL_PAGES) {
    if (page === 'thank-you') continue;            // noindex, no search value
    const langs = TRANSLATED_PAGES.includes(page) ? LANGS : [LANGS[0]];
    for (const lang of langs) {
      const alts = TRANSLATED_PAGES.includes(page)
        ? LANGS.map(l => '    <xhtml:link rel="alternate" hreflang="' + l.code + '" href="' + urlFor(l, page) + '"/>')
            .concat('    <xhtml:link rel="alternate" hreflang="x-default" href="' + urlFor(LANGS[0], page) + '"/>')
            .join('\n') + '\n'
        : '';
      rows.push(
        '  <url>\n' +
        '    <loc>' + urlFor(lang, page) + '</loc>\n' + alts +
        '    <lastmod>' + today + '</lastmod>\n' +
        '    <changefreq>' + (freq[page] || 'monthly') + '</changefreq>\n' +
        '    <priority>' + (priority[page] || '0.5') + '</priority>\n' +
        '  </url>');
    }
  }

  const xml =
'<?xml version="1.0" encoding="UTF-8"?>\n' +
'<!--\n' +
'  Light House Surf Camp — sitemap. GENERATED by tools/i18n-build.js.\n' +
'  Do not hand-edit: run `node tools/i18n-build.js` instead.\n\n' +
'  Every translated page lists the whole language cluster via xhtml:link,\n' +
'  which is how Google is told these are alternates of one another rather\n' +
'  than duplicate content. English-only pages carry no alternates, because\n' +
'  claiming a translation that does not exist gets the whole cluster ignored.\n\n' +
'  thank-you.html is absent (noindex, post-conversion). /admin/ is blocked\n' +
'  in robots.txt.\n' +
'-->\n' +
'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"\n' +
'        xmlns:xhtml="http://www.w3.org/1999/xhtml">\n\n' +
rows.join('\n\n') + '\n\n</urlset>\n';

  fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), xml);
  console.log('\nsitemap.xml rewritten (' + rows.length + ' urls).');
}

build();
sitemap();
