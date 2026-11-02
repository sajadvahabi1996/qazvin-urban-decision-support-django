/* Application map configuration, shared state, and common helpers. */

/* global L, turf */
"use strict";

const DATAURLS = window.QAZVIN_DATA_URLS || {
  roads: "/api/data/roads/",
  bus: "/api/data/bus/",
  taxi: "/api/data/taxi/",
  fuel: "/api/data/fuel/",
  problems: "/api/data/problems/",
  hospitals: "/api/data/hospitals/",
  landuse: "/api/data/landuse/",
  odPriority: "/api/data/od-priority/"
};

const CATEGORYCOLORS = {
  "سد معبر و مزاحمت اصناف/دستفروش": "#e41a1c",
  "آسفالت، چاله و حفاری": "#377eb8",
  "تخلفات ساختمانی، ایمنی بنا و داربست": "#4daf4a",
  "سایر/نیازمند بررسی دستی": "#777777",
  "ترافیک، پارکینگ و حمل‌ونقل": "#984ea3",
  "نظافت، زباله و نخاله": "#ff7f00",
  "آب‌گرفتگی، جوی و فاضلاب": "#a65628",
  "فضای سبز و درخت": "#66c2a5",
  "تابلو، علائم و مبلمان شهری": "#f781bf",
  "روشنایی، برق و تأسیسات": "#ffff33",
  "حیوانات و بهداشت محیط": "#00bcd4"
};

const isMobile = window.matchMedia("(max-width: 980px)").matches;

const map = L.map("map", {
  zoomControl: false
}).setView([36.2735, 50.0090], 13);

map.createPane("landusePane");
map.getPane("landusePane").style.zIndex = 395;
map.getPane("landusePane").style.pointerEvents = "auto";

map.createPane("servicePane");
map.getPane("servicePane").style.zIndex = 520;

map.createPane("problemPane");
map.getPane("problemPane").style.zIndex = 610;

L.control.zoom({
  position: "bottomright"
}).addTo(map);

if (L.Control && L.Control.Fullscreen) {
  map.addControl(new L.Control.Fullscreen({
    position: "bottomright"
  }));
}

// نقشه پایه استاندارد OpenStreetMap؛ بدون API Key
const osm = L.tileLayer(
  "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  {
    maxZoom: 19,
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>',
    referrerPolicy: "strict-origin-when-cross-origin"
  }
);

// اصلاح خطای baseLayers is not defined
const baseLayers = {
  "OpenStreetMap": osm
};

osm.addTo(map);

// ماسک گرافیکی ظریف روی نقشه پایه
map.createPane("baseMaskPane");

const maskPane = map.getPane("baseMaskPane");
maskPane.style.zIndex = 250;
maskPane.style.pointerEvents = "none";

const osmGraphicMask = L.gridLayer({
  pane: "baseMaskPane",
  tileSize: 256,
  opacity: 1,
  updateWhenIdle: true,
  keepBuffer: 1
});

osmGraphicMask.createTile = function () {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;

  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  ctx.fillStyle = "rgba(207, 231, 235, 0.13)";
  ctx.fillRect(0, 0, 256, 256);

  const gradient = ctx.createRadialGradient(
    128, 115, 35,
    128, 128, 195
  );

  gradient.addColorStop(0, "rgba(255, 255, 255, 0)");
  gradient.addColorStop(1, "rgba(25, 65, 90, 0.07)");

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 256, 256);

  return canvas;
};

osmGraphicMask.addTo(map);

const layersControl = L.control.layers(baseLayers, {}, {
  collapsed: false,
  position: "bottomleft"
}).addTo(map);

const loaderEl = document.getElementById("loader");
const toastEl = document.getElementById("toast");
const sysMsgEl = document.getElementById("sys-msg");

let homeBounds = null;
let hasFitted = false;
let selectedLayer = null;
let toastTimer = null;

let roadsLayer = null;
let busLayer = null;
let taxiLayer = null;
let fuelLayer = null;
let hospitalLayer = null;
let hospitalData = null;

let landuseLayer = null;
let landuseGeoLayer = null;
let landuseLoaded = false;
let landuseLoading = false;

let busCluster = null;
let taxiCluster = null;
let fuelCluster = null;

let busCoverageLayer = null;
let taxiCoverageLayer = null;
let busHeatLayer = null;
let problemHeatLayer = null;
let busHeatOn = false;
let problemHeatOn = false;

let busStopsIndex = [];
let nearestLine = null;
let nearestStopLayer = null;
let userLocMarker = null;

let problemsData = null;
let problemsLayer = null;
let activeProblemCategory = null;
let twinMode = false;
let twinPanelEl = null;

function loader(show) {
  if (loaderEl) {
    loaderEl.style.display = show ? "flex" : "none";
  }
}

function toastShow(msg, type = "") {
  if (!toastEl) return;

  toastEl.className = "toast " + type;
  toastEl.textContent = msg;
  toastEl.style.display = "block";

  clearTimeout(toastTimer);

  toastTimer = setTimeout(() => {
    toastEl.style.display = "none";
  }, 3400);
}

function setSys(msg) {
  if (sysMsgEl) {
    sysMsgEl.textContent = msg;
  }
}

function toFaNumber(value) {
  return String(value ?? "").replace(
    /\d/g,
    (d) => "۰۱۲۳۴۵۶۷۸۹"[d]
  );
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeJsSingle(value) {
  return String(value ?? "")
    .replaceAll("\\", "\\\\")
    .replaceAll("'", "\\'")
    .replaceAll("\n", " ")
    .replaceAll("\r", " ");
}

function pick(obj, ...keys) {
  const list =
    keys.length === 1 && Array.isArray(keys[0])
      ? keys[0]
      : keys;

  for (const key of list) {
    if (
      obj &&
      obj[key] !== undefined &&
      obj[key] !== null &&
      obj[key] !== ""
    ) {
      return String(obj[key]);
    }
  }

  return "";
}

function getCategory(props = {}) {
  return (
    props.category ||
    props.Category ||
    props.cat ||
    props.problemcategory ||
    props.problem_category ||
    props["دسته‌بندی"] ||
    props["دسته بندی"] ||
    "سایر/نیازمند بررسی دستی"
  );
}

function getCategoryColor(category) {
  return CATEGORYCOLORS[category] || "#777777";
}

function normalizeFaText(value = "") {
  return String(value || "")
    .replaceAll("ي", "ی")
    .replaceAll("ك", "ک")
    .replaceAll("ة", "ه")
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .trim();
}

function getLanduseGroup(lu = "") {
  const text = normalizeFaText(lu);

  if (!text || text === "نامشخص") return "نامشخص";

  if (text.includes("مسکونی") && text.includes("تجاری")) {
    return "تجاری-مسکونی";
  }

  if (text.includes("تجاری") || text.includes("خدماتی")) {
    return "تجاری و خدماتی";
  }

  if (text.includes("مسکونی")) return "مسکونی";

  if (
    text.includes("درمانی") ||
    text.includes("بهداشتی") ||
    text.includes("بیمارستان")
  ) {
    return "بهداشتی و درمانی";
  }

  if (
    text.includes("آموزشی") ||
    text.includes("دانشگاهی")
  ) {
    return "آموزشی";
  }

  if (
    text.includes("فضای سبز") ||
    text.includes("پارک") ||
    text.includes("باغ")
  ) {
    return "فضای سبز";
  }

  if (
    text.includes("صنعتی") ||
    text.includes("کارگاهی")
  ) {
    return "صنعتی و کارگاهی";
  }

  if (
    text.includes("حمل") ||
    text.includes("نقل") ||
    text.includes("پارکینگ") ||
    text.includes("پایانه")
  ) {
    return "حمل‌ونقل و پارکینگ";
  }

  // عمومی‌سازی عنوان‌های حساس در نمایش عمومی
  if (
    text.includes("اداری") ||
    text.includes("انتظامی") ||
    text.includes("دولتی") ||
    text.includes("نظامی")
  ) {
    return "خدمات عمومی و شهری";
  }

  if (
    text.includes("فرهنگی") ||
    text.includes("مذهبی") ||
    text.includes("مسجد")
  ) {
    return "فرهنگی و مذهبی";
  }

  if (text.includes("ورزشی")) return "ورزشی";

  if (
    text.includes("معابر") ||
    text.includes("خیابان") ||
    text.includes("راه")
  ) {
    return "معابر";
  }

  if (
    text.includes("بایر") ||
    text.includes("اراضی")
  ) {
    return "اراضی بایر";
  }

  return text;
}

function getLanduseColor(lu = "") {
  const group = getLanduseGroup(lu);

  const colors = {
    "مسکونی": "#34d399",
    "تجاری و خدماتی": "#f59e0b",
    "تجاری-مسکونی": "#fb923c",
    "بهداشتی و درمانی": "#f43f5e",
    "آموزشی": "#60a5fa",
    "فضای سبز": "#22c55e",
    "صنعتی و کارگاهی": "#a78bfa",
    "حمل‌ونقل و پارکینگ": "#fbbf24",
    "خدمات عمومی و شهری": "#22d3ee",
    "فرهنگی و مذهبی": "#f472b6",
    "ورزشی": "#84cc16",
    "معابر": "#94a3b8",
    "اراضی بایر": "#cbd5e1",
    "نامشخص": "#94a3b8"
  };

  return colors[group] || "#38bdf8";
}

function getLanduseStyle(feature) {
  const p = feature.properties || {};

  const lu =
    p.landusegroup ||
    p.landuse_group ||
    p.LU ||
    p.lu ||
    p.landuse ||
    p["کاربری"] ||
    p["نوع_کاربری"] ||
    "";

  const group = getLanduseGroup(lu);
  const color = getLanduseColor(group);

  if (group === "معابر") {
    return {
      pane: "landusePane",
      color: "#cbd5e1",
      weight: 0.35,
      opacity: 0.45,
      fillColor: "#64748b",
      fillOpacity: 0.10
    };
  }

  if (group === "مسکونی") {
    return {
      pane: "landusePane",
      color: "rgba(236,253,245,0.70)",
      weight: 0.42,
      opacity: 0.64,
      fillColor: color,
      fillOpacity: 0.32
    };
  }

  return {
    pane: "landusePane",
    color: "rgba(255,255,255,0.78)",
    weight: 0.55,
    opacity: 0.78,
    fillColor: color,
    fillOpacity: 0.46
  };
}

function getODPressureColor(norm = 0) {
  if (norm >= 80) return "#b91c1c";
  if (norm >= 60) return "#ef4444";
  if (norm >= 40) return "#f59e0b";
  if (norm >= 20) return "#fbbf24";

  return "#a7f3d0";
}

function getODPressureStyle(feature) {
  const props = feature.properties || {};

  const norm = Number(
    props.odpressurenorm ??
    props.od_pressure_norm ??
    props.pressure ??
    0
  );

  return {
    pane: "servicePane",
    color: "rgba(255,255,255,0.7)",
    weight: 0.8,
    opacity: 0.8,
    fillColor: getODPressureColor(norm),
    fillOpacity: 0.55
  };
}

function featureCount(geojson) {
  return Array.isArray(geojson?.features)
    ? geojson.features.length
    : 0;
}

async function fetchJson(url) {
  const response = await fetch(url, {
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(
      "HTTP " + response.status + ": " + url
    );
  }

  return response.json();
}

function addOverlay(layer, name) {
  if (layer) {
    layersControl.addOverlay(layer, name);
  }
}

function clearSelection() {
  if (!selectedLayer) return;

  if (
    selectedLayer.origStyle &&
    selectedLayer.setStyle
  ) {
    selectedLayer.setStyle(selectedLayer.origStyle);
  }

  selectedLayer = null;
}

function enableSelectable(layer, highlightStyle = {}) {
  layer.on("click", (e) => {
    clearSelection();

    selectedLayer = e.target;

    if (!selectedLayer?.setStyle) return;

    if (!selectedLayer.origStyle) {
      const o = selectedLayer.options || {};

      selectedLayer.origStyle = {
        color: o.color,
        weight: o.weight,
        opacity: o.opacity,
        fillColor: o.fillColor,
        fillOpacity: o.fillOpacity,
        radius: o.radius
      };
    }

    selectedLayer.setStyle(highlightStyle);
  });
}

function makePointStyle(stroke, fill) {
  return {
    radius: 6,
    color: stroke,
    weight: 1.5,
    fillColor: fill,
    fillOpacity: 0.95
  };
}

async function loadGeoJsonLayer({
  name,
  url,
  style,
  pointToLayer,
  onEachFeature,
  cluster,
  statElId,
  fit = false
}) {
  try {
    const data = await fetchJson(url);

    const layer = L.geoJSON(data, {
      style,
      pointToLayer,
      onEachFeature
    });

    const controlLayer = cluster || layer;

    if (cluster) {
      cluster.addLayer(layer);
    }

    controlLayer.addTo(map);
    addOverlay(controlLayer, name);

    const stat = document.getElementById(statElId);

    if (stat) {
      stat.textContent = toFaNumber(
        featureCount(data)
      );
    }

    const bounds = layer.getBounds?.();

    if (bounds?.isValid()) {
      homeBounds = homeBounds
        ? homeBounds.extend(bounds)
        : bounds;

      if (fit && !hasFitted) {
        map.fitBounds(bounds, {
          padding: [20, 20]
        });

        hasFitted = true;
      }
    }

    return {
      data,
      layer,
      controlLayer
    };
  } catch (error) {
    console.error(name + " error:", error);

    toastShow(
      "خطا در بارگذاری «" + name + "»",
      "err"
    );

    setSys(
      "برخی لایه‌ها با خطا لود شدند. مسیر فایل‌ها را بررسی کنید."
    );

    return null;
  }
}
