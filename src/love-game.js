"use strict";

class LoveGame extends HTMLElement {
  constructor() {
    super();
  }

  connectedCallback() {
    this.querySelector("noscript").remove();

    const submit = document.createElement("input");
    submit.type = "submit";
    submit.value = "Play";

    const form = document.createElement("form");
    form.addEventListener("submit", (_e) => {
      this.init();
      submit.remove(); // Remove submit before removing the form to fix minor rendering bug
      form.remove();
    });

    this.pregameContainer = document.createElement("div");
    this.pregameContainer.className = "pregame";

    form.appendChild(submit);
    this.pregameContainer.appendChild(form);

    this.appendChild(this.pregameContainer);
  }

  init() {
    if (!this.dataset.gameFile)
      throw new Error("'data-game-file' attribute on love-game is missing");
    if (!this.dataset.gameSize)
      throw new Error("'data-game-size' attribute on love-game is missing");
    const gameSize = parseInt(this.dataset.gameSize);
    this.Module = {
      UUID: this.dataset.uuid || "",
      arguments: ["./game.love"],
      files: [{
        filename: "/game.love",
        crunched: 0,
        start: 0,
        end: gameSize,
        audio: false,
      }],
      GAME_FILE: this.dataset.gameFile,
      GAME_SIZE: gameSize,
      filePackagePrefixURL: (() => {
        const GAME_FILE = this.dataset.gameFile;
        const url = new URL(GAME_FILE, import.meta.url);
        const filename_to_strip = url.pathname.split("/").pop();
        return url.href.replace(url.origin, "").replace(filename_to_strip, "");
      })(),
      INITIAL_MEMORY: this.dataset.memory ? parseInt(this.dataset.memory) : 16777216,
      printErr: console.error.bind(console),
      canvas: (() => {
        const canvas = this.querySelector("canvas");
        canvas.id = "canvas";

        // As a default initial behavior, pop up an alert when webgl context is lost. To make your
        // application robust, you may want to override this behavior before shipping!
        // See http://www.khronos.org/registry/webgl/specs/latest/1.0/#5.15.2
        canvas.addEventListener("webglcontextlost", function(event) {
          alert("WebGL context lost. You will need to reload the page.");
          event.preventDefault();
        }, false);

        canvas.addEventListener("contextmenu", function(event) {
          event.preventDefault();
        }, false);

        return canvas;
      })(),
      goFullScreen: () => {
        if(this.Module.canvas.requestFullScreen)
          this.Module.canvas.requestFullScreen();
        else if(this.Module.canvas.webkitRequestFullScreen)
          this.Module.canvas.webkitRequestFullScreen();
        else if(this.Module.canvas.mozRequestFullScreen)
            this.Module.canvas.mozRequestFullScreen();
      },
      setStatus: (text) => {
        this.pregameContainer.innerText = text;
      },
      totalDependencies: 0,
      remainingDependencies: 0,
      monitorRunDependencies: (left) => {
        this.Module.remainingDependencies = left;
        this.Module.totalDependencies = Math.max(this.Module.totalDependencies, left);
        if (left) {
          this.Module.setStatus("Preparing... (" + (this.Module.totalDependencies - left) + "/" + this.Module.totalDependencies + ")");
        } else {
          this.Module.setStatus("All downloads complete.");
          this.pregameContainer.remove();
        }
      }
    };

    this.loadLib(new URL("love.js", import.meta.url)).then(
      success => {
        this.Module.canvas.addEventListener("keydown", (event) => {
          // space and arrow keys
          if([32, 37, 38, 39, 40].indexOf(event.keyCode) > -1) {
            event.preventDefault();
          }
          // TODO: Press "f" to toggle fullscreen?
          if(event.keyCode == 70) {
            if (document.fullscreenElement) {
              document.exitFullscreen()
            } else {
              this.Module.goFullScreen();
            }
          }
        }, false);

        window.onerror = (event) => {
          // TODO: do not warn on ok events like simulating an infinite loop or exitStatus
          this.Module.setStatus("Exception thrown, see JavaScript console");
          this.Module.setStatus = function(text) {
            if (text) this.Module.printErr("[post-exception status] " + text);
          };
        };

        this.Module.setStatus("Downloading...");
        import(new URL("game.js", import.meta.url)).then(({loadPackage}) => {
          loadPackage(this.Module);
          Love(this.Module);
          this.Module.canvas.focus();
        });
      },
      err => {throw new Error("Unable to load necessary libraries", { cause: err })}
    );
  }

  loadLib(url) {
    return new Promise((resolve, reject) => {
      const existingScript = document.head.querySelector("script[src='" + url + "']");
      if (existingScript) {
        existingScript.addEventListener("load", function () {
          resolve(url);
        });
        existingScript.addEventListener("error", function (error) {
          reject(error);
        });
        return;
      }
      let script = document.createElement("script");
      script.type = "text/javascript";
      script.async = true;
      script.src = url;

      script.onload = function () {
        resolve(url);
      }
      script.onerror = function (error) {
        reject(error);
      }

      document.head.appendChild(script);
    });
  }
}

customElements.define("love-game", LoveGame);
