"use strict";

const DATA_URL = "data/showtimes.json";
const OFFLINE_CACHE_NAME = "cine-illimite-idf-v2";
const OFFLINE_DB_NAME = "cine-illimite-idf";
const OFFLINE_DB_STORE = "showtimes";
const OFFLINE_DB_KEY = "latest";
const PREPARED_DATA_VERSION = 1;
const OFFSET_DATETIME_RE = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?[+-]\d{2}:\d{2}$/;
const PARIS_DATE_FORMATTER = new Intl.DateTimeFormat("fr-CA", {
  timeZone: "Europe/Paris",
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
});
const PARIS_TIME_FORMATTER = new Intl.DateTimeFormat("fr-FR", {
  timeZone: "Europe/Paris",
  hour: "2-digit",
  minute: "2-digit"
});
const PARIS_TIME_PARTS_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Paris",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23"
});
const LANGUAGE_STORAGE_KEY = "cine-illimite-language";
const COPY = {
  fr: {
    pageDescription: "Agenda mobile des séances UGC, MK2 et cinémas partenaires UGC/MK2 Illimité en Île-de-France.",
    loading: "Chargement...",
    regionScope: "Île-de-France",
    agenda: "Agenda",
    specials: "Spéciales",
    zone: "Zone",
    allIdf: "Toute l'Île-de-France",
    cinema: "Cinéma",
    allCinemas: "Toutes les salles",
    fromTime: "À partir de",
    timeFilterAria: "Afficher les séances à partir de cette heure",
    search: "Recherche",
    searchPlaceholder: "Film, cinéma, ville",
    all: "Tous",
    partners: "Partenaires",
    clear: "Effacer",
    footerNote: "Les liens ouvrent les pages officielles de réservation quand elles sont disponibles.",
    tmdbAttribution: "Ce produit utilise TMDB sans être approuvé ni certifié par TMDB.",
    refresh: "Recharger les données",
    close: "Fermer",
    switchLanguage: "Passer en anglais",
    availableDates: "Dates disponibles",
    filters: "Filtres des séances",
    view: "Vue",
    networks: "Réseaux",
    unknownZone: "Zone inconnue",
    partner: "Partenaire",
    genericCinema: "Cinéma",
    sessionsShown: (count) => `${count} séance${count > 1 ? "s" : ""} affichée${count > 1 ? "s" : ""}`,
    loadedScope: (count) => `${count} séances chargées`,
    specialScope: (specials, total) => `${specials} séances spéciales · ${total} chargées`,
    updated: (value) => `MAJ ${value}`,
    unknownUpdate: "MAJ inconnue",
    specialScreenings: "Séances spéciales",
    noDate: "Aucune date",
    noSessions: "Aucune séance trouvée",
    emptySpecial: "Change la date, la zone ou le cinéma. Cette vue garde seulement les projections avec un label événementiel.",
    emptyAgenda: "Change la date, la zone, le cinéma ou le réseau. Les futures dates apparaissent seulement quand les cinémas les publient.",
    morning: "Matin",
    afternoon: "Après-midi",
    evening: "Soir",
    endsAt: (value) => `fin ${value}`,
    specialBadge: "Spéciale",
    reserve: "Réserver",
    viewBooking: "Voir",
    details: "Détails",
    directedBy: (name) => `de ${name}`,
    schedule: "Horaire",
    direction: "Réalisation",
    area: "Zone",
    version: "Version",
    special: "Spéciale",
    genre: "Genre",
    openBooking: "Ouvrir la réservation"
  },
  en: {
    pageDescription: "Mobile showtime guide for UGC, MK2 and UGC/MK2 Illimité partner cinemas across Île-de-France.",
    loading: "Loading...",
    regionScope: "Île-de-France",
    agenda: "Schedule",
    specials: "Specials",
    zone: "Area",
    allIdf: "All Île-de-France",
    cinema: "Cinema",
    allCinemas: "All cinemas",
    fromTime: "From",
    timeFilterAria: "Show screenings starting from this time",
    search: "Search",
    searchPlaceholder: "Film, cinema, city",
    all: "All",
    partners: "Partners",
    clear: "Clear",
    footerNote: "Links open official booking pages when available.",
    tmdbAttribution: "This product uses the TMDB API but is not endorsed or certified by TMDB.",
    refresh: "Refresh data",
    close: "Close",
    switchLanguage: "Passer en français",
    availableDates: "Available dates",
    filters: "Showtime filters",
    view: "View",
    networks: "Networks",
    unknownZone: "Unknown area",
    partner: "Partner",
    genericCinema: "Cinema",
    sessionsShown: (count) => `${count} session${count === 1 ? "" : "s"} shown`,
    loadedScope: (count) => `${count} sessions loaded`,
    specialScope: (specials, total) => `${specials} special sessions · ${total} loaded`,
    updated: (value) => `Updated ${value}`,
    unknownUpdate: "Update unknown",
    specialScreenings: "Special screenings",
    noDate: "No date available",
    noSessions: "No screenings found",
    emptySpecial: "Try another date, area or cinema. This view only includes event, repertory and rare screenings.",
    emptyAgenda: "Try another date, area, cinema or network. Future dates appear when cinemas publish them.",
    morning: "Morning",
    afternoon: "Afternoon",
    evening: "Evening",
    endsAt: (value) => `ends ${value}`,
    specialBadge: "Special",
    reserve: "Book",
    viewBooking: "View",
    details: "Details",
    directedBy: (name) => `by ${name}`,
    schedule: "Schedule",
    direction: "Director",
    area: "Area",
    version: "Version",
    special: "Special",
    genre: "Genre",
    openBooking: "Open booking"
  }
};

function registerOfflineCache() {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch((error) => {
      console.warn("Offline cache could not be registered.", error);
    });
  });
}

const ZONES = [
  ["75", "Paris (75)"],
  ["77", "Seine-et-Marne (77)"],
  ["78", "Yvelines (78)"],
  ["91", "Essonne (91)"],
  ["92", "Hauts-de-Seine (92)"],
  ["93", "Seine-Saint-Denis (93)"],
  ["94", "Val-de-Marne (94)"],
  ["95", "Val-d'Oise (95)"],
  ["unknown", "Zone inconnue"]
];

const ZONE_LABELS = Object.fromEntries(ZONES);

const ZONE_NAME_RULES = [
  ["77", ["meaux", "varennes"]],
  ["78", ["saint germain", "poissy", "velizy", "parly", "sqy", "montigny", "cyrano", "plaisir", "jean marais", "chesnay", "versailles"]],
  ["91", ["le central", "central cinema", "mennecy", "orsay", "les ulis"]],
  ["92", ["la defense", "issy", "abel gance", "courbevoie", "rueil", "suresnes", "capitole", "3 pierrots", "saint cloud"]],
  ["93", ["rosny", "o parinor", "aulnay", "noisy", "le studio", "louis daquin", "le bijou", "saint-denis", "saint denis", "saint ouen", "espace 1789", "l ecran", "cinhoche", "cin hoche", "bagnolet", "le blanc mesnil"]],
  ["94", ["creteil", "bords de marne", "4 delta", "saint maur", "vitry", "roberspierre", "fontenay"]],
  ["95", ["cergy", "enghien", "antares", "vaureal", "montmorency"]],
  ["75", ["paris", "odeon", "opera", "bercy", "les halles", "maillot", "montparnasse", "gobelins", "danton", "rotonde", "roxane", "bastille", "bibliotheque", "beaubourg", "gambetta", "nation", "quai de seine", "quai de loire", "parnasse"]]
];

const SAMPLE_DATA = {
  generatedAt: "2026-06-19T10:30:00+02:00",
  timezone: "Europe/Paris",
  scope: "Ile-de-France",
  sources: ["Sample bundled data"],
  showtimes: [
    {
      id: "ugc-330171825910",
      source: "UGC",
      network: "UGC",
      cinemaId: "ugc-10",
      cinemaName: "UGC Ciné Cité Les Halles",
      city: "Paris",
      postalCode: "75001",
      filmTitle: "Toy Story 5",
      director: "Andrew Stanton",
      genre: "Famille, Comedie, Aventure, Animation",
      version: "VOSTF",
      start: "2026-06-19T12:05:00+02:00",
      end: "2026-06-19T14:07:00+02:00",
      bookingUrl: "https://www.ugc.fr/reservationSeances.html?id=330171825910",
      filmUrl: "https://www.ugc.fr/film_toy_story_5_17480.html?cinemaId=10"
    },
    {
      id: "partner-36724",
      source: "DataCinesIndes",
      network: "PARTNER",
      cinemaId: "partner-le-grand-action",
      cinemaName: "Le Grand Action",
      city: "Paris",
      postalCode: "75005",
      filmTitle: "Disclosure Day",
      director: "Val Guest",
      genre: "Science fiction, Thriller",
      version: "VO",
      start: "2026-06-19T14:30:00+02:00",
      end: "2026-06-19T16:55:00+02:00",
      bookingUrl: "https://pariscinemagrandaction.cine.boutique/media/2389?showId=36724"
    },
    {
      id: "mk2-0004-135555",
      source: "MK2",
      network: "MK2",
      cinemaId: "mk2-0004",
      cinemaName: "MK2 Bibliothèque",
      city: "Paris",
      postalCode: "75013",
      filmTitle: "Projet Dernière Chance",
      director: "Joe Carnahan",
      genre: "Action, Aventure, Science fiction",
      version: "VO",
      start: "2026-06-20T10:30:00+02:00",
      bookingUrl: "https://www.mk2.com/film/projet-derniere-chance#sessions"
    },
    {
      id: "partner-32858",
      source: "DataCinesIndes",
      network: "PARTNER",
      cinemaId: "partner-le-champo",
      cinemaName: "Le Champo",
      city: "Paris",
      postalCode: "75005",
      filmTitle: "Riz amer",
      director: "Giuseppe De Santis",
      genre: "Drame",
      version: "VO",
      start: "2026-06-19T12:00:00+02:00",
      bookingUrl: "https://pariscinemalechampo.cine.boutique/media/1391?showId=32858"
    },
    {
      id: "mk2-0005-37786",
      source: "MK2",
      network: "MK2",
      cinemaId: "mk2-0005",
      cinemaName: "MK2 Bibliothèque x Centre Pompidou",
      city: "Paris",
      postalCode: "75013",
      filmTitle: "Rencontre - Vivian Ostrovksy",
      director: "Vivian Ostrovsky",
      genre: "Documentaire",
      version: "VF",
      start: "2026-06-22T19:30:00+02:00",
      bookingUrl: "https://www.mk2.com/film/rencontre-vivian-ostrovksy#sessions",
      special: true,
      specialLabel: "Evenement MK2",
      specialSource: "MK2 titre"
    }
  ]
};

const state = {
  data: SAMPLE_DATA,
  view: initialView(),
  language: readLanguagePreference(),
  selectedDate: "",
  selectedZone: "all",
  selectedCinema: "all",
  selectedNetwork: "all",
  startTime: "",
  search: ""
};

const els = {
  refreshButton: document.getElementById("refreshButton"),
  summaryCount: document.getElementById("summaryCount"),
  summaryScope: document.getElementById("summaryScope"),
  updatedAt: document.getElementById("updatedAt"),
  dateRail: document.getElementById("dateRail"),
  viewTabs: document.querySelectorAll("[data-view]"),
  languageToggle: document.getElementById("languageToggle"),
  zoneFilter: document.getElementById("zoneFilter"),
  cinemaFilter: document.getElementById("cinemaFilter"),
  timeFilter: document.getElementById("timeFilter"),
  searchInput: document.getElementById("searchInput"),
  sectionKicker: document.getElementById("sectionKicker"),
  selectedDateTitle: document.getElementById("selectedDateTitle"),
  agendaList: document.getElementById("agendaList"),
  clearFilters: document.getElementById("clearFilters"),
  detailsDialog: document.getElementById("detailsDialog"),
  detailsContent: document.getElementById("detailsContent"),
  closeDialog: document.getElementById("closeDialog")
};

function readLanguagePreference() {
  try {
    return localStorage.getItem(LANGUAGE_STORAGE_KEY) === "en" ? "en" : "fr";
  } catch {
    return "fr";
  }
}

function t(key, ...args) {
  const value = COPY[state.language]?.[key] ?? COPY.fr[key] ?? key;
  return typeof value === "function" ? value(...args) : value;
}

function currentLocale() {
  return state.language === "en" ? "en-GB" : "fr-FR";
}

function applyLanguage() {
  document.documentElement.lang = state.language;
  document.querySelectorAll("[data-i18n]").forEach((element) => {
    element.textContent = t(element.dataset.i18n);
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((element) => {
    element.placeholder = t(element.dataset.i18nPlaceholder);
  });
  document.querySelectorAll("[data-i18n-aria-label]").forEach((element) => {
    element.setAttribute("aria-label", t(element.dataset.i18nAriaLabel));
  });
  document.getElementById("metaDescription")?.setAttribute("content", t("pageDescription"));
  document.querySelector(".filters")?.setAttribute("aria-label", t("filters"));
  document.querySelector(".view-switch")?.setAttribute("aria-label", t("view"));
  document.querySelector(".network-row")?.setAttribute("aria-label", t("networks"));
  els.dateRail.setAttribute("aria-label", t("availableDates"));
  els.timeFilter.setAttribute("aria-label", t("timeFilterAria"));
  els.languageToggle.textContent = state.language === "fr" ? "EN" : "FR";
  els.languageToggle.setAttribute("aria-label", t("switchLanguage"));
}

function parseDate(value) {
  return new Date(value);
}

function offsetDateTimeParts(value) {
  const match = OFFSET_DATETIME_RE.exec(String(value || ""));
  if (!match) return null;
  const hours = Number(match[2]);
  const minutes = Number(match[3]);
  return {
    date: match[1],
    time: `${match[2]}:${match[3]}`,
    minutes: hours * 60 + minutes
  };
}

function dateKey(value) {
  return offsetDateTimeParts(value)?.date || PARIS_DATE_FORMATTER.format(parseDate(value));
}

function formatTime(value) {
  return offsetDateTimeParts(value)?.time || PARIS_TIME_FORMATTER.format(parseDate(value));
}

function minutesSinceMidnight(value) {
  const offsetParts = offsetDateTimeParts(value);
  if (offsetParts) return offsetParts.minutes;
  const parts = PARIS_TIME_PARTS_FORMATTER.formatToParts(parseDate(value));
  const hours = Number(parts.find((part) => part.type === "hour")?.value || 0);
  const minutes = Number(parts.find((part) => part.type === "minute")?.value || 0);
  return hours * 60 + minutes;
}

function timeValueToMinutes(value) {
  const [hours, minutes] = String(value || "").split(":").map(Number);
  return Number.isInteger(hours) && Number.isInteger(minutes) ? hours * 60 + minutes : null;
}

function formatDateTitle(key) {
  const date = new Date(`${key}T12:00:00+02:00`);
  return new Intl.DateTimeFormat(currentLocale(), {
    timeZone: "Europe/Paris",
    weekday: "long",
    day: "numeric",
    month: "long"
  }).format(date);
}

function formatShortDay(key) {
  const date = new Date(`${key}T12:00:00+02:00`);
  return {
    day: new Intl.DateTimeFormat(currentLocale(), { timeZone: "Europe/Paris", weekday: "short" }).format(date).replace(".", ""),
    date: new Intl.DateTimeFormat(currentLocale(), { timeZone: "Europe/Paris", day: "2-digit", month: "short" }).format(date).replace(".", "")
  };
}

function normalized(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function zoneKeyForShowtime(item) {
  const postal = String(item.postalCode || "").match(/\b(75|77|78|91|92|93|94|95)\d{3}\b/);
  if (postal) return postal[1];

  const haystack = normalized([
    item.cinemaName,
    item.city,
    item.address,
    item.bookingUrl
  ].filter(Boolean).join(" "));
  for (const [zoneKey, terms] of ZONE_NAME_RULES) {
    if (terms.some((term) => haystack.includes(term))) return zoneKey;
  }
  return "unknown";
}

function zoneLabel(zoneKey) {
  return zoneKey === "unknown" ? t("unknownZone") : ZONE_LABELS[zoneKey] || t("unknownZone");
}

function locationLabel(item) {
  if (item.postalCode) return [item.postalCode, item.city].filter(Boolean).join(" ");
  return zoneLabel(item.zoneKey);
}

function networkLabel(network) {
  if (network === "PARTNER") return t("partner");
  return network || t("genericCinema");
}

function initialView() {
  return window.location.hash === "#speciales" ? "special" : "agenda";
}

function showtimesForView() {
  if (state.view === "special") {
    return state.data.showtimes.filter((item) => item.special);
  }
  return state.data.showtimes;
}

function versionLabel(version) {
  const value = String(version || "").toUpperCase();
  if (value.includes("ORIGINAL") && value.includes("LOCAL")) return "VO/VF";
  if (value.includes("ORIGINAL") || value === "VOSTF" || value === "VO") return "VO";
  if (value.includes("LOCAL") || value === "VF") return "VF";
  return value || "Version";
}

function enrichShowtime(showtime, zoneByCinema) {
  const cinemaKey = showtime.cinemaId || `${showtime.cinemaName}|${showtime.postalCode || ""}`;
  let zoneKey = zoneByCinema.get(cinemaKey);
  if (!zoneKey) {
    zoneKey = zoneKeyForShowtime(showtime);
    zoneByCinema.set(cinemaKey, zoneKey);
  }
  const offsetStart = offsetDateTimeParts(showtime.start);
  return {
    ...showtime,
    dateKey: offsetStart?.date || dateKey(showtime.start),
    time: offsetStart?.time || formatTime(showtime.start),
    startMinutes: offsetStart?.minutes ?? minutesSinceMidnight(showtime.start),
    sortTime: Date.parse(showtime.start),
    versionShort: versionLabel(showtime.version),
    poster: normalizePosterUrl(showtime.poster),
    zoneKey
  };
}

let hasDisplayedData = false;
let activeRefresh = null;

function prepareShowtimesData(json) {
  const normalizedData = normalizeShowtimesData(json);
  if (normalizedData.preparedDataVersion === PREPARED_DATA_VERSION) return normalizedData;
  const zoneByCinema = new Map();
  return {
    ...normalizedData,
    preparedDataVersion: PREPARED_DATA_VERSION,
    showtimes: normalizedData.showtimes
      .filter((item) => item && item.start && item.filmTitle && item.cinemaName)
      .map((item) => enrichShowtime(item, zoneByCinema))
      .sort((a, b) => a.sortTime - b.sortTime)
  };
}

function displayShowtimesData(json) {
  state.data = prepareShowtimesData(json);
  hasDisplayedData = true;
  initializeFilters();
  render();
  return state.data;
}

async function refreshData(options = {}) {
  if (activeRefresh) return activeRefresh;
  activeRefresh = (async () => {
    try {
      const response = await fetch(`${DATA_URL}?v=${Date.now()}`, { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const responseForCache = response.clone();
      const json = normalizeShowtimesData(await response.json());
      const isCurrent = hasDisplayedData && json.generatedAt && json.generatedAt === state.data.generatedAt;
      const preparedData = isCurrent ? state.data : displayShowtimesData(json);
      void Promise.all([
        saveShowtimesForOffline(responseForCache),
        saveShowtimesInDatabase(preparedData)
      ]);
    } catch (error) {
      if (options.showFallback && !hasDisplayedData) displayShowtimesData(SAMPLE_DATA);
      console.warn(hasDisplayedData
        ? "Fresh showtimes could not be loaded; keeping the displayed snapshot."
        : "Fresh showtimes and the offline snapshot could not be loaded.", error);
    }
  })();

  try {
    await activeRefresh;
  } finally {
    activeRefresh = null;
  }
}

async function startApp() {
  const cachedData = await loadCachedShowtimes();
  if (cachedData) {
    const preparedData = displayShowtimesData(cachedData);
    void saveShowtimesInDatabase(preparedData);
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
  await refreshData({ showFallback: !cachedData });
}

function normalizeShowtimesData(json) {
  return {
    ...(json || {}),
    showtimes: Array.isArray(json?.showtimes) ? json.showtimes : []
  };
}

function showtimesCacheRequest() {
  return new Request(new URL(DATA_URL, window.location.href).href);
}

async function saveShowtimesForOffline(response) {
  if (!("caches" in window)) return;
  try {
    const cache = await caches.open(OFFLINE_CACHE_NAME);
    await cache.put(showtimesCacheRequest(), response);
  } catch (error) {
    console.warn("Offline showtimes cache could not be saved.", error);
  }
}

async function loadCachedShowtimes() {
  const fromDatabase = await loadShowtimesFromDatabase();
  return fromDatabase || loadShowtimesFromCache();
}

async function loadShowtimesFromCache() {
  if (!("caches" in window)) return null;
  try {
    const cache = await caches.open(OFFLINE_CACHE_NAME);
    const response = await cache.match(showtimesCacheRequest(), { ignoreSearch: true })
      || await cache.match(DATA_URL, { ignoreSearch: true });
    if (!response?.ok) return null;
    return normalizeShowtimesData(await response.json());
  } catch (error) {
    console.warn("Offline showtimes cache could not be read.", error);
    return null;
  }
}

function openOfflineDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(OFFLINE_DB_NAME, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(OFFLINE_DB_STORE)) {
        database.createObjectStore(OFFLINE_DB_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Could not open offline database."));
  });
}

function completeTransaction(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error || new Error("Offline database transaction failed."));
    transaction.onabort = () => reject(transaction.error || new Error("Offline database transaction was aborted."));
  });
}

async function saveShowtimesInDatabase(json) {
  if (!("indexedDB" in window)) return;
  let database;
  try {
    database = await openOfflineDatabase();
    const transaction = database.transaction(OFFLINE_DB_STORE, "readwrite");
    transaction.objectStore(OFFLINE_DB_STORE).put({ data: json, savedAt: new Date().toISOString() }, OFFLINE_DB_KEY);
    await completeTransaction(transaction);
  } catch (error) {
    console.warn("Offline showtimes database could not be saved.", error);
  } finally {
    database?.close();
  }
}

async function loadShowtimesFromDatabase() {
  if (!("indexedDB" in window)) return null;
  let database;
  try {
    database = await openOfflineDatabase();
    const transaction = database.transaction(OFFLINE_DB_STORE, "readonly");
    const request = transaction.objectStore(OFFLINE_DB_STORE).get(OFFLINE_DB_KEY);
    const record = await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Offline showtimes database could not be read."));
    });
    return record?.data ? normalizeShowtimesData(record.data) : null;
  } catch (error) {
    console.warn("Offline showtimes database could not be read.", error);
    return null;
  } finally {
    database?.close();
  }
}

function initializeFilters() {
  ensureSelectedDate();
  renderZoneFilter();
  renderCinemaFilter();
}

function ensureSelectedDate() {
  const dates = uniqueDates();
  const today = dateKey(new Date().toISOString());
  if (!dates.includes(state.selectedDate)) {
    state.selectedDate = dates.find((key) => key >= today) || dates[0] || "";
  }
}

function uniqueDates() {
  return [...new Set(showtimesForView().map((item) => item.dateKey))].sort();
}

function uniqueCinemas() {
  const map = new Map();
  showtimesForView().forEach((item) => {
    if (!map.has(item.cinemaId)) {
      map.set(item.cinemaId, {
        id: item.cinemaId,
        name: item.cinemaName,
        network: item.network,
        zoneKey: item.zoneKey
      });
    }
  });
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, "fr"));
}

function renderZoneFilter() {
  const zonesInData = new Set(showtimesForView().map((item) => item.zoneKey));
  if (state.selectedZone !== "all" && !zonesInData.has(state.selectedZone)) {
    state.selectedZone = "all";
  }
  els.zoneFilter.innerHTML = [
    `<option value="all">${escapeHtml(t("allIdf"))}</option>`,
    ...ZONES
      .filter(([key]) => zonesInData.has(key))
      .map(([key, label]) => `<option value="${escapeHtml(key)}">${escapeHtml(key === "unknown" ? t("unknownZone") : label)}</option>`)
  ].join("");
  els.zoneFilter.value = state.selectedZone;
}

function renderCinemaFilter() {
  const cinemas = uniqueCinemas()
    .filter((cinema) => state.selectedZone === "all" || cinema.zoneKey === state.selectedZone);
  if (state.selectedCinema !== "all" && !cinemas.some((cinema) => cinema.id === state.selectedCinema)) {
    state.selectedCinema = "all";
  }
  els.cinemaFilter.innerHTML = [
    `<option value="all">${escapeHtml(t("allCinemas"))}</option>`,
    ...cinemas.map((cinema) => `<option value="${escapeHtml(cinema.id)}">${escapeHtml(cinema.name)}</option>`)
  ].join("");
  els.cinemaFilter.value = state.selectedCinema;
}

function filteredShowtimes() {
  return showtimesForView().filter((item) => matchesActiveFilters(item));
}

function matchesActiveFilters(item, options = {}) {
  const query = normalized(state.search);
  if (state.view === "special" && !item.special) return false;
  if (!options.ignoreDate && state.selectedDate && item.dateKey !== state.selectedDate) return false;
  if (state.selectedZone !== "all" && item.zoneKey !== state.selectedZone) return false;
  if (state.selectedCinema !== "all" && item.cinemaId !== state.selectedCinema) return false;
  if (state.selectedNetwork !== "all" && item.network !== state.selectedNetwork) return false;
  const startTimeMinutes = timeValueToMinutes(state.startTime);
  if (startTimeMinutes !== null && item.startMinutes < startTimeMinutes) return false;
  if (query) {
    const haystack = normalized(`${item.filmTitle} ${item.filmTitleEn || ""} ${item.director || ""} ${item.cinemaName} ${item.city} ${item.genre || ""}`);
    if (!haystack.includes(query)) return false;
  }
  return true;
}

function render() {
  ensureSelectedDate();
  renderViewTabs();
  renderZoneFilter();
  renderCinemaFilter();
  renderDates();
  renderAgenda();
  if (window.lucide) window.lucide.createIcons();
}

function renderViewTabs() {
  els.viewTabs.forEach((tab) => {
    const active = tab.dataset.view === state.view;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", String(active));
  });
}

function renderStatus(items) {
  const count = items.length;
  const scopedTotal = showtimesForView().length;
  const loadedTotal = state.data.showtimes.length;
  els.summaryCount.textContent = t("sessionsShown", count);
  els.summaryScope.textContent = state.view === "special"
    ? t("specialScope", scopedTotal, loadedTotal)
    : t("loadedScope", loadedTotal);
  if (state.data.generatedAt) {
    els.updatedAt.textContent = t("updated", formatUpdatedAt(state.data.generatedAt));
  } else {
    els.updatedAt.textContent = t("unknownUpdate");
  }
}

function formatUpdatedAt(value) {
  try {
    return new Intl.DateTimeFormat(currentLocale(), {
      timeZone: "Europe/Paris",
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    }).format(parseDate(value));
  } catch {
    return "--";
  }
}

function renderDates() {
  const dates = uniqueDates();
  const counts = new Map(dates.map((key) => [key, 0]));
  showtimesForView().forEach((item) => {
    if (matchesActiveFilters(item, { ignoreDate: true })) {
      counts.set(item.dateKey, (counts.get(item.dateKey) || 0) + 1);
    }
  });
  els.dateRail.innerHTML = dates.map((key) => {
    const label = formatShortDay(key);
    const active = key === state.selectedDate ? " active" : "";
    const count = counts.get(key) || 0;
    return `
      <button class="date-chip${active}" type="button" role="tab" aria-selected="${key === state.selectedDate}" data-date="${key}">
        <strong>${escapeHtml(label.day)}</strong>
        <span>${escapeHtml(label.date)} · ${count}</span>
      </button>
    `;
  }).join("");

  els.dateRail.querySelectorAll(".date-chip").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedDate = button.dataset.date;
      render();
    });
  });
}

function renderAgenda() {
  els.sectionKicker.textContent = state.view === "special" ? t("specialScreenings") : t("agenda");
  els.selectedDateTitle.textContent = state.selectedDate ? formatDateTitle(state.selectedDate) : t("noDate");
  const items = filteredShowtimes();
  renderStatus(items);

  if (!items.length) {
    els.agendaList.innerHTML = `
      <div class="empty-state">
        <h3>${escapeHtml(t("noSessions"))}</h3>
        <p>${escapeHtml(state.view === "special" ? t("emptySpecial") : t("emptyAgenda"))}</p>
      </div>
    `;
    return;
  }

  const groups = groupByPeriod(items);
  els.agendaList.innerHTML = Object.entries(groups).map(([period, rows]) => `
    <div class="time-group">
      <div class="time-label">${escapeHtml(t(period))} · ${rows.length}</div>
      ${rows.map(renderRow).join("")}
    </div>
  `).join("");

  els.agendaList.querySelectorAll("[data-details]").forEach((button) => {
    button.addEventListener("click", () => {
      const item = items.find((showtime) => showtime.id === button.dataset.details);
      if (item) openDetails(item);
    });
  });

  if (window.lucide) window.lucide.createIcons();
}

function groupByPeriod(items) {
  return items.reduce((acc, item) => {
    const hour = Number(item.time.slice(0, 2));
    const period = hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
    acc[period] = acc[period] || [];
    acc[period].push(item);
    return acc;
  }, {});
}

function renderRow(item) {
  const networkClass = item.network === "UGC" ? "ugc" : item.network === "MK2" ? "mk2" : "partner";
  const end = item.end ? `<span class="screening-end">${escapeHtml(t("endsAt", formatTime(item.end)))}</span>` : "";
  const specialBadge = item.special ? `<span class="badge special">${escapeHtml(displaySpecialLabel(item.specialLabel) || t("specialBadge"))}</span>` : "";
  const booking = item.bookingUrl
    ? `<a class="booking-link" href="${escapeAttr(item.bookingUrl)}" target="_blank" rel="noopener"><i data-lucide="ticket" aria-hidden="true"></i>${escapeHtml(t("reserve"))}</a>`
    : `<a class="booking-link" href="${escapeAttr(item.filmUrl || "#")}" target="_blank" rel="noopener"><i data-lucide="external-link" aria-hidden="true"></i>${escapeHtml(t("viewBooking"))}</a>`;

  return `
    <article class="screening-row">
      <div>
        <div class="screening-time">${escapeHtml(item.time)}</div>
        ${end}
      </div>
      ${posterMarkup(item, "poster-thumb")}
      <div class="screening-main">
        <h3 class="screening-title">${escapeHtml(displayFilmTitle(item))}</h3>
        ${item.director ? `<div class="screening-director">${escapeHtml(t("directedBy", item.director))}</div>` : ""}
        <div class="screening-meta">
          <span class="badge ${networkClass}">${escapeHtml(networkLabel(item.network))}</span>
          ${specialBadge}
          <span class="badge">${escapeHtml(item.versionShort)}</span>
          <span>${escapeHtml(item.cinemaName)}</span>
          <span>${escapeHtml(locationLabel(item))}</span>
        </div>
        <div class="row-actions">
          ${booking}
          <button class="details-button" type="button" data-details="${escapeAttr(item.id)}">${escapeHtml(t("details"))}</button>
        </div>
      </div>
    </article>
  `;
}

function openDetails(item) {
  els.detailsContent.innerHTML = `
    <div class="details-hero">
      ${posterMarkup(item, "detail-poster")}
      <div>
        <p class="eyebrow">${escapeHtml(networkLabel(item.network))}</p>
        <h3>${escapeHtml(displayFilmTitle(item))}</h3>
        ${item.director ? `<p class="details-director">${escapeHtml(t("directedBy", item.director))}</p>` : ""}
      </div>
    </div>
    <ul class="details-list">
      <li><strong>${escapeHtml(t("schedule"))}</strong> ${escapeHtml(formatDateTitle(item.dateKey))}, ${escapeHtml(item.time)}</li>
      ${item.director ? `<li><strong>${escapeHtml(t("direction"))}</strong> ${escapeHtml(item.director)}</li>` : ""}
      <li><strong>${escapeHtml(t("cinema"))}</strong> ${escapeHtml(item.cinemaName)}</li>
      <li><strong>${escapeHtml(t("area"))}</strong> ${escapeHtml(locationLabel(item))}</li>
      <li><strong>${escapeHtml(t("version"))}</strong> ${escapeHtml(item.versionShort)}</li>
      ${item.special ? `<li><strong>${escapeHtml(t("special"))}</strong> ${escapeHtml(displaySpecialLabel(item.specialLabel || item.specialSource) || t("specialBadge"))}</li>` : ""}
      ${item.genre ? `<li><strong>${escapeHtml(t("genre"))}</strong> ${escapeHtml(item.genre)}</li>` : ""}
    </ul>
    ${item.bookingUrl ? `<a class="booking-link" href="${escapeAttr(item.bookingUrl)}" target="_blank" rel="noopener"><i data-lucide="ticket" aria-hidden="true"></i>${escapeHtml(t("openBooking"))}</a>` : ""}
  `;
  if (typeof els.detailsDialog.showModal === "function") {
    els.detailsDialog.showModal();
  }
  if (window.lucide) window.lucide.createIcons();
}

function posterMarkup(item, className) {
  if (item.poster) {
    return `
      <div class="${className}">
        <img src="${escapeAttr(item.poster)}" alt="" loading="lazy" referrerpolicy="no-referrer">
      </div>
    `;
  }
  return `
    <div class="${className} poster-placeholder" aria-hidden="true">
      <i data-lucide="image" aria-hidden="true"></i>
    </div>
  `;
}

function normalizePosterUrl(value) {
  const url = String(value || "").trim();
  if (!url) return "";
  if (url.startsWith("//")) return `https:${url}`;
  return url;
}

function displayFilmTitle(item) {
  if (state.language === "en" && item.filmTitleEn) return String(item.filmTitleEn).trim();
  return toTitleCase(item.filmTitle);
}

function displaySpecialLabel(value) {
  const label = String(value || "").trim();
  if (state.language !== "en" || !label) return label;
  const labels = {
    "avant premiere": "Preview",
    "ugc culte": "UGC Classics",
    "seances speciales": "Special screenings",
    "cycle marathon": "Series / Marathon",
    "reprise mk2": "MK2 Revival",
    "seance rare mk2": "Rare MK2 screening",
    "evenement mk2": "MK2 Event",
    "mk2 evenement": "MK2 Event",
    "mk2 rarete": "MK2 rarity"
  };
  return labels[normalized(label).replace(/[^a-z0-9]+/g, " ").trim()] || label;
}

function toTitleCase(value) {
  return String(value || "").toLocaleLowerCase("fr-FR").replace(/(^|\s|[-'’])(\p{L})/gu, (match, sep, letter) => `${sep}${letter.toLocaleUpperCase("fr-FR")}`);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, "&#096;");
}

function setView(view, options = {}) {
  if (!["agenda", "special"].includes(view) || state.view === view) return;
  state.view = view;
  state.selectedCinema = "all";
  ensureSelectedDate();
  if (!options.fromHash && window.history?.replaceState) {
    const url = view === "special" ? "#speciales" : `${window.location.pathname}${window.location.search}`;
    window.history.replaceState(null, "", url);
  }
  render();
}

function setLanguage(language) {
  if (!["fr", "en"].includes(language) || state.language === language) return;
  state.language = language;
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  } catch {
    // The language still applies for the current session.
  }
  applyLanguage();
  if (hasDisplayedData) render();
}

els.refreshButton.addEventListener("click", () => refreshData());
els.languageToggle.addEventListener("click", () => {
  setLanguage(state.language === "fr" ? "en" : "fr");
});
els.viewTabs.forEach((tab) => {
  tab.addEventListener("click", () => setView(tab.dataset.view));
});
els.zoneFilter.addEventListener("change", (event) => {
  state.selectedZone = event.target.value;
  renderCinemaFilter();
  render();
});
els.cinemaFilter.addEventListener("change", (event) => {
  state.selectedCinema = event.target.value;
  render();
});
els.timeFilter.addEventListener("change", (event) => {
  state.startTime = event.target.value;
  render();
});
els.searchInput.addEventListener("input", (event) => {
  state.search = event.target.value;
  renderAgenda();
});
els.clearFilters.addEventListener("click", () => {
  state.selectedZone = "all";
  state.selectedCinema = "all";
  state.selectedNetwork = "all";
  state.startTime = "";
  state.search = "";
  els.zoneFilter.value = "all";
  renderCinemaFilter();
  els.cinemaFilter.value = "all";
  els.timeFilter.value = "";
  els.searchInput.value = "";
  document.querySelectorAll(".network-row .chip").forEach((chip) => chip.classList.toggle("active", chip.dataset.network === "all"));
  render();
});
document.querySelectorAll(".network-row .chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    state.selectedNetwork = chip.dataset.network;
    document.querySelectorAll(".network-row .chip").forEach((item) => item.classList.toggle("active", item === chip));
    render();
  });
});
els.closeDialog.addEventListener("click", () => els.detailsDialog.close());
window.addEventListener("hashchange", () => {
  setView(initialView(), { fromHash: true });
});

applyLanguage();
startApp();
registerOfflineCache();
