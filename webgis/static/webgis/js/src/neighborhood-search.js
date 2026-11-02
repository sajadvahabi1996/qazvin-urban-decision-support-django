/* Neighborhood search and boundary highlighting. */

  /* ================= Neighborhood / Harim Search - Fixed ================= */
  const NEIGHBORHOOD_DATA_URLS = [
    window.QAZVIN_DATA_URLS?.neighborhoods || "/api/data/neighborhoods/"
  ];

  let neighborhoodData = null;
  let neighborhoodBaseLayer = null;
  let neighborhoodSelectedLayer = null;
  let neighborhoodLoadingPromise = null;

  function neighborhoodEscapeHtml(value) {
    if (typeof escapeHtml === "function") return escapeHtml(value);
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function neighborhoodFaNumber(value) {
    if (typeof toFaNumber === "function") return toFaNumber(value);
    return String(value ?? "").replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);
  }

  function neighborhoodToast(message, type) {
    if (typeof toastShow === "function") toastShow(message, type || "ok");
  }

  function normalizeNeighborhoodText(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[\u064B-\u065F\u0670\u200c\u200f]/g, "")
      .replace(/[يى]/g, "ی")
      .replace(/ك/g, "ک")
      .replace(/[آأإٱ]/g, "ا")
      .replace(/ة/g, "ه")
      .replace(/ؤ/g, "و")
      .replace(/ئ/g, "ی")
      .replace(/\b(محله|محدوده|ناحیه|بافت|فرسوده|منطقه|خیابان|شهرک)\b/g, "")
      .replace(/امام\s*زاده/g, "امامزاده")
      .replace(/امام\s*اده/g, "امامزاده")
      .replace(/راه\s*اهن/g, "راه آهن")
      .replace(/ملک\s*اباد/g, "ملک آباد")
      .replace(/[\s\-_/،,.؛:()（）\[\]{}]+/g, "");
  }

  function getNeighborhoodName(feature) {
    const p = feature?.properties || {};
    return String(p["نام"] || p.name || p.Name || p.title || "محدوده بدون نام").trim();
  }

  function getNeighborhoodType(feature) {
    const p = feature?.properties || {};
    return String(p["گونه"] || p.type || "محدوده شهری").trim();
  }

  function levenshteinDistance(a, b) {
    a = normalizeNeighborhoodText(a);
    b = normalizeNeighborhoodText(b);
    if (!a) return b.length;
    if (!b) return a.length;
    const dp = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
    for (let i = 0; i <= a.length; i++) dp[i][0] = i;
    for (let j = 0; j <= b.length; j++) dp[0][j] = j;
    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,
          dp[i][j - 1] + 1,
          dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
        );
      }
    }
    return dp[a.length][b.length];
  }

  function scoreNeighborhood(feature, query) {
    const q = normalizeNeighborhoodText(query);
    const name = getNeighborhoodName(feature);
    const n = normalizeNeighborhoodText(name);
    const type = normalizeNeighborhoodText(getNeighborhoodType(feature));
    const merged = n + type;
    if (!q || !n) return 0;

    if (n === q) return 100;
    if (n.startsWith(q)) return 92;
    if (n.includes(q)) return 86;
    if (q.includes(n)) return 78;
    if (merged.includes(q)) return 68;

    const dist = levenshteinDistance(n, q);
    const fuzzy = Math.round((1 - dist / Math.max(n.length, q.length, 1)) * 70);
    const qChars = Array.from(new Set(q.split(""))).filter(Boolean);
    const common = qChars.filter((ch) => n.includes(ch)).length;
    const charScore = Math.round((common / Math.max(qChars.length, 1)) * 45);
    return Math.max(fuzzy, charScore);
  }

  function findNeighborhood(query) {
    if (!neighborhoodData?.features?.length) return null;
    let best = null;
    let bestScore = -1;
    neighborhoodData.features.forEach((feature) => {
      const score = scoreNeighborhood(feature, query);
      if (score > bestScore) {
        bestScore = score;
        best = feature;
      }
    });
    return bestScore >= 48 ? best : null;
  }

  function getNeighborhoodSuggestions(query, limit) {
    if (!neighborhoodData?.features?.length) return [];
    const q = normalizeNeighborhoodText(query);
    return neighborhoodData.features
      .map((feature) => ({ feature, score: q ? scoreNeighborhood(feature, query) : 1 }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit || 6)
      .map((item) => item.feature);
  }

  function neighborhoodPopupHtml(feature) {
    const p = feature.properties || {};
    const area = Number(p.Shape_Area || p.ShapeArea || p.area || 0);
    const areaHa = area ? neighborhoodFaNumber((area / 10000).toFixed(1)) + " هکتار" : "—";
    return "<div class='popup-title'>" + neighborhoodEscapeHtml(getNeighborhoodName(feature)) + "</div>" +
      "<div class='popup-row'><b>نوع:</b> " + neighborhoodEscapeHtml(getNeighborhoodType(feature)) + "</div>" +
      "<div class='popup-row'><b>مساحت تقریبی:</b> " + areaHa + "</div>" +
      "<div class='popup-row'><b>نمایش:</b> مرز نارنجی خط‌چین</div>";
  }

  function ensureNeighborhoodPane() {
    if (!window.map || !window.L) return false;
    if (!map.getPane("neighborhoodPane")) {
      map.createPane("neighborhoodPane");
      map.getPane("neighborhoodPane").style.zIndex = 690;
      map.getPane("neighborhoodPane").style.pointerEvents = "auto";
    }
    return true;
  }

  function createNeighborhoodBaseLayer() {
    ensureNeighborhoodPane();
    return L.geoJSON(neighborhoodData, {
      pane: "neighborhoodPane",
      interactive: true,
      style: function () {
        return { color: "#38bdf8", weight: 1.4, opacity: 0.45, dashArray: "4 7", fill: false, fillOpacity: 0 };
      },
      onEachFeature: function (feature, layer) {
        layer.bindPopup(neighborhoodPopupHtml(feature));
      }
    });
  }

  function fillNeighborhoodOptions() {
    const list = document.getElementById("neighborhood-options");
    if (list && neighborhoodData?.features?.length) {
      list.innerHTML = neighborhoodData.features
        .map((feature) => "<option value='" + neighborhoodEscapeHtml(getNeighborhoodName(feature)) + "'></option>")
        .join("");
    }
    renderNeighborhoodChips();
  }

  function fetchNeighborhoodsFromAnyPath() {
    let lastError = null;
    return NEIGHBORHOOD_DATA_URLS.reduce((promise, url) => {
      return promise.catch(() => fetch(url, { cache: "no-store" })
        .then((response) => {
          if (!response.ok) throw new Error(url + " → HTTP " + response.status);
          return response.json();
        })
        .then((data) => ({ data, url }))
        .catch((error) => { lastError = error; throw error; }));
    }, Promise.reject()).catch(() => { throw lastError || new Error("GeoJSON load failed"); });
  }

  function loadNeighborhoods() {
    if (neighborhoodData) return Promise.resolve(neighborhoodData);
    if (neighborhoodLoadingPromise) return neighborhoodLoadingPromise;

    setNeighborhoodStatus("در حال بارگذاری محدوده‌های قزوین…", "loading");
    neighborhoodLoadingPromise = fetchNeighborhoodsFromAnyPath()
      .then(({ data, url }) => {
        neighborhoodData = data;
        if (!neighborhoodData?.features?.length) throw new Error("GeoJSON خالی است");

        fillNeighborhoodOptions();

        if (window.map && window.L && !neighborhoodBaseLayer) {
          neighborhoodBaseLayer = createNeighborhoodBaseLayer();
          if (typeof layersControl !== "undefined" && layersControl?.addOverlay) {
            layersControl.addOverlay(neighborhoodBaseLayer, "مرز محلات / محدوده‌ها");
          }
        }

        setNeighborhoodStatus(neighborhoodFaNumber(neighborhoodData.features.length) + " محدوده آماده جستجو است. مثلا: امامزاده حسین، سپه، بازار", "ok");
        console.info("Neighborhood GeoJSON loaded from:", url);
        return neighborhoodData;
      })
      .catch((error) => {
        console.error("Neighborhood layer load error:", error);
        setNeighborhoodStatus("فایل محلات لود نشد. فایل را در پوشه data بگذار یا پروژه را با localhost اجرا کن.", "err");
        throw error;
      });

    return neighborhoodLoadingPromise;
  }

  function setNeighborhoodStatus(message, type) {
    const el = document.getElementById("neighborhood-search-status");
    if (!el) return;
    el.className = "neighborhood-status " + (type || "");
    el.textContent = message || "";
  }

  function showNeighborhoodBoundary(feature) {
    if (!ensureNeighborhoodPane()) {
      setNeighborhoodStatus("نقشه هنوز آماده نیست. چند لحظه دیگر دوباره جستجو کن.", "err");
      return;
    }

    if (neighborhoodSelectedLayer) {
      map.removeLayer(neighborhoodSelectedLayer);
      neighborhoodSelectedLayer = null;
    }

    neighborhoodSelectedLayer = L.geoJSON(feature, {
      pane: "neighborhoodPane",
      interactive: true,
      style: function () {
        return { color: "#f97316", weight: 5, opacity: 1, dashArray: "12 8", lineCap: "round", lineJoin: "round", fill: false, fillOpacity: 0 };
      },
      onEachFeature: function (item, layer) { layer.bindPopup(neighborhoodPopupHtml(item)); }
    }).addTo(map);

    const bounds = neighborhoodSelectedLayer.getBounds();
    if (bounds && bounds.isValid()) {
      map.fitBounds(bounds, { padding: [90, 90], maxZoom: 16, animate: true });
      setTimeout(function () {
        neighborhoodSelectedLayer.eachLayer(function (layer) { if (layer.openPopup) layer.openPopup(); });
      }, 500);
    }

    setNeighborhoodStatus("محدوده «" + getNeighborhoodName(feature) + "» روی نقشه مشخص شد.", "ok");
    neighborhoodToast("مرز محدوده نمایش داده شد: " + getNeighborhoodName(feature), "ok");
  }

  function runNeighborhoodSearch(value) {
    const input = document.getElementById("neighborhood-search-input");
    const query = value || input?.value || "";
    if (input && value) input.value = value;
    if (!query.trim()) {
      setNeighborhoodStatus("نام محله را وارد کن؛ مثلا امامزاده حسین، سپه یا بازار.", "err");
      return;
    }

    loadNeighborhoods()
      .then(() => {
        const feature = findNeighborhood(query);
        if (!feature) {
          const samples = getNeighborhoodSuggestions("", 6).map(getNeighborhoodName).join("، ");
          setNeighborhoodStatus("محدوده‌ای با این نام پیدا نشد. نمونه‌ها: " + samples, "err");
          neighborhoodToast("محله پیدا نشد", "err");
          return;
        }
        showNeighborhoodBoundary(feature);
      })
      .catch(() => {});
  }

  function clearNeighborhoodSearch() {
    if (neighborhoodSelectedLayer) {
      map.removeLayer(neighborhoodSelectedLayer);
      neighborhoodSelectedLayer = null;
    }
    const input = document.getElementById("neighborhood-search-input");
    if (input) input.value = "";
    setNeighborhoodStatus("مرز انتخاب‌شده پاک شد. یک محله دیگر جستجو کن.", "ok");
    renderNeighborhoodChips();
  }

  function renderNeighborhoodChips() {
    const chips = document.getElementById("neighborhood-sample-chips");
    if (!chips) return;
    const names = neighborhoodData?.features?.length
      ? getNeighborhoodSuggestions("", 5).map(getNeighborhoodName)
      : ["امامزاده حسین", "سپه", "بازار", "آخوند", "راه آهن"];
    chips.innerHTML = names.map((name) =>
      "<button type='button' class='neighborhood-chip' data-neighborhood='" + neighborhoodEscapeHtml(name) + "'>" + neighborhoodEscapeHtml(name) + "</button>"
    ).join("");
    chips.querySelectorAll(".neighborhood-chip").forEach((btn) => {
      btn.addEventListener("click", function () { runNeighborhoodSearch(this.dataset.neighborhood); });
    });
  }

  function createNeighborhoodSearchUiIfMissing() {
    if (document.getElementById("neighborhood-search-input")) return;
    const host = document.querySelector("#side-panel, #right-panel, .right-panel, .side-panel, .sidebar, aside, .panel, .control-panel");
    if (!host) return;
    const card = document.createElement("div");
    card.className = "neighborhood-search-card";
    card.innerHTML =
      '<h3>جستجوی محله</h3>' +
      '<p>نام محدوده را جستجو کنید تا مرز آن روی نقشه هایلایت شود.</p>' +
      '<div class="neighborhood-search-hint">مثلا سرچ کنید: <b>امامزاده حسین</b>، <b>سپه</b>، <b>بازار</b></div>' +
      '<div class="neighborhood-search-row">' +
        '<input id="neighborhood-search-input" class="neighborhood-search-input" list="neighborhood-options" placeholder="جستجو کنید؛ مثلا امامزاده حسین" autocomplete="off" />' +
        '<button id="neighborhood-search-btn" class="neighborhood-search-btn" type="button">جستجو</button>' +
      '</div>' +
      '<datalist id="neighborhood-options"></datalist>' +
      '<div id="neighborhood-sample-chips" class="neighborhood-sample-chips"></div>' +
      '<div class="neighborhood-actions">' +
        '<div id="neighborhood-search-status" class="neighborhood-status">نام یک محله را وارد کن.</div>' +
        '<button id="neighborhood-clear-btn" class="neighborhood-clear-btn" type="button">پاک</button>' +
      '</div>';
    host.appendChild(card);
  }

  function upgradeExistingNeighborhoodUi() {
    const input = document.getElementById("neighborhood-search-input");
    if (input) {
      input.setAttribute("placeholder", "جستجو کنید؛ مثلا امامزاده حسین، سپه، بازار");
      input.setAttribute("list", "neighborhood-options");
      input.setAttribute("autocomplete", "off");
    }
    if (!document.getElementById("neighborhood-options")) {
      const list = document.createElement("datalist");
      list.id = "neighborhood-options";
      (input?.parentElement || document.body).appendChild(list);
    }
    if (!document.getElementById("neighborhood-sample-chips")) {
      const chips = document.createElement("div");
      chips.id = "neighborhood-sample-chips";
      chips.className = "neighborhood-sample-chips";
      const status = document.getElementById("neighborhood-search-status");
      (status?.parentElement || input?.parentElement || document.body).insertBefore(chips, status || null);
    }
    renderNeighborhoodChips();
  }

  function initNeighborhoodSearchUi() {
    createNeighborhoodSearchUiIfMissing();
    upgradeExistingNeighborhoodUi();

    const button = document.getElementById("neighborhood-search-btn");
    const input = document.getElementById("neighborhood-search-input");
    const clearBtn = document.getElementById("neighborhood-clear-btn");

    if (button) button.addEventListener("click", () => runNeighborhoodSearch());
    if (clearBtn) clearBtn.addEventListener("click", clearNeighborhoodSearch);
    if (input) {
      input.addEventListener("keydown", function (event) {
        if (event.key === "Enter") runNeighborhoodSearch();
      });
      input.addEventListener("input", function () { renderNeighborhoodChips(); });
      input.addEventListener("focus", function () { loadNeighborhoods().catch(() => {}); });
    }

    loadNeighborhoods().catch(() => {});
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initNeighborhoodSearchUi);
  } else {
    initNeighborhoodSearchUi();
  }
