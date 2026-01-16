import { get } from 'svelte/store';
import { writable } from 'svelte/store';
import { activeModel, activeData, graph } from './stores.js';
import { layer, darkMode } from './map.js';
import { CONFIGS } from './configs.js';

export const is_running = writable(false);

function distance(lat1, lng1, lat2, lng2) {
    return Math.sqrt(Math.pow(lat1 - lat2, 2) + Math.pow(lng1 - lng2, 2));
}

/**
 * Automatically creates neighbors for loc nodes based on proximity and grid resistance.
 */
export function autoConnect(graphStore) {
    const data = get(graphStore);
    const locs = Object.values(data.loc);
    const mains = Object.values(data.mains);

    locs.forEach(node => {
        if (node.neighbors && node.neighbors.length >= (CONFIGS["max neighbors"] || 3)) return;
        node.neighbors = node.neighbors || [];

        let nearestMain = null;
        let minDistM = Infinity;
        mains.forEach(m => {
            const d = distance(node.lat, node.lng, m.lat, m.lng);
            if (d < minDistM) { minDistM = d; nearestMain = m; }
        });

        let nearestLoc = null;
        let minDistL = Infinity;
        locs.forEach(l => {
            if (l.id === node.id) return;
            const d = distance(node.lat, node.lng, l.lat, l.lng);
            if (d < minDistL) { minDistL = d; nearestLoc = l; }
        });

        if (nearestMain && (minDistM * CONFIGS["main resistance"] < minDistL * CONFIGS["location resistance"])) {
            if (!node.neighbors.includes(nearestMain.id)) node.neighbors.push(nearestMain.id);
        } else if (nearestLoc) {
            if (!node.neighbors.includes(nearestLoc.id)) node.neighbors.push(nearestLoc.id);
        }
    });

    graphStore.set(data);
}

export function place(map, graphMain, lat, lng, neighbor) {
    const id = "M" + Object.keys(graphMain).length;
    let neighborIds = neighbor?.id !== undefined ? [neighbor.id] : (neighbor ? [neighbor] : []);

    const vert = { id, lat, lng, neighbors: neighborIds, type: 'main' };
    graphMain[id] = vert;

    neighborIds.forEach(nId => {
        if (graphMain[nId]) {
            graphMain[nId].neighbors = graphMain[nId].neighbors || [];
            if (!graphMain[nId].neighbors.includes(id)) graphMain[nId].neighbors.push(id);
        }
    });

    activeModel.set(vert);
    return graphMain;
}

export function draw(map, graphData, L, layerGroup) {
    if (!layerGroup) return;
    layerGroup.clearLayers();

    const mains = Object.values(graphData.mains);
    const locs = Object.values(graphData.loc);

    const isDark = get(darkMode);

    // Draw grid wires
    [...mains, ...locs].forEach(node => {
        node.neighbors?.forEach(nId => {
            const dest = graphData.mains[nId] || graphData.loc[nId];
            if (dest) {
                L.polyline([[node.lat, node.lng], [dest.lat, dest.lng]], {
                    color: node.type === 'main' ? (isDark ? '#ff4d4d' : '#cc0000') : (isDark ? '#ffa500' : '#e69500'),
                    weight: node.type === 'main' ? 2 : 1,
                    opacity: 0.5,
                    dashArray: node.type === 'main' ? null : '4, 4'
                }).addTo(layerGroup);
            }
        });
    });

    // Draw main junction points
    mains.forEach(node => {
        L.circleMarker([node.lat, node.lng], {
            radius: 5, color: isDark ? "white" : "black", fillColor: "red", fillOpacity: 1, weight: 1
        }).addTo(layerGroup).on('click', (e) => {
            L.DomEvent.stopPropagation(e);
            activeData.set(node);
            activeModel.set(node);
        });
    });

    // Color code buildings
    layer.eachLayer(lyr => {
        const d = graphData.loc[lyr.feature.properties.id];
        if (!d) return;
        const net = d.prod - d.dem;
        const color = net >= 0 ? '#00ff88' : (net > -20 ? '#ffd700' : '#ff3e3e');
        lyr.setStyle({
            fillColor: color,
            fillOpacity: isDark ? 0.3 : 0.6,
            color: isDark ? 'white' : 'black',
            weight: 1
        });
    });
}

let pathIntervals = [];

export function path(map, graphData, L, layerGroup, entry) {
    if (!layerGroup || !entry) return;

    const pts = entry.path.map(id => {
        const n = graphData.loc[id] || graphData.mains[id];
        return [n.lat, n.lng];
    });

    const p = L.polyline(pts, {
        color: '#00ccff',
        weight: 5,
        opacity: 0.9,
        lineCap: 'round'
    }).addTo(layerGroup);

    let o = 0;
    const interval = setInterval(() => {
        o++;
        p.setStyle({ dashArray: '10,15', dashOffset: -o });
    }, 30);

    pathIntervals.push(interval);

    // Clear after some time to avoid clutter
    setTimeout(() => {
        clearInterval(interval);
        if (layerGroup.hasLayer(p)) layerGroup.removeLayer(p);
    }, 4000);
}

export function clearPaths() {
    pathIntervals.forEach(clearInterval);
    pathIntervals = [];
}

export function undo() { }
export function applyTransfer() { }
