const GRID_SIZE = 50;
const CELL_SIZE = 12;
const TICKS_PER_SECOND = 5;
const CREATURES_COUNT = 5;

const canvas = document.getElementById("world");
const ctx = canvas.getContext("2d");

canvas.width = GRID_SIZE * CELL_SIZE;
canvas.height = GRID_SIZE * CELL_SIZE;

const creatures = [];

// Create X creatures
for (let i = 0; i < CREATURES_COUNT; i++) {
    creatures.push({
        x: Math.floor(Math.random() * GRID_SIZE),
        y: Math.floor(Math.random() * GRID_SIZE)
    });
}

function update() {
    for (const creature of creatures) {

        const direction = Math.floor(Math.random() * 4);

        switch (direction) {
            case 0:
                creature.y--;
                break;

            case 1:
                creature.y++;
                break;

            case 2:
                creature.x--;
                break;

            case 3:
                creature.x++;
                break;
        }

        // Keep inside world
        creature.x = Math.max(
            0,
            Math.min(GRID_SIZE - 1, creature.x)
        );

        creature.y = Math.max(
            0,
            Math.min(GRID_SIZE - 1, creature.y)
        );
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
}

function gameLoop() {
    
    setInterval(() => {
        update();
        render();
    }, 1000 / TICKS_PER_SECOND);

}

gameLoop();