"use strict";

// --------------------------------------------------------------------------------------------------------------------------------- //
// CONFIG CHECK — every key of each role's CONFIG is read somewhere, and every CONFIG key read exists. `node "Tests/Config Check.js"`
// prints the problems as JSON; Tools/Lint.py consumes it. CONFIG is taken from each role booted in the harness, so spreads of the
// shared defaults count, and reads are found in every file the role loads, commented-out code included.
// --------------------------------------------------------------------------------------------------------------------------------- //

const { acorn, read_repo_file } = require("./Game Sources.js");
const { bootstrap_lists, PARSE_OPTIONS } = require("./Analyze.js");
const { boot, minimal_fixture } = require("./Harness.js");

const COMMENTED_READ = /\bCONFIG\.(\w+)(?:\?)?\.(\w+)/g;

// --------------------------------------------------------------------------------------------------------------------------------- //
// READS — CONFIG.a.b, CONFIG.a?.b, an alias (const c = CONFIG.a; c.b), a destructure (const { b } = CONFIG.a)
// --------------------------------------------------------------------------------------------------------------------------------- //

function walk(node, visit, parent) {
	if (!node || typeof node.type !== "string") return;
	visit(node, parent);
	for (const key in node) {
		if (key === "loc") continue;
		const child = node[key];
		if (Array.isArray(child)) child.forEach(c => walk(c, visit, node));
		else if (child && typeof child.type === "string") walk(child, visit, node);
	}
}

function config_section(node) {
	if (!node || node.type !== "MemberExpression" || node.computed) return null;
	if (node.object.type !== "Identifier" || node.object.name !== "CONFIG") return null;
	return node.property.name;
}

function file_reads(parser, file) {
	const comments = [];
	const ast = parser.parse(read_repo_file(file), Object.assign({}, PARSE_OPTIONS, { onComment: comments }));
	const reads = [];
	const whole = new Set();
	const aliases = {};
	const read = (path, node) => reads.push({ path, file, line: node.loc.start.line });

	walk(ast, node => {
		if (node.type !== "VariableDeclarator") return;
		const section = config_section(node.init);
		if (!section) return;
		if (node.id.type === "Identifier") aliases[node.id.name] = section;
		if (node.id.type === "ObjectPattern") {
			for (const prop of node.id.properties) {
				if (prop.key) read(section + "." + (prop.key.name || prop.key.value), node);
				else whole.add(section);
			}
		}
	});

	walk(ast, (node, parent) => {
		if (node.type !== "MemberExpression" || node.object.type !== "Identifier") return;
		const root = node.object.name;
		if (root !== "CONFIG" && !(root in aliases)) return;
		if (node.computed) return void whole.add(root === "CONFIG" ? "*" : aliases[root]);
		if (root !== "CONFIG") return read(aliases[root] + "." + node.property.name, node);
		const section = node.property.name;
		const outer = parent && parent.type === "MemberExpression" && parent.object === node ? parent : null;
		if (!outer) return read(section, node);
		if (outer.computed) return void whole.add(section);
		read(section + "." + outer.property.name, node);
	});

	for (const c of comments) {
		for (const m of c.value.matchAll(COMMENTED_READ)) reads.push({ path: m[1] + "." + m[2], file, line: c.loc.start.line, commented: true });
	}
	return { reads, whole };
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// CHECK
// --------------------------------------------------------------------------------------------------------------------------------- //

function has_key(config, path) {
	const [section, key] = path.split(".");
	if (!(section in config)) return false;
	if (key === undefined) return true;
	const value = config[section];
	return !!value && typeof value === "object" && key in value;
}

function is_section(value) {
	return !!value && typeof value === "object" && !Array.isArray(value);
}

async function check() {
	const parser = await acorn();
	const lists = bootstrap_lists(parser);
	const shared = [...lists.kernel, ...lists.first, ...lists.parallel];
	const roles = Object.keys(lists.roles);

	const configs = {};
	for (const name of roles) configs[name] = (await boot(minimal_fixture(name), { entry: false })).ctx.CONFIG;

	const by_file = {};
	for (const file of [...shared, ...roles.flatMap(name => lists.roles[name])]) {
		if (!by_file[file]) by_file[file] = file_reads(parser, file);
	}

	const missing = [];
	for (const file in by_file) {
		const owners = roles.filter(name => lists.roles[name].includes(file));
		for (const r of by_file[file].reads) {
			if (r.commented) continue;
			const found = owners.length
				? owners.every(name => has_key(configs[name], r.path))
				: roles.some(name => has_key(configs[name], r.path));
			if (!found) missing.push({ file, line: r.line, key: r.path, roles: owners.length ? owners : "any" });
		}
	}

	const unused = [];
	for (const name of roles) {
		const read = new Set();
		const whole = new Set();
		for (const file of [...shared, ...lists.roles[name]]) {
			for (const r of by_file[file].reads) {
				read.add(r.path);
				read.add(r.path.split(".")[0]);
			}
			by_file[file].whole.forEach(s => whole.add(s));
		}
		if (whole.has("*")) continue;
		const config = configs[name];
		for (const section in config) {
			if (whole.has(section)) continue;
			if (!read.has(section)) {
				unused.push({ role: name, key: section });
				continue;
			}
			if (!is_section(config[section])) continue;
			for (const key in config[section]) {
				if (!read.has(section + "." + key)) unused.push({ role: name, key: section + "." + key });
			}
		}
	}

	return { missing, unused };
}

module.exports = { check };

if (require.main === module) {
	check().then(r => process.stdout.write(JSON.stringify(r)), e => {
		console.error(e.stack || e.message);
		process.exit(1);
	});
}
