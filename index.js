#!/usr/bin/env node
const packageJson = require('./package.json');
const commander = require('commander');
const mustache = require('mustache');
const fs = require('fs-extra');
const crypto = require('crypto');
const path = require('path');
const klawSync = require('klaw-sync');
const { sep, resolve } = require('path');
const JSZip = require('jszip');

commander
  .version(packageJson.version)
  .option('-t, --title <string>', 'specify game name')
  .option('-m, --memory [bytes]', 'how much memory your game will require [16777216]', 16777216)
  .option('-c, --compatibility', 'specify flag to use compatibility version')
  .arguments('<input> <output>')
  .action((input, output) => {
    commander.input = input;
    commander.output = output;
  });
commander._name = 'love.js'; // eslint-disable-line no-underscore-dangle
commander.parse(process.argv);

const getMD5 = path => new Promise((resolve, reject) => {
  const hash = crypto.createHash('md5');
  const rs = fs.createReadStream(path);
  rs.on('error', reject);
  rs.on('data', chunk => hash.update(chunk));
  rs.on('end', () => resolve(hash.digest('hex')));
});

// prompt for args left out of the cli invocation
const getAdditionalInfo = async function getAdditionalInfo(parsedArgs) {
  const prompt = function prompt(msg) {
    return new Promise((done) => {
      process.stdout.write(msg);
      process.stdin.setEncoding('utf8');
      process.stdin.once('data', (val) => {
        process.stdin.unref();
        done(val.trim());
      });
    });
  };

  const args = {
    title: parsedArgs.title || 'A game made with LÖVE',
    memory: parsedArgs.memory,
    input: parsedArgs.input,
    output: parsedArgs.output,
    compat: parsedArgs.compatibility,
    window: {
      width: 800,
      height: 600,
    },
    game_data_filename: 'game.data',
  };
  args.input = parsedArgs.input || await prompt('Love file or directory: ');
  args.output = parsedArgs.output || await prompt('Output directory: ');

  if (fs.statSync(args.input).isDirectory() || !args.input.endsWith('.love')) {
    throw new Error('Input must be a .love game file');
  }

  return args;
};

const getFiles = async function getFiles(args) {
  const love_game = fs.readFileSync(args.input);
  const zip = await JSZip.loadAsync(love_game);
  const love_conf = await zip.file('conf.lua').async('string');
  const title = love_conf.match(/t\.window\.title\s*=\s*(.*)\s*/);
  const width = love_conf.match(/t\.window\.width\s*=\s*([0-9]+)\s*/);
  const height = love_conf.match(/t\.window\.height\s*=\s*([0-9]+)\s*/);
  if (title) args.title = title[1].substring(1, title[1].length - 1);
  if (width) args.window.width = parseInt(width[1]);
  if (height) args.window.height = parseInt(height[1]);
  args.game_data_filename = path.basename(args.input).replace('.love', '.data');
  args.uuid = await getMD5(args.input);

  // It should be a .love file
  return [args, {path: resolve(args.input)}];
};

getAdditionalInfo(commander).then((args) => {
  const outputDir = resolve(args.output);
  const srcDir = resolve(__dirname, 'src');

  getFiles(args).then(([args, file]) => {
    const buffer = fs.readFileSync(file.path);

    args.game_size = buffer.length;

    if (args.memory < buffer.length) {
      throw new Error(
        'The memory (-m, --memory [bytes]) allocated for your game should at least be as big as your assets. '
        + `The total size of your assets is ${buffer.length} bytes.`);
    }

    fs.mkdirsSync(`${outputDir}`);

    const fldr_name = args.compat ? 'compat' : 'release';
    const template = fs.readFileSync(`${srcDir}/index.html`, 'utf8');
    const renderedTemplate = mustache.render(template, args);

    fs.mkdirsSync(outputDir);
    fs.writeFileSync(`${outputDir}/index.html`, renderedTemplate);
    fs.writeFileSync(`${outputDir}/${args.game_data_filename}`, buffer);
    fs.copySync(`${srcDir}/love-game.js`, `${outputDir}/love-game.js`);
    fs.copySync(`${srcDir}/game.js`, `${outputDir}/game.js`);
    fs.copySync(`${srcDir}/${fldr_name}/love.js`, `${outputDir}/love.js`);
    fs.copySync(`${srcDir}/${fldr_name}/love.wasm`, `${outputDir}/love.wasm`);
    fs.copySync(`${srcDir}/love-game.css`, `${outputDir}/love-game.css`);

    if (fldr_name === 'release') {
      fs.copySync(`${srcDir}/${fldr_name}/love.worker.js`, `${outputDir}/love.worker.js`);
    }
  });
}).catch((e) => {
  console.error(e.message); // eslint-disable-line no-console
  process.exit(1);
});
