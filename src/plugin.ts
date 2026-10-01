import {
  extractFlightText,
  parseChapterPage,
  parseNovelEntries,
  parseNovelPage,
  parseSearchResults,
} from './parsers';
import type { Plugin } from './lnreader-api';

// The host app injects these via `require`, but their exact shape has varied
// across app versions, so resolve them defensively at load with fallbacks.
declare function require(name: string): any;

function loadFetchLib(): {
  fetchText?: (url: string) => Promise<string>;
  fetchApi?: (url: string) => Promise<{ text: () => Promise<string> }>;
} {
  try {
    return require('@libs/fetch') || {};
  } catch (e) {
    return {};
  }
}

function loadNovelStatus(): Record<string, string> {
  try {
    const lib = require('@libs/novelStatus');
    if (lib && lib.NovelStatus) return lib.NovelStatus;
  } catch (e) {
    // fall through to the built-in copy below
  }
  // Built-in copy of the NovelStatus string enum, so the plugin keeps
  // working even if the host does not provide @libs/novelStatus.
  return {
    Unknown: 'Unknown',
    Ongoing: 'Ongoing',
    Completed: 'Completed',
    Licensed: 'Licensed',
    PublishingFinished: 'Publishing Finished',
    Cancelled: 'Cancelled',
    OnHiatus: 'On Hiatus',
  };
}

const fetchLib = loadFetchLib();
const NovelStatus = loadNovelStatus();

// --- Resilient fetching -------------------------------------------------
// Chapter downloads are one HTTP request per chapter, so a single flaky
// request used to fail the whole chapter. This wrapper adds a timeout and
// retries transient failures with exponential backoff. It never fires
// parallel requests and never retries definite client errors, so the site
// is treated respectfully.
const FETCH_TIMEOUT_MS = 30000;
const MAX_FETCH_ATTEMPTS = 3;

function sleep(ms: number): Promise<void> {
  return new Promise<void>(resolve => {
    if (typeof setTimeout === 'function') setTimeout(resolve, ms);
    else resolve();
  });
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: any = undefined;
  const timeout = new Promise<T>((_, reject) => {
    if (typeof setTimeout === 'function') {
      timer = setTimeout(() => reject(new Error('Request timed out')), ms);
    }
  });
  const clear = () => {
    if (timer !== undefined) clearTimeout(timer);
  };
  return Promise.race([p, timeout]).then(
    v => {
      clear();
      return v;
    },
    e => {
      clear();
      throw e;
    },
  );
}

interface RawFetchResult {
  status?: number;
  text: string;
}

async function fetchRaw(url: string): Promise<RawFetchResult> {
  if (typeof fetchLib.fetchApi === 'function') {
    const res: any = await fetchLib.fetchApi(url);
    const status =
      res && typeof res.status === 'number' ? res.status : undefined;
    const text =
      res && typeof res.text === 'function' ? await res.text() : '';
    return { status, text };
  }
  if (typeof fetchLib.fetchText === 'function') {
    return { text: await fetchLib.fetchText(url) };
  }
  throw new Error('No fetch implementation provided by the host app');
}

/** Pull an HTTP status out of errors like "HTTP 503". */
function statusFromError(e: any): number | undefined {
  const m = /HTTP (\d{3})/.exec(String((e && e.message) || e || ''));
  return m ? parseInt(m[1], 10) : undefined;
}

async function fetchText(url: string): Promise<string> {
  let lastError: any = new Error('Request failed');
  for (let attempt = 1; attempt <= MAX_FETCH_ATTEMPTS; attempt++) {
    let status: number | undefined;
    try {
      const res = await withTimeout(fetchRaw(url), FETCH_TIMEOUT_MS);
      status = res.status;
      if (status === 429 || (status !== undefined && status >= 500)) {
        throw new Error('Server responded with HTTP ' + status);
      }
      return res.text;
    } catch (e) {
      lastError = e;
      if (status === undefined) status = statusFromError(e);
      const msg = String((e && (e as Error).message) || e || '');
      const retryable =
        status === undefined ||
        status === 429 ||
        status >= 500 ||
        /timed out/i.test(msg);
      if (!retryable || attempt === MAX_FETCH_ATTEMPTS) break;
      // Exponential backoff with jitter: ~1s, ~2s. Gentle on the site.
      await sleep(1000 * Math.pow(2, attempt - 1) + Math.random() * 500);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

class NightjarReads implements Plugin.PluginBase {
  id = 'nightjarreads';
  name = 'Nightjar Reads';
  icon = 'src/en/nightjarreads/icon.png';
  site = 'https://nightjarreads.com';
  version = '1.0.5';

  async popularNovels(
    pageNo: number,
    _options: Plugin.PopularNovelsOptions,
  ): Promise<Plugin.NovelItem[]> {
    if (pageNo > 1) return [];
    const html = await fetchText(this.site + '/browse?sort=popular');
    return parseNovelEntries(extractFlightText(html)).map(n => ({
      name: n.title,
      path: '/novel/' + n.slug,
      cover: n.coverUrl,
    }));
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const slug = novelPath.split('/').filter(Boolean).pop() || '';
    const html = await fetchText(this.site + novelPath);
    const d = parseNovelPage(html, extractFlightText(html), slug);

    let status: string = NovelStatus.Unknown;
    if (d.status === 'Ongoing') status = NovelStatus.Ongoing;
    else if (d.status === 'Completed') status = NovelStatus.Completed;
    else if (d.status === 'On Hiatus' || d.status === 'Hiatus')
      status = NovelStatus.OnHiatus;
    else if (d.status === 'Cancelled' || d.status === 'Dropped')
      status = NovelStatus.Cancelled;

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: d.name,
      status,
    };
    if (d.cover) novel.cover = d.cover;
    if (d.author) novel.author = d.author;
    if (d.genres.length) novel.genres = d.genres.join(', ');
    if (d.summary) novel.summary = d.summary;
    novel.chapters = d.chapters.map(c => ({
      name: 'Chapter ' + c.number + ': ' + c.title,
      path: '/novel/' + slug + '/' + c.number,
      releaseTime: c.publishedAt,
      chapterNumber: c.number,
    }));
    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const html = await fetchText(this.site + chapterPath);
    if (/<title>\s*Not found/i.test(html)) {
      return (
        '<p><strong>This chapter is no longer available on Nightjar Reads.</strong></p>' +
        '<p>It may have been removed or moved. Refresh the novel to update the chapter list.</p>'
      );
    }
    const content = parseChapterPage(extractFlightText(html));
    if (content === null) {
      return (
        '<p><strong>Could not load this chapter.</strong></p>' +
        '<p>It may be locked or temporarily unavailable on Nightjar Reads.</p>'
      );
    }
    return content;
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    if (pageNo > 1) return [];
    const html = await fetchText(
      this.site + '/search?q=' + encodeURIComponent(searchTerm),
    );
    const flight = extractFlightText(html);
    return parseSearchResults(flight, searchTerm).map(n => ({
      name: n.title,
      path: '/novel/' + n.slug,
      cover: n.coverUrl,
    }));
  }

  resolveUrl = (path: string, _isNovel?: boolean): string => this.site + path;
}

export default new NightjarReads();
