# Love.js for LÖVE v11.5

This is a fork of [Davidobot/love.js](https://github.com/Davidobot/love.js) which has the following goals/changes:

- `<love-game>` web component
- User initiates download/loading of the game
- User is informed of the download size of the game
- Support multiple games hosted on the same domain
- Loading messages happen in DOM elements and not a separate canvas for improved accessibility
- Move the `Module` object out of the global scope
- Populate width, height, and title from `conf.lua`
  - defaults to `800x600` if not set
- Input must be a `.love` file


## Installation

Install the package from `npm`; no need to download this repo:

```
npm i git+https://github.com/hawkthorne/love.js.git
```

## Usage

```
$ npx love.js --help
Usage: love.js [options] <input> <output>

Options:
  -V, --version         output the version number
  -m, --memory [bytes]  how much memory your game will require [16777216] (default: 16777216)
  -c, --compatibility   specify flag to use compatibility version
  -h, --help            output usage information
```

`<input>` must be a `.love` file.
`<output>` is a directory that will hold everything needed for a web release.

e.g., `npx love.js -m 83886080 -c hawkthorne.love dist`

### Deploy

The `<output>` directory contains several file types; `.js`, `.wasm`, `.data`, `.css`, and a sample `index.html`.

1. Using `<output>/index.html` as a guide we can extract the necessary elements to add to our own document:
  - The `<love-game>` component contains all of the necessary attributes to load the game:
    ```html
    <love-game data-memory="83886080"
               data-game-size="69290025"
               data-game-file="hawkthorne.data"
               data-etag="805af8734a0660064f86eeb561535b5d">
      <!-- Optionally replace the `src` attribute with your own image instead of the black default -->
      <img aria-hidden="true" alt=""
           width="1056"
           height="672"
           src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVQImWNgYGAAAAAEAAGjChXjAAAAAElFTkSuQmCC">
      <canvas role="application" tabindex="0"
              width="1056"
              height="672"></canvas>
      <noscript>
        Sorry, this game requires JavaScript.
      </noscript>
    </love-game>
    ```
  - The styles of the `<love-game>` component are loaded in the `<head>` of the document:
    ```html
    <link rel="stylesheet" type="text/css" href="love-game.css">
    ```
  - The interactivity of `<love-game>` is loaded via a JavaScript module also in the `<head>` of the document:
    ```html
    <script src="love-game.js" type="module" defer></script>
    ```
  - **IMPORTANT**: `love-game.js` will load all of the related assets from the same relative path. Make sure to host the following files in the same directory as `love-game.js`;
    - `love.js`
    - `love.wasm`
    - `game.js`
    - `<GAME>.data` (e.g., `hawkthorne.data`)
2. Run a web server on the `<output>` directory: (e.g., `python -m http.server 8000 -d <output>`)
3. Open the page in the browser of your choice.

**NOTES**

- When a `<love-game>` is activated by a user the `<canvas>` element is assigned a DOM id property value of `"canvas"`. Keep this in mind for possible conflicts elsewhere in the document.
- The `data-etag` attribute is an MD5 hash of the `<input>` which will properly cache the resulting `<GAME>.data` file in the browser regardless of how many deployments you make providing the game has not been changed. If this value is not present, the game will always re-download.
