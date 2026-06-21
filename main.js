// ── Runtime state ────────────────────────────────────────────────
let CFG = {};
let creatures = [];
let foods = [];
let populationHistory = [];
let energyHistory = [];
let foodHistory = [];
let intervalId = null;
let paused = false;
let currentTps = 20;
let tick = 0;
const MAX_HISTORY = 1000;

let peakPop = 0, peakFood = 0, peakEnergy = 0;

// ── Seeded RNG (mulberry32) ───────────────────────────────────────
let _rng;
function seedRNG(seed) {
    let s = seed >>> 0;
    _rng = () => {
        s |= 0; s = s + 0x6D2B79F5 | 0;
        let t = Math.imul(s ^ s >>> 15, 1 | s);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}
function rand() { return _rng(); }

// ── DOM refs ─────────────────────────────────────────────────────
const canvas        = document.getElementById("world");
const ctx           = canvas.getContext("2d");
const chartCanvas   = document.getElementById("chart");
const chartCtx      = chartCanvas.getContext("2d");
const chartWrap     = document.getElementById("chart-wrap");
const statsEl       = document.getElementById("stats");
const inspectEl     = document.getElementById("inspect-panel");
const pauseHint     = document.getElementById("pause-hint");
const btnStart      = document.getElementById("btn-start");
const btnPause      = document.getElementById("btn-pause");
const btnSlower     = document.getElementById("btn-slower");
const btnFaster     = document.getElementById("btn-faster");
const speedDisplay  = document.getElementById("speed-display");
const canvasWrap    = document.getElementById("canvas-wrap");
const crosshair     = document.getElementById("crosshair");
const chH           = document.getElementById("ch-h");
const chV           = document.getElementById("ch-v");
const chCell        = document.getElementById("ch-cell");
const tooltip       = document.getElementById("tooltip");
const dragRect      = document.getElementById("drag-rect");
const peakPopEl     = document.getElementById("peak-pop");
const peakFoodEl    = document.getElementById("peak-food");
const peakEnergyEl  = document.getElementById("peak-energy");
const presetSelect  = document.getElementById("cfg-preset");
const seedInput     = document.getElementById("cfg-seed");
const btnRandomSeed = document.getElementById("btn-random-seed");

// ── Config helpers ────────────────────────────────────────────────
function readConfig() {
    return {
        GRID_SIZE:                  +document.getElementById("cfg-grid-size").value,
        CELL_SIZE:                  +document.getElementById("cfg-cell-size").value,
        TICKS_PER_SECOND:           +document.getElementById("cfg-ticks-per-second").value,
        CREATURES_COUNT:            +document.getElementById("cfg-creatures-count").value,
        START_FOOD_COUNT:           +document.getElementById("cfg-start-food").value,
        FOOD_CREATION_RATE:         +document.getElementById("cfg-food-rate").value,
        START_ENERGY:               +document.getElementById("cfg-start-energy").value,
        MAX_ENERGY:                 +document.getElementById("cfg-max-energy").value,
        ENERGY_GAIN_FROM_FOOD:      +document.getElementById("cfg-energy-food").value,
        ENERGY_LOSS_PER_TICK:       +document.getElementById("cfg-energy-loss").value,
        GENE_ENERGY_COST_MIN:       +document.getElementById("cfg-gene-energy-cost-min").value,
        GENE_ENERGY_COST_MAX:       +document.getElementById("cfg-gene-energy-cost-max").value,
        GENE_VISION_MIN:            +document.getElementById("cfg-gene-vision-min").value,
        GENE_VISION_MAX:            +document.getElementById("cfg-gene-vision-max").value,
        ENERGY_FOR_REPRODUCTION:    +document.getElementById("cfg-repro-energy").value,
        MUTATION_RATE:              +document.getElementById("cfg-mutation-rate").value,
        AGE_COST_FACTOR:            +document.getElementById("cfg-age-cost-factor").value,
        REPRO_COOLDOWN:             +document.getElementById("cfg-repro-cooldown").value,
        CHILD_DEATH_RATE:           +document.getElementById("cfg-child-death-rate").value,
        PARENT_DEATH_ON_REPRO_RATE: +document.getElementById("cfg-parent-death-rate").value,
    };
}

// ── Initialisation ────────────────────────────────────────────────
function initSim() {
    CFG = readConfig();
    CFG.ENERGY_COST_FOR_REPRODUCTION = CFG.ENERGY_FOR_REPRODUCTION / 2;

    seedRNG(+seedInput.value || 42);
    peakPop = 0; peakFood = 0; peakEnergy = 0;
    peakPopEl.textContent = "";
    peakFoodEl.textContent = "";
    peakEnergyEl.textContent = "";

    canvas.width  = CFG.GRID_SIZE * CFG.CELL_SIZE;
    canvas.height = CFG.GRID_SIZE * CFG.CELL_SIZE;

    chartCanvas.width  = CFG.GRID_SIZE * CFG.CELL_SIZE;
    chartCanvas.height = 120;
    chartWrap.style.display = "flex";

    tick = 0;

    creatures = [];
    foods = [];
    populationHistory = [];
    energyHistory = [];
    foodHistory = [];

    for (let i = 0; i < CFG.CREATURES_COUNT; i++) {
        creatures.push(makeCreature(
            Math.floor(rand() * CFG.GRID_SIZE),
            Math.floor(rand() * CFG.GRID_SIZE),
            CFG.START_ENERGY,
            0,
            rand() * (CFG.GENE_ENERGY_COST_MAX - CFG.GENE_ENERGY_COST_MIN) + CFG.GENE_ENERGY_COST_MIN,
            rand() * (CFG.GENE_VISION_MAX - CFG.GENE_VISION_MIN) + CFG.GENE_VISION_MIN
        ));
    }

    for (let i = 0; i < CFG.START_FOOD_COUNT; i++) {
        foods.push({
            x: Math.floor(rand() * CFG.GRID_SIZE),
            y: Math.floor(rand() * CFG.GRID_SIZE)
        });
    }
}

function makeCreature(x, y, energy, generation, energyCostGene, visionGene) {

    const tempVisionGene = ((energyCostGene/CFG.GENE_ENERGY_COST_MAX) * (CFG.GENE_VISION_MAX-CFG.GENE_VISION_MIN)) + CFG.GENE_VISION_MIN;

    return {
        x, y,
        energy,
        age: 0,
        generation,
        lastReproducedAt: -Infinity,
        genes: { energy_cost_multiplicator: energyCostGene, vision: tempVisionGene }
    };
}

// ── Sim logic ─────────────────────────────────────────────────────
function findFoodAt(x, y) {
    return foods.findIndex(f => f.x === x && f.y === y);
}

function findNearestFood(creature) {
    let nearest = null;
    let nearestDist = Infinity;

    for (const food of foods) {
        const dx = food.x - creature.x;
        const dy = food.y - creature.y;

        const dist = Math.abs(dx) + Math.abs(dy);

        if (
            dist <= creature.genes.vision &&
            dist < nearestDist
        ) {
            nearest = food;
            nearestDist = dist;
        }
    }

    return nearest;
}

function moveRandomly(creature){
    const dir = Math.floor(rand() * 4);
    if (dir === 0) creature.y--;
    else if (dir === 1) creature.y++;
    else if (dir === 2) creature.x--;
    else creature.x++;

    creature.x = Math.max(0, Math.min(CFG.GRID_SIZE - 1, creature.x));
    creature.y = Math.max(0, Math.min(CFG.GRID_SIZE - 1, creature.y));
}

function update() {
    tick++;
    const newborns = [];

    for (const creature of creatures) {

        const food = findNearestFood(creature);

        if (food) {
            const dx = food.x - creature.x;
            const dy = food.y - creature.y;
        
            if (Math.abs(dx) > Math.abs(dy)) {
                creature.x += Math.sign(dx);
            } else {
                creature.y += Math.sign(dy);
            }
        } else {
            moveRandomly(creature);
        }

        creature.energy -= CFG.ENERGY_LOSS_PER_TICK * creature.genes.energy_cost_multiplicator * (1 + creature.age / CFG.AGE_COST_FACTOR);
        creature.age++;

        const fi = findFoodAt(creature.x, creature.y);
        if (fi !== -1) {
            creature.energy = Math.min(CFG.MAX_ENERGY, creature.energy + CFG.ENERGY_GAIN_FROM_FOOD);
            foods.splice(fi, 1);
        }

        if (creature.energy >= CFG.ENERGY_FOR_REPRODUCTION && (tick - creature.lastReproducedAt) >= CFG.REPRO_COOLDOWN) {
            const reproChance = (creature.energy - CFG.ENERGY_FOR_REPRODUCTION) / CFG.ENERGY_FOR_REPRODUCTION;
            if (rand() < reproChance) {
                let childEnergyCostGene = creature.genes.energy_cost_multiplicator * (1 + ((rand() * 2 - 1) * CFG.MUTATION_RATE));
                childEnergyCostGene = Math.max(CFG.GENE_ENERGY_COST_MIN, Math.min(CFG.GENE_ENERGY_COST_MAX, childEnergyCostGene));

                let childVisionGene = creature.genes.vision * (1 + ((rand() * 2 - 1) * CFG.MUTATION_RATE));
                childVisionGene = Math.max(CFG.GENE_VISION_MIN, Math.min(CFG.GENE_VISION_MAX, childVisionGene));

                if (rand() >= CFG.CHILD_DEATH_RATE) {
                    newborns.push(makeCreature(creature.x, creature.y, CFG.START_ENERGY, creature.generation + 1, childEnergyCostGene, childVisionGene));
                }
                creature.energy -= CFG.ENERGY_COST_FOR_REPRODUCTION;
                creature.lastReproducedAt = tick;
                if (rand() < CFG.PARENT_DEATH_ON_REPRO_RATE) {
                    creature.energy = 0;
                }
            }
        }
    }

    creatures.push(...newborns);

    for (let i = creatures.length - 1; i >= 0; i--) {
        if (creatures[i].energy <= 0) creatures.splice(i, 1);
    }

    if (rand() < CFG.FOOD_CREATION_RATE) {
        const nf = {
            x: Math.floor(rand() * CFG.GRID_SIZE),
            y: Math.floor(rand() * CFG.GRID_SIZE)
        };
        if (!foods.some(f => f.x === nf.x && f.y === nf.y)) foods.push(nf);
    }
}

// ── Rendering ─────────────────────────────────────────────────────
function creatureColor(gene) {
    const t = (gene - CFG.GENE_ENERGY_COST_MIN) / (CFG.GENE_ENERGY_COST_MAX - CFG.GENE_ENERGY_COST_MIN);
    return `rgb(${Math.round(255 * t)}, ${Math.round(255 * (1 - t))}, 0)`;
}

function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (const food of foods) {
        ctx.fillStyle = "#666";
        ctx.fillRect(food.x * CFG.CELL_SIZE, food.y * CFG.CELL_SIZE, CFG.CELL_SIZE, CFG.CELL_SIZE);
    }

    for (const creature of creatures) {
        ctx.fillStyle = creatureColor(creature.genes.energy_cost_multiplicator);
        ctx.fillRect(creature.x * CFG.CELL_SIZE, creature.y * CFG.CELL_SIZE, CFG.CELL_SIZE, CFG.CELL_SIZE);
    }
}

// ── Stats panel ───────────────────────────────────────────────────
function updateStats() {
    let oldestAge = 0, totalEnergy = 0, totalEnergyCostGene = 0, totalVisionGene = 0;
    let minGen = Infinity, maxGen = 0;

    for (const c of creatures) {
        if (c.age > oldestAge) oldestAge = c.age;
        if (c.generation > maxGen) maxGen = c.generation;
        if (c.generation < minGen) minGen = c.generation;
        totalEnergy += c.energy;
        totalEnergyCostGene += c.genes.energy_cost_multiplicator;
        totalVisionGene += c.genes.vision;
    }

    const avgEnergy = Math.round(totalEnergy / creatures.length);
    const avgEnergyCostGene = (totalEnergyCostGene / creatures.length).toFixed(4);
    const avgVisionGene = (totalVisionGene / creatures.length).toFixed(1);

    statsEl.innerHTML = `
        Tick: <span class="stat-val">${tick}</span><br>
        Population: <span class="stat-val">${creatures.length}</span><br>
        Food: <span class="stat-val">${foods.length}</span><br>
        Oldest: <span class="stat-val">${oldestAge}</span><br>
        Avg energy: <span class="stat-val">${avgEnergy}</span><br>
        Gen range: <span class="stat-val">${minGen === Infinity ? 0 : minGen}–${maxGen}</span><br>
        Avg e. gene: <span class="stat-val">${avgEnergyCostGene}</span>
        Avg v. gene: <span class="stat-val">${avgVisionGene}</span>
    `;

    populationHistory.push(creatures.length);
    energyHistory.push(totalEnergy);
    foodHistory.push(foods.length);

    if (creatures.length > peakPop)  { peakPop    = creatures.length; peakPopEl.textContent    = `peak: ${peakPop}`; }
    if (foods.length    > peakFood)  { peakFood   = foods.length;     peakFoodEl.textContent   = `peak: ${peakFood}`; }
    if (totalEnergy     > peakEnergy){ peakEnergy = totalEnergy;      peakEnergyEl.textContent = `peak: ${Math.round(peakEnergy)}`; }
}
function renderChart() {
    const W = chartCanvas.width;
    const H = chartCanvas.height;
    const PAD = 6;
    const n = populationHistory.length;
    if (n < 2) return;

    chartCtx.clearRect(0, 0, W, H);

    // gridlines at 0.25 / 0.5 / 0.75
    chartCtx.strokeStyle = "rgba(255,255,255,0.06)";
    chartCtx.lineWidth = 1;
    for (const lvl of [0.25, 0.5, 0.75]) {
        const y = PAD + (1 - lvl) * (H - PAD * 2);
        chartCtx.beginPath();
        chartCtx.moveTo(PAD, y);
        chartCtx.lineTo(W - PAD, y);
        chartCtx.stroke();
    }

    function normalise(arr) {
        const max = Math.max(...arr);
        if (max === 0) return arr.map(() => 0);
        return arr.map(v => v / max);
    }

    const series = [
        { data: normalise(populationHistory), color: "#4caf50" },
        { data: normalise(foodHistory),       color: "#888888" },
        { data: normalise(energyHistory),     color: "#e0a020" },
    ];

    for (const { data, color } of series) {
        chartCtx.beginPath();
        chartCtx.strokeStyle = color;
        chartCtx.lineWidth = 1.5;

        const cols = W - PAD * 2;
        const step = Math.max(1, Math.floor(data.length / cols));

        for (let i = 0; i < data.length; i += step) {
            const x = PAD + (i / (data.length - 1)) * (W - PAD * 2);
            const y = PAD + (1 - data[i]) * (H - PAD * 2);
            i === 0 ? chartCtx.moveTo(x, y) : chartCtx.lineTo(x, y);
        }

        chartCtx.stroke();
    }

    // current tick marker at right edge
    chartCtx.strokeStyle = "rgba(255,255,255,0.2)";
    chartCtx.lineWidth = 1;
    chartCtx.beginPath();
    chartCtx.moveTo(W - PAD, PAD);
    chartCtx.lineTo(W - PAD, H - PAD);
    chartCtx.stroke();
}

// ── Inspect panel (pause mode) ────────────────────────────────────
function inspectCell(gx, gy) {
    const cellCreatures = creatures.filter(c => c.x === gx && c.y === gy);
    const hasFood = foods.some(f => f.x === gx && f.y === gy);

    let html = `<div class="inspect-title">Inspect</div>`;
    html += `<div class="inspect-coord">Cell (${gx}, ${gy})</div>`;

    if (!hasFood && cellCreatures.length === 0) {
        html += `<div class="empty-cell">Empty cell</div>`;
    }

    if (hasFood) {
        html += `<div><span class="food-dot"></span>Food</div>`;
    }

    for (const c of cellCreatures) {
        const color = creatureColor(c.genes.energy_cost_multiplicator);
        html += `
        <div class="creature-entry">
            <div><span class="creature-color-dot" style="background:${color}"></span>Creature</div>
            <div><span class="entry-label">Energy </span><span class="entry-val">${Math.round(c.energy)}</span></div>
            <div><span class="entry-label">Age    </span><span class="entry-val">${c.age}</span></div>
            <div><span class="entry-label">Gen    </span><span class="entry-val">${c.generation}</span></div>
            <div><span class="entry-label">Energy Gene   </span><span class="entry-val">${c.genes.energy_cost_multiplicator.toFixed(4)}</span></div>
            <div><span class="entry-label">Vision Gene   </span><span class="entry-val">${c.genes.vision.toFixed(1)}</span></div>
            <div><span class="entry-label">Last repro </span><span class="entry-val">${c.lastReproducedAt === -Infinity ? "never" : c.lastReproducedAt}</span></div>
        </div>`;
    }

    inspectEl.innerHTML = html;
}

// ── Canvas interactions (crosshair, tooltip, drag select) ─────────
let dragStart = null;

function cellFromEvent(e) {
    const rect = canvas.getBoundingClientRect();
    return {
        gx: Math.floor((e.clientX - rect.left) / CFG.CELL_SIZE),
        gy: Math.floor((e.clientY - rect.top)  / CFG.CELL_SIZE),
        px: e.clientX - rect.left,
        py: e.clientY - rect.top,
    };
}

function showTooltip(e, gx, gy) {
    const cellCreatures = creatures.filter(c => c.x === gx && c.y === gy);
    const hasFood = foods.some(f => f.x === gx && f.y === gy);

    if (!hasFood && cellCreatures.length === 0) {
        tooltip.style.display = "none";
        return;
    }

    let lines = [`<b>(${gx}, ${gy})</b>`];
    if (hasFood) lines.push("🟫 food");
    for (const c of cellCreatures) {
        lines.push(`🟢 e:${Math.round(c.energy)} age:${c.age} gen:${c.generation} eng gene:${c.genes.energy_cost_multiplicator.toFixed(3)} vis gene:${c.genes.vision.toFixed(1)}`);
    }
    tooltip.innerHTML = lines.join("<br>");

    const rect = canvas.getBoundingClientRect();
    const tx = e.clientX - rect.left + 12;
    const ty = e.clientY - rect.top  - 8;
    tooltip.style.left    = tx + "px";
    tooltip.style.top     = ty + "px";
    tooltip.style.display = "block";
}

function showRegionInspect(x1, y1, x2, y2) {
    const minX = Math.min(x1, x2), maxX = Math.max(x1, x2);
    const minY = Math.min(y1, y2), maxY = Math.max(y1, y2);

    const regionCreatures = creatures.filter(c => c.x >= minX && c.x <= maxX && c.y >= minY && c.y <= maxY);
    const regionFood      = foods.filter(f => f.x >= minX && f.x <= maxX && f.y >= minY && f.y <= maxY);

    if (regionCreatures.length === 0 && regionFood.length === 0) {
        inspectEl.innerHTML = `<div class="inspect-title">Region (${minX},${minY})→(${maxX},${maxY})</div><div class="empty-cell">Empty region</div>`;
        return;
    }

    const avgGene   = regionCreatures.length ? (regionCreatures.reduce((s, c) => s + c.genes.energy_cost_multiplicator, 0) / regionCreatures.length).toFixed(4) : "—";
    const avgEnergy = regionCreatures.length ? Math.round(regionCreatures.reduce((s, c) => s + c.energy, 0) / regionCreatures.length) : "—";
    const avgAge    = regionCreatures.length ? Math.round(regionCreatures.reduce((s, c) => s + c.age,    0) / regionCreatures.length) : "—";

    inspectEl.innerHTML = `
        <div class="inspect-title">Region</div>
        <div class="inspect-coord">(${minX},${minY}) → (${maxX},${maxY})</div>
        <div><span class="entry-label">Creatures </span><span class="entry-val">${regionCreatures.length}</span></div>
        <div><span class="entry-label">Food      </span><span class="entry-val">${regionFood.length}</span></div>
        <div><span class="entry-label">Avg gene  </span><span class="entry-val">${avgGene}</span></div>
        <div><span class="entry-label">Avg energy</span><span class="entry-val">${avgEnergy}</span></div>
        <div><span class="entry-label">Avg age   </span><span class="entry-val">${avgAge}</span></div>
    `;
}

canvasWrap.addEventListener("mousemove", (e) => {
    if (!paused) return;
    const { gx, gy, px, py } = cellFromEvent(e);

    // crosshair
    crosshair.style.display = "block";
    chH.style.top  = (gy * CFG.CELL_SIZE + CFG.CELL_SIZE / 2) + "px";
    chV.style.left = (gx * CFG.CELL_SIZE + CFG.CELL_SIZE / 2) + "px";
    chCell.style.left   = (gx * CFG.CELL_SIZE) + "px";
    chCell.style.top    = (gy * CFG.CELL_SIZE) + "px";
    chCell.style.width  = CFG.CELL_SIZE + "px";
    chCell.style.height = CFG.CELL_SIZE + "px";

    if (dragStart) {
        // update drag rect
        const x1 = Math.min(dragStart.px, px);
        const y1 = Math.min(dragStart.py, py);
        const x2 = Math.max(dragStart.px, px);
        const y2 = Math.max(dragStart.py, py);
        dragRect.style.left   = x1 + "px";
        dragRect.style.top    = y1 + "px";
        dragRect.style.width  = (x2 - x1) + "px";
        dragRect.style.height = (y2 - y1) + "px";
        dragRect.style.display = "block";
        tooltip.style.display = "none";
    } else {
        showTooltip(e, gx, gy);
    }
});

canvasWrap.addEventListener("mousedown", (e) => {
    if (!paused) return;
    const { gx, gy, px, py } = cellFromEvent(e);
    dragStart = { gx, gy, px, py };
    dragRect.style.display = "none";
});

canvasWrap.addEventListener("mouseup", (e) => {
    if (!paused || !dragStart) return;
    const { gx, gy } = cellFromEvent(e);

    if (gx === dragStart.gx && gy === dragStart.gy) {
        // single click — inspect cell
        inspectCell(gx, gy);
    } else {
        // drag — inspect region
        showRegionInspect(dragStart.gx, dragStart.gy, gx, gy);
    }

    dragStart = null;
    dragRect.style.display = "none";
});

canvasWrap.addEventListener("mouseleave", () => {
    crosshair.style.display = "none";
    tooltip.style.display = "none";
    dragStart = null;
    dragRect.style.display = "none";
});


// ── Game loop ─────────────────────────────────────────────────────
const TPS_MIN_EXP = 0;  // 2^0  = 1 tps
const TPS_MAX_EXP = 10; // 2^10 = 1024 tps

function updateSpeedDisplay() {
    speedDisplay.textContent = currentTps + " tps";
    btnSlower.disabled = currentTps <= Math.pow(2, TPS_MIN_EXP);
    btnFaster.disabled = currentTps >= Math.pow(2, TPS_MAX_EXP);
}

function startLoop() {
    if (intervalId) clearInterval(intervalId);
    intervalId = setInterval(() => {
        if (!paused) {
            update();
            render();
            if (creatures.length === 0) {
                clearInterval(intervalId);
                intervalId = null;
                statsEl.innerHTML += `<br><span style="color:#c05050">† extinct</span>`;
                renderChart();
                return;
            }
            updateStats();
            renderChart();
        }
    }, 1000 / currentTps);
}

btnSlower.addEventListener("click", () => {
    const exp = Math.log2(currentTps);
    if (exp > TPS_MIN_EXP) { currentTps = Math.pow(2, exp - 1); startLoop(); updateSpeedDisplay(); }
});

btnFaster.addEventListener("click", () => {
    const exp = Math.log2(currentTps);
    if (exp < TPS_MAX_EXP) { currentTps = Math.pow(2, exp + 1); startLoop(); updateSpeedDisplay(); }
});

// ── Button wiring ─────────────────────────────────────────────────
btnStart.addEventListener("click", () => {
    if (intervalId) clearInterval(intervalId);
    paused = false;

    initSim();
    currentTps = Math.pow(2, Math.round(Math.log2(CFG.TICKS_PER_SECOND)));
    render();
    updateStats();
    startLoop();
    updateSpeedDisplay();

    btnStart.textContent = "↺ Restart";
    btnPause.style.display = "inline-block";
    btnSlower.disabled = false;
    btnFaster.disabled = false;
    btnPause.textContent = "⏸ Pause";
    btnPause.classList.remove("paused");
    inspectEl.innerHTML = "";
    pauseHint.style.display = "none";
    canvasWrap.classList.remove("paused");
    crosshair.style.display = "none";
});

btnPause.addEventListener("click", () => {
    paused = !paused;
    if (paused) {
        btnPause.textContent = "▶ Resume";
        btnPause.classList.add("paused");
        canvasWrap.classList.add("paused");
        pauseHint.style.display = "block";
        // render one final frame to freeze the view
        render();
    } else {
        btnPause.textContent = "⏸ Pause";
        btnPause.classList.remove("paused");
        canvasWrap.classList.remove("paused");
        pauseHint.style.display = "none";
        inspectEl.innerHTML = "";
        crosshair.style.display = "none";
    }
});

// ── Presets ───────────────────────────────────────────────────────
const PRESETS = {
    default: {
        "cfg-grid-size": 50, "cfg-cell-size": 12, "cfg-ticks-per-second": 20,
        "cfg-creatures-count": 10, "cfg-start-food": 300, "cfg-food-rate": 0.5,
        "cfg-start-energy": 100, "cfg-max-energy": 550, "cfg-energy-food": 50,
        "cfg-energy-loss": 1, "cfg-gene-min": 0.75, "cfg-gene-max": 1.25,
        "cfg-repro-energy": 200, "cfg-mutation-rate": 0.05, "cfg-age-cost-factor": 1000,
        "cfg-repro-cooldown": 50, "cfg-child-death-rate": 0.1, "cfg-parent-death-rate": 0.05,
    },
    "boom-bust": {
        "cfg-grid-size": 50, "cfg-cell-size": 12, "cfg-ticks-per-second": 20,
        "cfg-creatures-count": 10, "cfg-start-food": 500, "cfg-food-rate": 1.5,
        "cfg-start-energy": 100, "cfg-max-energy": 550, "cfg-energy-food": 80,
        "cfg-energy-loss": 0.5, "cfg-gene-min": 0.75, "cfg-gene-max": 1.25,
        "cfg-repro-energy": 150, "cfg-mutation-rate": 0.05, "cfg-age-cost-factor": 2000,
        "cfg-repro-cooldown": 5, "cfg-child-death-rate": 0, "cfg-parent-death-rate": 0,
    },
    extinction: {
        "cfg-grid-size": 50, "cfg-cell-size": 12, "cfg-ticks-per-second": 20,
        "cfg-creatures-count": 20, "cfg-start-food": 80, "cfg-food-rate": 0.15,
        "cfg-start-energy": 100, "cfg-max-energy": 400, "cfg-energy-food": 30,
        "cfg-energy-loss": 1.5, "cfg-gene-min": 0.75, "cfg-gene-max": 1.25,
        "cfg-repro-energy": 250, "cfg-mutation-rate": 0.1, "cfg-age-cost-factor": 500,
        "cfg-repro-cooldown": 80, "cfg-child-death-rate": 0.3, "cfg-parent-death-rate": 0.15,
    },
    stable: {
        "cfg-grid-size": 50, "cfg-cell-size": 12, "cfg-ticks-per-second": 20,
        "cfg-creatures-count": 15, "cfg-start-food": 200, "cfg-food-rate": 0.4,
        "cfg-start-energy": 100, "cfg-max-energy": 450, "cfg-energy-food": 50,
        "cfg-energy-loss": 1, "cfg-gene-min": 0.75, "cfg-gene-max": 1.25,
        "cfg-repro-energy": 200, "cfg-mutation-rate": 0.03, "cfg-age-cost-factor": 1200,
        "cfg-repro-cooldown": 100, "cfg-child-death-rate": 0.15, "cfg-parent-death-rate": 0.08,
    },
};

function applyPreset(name) {
    const p = PRESETS[name];
    if (!p) return;
    for (const [id, val] of Object.entries(p)) {
        const el = document.getElementById(id);
        if (el) el.value = val;
    }
}

presetSelect.addEventListener("change", () => applyPreset(presetSelect.value));
btnRandomSeed.addEventListener("click", () => {
    seedInput.value = Math.floor(Math.random() * 999999);
});