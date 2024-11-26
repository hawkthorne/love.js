"use strict";

export function loadPackage(Module) {
  var PACKAGE_PATH = Module["GAME_PATH"];
  var PACKAGE_NAME = Module["GAME_FILE"];
  var REMOTE_PACKAGE_BASE = Module["GAME_FILE"];
  if (
    typeof Module["locateFilePackage"] === "function" &&
    !Module["locateFile"]
  ) {
    Module["locateFile"] = Module["locateFilePackage"];
    Module.printErr(
      "warning: you defined Module.locateFilePackage, that has been renamed to Module.locateFile (using your locateFilePackage for now)",
    );
  }
  var REMOTE_PACKAGE_NAME =
    typeof Module["locateFile"] === "function"
      ? Module["locateFile"](REMOTE_PACKAGE_BASE)
      : (Module["filePackagePrefixURL"] || "") + REMOTE_PACKAGE_BASE;

  var REMOTE_PACKAGE_SIZE = Module["GAME_SIZE"];
  var PACKAGE_UUID = Module["UUID"];

  function fetchRemotePackage(packageName, packageSize, callback, _errback) {
    var xhr = new XMLHttpRequest();
    xhr.open("GET", packageName, true);
    xhr.responseType = "arraybuffer";
    xhr.onprogress = function (event) {
      var total = packageSize;
      if (event.loaded) {
        Module["setStatus"](
          "Downloading... (" + Module.humanFileSize(event.loaded) + "/" + Module.humanFileSize(total) + ")",
        );
      } else {
        Module["setStatus"]("Downloading...");
      }
    };
    xhr.onerror = function (_event) {
      throw new Error("NetworkError for: " + packageName);
    };
    xhr.onload = function (_event) {
      if (
        xhr.status == 200 ||
        xhr.status == 304 ||
        xhr.status == 206 ||
        (xhr.status == 0 && xhr.response)
      ) {
        // file URLs can return 0
        var packageData = xhr.response;
        callback(packageData);
      } else {
        throw new Error(xhr.statusText + " : " + xhr.responseURL);
      }
    };
    xhr.send(null);
  }

  function handleError(error) {
    console.error("package error:", error);
  }

  function runWithFS() {
    function assert(check, msg) {
      if (!check) throw msg + new Error().stack;
    }
    // {{{create_file_paths}}}

    function DataRequest(start, end, crunched, audio) {
      this.start = start;
      this.end = end;
      this.crunched = crunched;
      this.audio = audio;
    }
    DataRequest.prototype = {
      requests: {},
      open: function (_mode, name) {
        this.name = name;
        this.requests[name] = this;
        Module["addRunDependency"]("fp " + this.name);
      },
      send: function () {},
      onload: function () {
        var byteArray = this.byteArray.subarray(this.start, this.end);

        this.finish(byteArray);
      },
      finish: function (byteArray) {
        var that = this;

        Module["FS_createDataFile"](
          this.name,
          null,
          byteArray,
          true,
          true,
          true,
        ); // canOwn this data in the filesystem, it is a slide into the heap that will never change
        Module["removeRunDependency"]("fp " + that.name);

        this.requests[this.name] = null;
      },
    };

    var files = Module.files;
    for (var i = 0; i < files.length; ++i) {
      new DataRequest(
        files[i].start,
        files[i].end,
        files[i].crunched,
        files[i].audio,
      ).open("GET", files[i].filename);
    }

    var IDB_RO = "readonly";
    var IDB_RW = "readwrite";
    var DB_NAME = "EM_PRELOAD_CACHE";
    var DB_VERSION = 1;
    var METADATA_STORE_NAME = "METADATA";
    var PACKAGE_STORE_NAME = "PACKAGES";
    function openDatabase(callback, errback) {
      try {
        var openRequest = indexedDB.open(DB_NAME, DB_VERSION);
      } catch (e) {
        return errback(e);
      }
      openRequest.onupgradeneeded = function (event) {
        var db = event.target.result;

        if (db.objectStoreNames.contains(PACKAGE_STORE_NAME)) {
          db.deleteObjectStore(PACKAGE_STORE_NAME);
        }

        if (db.objectStoreNames.contains(METADATA_STORE_NAME)) {
          db.deleteObjectStore(METADATA_STORE_NAME);
        }
      };
      openRequest.onsuccess = function (event) {
        var db = event.target.result;
        callback(db);
      };
      openRequest.onerror = function (error) {
        errback(error);
      };
    }

    /* Check if there's a cached package, and if so whether it's the latest available */
    function checkCachedPackage(db, packageName, callback, errback) {
      var transaction = db.transaction([METADATA_STORE_NAME], IDB_RO);
      var metadata = transaction.objectStore(METADATA_STORE_NAME);

      var getRequest = metadata.get("metadata/" + packageName);
      getRequest.onsuccess = function (event) {
        var result = event.target.result;
        if (!result) {
          return callback(false);
        } else {
          return callback(PACKAGE_UUID && PACKAGE_UUID === result.uuid);
        }
      };
      getRequest.onerror = function (error) {
        errback(error);
      };
    }

    function fetchCachedPackage(db, packageName, callback, errback) {
      var transaction = db.transaction([PACKAGE_STORE_NAME], IDB_RO);
      var packages = transaction.objectStore(PACKAGE_STORE_NAME);

      var getRequest = packages.get("package/" + packageName);
      getRequest.onsuccess = function (event) {
        var result = event.target.result;
        callback(result);
      };
      getRequest.onerror = function (error) {
        errback(error);
      };
    }

    function cacheRemotePackage(
      db,
      packageName,
      packageData,
      packageMeta,
      callback,
      errback,
    ) {
      var transaction_packages = db.transaction([PACKAGE_STORE_NAME], IDB_RW);
      var packages = transaction_packages.objectStore(PACKAGE_STORE_NAME);

      var putPackageRequest = packages.put(
        packageData,
        "package/" + packageName,
      );
      putPackageRequest.onsuccess = function (_event) {
        var transaction_metadata = db.transaction(
          [METADATA_STORE_NAME],
          IDB_RW,
        );
        var metadata = transaction_metadata.objectStore(METADATA_STORE_NAME);
        var putMetadataRequest = metadata.put(
          packageMeta,
          "metadata/" + packageName,
        );
        putMetadataRequest.onsuccess = function (_event) {
          callback(packageData);
        };
        putMetadataRequest.onerror = function (error) {
          errback(error);
        };
      };
      putPackageRequest.onerror = function (error) {
        errback(error);
      };
    }

    function processPackageData(arrayBuffer) {
      assert(arrayBuffer, "Loading data file failed.");
      assert(
        arrayBuffer instanceof ArrayBuffer,
        "bad input to processPackageData",
      );
      var byteArray = new Uint8Array(arrayBuffer);

      // copy the entire loaded file into a spot in the heap. Files will refer to slices in that. They cannot be freed though
      // (we may be allocating before malloc is ready, during startup).
      if (Module["SPLIT_MEMORY"])
        Module.printErr(
          "warning: you should run the file packager with --no-heap-copy when SPLIT_MEMORY is used, otherwise copying into the heap may fail due to the splitting",
        );
      var ptr = Module["getMemory"](byteArray.length);
      Module["HEAPU8"].set(byteArray, ptr);
      DataRequest.prototype.byteArray = Module["HEAPU8"].subarray(
        ptr,
        ptr + byteArray.length,
      );

      var files = Module.files;
      for (var i = 0; i < files.length; ++i) {
        DataRequest.prototype.requests[files[i].filename].onload();
      }
      Module["removeRunDependency"]("datafile_game.data");
    }
    Module["addRunDependency"]("datafile_game.data");

    if (!Module.preloadResults) Module.preloadResults = {};

    function preloadFallback(error) {
      console.error(error);
      console.error("falling back to default preload behavior");
      fetchRemotePackage(
        REMOTE_PACKAGE_NAME,
        REMOTE_PACKAGE_SIZE,
        processPackageData,
        handleError,
      );
    }

    openDatabase(function (db) {
      checkCachedPackage(
        db,
        PACKAGE_PATH + PACKAGE_NAME,
        function (useCached) {
          Module.preloadResults[PACKAGE_NAME] = { fromCache: useCached };
          if (useCached) {
            console.info("loading " + PACKAGE_NAME + " from cache");
            fetchCachedPackage(
              db,
              PACKAGE_PATH + PACKAGE_NAME,
              processPackageData,
              preloadFallback,
            );
          } else {
            console.info("loading " + PACKAGE_NAME + " from remote");
            fetchRemotePackage(
              REMOTE_PACKAGE_NAME,
              REMOTE_PACKAGE_SIZE,
              function (packageData) {
                cacheRemotePackage(
                  db,
                  PACKAGE_PATH + PACKAGE_NAME,
                  packageData,
                  { uuid: PACKAGE_UUID },
                  processPackageData,
                  function (error) {
                    console.error(error);
                    processPackageData(packageData);
                  },
                );
              },
              preloadFallback,
            );
          }
        },
        preloadFallback,
      );
    }, preloadFallback);
  }
  if (Module["calledRun"]) {
    runWithFS();
  } else {
    if (!Module["preRun"]) Module["preRun"] = [];
    Module["preRun"].push(runWithFS); // FS is not initialized yet, wait for it
  }
}
