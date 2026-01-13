import { activeData, graph } from '$lib/stores.js';
import osmtogeojson from 'osmtogeojson';
import { updateInspect } from '$lib/map.js';

export async function initial(map, L) {
    if (!map || !L) return;
    return map;
}
