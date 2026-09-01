/* =========================================================================
   i18n-tag.js  —  ONE-TIME tagger (safe to re-run; it is idempotent)

   Walks an English page, finds every element that carries real visible copy,
   stamps it with a stable data-i18n="key", and writes the English strings to
   i18n/en.json.  The data-i18n attributes are inert in the browser: they cost
   nothing at runtime and the English pages render exactly as before.

   Why tag the HTML instead of shipping a JS dictionary?
   Because the translated pages are STATIC FILES generated at build time
   (see i18n-build.js).  Google indexes /ru/index.html as real Russian HTML,
   which client-side switching can never achieve.

   Zero dependencies: the project has no node_modules, so this contains a
   small tag-matching scanner rather than pulling in cheerio/jsdom.
   ========================================================================= */
const fs = require('fs');
const path = require('path');

const VOID = new Set(['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr']);
/* Inline tags are allowed INSIDE a translatable string - the translation may
   keep the <b> or <a> - so their presence does not stop us tagging the parent. */
const INLINE = new Set(['a','b','strong','em','i','span','small','sup','sub','br','u','mark','abbr','time','bdi']);
/* Only these elements are considered copy holders. */
const TARGET = new Set(['h1','h2','h3','h4','h5','h6','p','li','button','figcaption','label','summary','td','th','dt','dd','blockquote','caption','legend','option','address']);
/* Plus call-to-action anchors. A bare <a> is NOT a copy holder — the nav is
   nine of them, and every one is already carried by its <li> — but the
   buttons are, and they were the last English strings left standing on a
   Russian page: "Book Now", "Reserve Your Escape", "Plan Your Trip". A CTA
   the visitor cannot read is a CTA they do not press, so these are the most
   expensive words on the page to leave untranslated. Matched on the class
   rather than added to TARGET so the rule stays exactly that narrow. */
const isCTA = tag => /\bclass="[^"]*\bbtn\b/.test(tag);

/* Match a class as a WHOLE token. A bare \bname\b also matches the hyphenated
   compounds this stylesheet is full of — "brand" hits <div class="foot-brand">,
   "per" hits "price-per" — and one of those false positives made an entire
   footer column opaque and silently dropped the paragraph inside it. */
const hasClass = (tag, name) =>
  new RegExp('\\sclass="(?:[^"]*\\s)?' + name + '(?:\\s[^"]*)?"').test(tag);

/* Copy that lives in an element TARGET deliberately excludes, matched on the
   class exactly like the .btn rule so each entry stays a decision rather than
   a category. These are tagged WHOLE — the breadcrumb's own <a> travels with
   it — because the separator ("/ Stay") is a bare text node with no element
   of its own to hang a key on. */
const isCopyClass = tag => ['crumb', 'scroll-cue', 'per'].some(c => hasClass(tag, c));

/* A leaf <span>, <small> or <a> holding real words is copy too, and it is
   where most of the English left standing on a translated page was hiding:
   section eyebrows, the footer link columns, the marquee, "Subtotal", the
   country under a review. "Leaf" is the safety rail. An element WITH element
   children is a container — the brand lockup is <span><b>Light House</b>
   <small>Surf Camp · Sri Lanka</small></span>, the contact strip wraps a
   label around a phone number — and swapping a container's innerHTML would
   hand a translator the company name or a telephone number to localise. */
const LEAF_COPY = new Set(['span', 'small', 'a']);

/* One character is a glyph or an avatar initial, never a sentence. */
const MIN_LEAF_LEN = 2;

/* Strings that read the same in every language. Tagging them would invite a
   translator to "fix" a payment network or the company's own name, and every
   one of those edits is a bug that only shows up in a language nobody on the
   team reads. Contact details are matched by shape, not by listing them. */
const NEVER_COPY = /^(Visa|Mastercard|Amex|PayHere|Light House|Instagram|WhatsApp)$/;
const isContactDetail = plain => /\S+@\S+/.test(plain) || /^@\w/.test(plain) || /\+?\d[\d\s()–-]{7,}/.test(plain);

/* Never descend into these. */
const OPAQUE = new Set(['script','style','svg','noscript','template','code','pre']);
/* Nor into the language switcher. i18n-build.js regenerates it wholesale on
   every run, and its nine options are endonyms — "Deutsch" must read
   "Deutsch" on the Russian page or the one control a lost visitor needs
   stops working. data-lang is the marker the switcher already carries for
   main.js, so there is nothing new to add to the markup. */
/* The brand lockup is opaque for the same reason: "Light House" is a name,
   and the <small>Surf Camp · Sri Lanka</small> under it is set as part of the
   logotype. Both are branding the user asked to leave alone, and marking the
   anchor opaque is what stops the leaf rule above from reaching inside it. */
const isOpaqueTag = tag => /\sdata-lang(?=[\s=>])/.test(tag) || hasClass(tag, 'brand');

function tokenize(html) {
  const toks = [];
  let i = 0;
  while (i < html.length) {
    const lt = html.indexOf('<', i);
    if (lt === -1) { toks.push({t:'text', raw: html.slice(i)}); break; }
    if (lt > i) toks.push({t:'text', raw: html.slice(i, lt)});
    if (html.startsWith('<!--', lt)) {
      const end = html.indexOf('-->', lt);
      const stop = end === -1 ? html.length : end + 3;
      toks.push({t:'comment', raw: html.slice(lt, stop)}); i = stop; continue;
    }
    if (html.startsWith('<!', lt)) {
      const end = html.indexOf('>', lt);
      const stop = end === -1 ? html.length : end + 1;
      toks.push({t:'doctype', raw: html.slice(lt, stop)}); i = stop; continue;
    }
    // find the tag end, skipping > that live inside quoted attribute values
    let j = lt + 1, q = null;
    while (j < html.length) {
      const c = html[j];
      if (q) { if (c === q) q = null; }
      else if (c === '"' || c === "'") q = c;
      else if (c === '>') break;
      j++;
    }
    const raw = html.slice(lt, j + 1);
    const close = raw[1] === '/';
    const name = (raw.match(/^<\/?\s*([a-zA-Z][\w:-]*)/) || [,''])[1].toLowerCase();
    const selfClose = /\/>$/.test(raw) || VOID.has(name);
    toks.push({t: close ? 'close' : 'open', name, raw, selfClose, start: lt, end: j + 1});
    i = j + 1;
  }
  return toks;
}

function slug(s) {
  return s.toLowerCase().replace(/<[^>]*>/g,' ').replace(/&[a-z]+;/g,' ')
    .replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').split('-').filter(Boolean).slice(0,6).join('-');
}

function tagPage(file, pageKey, dict) {
  let html = fs.readFileSync(file, 'utf8');
  const toks = tokenize(html);
  const edits = [];   // {atTagEnd, insert} and {contentStart, contentEnd, key, text}
  const used = new Set();
  const stack = [];
  let opaqueDepth = 0;
  const opaqueName = [];

  for (let n = 0; n < toks.length; n++) {
    const tk = toks[n];
    if (tk.t === 'open') {
      if (OPAQUE.has(tk.name) || isOpaqueTag(tk.raw)) {
        if (!tk.selfClose) { opaqueDepth++; opaqueName.push(tk.name); }
        continue;
      }
      if (opaqueDepth) continue;
      if (tk.selfClose) continue;
      const mayHold = TARGET.has(tk.name) ||
                      (tk.name === 'a' && isCTA(tk.raw)) ||
                      isCopyClass(tk.raw) ||
                      LEAF_COPY.has(tk.name);
      if (!mayHold) { stack.push(tk); continue; }

      // Find this element's matching close tag.
      let depth = 1, m = n + 1, closeTok = null;
      for (; m < toks.length; m++) {
        const t2 = toks[m];
        if (t2.t === 'open' && t2.name === tk.name && !t2.selfClose) depth++;
        else if (t2.t === 'close' && t2.name === tk.name) { depth--; if (!depth) { closeTok = t2; break; } }
      }
      if (!closeTok) { stack.push(tk); continue; }

      const inner = html.slice(tk.end, closeTok.start);
      const plain = inner.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();

      // Skip: empty, no letters, or contains a nested TARGET/block element
      // (we tag the innermost holder so replacement never nests).
      const hasBlockChild = /<\s*(div|section|article|ul|ol|figure|picture|h[1-6]|p|li|table|form|nav|header|footer|aside|main)\b/i.test(inner);
      if (!plain || !/[A-Za-z]/.test(plain) || hasBlockChild) { stack.push(tk); continue; }

      /* The leaf rule earns its safety from these three checks. A span or an
         anchor is only copy when it holds words and nothing else: an element
         child means it is a wrapper, one character means it is a glyph or an
         avatar initial, and a phone number, address or @handle is the same
         string in every language. Fall through to stack.push so the walk
         still descends — the words inside a rejected wrapper may well be
         copy in their own right. */
      if (LEAF_COPY.has(tk.name) && !TARGET.has(tk.name) && !isCTA(tk.raw) && !isCopyClass(tk.raw)) {
        const hasElementChild = /<[a-zA-Z]/.test(inner);
        if (hasElementChild || plain.length < MIN_LEAF_LEN ||
            NEVER_COPY.test(plain) || isContactDetail(plain)) { stack.push(tk); continue; }
      }
      /* Already tagged by an earlier run. The header promises this script is
         safe to re-run, but en.json is written from scratch each time out of
         `dict` — so skipping the element outright dropped its key, and a
         second run left a file holding only whatever was new. Record the
         string under the key it already carries, then jump the subtree so a
         CTA nested inside a tagged holder cannot pick up a second, nested
         data-i18n (translateContent replaces the outer element wholesale,
         which would delete the inner one it just wrote). */
      const had = tk.raw.match(/\bdata-i18n="([^"]+)"/);
      if (had) {
        dict[had[1]] = inner.replace(/\s+/g, ' ').trim();
        used.add(had[1]);
        if (!/data-i18n=/.test(inner)) { n = m; continue; }
        stack.push(tk); continue;
      }

      let key = pageKey + '.' + tk.name + '--' + (slug(plain) || 'text');
      let k = key, c = 2; while (used.has(k)) k = key + '-' + (c++);
      used.add(k);

      edits.push({ pos: tk.end - 1, insert: ' data-i18n="' + k + '"' });
      dict[k] = inner.replace(/\s+/g, ' ').trim();
      n = m; // continue after the close tag
      continue;
    }
    if (tk.t === 'close') {
      /* OPAQUE is decided by tag name, but data-lang is decided by attribute
         — and a </div> carries no attributes. The open tag's name is pushed
         onto opaqueName so the matching close can be recognised. */
      if (opaqueDepth && opaqueName[opaqueName.length - 1] === tk.name) {
        opaqueDepth--; opaqueName.pop(); continue;
      }
      if (opaqueDepth) continue;
      for (let s = stack.length - 1; s >= 0; s--) if (stack[s].name === tk.name) { stack.length = s; break; }
    }
  }

  // Also tag translatable ATTRIBUTES: image alt text carries Arugam Bay
  // keywords, so it must be translated too or the localised pages lose it.
  const altEdits = [];
  const imgRe = /<img\b[^>]*>/gi; let mm;
  while ((mm = imgRe.exec(html))) {
    const tag = mm[0];
    const alt = tag.match(/\balt\s*=\s*"([^"]*)"/i);
    if (!alt || !alt[1].trim()) continue;
    /* Already stamped: record the string under the key it carries and move
       on, rather than skipping it out of the dictionary entirely. */
    const hadAlt = tag.match(/\bdata-i18n-alt="([^"]+)"/);
    if (hadAlt) { dict[hadAlt[1]] = alt[1]; used.add(hadAlt[1]); continue; }
    let key = pageKey + '.alt--' + (slug(alt[1]) || 'image');
    let k = key, c = 2; while (used.has(k)) k = key + '-' + (c++);
    used.add(k);
    dict[k] = alt[1];
    altEdits.push({ pos: mm.index + tag.length - 1, insert: ' data-i18n-alt="' + k + '"' });
  }

  // Apply right-to-left so earlier offsets stay valid.
  const all = edits.concat(altEdits).sort((a, b) => b.pos - a.pos);
  for (const e of all) html = html.slice(0, e.pos) + e.insert + html.slice(e.pos);
  fs.writeFileSync(file, html);
  return edits.length + altEdits.length;
}

// ---- run ----------------------------------------------------------------
const root = path.resolve(__dirname, '..');
const dict = {};
/* Every page the site has. The six that were missing here — gallery,
   lessons, rentals, reviews, things-to-do, thank-you — were the entire
   language leak: untagged pages have no dictionary keys, so i18n-build had
   nothing to translate and TRANSLATED_PAGES could not list them, so the nav
   on /it/ had to send visitors OUT of /it/ to reach them. Tag them and the
   leak closes at the source. */
const pages = ['index', 'packages', 'stay', 'book', 'wellness', 'about',
               'gallery', 'lessons', 'rentals', 'reviews', 'things-to-do', 'thank-you'];
let total = 0;
for (const p of pages) {
  const n = tagPage(path.join(root, p + '.html'), p, dict);
  console.log(p.padEnd(10) + n + ' strings tagged');
  total += n;
}
fs.mkdirSync(path.join(root, 'i18n'), { recursive: true });
fs.writeFileSync(path.join(root, "i18n", "en.json"), JSON.stringify(dict, null, 2) + "\n");
console.log("\n" + total + " total -> i18n/en.json (" + Object.keys(dict).length + " keys)");
