function fn_hashString32(value) {
	const text = String(value || '');
	let hash = 2166136261;
	for (let i = 0; i < text.length; i++) {
		hash ^= text.charCodeAt(i);
		hash = Math.imul(hash, 16777619);
	}
	return hash >>> 0;
}

const UNIT_COLOR_SCHEMES = [
	{ primary: '#6e8fb2', secondary: '#8ea9c4', accent: '#314a63' },
	{ primary: '#638b96', secondary: '#83a8b1', accent: '#2f5058' },
	{ primary: '#7e8f6a', secondary: '#9eac87', accent: '#3f4b30' },
	{ primary: '#8b7f67', secondary: '#a99a83', accent: '#4f4532' },
	{ primary: '#7f7aa0', secondary: '#9b95b7', accent: '#403b59' },
	{ primary: '#8f7388', secondary: '#ab90a3', accent: '#523f4d' },
	{ primary: '#6c86a1', secondary: '#8ba2bb', accent: '#34495f' },
	{ primary: '#6a8f85', secondary: '#89ab9f', accent: '#355047' },
	{ primary: '#8a7b95', secondary: '#a494af', accent: '#4a3f54' },
	{ primary: '#7f8e9f', secondary: '#9aa7b5', accent: '#3d4b5a' },
	{ primary: '#6f8576', secondary: '#8ea093', accent: '#3a4a3f' },
	{ primary: '#8c7a73', secondary: '#a7958d', accent: '#4d413c' }
];

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
	const scheme = UNIT_COLOR_SCHEMES[hashed % UNIT_COLOR_SCHEMES.length];
	return { ...scheme };
}

export function fn_getUnitColorPalette(p_andruavUnit) {
	return fn_getUnitColorPaletteByKey(fn_getUnitColorKey(p_andruavUnit));
}
