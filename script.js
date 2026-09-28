"use strict";

/* ===== Configuração ===== */
// Ajuste se os JSON estiverem em outra pasta.
const SNAKES_URL = "data/cobras-ceara.json";
// FONTE DE HOSPITAIS: hoje é este JSON (SESA-CE). Para usar uma API real,
// troque a URL e adapte findNearbyHospitals() para manter o mesmo formato de objeto.
const HOSPITALS_URL = "data/hospitais-ceara.json";
const IMAGES_DIR = "images/";
const INITIAL_HOSPITALS = 5;

const RISK_LABEL = { alto: "⚠️ Risco alto", baixo: "Risco baixo", nao_peconhenta: "✅ Não peçonhenta" };
const FILTERS = [
  { id: "todas", label: "Todas", test: () => true },
  { id: "alto", label: "Risco alto", test: (s) => s.risco === "alto" },
  { id: "baixo", label: "Risco baixo", test: (s) => s.risco === "baixo" },
  { id: "nao_peconhenta", label: "Não peçonhentas", test: (s) => s.risco === "nao_peconhenta" },
  { id: "endemica", label: "Endêmicas", test: (s) => s.endemica === true },
];

const state = { snakes: [], hospitals: [], query: "", filter: "todas", user: null, soro: null, showAll: false };
const $ = (sel) => document.querySelector(sel);
const els = {
  grid: $("#grid"), search: $("#search"), filters: $("#filters"), count: $("#count"),
  dialog: $("#details"), dialogBody: $("#details-body"), status: $("#soro-status"),
  hospitals: $("#hospitals"), soroFilter: $("#soro-filter"),
};

/* ===== Utilidades ===== */
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const norm = (v) => String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const has = (v) => v !== null && v !== undefined && v !== "";

/* ===== Dados ===== */
async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.json();
}

async function loadSnakes() {
  els.grid.innerHTML = '<div class="skeleton"></div>'.repeat(4);
  try {
    state.snakes = await fetchJson(SNAKES_URL);
    renderFilters();
    renderSnakes();
  } catch (err) {
    console.error(err);
    els.grid.innerHTML = '<div class="status error" role="alert">Não foi possível carregar os dados das cobras. Tente novamente. <button class="btn btn-ghost btn-small" type="button" data-action="retry">Tentar de novo</button></div>';
  } finally {
    els.grid.removeAttribute("aria-busy");
  }
}

async function loadHospitals() {
  if (!state.hospitals.length) state.hospitals = await fetchJson(HOSPITALS_URL);
  return state.hospitals;
}

/* ===== Cobras ===== */
function searchSnakes() {
  const q = norm(state.query.trim());
  const filter = FILTERS.find((f) => f.id === state.filter) || FILTERS[0];
  return state.snakes.filter((s) => filter.test(s) && (!q || norm(`${s.nome} ${s.nomeCientifico} ${s.familia}`).includes(q)));
}

function imageTag(snake, cls) {
  const alt = `Foto de ${snake.nome} (${snake.nomeCientifico})`;
  if (!has(snake.foto)) return `<div class="ph" role="img" aria-label="Sem foto de ${esc(snake.nome)}">🐍</div>`;
  return `<img class="${cls}" src="${IMAGES_DIR}${encodeURIComponent(snake.foto)}" alt="${esc(alt)}" loading="lazy" decoding="async">`;
}

function badges(s) {
  const risk = s.risco ? `<span class="badge ${esc(s.risco)}">${esc(RISK_LABEL[s.risco] || s.risco)}</span>` : "";
  const endemic = s.endemica ? '<span class="badge endemica">📍 Endêmica</span>' : "";
  return `<div class="badges">${risk}${endemic}</div>`;
}

function renderFilters() {
  els.filters.innerHTML = FILTERS.map((f) => `<button type="button" class="chip" data-filter="${f.id}" aria-pressed="${f.id === state.filter}">${f.label}</button>`).join("");
}

function renderSnakes() {
  const list = searchSnakes();
  els.count.textContent = `${list.length} ${list.length === 1 ? "cobra encontrada" : "cobras encontradas"}`;
  if (!list.length) {
    els.grid.innerHTML = '<div class="status">Nenhuma cobra encontrada. Tente outro nome ou limpe os filtros.</div>';
    return;
  }
  els.grid.innerHTML = list.map((s, i) => `
    <article class="card" style="animation-delay:${Math.min(i, 8) * 30}ms">
      ${imageTag(s, "card-img")}
      <div class="card-body">
        <h3>${esc(s.nome)}</h3>
        <p class="sci">${esc(s.nomeCientifico)}</p>
        ${badges(s)}
        ${has(s.caracteristicas) ? `<p>${esc(s.caracteristicas)}</p>` : ""}
        <button class="btn btn-green" type="button" data-details="${esc(s.id)}" aria-label="Ver detalhes de ${esc(s.nome)}">Ver detalhes</button>
      </div>
    </article>`).join("");
}

function renderSnakeDetails(id) {
  const s = state.snakes.find((x) => x.id === id);
  if (!s) return;
  const rows = [
    ["Nome científico", s.nomeCientifico], ["Família", s.familia], ["Tipo de mordida", s.tipoMordida],
    ["Tipo de acidente", s.tipoAcidente], ["Soro indicado", has(s.tipoSoro) ? `Soro ${s.tipoSoro.toLowerCase()}` : null],
  ].filter(([, v]) => has(v));
  const sero = has(s.tipoSoro)
    ? `<button class="btn btn-red" type="button" data-soro="${esc(s.tipoSoro)}">📍 Hospitais com soro ${esc(s.tipoSoro.toLowerCase())}</button>`
    : `<div class="info"><dd>Sem soro específico indicado nos dados. Em qualquer picada, procure atendimento médico.</dd></div>`;
  els.dialogBody.innerHTML = `
    <button class="btn btn-ghost btn-small d-close" type="button" data-close aria-label="Fechar detalhes">✕</button>
    ${imageTag(s, "d-img")}
    <div class="d-body">
      <h2 id="details-title">${esc(s.nome)}</h2>
      ${badges(s)}
      ${has(s.caracteristicas) ? `<p>${esc(s.caracteristicas)}</p>` : ""}
      <dl class="info">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join("")}</dl>
      ${sero}
    </div>`;
  els.dialog.showModal();
}

/* ===== Localização e hospitais ===== */
function setStatus(msg, isError = false) {
  els.status.hidden = false;
  els.status.className = isError ? "status error" : "status";
  els.status.textContent = msg;
}

// Só é chamada a partir de um clique do usuário.
function requestUserLocation(soro = null) {
  state.soro = soro;
  state.showAll = false;
  document.querySelector("#soro").scrollIntoView({ behavior: "smooth" });
  if (!("geolocation" in navigator)) {
    setStatus("Seu navegador não permite localização. Ligue para o serviço de emergência da sua região.", true);
    return;
  }
  setStatus("Buscando sua localização…");
  document.querySelectorAll('[data-action="locate"]').forEach((b) => (b.disabled = true));
  navigator.geolocation.getCurrentPosition(onLocation, onLocationError, { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 });
}

async function onLocation(pos) {
  unlockButtons();
  state.user = { lat: pos.coords.latitude, lng: pos.coords.longitude };
  try {
    await loadHospitals();
    renderHospitals();
  } catch (err) {
    console.error(err);
    setStatus("Não foi possível carregar a lista de hospitais. Tente novamente.", true);
  }
}

function onLocationError(err) {
  unlockButtons();
  const msg = err.code === 1
    ? "Não conseguimos acessar sua localização. Ative a permissão de localização nas configurações do navegador (toque no cadeado ao lado do endereço) e tente de novo."
    : "Não conseguimos obter sua localização agora. Verifique o GPS ou a internet e tente de novo.";
  setStatus(msg, true);
}

function unlockButtons() {
  document.querySelectorAll('[data-action="locate"]').forEach((b) => (b.disabled = false));
}

// Haversine: distância em km entre dois pontos.
function calculateDistance(a, b) {
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

// Ex.: tipoSoro "Botrópico" casa com "Soro antibotrópico" (sem acento, prefixo "anti").
function hasSerum(hospital, tipoSoro) {
  const wanted = "anti" + norm(tipoSoro);
  return (hospital.soros || []).some((s) => norm(s).includes(wanted));
}

function findNearbyHospitals() {
  return state.hospitals
    .filter((h) => Number.isFinite(h.latitude) && Number.isFinite(h.longitude))
    .filter((h) => !state.soro || hasSerum(h, state.soro))
    .map((h) => ({ ...h, km: calculateDistance(state.user, { lat: h.latitude, lng: h.longitude }) }))
    .sort((a, b) => a.km - b.km);
}

const formatKm = (km) => (km < 1 ? `${Math.round(km * 1000)} m` : `${km.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} km`);

function routeUrl(h) {
  const p = new URLSearchParams({ api: "1", destination: `${h.latitude},${h.longitude}` });
  if (h.placeId) p.set("destination_place_id", h.placeId);
  return `https://www.google.com/maps/dir/?${p}`;
}

function renderHospitals() {
  const all = findNearbyHospitals();
  els.soroFilter.hidden = !state.soro;
  els.soroFilter.innerHTML = state.soro
    ? `<span>Mostrando só hospitais com soro <strong>${esc(state.soro.toLowerCase())}</strong></span><button class="btn btn-ghost btn-small" type="button" data-clear-soro>Ver todos</button>`
    : "";
  if (!all.length) {
    els.hospitals.innerHTML = "";
    setStatus("Não encontramos unidades próximas com os dados disponíveis.");
    return;
  }
  const list = state.showAll ? all : all.slice(0, INITIAL_HOSPITALS);
  els.status.hidden = false;
  els.status.className = "status";
  els.status.textContent = `${all.length} unidades listadas, da mais próxima para a mais distante. Distância em linha reta; a rota real pode ser maior. Confirme a disponibilidade do soro por telefone.`;
  els.hospitals.innerHTML = list.map((h, i) => `
    <li class="hospital" style="animation-delay:${i * 40}ms">
      <h3>${esc(h.nome)}</h3>
      <p class="dist">📍 ${formatKm(h.km)} de distância</p>
      <p class="muted">${esc([h.endereco, h.cidade].filter(has).join(" – "))}</p>
      <div class="tags">${(h.soros || []).map((s) => `<span class="tag">${esc(s)}</span>`).join("")}</div>
      ${has(h.fonte) ? `<p class="muted">Fonte: ${esc(h.fonte)}</p>` : ""}
      <div class="actions">
        <a class="btn btn-blue" href="${routeUrl(h)}" target="_blank" rel="noopener" aria-label="Ver rota até ${esc(h.nome)}">🗺️ Ver rota</a>
        ${has(h.telefone) ? `<a class="btn btn-ghost" href="tel:${esc(h.telefone.replace(/[^\d+]/g, ""))}" aria-label="Ligar para ${esc(h.nome)}">📞 ${esc(h.telefone)}</a>` : ""}
      </div>
    </li>`).join("") + (all.length > list.length ? `<li><button class="btn btn-ghost" type="button" data-show-all>Mostrar todas (${all.length})</button></li>` : "");
}

/* ===== Eventos ===== */
document.addEventListener("click", (e) => {
  const t = e.target.closest("button, a, dialog");
  if (!t) return;
  if (t.dataset.action === "locate") requestUserLocation();
  else if (t.dataset.action === "retry") loadSnakes();
  else if (t.dataset.details) renderSnakeDetails(t.dataset.details);
  else if (t.dataset.soro) { els.dialog.close(); requestUserLocation(t.dataset.soro); }
  else if (t.dataset.filter) { state.filter = t.dataset.filter; renderFilters(); renderSnakes(); }
  else if ("close" in t.dataset) els.dialog.close();
  else if ("clearSoro" in t.dataset) { state.soro = null; renderHospitals(); }
  else if ("showAll" in t.dataset) { state.showAll = true; renderHospitals(); }
  else if (t === els.dialog) els.dialog.close(); // clique no fundo
});

// Foto ausente/quebrada vira placeholder (erro de imagem não borbulha, por isso capture).
document.addEventListener("error", (e) => {
  if (e.target.tagName !== "IMG") return;
  const ph = document.createElement("div");
  ph.className = "ph";
  ph.setAttribute("role", "img");
  ph.setAttribute("aria-label", e.target.alt || "Sem foto");
  ph.textContent = "🐍";
  e.target.replaceWith(ph);
}, true);

els.search.addEventListener("input", (e) => { state.query = e.target.value; renderSnakes(); });

loadSnakes();
