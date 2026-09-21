/*

* BLIND PATH
* Level Definitions
*
* S = Start
* G = Goal
* # = Wall
* . = Open path
*
* These are temporary handcrafted levels.
* Later we will replace/extend them with
* procedural maze generation.
  */

const LEVELS = [

```
// Level 1 — Tutorial
[
    "S..#...",
    ".#.#.#.",
    "....#..",
    ".##....",
    "...##..",
    "......G"
],

// Level 2
[
    "S.#....",
    ".#...#.",
    "...#...",
    ".#...#.",
    "...#...",
    "....#.G"
],

// Level 3
[
    "S...#..",
    ".##.#..",
    "....#..",
    "..###..",
    "....#..",
    ".#....G"
],

// Level 4
[
    "S.#.....",
    "..#..#..",
    ".#...#..",
    ".###....",
    "...##...",
    "..#....G",
    "........",
    "..#....."
],

// Level 5
[
    "S..#....",
    ".#.#.##.",
    "...#....",
    "##...#..",
    "....#...",
    "..###...",
    "...#...G",
    "........"
]
```

];

/*

* Difficulty configuration
*
* These values will control how the game
* becomes harder as the player progresses.
  */

const LEVEL_SETTINGS = [

```
{
    size: 6,
    previewTime: 3000,
    visionRadius: 3,
    flashes: 3
},

{
    size: 6,
    previewTime: 2500,
    visionRadius: 2,
    flashes: 3
},

{
    size: 6,
    previewTime: 2200,
    visionRadius: 2,
    flashes: 2
},

{
    size: 8,
    previewTime: 2000,
    visionRadius: 2,
    flashes: 2
},

{
    size: 8,
    previewTime: 1500,
    visionRadius: 1,
    flashes: 2
}
```

];