// --------------------------------------------------------------------------------------------------------------------------------- //
// EVENTS — socket, character and DOM subscriptions, parent overrides, and the internal bus
// --------------------------------------------------------------------------------------------------------------------------------- //

const _listeners = [];
const _wrapped = [];
const _topics = {};

function guarded(fn, label) {
	return function (...args) {
		try {
			return fn.apply(this, args);
		} catch (e) {
			catcher(e, label);
		}
	};
}

function on_socket(event, key, fn) {
	const socket = parent.socket;
	const slot = "_" + key;
	if (socket[slot]) socket.off(event, socket[slot]);
	socket[slot] = guarded(fn, `socket ${event} ${key}`);
	socket.on(event, socket[slot]);
	_listeners.push({ target: socket, event, slot, socket: true });
}

function off_socket(event, key) {
	const socket = parent.socket;
	const slot = "_" + key;
	if (!socket[slot]) return;
	socket.off(event, socket[slot]);
	delete socket[slot];
}

function on_character(event, key, fn) {
	character.on(event, guarded(fn, `character ${event} ${key}`));
}

function on_dom(target, event, key, fn) {
	const slot = "__al_dom_" + key;
	if (target[slot]) target.removeEventListener(event, target[slot]);
	target[slot] = guarded(fn, `dom ${event} ${key}`);
	target.addEventListener(event, target[slot]);
	_listeners.push({ target, event, slot, socket: false });
}

function release_listeners() {
	for (const l of _listeners) {
		if (!l.target[l.slot]) continue;
		if (l.socket) l.target.off(l.event, l.target[l.slot]);
		else l.target.removeEventListener(l.event, l.target[l.slot]);
		delete l.target[l.slot];
	}
}

function wrap_parent(name, make) {
	if (!parent.__al_wrapped) parent.__al_wrapped = {};
	const originals = parent.__al_wrapped;
	if (!(name in originals)) originals[name] = parent["__al_" + name] || parent[name];
	parent[name] = make(originals[name]);
	_wrapped.push(name);
}

function release_wrapped() {
	for (const name of _wrapped) {
		if (!parent.__al_wrapped || !(name in parent.__al_wrapped)) continue;
		parent[name] = parent.__al_wrapped[name];
		delete parent.__al_wrapped[name];
	}
}

function parent_slot(name, make) {
	if (!parent[name]) parent[name] = make();
	return parent[name];
}

function bus_on(topic, key, fn) {
	if (!_topics[topic]) _topics[topic] = new Map();
	_topics[topic].set(key, guarded(fn, `bus ${topic} ${key}`));
}

function bus_emit(topic, data) {
	const subscribers = _topics[topic];
	if (!subscribers) return;
	for (const fn of subscribers.values()) fn(data);
}
