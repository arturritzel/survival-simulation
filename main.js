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

// ── DOM refs ─────────────────────────────────────────────────────
const canvas        = document.getElementById("world");
const ctx           = canvas.getContext("2d");
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
        GENE_ENERGY_COST_MIN:       +document.getElementById("cfg-gene-min").value,
        GENE_ENERGY_COST_MAX:       +document.getElementById("cfg-gene-max").value,
        ENERGY_FOR_REPRODUCTION:    +document.getElementById("cfg-repro-energy").value,
        MUTATION_RATE:              +document.getElementById("cfg-mutation-rate").value,
    };
}

// ── Initialisation ────────────────────────────────────────────────
function initSim() {
    CFG = readConfig();
    CFG.ENERGY_COST_FOR_REPRODUCTION = CFG.ENERGY_FOR_REPRODUCTION / 2;

    canvas.width  = CFG.GRID_SIZE * CFG.CELL_SIZE;
    canvas.height = CFG.GRID_SIZE * CFG.CELL_SIZE;

    creatures = [];
    foods = [];
    populationHistory = [];
    energyHistory = [];
    foodHistory = [];

    for (let i = 0; i < CFG.CREATURES_COUNT; i++) {
        creatures.push(makeCreature(
            Math.floor(Math.random() * CFG.GRID_SIZE),
            Math.floor(Math.random() * CFG.GRID_SIZE),
            CFG.START_ENERGY,
            0,
            Math.random() * (CFG.GENE_ENERGY_COST_MAX - CFG.GENE_ENERGY_COST_MIN) + CFG.GENE_ENERGY_COST_MIN
        ));
    }

    for (let i = 0; i < CFG.START_FOOD_COUNT; i++) {
        foods.push({
            x: Math.floor(Math.random() * CFG.GRID_SIZE),
            y: Math.floor(Math.random() * CFG.GRID_SIZE)
        });
    }
}

function makeCreature(x, y, energy, generation, energyCostGene) {
    return {
        x, y,
        energy,
        age: 0,
        generation,
        genes: { energy_cost_multiplicator: energyCostGene }
    };
}

// ── Sim logic ─────────────────────────────────────────────────────
function findFoodAt(x, y) {
    return foods.findIndex(f => f.x === x && f.y === y);
}

function update() {
    const newborns = [];

    for (const creature of creatures) {
        const dir = Math.floor(Math.random() * 4);
        if (dir === 0) creature.y--;
        else if (dir === 1) creature.y++;
        else if (dir === 2) creature.x--;
        else creature.x++;

        creature.x = Math.max(0, Math.min(CFG.GRID_SIZE - 1, creature.x));
        creature.y = Math.max(0, Math.min(CFG.GRID_SIZE - 1, creature.y));

        creature.energy -= CFG.ENERGY_LOSS_PER_TICK * creature.genes.energy_cost_multiplicator;
        creature.age++;

        const fi = findFoodAt(creature.x, creature.y);
        if (fi !== -1) {
            creature.energy = Math.min(CFG.MAX_ENERGY, creature.energy + CFG.ENERGY_GAIN_FROM_FOOD);
            foods.splice(fi, 1);
        }

        if (creature.energy >= CFG.ENERGY_FOR_REPRODUCTION) {
            const reproChance = (creature.energy - CFG.ENERGY_FOR_REPRODUCTION) / CFG.ENERGY_FOR_REPRODUCTION;
            if (Math.random() < reproChance) {
                let childGene = creature.genes.energy_cost_multiplicator + (Math.random() * 2 - 1) * CFG.MUTATION_RATE;
                childGene = Math.max(CFG.GENE_ENERGY_COST_MIN, Math.min(CFG.GENE_ENERGY_COST_MAX, childGene));
                newborns.push(makeCreature(creature.x, creature.y, CFG.START_ENERGY, creature.generation + 1, childGene));
                creature.energy -= CFG.ENERGY_COST_FOR_REPRODUCTION;
            }
        }
    }

    creatures.push(...newborns);

    for (let i = creatures.length - 1; i >= 0; i--) {
        if (creatures[i].energy <= 0) creatures.splice(i, 1);
    }

    if (Math.random() < CFG.FOOD_CREATION_RATE) {
        const nf = {
            x: Math.floor(Math.random() * CFG.GRID_SIZE),
            y: Math.floor(Math.random() * CFG.GRID_SIZE)
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
    let oldestAge = 0, totalEnergy = 0, totalGene = 0;
    let minGen = Infinity, maxGen = 0;

    for (const c of creatures) {
        if (c.age > oldestAge) oldestAge = c.age;
        if (c.generation > maxGen) maxGen = c.generation;
        if (c.generation < minGen) minGen = c.generation;
        totalEnergy += c.energy;
        totalGene += c.genes.energy_cost_multiplicator;
    }

    const avgEnergy = creatures.length > 0 ? Math.round(totalEnergy / creatures.length) : 0;
    const avgGene   = creatures.length > 0 ? (totalGene / creatures.length).toFixed(4) : "—";
    const extinct   = creatures.length === 0 ? `<br><span style="color:#c05050">† extinct</span>` : "";

    statsEl.innerHTML = `
        Population: <span class="stat-val">${creatures.length}</span>${extinct}<br>
        Food: <span class="stat-val">${foods.length}</span><br>
        Oldest: <span class="stat-val">${oldestAge}</span><br>
        Avg energy: <span class="stat-val">${avgEnergy}</span><br>
        Gen range: <span class="stat-val">${minGen === Infinity ? 0 : minGen}–${maxGen}</span><br>
        Avg gene: <span class="stat-val">${avgGene}</span>
    `;

    const MAX_HISTORY = 1000;
    populationHistory.push(creatures.length);
    energyHistory.push(totalEnergy);
    foodHistory.push(foods.length);
    if (populationHistory.length > MAX_HISTORY) populationHistory.shift();
    if (energyHistory.length > MAX_HISTORY) energyHistory.shift();
    if (foodHistory.length > MAX_HISTORY) foodHistory.shift();
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
            <div><span class="entry-label">Gene   </span><span class="entry-val">${c.genes.energy_cost_multiplicator.toFixed(4)}</span></div>
        </div>`;
    }

    inspectEl.innerHTML = html;
}

// ── Crosshair on canvas hover ─────────────────────────────────────
canvasWrap.addEventListener("mousemove", (e) => {
    if (!paused) return;
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const gx = Math.floor(px / CFG.CELL_SIZE);
    const gy = Math.floor(py / CFG.CELL_SIZE);

    crosshair.style.display = "block";
    chH.style.top  = (gy * CFG.CELL_SIZE + CFG.CELL_SIZE / 2) + "px";
    chV.style.left = (gx * CFG.CELL_SIZE + CFG.CELL_SIZE / 2) + "px";
    chCell.style.left   = (gx * CFG.CELL_SIZE) + "px";
    chCell.style.top    = (gy * CFG.CELL_SIZE) + "px";
    chCell.style.width  = CFG.CELL_SIZE + "px";
    chCell.style.height = CFG.CELL_SIZE + "px";
});

canvasWrap.addEventListener("mouseleave", () => {
    crosshair.style.display = "none";
});

canvasWrap.addEventListener("click", (e) => {
    if (!paused) return;
    const rect = canvas.getBoundingClientRect();
    const gx = Math.floor((e.clientX - rect.left)  / CFG.CELL_SIZE);
    const gy = Math.floor((e.clientY - rect.top)    / CFG.CELL_SIZE);
    inspectCell(gx, gy);
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
            updateStats();
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