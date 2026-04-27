const NS = {
  "0": { l: "Under Way (Engine)", c: "underway" },
  "1": { l: "At Anchor", c: "anchor" },
  "2": { l: "Not Under Command", c: "other" },
  "3": { l: "Restricted Manoeuvr", c: "other" },
  "4": { l: "Constrained Draft", c: "other" },
  "5": { l: "Moored", c: "moored" },
  "6": { l: "Aground", c: "other" },
  "7": { l: "Engaged Fishing", c: "underway" },
  "8": { l: "Under Way (Sail)", c: "underway" },
  "9": { l: "HSC", c: "underway" },
  "10": { l: "WIG", c: "underway" },
  "11": { l: "Power-driven Tow", c: "underway" },
  "12": { l: "Towing Alongside", c: "underway" },
  "13": { l: "Reserved", c: "other" },
  "14": { l: "AIS-SART", c: "other" },
  "15": { l: "Not Defined", c: "other" },
};

const nsInfo = code => NS[String(code)] || { l: "Unknown", c: "other" };

const CLR = {
  underway: "#38b6e8",
  moored: "#f5a623",
  anchor: "#9b7dea",
  other: "#4d7a9e"
};

// map setup
const map = L.map("map", { zoomControl: false, attributionControl: false, maxZoom: 22, minZoom: 1 });
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 22 }).addTo(map);
map.setView([20, 10], 3);

map.on("mousemove", e => {
  document.getElementById("c-lat").textContent = e.latlng.lat.toFixed(4);
  document.getElementById("c-lng").textContent = e.latlng.lng.toFixed(4);
});

map.on("zoomend", () => {
  const z = map.getZoom();
  document.getElementById("c-z").textContent = z;
  document.getElementById("zoom-lbl").textContent = "z" + z;
  redrawCanvas();
});

map.on("moveend", redrawCanvas);
map.on("move", redrawCanvas);

document.getElementById("c-z").textContent = map.getZoom();
document.getElementById("zoom-lbl").textContent = "z" + map.getZoom();

// canvas overlay
const vc = document.getElementById("vessel-canvas");
const ctx = vc.getContext("2d");
let canvasW = 0, canvasH = 0;

function resizeCanvas() {
  canvasW = vc.width = window.innerWidth;
  canvasH = vc.height = window.innerHeight;
  redrawCanvas();
}
window.addEventListener("resize", resizeCanvas);

function drawVessel(px, py, angleDeg, cls, alpha, highlight) {
  const z = map.getZoom();
  let sz = 8;
  if (z <= 3) sz = 3;
  else if (z <= 5) sz = 4;
  else if (z <= 7) sz = 5;
  else if (z <= 9) sz = 6;

  const clr = CLR[cls];
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(angleDeg * Math.PI / 180);
  ctx.globalAlpha = highlight ? 1 : alpha;
  ctx.beginPath();

  if (cls === "underway") {
    ctx.moveTo(0, -sz * 1.5);
    ctx.lineTo(sz * .8, sz * .8);
    ctx.lineTo(-sz * .8, sz * .8);
    ctx.closePath();
  } else if (cls === "moored") {
    ctx.rect(-sz * .75, -sz * .75, sz * 1.5, sz * 1.5);
  } else if (cls === "anchor") {
    ctx.moveTo(0, sz * 1.3);
    ctx.lineTo(sz * .8, -sz * .7);
    ctx.lineTo(-sz * .8, -sz * .7);
    ctx.closePath();
  } else {
    ctx.arc(0, 0, sz * .75, 0, Math.PI * 2);
  }

  ctx.fillStyle = highlight ? "#fff" : clr;
  ctx.fill();

  if (highlight && cls !== "other") {
    ctx.strokeStyle = clr;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  ctx.restore();
}

function redrawCanvas() {
  if (!allVessels || !allVessels.length) return;
  ctx.clearRect(0, 0, canvasW, canvasH);
  const z = map.getZoom();
  const alpha = z <= 3 ? 0.72 : 0.88;

  for (let i = 0; i < allVessels.length; i++) {
    const f = allVessels[i];
    const [lng, lat] = f.geometry.coordinates;
    const pt = map.latLngToContainerPoint([lat, lng]);
    if (pt.x < -20 || pt.x > canvasW + 20 || pt.y < -20 || pt.y > canvasH + 20) continue;
    const p = f.properties;
    const cls = nsInfo(p.navstat).c;
    const heading = (p.heading != null && +p.heading !== 511) ? +p.heading : (+p.course || 0);
    drawVessel(pt.x, pt.y, heading, cls, alpha, selectedIdx === i);
  }
}

// app state
let allVessels = [], filteredCache = [], searchIndex = [];
let selectedIdx = -1, selectedFeature = null;
let activeFilter = "all", searchQuery = "", sDeb = null;
let leftCollapsed = false, vsScroll = 0;
const ROW_H = 66;
let allBounds = null;

resizeCanvas();

function toggleLeft() {
  leftCollapsed = !leftCollapsed;
  document.getElementById("left-panel").classList.toggle("collapsed", leftCollapsed);
}

function fitAll() {
  if (allBounds) map.fitBounds(allBounds, { padding: [10, 10] });
}

function setProgress(p, t) {
  document.getElementById("lbar").style.width = p + "%";
  if (t) document.getElementById("lsub").textContent = t;
}

let coordCopyTimer = null;
function copyCoords() {
  const lat = document.getElementById("c-lat").textContent;
  const lng = document.getElementById("c-lng").textContent;
  if (lat === "—") return;
  navigator.clipboard.writeText(lat + ", " + lng);
  document.querySelectorAll(".coord-chip").forEach(el => el.classList.add("copied"));
  clearTimeout(coordCopyTimer);
  coordCopyTimer = setTimeout(() => {
    document.querySelectorAll(".coord-chip").forEach(el => el.classList.remove("copied"));
  }, 1500);
}

// hover tooltip
const hitR = 12;
let hoverIdx = -1;
const htip = document.getElementById("htip");

function showTip(f, ev) {
  const p = f.properties;
  const [lng, lat] = f.geometry.coordinates;
  const ni = nsInfo(p.navstat);
  document.getElementById("ht-name").textContent = p.name || "Unknown";
  document.getElementById("ht-mmsi").textContent = p.mmsi;
  document.getElementById("ht-lat").textContent = lat.toFixed(4) + "°";
  document.getElementById("ht-lng").textContent = lng.toFixed(4) + "°";
  const hdg = (p.heading != null && +p.heading !== 511)
    ? (+p.heading) + "°"
    : "COG " + (+p.course || 0).toFixed(1) + "°";
  document.getElementById("ht-hdg").textContent = hdg;
  document.getElementById("ht-spd").textContent = (p.speed != null ? (+p.speed).toFixed(1) : 0) + " kn";
  document.getElementById("ht-st").textContent = ni.l;
  htip.classList.add("on");
  posTip(ev);
}

function hideTip() {
  htip.classList.remove("on");
}

function posTip(ev) {
  const tw = htip.offsetWidth || 180;
  const th = htip.offsetHeight || 120;
  let x = ev.clientX + 16;
  let y = ev.clientY - th / 2;
  if (x + tw > window.innerWidth - 8) x = ev.clientX - tw - 16;
  if (y < 8) y = 8;
  if (y + th > window.innerHeight - 8) y = window.innerHeight - th - 8;
  htip.style.left = x + "px";
  htip.style.top = y + "px";
}

map.on("mousemove", e => {
  const { x, y } = e.containerPoint;
  let best = -1, bestD = hitR * hitR;
  for (let i = 0; i < allVessels.length; i++) {
    const [lng, lat] = allVessels[i].geometry.coordinates;
    const pt = map.latLngToContainerPoint([lat, lng]);
    const d2 = (pt.x - x) ** 2 + (pt.y - y) ** 2;
    if (d2 < bestD) { bestD = d2; best = i; }
  }
  if (best !== hoverIdx) {
    hoverIdx = best;
    best >= 0 ? showTip(allVessels[best], e.originalEvent) : hideTip();
  } else if (best >= 0) {
    posTip(e.originalEvent);
  }
});
map.on("mouseout", hideTip);

map.on("click", e => {
  const { x, y } = e.containerPoint;
  let best = -1, bestD = hitR * hitR * 4;
  for (let i = 0; i < allVessels.length; i++) {
    const [lng, lat] = allVessels[i].geometry.coordinates;
    const pt = map.latLngToContainerPoint([lat, lng]);
    const d2 = (pt.x - x) ** 2 + (pt.y - y) ** 2;
    if (d2 < bestD) { bestD = d2; best = i; }
  }
  if (best >= 0) {
    selectedIdx = best;
    selectedFeature = allVessels[best];
    const [lng, lat] = allVessels[best].geometry.coordinates;
    map.flyTo([lat, lng], Math.max(map.getZoom(), 12), { duration: 0.7 });
    showDetail(allVessels[best]);
    renderList(false);
    redrawCanvas();
  }
});

// load geojson
function loadGeoJSON(geojson) {
  allVessels = geojson.features || [];
  searchIndex = [];
  setProgress(8, "indexing…");

  let uw = 0, mo = 0, an = 0;
  for (let i = 0; i < allVessels.length; i++) {
    const p = allVessels[i].properties;
    searchIndex.push(String(p.mmsi) + " " + (p.name || "").toLowerCase());
    const c = nsInfo(p.navstat).c;
    if (c === "underway") uw++;
    else if (c === "moored") mo++;
    else if (c === "anchor") an++;
  }

  document.getElementById("s-total").textContent = allVessels.length.toLocaleString();
  document.getElementById("s-uw").textContent = uw.toLocaleString();
  document.getElementById("s-mo").textContent = mo.toLocaleString();
  document.getElementById("s-an").textContent = an.toLocaleString();

  if (allVessels.length) {
    allBounds = L.latLngBounds(allVessels.map(f => [f.geometry.coordinates[1], f.geometry.coordinates[0]]));
    map.fitBounds(allBounds, { padding: [10, 10] });
  }

  const CHUNK = 1000;
  const total = allVessels.length;
  let idx = 0;

  function chunk() {
    idx = Math.min(idx + CHUNK, total);
    setProgress(8 + Math.round((idx / total) * 88), `rendering… ${idx.toLocaleString()} / ${total.toLocaleString()}`);
    redrawCanvas();
    if (idx < total) {
      window.requestIdleCallback ? requestIdleCallback(chunk, { timeout: 40 }) : setTimeout(chunk, 0);
    } else {
      setProgress(100, "done");
      setTimeout(() => document.getElementById("loader").classList.add("done"), 300);
      applyFilter();
    }
  }

  window.requestIdleCallback ? requestIdleCallback(chunk, { timeout: 40 }) : setTimeout(chunk, 0);
}

// filter + search
function applyFilter() {
  const q = searchQuery.toLowerCase();
  filteredCache = [];

  for (let i = 0; i < allVessels.length; i++) {
    const cls = nsInfo(allVessels[i].properties.navstat).c;
    if (activeFilter !== "all" && cls !== activeFilter) continue;
    if (q && !searchIndex[i].includes(q)) continue;
    filteredCache.push(i);
  }

  filteredCache.sort((a, b) => {
    const na = allVessels[a].properties.name;
    const nb = allVessels[b].properties.name;
    if (!na && nb) return 1;
    if (na && !nb) return -1;
    return 0;
  });

  document.getElementById("vcnt").textContent = filteredCache.length.toLocaleString();
  renderList(true);
}

// virtual scroll list
function renderList(reset) {
  const outer = document.getElementById("vlist-outer");
  const inner = document.getElementById("vlist-inner");
  const vp = document.getElementById("vlist-vp");

  if (!filteredCache.length) {
    inner.style.height = "60px";
    vp.innerHTML = '<div class="no-data" style="position:static">No vessels match</div>';
    return;
  }

  inner.style.height = (filteredCache.length * ROW_H) + "px";

  if (reset) {
    outer.scrollTop = 0;
    vsScroll = 0;
  } else {
    vsScroll = outer.scrollTop;
  }

  const cH = outer.clientHeight || 400;
  const si = Math.max(0, Math.floor(vsScroll / ROW_H) - 1);
  const ei = Math.min(filteredCache.length - 1, si + Math.ceil(cH / ROW_H) + 2);
  const frag = document.createDocumentFragment();

  for (let vi = si; vi <= ei; vi++) {
    const fi = filteredCache[vi];
    const f = allVessels[fi];
    const p = f.properties;
    const ni = nsInfo(p.navstat);
    const dest = p.destination && p.destination.trim() ? p.destination.trim() : null;

    const el = document.createElement("div");
    el.className = "vitem" + (selectedIdx === fi ? " sel" : "");
    el.style.top = (vi * ROW_H) + "px";
    el.dataset.fi = fi;
    el.innerHTML = `<div class="vi-name">${p.name || "Unknown"}</div>
<div class="vi-mmsi">${p.mmsi}</div>
<div class="vi-row"><span class="vi-tag ${ni.c}">${ni.l}</span><span class="vi-spd"><b>${p.speed != null ? (+p.speed).toFixed(1) : "—"}</b> kn</span></div>
<div class="vi-dest">${dest ? `→ <span>${dest}</span>` : '<span style="color:var(--text3)">No destination</span>'}</div>`;

    el.addEventListener("click", () => {
      const fIdx = +el.dataset.fi;
      selectedIdx = fIdx;
      selectedFeature = allVessels[fIdx];
      const [lng, lat] = allVessels[fIdx].geometry.coordinates;
      map.flyTo([lat, lng], Math.max(map.getZoom(), 12), { duration: .7 });
      showDetail(allVessels[fIdx]);
      renderList(false);
      redrawCanvas();
    });

    frag.appendChild(el);
  }

  vp.innerHTML = "";
  vp.appendChild(frag);
}

document.getElementById("vlist-outer").addEventListener("scroll", function() {
  if (!filteredCache.length) return;
  if (Math.abs(this.scrollTop - vsScroll) > ROW_H * 2) renderList(false);
}, { passive: true });

// detail panel
function closeDetail() {
  selectedIdx = -1;
  selectedFeature = null;
  document.getElementById("right-panel").classList.remove("open");
  renderList(false);
  redrawCanvas();
}

function showDetail(f) {
  const p = f.properties;
  const [lng, lat] = f.geometry.coordinates;
  const ni = nsInfo(p.navstat);
  const color = CLR[ni.c];

  const speed = p.speed != null ? +p.speed : null;
  const course = p.course != null ? +p.course : null;
  const hv = p.heading != null && +p.heading !== 511;
  const heading = hv ? +p.heading : (course || 0);
  const sogPct = Math.min(((speed || 0) / 25) * 100, 100);
  const dest = p.destination && p.destination.trim() ? p.destination.trim() : null;
  const eta = (p.eta && p.eta !== "00-00 00:00") ? p.eta : null;
  const vc2 = { underway: "sky", moored: "amber", anchor: "purple", other: "" }[ni.c];

  document.getElementById("rp-content").innerHTML = `
<div class="rp-header">
  <div class="rp-name">${p.name || "Unknown Vessel"}</div>
  <div class="rp-mmsi">MMSI · ${p.mmsi}</div>
  <span class="status-badge ${ni.c}">${ni.l}</span>
  ${dest ? `<div class="voyage-box"><span class="voyage-arrow">→</span><span class="voyage-dest">${dest}</span>${eta ? `<div class="voyage-eta"><div class="voyage-eta-lbl">ETA</div><div class="voyage-eta-val">${eta}</div></div>` : ""}</div>` : ""}
</div>
<div class="rp-section">
  <div class="rp-sec-title">Movement</div>
  <div class="spd-grid">
    <div class="spd-box"><div class="spd-val" style="color:${color}">${speed != null ? speed.toFixed(1) : "—"}</div><div class="spd-lbl">Speed kn</div></div>
    <div class="spd-box"><div class="spd-val" style="color:var(--text2)">${course != null ? course.toFixed(1) : "—"}°</div><div class="spd-lbl">Course</div></div>
  </div>
  <div class="bar-labels"><span>Speed over ground</span><span>${speed != null ? speed.toFixed(1) : 0} / 25 kn</span></div>
  <div class="bar-track"><div class="bar-fill" style="width:${sogPct}%"></div></div>
</div>
<div class="rp-section">
  <div class="rp-sec-title">Heading</div>
  <div class="compass-wrap"><div class="compass"><div class="c-needle" style="transform:rotate(${heading}deg)"><div class="c-n-top"></div><div class="c-n-bot"></div></div></div></div>
  <div class="kv"><span class="kk">True Heading</span><span class="kv-val coral">${hv ? heading.toFixed(0) + "°" : "511 — N/A"}</span></div>
  <div class="kv"><span class="kk">Course Over Ground</span><span class="kv-val">${course != null ? course.toFixed(1) + "°" : "—"}</span></div>
</div>
<div class="rp-section">
  <div class="rp-sec-title">Voyage</div>
  <div class="kv"><span class="kk">Destination</span><span class="kv-val sky" style="max-width:155px;text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${dest || "—"}</span></div>
  <div class="kv"><span class="kk">ETA</span><span class="kv-val">${eta || "—"}</span></div>
</div>
<div class="rp-section">
  <div class="rp-sec-title">Navigation</div>
  <div class="kv"><span class="kk">Status</span><span class="kv-val ${vc2}">${ni.l}</span></div>
  <div class="kv"><span class="kk">Navstat Code</span><span class="kv-val">${p.navstat ?? "—"}</span></div>
</div>
<div class="rp-section">
  <div class="rp-sec-title">Position</div>
  <div class="kv"><span class="kk">Latitude</span><span class="kv-val coral">${lat.toFixed(5)}°</span></div>
  <div class="kv"><span class="kk">Longitude</span><span class="kv-val coral">${lng.toFixed(5)}°</span></div>
</div>`;

  document.getElementById("right-panel").classList.add("open");
  document.getElementById("right-panel").scrollTop = 0;
}

// bbox draw tool
let bboxRect = null, drawMode = false, drawStart = null, drawEnd = null, tempRect = null;

function startDraw() {
  drawMode = true;
  map.getContainer().style.cursor = "crosshair";
  const btn = document.getElementById("draw-btn");
  btn.style.background = "rgba(56,182,232,0.2)";
  btn.style.borderColor = "var(--sky)";
}

map.on("mousedown", e => {
  if (!drawMode) return;
  drawStart = e.latlng;
  drawEnd = e.latlng;
  if (tempRect) { map.removeLayer(tempRect); tempRect = null; }
  tempRect = L.rectangle([drawStart, drawEnd], {
    color: "#38b6e8", weight: 1.5,
    fillColor: "#38b6e8", fillOpacity: .08, dashArray: "5 4"
  }).addTo(map);
  map.dragging.disable();
  L.DomEvent.stopPropagation(e);
});

map.on("mousemove", e => {
  if (drawMode && drawStart) {
    drawEnd = e.latlng;
    if (tempRect) tempRect.setBounds([drawStart, drawEnd]);
  }
});

map.on("mouseup", e => {
  if (!drawMode || !drawStart) return;
  drawEnd = e.latlng;
  map.dragging.enable();
  drawMode = false;
  map.getContainer().style.cursor = "";

  const btn = document.getElementById("draw-btn");
  btn.style.background = "";
  btn.style.borderColor = "";

  if (tempRect) { map.removeLayer(tempRect); tempRect = null; }

  const s = Math.min(drawStart.lat, drawEnd.lat);
  const n = Math.max(drawStart.lat, drawEnd.lat);
  const w = Math.min(drawStart.lng, drawEnd.lng);
  const eo = Math.max(drawStart.lng, drawEnd.lng);

  if (Math.abs(n - s) < .001 && Math.abs(eo - w) < .001) { drawStart = null; return; }

  if (bboxRect) map.removeLayer(bboxRect);
  bboxRect = L.rectangle([[s, w], [n, eo]], {
    color: "#38b6e8", weight: 1.5,
    fillColor: "#38b6e8", fillOpacity: .06, dashArray: "5 4"
  }).addTo(map);
  map.fitBounds([[s, w], [n, eo]], { padding: [30, 30], animate: true, duration: .5 });

  document.getElementById("bb-slat").value = s.toFixed(4);
  document.getElementById("bb-wlng").value = w.toFixed(4);
  document.getElementById("bb-nlat").value = n.toFixed(4);
  document.getElementById("bb-elng").value = eo.toFixed(4);

  showBboxResult(countInBox(s, w, n, eo), "vessel(s) inside drawn box");
  drawStart = null;
});

function runBbox() {
  const sl = parseFloat(document.getElementById("bb-slat").value);
  const wl = parseFloat(document.getElementById("bb-wlng").value);
  const nl = parseFloat(document.getElementById("bb-nlat").value);
  const el = parseFloat(document.getElementById("bb-elng").value);
  if ([sl, wl, nl, el].some(isNaN)) { alert("Please fill all four coordinate fields."); return; }

  const s = Math.min(sl, nl), n = Math.max(sl, nl);
  const w = Math.min(wl, el), eo = Math.max(wl, el);

  if (bboxRect) map.removeLayer(bboxRect);
  bboxRect = L.rectangle([[s, w], [n, eo]], {
    color: "#38b6e8", weight: 1.5,
    fillColor: "#38b6e8", fillOpacity: .06, dashArray: "5 4"
  }).addTo(map);
  map.fitBounds([[s, w], [n, eo]], { padding: [30, 30], animate: true, duration: .5 });
  showBboxResult(countInBox(s, w, n, eo), "vessel(s) in typed bounds");
}

function countInBox(s, w, n, eo) {
  let count = 0;
  for (let i = 0; i < allVessels.length; i++) {
    const [lng, lat] = allVessels[i].geometry.coordinates;
    if (lat >= s && lat <= n && lng >= w && lng <= eo) count++;
  }
  return count;
}

function showBboxResult(cnt, msg) {
  document.getElementById("bbox-num").textContent = cnt.toLocaleString();
  document.getElementById("bbox-msg").textContent = msg;
  document.getElementById("bbox-res").classList.add("show");
}

["bb-slat", "bb-wlng", "bb-nlat", "bb-elng"].forEach(id => {
  document.getElementById(id).addEventListener("keydown", e => {
    if (e.key === "Enter") runBbox();
  });
});

// event wiring
document.querySelectorAll(".fchip").forEach(chip => {
  chip.addEventListener("click", () => {
    document.querySelectorAll(".fchip").forEach(c => c.classList.remove("active"));
    chip.classList.add("active");
    activeFilter = chip.dataset.f;
    applyFilter();
  });
});

document.getElementById("search-inp").addEventListener("input", e => {
  clearTimeout(sDeb);
  sDeb = setTimeout(() => { searchQuery = e.target.value; applyFilter(); }, 200);
});

document.getElementById("file-input").addEventListener("change", e => {
  const file = e.target.files[0];
  if (!file) return;
  document.getElementById("loader").classList.remove("done");
  setProgress(0, "reading file…");
  const reader = new FileReader();
  reader.onload = evt => {
    try {
      setProgress(5, "parsing…");
      setTimeout(() => loadGeoJSON(JSON.parse(evt.target.result)), 50);
    } catch {
      alert("Invalid GeoJSON.");
      document.getElementById("loader").classList.add("done");
    }
  };
  reader.readAsText(file);
});

// AIS raw decoder
function decodeAisType123(hexData) {
  try {
    const hexClean = hexData.replace(/\s/g, "");
    if (!hexClean) return null;

    const binary = BigInt("0x" + hexClean).toString(2).padStart(hexClean.length * 4, "0");
    const msgType = parseInt(binary.slice(0, 6), 2);
    if (![1, 2, 3].includes(msgType)) return null;

    const mmsi = parseInt(binary.slice(8, 38), 2);
    const navStatus = parseInt(binary.slice(38, 42), 2);
    const sogRaw = parseInt(binary.slice(50, 60), 2);
    const lonRaw = parseInt(binary.slice(61, 89), 2);
    const latRaw = parseInt(binary.slice(89, 116), 2);
    const cogRaw = parseInt(binary.slice(116, 128), 2);
    const headingRaw = parseInt(binary.slice(128, 137), 2);

    const longitude = (lonRaw & 0x8000000) ? (lonRaw - 0x10000000) / 600000 : lonRaw / 600000;
    const latitude = (latRaw & 0x4000000) ? (latRaw - 0x8000000) / 600000 : latRaw / 600000;

    if (Math.abs(longitude) > 180 || Math.abs(latitude) > 90) return null;

    return {
      mmsi: String(mmsi),
      name: `Vessel_${mmsi}`,
      speed: sogRaw !== 1023 ? sogRaw / 10 : 0,
      course: cogRaw !== 3600 ? cogRaw / 10 : 360,
      heading: headingRaw,
      navstat: String(navStatus),
      destination: "",
      eta: "00-00 00:00",
      latitude: Math.round(latitude * 1e6) / 1e6,
      longitude: Math.round(longitude * 1e6) / 1e6,
    };
  } catch {
    return null;
  }
}

function parseAisText(text) {
  const lines = text.split(/\r?\n/);
  const records = [];
  let cur = {};

  for (const raw of lines) {
    const line = raw.trim();
    if (line.includes("ACCEPTED FRAME")) {
      if (cur.hexData) {
        const dec = decodeAisType123(cur.hexData);
        if (dec) records.push(dec);
      }
      cur = {};
    } else if (line.includes(":")) {
      const colon = line.indexOf(":");
      const key = line.slice(0, colon).trim();
      const val = line.slice(colon + 1).trim();
      if (key === "Data (hex)" || key === "Data") cur.hexData = val;
    }
  }

  if (cur.hexData) {
    const dec = decodeAisType123(cur.hexData);
    if (dec) records.push(dec);
  }

  return records;
}

function aisRecordsToGeoJSON(records) {
  return {
    type: "FeatureCollection",
    features: records.map(r => ({
      type: "Feature",
      properties: {
        mmsi: r.mmsi,
        name: r.name,
        speed: r.speed,
        course: r.course,
        heading: r.heading,
        navstat: r.navstat,
        destination: r.destination,
        eta: r.eta,
      },
      geometry: { type: "Point", coordinates: [r.longitude, r.latitude] },
    })),
  };
}

document.getElementById("ais-raw-input").addEventListener("change", e => {
  const file = e.target.files[0];
  if (!file) return;
  document.getElementById("loader").classList.remove("done");
  setProgress(0, "reading AIS file…");
  const reader = new FileReader();
  reader.onload = evt => {
    setTimeout(() => {
      setProgress(10, "decoding AIS messages…");
      const records = parseAisText(evt.target.result);
      if (!records.length) {
        alert("No valid AIS Type 1/2/3 position reports found in the file.");
        document.getElementById("loader").classList.add("done");
        return;
      }
      setProgress(40, `decoded ${records.length} vessels…`);
      loadGeoJSON(aisRecordsToGeoJSON(records));
    }, 50);
  };
  reader.readAsText(file);
  e.target.value = "";
});

if (window.AIS_DATA) {
  loadGeoJSON(window.AIS_DATA);
} else {
  document.getElementById("loader").classList.add("done");
}
