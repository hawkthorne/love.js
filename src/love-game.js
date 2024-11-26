"use strict";

class LoveGame extends HTMLElement {
  constructor() {
    super();
  }

  async connectedCallback() {
    this.configureModule();

    const cache_key = await this.isCached();
    const isCached = cache_key === this.dataset.etag;

    this.querySelector("noscript").remove();

    const imagePlaceholder = this.querySelector("img");

    const submitText = document.createElement("span");
    submitText.innerText = "Play";

    const sizeText = document.createElement("small");
    sizeText.innerText = this.humanFileSize(this.Module.GAME_SIZE);

    const submit = document.createElement("button");
    submit.type = "submit";
    submit.value = "Play";

    const form = document.createElement("form");
    form.addEventListener("submit", (_) => {
      if (imagePlaceholder) imagePlaceholder.remove();
      submit.remove(); // Remove submit before removing the form to fix minor rendering bug
      form.remove();
      this.init();
    });

    this.pregameContainer = document.createElement("div");
    this.pregameContainer.className = "pregame";

    submit.appendChild(submitText);
    if (!isCached) submit.appendChild(sizeText);
    form.appendChild(submit);
    this.pregameContainer.appendChild(form);

    this.appendChild(this.pregameContainer);
  }

  async isCached() {
    return await this.getCacheKey(
      this.Module.GAME_PATH + this.Module.GAME_FILE,
    );
  }

  humanFileSize(bytes) {
    const i = bytes == 0 ? 0 : Math.floor(Math.log(bytes) / Math.log(1024));
    return (
      +(bytes / Math.pow(1024, i)).toFixed(2) * 1 + " " + ["B", "kB", "MB"][i]
    );
  }

  prefixURL() {
    const GAME_FILE = this.dataset.gameFile;
    const url = new URL(GAME_FILE, import.meta.url);
    const filename_to_strip = url.pathname.split("/").pop();
    return url.href.replace(url.origin, "").replace(filename_to_strip, "");
  }

  configureModule() {
    if (!this.dataset.gameFile)
      throw new Error("'data-game-file' attribute on love-game is missing");
    if (!this.dataset.gameSize)
      throw new Error("'data-game-size' attribute on love-game is missing");

    const gameSize = parseInt(this.dataset.gameSize);

    this.Module = {
      UUID: this.dataset.etag,
      arguments: ["./game.love"],
      files: [
        {
          filename: "/game.love",
          crunched: 0,
          start: 0,
          end: gameSize,
          audio: false,
        },
      ],
      GAME_FILE: this.dataset.gameFile,
      GAME_PATH: encodeURIComponent(this.prefixURL()),
      GAME_SIZE: gameSize,
      humanFileSize: this.humanFileSize,
      filePackagePrefixURL: this.prefixURL(),
      INITIAL_MEMORY: this.dataset.memory
        ? parseInt(this.dataset.memory)
        : 16777216,
      printErr: console.error.bind(console),
      canvas: (() => {
        const canvas = this.querySelector("canvas");
        canvas.id = "canvas";

        // As a default initial behavior, pop up an alert when webgl context is lost. To make your
        // application robust, you may want to override this behavior before shipping!
        // See http://www.khronos.org/registry/webgl/specs/latest/1.0/#5.15.2
        canvas.addEventListener(
          "webglcontextlost",
          function (event) {
            alert("WebGL context lost. You will need to reload the page.");
            event.preventDefault();
          },
          false,
        );

        canvas.addEventListener(
          "contextmenu",
          function (event) {
            event.preventDefault();
          },
          false,
        );

        return canvas;
      })(),
      goFullScreen: () => {
        if (this.Module.canvas.requestFullScreen)
          this.Module.canvas.requestFullScreen();
        else if (this.Module.canvas.webkitRequestFullScreen)
          this.Module.canvas.webkitRequestFullScreen();
        else if (this.Module.canvas.mozRequestFullScreen)
          this.Module.canvas.mozRequestFullScreen();
      },
      setStatus: (text) => {
        if (text) {
          this.pregameContainer.innerText = text;
        }
      },
      totalDependencies: 0,
      remainingDependencies: null,
      monitorRunDependencies: (left) => {
        if (
          this.Module.remainingDependencies &&
          left < this.Module.remainingDependencies
        ) {
          this.Module.setStatus(
            "Preparing... (" +
              (this.Module.totalDependencies -
                this.Module.remainingDependencies) +
              "/" +
              this.Module.totalDependencies +
              ")",
          );
        } else {
          this.Module.totalDependencies++;
        }
        this.Module.remainingDependencies = left;
      },
      onRuntimeInitialized: () => {
        this.pregameContainer.remove();
      },
    };
  }

  init() {
    this.loadLib(new URL("love.js", import.meta.url)).then(
      (_url) => {
        window.onerror = (_event) => {
          // TODO: do not warn on ok events like simulating an infinite loop or exitStatus
          this.Module.setStatus("Exception thrown, see JavaScript console");
          this.Module.setStatus = function (text) {
            if (text) this.Module.printErr("[post-exception status] " + text);
          };
        };

        this.Module.setStatus("Downloading...");

        import(new URL("game.js", import.meta.url)).then(({ loadPackage }) => {
          loadPackage(this.Module);
          globalThis.Love(this.Module);
          this.Module.canvas.focus();
        });
      },
      (err) => {
        throw new Error("Unable to load necessary libraries", { cause: err });
      },
    );
  }

  async getCacheKey(gameFile) {
    async function getKeyFromTransaction(db, k) {
      return new Promise((resolve, _reject) => {
        const transaction = db.get(k);
        transaction.addEventListener("success", function (event) {
          resolve(event.target.result?.uuid);
        });
        transaction.addEventListener("error", function (_error) {
          resolve(-1);
        });
      });
    }

    return new Promise((resolve, _reject) => {
      const dbReq = indexedDB.open("EM_PRELOAD_CACHE", 1);
      dbReq.onupgradeneeded = function (_event) {
        resolve(-1);
      };
      dbReq.onsuccess = async (event) => {
        const db = event.target.result;
        try {
          const transaction = db.transaction(["METADATA"], "readonly");
          const metadata = transaction.objectStore("METADATA");
          const cacheKey = await getKeyFromTransaction(
            metadata,
            "metadata/" + gameFile,
          );
          cacheKey ? resolve(cacheKey) : resolve(-1);
        } catch (e) {
          console.error(e);
          resolve(-1);
        }
      };

      dbReq.onerror = (_event) => {
        resolve(-1);
      };
    });
  }

  loadLib(url) {
    return new Promise((resolve, reject) => {
      const existingScript = document.head.querySelector(
        "script[src='" + url + "']",
      );
      if (existingScript) {
        existingScript.addEventListener("load", function () {
          resolve(url);
        });
        existingScript.addEventListener("error", function (error) {
          reject(error);
        });
      }
      let script = document.createElement("script");
      script.type = "text/javascript";
      script.async = true;
      script.src = url;

      script.addEventListener("load", function () {
        resolve(url);
      });
      script.addEventListener("error", function (error) {
        reject(error);
      });

      document.head.appendChild(script);
    });
  }
}

customElements.define("love-game", LoveGame);
