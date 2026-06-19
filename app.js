"use strict";

const DATA_URL = "data/showtimes.json";

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
      genre: "Documentaire",
      version: "VF",
      start: "2026-06-22T19:30:00+02:00",
      bookingUrl: "https://www.mk2.com/film/rencontre-vivian-ostrovksy#sessions"
    }
  ]
};

const state = {
  data: SAMPLE_DATA,
  selectedDate: "",
  selectedZone: "all",
  selectedCinema: "all",
  selectedNetwork: "all",
  search: ""
};

const els = {
  refreshButton: document.getElementById("refreshButton"),
  summaryCount: document.getElementById("summaryCount"),
  summaryScope: document.getElementById("summaryScope"),
  updatedAt: document.getElementById("updatedAt"),
  dateRail: document.getElementById("dateRail"),
  zoneFilter: document.getElementById("zoneFilter"),
  cinemaFilter: document.getElementById("cinemaFilter"),
  searchInput: document.getElementById("searchInput"),
  selectedDateTitle: document.getElementById("selectedDateTitle"),
  agendaList: document.getElementById("agendaList"),
  clearFilters: document.getElementById("clearFilters"),
  detailsDialog: document.getElementById("detailsDialog"),
  detailsContent: document.getElementById("detailsContent"),
  closeDialog: document.getElementById("closeDialog")
};

function parseDate(value) {
  return new Date(value);
}

function dateKey(value) {
  const date = parseDate(value);
  return new Intl.DateTimeFormat("fr-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

function formatTime(value) {
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    hour: "2-digit",
    minute: "2-digit"
  }).format(parseDate(value));
}

function formatDateTitle(key) {
  const date = new Date(`${key}T12:00:00+02:00`);
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long"
  }).format(date);
}

function formatShortDay(key) {
  const date = new Date(`${key}T12:00:00+02:00`);
  return {
    day: new Intl.DateTimeFormat("fr-FR", { weekday: "short" }).format(date).replace(".", ""),
    date: new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short" }).format(date).replace(".", "")
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
  return ZONE_LABELS[zoneKey] || "Zone inconnue";
}

function locationLabel(item) {
  if (item.postalCode) return [item.postalCode, item.city].filter(Boolean).join(" ");
  return zoneLabel(item.zoneKey);
}

function networkLabel(network) {
  if (network === "PARTNER") return "Partenaire";
  return network || "Cinema";
}

function versionLabel(version) {
  const value = String(version || "").toUpperCase();
  if (value.includes("ORIGINAL") && value.includes("LOCAL")) return "VO/VF";
  if (value.includes("ORIGINAL") || value === "VOSTF" || value === "VO") return "VO";
  if (value.includes("LOCAL") || value === "VF") return "VF";
  return value || "Version";
}

function enrichShowtime(showtime) {
  const zoneKey = zoneKeyForShowtime(showtime);
  return {
    ...showtime,
    dateKey: dateKey(showtime.start),
    time: formatTime(showtime.start),
    versionShort: versionLabel(showtime.version),
    poster: normalizePosterUrl(showtime.poster),
    zoneKey
  };
}

async function loadData() {
  try {
    const response = await fetch(`${DATA_URL}?v=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const json = await response.json();
    state.data = {
      ...json,
      showtimes: Array.isArray(json.showtimes) ? json.showtimes : []
    };
  } catch (error) {
    state.data = SAMPLE_DATA;
    console.warn("Using bundled sample data because data/showtimes.json could not be loaded.", error);
  }

  state.data.showtimes = state.data.showtimes
    .filter((item) => item && item.start && item.filmTitle && item.cinemaName)
    .map(enrichShowtime)
    .sort((a, b) => parseDate(a.start) - parseDate(b.start));

  initializeFilters();
  render();
}

function initializeFilters() {
  const dates = uniqueDates();
  const today = dateKey(new Date().toISOString());
  state.selectedDate = dates.find((key) => key >= today) || dates[0] || "";

  renderZoneFilter();
  renderCinemaFilter();
}

function uniqueDates() {
  return [...new Set(state.data.showtimes.map((item) => item.dateKey))].sort();
}

function uniqueCinemas() {
  const map = new Map();
  state.data.showtimes.forEach((item) => {
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
  const zonesInData = new Set(state.data.showtimes.map((item) => item.zoneKey));
  if (state.selectedZone !== "all" && !zonesInData.has(state.selectedZone)) {
    state.selectedZone = "all";
  }
  els.zoneFilter.innerHTML = [
    `<option value="all">Toute l'Ile-de-France</option>`,
    ...ZONES
      .filter(([key]) => zonesInData.has(key))
      .map(([key, label]) => `<option value="${escapeHtml(key)}">${escapeHtml(label)}</option>`)
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
    `<option value="all">Toutes les salles</option>`,
    ...cinemas.map((cinema) => `<option value="${escapeHtml(cinema.id)}">${escapeHtml(cinema.name)}</option>`)
  ].join("");
  els.cinemaFilter.value = state.selectedCinema;
}

function filteredShowtimes() {
  return state.data.showtimes.filter((item) => matchesActiveFilters(item));
}

function matchesActiveFilters(item, options = {}) {
  const query = normalized(state.search);
  if (!options.ignoreDate && state.selectedDate && item.dateKey !== state.selectedDate) return false;
  if (state.selectedZone !== "all" && item.zoneKey !== state.selectedZone) return false;
  if (state.selectedCinema !== "all" && item.cinemaId !== state.selectedCinema) return false;
  if (state.selectedNetwork !== "all" && item.network !== state.selectedNetwork) return false;
  if (query) {
    const haystack = normalized(`${item.filmTitle} ${item.cinemaName} ${item.city} ${item.genre || ""}`);
    if (!haystack.includes(query)) return false;
  }
  return true;
}

function render() {
  renderStatus();
  renderDates();
  renderAgenda();
  if (window.lucide) window.lucide.createIcons();
}

function renderStatus() {
  const count = filteredShowtimes().length;
  const total = state.data.showtimes.length;
  els.summaryCount.textContent = `${count} séance${count > 1 ? "s" : ""} affichée${count > 1 ? "s" : ""}`;
  els.summaryScope.textContent = `${total} séances chargées`;
  if (state.data.generatedAt) {
    els.updatedAt.textContent = `MAJ ${formatUpdatedAt(state.data.generatedAt)}`;
  } else {
    els.updatedAt.textContent = "MAJ inconnue";
  }
}

function formatUpdatedAt(value) {
  try {
    return new Intl.DateTimeFormat("fr-FR", {
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
  els.dateRail.innerHTML = dates.map((key) => {
    const label = formatShortDay(key);
    const active = key === state.selectedDate ? " active" : "";
    const count = state.data.showtimes.filter((item) => item.dateKey === key && matchesActiveFilters(item, { ignoreDate: true })).length;
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
  els.selectedDateTitle.textContent = state.selectedDate ? formatDateTitle(state.selectedDate) : "Aucune date";
  const items = filteredShowtimes();
  renderStatus();

  if (!items.length) {
    els.agendaList.innerHTML = `
      <div class="empty-state">
        <h3>Aucune séance trouvée</h3>
        <p>Change la date, la zone, le cinéma ou le réseau. Les futures dates apparaissent seulement quand les cinémas les publient.</p>
      </div>
    `;
    return;
  }

  const groups = groupByPeriod(items);
  els.agendaList.innerHTML = Object.entries(groups).map(([period, rows]) => `
    <div class="time-group">
      <div class="time-label">${escapeHtml(period)} · ${rows.length}</div>
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
    const period = hour < 12 ? "Matin" : hour < 18 ? "Après-midi" : "Soir";
    acc[period] = acc[period] || [];
    acc[period].push(item);
    return acc;
  }, {});
}

function renderRow(item) {
  const networkClass = item.network === "UGC" ? "ugc" : item.network === "MK2" ? "mk2" : "partner";
  const end = item.end ? `<span class="screening-end">fin ${formatTime(item.end)}</span>` : "";
  const booking = item.bookingUrl
    ? `<a class="booking-link" href="${escapeAttr(item.bookingUrl)}" target="_blank" rel="noopener"><i data-lucide="ticket" aria-hidden="true"></i>Réserver</a>`
    : `<a class="booking-link" href="${escapeAttr(item.filmUrl || "#")}" target="_blank" rel="noopener"><i data-lucide="external-link" aria-hidden="true"></i>Voir</a>`;

  return `
    <article class="screening-row">
      <div>
        <div class="screening-time">${escapeHtml(item.time)}</div>
        ${end}
      </div>
      ${posterMarkup(item, "poster-thumb")}
      <div class="screening-main">
        <h3 class="screening-title">${escapeHtml(toTitleCase(item.filmTitle))}</h3>
        <div class="screening-meta">
          <span class="badge ${networkClass}">${escapeHtml(networkLabel(item.network))}</span>
          <span class="badge">${escapeHtml(item.versionShort)}</span>
          <span>${escapeHtml(item.cinemaName)}</span>
          <span>${escapeHtml(locationLabel(item))}</span>
        </div>
        <div class="row-actions">
          ${booking}
          <button class="details-button" type="button" data-details="${escapeAttr(item.id)}">Détails</button>
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
        <h3>${escapeHtml(toTitleCase(item.filmTitle))}</h3>
      </div>
    </div>
    <ul class="details-list">
      <li><strong>Horaire</strong> ${escapeHtml(formatDateTitle(item.dateKey))}, ${escapeHtml(item.time)}</li>
      <li><strong>Cinéma</strong> ${escapeHtml(item.cinemaName)}</li>
      <li><strong>Zone</strong> ${escapeHtml(locationLabel(item))}</li>
      <li><strong>Version</strong> ${escapeHtml(item.versionShort)}</li>
      ${item.genre ? `<li><strong>Genre</strong> ${escapeHtml(item.genre)}</li>` : ""}
    </ul>
    ${item.bookingUrl ? `<a class="booking-link" href="${escapeAttr(item.bookingUrl)}" target="_blank" rel="noopener"><i data-lucide="ticket" aria-hidden="true"></i>Ouvrir la réservation</a>` : ""}
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

els.refreshButton.addEventListener("click", loadData);
els.zoneFilter.addEventListener("change", (event) => {
  state.selectedZone = event.target.value;
  renderCinemaFilter();
  render();
});
els.cinemaFilter.addEventListener("change", (event) => {
  state.selectedCinema = event.target.value;
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
  state.search = "";
  els.zoneFilter.value = "all";
  renderCinemaFilter();
  els.cinemaFilter.value = "all";
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

loadData();
