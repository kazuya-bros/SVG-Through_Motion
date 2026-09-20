// UI-only presentation switches. The assist API remains available regardless
// of these flags so an agent can still finish a correction during a showcase.
const query = typeof location === 'undefined' ? new URLSearchParams() : new URLSearchParams(location.search);

export const exhibitionMode = query.get('exhibition') === '1' || query.get('mode') === 'exhibition';
export const aiCorrectionUiVisible = query.get('show-ai') === '1';
