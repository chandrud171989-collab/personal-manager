/*

* BLIND PATH
* Main Game Engine
*
* Handles:
* * Level loading
* * Player movement
* * Swipe controls
* * Maze preview
* * Vision
* * Flash
* * Timer
* * Move counter
* * Level completion
* * Star scoring
* * Local progress
    */

const Game = (() => {

```
/*
 * DOM elements
 */
const mazeElement =
    document.getElementById("maze");

const messageElement =
    document.getElementById("message");

const levelElement =
    document.getElementById("level");

const movesElement =
    document.getElementById("moves");

const timeElement =
    document.getElementById("time");

const flashCountElement =
    document.getElementById("flashCount");

const restartButton =
    document.getElementById("restartButton");

const flashButton =
    document.getElementById("flashButton");

const resultOverlay =
    document.getElementById("resultOverlay");

const resultTitle =
    document.getElementById("resultTitle");

const resultStars =
    document.getElementById("resultStars");

const resultDetails =
    document.getElementById("resultDetails");

const nextLevelButton =
    document.getElementById("nextLevelButton");


/*
 * Current game state
 */
let currentLevel = 0;

let player = {
    row: 0,
    col: 0
};

let moves = 0;

let flashes = 3;

let previewing = true;

let gameRunning = false;

let gameCompleted = false;

let startTime = 0;

let timerInterval = null;

let flashActive = false;


/*
 * Default settings.
 *
 * These can later come from
 * LEVEL_SETTINGS.
 */
const DEFAULT_SETTINGS = {

    previewTime: 2000,

    visionRadius: 2,

    flashes: 3

};


/*
 * Get current level settings.
 */
function getSettings() {

    return (

        LEVEL_SETTINGS[currentLevel]

        || DEFAULT_SETTINGS

    );

}


/*
 * Update the top statistics.
 */
function updateStats() {

    levelElement.textContent =
        currentLevel + 1;

    movesElement.textContent =
        moves;

    flashCountElement.textContent =
        flashes;

}


/*
 * Update timer.
 */
function updateTimer() {

    if (!gameRunning) {
        return;
    }


    const elapsed =
        (Date.now() - startTime) / 1000;


    timeElement.textContent =
        elapsed.toFixed(1);

}


/*
 * Get elapsed time.
 */
function getElapsedTime() {

    if (!startTime) {
        return 0;
    }


    return (
        (Date.now() - startTime) /
        1000
    );

}


/*
 * Start timer.
 */
function startTimer() {

    clearInterval(
        timerInterval
    );


    startTime =
        Date.now();


    timerInterval =
        setInterval(
            updateTimer,
            100
        );

}


/*
 * Stop timer.
 */
function stopTimer() {

    clearInterval(
        timerInterval
    );

    timerInterval = null;

}


/*
 * Load the current level.
 */
function loadLevel() {

    /*
     * Reset state.
     */
    moves = 0;

    gameCompleted = false;

    gameRunning = false;

    flashActive = false;

    previewing = true;


    /*
     * Get settings.
     */
    const settings =
        getSettings();


    flashes =
        settings.flashes;


    /*
     * Load maze.
     */
    Maze.load(
        LEVELS[currentLevel]
    );


    /*
     * Get starting position.
     */
    player =
        Maze.getStart();


    /*
     * Update UI.
     */
    updateStats();


    timeElement.textContent =
        "0.0";


    messageElement.textContent =
        "Memorize the maze…";


    /*
     * Show entire maze.
     */
    render();


    /*
     * Start preview countdown.
     */
    setTimeout(
        endPreview,
        settings.previewTime
    );

}


/*
 * End maze preview.
 */
function endPreview() {

    /*
     * Ignore if level was restarted
     * during the previous countdown.
     */
    if (!previewing) {
        return;
    }


    previewing = false;

    gameRunning = true;

    messageElement.textContent =
        "Find the exit. Trust your memory.";


    startTimer();

    render();

}


/*
 * Render game board.
 */
function render() {

    Maze.render(

        mazeElement,

        player,

        {

            preview:
                previewing || flashActive,

            visionRadius:
                getSettings().visionRadius

        }

    );

}


/*
 * Attempt player movement.
 */
function move(direction) {

    if (
        !gameRunning ||
        gameCompleted ||
        previewing ||
        flashActive
    ) {

        return;

    }


    const directions = {

        up: {
            row: -1,
            col: 0
        },

        down: {
            row: 1,
            col: 0
        },

        left: {
            row: 0,
            col: -1
        },

        right: {
            row: 0,
            col: 1
        }

    };


    const movement =
        directions[direction];


    if (!movement) {
        return;
    }


    const newRow =
        player.row +
        movement.row;


    const newCol =
        player.col +
        movement.col;


    /*
     * Outside maze.
     */
    if (
        !Maze.isInside(
            newRow,
            newCol
        )
    ) {

        showBlockedMessage();

        return;

    }


    /*
     * Wall.
     */
    if (
        Maze.isWall(
            newRow,
            newCol
        )
    ) {

        showBlockedMessage();

        return;

    }


    /*
     * Move player.
     */
    player = {

        row: newRow,

        col: newCol

    };


    moves++;


    updateStats();


    /*
     * Reveal the area around
     * the player.
     */
    Maze.revealPlayerArea(

        player.row,

        player.col,

        getSettings().visionRadius

    );


    render();


    /*
     * Check goal.
     */
    checkGoal();

}


/*
 * Message when player hits a wall.
 */
function showBlockedMessage() {

    messageElement.textContent =
        "Blocked! Remember the path.";

}


/*
 * Check whether player reached goal.
 */
function checkGoal() {

    const goal =
        Maze.getGoal();


    if (
        player.row === goal.row &&
        player.col === goal.col
    ) {

        completeLevel();

    }

}


/*
 * Calculate stars.
 */
function calculateStars() {

    const settings =
        getSettings();


    const elapsed =
        getElapsedTime();


    /*
     * Simple scoring system.
     *
     * Star 1:
     * Complete the level.
     *
     * Star 2:
     * Finish within move target.
     *
     * Star 3:
     * Finish quickly without using Flash.
     */

    let stars = 1;


    const moveTarget =
        15 +
        currentLevel * 4;


    const timeTarget =
        20 +
        currentLevel * 5;


    if (
        moves <= moveTarget
    ) {

        stars++;

    }


    if (
        elapsed <= timeTarget &&
        flashes === settings.flashes
    ) {

        stars++;

    }


    return Math.min(
        stars,
        3
    );

}


/*
 * Complete current level.
 */
function completeLevel() {

    if (gameCompleted) {
        return;
    }


    gameCompleted = true;

    gameRunning = false;


    stopTimer();


    const elapsed =
        getElapsedTime();


    const stars =
        calculateStars();


    /*
     * Save progress.
     */
    Storage.saveLevelResult(

        currentLevel + 1,

        moves,

        elapsed,

        stars

    );


    /*
     * Display result.
     */
    resultTitle.textContent =
        currentLevel ===
        LEVELS.length - 1

            ? "Prototype Complete!"

            : "Level Complete!";


    resultStars.textContent =
        "★".repeat(stars) +
        "☆".repeat(3 - stars);


    resultDetails.textContent =
        `${moves} moves · ` +
        `${elapsed.toFixed(1)} seconds · ` +
        `${flashes} flashes left`;


    nextLevelButton.textContent =

        currentLevel ===
        LEVELS.length - 1

            ? "Play Again"

            : "Next Level";


    resultOverlay.classList.add(
        "show"
    );


    resultOverlay.setAttribute(
        "aria-hidden",
        "false"
    );

}


/*
 * Restart current level.
 */
function restart() {

    stopTimer();

    loadLevel();

}


/*
 * Flash ability.
 */
function useFlash() {

    if (
        !gameRunning ||
        gameCompleted ||
        previewing ||
        flashActive ||
        flashes <= 0
    ) {

        return;

    }


    flashes--;

    updateStats();


    flashActive = true;


    messageElement.textContent =
        "⚡ FLASH — memorize it!";


    render();


    /*
     * Flash duration.
     */
    setTimeout(() => {

        flashActive = false;


        if (!gameCompleted) {

            messageElement.textContent =
                "Back into the dark…";

        }


        render();

    }, 1800);

}


/*
 * Direction buttons.
 */
function setupButtons() {

    document
        .querySelectorAll(
            "[data-direction]"
        )
        .forEach(button => {

            button.addEventListener(
                "click",
                () => {

                    move(
                        button.dataset.direction
                    );

                }
            );

        });

}


/*
 * Swipe controls.
 */
function setupSwipeControls() {

    let startX = 0;

    let startY = 0;


    mazeElement.addEventListener(

        "touchstart",

        event => {

            const touch =
                event.changedTouches[0];


            startX =
                touch.clientX;


            startY =
                touch.clientY;

        },

        {
            passive: true
        }

    );


    mazeElement.addEventListener(

        "touchend",

        event => {

            const touch =
                event.changedTouches[0];


            const deltaX =
                touch.clientX -
                startX;


            const deltaY =
                touch.clientY -
                startY;


            const distance =
                Math.max(

                    Math.abs(deltaX),

                    Math.abs(deltaY)

                );


            /*
             * Ignore tiny movements.
             */
            if (distance < 25) {
                return;
            }


            /*
             * Horizontal swipe.
             */
            if (
                Math.abs(deltaX) >
                Math.abs(deltaY)
            ) {

                move(

                    deltaX > 0

                        ? "right"

                        : "left"

                );

            }

            /*
             * Vertical swipe.
             */
            else {

                move(

                    deltaY > 0

                        ? "down"

                        : "up"

                );

            }

        },

        {
            passive: true
        }

    );

}


/*
 * Keyboard controls.
 *
 * Useful during desktop development.
 */
function setupKeyboardControls() {

    document.addEventListener(

        "keydown",

        event => {

            const keyMap = {

                ArrowUp: "up",

                ArrowDown: "down",

                ArrowLeft: "left",

                ArrowRight: "right",

                w: "up",

                s: "down",

                a: "left",

                d: "right"

            };


            const direction =
                keyMap[event.key];


            if (!direction) {
                return;
            }


            event.preventDefault();


            move(direction);

        }

    );

}


/*
 * Next level.
 */
function nextLevel() {

    resultOverlay.classList.remove(
        "show"
    );


    resultOverlay.setAttribute(
        "aria-hidden",
        "true"
    );


    currentLevel++;


    /*
     * Loop back after final prototype level.
     */
    if (
        currentLevel >=
        LEVELS.length
    ) {

        currentLevel = 0;

    }


    loadLevel();

}


/*
 * Initialize game.
 */
function init() {

    setupButtons();

    setupSwipeControls();

    setupKeyboardControls();


    restartButton.addEventListener(

        "click",

        restart

    );


    flashButton.addEventListener(

        "click",

        useFlash

    );


    nextLevelButton.addEventListener(

        "click",

        nextLevel

    );


    /*
     * Start first level.
     */
    loadLevel();

}


/*
 * Public API.
 */
return {

    init,

    move,

    restart,

    useFlash,

    nextLevel

};
```

})();

/*

* Start the game after the page loads.
  */
  document.addEventListener(
  "DOMContentLoaded",
  () => {

  ```
   Game.init();
  ```

  }
  );