import { get } from 'svelte/store';
import { writable } from 'svelte/store';
import { activeModel, activeData, graph } from './stores.js';
import { layer, darkMode } from './map.js';
import { CONFIGS } from './configs.js';

export const is_running = writable(false);

function distance(lat1, lng1, lat2, lng2) {
    if (!lat1 || !lng1 || !lat2 || !lng2) return 1000;
    const dx = lat1 - lat2;
    const dy = lng1 - lng2;
    return Math.sqrt(dx * dx + dy * dy) * 111;
}

/**
 * Automatically creates neighbors for loc nodes based on proximity and grid resistance.
 */
export function autoConnect(graphStore) {
    const data = get(graphStore);
    const locs = Object.values(data.loc);
    const mains = Object.values(data.mains);
    const maxN = CONFIGS["max neighbors"] || 5; // Increased default from 3

    locs.forEach(node => {
        node.neighbors = node.neighbors || [];

        // Find potential neighbors
        const candidates = [];
        mains.forEach(m => {
            candidates.push({ id: m.id, dist: distance(node.lat, node.lng, m.lat, m.lng) * (CONFIGS["main resistance"] || 0.5) });
        });
        locs.forEach(l => {
            if (l.id === node.id) return;
            candidates.push({ id: l.id, dist: distance(node.lat, node.lng, l.lat, l.lng) * (CONFIGS["location resistance"] || 1.5) });
        });

        candidates.sort((a, b) => a.dist - b.dist);

        // Always ensure at least 2 neighbors if available, even if maxN is reached by some other logic
        const targetN = Math.max(maxN, node.neighbors.length);

        for (let i = 0; i < candidates.length && node.neighbors.length < targetN; i++) {
            if (!node.neighbors.includes(candidates[i].id)) {
                node.neighbors.push(candidates[i].id);

                // Also add reciprocal connection if it's a loc
                const other = data.loc[candidates[i].id] || data.mains[candidates[i].id];
                if (other && other.neighbors && !other.neighbors.includes(node.id)) {
                    if (other.type === 'loc' && other.neighbors.length < targetN) {
                        other.neighbors.push(node.id);
                    }
                }
            }
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
    const active = get(activeData);

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
            radius: 5, color: isDark ? "white" : "black", fillColor: node.id === active?.id ? "#add8e6" : "red", fillOpacity: 1, weight: 1
        }).addTo(layerGroup).on('click', (e) => {
            L.DomEvent.stopPropagation(e);
            activeData.set(node);
            activeModel.set(node);
        });
    });

    // Draw loc nodes (like Power Stations) that are not in the GeoJSON layer
    const buildingIds = new Set();
    layer.eachLayer(l => {
        if (l.feature && l.feature.properties) buildingIds.add(l.feature.properties.id);
    });

    locs.forEach(node => {
        if (!buildingIds.has(node.id)) {
            const stationColor = node.info?.color || "#ff8800";
            L.circleMarker([node.lat, node.lng], {
                radius: 10, fillColor: stationColor, color: '#fff', weight: 2, fillOpacity: 1
            }).addTo(layerGroup).on('click', (e) => {
                L.DomEvent.stopPropagation(e);
                activeData.set(node);
                activeModel.set(node);
            });


        }
    });

    // Color code buildings
    layer.eachLayer(lyr => {
        const d = graphData.loc[lyr.feature.properties.id];
        if (!d) return;
        const net = d.prod - d.dem;
        const color = d.id === active?.id ? "#add8e6" : (net >= 0 ? '#00ff88' : (net > -20 ? '#ffd700' : '#ff3e3e'));
        const fillOpacity = d.id === active?.id ? 0.8 : (isDark ? 0.3 : 0.6);
        lyr.setStyle({
            fillColor: color,
            fillOpacity: fillOpacity,
            color: isDark ? 'white' : 'black',
            weight: d.id === active?.id ? 3 : 1
        });
    });
}

let pathIntervals = [];
export function path(map, graphData, L, layerGroup, entry) {
    if (!layerGroup || !entry) return;

    // 1. Force Integer Math (Same as Optimizer)
    const amountReceived = Math.trunc(Number(entry.received || 0));
    const amountTransfered = Math.trunc(Number(entry.transfered || 0));

    // 2. Draw the Path
    const pts = entry.path.map(id => {
        const n = graphData.loc[id] || graphData.mains[id];
        return n ? [n.lat, n.lng] : null;
    }).filter(p => p !== null);

    if (pts.length < 2) return;

    // Determine path color based on source type
    const sourceNode = graphData.loc[entry.start];
    let pathColor = sourceNode.prod > 50 ? '#ade6b1ff' : '#ff8800'; // Default renewable green
    if (entry.type === 'grid-injection' || entry.type === 'grid_injection') {
        pathColor = '#add8e6';
    } else if (sourceNode) {
        if (sourceNode.info?.renewable === false) {
            pathColor = '#ff8800'; // Non-renewable orange
        }
    }
    const border = L.polyline(pts, {
        color: '#000000',
        weight: 7,       // Thicker than the main line (6 + 4)
        opacity: 0.5,
        lineJoin: 'round' // Makes the corners look smooth
    }).addTo(layerGroup);

    const p = L.polyline(pts, {
        color: pathColor,
        weight: 5,
        opacity: 0.8,
        className: 'energy-flow-path'
    }).addTo(layerGroup);

    // 3. Update the Data and the Visuals in one sync block
    if (layer) {
        layer.eachLayer(lyr => {
            const props = lyr.feature.properties;
            if (!props) return;

            // Ensure properties are numbers before doing math
            props.prod = Math.trunc(Number(props.prod || 0));
            props.dem = Math.trunc(Number(props.dem || 0));

            // UPDATE END NODE (Receiver)
            if (props.id == entry.end) {
                props.prod += amountReceived;
                updateLayerStyle(lyr, props);
            }

            // UPDATE START NODE (Donor)
            if (props.id == entry.start) {
                // THE FIX: We subtract, but we clamp to 0 so it NEVER goes negative
                // Even if the visualization overlaps, this safety keeps it at 0
                props.prod = Math.max(0, props.prod - amountTransfered);
                updateLayerStyle(lyr, props);
            }
        });
    }

    // Cleanup line
    setTimeout(() => {
        if (layerGroup && layerGroup.hasLayer(p)) layerGroup.removeLayer(p);
        if (layerGroup && layerGroup.hasLayer(border)) layerGroup.removeLayer(border);
    }, 4000);
}

/**
 * Helper to keep styling logic consistent
 */
function updateLayerStyle(lyr, props) {
    const net = props.prod - props.dem;
    const color = net >= 0 ? '#00ff88' : (net > -20 ? '#ffd700' : '#ff3e3e');

    // Check if this node is currently the active selection to maintain highlight
    const isActive = false; // You can pull this from your Svelte store if needed

    lyr.setStyle({
        fillColor: color,
        fillOpacity: net >= 0 ? 0.7 : 0.9,
        weight: net < 0 ? 2 : 1
    });
}

export function clearPaths() {
    pathIntervals.forEach(clearInterval);
    pathIntervals = [];
}

export function undo() { }
export function applyTransfer() { }
