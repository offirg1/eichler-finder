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

function show(stepId) {
  for (const id of ["step-tract", "step-quiz", "step-result"]) {
    $("#" + id).classList.toggle("hidden", id !== stepId);
  }
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function wireEvents() {
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
