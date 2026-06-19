import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT_FILE = join(ROOT, "data", "showtimes.json");
const ENV = globalThis.process?.env || {};
const DAYS_AHEAD = Number(ENV.DAYS_AHEAD || 21);
const MAX_UGC_CINEMAS = Number(ENV.MAX_UGC_CINEMAS || 32);
const REQUEST_TIMEOUT_MS = Number(ENV.REQUEST_TIMEOUT_MS || 15_000);
const UGC_CONCURRENCY = Number(ENV.UGC_CONCURRENCY || 8);
const MK2_CONCURRENCY = Number(ENV.MK2_CONCURRENCY || 6);

const IDF_POSTAL_PREFIXES = ["75", "77", "78", "91", "92", "93", "94", "95"];
const UGC_IDF_IDS = new Set([
  10, 12, 7, 14, 15, 13, 4, 11, 5, 9, 37, 20, 59, 18, 38, 21, 19, 16, 17,
  43, 44, 6, 40, 41, 55, 47, 48, 49, 54, 39
]);

async function main() {
  const generatedAt = new Date().toISOString();
  const partnerCatalog = await fetchUgcAcceptedCinemas();
  const [independent, ugc, mk2] = await Promise.allSettled([
    fetchIndependentPartnerShowtimes(partnerCatalog),
    fetchUgcShowtimes(),
    fetchMk2Showtimes()
  ]);

  const showtimes = [
    ...settledValue(independent, "DataCinesIndes"),
    ...settledValue(ugc, "UGC"),
    ...settledValue(mk2, "MK2")
  ];

  const deduped = dedupe(showtimes)
    .filter((item) => item.start && item.filmTitle && item.cinemaName)
    .sort((a, b) => new Date(a.start) - new Date(b.start));

  await mkdir(dirname(OUT_FILE), { recursive: true });
  await writeFile(OUT_FILE, `${JSON.stringify({
    generatedAt,
    timezone: "Europe/Paris",
    scope: "Ile-de-France",
    daysAhead: DAYS_AHEAD,
    sources: [
      "UGC accepted cinemas: https://www.ugc.fr/cinemas-acceptant-ui.html",
      "Independent cinema API: https://datacinesindes.fr/data-fair/api/v1/datasets/programmation-cinemas",
      "UGC showings: https://www.ugc.fr/showingsCinemaAjaxAction!getShowingsForCinemaPage.action",
      "MK2 pages: https://www.mk2.com/salles"
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

async function fetchText(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
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
    if (!response.ok) throw new Error(`${response.status} ${response.statusText} for ${url}`);
    return response.text();
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error(`Timed out after ${REQUEST_TIMEOUT_MS}ms for ${url}`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
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
  const partnerKeys = new Set(
    partnerCatalog
      .filter((item) => item.network === "PARTNER")
      .map((item) => item.normalized)
  );
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
    .filter((row) => partnerKeys.has(normalizeCinemaName(row.cinenom)))
    .map((row) => ({
      id: `partner-${row.showid || row._id}`,
      source: "DataCinesIndes",
      network: "PARTNER",
      cinemaId: `partner-${slug(row.cinenom)}-${row.cineid || ""}`,
      cinemaName: titleName(row.cinenom),
      city: titleName(row.cineville),
      postalCode: String(row.cinecp || ""),
      address: row.cineadresse || "",
      filmTitle: titleName(row.filmtitle),
      genre: row.filmgenre || "",
      version: row.filmversion || "",
      audio: row.filmaudio || "",
      durationMin: row.filmduration ? Math.round(Number(row.filmduration) / 60) : null,
      start: normalizeIso(row.showstart),
      end: normalizeIso(row.showend),
      bookingUrl: row.showurl || "",
      filmUrl: row.showurl || "",
      poster: row.filmposter || ""
    }));
}

async function fetchUgcShowtimes() {
  const list = await fetchJson("https://www.ugc.fr/inscriptionNewsletterAction!getCinemaList.action");
  const cinemas = (list.cinemas || [])
    .filter((cinema) => UGC_IDF_IDS.has(Number(cinema.id)))
    .slice(0, MAX_UGC_CINEMAS);

  const dates = dateRange(DAYS_AHEAD);
  const requests = cinemas.flatMap((cinema) => dates.map((date) => ({ cinema, date })));

  return mapLimit(requests, UGC_CONCURRENCY, async ({ cinema, date }) => {
    const url = `https://www.ugc.fr/showingsCinemaAjaxAction!getShowingsForCinemaPage.action?cinemaId=${encodeURIComponent(cinema.id)}&date=${encodeURIComponent(formatUgcDate(date))}&page=30007`;
    try {
      const html = await fetchText(url);
      return parseUgcHtml(html, cinema);
    } catch (error) {
      console.warn(`UGC ${cinema.name} ${date.toISOString().slice(0, 10)} failed: ${error.message}`);
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

async function fetchMk2Showtimes() {
  const indexHtml = await fetchText("https://www.mk2.com/salles");
  const slugs = [...new Set([...indexHtml.matchAll(/href="\/salle\/([^"]+)"/g)].map((match) => match[1]))]
    .filter((item) => item.startsWith("mk2-"));
  const start = new Date();
  const end = addDays(start, DAYS_AHEAD + 1);
  return mapLimit(slugs, MK2_CONCURRENCY, async (complexSlug) => {
    const results = [];
    try {
      const html = await fetchText(`https://www.mk2.com/salle/${complexSlug}`);
      const flight = extractNextFlightText(html);
      const blocks = extractJsonObjectsStartingWith(flight, '{"cinema":');
      for (const block of blocks) {
        const item = safeJsonParse(block);
        if (!item?.film || !item?.cinema || !Array.isArray(item.sessions)) continue;
        for (const session of item.sessions) {
          if (!isWithin(session.showTime, start, end)) continue;
          results.push({
            id: `mk2-${session.id}`,
            source: "MK2",
            network: "MK2",
            cinemaId: `mk2-${item.cinema.id}`,
            cinemaName: `MK2 ${item.cinema.name}`.replace(/\s+/g, " ").trim(),
            city: titleName(item.cinema.city),
            postalCode: inferPostalCode(item.cinema.address2),
            address: [item.cinema.address1, item.cinema.address2].filter(Boolean).join(", "),
            filmTitle: item.film.title,
            genre: (item.film.genres || []).map((genre) => genre.name).join(", "),
            version: (session.attributes || []).map((attr) => attr.shortName).filter((name) => name === "VO" || name === "VF" || name === "VOST" || name === "STFR").join(" ") || "",
            durationMin: item.film.runTime || null,
            start: utcToParisIso(session.showTime),
            end: item.film.runTime ? addMinutesIso(utcToParisIso(session.showTime), item.film.runTime) : "",
            bookingUrl: `https://www.mk2.com/film/${item.film.slug || ""}#sessions`,
            filmUrl: `https://www.mk2.com/film/${item.film.slug || ""}`,
            poster: item.film.graphicUrl || ""
          });
        }
      }
    } catch (error) {
      console.warn(`MK2 ${complexSlug} failed: ${error.message}`);
    }
    return results;
  });
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
    const key = item.id || `${item.source}|${item.cinemaName}|${item.filmTitle}|${item.start}`;
    if (!map.has(key)) map.set(key, item);
  }
  return [...map.values()];
}

function cleanHtml(value) {
  return decodeAttr(String(value || "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim());
}

function decodeAttr(value) {
  return String(value || "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&Eacute;/g, "E")
    .replace(/&eacute;/g, "e")
    .replace(/&Ccedil;/g, "C")
    .replace(/&ccedil;/g, "c")
    .replace(/&Ocirc;/g, "O")
    .replace(/&ocirc;/g, "o")
    .replace(/&Egrave;/g, "E")
    .replace(/&egrave;/g, "e")
    .replace(/&Agrave;/g, "A")
    .replace(/&agrave;/g, "a")
    .replace(/&icirc;/g, "i")
    .replace(/&rsquo;/g, "'")
    .replace(/&hellip;/g, "...")
    .trim();
}

function normalizeCinemaName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(cinema|cine|le|la|les|l|ugc|mk2)\b/g, "")
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
  extractJsonObjectsStartingWith,
  extractNextFlightText,
  parseUgcHtml,
  readBalancedArray,
  readBalancedJson
};
