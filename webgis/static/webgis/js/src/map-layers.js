/* Map layer creation, styling, and layer-control behavior. */

  function createNormalProblemsLayer(data) {
    const cluster = L.markerClusterGroup({
      showCoverageOnHover: false,
      maxClusterRadius: 25, // کاهش شعاع برای نمایش خوشه‌های کوچک‌تر و نقاط بیشتر
      disableClusteringAtZoom: 15, // باز شدن کامل خوشه‌ها و نمایش تک‌به‌تک نقاط از زوم ۱۵ به بعد
      iconCreateFunction: (clusterItem) =>
        L.divIcon({
          html: '<div>' + toFaNumber(clusterItem.getChildCount()) + '</div>',
          className: "cluster-problem",
          iconSize: L.point(40, 40)
        })
    });

    const geo = L.geoJSON(data, {
      pointToLayer: (feature, latlng) => {
        const color = getCategoryColor(getCategory(feature.properties));

        return L.marker(latlng, {
          icon: L.divIcon({
            className: "",
            html: '<div class="problem-marker" style="background:' + color + '"></div>',
            iconSize: [22, 22],
            iconAnchor: [11, 11]
          })
        });
      },
      onEachFeature: (feature, layer) => {
        if (typeof makeProblemPopup === "function") layer.bindPopup(makeProblemPopup(feature.properties));
      }
    });

    cluster.addLayer(geo);
    cluster.__geoLayer = geo;

    return cluster;
  }

  function createTwinProblemsLayer(data) {
    const cluster = L.markerClusterGroup({
      showCoverageOnHover: false,
      maxClusterRadius: 20, // کاهش شعاع برای نمایش جذاب‌تر و دقیق‌تر نقاط سناریو
      disableClusteringAtZoom: 15, // باز شدن کامل خوشه‌ها در زوم ۱۵
      spiderfyOnMaxZoom: true,
      iconCreateFunction: (clusterItem) =>
        L.divIcon({
          html: '<div>' + toFaNumber(clusterItem.getChildCount()) + '</div>',
          className: "cluster-problem twin-cluster",
          iconSize: L.point(38, 38)
        })
    });

    const geo = L.geoJSON(data, {
      pane: "problemPane",
      pointToLayer: (feature, latlng) => {
        const p = feature.properties || {};
        const score = Number(p.twin_risk_score || 0);
        const color = p.twin_risk_color || "#38bdf8";

        let radius = 6;
        if (score >= 81) radius = 9;
        else if (score >= 61) radius = 8;
        else if (score >= 31) radius = 7;

        return L.circleMarker(latlng, {
          pane: "problemPane",
          radius,
          fillColor: color,
          color: "#ffffff",
          weight: 1.7,
          opacity: 1,
          fillOpacity: 0.84
        });
      },
      onEachFeature: (feature, layer) => {
        if (typeof makeTwinPopup === "function") layer.bindPopup(makeTwinPopup(feature));
        layer.on("click", () => {
          const id = feature.properties?.twin_id;
          if (id && typeof window.runTwinScenario === "function") window.runTwinScenario(id, false);
        });
      }
    });

    cluster.addLayer(geo);
    cluster.__geoLayer = geo;
    return cluster;
  }

  function renderProblems() {
    if (!problemsData) return;

    if (typeof removeProblemsLayerFromMapAndControl === "function") {
      removeProblemsLayerFromMapAndControl();
    } else if (problemsLayer) {
      if (map.hasLayer(problemsLayer)) map.removeLayer(problemsLayer);
      layersControl.removeLayer(problemsLayer);
    }

    const data = typeof filteredProblems === "function" ? filteredProblems() : problemsData;
    problemsLayer = twinMode ? createTwinProblemsLayer(data) : createNormalProblemsLayer(data);

    problemsLayer.addTo(map);
    layersControl.addOverlay(
      problemsLayer,
      twinMode ? "🎯 سناریو اقدام مشکلات" : "مشکلات شهری" // تغییر نام به سناریو اقدام
    );

    const b = problemsLayer.getBounds?.() || problemsLayer.__geoLayer?.getBounds?.();

    if (b && b.isValid()) {
      homeBounds = homeBounds ? homeBounds.extend(b) : b;
    }
  }

  function buildCategoryPanel() {
    const el = document.getElementById("category-list");
    if (!el || typeof getCategoryCounts !== "function") return;

    const cats = Object.entries(getCategoryCounts()).sort((a, b) => b[1] - a[1]);
    el.innerHTML = "";

    cats.forEach(([cat, count]) => {
      const row = document.createElement("div");
      row.className = "cat-row";
      row.dataset.category = cat;

      row.innerHTML = '<div class="cat-name"><span class="cat-color" style="background:' + getCategoryColor(cat) + '"></span><span>' + escapeHtml(cat) + '</span></div><div class="cat-count">' + toFaNumber(count) + '</div>';

      row.addEventListener("click", () => {
        activeProblemCategory = cat;
        renderProblems();
        if (typeof markActiveCategory === "function") markActiveCategory();

        if (twinMode && typeof showTwinPanel === "function") showTwinPanel();

        toastShow("فیلتر فعال شد: " + cat, "ok");
      });

      el.appendChild(row);
    });
  }

  function markActiveCategory() {
    document.querySelectorAll(".cat-row").forEach((row) => {
      row.classList.toggle("active", row.dataset.category === activeProblemCategory);
    });
  }

  function injectTwinStyles() {
    if (document.getElementById("digital-twin-runtime-style")) return;

    const style = document.createElement("style");
    style.id = "digital-twin-runtime-style";

    // Keep the runtime style rules grouped for easier maintenance.
    style.textContent = [
      ".twin-toggle-btn.active{ background:linear-gradient(135deg,#7c3aed,#db2777) !important; color:#fff !important; border-color:rgba(255,255,255,.45) !important; box-shadow:0 0 26px rgba(219,39,119,.55) !important; }",
      "#twin-floating-panel, #twin-scenario-panel{ direction:rtl !important; text-align:right !important; background:rgba(15,23,42,.97) !important; border:1px solid rgba(148,163,184,.35) !important; border-radius:20px !important; padding:16px !important; color:#fff !important; box-shadow:0 22px 60px rgba(0,0,0,.45) !important; z-index:900 !important; }",
      "#twin-floating-panel{ position:absolute !important; left:18px !important; top:92px !important; width:390px !important; max-width:calc(100% - 36px) !important; max-height:calc(100vh - 120px) !important; overflow:auto !important; margin:0 !important; }",
      "#twin-scenario-panel{ position:absolute !important; right:18px !important; bottom:22px !important; width:390px !important; max-width:calc(100% - 36px) !important; max-height:calc(100vh - 140px) !important; overflow:auto !important; }",
      "#twin-floating-panel h3, #twin-scenario-panel h3{ margin:0 0 12px; font-size:18px; font-weight:900; color:#fff; }",
      "#twin-floating-panel h4, #twin-scenario-panel h4{ margin:16px 0 8px; font-size:14px; color:#e0f2fe; font-weight:900; border-top:1px solid rgba(148,163,184,.22); padding-top:12px; }",
      "#twin-floating-panel .twin-grid{ display:grid; grid-template-columns:1fr 1fr; gap:10px; }",
      "#twin-floating-panel .twin-card{ border-radius:15px; padding:10px; text-align:center; background:rgba(30,41,59,.92); border:1px solid rgba(148,163,184,.22); }",
      "#twin-floating-panel .twin-card span{ display:block; color:#cbd5e1; font-size:12px; margin-bottom:6px; }",
      "#twin-floating-panel .twin-card strong{ font-size:24px; font-weight:900; color:#fff; }",
      "#twin-floating-panel .twin-wide{ grid-column:1 / -1; }",
      ".twin-management, .twin-note{ margin:12px 0 0; color:#dbeafe; font-size:12.5px; line-height:1.9; background:rgba(30,41,59,.55); border:1px solid rgba(148,163,184,.18); border-radius:14px; padding:10px; }",
      ".twin-list{ display:flex; flex-direction:column; gap:8px; }",
      ".twin-list-item{ background:rgba(30,41,59,.82); border:1px solid rgba(148,163,184,.22); border-radius:14px; padding:9px 10px; cursor:pointer; transition:.2s; }",
      ".twin-list-item:hover{ background:rgba(51,65,85,.96); transform:translateY(-1px); }",
      ".twin-list-title{ display:flex; justify-content:space-between; gap:8px; font-size:12.5px; font-weight:900; color:#fff; line-height:1.7; }",
      ".twin-list-meta{ margin-top:4px; color:#cbd5e1; font-size:11.5px; line-height:1.8; }",
      ".twin-badge{ display:inline-flex; align-items:center; justify-content:center; border-radius:999px; padding:2px 7px; font-size:11px; font-weight:900; color:#fff; background:rgba(14,165,233,.22); border:1px solid rgba(56,189,248,.35); white-space:nowrap; }",
      ".twin-close-btn{ position:absolute; top:10px; left:10px; width:28px; height:28px; border:0; border-radius:999px; background:rgba(248,113,113,.18); color:#fecaca; cursor:pointer; font-weight:900; }",
      ".twin-scenario-row{ display:flex; justify-content:space-between; gap:10px; padding:8px 0; border-bottom:1px solid rgba(148,163,184,.14); color:#e2e8f0; font-size:12.5px; }",
      ".twin-scenario-row strong{ color:#fff; }",
      ".twin-scenario-list{ margin:8px 0 0; padding:0 18px 0 0; color:#dbeafe; font-size:12.5px; line-height:2; }",
      ".twin-popup h3{ margin:0 0 10px; font-size:15px; }",
      ".twin-popup-row{ display:flex; justify-content:space-between; gap:10px; padding:6px 0; border-bottom:1px solid rgba(148,163,184,.18); }",
      ".twin-recommendation{ margin-top:10px; padding:9px; border-radius:12px; background:rgba(14,165,233,.12); line-height:1.8; }",
      ".twin-popup-btn{ width:100%; margin-top:10px; border:0; border-radius:12px; padding:9px 10px; cursor:pointer; color:#fff; font-weight:900; background:linear-gradient(135deg,#7c3aed,#db2777); }",
      ".twin-scenario-card{ margin-top:10px; padding:11px; border-radius:14px; background:rgba(15,23,42,.74); border:1px solid rgba(56,189,248,.23); }",
      ".twin-scenario-card h5{ margin:0 0 8px; font-size:13px; color:#fff; }",
      ".twin-scenario-card p{ margin:6px 0; color:#dbeafe; font-size:12px; line-height:1.8; }",
      ".twin-scenario-metrics{ display:grid; grid-template-columns:1fr 1fr; gap:6px; margin-top:8px; }",
      ".twin-scenario-metrics span{ border-radius:10px; padding:6px; background:rgba(30,41,59,.72); color:#e2e8f0; font-size:11.5px; }",
      "@media(max-width:980px){ #twin-floating-panel{ top:82px !important; left:10px !important; width:310px !important; } #twin-scenario-panel{ right:10px !important; left:10px !important; bottom:14px !important; width:auto !important; } }"
    ].join("\n");

    document.head.appendChild(style);
  }
