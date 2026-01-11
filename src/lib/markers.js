import { activeModel } from './stores.js';

export function addMarker(L, layerGroup, lat, lng, neighbors) {
    if (!layerGroup || !L) return;

    const marker = L.circleMarker([lat, lng], {
        radius: 8,
        color: 'blue',
        fillColor: 'blue',
        fillOpacity: 0.8
    }).addTo(layerGroup);

    marker.on('click', () => {
        const el = document.getElementById('name');
        if (el) el.innerText = "marker";

        // Create a generic object for this marker if it's not part of the main graph
        // Or if this is intended to be a graph node
        activeModel.set({ lat, lng, neighbors });
    });

    return marker;
}
