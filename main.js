const GRID_SIZE = 50;
const CELL_SIZE = 12;

const TICKS_PER_SECOND = 10;

const CREATURES_COUNT = 20;
const START_FOOD_COUNT = 100;

const START_ENERGY = 30;
const ENERGY_GAIN_FROM_FOOD = 50;
const ENERGY_LOSS_PER_TICK = 1;

const canvas = document.getElementById("world");
const ctx = canvas.getContext("2d");

canvas.width = GRID_SIZE * CELL_SIZE;
canvas.height = GRID_SIZE * CELL_SIZE;

const creatures = [];
const foods = [];

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

        // Check for food
        const foodIndex = findFoodAt(creature.x, creature.y);

        if (foodIndex !== -1) {
            creature.energy += ENERGY_GAIN_FROM_FOOD;
            foods.splice(foodIndex, 1);
        }

    }

    // Remove dead creatures
    for (let i = creatures.length - 1; i >= 0; i--) {

        if (creatures[i].energy <= 0) {
            creatures.splice(i, 1);
        }
    }
}

function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (const creature of creatures) {
        ctx.fillStyle = "#4da3ff";

        ctx.fillRect(
            creature.x * CELL_SIZE,
            creature.y * CELL_SIZE,
            CELL_SIZE,
            CELL_SIZE
        );
    }

    for (const food of foods) {
        ctx.fillStyle = "green";

        ctx.fillRect(
            food.x * CELL_SIZE,
            food.y * CELL_SIZE,
            CELL_SIZE,
            CELL_SIZE
        );
    }
}

function gameLoop() {
    
    setInterval(() => {
        update();
        render();
    }, 1000 / TICKS_PER_SECOND);

}

gameLoop();