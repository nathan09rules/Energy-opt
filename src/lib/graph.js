import { get } from 'svelte/store';
import { writable } from 'svelte/store';
import { activeModel, activeData, graph } from './stores.js';
import { updateInspect, layer } from './map.js';
import { chunks } from './stores.js';
export const is_running = writable(false);

export function place(map, graphMain, lat, lng, neighbor) {
    const id = Object.keys(graphMain).length.toString();

    // Normalize neighbors to an array
    let neighborIds = [];
    if (Array.isArray(neighbor)) {
        neighborIds = [...neighbor];
    } else if (neighbor && typeof neighbor === 'object' && neighbor.id !== undefined) {
        neighborIds = [neighbor.id];
    } else if (neighbor !== undefined && neighbor !== null) {
        neighborIds = [neighbor];
    }

    const vert = { id, lat, lng, neighbors: neighborIds, type: 'main' };
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

        if (neighborIds.length > 0) {
            neighborIds.forEach(nId => {
                if (!exists.neighbors.includes(nId) && nId != exists.id) {
                    exists.neighbors.push(nId);
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

export function draw(map, graph, L, layerGroup) {
    if (!layerGroup) return;
    layerGroup.clearLayers();

    let tempChunk = {};
    const mains = Object.values(graph.mains);
    const loc = Object.values(graph.loc);

    // Draw mains
    mains.forEach((node) => {
        if (node.lat !== undefined && node.lng !== undefined) {
            // Draw Node
            const marker = L.circleMarker([node.lat, node.lng], {
                radius: 6,
                color: "red",
                fillColor: "blue",
                fillOpacity: 1,
            }).addTo(layerGroup);

            const latKey = Math.floor(node.lat).toString();
            const lngKey = Math.floor(node.lng).toString();

            // Ensure parent exists
            tempChunk[latKey] ??= {};
            tempChunk[latKey][lngKey] = node.id;

            marker.on('click', (e) => {
                L.DomEvent.stopPropagation(e); // Prevent map click
                if (get(is_running)) {
                    // append the neighbours of receiving (node)
                    activeData.update(current => {
                        if (!Array.isArray(current)) current = [];
                        node.neighbors.forEach(n => {
                            if (!current.includes(n)) current.push(n);
                        });
                        return current;
                    });
                } else {
                    activeModel.set(node);
                    updateInspect({ id: node.id, name: node.id, lat: node.lat, lng: node.lng });
                }
            });

            // Draw Edges
            if (Array.isArray(node.neighbors)) {
                node.neighbors.forEach(neighborId => {
                    const neighbor = graph.mains[neighborId] || graph.loc[neighborId];
                    if (neighbor) {
                        let nlat, nlng;
                        if (neighbor.lat !== undefined && neighbor.lng !== undefined) {
                            nlat = neighbor.lat;
                            nlng = neighbor.lng;
                        } else if (neighbor.pos) {
                            const ncoords = neighbor.pos.slice(1, -1).split(',').map(Number);
                            if (ncoords.length === 2 && !isNaN(ncoords[0]) && !isNaN(ncoords[1])) {
                                nlat = ncoords[1];
                                nlng = ncoords[0];
                            }
                        }
                        if (nlat !== undefined && nlng !== undefined) {
                            L.polyline(
                                [[node.lat, node.lng], [nlat, nlng]],
                                { color: "red", weight: 3 }
                            ).addTo(layerGroup);
                        }
                    }
                });
            }
        }
    });
    // Draw houses
    loc.forEach((house) => {
        if (house.pos) {
            const coords = house.pos.slice(1, -1).split(',').map(Number);
            if (coords.length === 2 && !isNaN(coords[0]) && !isNaN(coords[1])) {
                const lat = coords[1];
                const lng = coords[0];
                // Draw house marker

                const marker = L.circleMarker([lat, lng], {
                    radius: 0,
                    color: "orange",
                    fillColor: "yellow",
                    fillOpacity: 0.5,
                }).addTo(layerGroup);

                marker.on('click', (e) => {
                    L.DomEvent.stopPropagation(e);
                    activeData.set(house);
                    updateInspect(house);
                });

                // Draw house edges
                if (Array.isArray(house.neighbors)) {
                    house.neighbors.forEach(neighborId => {
                        const neighbor = graph.mains[neighborId] || graph.loc[neighborId];
                        if (neighbor) {
                            let nlat, nlng;
                            if (neighbor.lat !== undefined && neighbor.lng !== undefined) {
                                nlat = neighbor.lat;
                                nlng = neighbor.lng;
                            } else if (neighbor.pos) {
                                const ncoords = neighbor.pos.slice(1, -1).split(',').map(Number);
                                if (ncoords.length === 2 && !isNaN(ncoords[0]) && !isNaN(ncoords[1])) {
                                    nlat = ncoords[1];
                                    nlng = ncoords[0];
                                }
                            }
                            if (nlat !== undefined && nlng !== undefined) {
                                // Draw thin orange line
                                L.polyline(
                                    [[lat, lng], [nlat, nlng]],
                                    { color: "orange", weight: 2 }
                                ).addTo(layerGroup);
                            }
                        }
                    });
                }
            }
        }
    });

    // Highlight active node
    const currentActive = get(activeModel);
    if (currentActive) {
        let lat, lng;
        if (currentActive.lat !== undefined && currentActive.lng !== undefined) {
            lat = currentActive.lat;
            lng = currentActive.lng;
        } else if (currentActive.pos) {
            const coords = currentActive.pos.slice(1, -1).split(',').map(Number);
            if (coords.length === 2 && !isNaN(coords[0]) && !isNaN(coords[1])) {
                lat = coords[1];
                lng = coords[0];
            }
        }
        if (lat !== undefined && lng !== undefined) {
            L.circleMarker([lat, lng], {
                radius: 8,
                color: "yellow",
                fillColor: "green",
                fillOpacity: 0.8
            }).addTo(layerGroup);
        }
    }

    chunks.set(tempChunk);
}
export function path(map, graphData, L, LayerGroup, index) {
    if (!LayerGroup) return;

    // Clear previous path markers/polylines from this LayerGroup
    LayerGroup.clearLayers();

    const g = get(graph);

    // Update prod/dem for start and end (optional: depends if you want path to simulate transfer visually)
    graph.update(g => {
        if (g.loc[index.start]) g.loc[index.start].dem += index.transfered;
        if (g.loc[index.end]) g.loc[index.end].dem -= index.transfered;
        return g;
    });

    // Update activeData if needed
    const currentActive = get(activeData);
    if (currentActive) {
        if (currentActive.id === index.start) activeData.set(g.loc[index.start] ?? g.mains[index.start]);
        else if (currentActive.id === index.end) activeData.set(g.loc[index.end] ?? g.mains[index.end]);
    }

    // Draw **markers** for all nodes in the path
    const latlngs = [];
    index.path.forEach(nodeId => {
        const node = graphData.loc[nodeId] ?? graphData.mains[nodeId];
        if (node) {
            latlngs.push([node.lat, node.lng]);

            // marker for each node
            L.circleMarker([node.lat, node.lng], {
                radius: 4,
                color: "green",
                fillColor: "orange",
                fillOpacity: 0.8
            }).addTo(LayerGroup);
        }
    });

    // Draw one polyline along the full path
    if (latlngs.length > 1) {
        L.polyline(latlngs, { color: "green", weight: 3 }).addTo(LayerGroup);
    }

    // Optional: center map on last node
    const lastNode = graphData.loc[index.path[index.path.length - 1]] ?? graphData.mains[index.path[index.path.length - 1]];
    // map.setView([lastNode.lat, lastNode.lng], 18);
}

export function undo(entry, LayerGroup) {
    graph.update(g => {
        if (g.loc[entry.start]) g.loc[entry.start].prod += entry.transfered;
        if (g.loc[entry.end]) g.loc[entry.end].dem += entry.transfered;
        return g;
    });

    // Clear previous visualization
    if (LayerGroup) LayerGroup.clearLayers();
}

export function applyTransfer(entry, LayerGroup) {
    // Update prod and dem
    graph.update(g => {
        if (g.loc[entry.start]) g.loc[entry.start].prod -= entry.transfered;
        if (g.loc[entry.end]) g.loc[entry.end].dem -= entry.transfered;
        return g;
    });

    if (LayerGroup) LayerGroup.clearLayers();
}
