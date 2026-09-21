/*

* BLIND PATH
* Local Storage
*
* Saves:
* * Highest unlocked level
* * Best moves for each level
* * Best time for each level
* * Stars earned
*
* Everything is stored locally in the browser.
  */

const Storage = (() => {

```
const STORAGE_KEY = "blind_path_save";


/*
 * Default save data.
 */
const defaultData = {

    unlockedLevel: 1,

    levels: {}

};


/*
 * Load saved data.
 */
function load() {

    try {

        const saved =
            localStorage.getItem(
                STORAGE_KEY
            );


        if (!saved) {

            return {
                ...defaultData,
                levels: {}
            };

        }


        const data =
            JSON.parse(saved);


        return {

            unlockedLevel:
                data.unlockedLevel || 1,

            levels:
                data.levels || {}

        };

    } catch (error) {

        console.warn(
            "Unable to load saved game.",
            error
        );


        return {
            ...defaultData,
            levels: {}
        };

    }

}


/*
 * Save data.
 */
function save(data) {

    try {

        localStorage.setItem(

            STORAGE_KEY,

            JSON.stringify(data)

        );

    } catch (error) {

        console.warn(
            "Unable to save game.",
            error
        );

    }

}


/*
 * Save the result of a completed level.
 */
function saveLevelResult(

    levelNumber,

    moves,

    time,

    stars

) {

    const data = load();


    const levelKey =
        String(levelNumber);


    const previous =
        data.levels[levelKey];


    /*
     * If this is the first attempt,
     * save everything.
     */
    if (!previous) {

        data.levels[levelKey] = {

            bestMoves: moves,

            bestTime: time,

            stars: stars

        };

    } else {

        /*
         * Keep the best moves.
         */
        if (
            moves < previous.bestMoves
        ) {

            previous.bestMoves =
                moves;

        }


        /*
         * Keep the best time.
         */
        if (
            time < previous.bestTime
        ) {

            previous.bestTime =
                time;

        }


        /*
         * Keep the highest star score.
         */
        if (
            stars > previous.stars
        ) {

            previous.stars =
                stars;

        }

    }


    /*
     * Unlock the next level.
     */
    const nextLevel =
        levelNumber + 1;


    if (
        nextLevel >
        data.unlockedLevel
    ) {

        data.unlockedLevel =
            nextLevel;

    }


    save(data);

}


/*
 * Get information about one level.
 */
function getLevel(levelNumber) {

    const data = load();


    return (
        data.levels[
            String(levelNumber)
        ] || null
    );

}


/*
 * Check whether a level is unlocked.
 */
function isLevelUnlocked(
    levelNumber
) {

    const data = load();


    return (
        levelNumber <=
        data.unlockedLevel
    );

}


/*
 * Return the highest unlocked level.
 */
function getUnlockedLevel() {

    return load().unlockedLevel;

}


/*
 * Reset all progress.
 *
 * We won't expose this in the UI yet,
 * but it will be useful during development.
 */
function reset() {

    localStorage.removeItem(
        STORAGE_KEY
    );

}


/*
 * Public API
 */
return {

    load,

    save,

    saveLevelResult,

    getLevel,

    isLevelUnlocked,

    getUnlockedLevel,

    reset

};
```

})();