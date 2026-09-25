var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
var __async = (__this, __arguments, generator) => {
  return new Promise((resolve, reject) => {
    var fulfilled = (value) => {
      try {
        step(generator.next(value));
      } catch (e) {
        reject(e);
      }
    };
    var rejected = (value) => {
      try {
        step(generator.throw(value));
      } catch (e) {
        reject(e);
      }
    };
    var step = (x) => x.done ? resolve(x.value) : Promise.resolve(x.value).then(fulfilled, rejected);
    step((generator = generator.apply(__this, __arguments)).next());
  });
};

// src/plugin.ts
var plugin_exports = {};
__export(plugin_exports, {
  default: () => plugin_default
});

// src/parsers.ts
var JSON_STR = '((?:[^"\\]|\\.)*)';
function unescapeFlight(s) {
  return s.replace(/\\"/g, '"').replace(/\\'/g, "'");
}
function extractFlightText(html) {
  const re = /self\.__next_f\.push\(\[1,"([\s\S]*?)"\]\)<\/script>/g;
  let out = "";
  let m;
  while ((m = re.exec(html)) !== null) {
    try {
      out += JSON.parse('"' + m[1] + '"');
    } catch (e) {
    }
  }
  return out;
}
var ENTRY_RE = new RegExp(
  '"slug":"([a-z0-9-]+)","title":"' + JSON_STR + '","author":"' + JSON_STR + '","genres":(\\[[^\\]]*\\]),"glyph":"[^"]*","cover":\\[[^\\]]*\\],"coverUrl":"([^"]*)","chapters":(\\d+),"status":"([^"]*)"',
  "g"
);
function parseNovelEntries(flight) {
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  ENTRY_RE.lastIndex = 0;
  let m;
  while ((m = ENTRY_RE.exec(flight)) !== null) {
    if (seen.has(m[1])) continue;
    seen.add(m[1]);
    let genres = [];
    try {
      genres = JSON.parse(m[4]);
    } catch (e) {
    }
    out.push({
      slug: m[1],
      title: unescapeFlight(m[2]),
      author: unescapeFlight(m[3]),
      genres,
      coverUrl: m[5],
      chapterCount: parseInt(m[6], 10),
      status: m[7]
    });
  }
  return out;
}
function findIndexEntry(flight, slug) {
  const re = new RegExp(
    '"slug":"' + slug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + '","title":"' + JSON_STR + '","author":"' + JSON_STR + '","genres":(\\[[^\\]]*\\]),"glyph":"[^"]*","cover":\\[[^\\]]*\\],"coverUrl":"([^"]*)","chapters":(\\d+),"status":"([^"]*)"'
  );
  const m = re.exec(flight);
  if (!m) return null;
  let genres = [];
  try {
    genres = JSON.parse(m[3]);
  } catch (e) {
  }
  return {
    slug,
    title: unescapeFlight(m[1]),
    author: unescapeFlight(m[2]),
    genres,
    coverUrl: m[4],
    chapterCount: parseInt(m[5], 10),
    status: m[6]
  };
}
function decodeHtmlEntities(s) {
  return s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}
function parseNovelPage(html, flight, slug) {
  const details = {
    name: slug,
    author: "",
    genres: [],
    status: "",
    cover: "",
    summary: "",
    chapters: []
  };
  let m;
  m = new RegExp(
    '"\\$","h1",null,\\{"className":"text-3xl[^"]*","children":"' + JSON_STR + '"\\}'
  ).exec(flight);
  if (m) details.name = unescapeFlight(m[1]);
  m = new RegExp(
    '"children":"Author"\\}\\],\\["\\$","dd",null,\\{"className":"mt-0\\.5 text-sm font-medium","children":"' + JSON_STR + '"\\}'
  ).exec(flight);
  if (m) details.author = unescapeFlight(m[1]);
  const indexEntry = findIndexEntry(flight, slug);
  if (indexEntry && indexEntry.genres.length > 0) {
    details.genres = indexEntry.genres;
  } else {
    const chipRow = flight.indexOf("mt-3 flex flex-wrap gap-1.5");
    if (chipRow >= 0) {
      const chipRe = /"children":\["#","([^"]*)"\]/g;
      chipRe.lastIndex = chipRow;
      let cm;
      let count = 0;
      while ((cm = chipRe.exec(flight)) !== null && cm.index < chipRow + 6e3 && count < 40) {
        details.genres.push(cm[1]);
        count++;
      }
    }
  }
  if (indexEntry) {
    if (!details.author && indexEntry.author)
      details.author = indexEntry.author;
    if (!details.status && indexEntry.status) details.status = indexEntry.status;
    if (!details.cover && indexEntry.coverUrl)
      details.cover = indexEntry.coverUrl;
    if (details.name === slug && indexEntry.title)
      details.name = indexEntry.title;
  }
  m = /"className":"chip"[\s\S]{0,150}?"children":"(Ongoing|Completed|Hiatus|Dropped|On Hiatus|Cancelled)"/.exec(
    flight
  );
  if (m) details.status = m[1];
  m = /"src":"(https:\/\/[^\"]*?supabase[^\"]*?covers[^\"]*?)"/.exec(flight);
  if (m) details.cover = m[1];
  m = /<meta name="description" content="([\s\S]*?)"/.exec(html);
  if (m) details.summary = decodeHtmlEntities(m[1]).replace(/\\n/g, "\n");
  const chRe = new RegExp(
    '"number":(\\d+),"title":"' + JSON_STR + '","publishedAt":"([^"]*)","words":(\\d+),"tier":"([^"]*)"',
    "g"
  );
  const seenCh = /* @__PURE__ */ new Set();
  let chm;
  while ((chm = chRe.exec(flight)) !== null) {
    const num = parseInt(chm[1], 10);
    if (seenCh.has(num)) continue;
    seenCh.add(num);
    details.chapters.push({
      number: num,
      title: unescapeFlight(chm[2]),
      publishedAt: chm[3],
      tier: chm[5]
    });
  }
  details.chapters.sort((a, b) => a.number - b.number);
  return details;
}
var LOCKED_MESSAGE = "<p><strong>This chapter is locked on Nightjar Reads.</strong></p><p>It is a premium chapter \u2014 unlock it on nightjarreads.com to read it here.</p>";
function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function parseChapterPage(flight) {
  if (/"locked":true/.test(flight)) return LOCKED_MESSAGE;
  const m = /"body":\["([\s\S]*?)"\],"translatorNotes"/.exec(flight);
  if (!m) return null;
  let paras;
  try {
    paras = JSON.parse('["' + m[1] + '"]');
  } catch (e) {
    return null;
  }
  paras = paras.map((p) => p.trim()).filter((p) => p.length > 0 && !/Advance chapters at Nightjar Reads/.test(p));
  if (paras.length === 0) return null;
  return paras.map((p) => "<p>" + escapeHtml(p) + "</p>").join("\n");
}
function parseSearchResults(flight, query) {
  const marker = '"initial":"' + query + '"';
  const start = flight.indexOf(marker);
  const section = start >= 0 ? flight.slice(start) : flight;
  const hrefRe = /"href":"\/novel\/([a-z0-9-]+)"/g;
  const order = [];
  const seen = /* @__PURE__ */ new Set();
  let hm;
  while ((hm = hrefRe.exec(section)) !== null) {
    if (!seen.has(hm[1])) {
      seen.add(hm[1]);
      order.push(hm[1]);
    }
  }
  const index = new Map(parseNovelEntries(flight).map((n) => [n.slug, n]));
  return order.map((slug) => index.get(slug)).filter((n) => !!n);
}

// src/plugin.ts
function loadFetchLib() {
  try {
    return require("@libs/fetch") || {};
  } catch (e) {
    return {};
  }
}
function loadNovelStatus() {
  try {
    const lib = require("@libs/novelStatus");
    if (lib && lib.NovelStatus) return lib.NovelStatus;
  } catch (e) {
  }
  return {
    Unknown: "Unknown",
    Ongoing: "Ongoing",
    Completed: "Completed",
    Licensed: "Licensed",
    PublishingFinished: "Publishing Finished",
    Cancelled: "Cancelled",
    OnHiatus: "On Hiatus"
  };
}
var fetchLib = loadFetchLib();
var NovelStatus = loadNovelStatus();
function fetchText(url) {
  return __async(this, null, function* () {
    if (typeof fetchLib.fetchText === "function") {
      return fetchLib.fetchText(url);
    }
    if (typeof fetchLib.fetchApi === "function") {
      const res = yield fetchLib.fetchApi(url);
      if (res && typeof res.text === "function") return res.text();
    }
    throw new Error("No fetch implementation provided by the host app");
  });
}
var NightjarReads = class {
  constructor() {
    __publicField(this, "id", "nightjarreads");
    __publicField(this, "name", "Nightjar Reads");
    __publicField(this, "icon", "src/en/nightjarreads/icon.png");
    __publicField(this, "site", "https://nightjarreads.com");
    __publicField(this, "version", "1.0.1");
    __publicField(this, "resolveUrl", (path, _isNovel) => this.site + path);
  }
  popularNovels(pageNo, _options) {
    return __async(this, null, function* () {
      if (pageNo > 1) return [];
      const html = yield fetchText(this.site + "/browse?sort=popular");
      return parseNovelEntries(extractFlightText(html)).map((n) => ({
        name: n.title,
        path: "/novel/" + n.slug,
        cover: n.coverUrl
      }));
    });
  }
  parseNovel(novelPath) {
    return __async(this, null, function* () {
      const slug = novelPath.split("/").filter(Boolean).pop() || "";
      const html = yield fetchText(this.site + novelPath);
      const d = parseNovelPage(html, extractFlightText(html), slug);
      let status = NovelStatus.Unknown;
      if (d.status === "Ongoing") status = NovelStatus.Ongoing;
      else if (d.status === "Completed") status = NovelStatus.Completed;
      else if (d.status === "On Hiatus" || d.status === "Hiatus")
        status = NovelStatus.OnHiatus;
      else if (d.status === "Cancelled" || d.status === "Dropped")
        status = NovelStatus.Cancelled;
      const novel = {
        path: novelPath,
        name: d.name,
        status
      };
      if (d.cover) novel.cover = d.cover;
      if (d.author) novel.author = d.author;
      if (d.genres.length) novel.genres = d.genres.join(", ");
      if (d.summary) novel.summary = d.summary;
      novel.chapters = d.chapters.map((c) => ({
        name: "Chapter " + c.number + ": " + c.title,
        path: "/novel/" + slug + "/" + c.number,
        releaseTime: c.publishedAt,
        chapterNumber: c.number
      }));
      return novel;
    });
  }
  parseChapter(chapterPath) {
    return __async(this, null, function* () {
      const html = yield fetchText(this.site + chapterPath);
      const content = parseChapterPage(extractFlightText(html));
      if (content === null) {
        return "<p><strong>Could not load this chapter.</strong></p><p>It may be locked or temporarily unavailable on Nightjar Reads.</p>";
      }
      return content;
    });
  }
  searchNovels(searchTerm, pageNo) {
    return __async(this, null, function* () {
      if (pageNo > 1) return [];
      const html = yield fetchText(
        this.site + "/search?q=" + encodeURIComponent(searchTerm)
      );
      const flight = extractFlightText(html);
      return parseSearchResults(flight, searchTerm).map((n) => ({
        name: n.title,
        path: "/novel/" + n.slug,
        cover: n.coverUrl
      }));
    });
  }
};
var plugin_default = new NightjarReads();
exports.default = plugin_default;
try { if (typeof module !== "undefined" && module && module.exports) module.exports.default = plugin_default; } catch (e) {}
