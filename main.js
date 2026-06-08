const GRID_SIZE = 30;
const CELL_SIZE = 12;

const TICKS_PER_SECOND = 10;

const CREATURES_COUNT = 3;
const START_FOOD_COUNT = 100;
const FOOD_CREATION_RATE = 0.3;

const START_ENERGY = 20;
const ENERGY_GAIN_FROM_FOOD = 50;
const ENERGY_LOSS_PER_TICK = 1;
const ENERGY_FOR_REPRODUCTION = 100;
const ENERGY_COST_FOR_REPRODUCTION = ENERGY_FOR_REPRODUCTION / 2;

const CREATURE_COLOR = "#4da3ff";
const FOOD_COLOR = "gray";

const canvas = document.getElementById("world");
const stats = document.getElementById("stats");
const ctx = canvas.getContext("2d");

canvas.width = GRID_SIZE * CELL_SIZE;
canvas.height = GRID_SIZE * CELL_SIZE;

const creatures = [];
const foods = [];

const populationHistory = [];
const energyHistory = [];
const foodHistory = [];

// Create X creatures
for (let i = 0; i < CREATURES_COUNT; i++) {
    creatures.push({
        x: Math.floor(Math.random() * GRID_SIZE),
        y: Math.floor(Math.random() * GRID_SIZE),

        energy: START_ENERGY,
        age: 0
    });
}

// Create X foods
for (let i = 0; i < START_FOOD_COUNT; i++) {
    foods.push({
        x: Math.floor(Math.random() * GRID_SIZE),
        y: Math.floor(Math.random() * GRID_SIZE)
    });
}

function findFoodAt(x, y) {
    return foods.findIndex(
        food => food.x === x && food.y === y
    );
}

function update() {

    for (const creature of creatures) {

        // Move creature
        const direction = Math.floor(Math.random() * 4);

        switch (direction) {
            case 0: creature.y--; break;
            case 1: creature.y++; break;
            case 2: creature.x--; break;
            case 3: creature.x++; break;
        }

        // Keep inside world
        creature.x = Math.max(0, Math.min(GRID_SIZE - 1, creature.x));
        creature.y = Math.max(0, Math.min(GRID_SIZE - 1, creature.y));

        // Lose energy
        creature.energy -= ENERGY_LOSS_PER_TICK;
        creature.age++;

        // Check for food
        const foodIndex = findFoodAt(creature.x, creature.y);

        if (foodIndex !== -1) {
            creature.energy += ENERGY_GAIN_FROM_FOOD;
            foods.splice(foodIndex, 1);
        }

        // Check for reproduction
        if (creature.energy >= ENERGY_FOR_REPRODUCTION) {
            const newCreature = {
                x: creature.x,
                y: creature.y,
                energy: START_ENERGY,
                age: 0
            };
            creatures.push(newCreature);
            creature.energy -= ENERGY_COST_FOR_REPRODUCTION;
        }

    }

    // Remove dead creatures
    for (let i = creatures.length - 1; i >= 0; i--) {

        if (creatures[i].energy <= 0) {
            creatures.splice(i, 1);
        }
    }

    // Create new food if random number is less than FOOD_CREATION_RATE (no duplicates in the same position)
    if (Math.random() < FOOD_CREATION_RATE) {
        const newFood = {
            x: Math.floor(Math.random() * GRID_SIZE),
            y: Math.floor(Math.random() * GRID_SIZE)
        };
        if (!foods.some(food => food.x === newFood.x && food.y === newFood.y)) {
            foods.push(newFood);
        }
    }
}

function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (const creature of creatures) {
        ctx.fillStyle = CREATURE_COLOR;

        ctx.fillRect(
            creature.x * CELL_SIZE,
            creature.y * CELL_SIZE,
            CELL_SIZE,
            CELL_SIZE
        );
    }

    for (const food of foods) {
        ctx.fillStyle = FOOD_COLOR;

        ctx.fillRect(
            food.x * CELL_SIZE,
            food.y * CELL_SIZE,
            CELL_SIZE,
            CELL_SIZE
        );
    }
}

function updateStats() {

    let oldestCreature = 0;
    let totalEnergy = 0;

    for (const creature of creatures) {

        if (creature.age > oldestCreature) {
            oldestCreature = creature.age;
        }

        totalEnergy += creature.energy;
    }

    const averageEnergy =
        creatures.length > 0
            ? Math.round(totalEnergy / creatures.length)
            : 0;

    stats.innerHTML = `
        Population: ${creatures.length}<br>
        Food: ${foods.length}<br>
        Oldest Creature: ${oldestCreature}<br>
        Total Energy: ${totalEnergy}<br>
        Average Energy: ${averageEnergy}
    `;

    populationHistory.push(creatures.length);
    energyHistory.push(totalEnergy);
    foodHistory.push(foods.length);

    const MAX_HISTORY = 1000;

    if (populationHistory.length > MAX_HISTORY) {
        populationHistory.shift();
    }

    if (energyHistory.length > MAX_HISTORY) {
        energyHistory.shift();
    }

    if (foodHistory.length > MAX_HISTORY) {
        foodHistory.shift();
    }
}

function gameLoop() {
    
    setInterval(() => {
        update();
        render();
        updateStats();
    }, 1000 / TICKS_PER_SECOND);

}

gameLoop();