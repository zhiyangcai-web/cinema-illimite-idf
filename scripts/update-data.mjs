import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT_FILE = join(ROOT, "data", "showtimes.json");
const ENV = globalThis.process?.env || {};
const DAYS_AHEAD = Number(ENV.DAYS_AHEAD || 21);
const MAX_UGC_CINEMAS = Number(ENV.MAX_UGC_CINEMAS || 32);
const REQUEST_TIMEOUT_MS = Number(ENV.REQUEST_TIMEOUT_MS || 15_000);
const FETCH_RETRIES = Number(ENV.FETCH_RETRIES || 2);
const UGC_CONCURRENCY = Number(ENV.UGC_CONCURRENCY || 8);
const UGC_SPECIAL_CONCURRENCY = Number(ENV.UGC_SPECIAL_CONCURRENCY || 6);
const UGC_SPECIAL_DAYS_AHEAD = Number(ENV.UGC_SPECIAL_DAYS_AHEAD || Math.max(DAYS_AHEAD, 180));
const MK2_CONCURRENCY = Number(ENV.MK2_CONCURRENCY || 6);
const MK2_DAYS_AHEAD = Number(ENV.MK2_DAYS_AHEAD || Math.max(DAYS_AHEAD, 120));
const ALLOCINE_DAYS_AHEAD = Number(ENV.ALLOCINE_DAYS_AHEAD || Math.min(DAYS_AHEAD, 10));
const ALLOCINE_CONCURRENCY = Number(ENV.ALLOCINE_CONCURRENCY || 3);
const ALLOCINE_DATE_CONCURRENCY = Number(ENV.ALLOCINE_DATE_CONCURRENCY || 3);
const ALLOCINE_ENABLE_AUTOCOMPLETE = ENV.ALLOCINE_ENABLE_AUTOCOMPLETE === "1";
const ALLOCINE_REQUEST_DELAY_MS = Number(ENV.ALLOCINE_REQUEST_DELAY_MS || 350);

const IDF_POSTAL_PREFIXES = ["75", "77", "78", "91", "92", "93", "94", "95"];
const UGC_IDF_IDS = new Set([
  10, 12, 7, 14, 15, 13, 4, 11, 5, 9, 37, 20, 59, 18, 38, 21, 19, 16, 17,
  43, 44, 6, 40, 41, 55, 47, 48, 49, 54, 39
]);
const UGC_SPECIAL_CATEGORIES = [
  { id: 1, name: "Avant-premiere" },
  { id: 3, name: "UGC Culte" },
  { id: 5, name: "Seances speciales" },
  { id: 13, name: "Cycle / Marathon" }
];
const UGC_EXCLUDED_SPECIAL_LABEL_RE = /\b(preventes?|pre[-\s]?ventes?|ugc aime|ugc decouvre|family|famille|pestacles?)\b/i;
const UGC_TRUE_PREMIERE_RE = /\b(avec equipe|rencontre|debat|masterclass)\b/i;
const MK2_EXCLUDED_SELECTION_RE = /\b(precommandes?|preventes?|pre[-\s]?ventes?)\b/i;
const MK2_STRONG_EVENT_SELECTION_RE = /\b(mk2 institut|philosophie|cycle|festival|retrospective|rencontre|debat|masterclass|cine[-\s]?club|carte blanche|marathon|seance speciale)\b/i;
const MK2_EVENT_TITLE_RE = /\b(rencontre|debat|masterclass|cine[-\s]?club|carte blanche|festival|retrospective|marathon|seance speciale)\b/i;
const MK2_REPERTORY_MIN_AGE_DAYS = Number(ENV.MK2_REPERTORY_MIN_AGE_DAYS || 90);
const ALLOCINE_THEATER_OVERRIDES = [
  ["LE GRAND REX - LE REX", "C0065", "Le Grand Rex", "75002"],
  ["ECOLES CINEMA CLUB", "C0071", "Ecoles Cinema Club", "75005"],
  ["ESPACE SAINT MICHEL", "C0117", "Espace Saint-Michel", "75005"],
  ["EPEE DE BOIS", "W7504", "Epee de bois", "75005"],
  ["LA FILMOTHEQUE QUARTIER LATIN", "C0020", "Filmotheque du Quartier Latin", "75005"],
  ["LE REFLET MEDICIS", "C0074", "Reflet Medicis", "75005"],
  ["STUDIO GALANDE", "C0016", "Studio Galande", "75005"],
  ["CHRISTINE CINEMA CLUB", "C0015", "Christine Cinema Club", "75006"],
  ["L'ARLEQUIN", "C0054", "L'Arlequin", "75006"],
  ["LE LUCERNAIRE", "C0093", "Lucernaire", "75006"],
  ["LES 3 LUXEMBOURG", "C0095", "Les 3 Luxembourg", "75006"],
  ["JEU DE PAUME", "W7588", "Jeu de Paume", "75008"],
  ["PUBLICIS", "C6336", "Publicis Cinemas", "75008"],
  ["MAX LINDER", "C0089", "Max Linder Panorama", "75009"],
  ["L'ARCHIPEL", "C0134", "L'Archipel", "75010"],
  ["LE BRADY", "C0023", "Le Brady", "75010"],
  ["LE LOUXOR", "W7510", "Le Louxor - Palais du cinema", "75010"],
  ["LE MAJESTIC BASTILLE", "C0139", "Majestic Bastille", "75011"],
  ["L'ESCURIAL", "C0147", "Escurial", "75013"],
  ["LES 7 PARNASSIENS", "C0025", "Sept Parnassiens", "75014"],
  ["CHAPLIN DENFERT", "C0153", "Cinema Chaplin Denfert", "75014"],
  ["MAJESTIC PASSY", "C0120", "Majestic Passy", "75016"],
  ["CINEMA DES CINEASTES", "C0004", "Le Cinema des Cineastes", "75017"],
  ["MAC MAHON", "C0172", "Mac-Mahon", "75017"],
  ["Le Central", "B0060", "Central Cinema", "91190"],
  ["C2L Saint Germain", "B0038", "UGC C2L Saint-Germain", "78100"],
  ["C2L Poissy", "B0052", "UGC C2L Poissy", "78300"],
  ["CINEMA LE STUDIO", "B0101", "Le Studio", "93300"],
  ["CINEMA JACQUES PREVERT", "B0103", "Theatre et Cinema Jacques-Prevert", "93600"],
  ["CINEMA ABEL GANCE", "B0084", "Abel Gance", "92400"],
  ["LOUIS DAQUIN", "B0105", "Louis-Daquin", "93150"],
  ["CENTRE DES BORDS DE MARNE", "B0141", "Centre des Bords-de-Marne", "94170"],
  ["JEAN MARAIS", "B0046", "Cinema Jean-Marais", "78110"],
  ["CONFLUENCES MENNECY", "P9154", "Cinema Confluences Mennecy", "91540"],
  ["LE BIJOU", "P9316", "Le Bijou", "93160"],
  ["ARIEL RUEIL", "B0092", "Ariel - Centre ville", "92500"],
  ["ARIEL HAUTS DE RUEIL", "W9250", "Ariel - Hauts de Rueil", "92500"],
  ["LES 3 PIERROTS", "B0094", "Les 3 Pierrots", "92210"],
  ["LES 4 DELTA", "B0144", "Cinema 4 Delta", "94110"],
  ["3 CINES ROBESPIERRE", "B0151", "Les 3 Cines - Robespierre", "94400"],
  ["L'ECRAN", "B0122", "L'Ecran", "93200"],
  ["CONFLUENCES VARENNES", "W7713", "Cinema Confluences Varennes", "77130"],
  ["LE CAPITOLE", "B0203", "Cinema Le Capitole", "92150"],
  ["L'ANTARES", "B4834", "L'Antares", "95490"],
  ["CINEMA ESPACE 1789", "B0123", "Espace 1789", "93400"]
];
const ALLOCINE_PRIORITY_THEATER_IDS = [
  "B0103",
  "B0092",
  "W9250",
  "B0094",
  "B0144",
  "B0123",
  "B0203",
  "B4834",
  "B0151",
  "W7713"
];
let allocineRequestQueue = Promise.resolve();
let allocineNextRequestAt = 0;

async function main() {
  const previousShowtimes = await readPreviousShowtimes();
  const generatedAt = new Date().toISOString();
  const partnerCatalog = await fetchUgcAcceptedCinemas();
  const independentPromise = fetchIndependentPartnerShowtimes(partnerCatalog);
  const allocinePromise = independentPromise.then((showtimes) => fetchAllocinePartnerShowtimes(partnerCatalog, showtimes));
  const [independent, ugc, mk2, allocine] = await Promise.allSettled([
    independentPromise,
    fetchUgcShowtimes(),
    fetchMk2Showtimes(),
    allocinePromise
  ]);

  const independentItems = settledValue(independent, "DataCinesIndes");
  const ugcItems = settledValue(ugc, "UGC");
  const mk2Items = settledValue(mk2, "MK2");
  const allocineItems = settledValue(allocine, "AlloCine");
  const preservedAlloCine = preservePreviousAlloCineShowtimes(previousShowtimes, allocineItems);
  if (preservedAlloCine.length) console.log(`Preserved ${preservedAlloCine.length} previous AlloCine showtimes`);

  const showtimes = [
    ...independentItems,
    ...ugcItems,
    ...mk2Items,
    ...allocineItems,
    ...preservedAlloCine
  ];

  const directorEnriched = backfillMissingDirectors(showtimes, previousShowtimes);
  const directorBackfillCount = directorEnriched.filter((item, index) => item.director && !showtimes[index]?.director).length;
  if (directorBackfillCount) console.log(`Backfilled ${directorBackfillCount} missing directors`);

  const dedupedItems = dedupe(directorEnriched);
  const duplicateCount = showtimes.length - dedupedItems.length;
  if (duplicateCount) console.log(`Removed ${duplicateCount} duplicate showtimes`);

  const deduped = dedupedItems
    .filter((item) => item.start && item.filmTitle && item.cinemaName)
    .sort((a, b) => new Date(a.start) - new Date(b.start));

  await mkdir(dirname(OUT_FILE), { recursive: true });
  await writeFile(OUT_FILE, `${JSON.stringify({
    generatedAt,
    timezone: "Europe/Paris",
    scope: "Ile-de-France",
    daysAhead: DAYS_AHEAD,
    ugcSpecialDaysAhead: UGC_SPECIAL_DAYS_AHEAD,
    mk2DaysAhead: MK2_DAYS_AHEAD,
    sources: [
      "UGC accepted cinemas: https://www.ugc.fr/cinemas-acceptant-ui.html",
      "Independent cinema API: https://datacinesindes.fr/data-fair/api/v1/datasets/programmation-cinemas",
      "UGC showings: https://www.ugc.fr/showingsCinemaAjaxAction!getShowingsForCinemaPage.action",
      "UGC event showings: https://www.ugc.fr/cinemaAjaxAction!getDoNotMissWithSlider.action",
      "MK2 pages: https://www.mk2.com/salles",
      "AlloCine partner showtimes: https://www.allocine.fr"
    ],
    showtimes: deduped
  }, null, 2)}\n`, "utf8");

  console.log(`Wrote ${deduped.length} showtimes to ${OUT_FILE}`);
}

function settledValue(result, name) {
  if (result.status === "fulfilled") return result.value;
  console.warn(`${name} source failed:`, result.reason?.message || result.reason);
  return [];
}

async function readPreviousShowtimes() {
  try {
    const data = JSON.parse(await readFile(OUT_FILE, "utf8"));
    return Array.isArray(data.showtimes) ? data.showtimes : [];
  } catch {
    return [];
  }
}

function preservePreviousAlloCineShowtimes(previousShowtimes, freshAlloCineShowtimes) {
  if (!previousShowtimes.length) return [];
  const freshIds = new Set(freshAlloCineShowtimes.map((item) => item.id).filter(Boolean));
  const start = new Date();
  const end = addDays(start, ALLOCINE_DAYS_AHEAD + 1);
  return previousShowtimes
    .filter((item) => item.source === "AlloCine")
    .filter((item) => item.id && !freshIds.has(item.id))
    .filter((item) => isWithin(item.start, start, end));
}

function backfillMissingDirectors(showtimes, previousShowtimes = []) {
  const directorByTitle = uniqueDirectorByTitle([...previousShowtimes, ...showtimes]);
  return showtimes.map((item) => {
    if (item.director) return item;
    const director = directorByTitle.get(dedupeToken(item.filmTitle));
    return director ? { ...item, director } : item;
  });
}

function uniqueDirectorByTitle(items) {
  const candidates = new Map();
  for (const item of items) {
    if (!item?.filmTitle || !item.director) continue;
    const key = dedupeToken(item.filmTitle);
    if (!key) continue;
    if (!candidates.has(key)) candidates.set(key, new Map());
    const directors = candidates.get(key);
    const cleanDirector = cleanPeopleList(item.director);
    if (!cleanDirector) continue;
    const directorKey = eventComparable(cleanDirector);
    if (!directors.has(directorKey)) directors.set(directorKey, cleanDirector);
  }

  const unique = new Map();
  for (const [titleKey, directors] of candidates) {
    if (directors.size === 1) unique.set(titleKey, [...directors.values()][0]);
  }
  return unique;
}

async function fetchText(url, options = {}) {
  let lastError;
  for (let attempt = 0; attempt <= FETCH_RETRIES; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let retryDelay = 0;
    try {
      const response = await fetch(url, {
        ...options,
        signal: options.signal || controller.signal,
        headers: {
          "accept": "text/html,application/json",
          "user-agent": "cinema-illimite-idf/0.1 (+GitHub Pages personal project)",
          ...(options.headers || {})
        }
      });
      if (response.ok) return response.text();
      lastError = new Error(`${response.status} ${response.statusText} for ${url}`);
      if (attempt < FETCH_RETRIES && isRetryableStatus(response.status)) {
        retryDelay = retryDelayMs(response, attempt);
      } else {
        throw lastError;
      }
    } catch (error) {
      lastError = error.name === "AbortError"
        ? new Error(`Timed out after ${REQUEST_TIMEOUT_MS}ms for ${url}`)
        : error;
      if (attempt < FETCH_RETRIES && isRetryableFetchError(lastError)) {
        retryDelay = 750 * (attempt + 1);
      } else {
        throw lastError;
      }
    } finally {
      clearTimeout(timeout);
    }
    if (retryDelay) await sleep(retryDelay);
  }
  throw lastError;
}

function isRetryableStatus(status) {
  return [429, 500, 502, 503, 504].includes(Number(status));
}

function isRetryableFetchError(error) {
  return /Timed out|fetch failed|ECONNRESET|ETIMEDOUT|ENOTFOUND/i.test(error.message || "");
}

function retryDelayMs(response, attempt) {
  const retryAfter = Number(response.headers.get("retry-after") || 0);
  const delay = retryAfter > 0 ? retryAfter * 1000 : 1_000 * (attempt + 1);
  return Math.min(delay, 5_000);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(url) {
  return JSON.parse(await fetchText(url, { headers: { accept: "application/json" } }));
}

async function fetchUgcAcceptedCinemas() {
  const html = await fetchText("https://www.ugc.fr/cinemas-acceptant-ui.html");
  const rx = /<div class="color--white text-uppercase">([\s\S]*?)<\/div>\s*<div class="color--blue-grey">([\s\S]*?)<\/div>/g;
  const records = [];
  let match;
  while ((match = rx.exec(html))) {
    const name = cleanHtml(match[1]);
    const address = cleanHtml(match[2]);
    const postalCode = (address.match(/\b(75|77|78|91|92|93|94|95)\d{3}\b/) || [])[0] || "";
    if (!postalCode) continue;
    records.push({
      name,
      normalized: normalizeCinemaName(name),
      address,
      postalCode,
      network: name.toUpperCase().startsWith("UGC") ? "UGC" : name.toUpperCase().startsWith("MK2") ? "MK2" : "PARTNER"
    });
  }
  return records;
}

async function fetchIndependentPartnerShowtimes(partnerCatalog) {
  const partners = partnerCatalog.filter((item) => item.network === "PARTNER");
  const rows = [];
  let url = "https://datacinesindes.fr/data-fair/api/v1/datasets/programmation-cinemas/lines?size=1000";
  while (url) {
    const page = await fetchJson(url);
    rows.push(...(page.results || []));
    url = page.next || "";
  }

  const start = new Date();
  const end = addDays(start, DAYS_AHEAD + 1);

  return rows
    .filter((row) => isIdfPostal(row.cinecp))
    .filter((row) => isWithin(row.showstart, start, end))
    .map((row) => ({ row, partner: findPartnerCinema(row, partners) }))
    .filter((item) => item.partner)
    .map((row) => ({
      id: `partner-${row.row.showid || row.row._id}`,
      source: "DataCinesIndes",
      network: "PARTNER",
      cinemaId: `partner-${slug(row.row.cinenom)}-${row.row.cineid || ""}`,
      cinemaName: titleName(row.row.cinenom),
      city: titleName(row.row.cineville),
      postalCode: String(row.row.cinecp || row.partner.postalCode || ""),
      address: row.row.cineadresse || row.partner.address || "",
      filmTitle: titleName(row.row.filmtitle),
      director: cleanPeopleList(row.row.filmdirector),
      genre: row.row.filmgenre || "",
      version: row.row.filmversion || "",
      audio: row.row.filmaudio || "",
      durationMin: row.row.filmduration ? Math.round(Number(row.row.filmduration) / 60) : null,
      start: normalizeIso(row.row.showstart),
      end: normalizeIso(row.row.showend),
      bookingUrl: row.row.showurl || "",
      filmUrl: row.row.showurl || "",
      poster: row.row.filmposter || ""
    }));
}

function findPartnerCinema(row, partners) {
  const postal = String(row.cinecp || "");
  const rowKey = normalizeCinemaName(row.cinenom);
  return partners.find((partner) => {
    if (postal && partner.postalCode && postal !== partner.postalCode) return false;
    if (partner.normalized === rowKey) return true;
    return fuzzyCinemaMatch(rowKey, partner.normalized);
  });
}

function fuzzyCinemaMatch(left, right) {
  if (!left || !right) return false;
  if (left === right) return true;
  if (left.length >= 6 && right.length >= 6 && (left.includes(right) || right.includes(left))) return true;
  return false;
}

async function fetchAllocinePartnerShowtimes(partnerCatalog, existingPartnerShowtimes = []) {
  const partners = partnerCatalog.filter((item) => item.network === "PARTNER");
  const covered = coveredPartnerKeys(existingPartnerShowtimes, partners);
  const missingPartners = partners
    .filter((partner) => !covered.has(partner.normalized))
    .sort((left, right) => allocinePriorityRank(left) - allocinePriorityRank(right));

  return mapLimit(missingPartners, ALLOCINE_CONCURRENCY, async (partner) => {
    try {
      const theater = await findAllocineTheater(partner);
      if (!theater) return [];
      const dates = await fetchAllocineTheaterDates(theater.id);
      const wantedDates = dates.filter((date) => isDateKeyWithinDays(date, ALLOCINE_DAYS_AHEAD));
      const daily = await mapLimit(wantedDates, ALLOCINE_DATE_CONCURRENCY, async (date) => fetchAllocineShowtimesForDate(partner, theater, date));
      return daily;
    } catch (error) {
      console.warn(`AlloCine ${partner.name} failed: ${error.message}`);
      return [];
    }
  });
}

function coveredPartnerKeys(showtimes, partners) {
  const keys = new Set();
  for (const item of showtimes) {
    const partner = findPartnerCinema({
      cinenom: item.cinemaName,
      cinecp: item.postalCode
    }, partners);
    if (partner) keys.add(partner.normalized);
  }
  return keys;
}

async function findAllocineTheater(partner) {
  const knownTheater = allocineStaticTheater(partner);
  if (knownTheater) return knownTheater;
  if (!ALLOCINE_ENABLE_AUTOCOMPLETE) return null;

  for (const query of allocineSearchQueries(partner.name)) {
    const json = await fetchAllocineJson(`https://www.allocine.fr/_/autocomplete/theater/${encodeURIComponent(query)}`);
    const candidate = (json.results || []).find((result) => {
      const zip = String(result.data?.zip || "");
      if (zip && partner.postalCode && zip !== partner.postalCode) return false;
      return fuzzyCinemaMatch(normalizeCinemaName(result.label), partner.normalized);
    });
    if (candidate) {
      return {
        id: candidate.entity_id || candidate.data?.id,
        name: cleanHtml(candidate.label),
        postalCode: String(candidate.data?.zip || partner.postalCode || ""),
        city: titleName(candidate.data?.city || inferCity(partner.address)),
        address: cleanHtml(candidate.data?.address || partner.address || "")
      };
    }
  }
  return null;
}

function allocineStaticTheater(partner) {
  const match = ALLOCINE_THEATER_OVERRIDES.find(([name, , , postalCode]) => {
    if (postalCode && partner.postalCode && postalCode !== partner.postalCode) return false;
    return fuzzyCinemaMatch(normalizeCinemaName(name), partner.normalized);
  });
  if (!match) return null;
  const [, id, name, postalCode] = match;
  return {
    id,
    name,
    postalCode: postalCode || partner.postalCode || "",
    city: inferCity(partner.address),
    address: partner.address || ""
  };
}

function allocinePriorityRank(partner) {
  const id = allocineStaticTheater(partner)?.id || "";
  const index = ALLOCINE_PRIORITY_THEATER_IDS.indexOf(id);
  return index === -1 ? ALLOCINE_PRIORITY_THEATER_IDS.length : index;
}

function allocineSearchQueries(name) {
  const cleaned = cleanHtml(name)
    .replace(/\([^)]*\)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const withoutDash = cleaned.split(/\s+-\s+/)[0].trim();
  const withoutCinema = cleaned.replace(/\b(cinema|cine)\b/gi, " ").replace(/\s+/g, " ").trim();
  return [...new Set([cleaned, withoutDash, withoutCinema].filter(Boolean))];
}

async function fetchAllocineTheaterDates(theaterId) {
  const html = await fetchAllocineText(`https://www.allocine.fr/seance/salle_gen_csalle%3D${encodeURIComponent(theaterId)}.html`, {
    headers: { "user-agent": "Mozilla/5.0" }
  });
  const encoded = (html.match(/data-showtimes-dates="([^"]+)"/) || [])[1] || "[]";
  const dates = safeJsonParse(decodeAttr(encoded)) || [];
  return Array.isArray(dates) ? dates : [];
}

async function fetchAllocineShowtimesForDate(partner, theater, date) {
  const json = await fetchAllocineJson(`https://www.allocine.fr/_/showtimes/theater-${encodeURIComponent(theater.id)}/d-${encodeURIComponent(date)}/`);
  return parseAllocineShowtimes(json, partner, theater);
}

async function fetchAllocineText(url, options = {}) {
  await waitForAllocineSlot();
  return fetchText(url, options);
}

async function fetchAllocineJson(url, options = {}) {
  return JSON.parse(await fetchAllocineText(url, {
    ...options,
    headers: {
      accept: "application/json",
      ...(options.headers || {})
    }
  }));
}

async function waitForAllocineSlot() {
  if (!ALLOCINE_REQUEST_DELAY_MS) return;
  const queued = allocineRequestQueue.then(async () => {
    const waitMs = Math.max(0, allocineNextRequestAt - Date.now());
    if (waitMs) await sleep(waitMs);
    allocineNextRequestAt = Date.now() + ALLOCINE_REQUEST_DELAY_MS;
  });
  allocineRequestQueue = queued.catch(() => {});
  await queued;
}

function parseAllocineShowtimes(json, partner, theater) {
  const results = [];
  for (const item of json.results || []) {
    const movie = item.movie || {};
    const showtimeGroups = item.showtimes || {};
    for (const [versionKey, showtimes] of Object.entries(showtimeGroups)) {
      for (const showtime of showtimes || []) {
        const start = allocineStartIso(showtime.startsAt);
        if (!start) continue;
        const durationMin = parseAllocineRuntime(movie.runtime);
        results.push({
          id: `allocine-${theater.id}-${showtime.internalId}`,
          source: "AlloCine",
          network: "PARTNER",
          cinemaId: `partner-${slug(theater.name || partner.name)}-${theater.id}`,
          cinemaName: titleName(theater.name || partner.name),
          city: titleName(theater.city || inferCity(partner.address)),
          postalCode: String(theater.postalCode || partner.postalCode || ""),
          address: theater.address || partner.address || "",
          filmTitle: movie.title || "",
          director: allocineDirectors(movie),
          genre: (movie.genres || []).map((genre) => genre.translate || genre.name).filter(Boolean).join(", "),
          version: allocineVersionLabel(showtime.diffusionVersion || versionKey),
          durationMin,
          start,
          end: durationMin ? addMinutesIso(start, durationMin) : "",
          bookingUrl: allocineBookingUrl(showtime) || `https://www.allocine.fr/seance/salle_gen_csalle=${theater.id}.html`,
          filmUrl: movie.internalId ? `https://www.allocine.fr/film/fichefilm_gen_cfilm=${movie.internalId}.html` : `https://www.allocine.fr/seance/salle_gen_csalle=${theater.id}.html`,
          poster: movie.poster?.url || ""
        });
      }
    }
  }
  return results;
}

function allocineBookingUrl(showtime) {
  const ticketing = showtime.data?.ticketing || [];
  const preferred = ticketing.find((item) => item.provider === "default") || ticketing[0];
  return preferred?.urls?.[0] || "";
}

function allocineStartIso(value) {
  if (!value) return "";
  const text = String(value);
  const date = text.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return "";
  return `${text}${parisOffsetForLocalDate(date)}`;
}

function allocineVersionLabel(value) {
  const normalized = String(value || "").toUpperCase();
  if (normalized.includes("ORIGINAL")) return "VO";
  if (normalized.includes("DUBBED") || normalized.includes("MULTIPLE")) return "VF";
  return normalized || "";
}

function parseAllocineRuntime(value) {
  const text = String(value || "");
  const hours = Number((text.match(/(\d+)\s*h/) || [])[1] || 0);
  const minutes = Number((text.match(/(\d+)\s*min/) || [])[1] || 0);
  const total = hours * 60 + minutes;
  return total || null;
}

function allocineDirectors(movie) {
  const directors = (movie.credits || [])
    .filter((credit) => eventComparable(credit.position?.department) === "direction")
    .filter((credit) => /director|realisateur/i.test(String(credit.position?.name || "")))
    .sort((left, right) => Number(left.rank || 0) - Number(right.rank || 0))
    .map((credit) => personName(credit.person))
    .filter(Boolean);
  return uniquePeople(directors).join(", ");
}

async function fetchUgcShowtimes() {
  const list = await fetchJson("https://www.ugc.fr/inscriptionNewsletterAction!getCinemaList.action");
  const cinemas = (list.cinemas || [])
    .filter((cinema) => UGC_IDF_IDS.has(Number(cinema.id)))
    .slice(0, MAX_UGC_CINEMAS);

  const dates = dateRange(DAYS_AHEAD);
  const requests = cinemas.flatMap((cinema) => dates.map((date) => ({ cinema, date })));

  const regular = await mapLimit(requests, UGC_CONCURRENCY, async ({ cinema, date }) => {
    const url = `https://www.ugc.fr/showingsCinemaAjaxAction!getShowingsForCinemaPage.action?cinemaId=${encodeURIComponent(cinema.id)}&date=${encodeURIComponent(formatUgcDate(date))}&page=30007`;
    try {
      const html = await fetchText(url);
      return parseUgcHtml(html, cinema);
    } catch (error) {
      console.warn(`UGC ${cinema.name} ${date.toISOString().slice(0, 10)} failed: ${error.message}`);
      return [];
    }
  });
  const special = await fetchUgcSpecialShowtimes(cinemas);
  return [...regular, ...special];
}

async function fetchUgcSpecialShowtimes(cinemas) {
  const start = new Date();
  const end = addDays(start, UGC_SPECIAL_DAYS_AHEAD + 1);
  const requests = cinemas.flatMap((cinema) => UGC_SPECIAL_CATEGORIES.map((category) => ({ cinema, category })));
  return mapLimit(requests, UGC_SPECIAL_CONCURRENCY, async ({ cinema, category }) => {
    const url = `https://www.ugc.fr/cinemaAjaxAction!getDoNotMissWithSlider.action?doNotMissCategoryId=${encodeURIComponent(category.id)}&cinemaId=${encodeURIComponent(cinema.id)}`;
    try {
      const html = await fetchText(url);
      return parseUgcSpecialHtml(html, cinema, category, start, end);
    } catch (error) {
      console.warn(`UGC special ${cinema.name} ${category.name} failed: ${error.message}`);
      return [];
    }
  });
}

function parseUgcHtml(html, cinema) {
  const showings = [];
  const chunks = html.split(/<div id="bloc-showing-film-/g).slice(1);
  for (const chunk of chunks) {
    const filmId = (chunk.match(/^(\d+)/) || [])[1] || "";
    const title = decodeAttr((chunk.match(/data-film="([^"]+)"/) || chunk.match(/title="([^"]+)"/) || [])[1] || "");
    const filmKind = decodeAttr((chunk.match(/data-film-kind="([^"]*)"/) || [])[1] || "");
    const filmHref = absolutizeUgc((chunk.match(/href="([^"]*film_[^"]+)"/) || [])[1] || "");
    const poster = absolutizeUgc((chunk.match(/data-src="([^"]+)"/) || [])[1] || "");
    const director = ugcDirectorFromChunk(chunk);
    const buttonRx = /<button[\s\S]*?data-showing="([^"]+)"[\s\S]*?data-version="([^"]*)"[\s\S]*?data-seanceHour="([^"]+)"[\s\S]*?data-seanceDate="([^"]+)"[\s\S]*?<\/button>/g;
    let button;
    while ((button = buttonRx.exec(chunk))) {
      const showingId = button[1];
      const version = decodeAttr(button[2]);
      const hour = button[3];
      const date = button[4];
      const end = (button[0].match(/\(fin\s*([0-2]\d:[0-5]\d)\)/) || [])[1] || "";
      showings.push({
        id: `ugc-${showingId}`,
        source: "UGC",
        network: "UGC",
        cinemaId: `ugc-${cinema.id}`,
        cinemaName: decodeAttr(cinema.name).trim(),
        city: inferCity(cinema.name),
        postalCode: "",
        filmTitle: title,
        director,
        genre: filmKind,
        version,
        start: localIsoFromFrenchDate(date, hour),
        end: end ? localIsoFromFrenchDate(date, end) : "",
        bookingUrl: `https://www.ugc.fr/reservationSeances.html?id=${showingId}`,
        filmUrl: filmHref,
        poster,
        providerFilmId: filmId
      });
    }
  }
  return showings;
}

function parseUgcSpecialHtml(html, cinema, category, start, end) {
  const showings = [];
  const chunks = html.split(/<div class="slider-item">/g).slice(1);
  for (const chunk of chunks) {
    const title = decodeAttr((chunk.match(/title="([^"]+)"/) || [])[1] || "");
    if (!title) continue;
    const filmHref = absolutizeUgc((chunk.match(/href="([^"]*film_[^"]+)"/) || [])[1] || "");
    const filmId = (filmHref.match(/_(\d+)\.html/) || chunk.match(/goToFilm_(\d+)/) || [])[1] || "";
    const poster = absolutizeUgc((chunk.match(/<img[^>]+src="([^"]+)"/) || [])[1] || "");
    const genre = decodeAttr((chunk.match(/data-film-kind="([^"]*)"/) || [])[1] || "");
    const director = ugcDirectorFromChunk(chunk);
    const tag = cleanHtml((chunk.match(/<span class="film-tag[^>]*>([\s\S]*?)<\/span>/) || [])[1] || "");
    const dataLabel = decodeAttr((chunk.match(/data-film-label="([^"]*)"/) || [])[1] || "");
    const specialLabel = tag || dataLabel || category.name;
    if (!keepUgcSpecial(category, specialLabel)) continue;
    const bookingRx = /href="reservationSeances\.html\?id=([^"]+)"[\s\S]*?<span>([^<]+)<\/span>/g;
    let booking;
    while ((booking = bookingRx.exec(chunk))) {
      const showingId = booking[1];
      const startIso = localIsoFromFrenchText(booking[2]);
      if (!isWithin(startIso, start, end)) continue;
      showings.push({
        id: `ugc-${showingId}`,
        source: "UGC",
        network: "UGC",
        cinemaId: `ugc-${cinema.id}`,
        cinemaName: decodeAttr(cinema.name).trim(),
        city: inferCity(cinema.name),
        postalCode: "",
        filmTitle: title,
        director,
        genre,
        version: "",
        start: startIso,
        end: "",
        bookingUrl: `https://www.ugc.fr/reservationSeances.html?id=${showingId}`,
        filmUrl: filmHref,
        poster,
        providerFilmId: filmId,
        special: true,
        specialLabel,
        specialSource: `UGC ${category.name}`
      });
    }
  }
  return showings;
}

function keepUgcSpecial(category, specialLabel) {
  const comparable = eventComparable(specialLabel);
  if (category.id === 1) return UGC_TRUE_PREMIERE_RE.test(comparable);
  return !UGC_EXCLUDED_SPECIAL_LABEL_RE.test(comparable);
}

function ugcDirectorFromChunk(chunk) {
  const directMatch = chunk.match(/<p[^>]*>\s*De\s*<span[^>]*>([\s\S]*?)<\/span>\s*<\/p>/i)
    || chunk.match(/<p[^>]*>\s*De\s*([\s\S]*?)<\/p>/i);
  if (!directMatch) return "";
  return cleanPeopleList(directMatch[1]);
}

async function fetchMk2Showtimes() {
  const indexHtml = await fetchText("https://www.mk2.com/salles");
  const slugs = [...new Set([...indexHtml.matchAll(/href="\/salle\/([^"]+)"/g)].map((match) => match[1]))]
    .filter((item) => item.startsWith("mk2-"));
  const start = new Date();
  const regularEnd = addDays(start, DAYS_AHEAD + 1);
  const specialEnd = addDays(start, MK2_DAYS_AHEAD + 1);
  const raw = await mapLimit(slugs, MK2_CONCURRENCY, async (complexSlug) => {
    const results = [];
    try {
      const html = await fetchText(`https://www.mk2.com/salle/${complexSlug}`);
      const flight = extractNextFlightText(html);
      results.push(...parseMk2Flight(flight, start, specialEnd));
    } catch (error) {
      console.warn(`MK2 ${complexSlug} failed: ${error.message}`);
    }
    return results;
  });
  return classifyMk2Showtimes(raw, start, regularEnd, specialEnd);
}

function parseMk2Flight(flight, start, end) {
  const results = [];
  const complexBlocks = extractJsonObjectsContaining(flight, '"sessionsByType":');
  for (const block of complexBlocks) {
    const complex = safeJsonParse(block);
    if (!Array.isArray(complex?.sessionsByType)) continue;
    const cinemasById = new Map((complex.cinemas || []).map((cinema) => [String(cinema.id), cinema]));
    for (const sessionType of complex.sessionsByType) {
      for (const pair of sessionType.sessionsByFilmAndCinema || []) {
        if (!pair?.film || !Array.isArray(pair.sessions)) continue;
        const sourceInfo = mk2SourceInfo(pair.film, sessionType);
        for (const session of pair.sessions) {
          if (!isWithin(session.showTime, start, end)) continue;
          const cinema = pair.cinema || cinemasById.get(String(session.cinemaId)) || {};
          results.push(formatMk2Showtime(pair.film, cinema, session, sourceInfo));
        }
      }
    }
  }

  if (results.length) return results;

  const legacyBlocks = extractJsonObjectsStartingWith(flight, '{"cinema":');
  for (const block of legacyBlocks) {
    const item = safeJsonParse(block);
    if (!item?.film || !item?.cinema || !Array.isArray(item.sessions)) continue;
    const sourceInfo = mk2SourceInfo(item.film);
    for (const session of item.sessions) {
      if (isWithin(session.showTime, start, end)) {
        results.push(formatMk2Showtime(item.film, item.cinema, session, sourceInfo));
      }
    }
  }
  return results;
}

function mk2SourceInfo(film = {}, sessionType = {}) {
  const labels = [
    film.label?.name,
    ...(film.selections || []).map((selection) => selection?.name),
    sessionType.label,
    sessionType.name,
    sessionType.title
  ]
    .map((value) => cleanHtml(value))
    .filter(Boolean);
  const uniqueLabels = [...new Set(labels)];
  const comparableLabels = uniqueLabels.map((label) => eventComparable(label));
  const strongLabel = uniqueLabels.find((label) => {
    const comparable = eventComparable(label);
    return !MK2_EXCLUDED_SELECTION_RE.test(comparable) && MK2_STRONG_EVENT_SELECTION_RE.test(comparable);
  }) || "";
  return {
    labels: uniqueLabels,
    hasExcludedLabel: comparableLabels.some((label) => MK2_EXCLUDED_SELECTION_RE.test(label)),
    strongLabel,
    titleEvent: MK2_EVENT_TITLE_RE.test(eventComparable(film.title)),
    openingDate: film.openingDate || ""
  };
}

function classifyMk2Showtimes(items, start, regularEnd, specialEnd) {
  const groups = new Map();
  for (const item of items) {
    const key = item._mk2FilmKey || dedupeToken(item.filmTitle);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }

  const results = [];
  for (const group of groups.values()) {
    const specialInfo = mk2GroupSpecialInfo(group);
    for (const item of group) {
      const inRegularWindow = isWithin(item.start, start, regularEnd);
      const inSpecialWindow = specialInfo && isWithin(item.start, start, specialEnd);
      if (!inRegularWindow && !inSpecialWindow) continue;
      results.push(stripMk2InternalFields({
        ...item,
        special: Boolean(specialInfo),
        specialLabel: specialInfo?.label || "",
        specialSource: specialInfo?.source || ""
      }));
    }
  }
  return results;
}

function mk2GroupSpecialInfo(group) {
  const first = group[0] || {};
  const strongLabel = group.find((item) => item._mk2StrongLabel)?._mk2StrongLabel || "";
  if (strongLabel) {
    return {
      label: strongLabel,
      source: "MK2 evenement"
    };
  }
  if (group.some((item) => item._mk2TitleEvent)) {
    return {
      label: "Evenement MK2",
      source: "MK2 titre"
    };
  }
  if (group.some((item) => item._mk2HasExcludedLabel)) return null;

  const sessionCount = group.length;
  const dateCount = new Set(group.map((item) => item.start.slice(0, 10))).size;
  const cinemaCount = new Set(group.map((item) => item.cinemaId)).size;
  const oldEnough = isMk2OldEnoughForRepertory(first._mk2OpeningDate, group);
  const veryRare = dateCount === 1 && sessionCount <= 2 && cinemaCount <= 2;
  const sparseOneDay = dateCount === 1 && sessionCount <= 8 && cinemaCount <= 8;
  const sparseFewDays = dateCount <= 2 && sessionCount <= 4 && cinemaCount <= 2;
  if (veryRare) {
    return {
      label: oldEnough ? "Reprise MK2" : "Seance rare MK2",
      source: "MK2 rarete"
    };
  }
  if (oldEnough && (sparseOneDay || sparseFewDays)) {
    return {
      label: "Reprise MK2",
      source: "MK2 rarete"
    };
  }
  return null;
}

function isMk2OldEnoughForRepertory(openingDate, group) {
  if (!openingDate) return false;
  const openedAt = new Date(openingDate);
  if (Number.isNaN(openedAt.valueOf())) return false;
  const firstSession = new Date(group.map((item) => item.start).sort()[0]);
  if (Number.isNaN(firstSession.valueOf())) return false;
  const ageDays = (firstSession - openedAt) / 86_400_000;
  return ageDays >= MK2_REPERTORY_MIN_AGE_DAYS;
}

function stripMk2InternalFields(item) {
  const {
    _mk2FilmKey,
    _mk2Labels,
    _mk2HasExcludedLabel,
    _mk2StrongLabel,
    _mk2TitleEvent,
    _mk2OpeningDate,
    ...publicItem
  } = item;
  return publicItem;
}

function mk2Directors(film = {}) {
  const directors = (film.cast || [])
    .filter((person) => eventComparable(person.personType) === "director")
    .map((person) => cleanPeopleList(person.displayName || [person.firstName, person.lastName].filter(Boolean).join(" ")))
    .filter(Boolean);
  return uniquePeople(directors).join(", ");
}

function formatMk2Showtime(film, cinema, session, sourceInfo = {}) {
  const filmUrl = film.slug ? `https://www.mk2.com/film/${film.slug}` : "https://www.mk2.com/films";
  const version = (session.attributes || [])
    .map((attr) => attr.shortName)
    .filter((name) => ["VO", "VF", "VOST", "VOSTF", "STFR"].includes(name))
    .join(" ");

  return {
    id: `mk2-${session.id || session.sessionId}`,
    source: "MK2",
    network: "MK2",
    cinemaId: `mk2-${cinema.id || session.cinemaId || "unknown"}`,
    cinemaName: `MK2 ${cinema.name || ""}`.replace(/\s+/g, " ").trim(),
    city: titleName(cinema.city),
    postalCode: inferPostalCode([cinema.address1, cinema.address2, cinema.address].filter(Boolean).join(" ")),
    address: [cinema.address1, cinema.address2, cinema.address].filter(Boolean).join(", "),
    filmTitle: film.title,
    director: mk2Directors(film),
    genre: (film.genres || []).map((genre) => genre.name).join(", "),
    version,
    durationMin: film.runTime || null,
    start: utcToParisIso(session.showTime),
    end: film.runTime ? addMinutesIso(utcToParisIso(session.showTime), film.runTime) : "",
    bookingUrl: `${filmUrl}#sessions`,
    filmUrl,
    poster: film.graphicUrl || film.posterUrl || "",
    special: false,
    specialLabel: "",
    specialSource: "",
    _mk2FilmKey: film.slug || film.id || dedupeToken(film.title),
    _mk2Labels: sourceInfo.labels || [],
    _mk2HasExcludedLabel: Boolean(sourceInfo.hasExcludedLabel),
    _mk2StrongLabel: sourceInfo.strongLabel || "",
    _mk2TitleEvent: Boolean(sourceInfo.titleEvent),
    _mk2OpeningDate: sourceInfo.openingDate || ""
  };
}

async function mapLimit(items, limit, worker) {
  const results = [];
  let nextIndex = 0;
  const workerCount = Math.max(1, Math.min(Number(limit) || 1, items.length));
  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      const value = await worker(items[index], index);
      if (Array.isArray(value)) {
        results.push(...value);
      } else if (value !== undefined && value !== null) {
        results.push(value);
      }
    }
  }));
  return results;
}

function extractNextFlightText(html) {
  let text = "";
  let index = 0;
  while ((index = html.indexOf("self.__next_f.push(", index)) >= 0) {
    const arrayStart = html.indexOf("[", index);
    const arraySource = readBalancedArray(html, arrayStart);
    try {
      const payload = JSON.parse(arraySource);
      if (typeof payload[1] === "string") text += payload[1];
    } catch {
      // Ignore chunks that are not plain JSON arrays.
    }
    index = arrayStart + Math.max(1, arraySource.length);
  }
  return text;
}

function readBalancedArray(text, start) {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
    } else if (char === '"') {
      inString = true;
    } else if (char === "[") {
      depth += 1;
    } else if (char === "]") {
      depth -= 1;
      if (depth === 0) return text.slice(start, index + 1);
    }
  }
  return "";
}

function extractJsonObjectsStartingWith(text, marker) {
  const objects = [];
  let index = 0;
  while ((index = text.indexOf(marker, index)) >= 0) {
    const object = readBalancedJson(text, index);
    if (object) objects.push(object);
    index += Math.max(1, object?.length || marker.length);
  }
  return objects;
}

function extractJsonObjectsContaining(text, marker) {
  const objects = [];
  const seen = new Set();
  let markerIndex = 0;
  while ((markerIndex = text.indexOf(marker, markerIndex)) >= 0) {
    for (let start = markerIndex; start >= 0; start = text.lastIndexOf("{", start - 1)) {
      const object = readBalancedJson(text, start);
      if (!object || !object.includes(marker)) continue;
      if (!safeJsonParse(object)) continue;
      if (!seen.has(object)) {
        objects.push(object);
        seen.add(object);
      }
      break;
    }
    markerIndex += marker.length;
  }
  return objects;
}

function readBalancedJson(text, start) {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
    } else if (char === '"') {
      inString = true;
    } else if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(start, index + 1);
    }
  }
  return "";
}

function safeJsonParse(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function dedupe(items) {
  const map = new Map();
  for (const item of items) {
    const key = showtimeDedupeKey(item);
    if (map.has(key)) {
      map.set(key, mergeShowtime(map.get(key), item));
    } else {
      map.set(key, item);
    }
  }
  return [...map.values()];
}

function showtimeDedupeKey(item) {
  const cinema = [
    normalizeCinemaName(item.cinemaName || item.cinemaId),
    String(item.postalCode || "").trim()
  ].join("-");
  return [
    cinema,
    dedupeToken(item.filmTitle),
    normalizeIso(item.start),
    dedupeToken(item.version || item.audio)
  ].join("|");
}

function mergeShowtime(existing, next) {
  return {
    ...existing,
    genre: existing.genre || next.genre || "",
    audio: existing.audio || next.audio || "",
    durationMin: existing.durationMin || next.durationMin || null,
    end: existing.end || next.end || "",
    bookingUrl: existing.bookingUrl || next.bookingUrl || "",
    filmUrl: existing.filmUrl || next.filmUrl || "",
    poster: existing.poster || next.poster || "",
    city: existing.city || next.city || "",
    postalCode: existing.postalCode || next.postalCode || "",
    address: existing.address || next.address || "",
    director: existing.director || next.director || "",
    special: Boolean(existing.special || next.special),
    specialLabel: existing.specialLabel || next.specialLabel || "",
    specialSource: existing.specialSource || next.specialSource || ""
  };
}

function dedupeToken(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function cleanHtml(value) {
  return decodeAttr(String(value || "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim());
}

function cleanPeopleList(value) {
  return cleanHtml(value)
    .replace(/^de\s+/i, "")
    .replace(/\s*,\s*/g, ", ")
    .replace(/\s+/g, " ")
    .trim();
}

function personName(person = {}) {
  return cleanPeopleList(person.displayName || [person.firstName, person.lastName].filter(Boolean).join(" "));
}

function uniquePeople(values) {
  const seen = new Set();
  const people = [];
  for (const value of values) {
    const name = cleanPeopleList(value);
    const key = eventComparable(name);
    if (!name || seen.has(key)) continue;
    seen.add(key);
    people.push(name);
  }
  return people;
}

function eventComparable(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function decodeAttr(value) {
  return String(value || "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&Eacute;/g, "E")
    .replace(/&eacute;/g, "e")
    .replace(/&Ecirc;/g, "E")
    .replace(/&ecirc;/g, "e")
    .replace(/&Ccedil;/g, "C")
    .replace(/&ccedil;/g, "c")
    .replace(/&Ocirc;/g, "O")
    .replace(/&ocirc;/g, "o")
    .replace(/&OElig;/g, "Oe")
    .replace(/&oelig;/g, "oe")
    .replace(/&Egrave;/g, "E")
    .replace(/&egrave;/g, "e")
    .replace(/&Agrave;/g, "A")
    .replace(/&agrave;/g, "a")
    .replace(/&Icirc;/g, "I")
    .replace(/&icirc;/g, "i")
    .replace(/&Uuml;/g, "U")
    .replace(/&uuml;/g, "u")
    .replace(/&rsquo;/g, "'")
    .replace(/&lsquo;/g, "'")
    .replace(/&rdquo;/g, '"')
    .replace(/&ldquo;/g, '"')
    .replace(/&hellip;/g, "...")
    .trim();
}

function normalizeCinemaName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(trois|three)\b/g, "3")
    .replace(/\b(quatre|four)\b/g, "4")
    .replace(/\b(cinq|five)\b/g, "5")
    .replace(/\b(sept|seven)\b/g, "7")
    .replace(/\b(cinema|cine|le|la|les|l|de|du|des|d|ugc|mk2)\b/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function slug(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function titleName(value) {
  return String(value || "").toLocaleLowerCase("fr-FR").replace(/(^|\s|-|')(\p{L})/gu, (_, sep, letter) => `${sep}${letter.toLocaleUpperCase("fr-FR")}`);
}

function isIdfPostal(value) {
  const postal = String(value || "");
  return IDF_POSTAL_PREFIXES.some((prefix) => postal.startsWith(prefix));
}

function isWithin(value, start, end) {
  if (!value) return false;
  const date = new Date(normalizeIso(value));
  return !Number.isNaN(date.valueOf()) && date >= start && date < end;
}

function isDateKeyWithinDays(value, daysAhead) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return false;
  const start = new Date();
  const end = addDays(start, daysAhead + 1);
  const date = new Date(`${value}T12:00:00${parisOffsetForLocalDate(value)}`);
  return date >= start && date < end;
}

function normalizeIso(value) {
  if (!value) return "";
  return String(value).replace(/([+-]\d{2})(\d{2})$/, "$1:$2");
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function dateRange(daysAhead) {
  const dates = [];
  const today = new Date();
  for (let index = 0; index <= daysAhead; index += 1) {
    dates.push(addDays(today, index));
  }
  return dates;
}

function formatUgcDate(date) {
  const formatter = new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  });
  return formatter.format(date);
}

function localIsoFromFrenchDate(date, time) {
  const [day, month, year] = date.split("/");
  const isoDate = `${year}-${month}-${day}`;
  return `${isoDate}T${time}:00${parisOffsetForLocalDate(isoDate)}`;
}

function localIsoFromFrenchText(value) {
  const text = eventComparable(value).replace(/\s+/g, " ").trim();
  const match = text.match(/^(\d{1,2})\s+([a-z]+)\s+(\d{4})\s+([0-2]?\d:[0-5]\d)$/);
  if (!match) return "";
  const month = frenchMonthNumber(match[2]);
  if (!month) return "";
  const isoDate = [
    match[3],
    String(month).padStart(2, "0"),
    String(Number(match[1])).padStart(2, "0")
  ].join("-");
  const [hour, minute] = match[4].split(":").map((part) => String(Number(part)).padStart(2, "0"));
  return `${isoDate}T${hour}:${minute}:00${parisOffsetForLocalDate(isoDate)}`;
}

function frenchMonthNumber(value) {
  return {
    janvier: 1,
    fevrier: 2,
    mars: 3,
    avril: 4,
    mai: 5,
    juin: 6,
    juillet: 7,
    aout: 8,
    septembre: 9,
    octobre: 10,
    novembre: 11,
    decembre: 12
  }[eventComparable(value)] || 0;
}

function utcToParisIso(value) {
  const date = new Date(value);
  const parts = new Intl.DateTimeFormat("fr-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).formatToParts(date).reduce((acc, part) => {
    acc[part.type] = part.value;
    return acc;
  }, {});
  const localDate = `${parts.year}-${parts.month}-${parts.day}`;
  return `${localDate}T${parts.hour}:${parts.minute}:${parts.second}${parisOffsetForLocalDate(localDate)}`;
}

function addMinutesIso(value, minutes) {
  const date = new Date(value);
  date.setMinutes(date.getMinutes() + Number(minutes || 0));
  return utcToParisIso(date.toISOString());
}

function inferPostalCode(value) {
  return (String(value || "").match(/\b(75|77|78|91|92|93|94|95)\d{3}\b/) || [])[0] || "";
}

function inferCity(name) {
  const text = String(name || "").toLowerCase();
  if (text.includes("issy")) return "Issy-les-Moulineaux";
  if (text.includes("rosny")) return "Rosny-sous-Bois";
  if (text.includes("creteil")) return "Creteil";
  if (text.includes("noisy")) return "Noisy-le-Grand";
  if (text.includes("cergy")) return "Cergy";
  if (text.includes("versailles")) return "Versailles";
  if (text.includes("plaisir")) return "Plaisir";
  if (text.includes("meaux")) return "Meaux";
  return "Paris";
}

function parisOffsetForLocalDate(isoDate) {
  const [year, month, day] = isoDate.split("-").map(Number);
  const utcNoon = Date.UTC(year, month - 1, day, 12, 0, 0);
  const startDst = lastSundayUtc(year, 2, 1);
  const endDst = lastSundayUtc(year, 9, 1);
  return utcNoon >= startDst && utcNoon < endDst ? "+02:00" : "+01:00";
}

function lastSundayUtc(year, monthIndex, hourUtc) {
  const date = new Date(Date.UTC(year, monthIndex + 1, 0, hourUtc, 0, 0));
  date.setUTCDate(date.getUTCDate() - date.getUTCDay());
  return date.getTime();
}

function absolutizeUgc(value) {
  if (!value) return "";
  if (/^https?:\/\//.test(value)) return value;
  return `https://www.ugc.fr/${value.replace(/^\.?\//, "")}`;
}

if (isCliRun()) {
  main().catch((error) => {
    console.error(error);
    if (globalThis.process) {
      globalThis.process.exitCode = 1;
    } else {
      throw error;
    }
  });
}

function isCliRun() {
  const argvEntry = globalThis.process?.argv?.[1];
  return Boolean(argvEntry && import.meta.url === pathToFileURL(argvEntry).href);
}

export {
  extractJsonObjectsContaining,
  extractJsonObjectsStartingWith,
  extractNextFlightText,
  parseMk2Flight,
  parseUgcHtml,
  readBalancedArray,
  readBalancedJson
};
