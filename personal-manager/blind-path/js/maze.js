/*

* BLIND PATH
* Maze Engine
*
* Responsibilities:
* * Load a level
* * Parse the maze
* * Find Start / Goal
* * Render the maze
* * Handle visibility
* * Track explored cells
    */

const Maze = (() => {

```
let grid = [];
let rows = 0;
let cols = 0;

let start = {
    row: 0,
    col: 0
};

let goal = {
    row: 0,
    col: 0
};

/*
 * Cells that the player has already discovered.
 *
 * We keep these even after the player moves away.
 *
 * This will become important for the Blind Path
 * memory mechanic.
 */
const explored = new Set();


/*
 * Load a level.
 */
function load(levelData) {

    rows = levelData.length;

    cols = Math.max(
        ...levelData.map(row => row.length)
    );

    grid = levelData.map(row =>
        row.padEnd(cols, ".").split("")
    );


    /*
     * Find Start and Goal.
     */
    for (let row = 0; row < rows; row++) {

        for (let col = 0; col < cols; col++) {

            const cell = grid[row][col];

            if (cell === "S") {

                start = {
                    row,
                    col
                };

                grid[row][col] = ".";

            }

            if (cell === "G") {

                goal = {
                    row,
                    col
                };

                grid[row][col] = ".";

            }

        }

    }


    /*
     * Reset exploration.
     */
    explored.clear();

    revealAround(
        start.row,
        start.col,
        0
    );
}


/*
 * Check whether a cell is inside the maze.
 */
function isInside(row, col) {

    return (
        row >= 0 &&
        row < rows &&
        col >= 0 &&
        col < cols
    );
}


/*
 * Check whether a cell is a wall.
 */
function isWall(row, col) {

    if (!isInside(row, col)) {
        return true;
    }

    return grid[row][col] === "#";
}


/*
 * Mark cells around the player as explored.
 *
 * Manhattan distance is used here so that
 * visibility follows the grid naturally.
 */
function revealAround(row, col, radius) {

    for (
        let r = row - radius;
        r <= row + radius;
        r++
    ) {

        for (
            let c = col - radius;
            c <= col + radius;
            c++
        ) {

            if (!isInside(r, c)) {
                continue;
            }

            const distance =
                Math.abs(r - row) +
                Math.abs(c - col);

            if (distance <= radius) {

                explored.add(
                    `${r},${c}`
                );

            }

        }

    }

}


/*
 * Reveal the player's current area.
 */
function revealPlayerArea(row, col, radius) {

    revealAround(
        row,
        col,
        radius
    );

}


/*
 * Determine whether a cell has been explored.
 */
function isExplored(row, col) {

    return explored.has(
        `${row},${col}`
    );

}


/*
 * Render the maze.
 */
function render(
    container,
    player,
    options = {}
) {

    const {

        preview = false,

        visionRadius = 2

    } = options;


    /*
     * Reveal the player's current area.
     */
    if (!preview) {

        revealPlayerArea(
            player.row,
            player.col,
            visionRadius
        );

    }


    /*
     * Configure CSS grid.
     */
    container.style.gridTemplateColumns =
        `repeat(${cols}, 1fr)`;
    container.style.gridTemplateRows =
    `repeat(${rows}, 1fr)`;    


    container.innerHTML = "";


    /*
     * Create every cell.
     */
    for (let row = 0; row < rows; row++) {

        for (let col = 0; col < cols; col++) {

            const cell =
                document.createElement("div");


            cell.classList.add(
                "cell"
            );


            /*
             * Wall
             */
            if (
                grid[row][col] === "#"
            ) {

                cell.classList.add(
                    "wall"
                );

            }


            /*
             * Goal
             */
            if (
                row === goal.row &&
                col === goal.col
            ) {

                cell.classList.add(
                    "goal"
                );

            }


            /*
             * Player
             */
            if (
                row === player.row &&
                col === player.col
            ) {

                cell.classList.add(
                    "player"
                );

            }


            /*
             * Visibility
             *
             * During preview:
             * everything is visible.
             *
             * During gameplay:
             * explored areas remain faintly visible.
             */
            if (!preview) {

                if (
                    !isExplored(row, col)
                ) {

                    cell.classList.add(
                        "hidden"
                    );

                }

            }


            container.appendChild(
                cell
            );

        }

    }

}


/*
 * Return the Start position.
 */
function getStart() {

    return {
        ...start
    };

}


/*
 * Return the Goal position.
 */
function getGoal() {

    return {
        ...goal
    };

}


/*
 * Return maze dimensions.
 */
function getDimensions() {

    return {
        rows,
        cols
    };

}


/*
 * Public API
 */
return {

    load,

    render,

    isInside,

    isWall,

    getStart,

    getGoal,

    getDimensions,

    revealPlayerArea,

    isExplored

};
```

})();