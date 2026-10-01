// Integration test: fetch live pages from nightjarreads.com and exercise
// the pure parsers exactly as the plugin will use them.
import {
  extractFlightText,
  parseNovelEntries,
  parseNovelPage,
  parseChapterPage,
  parseSearchResults,
} from './parsers.bundle.mjs';

const SITE = 'https://nightjarreads.com';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

async function get(path) {
  const res = await fetch(SITE + path, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error('HTTP ' + res.status + ' for ' + path);
  return res.text();
}

let failures = 0;
function check(name, cond, extra = '') {
  if (cond) console.log('PASS  ' + name);
  else {
    failures++;
    console.log('FAIL  ' + name + ' ' + extra);
  }
}

async function main() {
  // 1. Browse / popular novels
  const browseHtml = await get('/browse?sort=popular');
  const browseCards = parseNovelEntries(extractFlightText(browseHtml));
  check('browse: finds novels', browseCards.length >= 10, 'got ' + browseCards.length);
  const gog = browseCards.find(c => c.slug === 'god-of-guns');
  check('browse: god-of-guns card', !!gog, JSON.stringify(gog));
  if (gog) {
    check('browse: card title', gog.title === 'God of Guns', gog.title);
    check('browse: card author', gog.author.length > 0, gog.author);
    check('browse: card cover', gog.coverUrl.startsWith('https://'), gog.coverUrl.slice(0, 60));
    check('browse: card status', gog.status === 'Ongoing', gog.status);
  }

  // 2. Novel page
  const novelHtml = await get('/novel/god-of-guns');
  const novel = parseNovelPage(novelHtml, extractFlightText(novelHtml), 'god-of-guns');
  check('novel: name', novel.name === 'God of Guns', novel.name);
  check('novel: author', novel.author === '如水意', novel.author);
  check('novel: genres', novel.genres.length >= 3, novel.genres.join(','));
  check('novel: status', novel.status === 'Ongoing', novel.status);
  check('novel: cover', novel.cover.includes('supabase'), novel.cover.slice(0, 60));
  check('novel: summary', novel.summary.length > 50, novel.summary.slice(0, 60));
  check('novel: 90 chapters', novel.chapters.length >= 90, 'got ' + novel.chapters.length);
  const ch1 = novel.chapters[0];
  check('novel: ch1 fields', ch1.number === 1 && ch1.title.length > 0 && ch1.tier === 'free', JSON.stringify(ch1));

  // 3. Novel with locked chapters
  const novel2Html = await get('/novel/trenches-guns-and-magic');
  const novel2 = parseNovelPage(novel2Html, extractFlightText(novel2Html), 'trenches-guns-and-magic');
  const premium = novel2.chapters.filter(c => c.tier !== 'free');
  check('novel2: has premium chapters', premium.length > 0, 'premium=' + premium.length + ' total=' + novel2.chapters.length);
  check('novel2: chapter count matches', novel2.chapters.length >= 600, 'got ' + novel2.chapters.length);

  // 4. Free chapter
  const chHtml = await get('/novel/god-of-guns/88');
  const content = parseChapterPage(extractFlightText(chHtml));
  check('chapter: content parsed', !!content && content.length > 1000, 'len=' + (content || '').length);
  check('chapter: is <p> html', !!content && content.startsWith('<p>'), (content || '').slice(0, 40));
  check('chapter: no promo footer', !!content && !content.includes('Advance chapters at Nightjar Reads'));

  // 5. Locked chapter: scan premium chapters from the top until one is locked
  const premiumDesc = novel2.chapters
    .filter(c => c.tier !== 'free')
    .sort((a, b) => b.number - a.number);
  let lockedOk = false;
  let lockedDetail = '';
  for (const pc of premiumDesc.slice(0, 8)) {
    const lockHtml = await get('/novel/trenches-guns-and-magic/' + pc.number);
    const lockContent = parseChapterPage(extractFlightText(lockHtml));
    if (lockContent && lockContent.includes('locked')) {
      lockedOk = true;
      break;
    }
    lockedDetail = 'ch' + pc.number + ': ' + (lockContent || 'null').slice(0, 60);
  }
  check('chapter: locked shows message', lockedOk, lockedDetail);

  // 6. Search
  const searchHtml = await get('/search?q=' + encodeURIComponent('god of guns'));
  const results = parseSearchResults(extractFlightText(searchHtml), 'god of guns');
  check('search: finds god of guns', results.some(r => r.slug === 'god-of-guns'), results.map(r => r.slug).join(','));

  const emptyHtml = await get('/search?q=' + encodeURIComponent('zzzzqqqnotreal'));
  const empty = parseSearchResults(extractFlightText(emptyHtml), 'zzzzqqqnotreal');
  check('search: nonsense query empty', empty.length === 0, 'got ' + empty.length);

  console.log(failures === 0 ? '\nALL TESTS PASSED' : '\n' + failures + ' FAILURES');
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(e => {
  console.error('ERROR', e);
  process.exit(1);
});
