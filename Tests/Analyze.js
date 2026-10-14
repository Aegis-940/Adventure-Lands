"use strict";

// --------------------------------------------------------------------------------------------------------------------------------- //
// ANALYZE — parses every file the bot loads: what it defines, what it references at load and at call time, and the legacy patterns
// the ratchet counts. `node Tests/Analyze.js` prints the result as JSON; Tools/Lint.py and Tests/Harness.js consume it.
// --------------------------------------------------------------------------------------------------------------------------------- //

const { acorn, source, read_repo_file } = require("./Game Sources.js");

const PARSE_OPTIONS = { ecmaVersion: "latest", sourceType: "script", locations: true, allowHashBang: true };

const BUILTIN_CALLEES = new Set([
	"Set", "Map", "WeakMap", "WeakSet", "Object", "Array", "Math", "JSON", "Date", "Number", "String", "Boolean",
	"RegExp", "Promise", "Symbol", "Error", "parseInt", "parseFloat", "isFinite", "isNaN", "encodeURI", "encodeURIComponent",
	"G",
]);

const MONSTER_WORDS_EXCLUDED = new Set(["target"]);

const EMIT_CALLS = new Set(["equip", "unequip", "use_skill", "attack", "heal", "move", "smart_move"]);

// --------------------------------------------------------------------------------------------------------------------------------- //
// BOOTSTRAPPER LISTS — the load order is read from Bootstrapper.js itself, never copied
// --------------------------------------------------------------------------------------------------------------------------------- //

function literal_strings(node) {
	if (!node) return [];
	if (node.type === "ArrayExpression") return node.elements.filter(e => e && e.type === "Literal").map(e => e.value);
	if (node.type === "NewExpression" && node.arguments.length) return literal_strings(node.arguments[0]);
	return [];
}

function bootstrap_lists(parser) {
	const ast = parser.parse(read_repo_file("Bootstrapper.js"), PARSE_OPTIONS);
	const lists = { first: [], parallel: [], roles: {}, optional: [] };
	walk_all(ast, node => {
		if (node.type !== "VariableDeclarator" || node.id.type !== "Identifier") return;
		const name = node.id.name;
		if (name === "first_scripts") lists.first = literal_strings(node.init);
		if (name === "scripts") lists.parallel = literal_strings(node.init);
		if (name === "OPTIONAL_SCRIPTS") lists.optional = literal_strings(node.init);
		if (name === "role_scripts" && node.init && node.init.type === "ObjectExpression") {
			for (const prop of node.init.properties) {
				const key = prop.key.type === "Literal" ? prop.key.value : prop.key.name;
				lists.roles[key] = literal_strings(prop.value);
			}
		}
	});
	return lists;
}

function walk_all(node, visit) {
	if (!node || typeof node.type !== "string") return;
	visit(node);
	for (const key in node) {
		if (key === "loc" || key === "start" || key === "end") continue;
		const child = node[key];
		if (Array.isArray(child)) child.forEach(c => walk_all(c, visit));
		else if (child && typeof child.type === "string") walk_all(child, visit);
	}
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// SCOPES — just enough to tell a global reference from a local one
// --------------------------------------------------------------------------------------------------------------------------------- //

function pattern_names(pattern, out) {
	if (!pattern) return out;
	if (pattern.type === "Identifier") out.push(pattern.name);
	else if (pattern.type === "ObjectPattern") pattern.properties.forEach(p => pattern_names(p.type === "RestElement" ? p.argument : p.value, out));
	else if (pattern.type === "ArrayPattern") pattern.elements.forEach(e => pattern_names(e, out));
	else if (pattern.type === "RestElement") pattern_names(pattern.argument, out);
	else if (pattern.type === "AssignmentPattern") pattern_names(pattern.left, out);
	return out;
}

function is_function(node) {
	return node.type === "FunctionDeclaration" || node.type === "FunctionExpression" || node.type === "ArrowFunctionExpression";
}

function declared_in(body, out) {
	walk_shallow(body, node => {
		if (node.type === "VariableDeclaration") node.declarations.forEach(d => pattern_names(d.id, out));
		if ((node.type === "FunctionDeclaration" || node.type === "ClassDeclaration") && node.id) out.push(node.id.name);
		if (node.type === "CatchClause" && node.param) pattern_names(node.param, out);
	});
	return out;
}

function walk_shallow(node, visit) {
	if (!node || typeof node.type !== "string") return;
	visit(node);
	if (is_function(node)) return;
	for (const key in node) {
		if (key === "loc" || key === "start" || key === "end") continue;
		const child = node[key];
		if (Array.isArray(child)) child.forEach(c => walk_shallow(c, visit));
		else if (child && typeof child.type === "string") walk_shallow(child, visit);
	}
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// ONE FILE
// --------------------------------------------------------------------------------------------------------------------------------- //

function member_path(node) {
	if (node.type === "Identifier") return node.name;
	if (node.type === "ThisExpression") return "this";
	if (node.type === "MemberExpression" && !node.computed) {
		const object = member_path(node.object);
		return object ? object + "." + node.property.name : null;
	}
	return null;
}

function callee_root(callee) {
	let node = callee;
	while (node.type === "MemberExpression") node = node.object;
	return node.type === "Identifier" ? node.name : null;
}

function analyze_file(parser, name, text, monsters) {
	const ast = parser.parse(text, PARSE_OPTIONS);
	const lines = text.split("\n");
	const result = {
		defines: {},
		statements: [],
		call_initializers: [],
		refs_load: new Set(),
		refs_call: new Set(),
		counters: {
			top_level_statements: 0,
			call_initializers: 0,
			set_interval: 0,
			while_true: 0,
			self_timeout: 0,
			socket_on_off: 0,
			character_on: 0,
			add_event_listener: 0,
			parent_assign: 0,
			local_storage: 0,
			typeof_guard: 0,
			monster_literals: 0,
			emits: 0,
		},
		monsters: [],
		sites: {},
		function_refs: {},
	};

	const site = (counter, node) => {
		result.counters[counter]++;
		if (!result.sites[counter]) result.sites[counter] = [];
		result.sites[counter].push(node.loc.start.line);
	};

	const scopes = [];
	const fn_names = [];
	const is_local = id => scopes.some(s => s.has(id));
	let top_function = null;

	function reference(id, depth) {
		if (is_local(id)) return;
		(depth === 0 ? result.refs_load : result.refs_call).add(id);
		if (depth > 0 && top_function) result.function_refs[top_function].add(id);
	}

	function visit_function(node, depth) {
		const names = [];
		node.params.forEach(p => pattern_names(p, names));
		if (node.type === "FunctionExpression" && node.id) names.push(node.id.name);
		const body = node.body;
		if (body.type === "BlockStatement") declared_in(body, names);
		scopes.push(new Set(names));
		fn_names.push(node.id ? node.id.name : null);
		node.params.forEach(p => visit_pattern_defaults(p, depth + 1));
		visit(body, depth + 1);
		fn_names.pop();
		scopes.pop();
	}

	function visit_pattern_defaults(pattern, depth) {
		if (!pattern) return;
		if (pattern.type === "AssignmentPattern") {
			visit_pattern_defaults(pattern.left, depth);
			visit(pattern.right, depth);
		} else if (pattern.type === "ObjectPattern") {
			pattern.properties.forEach(p => {
				if (p.type === "RestElement") return visit_pattern_defaults(p.argument, depth);
				if (p.computed) visit(p.key, depth);
				visit_pattern_defaults(p.value, depth);
			});
		} else if (pattern.type === "ArrayPattern") {
			pattern.elements.forEach(e => visit_pattern_defaults(e, depth));
		} else if (pattern.type === "RestElement") {
			visit_pattern_defaults(pattern.argument, depth);
		}
	}

	function count_patterns(node) {
		if (node.type === "CallExpression") {
			const path = member_path(node.callee);
			const root = callee_root(node.callee);
			if (path === "setInterval" || path === "window.setInterval" || path === "parent.setInterval") site("set_interval", node);
			if ((path === "setTimeout" || path === "window.setTimeout") && node.arguments[0]
				&& node.arguments[0].type === "Identifier" && fn_names.includes(node.arguments[0].name)) site("self_timeout", node);
			if (node.callee.type === "MemberExpression" && !node.callee.computed) {
				const prop = node.callee.property.name;
				const object = member_path(node.callee.object);
				if ((prop === "on" || prop === "off" || prop === "once") && (object === "parent.socket" || object === "socket")) site("socket_on_off", node);
				if (prop === "on" && object === "character") site("character_on", node);
				if (prop === "addEventListener") site("add_event_listener", node);
				if (prop === "emit" && (object === "parent.socket" || object === "socket")) site("emits", node);
			}
			if (node.callee.type === "Identifier" && EMIT_CALLS.has(node.callee.name) && !is_local(node.callee.name)) site("emits", node);
			if (root === "localStorage") return;
		}
		if (node.type === "MemberExpression" && node.object.type === "Identifier" && node.object.name === "localStorage") site("local_storage", node);
		if (node.type === "WhileStatement" && node.test.type === "Literal" && node.test.value === true) site("while_true", node);
		if (node.type === "ForStatement" && !node.test) site("while_true", node);
		if (node.type === "AssignmentExpression" && node.left.type === "MemberExpression" && !node.left.computed
			&& node.left.object.type === "Identifier" && node.left.object.name === "parent") site("parent_assign", node);
		if (node.type === "BinaryExpression" && /^[!=]==?$/.test(node.operator)) {
			const [a, b] = [node.left, node.right];
			const guard = (u, l) => u.type === "UnaryExpression" && u.operator === "typeof" && u.argument.type === "Identifier"
				&& !is_local(u.argument.name) && l.type === "Literal" && (l.value === "function" || l.value === "undefined");
			if (guard(a, b) || guard(b, a)) site("typeof_guard", node);
		}
		if (node.type === "Literal" && typeof node.value === "string" && monsters.has(node.value)) {
			site("monster_literals", node);
			result.monsters.push({ line: node.loc.start.line, name: node.value });
		}
		if (node.type === "Property" && !node.computed && node.key.type === "Identifier" && monsters.has(node.key.name)) {
			site("monster_literals", node);
			result.monsters.push({ line: node.loc.start.line, name: node.key.name });
		}
	}

	function visit(node, depth) {
		if (!node || typeof node.type !== "string") return;
		count_patterns(node);
		switch (node.type) {
			case "FunctionDeclaration":
			case "FunctionExpression":
			case "ArrowFunctionExpression":
				return visit_function(node, depth);
			case "Identifier":
				return reference(node.name, depth);
			case "MemberExpression":
				visit(node.object, depth);
				if (node.computed) visit(node.property, depth);
				return;
			case "Property":
			case "PropertyDefinition":
			case "MethodDefinition":
				if (node.computed) visit(node.key, depth);
				if (node.type === "Property" && node.key.type === "Literal") count_patterns(node.key);
				return visit(node.value, depth);
			case "VariableDeclarator":
				visit_pattern_defaults(node.id, depth);
				return visit(node.init, depth);
			case "CatchClause": {
				const names = pattern_names(node.param, []);
				scopes.push(new Set(names));
				visit(node.body, depth);
				scopes.pop();
				return;
			}
			case "LabeledStatement":
				return visit(node.body, depth);
			case "BreakStatement":
			case "ContinueStatement":
			case "MetaProperty":
				return;
			case "ClassDeclaration":
			case "ClassExpression":
				visit(node.superClass, depth);
				return visit(node.body, depth);
		}
		for (const key in node) {
			if (key === "loc" || key === "start" || key === "end" || key === "type") continue;
			const child = node[key];
			if (Array.isArray(child)) child.forEach(c => visit(c, depth));
			else if (child && typeof child.type === "string") visit(child, depth);
		}
	}

	function has_bot_call(init) {
		let found = null;
		walk_shallow(init, node => {
			if (found) return;
			if (node.type !== "CallExpression" && node.type !== "NewExpression") return;
			const root = callee_root(node.callee);
			if (!root || BUILTIN_CALLEES.has(root)) return;
			found = root;
		});
		return found;
	}

	for (const stmt of ast.body) {
		const line = stmt.loc.start.line;
		if (stmt.type === "FunctionDeclaration") {
			result.defines[stmt.id.name] = stmt.async ? "async function" : "function";
			top_function = stmt.id.name;
			result.function_refs[top_function] = new Set();
			visit(stmt, 0);
			top_function = null;
			continue;
		}
		if (stmt.type === "VariableDeclaration") {
			for (const d of stmt.declarations) {
				pattern_names(d.id, []).forEach(n => { result.defines[n] = stmt.kind; });
				if (d.init && d.id.type === "Identifier" && is_function(d.init)) {
					top_function = d.id.name;
					result.function_refs[top_function] = new Set();
					visit(d, 0);
					top_function = null;
					continue;
				}
				const call = d.init ? has_bot_call(d.init) : null;
				if (call) {
					result.counters.call_initializers++;
					if (!result.sites.call_initializers) result.sites.call_initializers = [];
					result.sites.call_initializers.push(d.loc.start.line);
					result.call_initializers.push({ line: d.loc.start.line, name: pattern_names(d.id, []).join(","), call });
				}
			}
			stmt.declarations.forEach(d => {
				if (!(d.init && d.id.type === "Identifier" && is_function(d.init))) visit(d, 0);
			});
			continue;
		}
		if (stmt.type === "EmptyStatement") continue;
		result.counters.top_level_statements++;
		if (!result.sites.top_level_statements) result.sites.top_level_statements = [];
		result.sites.top_level_statements.push(line);
		const call = stmt.type === "ExpressionStatement" && stmt.expression.type === "CallExpression"
			? member_path(stmt.expression.callee) : null;
		result.statements.push({ line, call, text: lines[line - 1].trim().slice(0, 100) });
		visit(stmt, 0);
	}

	result.refs_load = [...result.refs_load].sort();
	result.refs_call = [...result.refs_call].sort();
	for (const fn in result.function_refs) result.function_refs[fn] = [...result.function_refs[fn]].sort();
	return result;
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// THE GRAPH — references resolved to the files that define them
// --------------------------------------------------------------------------------------------------------------------------------- //

function role_of(lists, name) {
	for (const role in lists.roles) {
		if (lists.roles[role].includes(name)) return role;
	}
	return null;
}

function build_graph(lists, files) {
	const definers = {};
	for (const name in files) {
		for (const id in files[name].defines) (definers[id] = definers[id] || []).push(name);
	}

	const edges = {};
	const add_edge = (from, to, id, kind) => {
		const key = from + "\u0000" + to;
		if (!edges[key]) edges[key] = { from, to, load: [], call: [] };
		if (!edges[key][kind].includes(id)) edges[key][kind].push(id);
	};

	const resolve = (context, id) => {
		if (files[context].defines[id] !== undefined) return [context];
		const role = role_of(lists, context);
		const candidates = definers[id] || [];
		const same_role = candidates.filter(c => role && role_of(lists, c) === role);
		const shared = candidates.filter(c => !role_of(lists, c));
		return same_role.length ? same_role : shared.length ? shared : candidates.length ? ["(role files)"] : [];
	};

	const load_reach = from => {
		const seen = new Set();
		const reached = [];
		const queue = files[from].refs_load.map(id => [from, id]);
		while (queue.length) {
			const [context, id] = queue.shift();
			for (const target of resolve(context, id)) {
				const key = target + " " + id;
				if (seen.has(key)) continue;
				seen.add(key);
				reached.push([target, id]);
				const refs = files[target] && files[target].function_refs[id];
				if (refs) refs.forEach(r => queue.push([target, r]));
			}
		}
		return reached;
	};

	for (const from in files) {
		for (const [target, id] of load_reach(from)) {
			if (target !== from) add_edge(from, target, id, "load");
		}
		for (const id of files[from].refs_call) {
			for (const target of resolve(from, id)) {
				if (target !== from) add_edge(from, target, id, "call");
			}
		}
	}

	const list = Object.values(edges).map(e => ({ from: e.from, to: e.to, load: e.load.sort(), call: e.call.sort() }));
	list.sort((a, b) => (a.from + a.to).localeCompare(b.from + b.to));
	return list;
}

function strongly_connected(nodes, edges) {
	const adjacency = {};
	nodes.forEach(n => { adjacency[n] = []; });
	edges.forEach(e => { if (adjacency[e.from] && adjacency[e.to] !== undefined) adjacency[e.from].push(e.to); });

	let index = 0;
	const stack = [];
	const on_stack = new Set();
	const idx = {};
	const low = {};
	const components = [];

	function connect(v) {
		idx[v] = low[v] = index++;
		stack.push(v);
		on_stack.add(v);
		for (const w of adjacency[v]) {
			if (idx[w] === undefined) {
				connect(w);
				low[v] = Math.min(low[v], low[w]);
			} else if (on_stack.has(w)) {
				low[v] = Math.min(low[v], idx[w]);
			}
		}
		if (low[v] === idx[v]) {
			const component = [];
			let w;
			do {
				w = stack.pop();
				on_stack.delete(w);
				component.push(w);
			} while (w !== v);
			if (component.length > 1) components.push(component.sort());
		}
	}

	nodes.forEach(n => { if (idx[n] === undefined) connect(n); });
	return components.sort((a, b) => b.length - a.length);
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// ENTRY
// --------------------------------------------------------------------------------------------------------------------------------- //

async function analyze() {
	const parser = await acorn();
	const lists = bootstrap_lists(parser);

	const vm = require("vm");
	const game = vm.createContext({});
	vm.runInContext(await source("data.js"), game);
	const monsters = new Set(Object.keys(game.G.monsters).filter(m => !MONSTER_WORDS_EXCLUDED.has(m)));

	const order = [...lists.first, ...lists.parallel];
	for (const role in lists.roles) lists.roles[role].forEach(f => { if (!order.includes(f)) order.push(f); });

	const files = {};
	for (const name of order) {
		files[name] = analyze_file(parser, name, read_repo_file(name), monsters);
		files[name].stage = lists.first.includes(name) ? "first" : lists.parallel.includes(name) ? "parallel" : "role";
		files[name].role = role_of(lists, name);
		files[name].optional = lists.optional.includes(name);
	}

	const edges = build_graph(lists, files);
	const shared = order.filter(n => !role_of(lists, n));
	const load_edges = edges.filter(e => e.load.length);

	return {
		lists,
		order,
		files,
		edges,
		cycles: strongly_connected(shared, edges.filter(e => shared.includes(e.from) && shared.includes(e.to))),
		load_cycles: strongly_connected(shared, load_edges.filter(e => shared.includes(e.from) && shared.includes(e.to))),
	};
}

module.exports = { analyze, analyze_file, bootstrap_lists, PARSE_OPTIONS };

if (require.main === module) {
	analyze().then(r => process.stdout.write(JSON.stringify(r)), e => {
		console.error(e.stack || e.message);
		process.exit(1);
	});
}
