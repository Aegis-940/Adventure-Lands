"use strict";

// --------------------------------------------------------------------------------------------------------------------------------- //
// GAME SOURCES — the game's own scripts and the JS parser, cached in Tools/.cache like Party Model's
// --------------------------------------------------------------------------------------------------------------------------------- //

const fs = require("fs");
const path = require("path");

const REPO = path.dirname(__dirname);
const CACHE = path.join(REPO, "Tools", ".cache");
const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

const SOURCES = {
	"data.js": "https://adventure.land/data.js",
	"common_functions.js": "https://raw.githubusercontent.com/kaansoral/adventureland/master/js/common_functions.js",
	"runner_functions.js": "https://raw.githubusercontent.com/kaansoral/adventureland/master/js/runner_functions.js",
	"acorn.js": "https://cdn.jsdelivr.net/npm/acorn@8.12.1/dist/acorn.js",
};

const PINNED = new Set(["acorn.js"]);

async function source_path(name) {
	const file = path.join(CACHE, name);
	const max_age = PINNED.has(name) ? Infinity : CACHE_MAX_AGE_MS;
	const fresh = fs.existsSync(file) && Date.now() - fs.statSync(file).mtimeMs < max_age;
	if (!fresh) {
		try {
			const res = await fetch(SOURCES[name]);
			if (!res.ok) throw new Error(res.status + " " + res.statusText);
			fs.mkdirSync(CACHE, { recursive: true });
			fs.writeFileSync(file, await res.text());
		} catch (e) {
			if (!fs.existsSync(file)) throw new Error("cannot fetch " + name + ": " + e.message);
		}
	}
	return file;
}

async function source(name) {
	return fs.readFileSync(await source_path(name), "utf8");
}

async function acorn() {
	return require(await source_path("acorn.js"));
}

function read_repo_file(name) {
	let text = fs.readFileSync(path.join(REPO, name), "utf8");
	if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
	return text.replace(/[​-‍﻿]/g, "");
}

module.exports = { REPO, CACHE, source, source_path, acorn, read_repo_file };
