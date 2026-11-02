/* Reusable spatial utilities and measurement helpers. */

  function buildCoverageBuffer(pointGeoJsonLayer, radiusMeters, options = {}) {
    const buffers = [];

    pointGeoJsonLayer.eachLayer((layer) => {
      const ll = layer.getLatLng?.();
      if (!ll) return;
      const pt = turf.point([ll.lng, ll.lat]);
      buffers.push(turf.buffer(pt, radiusMeters, { units: "meters" }));
    });

    return L.geoJSON(turf.featureCollection(buffers), {
      style: {
        color: options.color || "#60a5fa",
        weight: 1,
        fillColor: options.fillColor || options.color || "#60a5fa",
        fillOpacity: options.fillOpacity ?? 0.18
      }
    });
  }

  function buildHeat(pointGeoJsonLayer, options = {}) {
    if (!pointGeoJsonLayer || !pointGeoJsonLayer.eachLayer || !L.heatLayer) return null;

    const pts = [];
    pointGeoJsonLayer.eachLayer((layer) => {
      const ll = layer.getLatLng?.();
      if (ll) pts.push([ll.lat, ll.lng, options.intensity ?? 0.75]);
    });

    if (!pts.length) return null;

    return L.heatLayer(pts, {
      radius: options.radius ?? 36,
      blur: options.blur ?? 28,
      maxZoom: 18,
      minOpacity: options.minOpacity ?? 0.35,
      gradient: options.gradient || {
        0.2: "#38bdf8",
        0.45: "#22c55e",
        0.65: "#facc15",
        0.82: "#fb923c",
        1: "#ef4444"
      }
    });
  }

function buildWeightedProblemHeat(geojson) {
  if (!geojson || !Array.isArray(geojson.features) || !L.heatLayer) return null;

  const pts = [];

  geojson.features.forEach((feature) => {
    if (feature.geometry?.type !== "Point") return;

    const [lng, lat] = feature.geometry.coordinates || [];
    const risk = Number(feature.properties?.twin_risk_score || 30);
    const nearby = Number(feature.properties?.twin_nearby_count || 0);
    const ageHours = Number(feature.properties?.twin_age_hours || 0);

    if (Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))) {
      const riskPart = risk / 100;
      const densityPart = Math.min(nearby, 30) / 30;
      const agePart = Math.min(ageHours, 168) / 168;

      const intensity = Math.min(
        1,
        Math.max(
          0.2,
          riskPart * 0.6 + densityPart * 0.3 + agePart * 0.1
        )
      );

      pts.push([Number(lat), Number(lng), intensity]);
    }
  });

  if (!pts.length) return null;

  return L.heatLayer(pts, {
    radius: 52,
    blur: 36,
    maxZoom: 18,
    minOpacity: 0.42,
    gradient: {
      0.15: "#38bdf8",
      0.35: "#22c55e",
      0.58: "#fde047",
      0.78: "#fb923c",
      1: "#dc2626"
    }
  });
}

  function clearCoverage() {
    if (busCoverageLayer) map.removeLayer(busCoverageLayer);
    if (taxiCoverageLayer) map.removeLayer(taxiCoverageLayer);
    busCoverageLayer = null;
    taxiCoverageLayer = null;
  }

  function clearHeat() {
    if (busHeatLayer) map.removeLayer(busHeatLayer);
    if (problemHeatLayer) map.removeLayer(problemHeatLayer);
    busHeatLayer = null;
    problemHeatLayer = null;
    busHeatOn = false;
    problemHeatOn = false;
  }

  const toRad = (x) => (x * Math.PI) / 180;

  function haversineMeters(a, b) {
    const R = 6371000;
    const dLat = toRad(b.lat - a.lat);
    const dLon = toRad(b.lng - a.lng);
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);

    const s =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;

    return 2 * R * Math.asin(Math.sqrt(s));
  }

  function clearNearest() {
    if (nearestLine) map.removeLayer(nearestLine);
    nearestLine = null;

    if (nearestStopLayer?.setStyle && nearestStopLayer.__origStyle) {
      nearestStopLayer.setStyle(nearestStopLayer.__origStyle);
    }

    nearestStopLayer = null;
  }

  function findNearestBus(fromLatLng) {
    if (!busStopsIndex.length) return null;

    let best = null;

    for (const item of busStopsIndex) {
      const dist = haversineMeters(fromLatLng, item.latlng);
      if (!best || dist < best.dist) best = { ...item, dist };
    }

    return best;
  }

  function showNearestBus(fromLatLng, title) {
    const nearest = findNearestBus(fromLatLng);

    if (!nearest) {
      toastShow("ایستگاه اتوبوس برای محاسبه پیدا نشد", "err");
      return;
    }

    clearNearest();

    nearestStopLayer = nearest.layer;

    if (nearestStopLayer.setStyle) {
      if (!nearestStopLayer.__origStyle) {
        const o = nearestStopLayer.options || {};
        nearestStopLayer.__origStyle = {
          color: o.color,
          weight: o.weight,
          opacity: o.opacity,
          fillColor: o.fillColor,
          fillOpacity: o.fillOpacity,
          radius: o.radius
        };
      }

      nearestStopLayer.setStyle({ radius: 10, weight: 2, fillOpacity: 1 });
    }

    nearestLine = L.polyline([fromLatLng, nearest.latlng], {
      weight: 3,
      opacity: 0.9
    }).addTo(map);

    const { lat, lng } = nearest.latlng;

    nearestStopLayer.bindPopup(`
      <b>نزدیک‌ترین ایستگاه اتوبوس</b><br>
      <b>فاصله:</b> ${toFaNumber(Math.round(nearest.dist))} متر<br>
      <b>مختصات:</b> ${lat.toFixed(6)}, ${lng.toFixed(6)}<br>
      <a href="https://www.google.com/maps?q=${lat},${lng}" target="_blank" rel="noopener">Google Maps</a> •
      <a href="https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=18/${lat}/${lng}" target="_blank" rel="noopener">OSM</a>
    `).openPopup();

    toastShow(`${title}: حدود ${toFaNumber(Math.round(nearest.dist))} متر`, "ok");
  }

  function getCategoryCounts(source = problemsData) {
    const counts = {};
    if (!Array.isArray(source?.features)) return counts;

    source.features.forEach((feature) => {
      const category = getCategory(feature.properties);
      counts[category] = (counts[category] || 0) + 1;
    });

    return counts;
  }

  function makeProblemPopup(props = {}) {
    const cat = getCategory(props);
    const tracking = pick(props, ["tracking_code", "tracking", "code", "کد پیگیری", "کدپيگيري"]);
    const department = pick(props, ["department", "unit", "واحد سازمانی", "واحد"]);
    const address = pick(props, ["address", "نشانی", "آدرس"]);
    const message = pick(props, ["message", "text", "متن پیام", "شرح پیام", "شرح"]);
    const registered = pick(props, ["registered_at", "date", "زمان", "تاریخ ثبت", "زمان ثبت"]);
    const status = pick(props, ["status", "وضعیت"]);

    return `
      <div class="popup-title">مشکل شهری</div>
      <div class="popup-row"><b>دسته:</b> ${escapeHtml(cat)}</div>
      ${tracking ? `<div class="popup-row"><b>کد پیگیری:</b> ${escapeHtml(tracking)}</div>` : ""}
      ${department ? `<div class="popup-row"><b>واحد:</b> ${escapeHtml(department)}</div>` : ""}
      ${address ? `<div class="popup-row"><b>آدرس:</b> ${escapeHtml(address)}</div>` : ""}
      ${registered ? `<div class="popup-row"><b>زمان ثبت:</b> ${escapeHtml(registered)}</div>` : ""}
      ${status ? `<div class="popup-row"><b>وضعیت:</b> ${escapeHtml(status)}</div>` : ""}
      ${message ? `<div class="popup-msg">${escapeHtml(message)}</div>` : ""}
    `;
  }

  function makeTwinPopup(feature) {
    const p = feature.properties || {};

    const reasons = Array.isArray(p.twin_reasons)
      ? p.twin_reasons.map((r) => `<li>${escapeHtml(r)}</li>`).join("")
      : "";

    return `
      <div class="twin-popup">
        <h3>${escapeHtml(p.twin_title || "گزارش شهری")}</h3>

        <div class="twin-popup-row">
          <span>امتیاز ریسک</span>
          <strong style="color:${escapeHtml(p.twin_risk_color || "#38bdf8")};">
            ${toFaNumber(p.twin_risk_score || 0)} از ۱۰۰
          </strong>
        </div>

        <div class="twin-popup-row">
          <span>سطح ریسک</span>
          <strong>${escapeHtml(p.twin_risk_level || "نامشخص")}</strong>
        </div>

        <div class="twin-popup-row">
          <span>گزارش‌های اطراف</span>
          <strong>${toFaNumber(p.twin_nearby_count || 0)}</strong>
        </div>

        <div class="twin-popup-row">
          <span>روند</span>
          <strong>${escapeHtml(p.twin_trend || "نامشخص")}</strong>
        </div>

        <div class="twin-popup-row">
          <span>پیش‌بینی ۷۲ ساعته</span>
          <strong>${escapeHtml(p.twin_prediction_72h?.level || p.twin_trend || "نامشخص")}</strong>
        </div>

        <div class="twin-popup-row">
          <span>احتمال تشدید</span>
          <strong>${toFaNumber(p.twin_escalation_probability || p.twin_prediction_score || 0)}٪</strong>
        </div>

        ${p.twin_landuse ? `
          <div class="twin-popup-row">
            <span>کاربری اطراف</span>
            <strong>${escapeHtml(p.twin_landuse)}</strong>
          </div>` : ""}

        ${p.twin_nearest_hospital_name ? `
          <div class="twin-popup-row">
            <span>نزدیک‌ترین مرکز درمانی</span>
            <strong>${escapeHtml(p.twin_nearest_hospital_name)} (${toFaNumber(p.twin_nearest_hospital_distance_m || 0)} متر)</strong>
          </div>` : ""}

        ${reasons ? `<hr><b>دلایل تحلیل:</b><ul>${reasons}</ul>` : ""}

        <div class="twin-recommendation">
          <b>پیشنهاد اقدام:</b>
          <p>${escapeHtml(p.twin_recommendation || "ثبت در صف بررسی و پایش دوره‌ای")}</p>
        </div>

        <button class="twin-popup-btn" type="button" onclick="window.runTwinScenario('${escapeJsSingle(p.twin_id || "")}')">
          اجرای سناریوی اقدام
        </button>
      </div>
    `;
  }

  function filteredProblems() {
    if (!problemsData?.features) {
      return { type: "FeatureCollection", features: [] };
    }

    return {
      type: "FeatureCollection",
      features: problemsData.features.filter((f) => {
        return !activeProblemCategory || getCategory(f.properties) === activeProblemCategory;
      })
    };
  }

  function removeProblemsLayerFromMapAndControl() {
    if (!problemsLayer) return;

    try {
      layersControl.removeLayer(problemsLayer);
    } catch (e) {}

    if (map.hasLayer(problemsLayer)) {
      map.removeLayer(problemsLayer);
    }

    problemsLayer = null;
  }
