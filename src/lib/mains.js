// mains.js - Functions for mains functionality

export async function loadHighwaysAndPlaceMains(map, L, graph, sublines, draw, getGraphLayer, drawMains) {
    const endpoints = [
        "https://overpass.kumi.systems/api/interpreter",
        "https://overpass-api.de/api/interpreter",
        "https://overpass.openstreetmap.ru/api/interpreter"
    ];

    const b = map.getBounds();
    const bbox = `${b.getSouth()},${b.getWest()},${b.getNorth()},${b.getEast()}`;

    // Query for highways
    const query = `[out:json][timeout:15];(way["highway"~"motorway|trunk"]({{bbox}}););out geom;`;

    for (let url of endpoints) {
        try {
            console.log(`Scanning highways via ${url}...`);
            const res = await fetch(url, { method: "POST", body: query.replace('{{bbox}}', bbox) });
            if (!res.ok) continue;

            const data = await res.json();

            if (!data.elements || data.elements.length === 0) {
                console.warn("No highways found in this view.");
                continue;
            }

            console.log(`SUCCESS: Found ${data.elements.length} highways.`);

            // Place mains at intersections and along roads
            const intersections = new Map(); // key: "lat,lng", value: count
            const mains = {};

            data.elements.forEach(way => {
                if (way.geometry) {
                    way.geometry.forEach(node => {
                        const key = `${node.lat},${node.lon}`;
                        intersections.set(key, (intersections.get(key) || 0) + 1);
                    });

                    // Place nodes along the way at intervals
                    const interval = 0.0005; // approx 500m at equator
                    let dist = 0;
                    for (let i = 1; i < way.geometry.length; i++) {
                        const prev = way.geometry[i-1];
                        const curr = way.geometry[i];
                        const segmentDist = Math.sqrt((curr.lat - prev.lat)**2 + (curr.lon - prev.lon)**2);
                        dist += segmentDist;
                        if (dist >= interval) {
                            const mainId = Object.keys(mains).length;
                            mains[mainId] = { id: mainId, lat: curr.lat, lng: curr.lon, neighbors: [], type: 'main' };
                            dist = 0;
                        }
                    }
                }
            });

            // Combine close mains
            const threshold = 0.001; // degrees
            const mainsArray = Object.values(mains);
            const toRemove = new Set();
            for (let i = 0; i < mainsArray.length; i++) {
                for (let j = i + 1; j < mainsArray.length; j++) {
                    const dist = Math.sqrt((mainsArray[i].lat - mainsArray[j].lat)**2 + (mainsArray[i].lng - mainsArray[j].lng)**2);
                    if (dist < threshold) {
                        toRemove.add(mainsArray[j].id);
                    }
                }
            }
            toRemove.forEach(id => delete mains[id]);

            // Renumber ids
            const newMains = {};
            let newId = 0;
            Object.values(mains).forEach(main => {
                newMains[newId] = { ...main, id: newId };
                newId++;
            });

            // Set neighbors based on closest proximity, avoiding loops (no common neighbors)
            Object.values(newMains).forEach(main => {
                const candidates = Object.values(newMains).filter(other => other.id !== main.id).map(other => ({
                    id: other.id,
                    dist: Math.sqrt((main.lat - other.lat)**2 + (main.lng - other.lng)**2)
                })).sort((a, b) => a.dist - b.dist);
                for (let i = 0; i < Math.min(2, candidates.length); i++) {
                    if (candidates[i].dist < 0.01) {
                        const candId = candidates[i].id;
                        // Check if already connected or would create a triangle (common neighbors)
                        const hasCommon = main.neighbors.some(nId => newMains[candId].neighbors.includes(nId));
                        if (!main.neighbors.includes(candId) && !hasCommon) {
                            main.neighbors.push(candId);
                            newMains[candId].neighbors.push(main.id);
                        }
                    } else {
                        break; // since sorted, no more close ones
                    }
                }
            });

            // Update graph with mains
            graph.update(g => ({ ...g, mains: newMains }));

            // Update sub connections
            sublines(graph);

            // Draw mains on map
            drawMains(newMains);

            console.log(`Placed ${Object.keys(mains).length} mains.`);
            return;
        } catch (e) {
            console.error(`Mirror ${url} failed.`);
        }
    }
}

export function drawMains(L, map, mains) {
    Object.values(mains).forEach(main => {
        L.circleMarker([main.lat, main.lng], {
            radius: 6, color: 'red', fillColor: 'blue', fillOpacity: 1
        }).addTo(map);
    });
}
