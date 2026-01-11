import { writable } from 'svelte/store';

export const activeData = writable(null);
export const activeModel = writable(null); // active graph node/element
export const graph = writable({ mains: {}, loc: {} });
