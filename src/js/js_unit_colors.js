function fn_hashString32(value) {
	const text = String(value || '');
	let hash = 2166136261;
	for (let i = 0; i < text.length; i++) {
		hash ^= text.charCodeAt(i);
		hash = Math.imul(hash, 16777619);
	}
	return hash >>> 0;
}

function fn_getFallbackIndex(p_andruavUnit) {
	const idx = p_andruavUnit && Number.isFinite(p_andruavUnit.m_index) ? Math.abs(p_andruavUnit.m_index) : 0;
	return idx;
}

export function fn_getUnitColorKey(p_andruavUnit) {
	if (p_andruavUnit === null || p_andruavUnit === undefined) {
		return 'unit:fallback:0';
	}

	if (typeof p_andruavUnit.getPartyID === 'function') {
		const partyID = p_andruavUnit.getPartyID();
		if (partyID !== null && partyID !== undefined && String(partyID).length > 0) {
			return `unit:${partyID}`;
		}
	}

	const fallbackIndex = fn_getFallbackIndex(p_andruavUnit);
	return `unit:fallback:${fallbackIndex}`;
}

export function fn_getUnitColorPaletteByKey(key) {
	const hashed = fn_hashString32(key);
	const hue = hashed % 360;

	return {
		primary: `hsl(${hue}, 82%, 56%)`,
		secondary: `hsl(${(hue + 16) % 360}, 82%, 50%)`,
		accent: `hsl(${hue}, 72%, 32%)`
	};
}

export function fn_getUnitColorPalette(p_andruavUnit) {
	return fn_getUnitColorPaletteByKey(fn_getUnitColorKey(p_andruavUnit));
}
