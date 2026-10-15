// --------------------------------------------------------------------------------------------------------------------------------- //
// EXPERIMENTS — a setting under test alternates its variants on the wall clock, and every record carries the variant that ran
// --------------------------------------------------------------------------------------------------------------------------------- //

const EXPERIMENT_BLOCK_MIN = 30;

var EXPERIMENTS = {};

function experiment_variant(name) {
	const e = EXPERIMENTS[name];
	const labels = Object.keys(e.variants).sort();
	const block = Math.floor(Date.now() / ((e.block_min || EXPERIMENT_BLOCK_MIN) * 60000));
	return labels[block % labels.length];
}

function experiment_value(name, fallback) {
	if (!(name in EXPERIMENTS)) return fallback;
	return EXPERIMENTS[name].variants[experiment_variant(name)];
}

function experiment_variants() {
	return Object.keys(EXPERIMENTS).sort().map(name => name + "=" + experiment_variant(name)).join(",");
}

console_api({
	experiment_variants: "the experiments running and the variant each is on now",
});
