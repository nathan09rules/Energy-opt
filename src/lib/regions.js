import { writable } from 'svelte/store';

export const activeData = writable(null);
export const activeModel = writable(null);
export const regions = writable({ type: "FeatureCollection", features: [] });
export const emergencyServices = writable([]);
export const graph = writable({
    mains: {},
    loc: {}
});

export const powerSources = writable([]);
export const powerIndicators = writable([]);
