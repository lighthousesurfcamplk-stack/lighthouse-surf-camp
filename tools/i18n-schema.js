/* Light House Surf Camp — structured data, per language
   ---------------------------------------------------------------------
   Everything in here exists because JSON-LD is a SECOND COPY of the page
   copy, and second copies drift. Two jobs:

     rebuildFaq()          regenerates the FAQPage block FROM the visible
                           accordion, so the two can never disagree
     translateSchemaText()  translates the handful of schema strings that
                           have no visible twin, from a $schema map in the
                           language dictionary

   Google only shows an FAQ rich result when the question and answer it
   reads in the markup are genuinely present on the page. The English
   block had already slipped into paraphrase ("Cancellation is free up to
   14 days before check-in" vs. the longer answer actually on screen), and
   hand-maintaining it would have meant writing the whole FAQ a fourth,
   fifth and sixth time for /ru/, /de/ and /fr/. Generating it instead
   makes the structured data correct in every language for free.
   --------------------------------------------------------------------- */
'use strict';

/* The named entities that actually occur in this site's copy. Anything
   unrecognised is left as-is rather than guessed at, so a typo in the HTML
   shows up in the output instead of being silently mangled. */
const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  hellip: '…', mdash: '—', ndash: '–',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”',
  bdquo: '„', laquo: '«', raquo: '»', middot: '·',
  times: '×', deg: '°', euro: '€', pound: '£'
};

/* Turn a fragment of page HTML into the plain sentence a search engine
   should see. Structured data carries no markup, so tags come out and
   entities go back to the characters they stand for. */
function plainText(fragment) {
  return fragment
    // The +/− affordance on an accordion head is decoration, not content.
    .replace(/<span class="acc-ico"[\s\S]*?<\/span>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, function (whole, ref) {
      if (ref[0] !== '#') {
        const c = ENTITIES[ref.toLowerCase()];
        return c === undefined ? whole : c;
      }
      const hex = ref[1] === 'x' || ref[1] === 'X';
      const n = parseInt(hex ? ref.slice(2) : ref.slice(1), hex ? 16 : 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : whole;
    })
    .replace(/\s+/g, ' ')
    .trim();
}

/* Regenerate the FAQPage block from the page's own accordion.
   Each .acc-head button is a question; the first <p> after it is the
   answer. Returns the html unchanged when the page has no accordion or no
   FAQPage block, so it is safe to call on every page. */
function rebuildFaq(html, htmlLang) {
  /* "Any ld+json script whose OWN body mentions FAQPage." The inner
     (?!<\/script>) guard is what keeps the match inside one block: a plain
     [\s\S]*? would start at the first ld+json script on the page (the
     Resort one), run past its </script> looking for "FAQPage", and take
     everything in between with it — on index.html that is the entire
     document body, because the FAQ block sits at the bottom of the page. */
  const block = /<script type="application\/ld\+json"[^>]*>(?:(?!<\/script>)[\s\S])*?"@type"\s*:\s*"FAQPage"(?:(?!<\/script>)[\s\S])*?<\/script>/;
  if (!block.test(html)) return { html: html, count: 0 };

  const pairs = [];
  const re = /<button class="acc-head"[^>]*>([\s\S]*?)<\/button>[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/g;
  let m;
  while ((m = re.exec(html))) {
    const q = plainText(m[1]);
    const a = plainText(m[2]);
    if (q && a) pairs.push({ '@type': 'Question', name: q,
                             acceptedAnswer: { '@type': 'Answer', text: a } });
  }
  /* An empty mainEntity is invalid FAQPage markup — worse than the stale
     block it would replace — so bail out and leave what was there. */
  if (!pairs.length) return { html: html, count: 0 };

  const faq = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    inLanguage: htmlLang,
    mainEntity: pairs
  };
  return {
    html: html.replace(block,
      '<script type="application/ld+json" data-seo="auto">' + JSON.stringify(faq) + '</script>'),
    count: pairs.length
  };
}

/* The schema strings with no visible twin on the page: the Resort
   description, the breadcrumb labels, the ItemList name, and the product
   names and descriptions. They come from a "$schema" map in the language
   dictionary, keyed by the exact English string, so a missing translation
   is reported rather than silently shipping English inside a Russian page.

   Only these keys are translated. "url", "@type", "priceCurrency" and the
   brand name are identifiers, not prose, and translating them would break
   the markup. */
const TRANSLATABLE_KEYS = new Set(['name', 'description', 'text', 'headline', 'alternateName']);

/* Proper nouns that are the same in every language. Listing them keeps
   them out of the "missing translation" report, which would otherwise cry
   wolf on every build and train us to ignore it. */
const NEVER_TRANSLATED = new Set(['Light House Surf Camp']);

function translateSchemaText(html, dict, stats) {
  const map = dict.$schema || {};
  return html.replace(/(<script type="application\/ld\+json"[^>]*>)([\s\S]*?)(<\/script>)/g,
    function (whole, open, body, close) {
      let data;
      try {
        data = JSON.parse(body);
      } catch (err) {
        /* Leave a block we cannot parse exactly as we found it. Emitting
           half-rewritten JSON-LD would be worse than emitting English. */
        stats.broken.push(err.message);
        return whole;
      }

      /* FAQPage is regenerated from the translated accordion by
         rebuildFaq(), so its strings are already in the right language and
         deliberately have no $schema entries. Walking it here would report
         every question and answer as a missing translation. */
      if (data && data['@type'] === 'FAQPage') return whole;

      (function walk(node) {
        if (Array.isArray(node)) return node.forEach(walk);
        if (!node || typeof node !== 'object') return;
        for (const key of Object.keys(node)) {
          const value = node[key];
          if (typeof value === 'string' && TRANSLATABLE_KEYS.has(key)) {
            if (NEVER_TRANSLATED.has(value)) continue;
            if (Object.prototype.hasOwnProperty.call(map, value)) {
              node[key] = map[value];
              stats.hit++;
            } else {
              stats.missing.push(value);
            }
          } else {
            walk(value);
          }
        }
      })(data);

      return open + JSON.stringify(data) + close;
    });
}

module.exports = { plainText, rebuildFaq, translateSchemaText };
