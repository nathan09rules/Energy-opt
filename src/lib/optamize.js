import { graph } from "./stores.js";
import { get } from "svelte/store";
import { CONFIGS } from "./configs.js";

/* ---------------- HELPERS ---------------- */

function distance(lat1, lng1, lat2, lng2) {
    if (!lat1 || !lng1 || !lat2 || !lng2) return 1000;
    const dx = lat1 - lat2;
    const dy = lng1 - lng2;
    return Math.sqrt(dx * dx + dy * dy) * 111; // km approx
}

function getSurplus(node) {
    if (!node) return 0;
    return (node.prod || 0) + (node.store || 0) - (node.dem || 0);
}

function findNearestMain(startId, data) {
    const visited = new Set([startId]);
    const queue = [{ id: startId, path: [] }];

    while (queue.length) {
        const { id, path } = queue.shift();
        if (path.length > 10) continue;
        if (data.mains[id]) return id;

        const node = data.loc[id] || data.mains[id];
        if (!node || !node.neighbors) continue;

        for (const n of node.neighbors) {
            if (!visited.has(n)) {
                visited.add(n);
                queue.push({ id: n, path: [...path, n] });
            }
        }
    }
    return null;
}

// 3-Step BFS for local donor
function findLocalDonor(targetId, data) {
    const queue = [{ id: targetId, path: [targetId], steps: 0 }];
    const visited = new Set([targetId]);

    while (queue.length > 0) {
        const { id, path, steps } = queue.shift();

        if (steps > 0) {
            const node = data.loc[id];
            if (node && getSurplus(node) > 2) {
                return { id, path: [...path].reverse(), surplus: getSurplus(node) };
            }
        }

        if (steps < 3) {
            const node = data.loc[id] || data.mains[id];
            if (node && node.neighbors) {
                for (const nId of node.neighbors) {
                    if (!visited.has(nId)) {
                        visited.add(nId);
                        queue.push({ id: nId, path: [...path, nId], steps: steps + 1 });
                    }
                }
            }
        }
    }
    return null;
}

// Grid-based search for Power Stations via Mains
function findGridDonor(targetId, data) {
    const startMainId = findNearestMain(targetId, data);
    if (!startMainId) return null;

    const queue = [{ id: startMainId, path: [targetId, startMainId] }];
    const visited = new Set([startMainId]);

    while (queue.length > 0) {
        const { id, path } = queue.shift();
        if (path.length > 50) continue;

        const mainNode = data.mains[id];
        if (mainNode && mainNode.neighbors) {
            for (const nId of mainNode.neighbors) {
                const locNode = data.loc[nId];
                // Major power station check (surplus > 100)
                if (locNode && getSurplus(locNode) > 100) {
                    return { id: nId, path: [...path, nId].reverse(), surplus: getSurplus(locNode) };
                }
            }
        }

        if (mainNode && mainNode.neighbors) {
            for (const nId of mainNode.neighbors) {
                if (data.mains[nId] && !visited.has(nId)) {
                    visited.add(nId);
                    queue.push({ id: nId, path: [...path, nId] });
                }
            }
        }
    }
    return null;
}

/* ---------------- OPTIMIZER ---------------- */

export function optimize() {
    const data = structuredClone(get(graph));
    const ledger = [];
    const ids = Object.keys(data.loc);

    // Initial Local Store Use
    ids.forEach(id => {
        const node = data.loc[id];
        const deficit = node.dem - node.prod;
        if (deficit > 0 && node.store > 0) {
            const contribution = Math.min(node.store, deficit);
            node.prod += contribution;
            node.store -= contribution;
        }
    });

    let iteration = 0;
    const MAX_STEPS = 98; // Minimized steps to below 100

    while (iteration < MAX_STEPS) {
        // Find biggest deficit (RED nodes)
        const deficits = ids
            .filter(id => (data.loc[id].dem - data.loc[id].prod) > 0.5)
            .sort((a, b) => (data.loc[b].dem - data.loc[b].prod) - (data.loc[a].dem - data.loc[a].prod));

        if (deficits.length === 0) break;

        const targetId = deficits[0];
        const targetNode = data.loc[targetId];
        const initialDeficit = targetNode.dem - targetNode.prod;

        // OG Strategy: 3-step BFS houses first, then grid for stations
        let donor = findLocalDonor(targetId, data);
        if (!donor) {
            donor = findGridDonor(targetId, data);
        }

        if (donor) {
            const srcNode = data.loc[donor.id];

            // TAKE ALL SURPLUS (as requested)
            const amountToTake = donor.surplus;

            // Calculate a simple loss based on path length
            const cost = donor.path.length;
            const lossFactor = Math.min(0.8, cost * (CONFIGS["transmission loss factor"] || 0.02));
            const delivered = amountToTake * (1 - lossFactor);

            if (delivered > 0.1) {
                ledger.push({
                    start: donor.id,
                    end: targetId,
                    path: donor.path,
                    transfered: Number(amountToTake.toFixed(2)),
                    recieved: Number(delivered.toFixed(2)),
                    type: 'redistribution'
                });

                // Update donor: DRAIN COMPLETELY
                let fromStore = Math.min(srcNode.store || 0, amountToTake);
                srcNode.store = Number((srcNode.store - fromStore).toFixed(2));
                let remaining = amountToTake - fromStore;
                srcNode.prod = Number((srcNode.prod - remaining).toFixed(2));

                // Update target: REFILL
                targetNode.prod = Number((targetNode.prod + delivered).toFixed(2));

                iteration++;
            } else {
                // If path is too long/lossy, we might need a better donor or skip
                break;
            }
        } else {
            // No donors available for this red node
            break;
        }
    }

    if (iteration >= MAX_STEPS) {
        console.warn("OPTIMIZATION: MAX STEPS REACHED (" + iteration + ")");
    } else {
        console.warn("OPTIMIZATION: GRID STABILIZED AT STEP " + iteration);
    }

    return { ledger, data };
}
