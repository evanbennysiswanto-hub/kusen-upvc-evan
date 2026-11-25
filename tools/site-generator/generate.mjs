import { copyFile, mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { existsSync as pathExistsSync, readFileSync as requireReadFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import * as parse5 from 'parse5';
import { XMLBuilder, XMLParser, XMLValidator } from 'fast-xml-parser';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SITE_ORIGIN = 'https://kusenupvcevan.com';
const OUTPUT_NAMES = [
  'index.html',
  'katalog.html',
  'galeri.html',
  'tentang-kami.html',
  'artikel.html',
  'sitemap.xml',
  'robots.txt',
];
const PAGE_META = {
  'index.html': {
    title: 'Kusen UPVC Bekasi | Jendela & Pintu UPVC Evan UPVC',
    description: 'Jasa kusen UPVC, pintu UPVC, dan jendela UPVC berkualitas di Bekasi dan Jabodetabek dengan survei serta pemasangan presisi.',
    canonical: `${SITE_ORIGIN}/`,
    ogTitle: 'Kusen UPVC Bekasi | Pintu dan Jendela UPVC Evan UPVC',
    ogDescription: 'Pembuatan serta pemasangan kusen UPVC, pintu UPVC, dan jendela UPVC untuk hunian di Bekasi dan Jabodetabek.',
    breadcrumb: null,
  },
  'katalog.html': {
    title: 'Katalog Pintu & Jendela UPVC Bekasi | Evan UPVC',
    description: 'Lihat katalog jendela UPVC casement, sliding, jungkit, fixed serta pintu UPVC sliding, folding, panel, dan swing di Bekasi.',
    canonical: `${SITE_ORIGIN}/katalog.html`,
    ogTitle: 'Katalog Pintu dan Jendela UPVC Bekasi | Evan UPVC',
    ogDescription: 'Pilihan model pintu UPVC dan jendela UPVC untuk rumah serta proyek di Bekasi dan Jabodetabek.',
    breadcrumb: 'Katalog Produk UPVC',
  },
  'galeri.html': {
    title: 'Galeri Pintu & Jendela UPVC Bekasi | Evan UPVC',
    description: 'Galeri foto jendela UPVC, pintu UPVC, dan pemasangan UPVC untuk referensi model rumah dan bangunan di Bekasi.',
    canonical: `${SITE_ORIGIN}/galeri.html`,
    ogTitle: 'Galeri Hasil Pemasangan Pintu dan Jendela UPVC',
    ogDescription: 'Lihat inspirasi jendela UPVC, pintu UPVC, sliding, casement, dan folding door Evan UPVC.',
    breadcrumb: 'Galeri Foto UPVC',
  },
  'tentang-kami.html': {
    title: 'Tentang Evan UPVC Bekasi | Profil, Cara Order, FAQ & Lokasi',
    description: 'Profil Evan UPVC, alur pemesanan kusen UPVC, pertanyaan umum, dan lokasi workshop pemasangan UPVC di Bekasi.',
    canonical: `${SITE_ORIGIN}/tentang-kami.html`,
    ogTitle: 'Tentang Evan UPVC Bekasi | Cara Order dan Lokasi Workshop',
    ogDescription: 'Kenali layanan kusen UPVC, alur pemesanan, FAQ, dan workshop Evan UPVC di Bekasi.',
    breadcrumb: 'Tentang Evan UPVC',
  },
  'artikel.html': {
    title: 'Tips & Artikel Kusen UPVC Bekasi | Evan UPVC',
    description: 'Panduan memilih kusen UPVC, menghitung biaya pintu dan jendela UPVC, serta mengenal model sliding dan casement.',
    canonical: `${SITE_ORIGIN}/artikel.html`,
    ogTitle: 'Tips dan Artikel Kusen UPVC Bekasi | Evan UPVC',
    ogDescription: 'Baca panduan memilih kusen UPVC, memahami harga, dan menentukan model pintu serta jendela.',
    breadcrumb: 'Tips dan Artikel UPVC',
  },
};

const DRY_RUN = process.argv.includes('--dry-run');

function children(node) {
  return node?.childNodes ?? [];
}

function walk(node, visit) {
  if (!node) return;
  visit(node);
  for (const child of children(node)) walk(child, visit);
  if (node.content) walk(node.content, visit);
}

function findAll(node, predicate) {
  const found = [];
  walk(node, item => {
    if (predicate(item)) found.push(item);
  });
  return found;
}

function findFirst(node, predicate) {
  let found = null;
  walk(node, item => {
    if (!found && predicate(item)) found = item;
  });
  return found;
}

function attr(node, name) {
  return node?.attrs?.find(item => item.name === name)?.value;
}

function setAttr(node, name, value) {
  const existing = node.attrs.find(item => item.name === name);
  if (existing) existing.value = String(value);
  else node.attrs.push({ name, value: String(value) });
}

function removeNode(parent, node) {
  const index = parent.childNodes.indexOf(node);
  if (index >= 0) parent.childNodes.splice(index, 1);
}

function clone(node) {
  return structuredClone(node);
}

function textContent(node) {
  if (node.nodeName === '#text') return node.value;
  return children(node).map(textContent).join('');
}

function setText(node, value) {
  node.childNodes = [{ nodeName: '#text', value: String(value) }];
}

function elementFromHtml(html) {
  const fragment = parse5.parseFragment(html);
  const element = fragment.childNodes.find(node => node.tagName);
  if (!element) throw new Error(`Could not parse HTML fragment: ${html}`);
  return element;
}

function appendFragment(parent, html) {
  parent.childNodes.push(...parse5.parseFragment(html).childNodes);
}

function hasClass(node, className) {
  return (attr(node, 'class') ?? '').split(/\s+/).includes(className);
}

function byId(document, id) {
  return findFirst(document, node => node.tagName && attr(node, 'id') === id);
}

function byClass(document, className) {
  return findFirst(document, node => node.tagName && hasClass(node, className));
}

function setTag(node, tagName) {
  node.nodeName = tagName;
  node.tagName = tagName;
}

function setHeadingText(node, tagName, value) {
  setTag(node, tagName);
  setText(node, value);
}

function setOrAddMeta(head, keyName, keyValue, content) {
  const matches = findAll(head, node =>
    node.tagName === 'meta' && attr(node, keyName) === keyValue,
  );
  let meta = matches.shift();
  for (const duplicate of matches) removeNode(duplicate.parentNode ?? head, duplicate);
  if (!meta) {
    meta = elementFromHtml(`<meta ${keyName}="${keyValue}">`);
    head.childNodes.push(meta);
  }
  setAttr(meta, 'content', content);
}

function setCanonical(head, href) {
  const matches = findAll(head, node =>
    node.tagName === 'link' && attr(node, 'rel') === 'canonical',
  );
  let canonical = matches.shift();
  for (const duplicate of matches) removeNode(head, duplicate);
  if (!canonical) {
    canonical = elementFromHtml('<link rel="canonical">');
    head.childNodes.push(canonical);
  }
  setAttr(canonical, 'href', href);
}

function jsonLdNode(value) {
  const node = elementFromHtml('<script type="application/ld+json"></script>');
  node.childNodes = [{ nodeName: '#text', value: JSON.stringify(value) }];
  return node;
}

function replaceHeadMetadata(document, pageName, schemas) {
  const head = findFirst(document, node => node.tagName === 'head');
  const metadata = PAGE_META[pageName];
  const title = findFirst(head, node => node.tagName === 'title');
  if (!title) throw new Error(`Source document has no <title> for ${pageName}`);
  setText(title, metadata.title);

  setOrAddMeta(head, 'name', 'description', metadata.description);
  setOrAddMeta(head, 'name', 'robots', 'index, follow, max-image-preview:large');
  setOrAddMeta(head, 'name', 'theme-color', '#0b1f33');
  setOrAddMeta(head, 'property', 'og:locale', 'id_ID');
  setOrAddMeta(head, 'property', 'og:site_name', 'Evan UPVC');
  setOrAddMeta(head, 'property', 'og:type', 'website');
  setOrAddMeta(head, 'property', 'og:title', metadata.ogTitle);
  setOrAddMeta(head, 'property', 'og:description', metadata.ogDescription);
  setOrAddMeta(head, 'property', 'og:url', metadata.canonical);
  setOrAddMeta(head, 'property', 'og:image', `${SITE_ORIGIN}/images/kusen-upvc.jpg`);
  setOrAddMeta(head, 'name', 'twitter:card', 'summary_large_image');
  setCanonical(head, metadata.canonical);

  for (const script of findAll(head, node =>
    node.tagName === 'script' && attr(node, 'type') === 'application/ld+json',
  )) removeNode(head, script);
  for (const schema of schemas) head.childNodes.push(jsonLdNode(schema));
}

function textOfSelector(node, predicate) {
  const element = findFirst(node, predicate);
  return element ? textContent(element).replace(/\s+/g, ' ').trim() : '';
}

function makeBreadcrumb(pageName) {
  const label = PAGE_META[pageName].breadcrumb;
  const listItem = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Beranda', item: `${SITE_ORIGIN}/` },
      { '@type': 'ListItem', position: 2, name: label, item: PAGE_META[pageName].canonical },
    ],
  };
  const nav = elementFromHtml(
    `<nav class="breadcrumb" aria-label="Breadcrumb"><ol><li><a href="index.html">Beranda</a></li><li aria-current="page">${label}</li></ol></nav>`,
  );
  return { nav, schema: listItem };
}

function localBusinessSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'HomeAndConstructionBusiness',
    name: 'Evan UPVC',
    image: `${SITE_ORIGIN}/images/kusen-upvc.jpg`,
    description: PAGE_META['index.html'].description,
    telephone: '+6285139373710',
    address: {
      '@type': 'PostalAddress',
      streetAddress: 'Jl. Dewi Sartika Jl. Salak No.49',
      addressLocality: 'Bekasi',
      addressRegion: 'Jawa Barat',
      postalCode: '17113',
      addressCountry: 'ID',
    },
    geo: { '@type': 'GeoCoordinates', latitude: -6.2507, longitude: 107.0079 },
    openingHours: 'Mo-Su 08:00-17:00',
    sameAs: ['https://wa.me/6285139373710'],
  };
}

function websiteSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'Evan UPVC',
    url: `${SITE_ORIGIN}/`,
    inLanguage: 'id-ID',
    publisher: {
      '@type': 'Organization',
      name: 'Evan UPVC',
      logo: { '@type': 'ImageObject', url: `${SITE_ORIGIN}/images/logo-evan-upvc.png` },
    },
  };
}

function faqSchema(faqSection) {
  const questions = findAll(faqSection, node => node.tagName === 'div' && hasClass(node, 'faq-item'));
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: questions.map(item => ({
      '@type': 'Question',
      name: textOfSelector(item, node => /^h[1-6]$/.test(node.tagName ?? '')),
      acceptedAnswer: {
        '@type': 'Answer',
        text: textOfSelector(item, node => node.tagName === 'p'),
      },
    })),
  };
}

function replaceNavigation(header, mobileMenu) {
  const nav = findFirst(header, node => node.tagName === 'ul' && hasClass(node, 'nav-links'));
  if (!nav) throw new Error('Could not find the desktop navigation list');
  nav.childNodes = [];
  appendFragment(nav, `
    <li><a href="index.html">Beranda</a></li>
    <li class="nav-dropdown">
      <a href="katalog.html">Katalog Produk ▾</a>
      <ul class="dropdown-menu">
        <li><a href="katalog.html#jendela">Jendela UPVC</a></li>
        <li><a href="katalog.html#pintu">Pintu UPVC</a></li>
      </ul>
    </li>
    <li><a href="galeri.html">Galeri Foto</a></li>
    <li><a href="tentang-kami.html">Tentang Kami</a></li>
    <li><a href="artikel.html">Tips &amp; Artikel</a></li>
    <li><a href="tentang-kami.html#lokasi">Lokasi</a></li>
  `);
  const brand = findFirst(header, node => node.tagName === 'a' && hasClass(node, 'brand-logo'));
  if (brand) setAttr(brand, 'href', 'index.html');

  const menu = findFirst(mobileMenu, node => hasClass(node, 'menu-popup-box'));
  if (!menu) throw new Error('Could not find the mobile quick-menu list');
  menu.childNodes = [];
  appendFragment(menu, `
    <div class="menu-popup-title">Pilih Tujuan:</div>
    <a href="katalog.html">Katalog Produk UPVC</a>
    <a href="galeri.html">Galeri Hasil Pemasangan</a>
    <a href="tentang-kami.html">Profil Evan UPVC</a>
    <a href="tentang-kami.html#lokasi">Lokasi Workshop</a>
    <a href="tentang-kami.html#faq">Pertanyaan FAQ</a>
    <a href="artikel.html">Tips &amp; Artikel</a>
    <a class="wa-popup-link" href="https://wa.me/6285139373710" rel="noopener noreferrer" target="_blank">Chat WhatsApp</a>
  `);
}

function appendNavigationStyles(head) {
  head.childNodes.push(elementFromHtml(`<style>
    .nav-dropdown { position: relative; }
    .nav-dropdown > a { white-space: nowrap; }
    .dropdown-menu { display: none; position: absolute; top: 100%; left: 0; min-width: 210px; background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 8px; box-shadow: 0 12px 30px rgba(11,31,51,.12); list-style: none; z-index: 20; }
    .nav-dropdown:hover .dropdown-menu, .nav-dropdown:focus-within .dropdown-menu { display: block; }
    .dropdown-menu li { margin: 0; }
    .dropdown-menu a { display: block; padding: 9px 12px; border-radius: 7px; }
    .dropdown-menu a:hover { background: #eef3f8; }
    .breadcrumb { font-size: .9rem; margin: 20px 0 8px; }
    .breadcrumb ol { display: flex; flex-wrap: wrap; gap: 8px; list-style: none; padding: 0; }
    .breadcrumb li + li::before { content: "/"; margin-right: 8px; color: #94a3b8; }
    .breadcrumb a { color: #0878b9; }
    .menu-summary-btn { list-style: none; }
    .menu-summary-btn::-webkit-details-marker { display: none; }
  </style>`));
}

function mainElement(sections, breadcrumb) {
  const main = elementFromHtml('<main></main>');
  if (breadcrumb) {
    const container = elementFromHtml('<div class="container"></div>');
    container.childNodes.push(breadcrumb);
    main.childNodes.push(container);
  }
  main.childNodes.push(...sections);
  return main;
}

function productSnippet(catalog) {
  const cards = findAll(catalog, node => node.tagName === 'div' && hasClass(node, 'product-card')).slice(0, 4);
  if (cards.length !== 4) throw new Error(`Expected four product cards for the home page; found ${cards.length}`);
  const section = elementFromHtml(`
    <section class="section-padding products" id="katalog-ringkas">
      <div class="container">
        <div class="section-title">
          <h2>Katalog Pintu &amp; Jendela UPVC Unggulan</h2>
          <p>Pilihan model UPVC untuk bukaan rumah, taman, teras, garasi, dan ruangan.</p>
        </div>
        <div class="products-grid"></div>
        <p style="text-align:center;margin-top:28px"><a class="btn btn-primary" href="katalog.html">Lihat Semua Katalog Produk UPVC</a></p>
      </div>
    </section>
  `);
  const grid = findFirst(section, node => node.tagName === 'div' && hasClass(node, 'products-grid'));
  grid.childNodes.push(...cards.map(clone));
  return section;
}

function articleSnippet(articleSection) {
  const cards = findAll(articleSection, node => node.tagName === 'article' && hasClass(node, 'blog-card')).slice(0, 3);
  if (cards.length !== 3) throw new Error(`Expected three article cards for the home page; found ${cards.length}`);
  const section = elementFromHtml(`
    <section class="blog-section" id="artikel">
      <div class="container">
        <div class="section-title">
          <h2>Artikel Terbaru Seputar Kusen UPVC</h2>
          <p>Tips memilih, menghitung biaya, dan mengenal model pintu serta jendela UPVC.</p>
        </div>
        <div class="blog-grid"></div>
        <p style="text-align:center;margin-top:28px"><a class="btn btn-primary" href="artikel.html">Lihat Semua Tips dan Artikel UPVC</a></p>
      </div>
    </section>
  `);
  const grid = findFirst(section, node => node.tagName === 'div' && hasClass(node, 'blog-grid'));
  grid.childNodes.push(...cards.map(clone));
  return section;
}

function setHeadingInSection(section, selectorPredicate, tagName, text) {
  const heading = findFirst(section, selectorPredicate);
  if (!heading) throw new Error(`Could not find expected heading in section #${attr(section, 'id')}`);
  setHeadingText(heading, tagName, text);
}

function pageSchemas(pageName, sections, breadcrumbSchema) {
  const schemas = [];
  if (pageName === 'index.html') schemas.push(localBusinessSchema(), websiteSchema());
  if (pageName === 'tentang-kami.html') {
    const faq = sections.find(section => attr(section, 'id') === 'faq');
    schemas.push(faqSchema(faq));
  }
  if (breadcrumbSchema) schemas.push(breadcrumbSchema);
  return schemas;
}

function buildPage(sourceDocument, pageName, sections, bodyStyles, bodyScripts) {
  const document = clone(sourceDocument);
  const body = findFirst(document, node => node.tagName === 'body');
  const head = findFirst(document, node => node.tagName === 'head');
  const sourceHeader = findFirst(sourceDocument, node => node.tagName === 'header');
  const sourceFooter = findFirst(sourceDocument, node => node.tagName === 'footer');
  const sourceWhatsapp = findFirst(sourceDocument, node => node.tagName === 'a' && hasClass(node, 'whatsapp-popup'));
  const sourceMobileMenu = findFirst(sourceDocument, node => hasClass(node, 'mobile-quick-menu'));
  if (!body || !head || !sourceHeader || !sourceFooter || !sourceWhatsapp || !sourceMobileMenu) {
    throw new Error(`Source is missing a shared page component needed for ${pageName}`);
  }

  const header = clone(sourceHeader);
  const footer = clone(sourceFooter);
  const whatsapp = clone(sourceWhatsapp);
  const mobileMenu = clone(sourceMobileMenu);
  replaceNavigation(header, mobileMenu);
  setAttr(whatsapp, 'aria-label', 'Chat WhatsApp Evan UPVC');

  let breadcrumb = null;
  let breadcrumbSchema = null;
  if (PAGE_META[pageName].breadcrumb) {
    ({ nav: breadcrumb, schema: breadcrumbSchema } = makeBreadcrumb(pageName));
  }

  body.childNodes = [
    header,
    mainElement(sections.map(clone), breadcrumb),
    footer,
    whatsapp,
    mobileMenu,
    ...bodyScripts.map(clone),
  ];
  for (const style of bodyStyles) head.childNodes.push(clone(style));
  appendNavigationStyles(head);
  replaceHeadMetadata(document, pageName, pageSchemas(pageName, sections, breadcrumbSchema));

  if (!document.childNodes.some(node => node.nodeName === '#documentType')) {
    document.childNodes.unshift({
      nodeName: '#documentType',
      name: 'html',
      publicId: '',
      systemId: '',
    });
  }
  return parse5.serialize(document);
}

function parseDocument(html, label) {
  const errors = [];
  const document = parse5.parse(html, { onParseError: error => errors.push(error) });
  const fatalCodes = new Set([
    'duplicate-attribute',
    'unexpected-null-character',
    'invalid-first-character-of-tag-name',
    'eof-in-tag',
  ]);
  const fatal = errors.filter(error => fatalCodes.has(error.code));
  if (fatal.length) {
    throw new Error(`${label} contains invalid HTML tokens: ${fatal.map(error => error.code).join(', ')}`);
  }
  return { document, errors };
}

function getIds(document, label) {
  const ids = new Set();
  for (const node of findAll(document, item => item.tagName && attr(item, 'id'))) {
    const id = attr(node, 'id');
    if (ids.has(id)) throw new Error(`${label} has duplicate id="${id}"`);
    ids.add(id);
  }
  return ids;
}

function schemaObjects(document, label) {
  const schemas = [];
  for (const script of findAll(document, node =>
    node.tagName === 'script' && attr(node, 'type') === 'application/ld+json',
  )) {
    try {
      schemas.push(JSON.parse(textContent(script)));
    } catch (error) {
      throw new Error(`${label} has invalid JSON-LD: ${error.message}`);
    }
  }
  if (!schemas.length) throw new Error(`${label} has no JSON-LD`);
  return schemas;
}

function validatePage(html, pageName, originalImageSources) {
  const { document, errors } = parseDocument(html, pageName);
  const headings = findAll(document, node => node.tagName === 'h1');
  if (headings.length !== 1) throw new Error(`${pageName} must have exactly one H1; found ${headings.length}`);
  const ids = getIds(document, pageName);
  const schemas = schemaObjects(document, pageName);
  const schemaTypes = schemas.map(schema => schema['@type']);
  if (pageName === 'index.html' &&
      (!schemaTypes.includes('HomeAndConstructionBusiness') || !schemaTypes.includes('WebSite'))) {
    throw new Error('index.html is missing its business or website schema');
  }
  if (pageName === 'tentang-kami.html' && !schemaTypes.includes('FAQPage')) {
    throw new Error('tentang-kami.html is missing its FAQ schema');
  }
  if (pageName !== 'index.html' && !schemaTypes.includes('BreadcrumbList')) {
    throw new Error(`${pageName} is missing its breadcrumb schema`);
  }

  const desktopNav = findFirst(document, node => node.tagName === 'ul' && hasClass(node, 'nav-links'));
  const dropdown = desktopNav && findFirst(desktopNav, node => node.tagName === 'ul' && hasClass(node, 'dropdown-menu'));
  if (!dropdown || findAll(dropdown, node => node.tagName === 'a').length !== 2) {
    throw new Error(`${pageName} is missing the two catalog dropdown links`);
  }
  if (!findFirst(document, node => node.tagName === 'details' && hasClass(node, 'menu-dropdown'))) {
    throw new Error(`${pageName} is missing the mobile quick menu`);
  }
  for (const selectorClass of ['whatsapp-popup', 'wa-popup-link']) {
    const link = findFirst(document, node => node.tagName === 'a' && hasClass(node, selectorClass));
    if (!link || !/^https:\/\/wa\.me\/6285139373710(?:[/?#]|$)/.test(attr(link, 'href') ?? '')) {
      throw new Error(`${pageName} has a missing or invalid ${selectorClass} link`);
    }
  }

  for (const image of findAll(document, node => node.tagName === 'img' && attr(node, 'src'))) {
    const source = attr(image, 'src');
    if (/^(?:https?:)?\/\//i.test(source) || source.startsWith('data:')) continue;
    if (!originalImageSources.has(source)) {
      throw new Error(`${pageName} references an image source not present in the original page: ${source}`);
    }
    const imagePath = path.resolve(ROOT, source);
    if (!imagePath.startsWith(`${ROOT}${path.sep}`) || !existsSync(imagePath)) {
      throw new Error(`${pageName} references a missing or unsafe image: ${source}`);
    }
  }
  return { document, ids, errors };
}

function existsSync(filePath) {
  return pathExistsSync(filePath);
}

function urlFilePath(url) {
  const pathname = decodeURIComponent(url.pathname);
  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const resolved = path.resolve(ROOT, relative);
  if (resolved !== ROOT && !resolved.startsWith(`${ROOT}${path.sep}`)) {
    throw new Error(`Internal link escapes the site root: ${url.href}`);
  }
  return resolved;
}

function validateInternalLinks(pageResults, pageHtml, generatedNames) {
  const pageDocuments = new Map(pageResults);
  const generated = new Set(generatedNames);
  for (const [pageName, result] of pageResults) {
    for (const link of findAll(result.document, node => node.tagName === 'a' && attr(node, 'href'))) {
      const href = attr(link, 'href').trim();
      if (!href || href.startsWith('javascript:')) {
        throw new Error(`${pageName} contains an empty or script-based link`);
      }
      let url;
      try {
        url = new URL(href, `${SITE_ORIGIN}/${pageName}`);
      } catch {
        throw new Error(`${pageName} contains an invalid link: ${href}`);
      }
      if (url.protocol !== 'http:' && url.protocol !== 'https:') continue;
      if (url.hostname !== new URL(SITE_ORIGIN).hostname) continue;

      const targetPath = urlFilePath(url);
      const targetName = path.basename(targetPath);
      if (generated.has(targetName)) {
        const target = pageDocuments.get(targetName);
        const targetIds = target ? getIds(target.document, targetName) : pageHtml.get(targetName).ids;
        if (url.hash && !targetIds.has(decodeURIComponent(url.hash.slice(1)))) {
          throw new Error(`${pageName} links to missing fragment ${url.pathname}${url.hash}`);
        }
      } else {
        if (!existsSync(targetPath)) {
          throw new Error(`${pageName} links to a missing local file: ${href}`);
        }
        if (url.hash && targetPath.toLowerCase().endsWith('.html')) {
          const targetHtml = readFileSync(targetPath);
          const targetDocument = parse5.parse(targetHtml);
          if (!getIds(targetDocument, targetPath).has(decodeURIComponent(url.hash.slice(1)))) {
            throw new Error(`${pageName} links to a missing fragment in ${href}`);
          }
        }
      }
    }
  }
}

function readFileSync(filePath) {
  return requireReadFileSync(filePath, 'utf8');
}

function parseSitemap(xml) {
  const validation = XMLValidator.validate(xml);
  if (validation !== true) throw new Error(`Existing sitemap.xml is invalid: ${validation.err.msg}`);
  const parser = new XMLParser({
    ignoreAttributes: false,
    isArray: (name, jPath) => name === 'url' && jPath === 'urlset.url',
  });
  const parsed = parser.parse(xml);
  const root = parsed.urlset;
  if (!root || !Array.isArray(root.url)) throw new Error('sitemap.xml must contain a urlset with url entries');
  return root;
}

function buildSitemap(existingXml, generatedPageNames) {
  const root = parseSitemap(existingXml);
  const oldLocs = new Set(root.url.map(item => String(item.loc)));
  const today = new Date().toISOString().slice(0, 10);
  const generatedLocs = generatedPageNames.map(name =>
    name === 'index.html' ? `${SITE_ORIGIN}/` : `${SITE_ORIGIN}/${name}`,
  );
  const entries = root.url.slice();
  for (const loc of generatedLocs) {
    const existing = entries.find(item => String(item.loc) === loc);
    if (existing) existing.lastmod = today;
    else entries.push({ loc, lastmod: today, priority: loc.endsWith('/') ? '1.0' : '0.8' });
  }
  const builder = new XMLBuilder({ ignoreAttributes: false, format: true, suppressEmptyNode: true });
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n${builder.build({
    urlset: { '@_xmlns': 'http://www.sitemaps.org/schemas/sitemap/0.9', url: entries },
  })}\n`;
  const result = XMLValidator.validate(xml);
  if (result !== true) throw new Error(`Generated sitemap.xml is invalid: ${result.err.msg}`);
  const generatedRoot = parseSitemap(xml);
  const generatedLocsSet = new Set(generatedRoot.url.map(item => String(item.loc)));
  for (const loc of oldLocs) {
    if (!generatedLocsSet.has(loc)) throw new Error(`Generated sitemap dropped an existing URL: ${loc}`);
  }
  for (const loc of generatedLocs) {
    if (!generatedLocsSet.has(loc)) throw new Error(`Generated sitemap is missing ${loc}`);
  }
  return xml;
}

function updateRobots(originalText) {
  const sitemapLine = `Sitemap: ${SITE_ORIGIN}/sitemap.xml`;
  const lines = originalText.split(/\r?\n/);
  if (!lines.some(line => line.trim().toLowerCase() === sitemapLine.toLowerCase())) {
    while (lines.length && lines[lines.length - 1] === '') lines.pop();
    lines.push('', sitemapLine);
  }
  const output = `${lines.join('\n').replace(/\n+$/, '')}\n`;
  if (!/^user-agent:\s*\*/im.test(output) || !/^allow:\s*\/\s*$/im.test(output)) {
    throw new Error('robots.txt must retain a wildcard user-agent and Allow: / rule');
  }
  if (!output.split(/\r?\n/).some(line => line.trim().toLowerCase() === sitemapLine.toLowerCase())) {
    throw new Error('robots.txt is missing the expected sitemap URL');
  }
  return output;
}

async function collectFiles(directory, relative = '') {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (!relative && ['.git', 'node_modules'].includes(entry.name)) continue;
    const childRelative = path.join(relative, entry.name);
    const childPath = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Backup stopped: symbolic link is not supported: ${childRelative}`);
    if (entry.isDirectory()) result.push(...await collectFiles(childPath, childRelative));
    else if (entry.isFile()) result.push(childRelative);
  }
  return result;
}

async function copyTree(source, destination, relative = '') {
  for (const entry of await readdir(source, { withFileTypes: true })) {
    if (!relative && ['.git', 'node_modules'].includes(entry.name)) continue;
    const rel = path.join(relative, entry.name);
    const from = path.join(source, entry.name);
    const to = path.join(destination, entry.name);
    if (entry.isDirectory()) {
      await mkdir(to, { recursive: true });
      await copyTree(from, to, rel);
    } else if (entry.isFile()) {
      await mkdir(path.dirname(to), { recursive: true });
      await copyFile(from, to);
    } else if (entry.isSymbolicLink()) {
      throw new Error(`Backup stopped: symbolic link is not supported: ${rel}`);
    }
  }
}

async function createBackup(originalFiles) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.resolve(ROOT, '..', `${path.basename(ROOT)}-backup-${stamp}-${process.pid}`);
  await mkdir(backupPath);
  try {
    await copyTree(ROOT, backupPath);
    return { backupPath, originalFiles };
  } catch (error) {
    await rm(backupPath, { recursive: true, force: true });
    throw error;
  }
}

async function writeStage(stagePath, outputs) {
  for (const [name, content] of outputs) {
    const destination = path.join(stagePath, name);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, content, 'utf8');
  }
}

async function commitOutputs(stagePath, backupPath, outputs, createdNames) {
  const committed = [];
  let activeTemporary = null;
  try {
    for (const name of outputs.keys()) {
      const source = path.join(stagePath, name);
      const destination = path.join(ROOT, name);
      const temporary = `${destination}.staged-${process.pid}`;
      activeTemporary = temporary;
      await copyFile(source, temporary);
      await rename(temporary, destination);
      activeTemporary = null;
      committed.push(name);
    }
  } catch (error) {
    const rollbackErrors = [];
    if (activeTemporary) {
      try {
        await rm(activeTemporary, { force: true });
      } catch (cleanupError) {
        rollbackErrors.push(`staging file: ${cleanupError.message}`);
      }
    }
    for (const name of committed.reverse()) {
      const destination = path.join(ROOT, name);
      try {
        if (createdNames.has(name)) await rm(destination, { force: true });
        else await copyFile(path.join(backupPath, name), destination);
      } catch (rollbackError) {
        rollbackErrors.push(`${name}: ${rollbackError.message}`);
      }
    }
    const suffix = rollbackErrors.length ? ` Rollback errors: ${rollbackErrors.join('; ')}` : '';
    throw new Error(`Production update failed; rollback attempted.${suffix} ${error.message}`);
  }
}

async function main() {
  const sourcePath = path.join(ROOT, 'index.html');
  const sourceHtml = await readFile(sourcePath, 'utf8');
  const { document: sourceDocument } = parseDocument(sourceHtml, 'source index.html');
  const sourceSections = {
    hero: findFirst(sourceDocument, node => node.tagName === 'section' && hasClass(node, 'hero')),
    keunggulan: byId(sourceDocument, 'keunggulan'),
    katalog: byId(sourceDocument, 'katalog'),
    galeri: byId(sourceDocument, 'galeri'),
    profil: byId(sourceDocument, 'profil'),
    cara: byId(sourceDocument, 'cara-order'),
    faq: byId(sourceDocument, 'faq'),
    lokasi: byId(sourceDocument, 'lokasi'),
    artikel: byId(sourceDocument, 'artikel'),
  };
  for (const [name, section] of Object.entries(sourceSections)) {
    if (!section) throw new Error(`Required source section is missing: ${name}`);
  }

  const originalImageSources = new Set(
    findAll(sourceDocument, node => node.tagName === 'img' && attr(node, 'src')).map(node => attr(node, 'src')),
  );
  const sourceBody = findFirst(sourceDocument, node => node.tagName === 'body');
  const bodyStyles = findAll(sourceBody, node => node.tagName === 'style');
  const bodyScripts = findAll(sourceBody, node =>
    node.tagName === 'script' && attr(node, 'type') !== 'application/ld+json',
  );

  const catalog = clone(sourceSections.katalog);
  setAttr(catalog, 'id', 'katalog');
  const catalogHeadings = findAll(catalog, node => node.tagName === 'h3' && hasClass(node, 'category-title'));
  if (catalogHeadings.length !== 2) throw new Error(`Expected two catalog categories; found ${catalogHeadings.length}`);
  setAttr(catalogHeadings[0], 'id', 'jendela');
  setHeadingText(catalogHeadings[0], 'h2', 'Jendela UPVC');
  setAttr(catalogHeadings[1], 'id', 'pintu');
  setHeadingText(catalogHeadings[1], 'h2', 'Pintu UPVC');
  const catalogTitle = findFirst(
    findFirst(catalog, node => node.tagName === 'div' && hasClass(node, 'section-title')),
    node => node.tagName === 'h2',
  );
  if (!catalogTitle) throw new Error('Could not find catalog section heading');
  setHeadingInSection(
    catalog,
    node => node === catalogTitle,
    'h1',
    'Katalog Jendela dan Pintu UPVC Bekasi',
  );

  const gallery = clone(sourceSections.galeri);
  const galleryTitle = findFirst(
    findFirst(gallery, node => node.tagName === 'div' && hasClass(node, 'section-title')),
    node => node.tagName === 'h2',
  );
  if (!galleryTitle) throw new Error('Could not find gallery section heading');
  setHeadingInSection(
    gallery,
    node => node === galleryTitle,
    'h1',
    'Galeri Pintu dan Jendela UPVC Evan UPVC',
  );
  const profile = clone(sourceSections.profil);
  setHeadingInSection(
    profile,
    node => node.tagName === 'h2',
    'h1',
    'Tentang Evan UPVC, Spesialis Kusen Pintu dan Jendela Bekasi',
  );
  const articleList = clone(sourceSections.artikel);
  setHeadingInSection(
    articleList,
    node => node.tagName === 'h2',
    'h1',
    'Tips dan Artikel Kusen UPVC Terbaru',
  );

  const outputs = new Map();
  const hero = clone(sourceSections.hero);
  const catalogCta = findFirst(hero, node => node.tagName === 'a' && attr(node, 'href') === '#katalog');
  if (catalogCta) setAttr(catalogCta, 'href', '#katalog-ringkas');
  outputs.set('index.html', buildPage(sourceDocument, 'index.html', [
    hero,
    clone(sourceSections.keunggulan),
    productSnippet(sourceSections.katalog),
    articleSnippet(sourceSections.artikel),
  ], bodyStyles, bodyScripts));
  outputs.set('katalog.html', buildPage(sourceDocument, 'katalog.html', [catalog], bodyStyles, bodyScripts));
  outputs.set('galeri.html', buildPage(sourceDocument, 'galeri.html', [gallery], bodyStyles, bodyScripts));
  outputs.set('tentang-kami.html', buildPage(sourceDocument, 'tentang-kami.html', [
    profile,
    clone(sourceSections.cara),
    clone(sourceSections.faq),
    clone(sourceSections.lokasi),
  ], bodyStyles, bodyScripts));
  outputs.set('artikel.html', buildPage(sourceDocument, 'artikel.html', [articleList], bodyStyles, bodyScripts));

  const existingSitemap = await readFile(path.join(ROOT, 'sitemap.xml'), 'utf8');
  const existingRobots = await readFile(path.join(ROOT, 'robots.txt'), 'utf8');
  outputs.set('sitemap.xml', buildSitemap(existingSitemap, Object.keys(PAGE_META)));
  outputs.set('robots.txt', updateRobots(existingRobots));

  const pageResults = new Map();
  for (const [name, html] of outputs) {
    if (!name.endsWith('.html')) continue;
    pageResults.set(name, validatePage(html, name, originalImageSources));
  }
  validateInternalLinks(pageResults, pageResults, Object.keys(PAGE_META));

  const sitemapValidation = XMLValidator.validate(outputs.get('sitemap.xml'));
  if (sitemapValidation !== true) throw new Error(`Sitemap validation failed: ${sitemapValidation.err.msg}`);
  const robots = outputs.get('robots.txt');
  if (!/^sitemap:\s*https:\/\/kusenupvcevan\.com\/sitemap\.xml\s*$/im.test(robots)) {
    throw new Error('Robots validation failed: sitemap directive is missing');
  }

  const originalFiles = await collectFiles(ROOT);
  const createdNames = new Set();
  const changedNames = new Set();
  for (const name of outputs.keys()) {
    try {
      const current = await stat(path.join(ROOT, name));
      if (!current.isFile()) throw new Error(`Production output path is not a regular file: ${name}`);
      changedNames.add(name);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      createdNames.add(name);
    }
  }

  const stagePath = await import('node:fs/promises').then(({ mkdtemp }) =>
    mkdtemp(path.join(os.tmpdir(), 'kusen-upvc-stage-')),
  );
  let backupPath = null;
  try {
    await writeStage(stagePath, outputs);
    const stagedPages = new Map();
    for (const name of outputs.keys()) {
      const staged = await readFile(path.join(stagePath, name), 'utf8');
      if (staged !== outputs.get(name)) throw new Error(`Staged ${name} differs from validated output`);
      if (name.endsWith('.html')) {
        stagedPages.set(name, validatePage(staged, name, originalImageSources));
      }
      if (name === 'sitemap.xml' && XMLValidator.validate(staged) !== true) {
        throw new Error('Staged sitemap.xml failed validation');
      }
    }
    validateInternalLinks(stagedPages, stagedPages, Object.keys(PAGE_META));

    if (DRY_RUN) {
      console.log('Dry run passed. No production files or backups were changed.');
      console.log(`Would create: ${[...createdNames].join(', ') || '(none)'}`);
      console.log(`Would update: ${[...changedNames].join(', ') || '(none)'}`);
      console.log(`Validations passed: ${stagedPages.size} staged HTML pages, H1 counts, IDs, internal links, images, navigation, WhatsApp, JSON-LD, sitemap, robots.txt.`);
      return;
    }

    ({ backupPath } = await createBackup(originalFiles));
    const preserved = originalFiles.filter(name => !OUTPUT_NAMES.includes(name));
    const report = {
      completedAt: new Date().toISOString(),
      backupPath,
      created: [...createdNames],
      changed: [...changedNames],
      preserved,
      validation: {
        htmlPages: pageResults.size,
        exactlyOneH1: true,
        uniqueIds: true,
        internalLinks: true,
        imageSources: true,
        navigationDropdown: true,
        mobileMenu: true,
        whatsappLinks: true,
        jsonLd: true,
        sitemap: true,
        robots: true,
      },
    };
    await writeFile(path.join(backupPath, 'generation-report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    await commitOutputs(stagePath, backupPath, outputs, createdNames);
    console.log('Generation and validation completed.');
    console.log(`Created: ${report.created.join(', ') || '(none)'}`);
    console.log(`Changed: ${report.changed.join(', ') || '(none)'}`);
    console.log(`Preserved ${report.preserved.length} files; complete list: ${path.join(backupPath, 'generation-report.json')}`);
    console.log(`Backup: ${backupPath}`);
    console.log('Validations passed: one H1 per page, unique IDs, internal links, images, desktop dropdown, mobile menu, WhatsApp links, JSON-LD, sitemap, robots.txt.');
  } catch (error) {
    if (backupPath) console.error(`Original files are backed up at: ${backupPath}`);
    throw error;
  } finally {
    await rm(stagePath, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error(`Generation stopped without intentional production replacement: ${error.message}`);
  process.exitCode = 1;
});
