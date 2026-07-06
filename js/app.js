/* Eichler Finder — tract picker + model-family identification quiz */

let TRACTS = [];
let FAMILIES = [];
let QUIZ = [];
let selectedTract = null;

const $ = (sel) => document.querySelector(sel);

async function init() {
  const [tractsRes, modelsRes] = await Promise.all([
    fetch("data/tracts.json"),
    fetch("data/model-families.json"),
  ]);
  const tractsData = await tractsRes.json();
  const modelsData = await modelsRes.json();
  TRACTS = tractsData.tracts;
  FAMILIES = modelsData.families;
  QUIZ = modelsData.quiz;

  buildRegionSelect();
  buildTractSelect("");
  buildQuiz();
  wireEvents();
}

function buildRegionSelect() {
  const regions = [...new Set(TRACTS.map((t) => t.region))];
  const sel = $("#region-select");
  for (const r of regions) {
    const opt = document.createElement("option");
    opt.value = r;
    opt.textContent = r;
    sel.appendChild(opt);
  }
}

function buildTractSelect(region) {
  const sel = $("#tract-select");
  sel.innerHTML = '<option value="">Select your neighborhood…</option>';
  TRACTS.filter((t) => !region || t.region === region)
    .sort((a, b) => a.city.localeCompare(b.city) || a.name.localeCompare(b.name))
    .forEach((t) => {
      const opt = document.createElement("option");
      opt.value = t.id;
      opt.textContent = `${t.city} — ${t.name}`;
      sel.appendChild(opt);
    });
}

function showTractInfo(tract) {
  const box = $("#tract-info");
  if (!tract) {
    box.classList.add("hidden");
    return;
  }
  const years =
    tract.yearStart === tract.yearEnd
      ? tract.yearStart
      : `${tract.yearStart}–${tract.yearEnd}`;
  const architects = tract.architects.length
    ? tract.architects.join(", ")
    : "Not yet documented";
  const homes = tract.homes ? `~${tract.homes}` : "Not yet documented";
  box.innerHTML = `
    <h3>${tract.name}, ${tract.city}${
      tract.historic ? `<span class="badge">${tract.historic}</span>` : ""
    }</h3>
    <dl>
      <dt>Built</dt><dd>${years}</dd>
      <dt>Architects</dt><dd>${architects}</dd>
      <dt>Homes</dt><dd>${homes}</dd>
      <dt>Where</dt><dd>${tract.streets || "—"}</dd>
    </dl>
    <p>${tract.notes || ""}</p>`;
  box.classList.remove("hidden");
}

function buildQuiz() {
  const form = $("#quiz-form");
  form.innerHTML = QUIZ.map(
    (q) => `
    <div class="quiz-q" data-q="${q.id}">
      <p>${q.question}</p>
      ${q.options
        .map(
          (o) => `
        <label>
          <input type="radio" name="${q.id}" value="${o.id}">${o.label}
          ${o.hint ? `<span class="hint">${o.hint}</span>` : ""}
        </label>`
        )
        .join("")}
    </div>`
  ).join("");
}

/* scoring: each answer adds points to model families */
const SCORING = {
  entry: {
    sky: { atrium: 3 },
    hall: { gallery: 3 },
    living: { "early-flattop": 2, "gable-classic": 1 },
    "court-before": { courtyard: 3 },
  },
  roof: {
    flat: { "early-flattop": 2, gallery: 1, atrium: 1 },
    "low-gable": { "gable-classic": 2, atrium: 1, courtyard: 1 },
    "steep-gable": { "double-aframe": 3 },
    unsure: {},
  },
  stories: {
    one: {},
    split: { "two-story": 4 },
    two: { "two-story": 4 },
  },
};

function computeScores(answers) {
  const scores = Object.fromEntries(FAMILIES.map((f) => [f.id, 0]));
  for (const [qid, aid] of Object.entries(answers)) {
    const pts = (SCORING[qid] || {})[aid] || {};
    for (const [fam, p] of Object.entries(pts)) scores[fam] += p;
  }
  // era bonus: family plausible for the selected tract's build years
  if (selectedTract) {
    for (const f of FAMILIES) {
      const overlaps =
        f.eraStart <= selectedTract.yearEnd && f.eraEnd >= selectedTract.yearStart;
      if (overlaps) scores[f.id] += 1;
    }
  }
  return scores;
}

function eraMismatch(family) {
  if (!selectedTract) return false;
  return !(
    family.eraStart <= selectedTract.yearEnd &&
    family.eraEnd >= selectedTract.yearStart
  );
}

function renderResult(answers) {
  const scores = computeScores(answers);
  const ranked = FAMILIES.map((f) => ({ f, score: scores[f.id] }))
    .sort((a, b) => b.score - a.score)
    .filter((r) => r.score > 0);

  const box = $("#result");
  if (!ranked.length) {
    box.innerHTML =
      "<p>We couldn't narrow it down — try answering at least the front-door question, it's the most telling one.</p>";
    return;
  }

  const [top, ...rest] = ranked;
  const runners = rest.slice(0, 2);

  let html = familyCard(top.f, true);

  if (selectedTract) {
    const years =
      selectedTract.yearStart === selectedTract.yearEnd
        ? selectedTract.yearStart
        : `${selectedTract.yearStart}–${selectedTract.yearEnd}`;
    if (eraMismatch(top.f)) {
      html += `<div class="tract-note warn"><strong>Heads up:</strong> ${top.f.name} homes are usually ${top.f.era}, but ${selectedTract.name} was built ${years}. Your home may be a remodel, or double-check your answers.</div>`;
    } else {
      html += `<div class="tract-note">This fits: ${selectedTract.name} was built ${years}${
        selectedTract.architects.length
          ? " by " + selectedTract.architects.join(" and ")
          : ""
      }, right in the ${top.f.name} era.</div>`;
    }
  }

  if (runners.length) {
    html += `<p><strong>Also possible:</strong></p>`;
    html += runners.map((r) => familyCard(r.f, false)).join("");
  }
  box.innerHTML = html;
}

function familyCard(f, isTop) {
  if (isTop) {
    return `
      <div class="result-top">
        <h3>${f.name}</h3>
        <p class="era">${f.era} · ${f.architects.join(", ")}</p>
        <p>${f.description}</p>
        <p><strong>Telltale signs:</strong></p>
        <ul class="spot-list">${f.howToSpot.map((s) => `<li>${s}</li>`).join("")}</ul>
      </div>`;
  }
  return `
    <div class="result-runner">
      <h4>${f.name} <small>(${f.era})</small></h4>
      <p>${f.signature}.</p>
    </div>`;
}

/* ---- address lookup (Nominatim / OpenStreetMap) ---- */

const STREET_SUFFIX =
  /\b(drive|dr|avenue|ave|way|road|rd|court|ct|lane|ln|boulevard|blvd|street|st|parkway|pkwy|circle|cir|place|pl)\b\.?/g;

function normStreet(s) {
  return s
    .toLowerCase()
    .replace(STREET_SUFFIX, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tractStreets(t) {
  if (!t.streets) return [];
  return t.streets
    .replace(/\([^)]*\)/g, "")
    .split(/[,;]/)
    .map(normStreet)
    .filter(Boolean);
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

async function geocodeOnce(query) {
  const url =
    "https://nominatim.openstreetmap.org/search?" +
    new URLSearchParams({
      q: query,
      format: "jsonv2",
      limit: "1",
      countrycodes: "us",
      addressdetails: "1",
    });
  const res = await fetch(url, { headers: { "Accept-Language": "en" } });
  if (!res.ok) throw new Error("geocoder unavailable");
  const results = await res.json();
  return results[0] || null;
}

async function geocode(query) {
  // retry chain for addresses Nominatim can't resolve as typed
  // (e.g. unincorporated areas filed under a different place name)
  const attempts = [query];
  const noNumber = query.replace(/^\s*\d+[\s,]+/, "");
  if (noNumber !== query) attempts.push(noNumber);
  const streetOnly = noNumber.split(",")[0].trim();
  if (streetOnly && streetOnly !== noNumber) attempts.push(streetOnly + ", California");
  for (const q of attempts) {
    const hit = await geocodeOnce(q);
    if (hit) return hit;
    await new Promise((r) => setTimeout(r, 1100)); // respect Nominatim rate limit
  }
  return null;
}

function matchTract(geo) {
  const road = normStreet(geo.address?.road || "");
  const addrBlob = Object.values(geo.address || {}).join(" ").toLowerCase();
  const lat = parseFloat(geo.lat);
  const lon = parseFloat(geo.lon);

  const candidates = TRACTS.map((t) => {
    const cityNorm = t.city.replace(/\([^)]*\)/g, "").trim().toLowerCase();
    const paren = t.city.match(/\(([^)]*)\)/);
    const cityOk =
      addrBlob.includes(cityNorm) ||
      (paren ? addrBlob.includes(paren[1].toLowerCase()) : false);
    const dist = t.centroid
      ? haversineKm(lat, lon, t.centroid[0], t.centroid[1])
      : Infinity;
    // street-name matches count when the city agrees OR the address is close by
    // (unincorporated areas like Lucas Valley geocode under a different city name)
    const streetHit = !!road && tractStreets(t).includes(road) && (cityOk || dist < 5);
    return { t, streetHit, cityOk, dist };
  }).sort((a, b) => Number(b.streetHit) - Number(a.streetHit) || a.dist - b.dist);

  const top = candidates[0];
  if (!top) return { confidence: "none" };
  if (top.streetHit) return { ...top, confidence: "street" };
  if (top.dist < 1.2 && top.t.centroidPrecision === "street")
    return { ...top, confidence: "near" };
  if (top.dist < 3) return { ...top, confidence: "nearby" };
  return { confidence: "none", nearest: top };
}

function setStatus(msg, cls) {
  const el = $("#address-status");
  el.textContent = msg;
  el.className = "address-status" + (cls ? " " + cls : "");
}

function selectTractInUI(tract) {
  $("#region-select").value = "";
  buildTractSelect("");
  $("#tract-select").value = tract.id;
  selectedTract = tract;
  showTractInfo(tract);
}

async function handleAddressLookup(e) {
  e.preventDefault();
  const query = $("#address-input").value.trim();
  if (!query) return;
  setStatus("Looking up your address…");
  $("#btn-address").disabled = true;
  try {
    const geo = await geocode(query + (/california|,\s*ca\b/i.test(query) ? "" : ", California"));
    if (!geo) {
      setStatus("Couldn't find that address — try adding the city, e.g. \"123 Main St, Palo Alto\".", "error");
      return;
    }
    const m = matchTract(geo);
    if (m.confidence === "street") {
      selectTractInUI(m.t);
      setStatus(`Found it — your street is part of ${m.t.name} in ${m.t.city}.`, "ok");
    } else if (m.confidence === "near") {
      selectTractInUI(m.t);
      setStatus(`You're about ${m.dist.toFixed(1)} km from the center of ${m.t.name}, ${m.t.city} — very likely your tract.`, "ok");
    } else if (m.confidence === "nearby") {
      selectTractInUI(m.t);
      setStatus(`Closest known tract: ${m.t.name}, ${m.t.city} (~${m.dist.toFixed(1)} km away). Double-check it — or pick manually below.`, "");
    } else {
      setStatus("That address isn't near any Eichler tract we know of yet. You can still take the visual quiz below.", "error");
    }
  } catch (err) {
    setStatus("Address lookup is unavailable right now — pick your neighborhood manually below.", "error");
  } finally {
    $("#btn-address").disabled = false;
  }
}

function show(stepId) {
  for (const id of ["step-tract", "step-quiz", "step-result"]) {
    $("#" + id).classList.toggle("hidden", id !== stepId);
  }
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function wireEvents() {
  $("#address-form").addEventListener("submit", handleAddressLookup);
  $("#region-select").addEventListener("change", (e) => {
    buildTractSelect(e.target.value);
    selectedTract = null;
    showTractInfo(null);
  });
  $("#tract-select").addEventListener("change", (e) => {
    selectedTract = TRACTS.find((t) => t.id === e.target.value) || null;
    showTractInfo(selectedTract);
  });
  $("#btn-quiz").addEventListener("click", () => show("step-quiz"));
  $("#btn-skip").addEventListener("click", () => {
    selectedTract = null;
    $("#tract-select").value = "";
    showTractInfo(null);
    show("step-quiz");
  });
  $("#btn-back").addEventListener("click", () => show("step-tract"));
  $("#btn-result").addEventListener("click", () => {
    const answers = {};
    for (const q of QUIZ) {
      const checked = document.querySelector(`input[name="${q.id}"]:checked`);
      if (checked) answers[q.id] = checked.value;
    }
    renderResult(answers);
    show("step-result");
  });
  $("#btn-restart").addEventListener("click", () => {
    $("#quiz-form").reset();
    show("step-tract");
  });
}

init();
