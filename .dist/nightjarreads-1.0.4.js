var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = function(target, all) {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = function(to, from, except, desc) {
  if (from && typeof from === "object" || typeof from === "function")
    for (var keys = __getOwnPropNames(from), i = 0, n = keys.length, key; i < n; i++) {
      key = keys[i];
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: function(k) {
          return from[k];
        }.bind(null, key), enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
  return to;
};
var __toCommonJS = function(mod) {
  return __copyProps(__defProp({}, "__esModule", { value: true }), mod);
};

// .tsc-build/plugin.js
var plugin_exports = {};
__export(plugin_exports, {
  default: function() {
    return plugin_default;
  }
});

// .tsc-build/parsers.js
var JSON_STR = '((?:[^"\\\\]|\\\\.)*)';
function unescapeFlight(s) {
  return s.replace(/\\"/g, '"').replace(/\\'/g, "'");
}
function extractFlightText(html) {
  var re = /self\.__next_f\.push\(\[1,"([\s\S]*?)"\]\)\s*;?\s*<\/script>/g;
  var out = "";
  var m;
  while ((m = re.exec(html)) !== null) {
    try {
      out += JSON.parse('"' + m[1] + '"');
    } catch (_a) {
    }
  }
  return out;
}
var ENTRY_RE = new RegExp('"slug":"([a-z0-9-]+)","title":"' + JSON_STR + '","author":"' + JSON_STR + '","genres":(\\[[^\\]]*\\]),"glyph":"[^"]*","cover":\\[[^\\]]*\\],"coverUrl":"([^"]*)","chapters":(\\d+),"status":"([^"]*)"', "g");
function parseNovelEntries(flight) {
  var out = [];
  var seen = /* @__PURE__ */ new Set();
  ENTRY_RE.lastIndex = 0;
  var m;
  while ((m = ENTRY_RE.exec(flight)) !== null) {
    if (seen.has(m[1]))
      continue;
    seen.add(m[1]);
    var genres = [];
    try {
      genres = JSON.parse(m[4]);
    } catch (_a) {
    }
    out.push({
      slug: m[1],
      title: unescapeFlight(m[2]),
      author: unescapeFlight(m[3]),
      genres: genres,
      coverUrl: m[5],
      chapterCount: parseInt(m[6], 10),
      status: m[7]
    });
  }
  return out;
}
function findIndexEntry(flight, slug) {
  var re = new RegExp('"slug":"' + slug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + '","title":"' + JSON_STR + '","author":"' + JSON_STR + '","genres":(\\[[^\\]]*\\]),"glyph":"[^"]*","cover":\\[[^\\]]*\\],"coverUrl":"([^"]*)","chapters":(\\d+),"status":"([^"]*)"');
  var m = re.exec(flight);
  if (!m)
    return null;
  var genres = [];
  try {
    genres = JSON.parse(m[3]);
  } catch (_a) {
  }
  return {
    slug: slug,
    title: unescapeFlight(m[1]),
    author: unescapeFlight(m[2]),
    genres: genres,
    coverUrl: m[4],
    chapterCount: parseInt(m[5], 10),
    status: m[6]
  };
}
function decodeHtmlEntities(s) {
  return s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}
function parseNovelPage(html, flight, slug) {
  var details = {
    name: slug,
    author: "",
    genres: [],
    status: "",
    cover: "",
    summary: "",
    chapters: []
  };
  var m;
  m = new RegExp('"\\$","h1",null,\\{"className":"text-3xl[^"]*","children":"' + JSON_STR + '"\\}').exec(flight);
  if (m)
    details.name = unescapeFlight(m[1]);
  m = new RegExp('"children":"Author"\\}\\],\\["\\$","dd",null,\\{"className":"mt-0\\.5 text-sm font-medium","children":"' + JSON_STR + '"\\}').exec(flight);
  if (m)
    details.author = unescapeFlight(m[1]);
  var indexEntry = findIndexEntry(flight, slug);
  if (indexEntry && indexEntry.genres.length > 0) {
    details.genres = indexEntry.genres;
  } else {
    var chipRow = flight.indexOf("mt-3 flex flex-wrap gap-1.5");
    if (chipRow >= 0) {
      var chipRe = /"children":\["#","([^"]*)"\]/g;
      chipRe.lastIndex = chipRow;
      var cm = void 0;
      var count = 0;
      while ((cm = chipRe.exec(flight)) !== null && cm.index < chipRow + 6e3 && count < 40) {
        details.genres.push(cm[1]);
        count++;
      }
    }
  }
  if (indexEntry) {
    if (!details.author && indexEntry.author)
      details.author = indexEntry.author;
    if (!details.status && indexEntry.status)
      details.status = indexEntry.status;
    if (!details.cover && indexEntry.coverUrl)
      details.cover = indexEntry.coverUrl;
    if (details.name === slug && indexEntry.title)
      details.name = indexEntry.title;
  }
  m = /"className":"chip"[\s\S]{0,150}?"children":"(Ongoing|Completed|Hiatus|Dropped|On Hiatus|Cancelled)"/.exec(flight);
  if (m)
    details.status = m[1];
  m = /"src":"(https:\/\/[^"]*?supabase[^"]*?covers[^"]*?)"/.exec(flight);
  if (m)
    details.cover = m[1];
  m = /<meta name="description" content="([\s\S]*?)"/.exec(html);
  if (m)
    details.summary = decodeHtmlEntities(m[1]).replace(/\\n/g, "\n");
  var chRe = new RegExp('"number":(\\d+),"title":"' + JSON_STR + '","publishedAt":"([^"]*)","words":(\\d+),"tier":"([^"]*)"', "g");
  var seenCh = /* @__PURE__ */ new Set();
  var chm;
  while ((chm = chRe.exec(flight)) !== null) {
    var num = parseInt(chm[1], 10);
    if (seenCh.has(num))
      continue;
    seenCh.add(num);
    details.chapters.push({
      number: num,
      title: unescapeFlight(chm[2]),
      publishedAt: chm[3],
      tier: chm[5]
    });
  }
  details.chapters.sort(function(a, b) {
    return a.number - b.number;
  });
  return details;
}
var LOCKED_MESSAGE = "<p><strong>This chapter is locked on Nightjar Reads.</strong></p><p>It is a premium chapter \u2014 unlock it on nightjarreads.com to read it here.</p>";
function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function parseChapterPage(flight) {
  if (/"locked":true/.test(flight))
    return LOCKED_MESSAGE;
  var m = /"body":\["([\s\S]*?)"\],"translatorNotes"/.exec(flight);
  if (!m)
    return null;
  var paras;
  try {
    paras = JSON.parse('["' + m[1] + '"]');
  } catch (_a) {
    return null;
  }
  paras = paras.map(function(p) {
    return p.trim();
  }).filter(function(p) {
    return p.length > 0 && !/Advance chapters at Nightjar Reads/.test(p);
  });
  if (paras.length === 0)
    return null;
  return paras.map(function(p) {
    return "<p>" + escapeHtml(p) + "</p>";
  }).join("\n");
}
function parseSearchResults(flight, query) {
  var marker = '"initial":"' + query + '"';
  var start = flight.indexOf(marker);
  var section = start >= 0 ? flight.slice(start) : flight;
  var hrefRe = /"href":"\/novel\/([a-z0-9-]+)"/g;
  var order = [];
  var seen = /* @__PURE__ */ new Set();
  var hm;
  while ((hm = hrefRe.exec(section)) !== null) {
    if (!seen.has(hm[1])) {
      seen.add(hm[1]);
      order.push(hm[1]);
    }
  }
  var index = new Map(parseNovelEntries(flight).map(function(n) {
    return [n.slug, n];
  }));
  return order.map(function(slug) {
    return index.get(slug);
  }).filter(function(n) {
    return !!n;
  });
}

// .tsc-build/plugin.js
var __awaiter = function(thisArg, _arguments, P, generator) {
  function adopt(value) {
    return value instanceof P ? value : new P(function(resolve) {
      resolve(value);
    });
  }
  return new (P || (P = Promise))(function(resolve, reject) {
    function fulfilled(value) {
      try {
        step(generator.next(value));
      } catch (e) {
        reject(e);
      }
    }
    function rejected(value) {
      try {
        step(generator["throw"](value));
      } catch (e) {
        reject(e);
      }
    }
    function step(result) {
      result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected);
    }
    step((generator = generator.apply(thisArg, _arguments || [])).next());
  });
};
var __generator = function(thisArg, body) {
  var _ = { label: 0, sent: function() {
    if (t[0] & 1) throw t[1];
    return t[1];
  }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
  return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() {
    return this;
  }), g;
  function verb(n) {
    return function(v) {
      return step([n, v]);
    };
  }
  function step(op) {
    if (f) throw new TypeError("Generator is already executing.");
    while (g && (g = 0, op[0] && (_ = 0)), _) try {
      if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
      if (y = 0, t) op = [op[0] & 2, t.value];
      switch (op[0]) {
        case 0:
        case 1:
          t = op;
          break;
        case 4:
          _.label++;
          return { value: op[1], done: false };
        case 5:
          _.label++;
          y = op[1];
          op = [0];
          continue;
        case 7:
          op = _.ops.pop();
          _.trys.pop();
          continue;
        default:
          if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) {
            _ = 0;
            continue;
          }
          if (op[0] === 3 && (!t || op[1] > t[0] && op[1] < t[3])) {
            _.label = op[1];
            break;
          }
          if (op[0] === 6 && _.label < t[1]) {
            _.label = t[1];
            t = op;
            break;
          }
          if (t && _.label < t[2]) {
            _.label = t[2];
            _.ops.push(op);
            break;
          }
          if (t[2]) _.ops.pop();
          _.trys.pop();
          continue;
      }
      op = body.call(thisArg, _);
    } catch (e) {
      op = [6, e];
      y = 0;
    } finally {
      f = t = 0;
    }
    if (op[0] & 5) throw op[1];
    return { value: op[0] ? op[1] : void 0, done: true };
  }
};
function loadFetchLib() {
  try {
    return require("@libs/fetch") || {};
  } catch (e) {
    return {};
  }
}
function loadNovelStatus() {
  try {
    var lib = require("@libs/novelStatus");
    if (lib && lib.NovelStatus)
      return lib.NovelStatus;
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
var FETCH_TIMEOUT_MS = 3e4;
var MAX_FETCH_ATTEMPTS = 3;
function sleep(ms) {
  return new Promise(function(resolve) {
    if (typeof setTimeout === "function")
      setTimeout(resolve, ms);
    else
      resolve();
  });
}
function withTimeout(p, ms) {
  var timer = void 0;
  var timeout = new Promise(function(_, reject) {
    if (typeof setTimeout === "function") {
      timer = setTimeout(function() {
        return reject(new Error("Request timed out"));
      }, ms);
    }
  });
  var clear = function() {
    if (timer !== void 0)
      clearTimeout(timer);
  };
  return Promise.race([p, timeout]).then(function(v) {
    clear();
    return v;
  }, function(e) {
    clear();
    throw e;
  });
}
function fetchRaw(url) {
  return __awaiter(this, void 0, void 0, function() {
    var res, status_1, text, _a;
    var _b;
    return __generator(this, function(_c) {
      switch (_c.label) {
        case 0:
          if (!(typeof fetchLib.fetchApi === "function")) return [3, 5];
          return [4, fetchLib.fetchApi(url)];
        case 1:
          res = _c.sent();
          status_1 = res && typeof res.status === "number" ? res.status : void 0;
          if (!(res && typeof res.text === "function")) return [3, 3];
          return [4, res.text()];
        case 2:
          _a = _c.sent();
          return [3, 4];
        case 3:
          _a = "";
          _c.label = 4;
        case 4:
          text = _a;
          return [2, { status: status_1, text: text }];
        case 5:
          if (!(typeof fetchLib.fetchText === "function")) return [3, 7];
          _b = {};
          return [4, fetchLib.fetchText(url)];
        case 6:
          return [2, (_b.text = _c.sent(), _b)];
        case 7:
          throw new Error("No fetch implementation provided by the host app");
      }
    });
  });
}
function statusFromError(e) {
  var m = /HTTP (\d{3})/.exec(String(e && e.message || e || ""));
  return m ? parseInt(m[1], 10) : void 0;
}
function fetchText(url) {
  return __awaiter(this, void 0, void 0, function() {
    var lastError, attempt, status_2, res, e_1, msg, retryable;
    return __generator(this, function(_a) {
      switch (_a.label) {
        case 0:
          lastError = new Error("Request failed");
          attempt = 1;
          _a.label = 1;
        case 1:
          if (!(attempt <= MAX_FETCH_ATTEMPTS)) return [3, 7];
          status_2 = void 0;
          _a.label = 2;
        case 2:
          _a.trys.push([2, 4, , 6]);
          return [4, withTimeout(fetchRaw(url), FETCH_TIMEOUT_MS)];
        case 3:
          res = _a.sent();
          status_2 = res.status;
          if (status_2 === 429 || status_2 !== void 0 && status_2 >= 500) {
            throw new Error("Server responded with HTTP " + status_2);
          }
          return [2, res.text];
        case 4:
          e_1 = _a.sent();
          lastError = e_1;
          if (status_2 === void 0)
            status_2 = statusFromError(e_1);
          msg = String(e_1 && e_1.message || e_1 || "");
          retryable = status_2 === void 0 || status_2 === 429 || status_2 >= 500 || /timed out/i.test(msg);
          if (!retryable || attempt === MAX_FETCH_ATTEMPTS)
            return [3, 7];
          return [4, sleep(1e3 * Math.pow(2, attempt - 1) + Math.random() * 500)];
        case 5:
          _a.sent();
          return [3, 6];
        case 6:
          attempt++;
          return [3, 1];
        case 7:
          throw lastError instanceof Error ? lastError : new Error(String(lastError));
      }
    });
  });
}
var NightjarReads = (
  /** @class */
  (function() {
    function NightjarReads2() {
      var _this = this;
      this.id = "nightjarreads";
      this.name = "Nightjar Reads";
      this.icon = "src/en/nightjarreads/icon.png";
      this.site = "https://nightjarreads.com";
      this.version = "1.0.4";
      this.resolveUrl = function(path, _isNovel) {
        return _this.site + path;
      };
    }
    NightjarReads2.prototype.popularNovels = function(pageNo, _options) {
      return __awaiter(this, void 0, void 0, function() {
        var html;
        return __generator(this, function(_a) {
          switch (_a.label) {
            case 0:
              if (pageNo > 1)
                return [2, []];
              return [4, fetchText(this.site + "/browse?sort=popular")];
            case 1:
              html = _a.sent();
              return [2, parseNovelEntries(extractFlightText(html)).map(function(n) {
                return {
                  name: n.title,
                  path: "/novel/" + n.slug,
                  cover: n.coverUrl
                };
              })];
          }
        });
      });
    };
    NightjarReads2.prototype.parseNovel = function(novelPath) {
      return __awaiter(this, void 0, void 0, function() {
        var slug, html, d, status, novel;
        return __generator(this, function(_a) {
          switch (_a.label) {
            case 0:
              slug = novelPath.split("/").filter(Boolean).pop() || "";
              return [4, fetchText(this.site + novelPath)];
            case 1:
              html = _a.sent();
              d = parseNovelPage(html, extractFlightText(html), slug);
              status = NovelStatus.Unknown;
              if (d.status === "Ongoing")
                status = NovelStatus.Ongoing;
              else if (d.status === "Completed")
                status = NovelStatus.Completed;
              else if (d.status === "On Hiatus" || d.status === "Hiatus")
                status = NovelStatus.OnHiatus;
              else if (d.status === "Cancelled" || d.status === "Dropped")
                status = NovelStatus.Cancelled;
              novel = {
                path: novelPath,
                name: d.name,
                status: status
              };
              if (d.cover)
                novel.cover = d.cover;
              if (d.author)
                novel.author = d.author;
              if (d.genres.length)
                novel.genres = d.genres.join(", ");
              if (d.summary)
                novel.summary = d.summary;
              novel.chapters = d.chapters.map(function(c) {
                return {
                  name: "Chapter " + c.number + ": " + c.title,
                  path: "/novel/" + slug + "/" + c.number,
                  releaseTime: c.publishedAt,
                  chapterNumber: c.number
                };
              });
              return [2, novel];
          }
        });
      });
    };
    NightjarReads2.prototype.parseChapter = function(chapterPath) {
      return __awaiter(this, void 0, void 0, function() {
        var html, content;
        return __generator(this, function(_a) {
          switch (_a.label) {
            case 0:
              return [4, fetchText(this.site + chapterPath)];
            case 1:
              html = _a.sent();
              if (/<title>\s*Not found/i.test(html)) {
                return [2, "<p><strong>This chapter is no longer available on Nightjar Reads.</strong></p><p>It may have been removed or moved. Refresh the novel to update the chapter list.</p>"];
              }
              content = parseChapterPage(extractFlightText(html));
              if (content === null) {
                return [2, "<p><strong>Could not load this chapter.</strong></p><p>It may be locked or temporarily unavailable on Nightjar Reads.</p>"];
              }
              return [2, content];
          }
        });
      });
    };
    NightjarReads2.prototype.searchNovels = function(searchTerm, pageNo) {
      return __awaiter(this, void 0, void 0, function() {
        var html, flight;
        return __generator(this, function(_a) {
          switch (_a.label) {
            case 0:
              if (pageNo > 1)
                return [2, []];
              return [4, fetchText(this.site + "/search?q=" + encodeURIComponent(searchTerm))];
            case 1:
              html = _a.sent();
              flight = extractFlightText(html);
              return [2, parseSearchResults(flight, searchTerm).map(function(n) {
                return {
                  name: n.title,
                  path: "/novel/" + n.slug,
                  cover: n.coverUrl
                };
              })];
          }
        });
      });
    };
    return NightjarReads2;
  })()
);
var plugin_default = new NightjarReads();
exports.default = plugin_default;
try { if (typeof module !== "undefined" && module && module.exports) module.exports.default = plugin_default; } catch (e) {}
