import { get } from 'svelte/store';
import { activeModel } from './stores.js';

export function place(map, graphMain, lat, lng, neighbor) {
    const id = Object.keys(graphMain).length;

    // Normalize neighbors to an array
    let neighborIds = [];
    if (Array.isArray(neighbor)) {
        neighborIds = [...neighbor];
    } else if (neighbor && typeof neighbor === 'object' && neighbor.id !== undefined) {
        neighborIds = [neighbor.id];
    } else if (neighbor !== undefined && neighbor !== null) {
        neighborIds = [neighbor];
    }

    const vert = { id, lat, lng, neighbors: neighborIds };
    const range = 0.0001;

    const exists = Object.values(graphMain).find(
        (n) =>
            Math.abs(n.lat - vert.lat) <= range &&
            Math.abs(n.lng - vert.lng) <= range,
    );

    if (exists) {
        // If double click or click on existing, checking connectivity or selecting? 
        // Logic from original file: connected new node to existing if close? 
        // Original logic:
        if (!Array.isArray(exists.neighbors)) {
            exists.neighbors = [];
        }
        // Connect the 'neighbor' (previous node) to this existing node
        if (neighborIds.length > 0) {
            neighborIds.forEach(nId => {
                if (!exists.neighbors.includes(nId) && nId != exists.id) {
                    exists.neighbors.push(nId);
                    // Also Connect nId back to exists
                    if (graphMain[nId]) {
                        if (!graphMain[nId].neighbors) graphMain[nId].neighbors = [];
                        if (!graphMain[nId].neighbors.includes(exists.id)) {
                            graphMain[nId].neighbors.push(exists.id);
                        }
                    }
                }
            });
        }

        // Set this existing node as active
        activeModel.set(exists);
        return graphMain; // Don't add new node
    }

    // New Node logic
    if (neighborIds.length > 0) {
        neighborIds.forEach(nId => {
            if (graphMain[nId]) {
                if (!graphMain[nId].neighbors) graphMain[nId].neighbors = [];
                if (!graphMain[nId].neighbors.includes(id)) {
                    graphMain[nId].neighbors.push(id);
                }
            }
        });
    }

    graphMain[id] = vert;
    activeModel.set(vert); // Set new node as active
    return graphMain;
}

export function draw(map, graphMain, L, layerGroup) {
    if (!layerGroup) return;
    layerGroup.clearLayers();

    const nodes = Object.values(graphMain);

    nodes.forEach((node) => {
        // Draw Node
        const marker = L.circleMarker([node.lat, node.lng], {
            radius: 6,
            color: "red",
            fillColor: "blue",
            fillOpacity: 1
        }).addTo(layerGroup);

        marker.on('click', (e) => {
            L.DomEvent.stopPropagation(e); // Prevent map click
            activeModel.set(node);
            console.log('Node selected:', node);
        });

        // Draw Edges
        if (Array.isArray(node.neighbors)) {
            node.neighbors.forEach(neighborId => {
                const neighbor = graphMain[neighborId];
                if (neighbor) {
                    // Draw line
                    L.polyline(
                        [[node.lat, node.lng], [neighbor.lat, neighbor.lng]],
                        { color: "red", weight: 3 }
                    ).addTo(layerGroup);
                }
            });
        }
    });

    // Highlight active node
    const currentActive = get(activeModel);
    if (currentActive && graphMain[currentActive.id]) {
        L.circleMarker([currentActive.lat, currentActive.lng], {
            radius: 8,
            color: "yellow",
            fillColor: "green",
            fillOpacity: 0.8
        }).addTo(layerGroup);
    }
}
