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
   To add a language: create i18n/<code>.json and add a row here. */
const LANGS = [
  { code: 'en', dir: '',    label: 'EN', name: 'English',  htmlLang: 'en', ogLocale: 'en_US' },
  { code: 'ru', dir: 'ru',  label: 'RU', name: 'Русский',  htmlLang: 'ru', ogLocale: 'ru_RU' },
  { code: 'de', dir: 'de',  label: 'DE', name: 'Deutsch',  htmlLang: 'de', ogLocale: 'de_DE' },
  { code: 'fr', dir: 'fr',  label: 'FR', name: 'Français', htmlLang: 'fr', ogLocale: 'fr_FR' }
];

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
  html = html.replace(/<html[^>]*>/i, '<html lang="' + lang.htmlLang + '"' + root + '>');

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
     Emitted only for pages that genuinely exist in all four languages. */
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
function switcherHTML(currentLang, page, fromLangDir) {
  const items = LANGS.map(l => {
    const on = l.code === currentLang.code;
    // Where does this flag actually go from where we are standing?
    /* On an English-only page (stay, gallery…) there is no translated
       equivalent, so the switcher offers that language's HOME page rather
       than a 404. */
    let href;
    const target = TRANSLATED_PAGES.includes(page) ? page : 'index';
    if (l.code === currentLang.code) href = target + '.html';          // stay put
    else if (l.dir === '') href = (fromLangDir ? '../' : '') + target + '.html';
    else href = (fromLangDir ? '../' : '') + l.dir + '/' + target + '.html';
    return '<li><a href="' + href + '" hreflang="' + l.code + '" lang="' + l.htmlLang + '"' +
           (on ? ' class="on" aria-current="true"' : '') +
           ' title="' + l.name + '">' + l.label + '</a></li>';
  }).join('');
  return '<ul class="lang" aria-label="Language">' + items + '</ul>';
}

/* The switcher is injected TWICE, because the nav has two layouts:

     desktop  — a row in .nav-cta beside the Book Now button
     mobile   — the last item in the slide-in drawer

   At 375px the nav bar already carries the logo, Book Now and the burger;
   a four-item language row does not fit beside them. Each copy is hidden at
   the other breakpoint in CSS, so only one is ever visible or focusable. */
function injectSwitcher(html, lang, page) {
  const markup = switcherHTML(lang, page, !!lang.dir);
  const as = cls => markup.replace('class="lang"', 'class="lang ' + cls + '"');

  /* Strip EVERY switcher variant before re-injecting, rather than trying to
     patch whichever one is already there. An earlier version of this script
     emitted a single unclassed <ul class="lang"> with no breakpoint class;
     a targeted "replace the classed pair" update left that stray copy in
     place, and because the CSS shows a bare .lang at every width it rendered
     as two switchers side by side on desktop. Strip-then-inject makes the
     function idempotent by construction: whatever shape the last build left,
     this one starts from a clean nav. */
  html = html
    /* The drawer copy is a whole <li> wrapping a <ul>, so the strip has to run
       to the wrapper's OWN </ul></li> and must not stop at the FR item's </li>
       — which is itself followed by a </ul>, and so satisfied the earlier
       non-greedy "</li> followed by </ul>" lookahead. Every run therefore left
       the wrapper's trailing </ul></li> behind, and the next injection added a
       fresh wrapper in front of it: one orphaned pair accumulated per build
       until the nav list was structurally garbage. Naming the opening
       <ul class="lang lang-drawer"> removes the ambiguity. */
    .replace(/\s*<li class="lang-li"><ul class="lang lang-drawer"[\s\S]*?<\/ul><\/li>/g, '')
    .replace(/\s*<ul class="lang(?: lang-bar)?" aria-label="Language">[\s\S]*?<\/ul>/g, '');

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
     switcher at all. Pages without a drawer get the plain .lang instead,
     which the CSS shows at every width. */
  if (!/id="primary-nav"/.test(html)) {
    return html.replace(/(<div class="nav-cta">\s*)/, '$1' + markup + '\n    ');
  }

  html = html.replace(/(<div class="nav-cta">\s*)/, '$1' + as('lang-bar') + '\n    ');
  html = html.replace(/(\s*)(<\/ul>\s*<div class="nav-cta">)/,
    '$1  <li class="lang-li">' + as('lang-drawer') + '</li>$1$2');
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
