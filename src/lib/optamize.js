import { graph } from "./stores.js";
import { get } from "svelte/store";
import { CONFIGS } from "./configs.js";

const MAX_LOCAL_DEPTH = 10;
const MAX_MAIN_ENTRY_LAYER = 12;

/* ---------------- HELPERS ---------------- */

function distance(lat1, lng1, lat2, lng2) {
    if (!lat1 || !lng1 || !lat2 || !lng2) return 1000;
    const dx = lat1 - lat2;
    const dy = lng1 - lng2;
    // Euclidean distance for simplicity, scaled to km-ish
    return Math.sqrt(dx * dx + dy * dy) * 111;
}

function bfsWeighted(startId, data) {
    const visited = new Map();
    const queue = [{ id: startId, path: [startId], cost: 0 }];
    visited.set(startId, 0);

    let bestSource = null;

    while (queue.length) {
        queue.sort((a, b) => a.cost - b.cost);
        const { id, path, cost } = queue.shift();

        if (path.length > MAX_LOCAL_DEPTH) continue;

        const node = data.loc[id] || data.mains[id];
        if (!node) continue;

        // Found a potential donor
        if (id !== startId && node.type === 'loc' && (node.prod + (node.store || 0)) > node.dem) {
            const surplus = (node.prod + (node.store || 0)) - node.dem;
            // Weigh surplus and priority against distance
            const score = (surplus * 10) / (cost + 0.1);
            if (!bestSource || score > bestSource.score) {
                bestSource = { sourceId: id, path, score, cost };
            }
        }

        for (const nId of node.neighbors || []) {
            const neighbor = data.loc[nId] || data.mains[nId];
            if (!neighbor) continue;

            const edgeCost = distance(node.lat, node.lng, neighbor.lat, neighbor.lng) *
                (node.type === 'main' && neighbor.type === 'main' ? CONFIGS["main resistance"] : CONFIGS["location resistance"]);
            const totalCost = cost + edgeCost;

            if (!visited.has(nId) || visited.get(nId) > totalCost) {
                visited.set(nId, totalCost);
                queue.push({ id: nId, path: [...path, nId], cost: totalCost });
            }
        }
    }
    return bestSource;
}

function findNearestMain(startId, data) {
    const visited = new Set([startId]);
    const queue = [{ id: startId, path: [startId] }];

    while (queue.length) {
        const { id, path } = queue.shift();
        if (path.length > MAX_MAIN_ENTRY_LAYER) continue;
        if (data.mains[id]) return { mainId: id, path };

        const node = data.loc[id];
        if (!node) continue;

        for (const n of node.neighbors || []) {
            if (!visited.has(n)) {
                visited.add(n);
                queue.push({ id: n, path: [...path, n] });
            }
        }
    }
    return null;
}

function dfsMains(start, end, data) {
    const visited = new Set();
    const path = [];
    const solve = (id) => {
        if (visited.has(id)) return false;
        visited.add(id);
        path.push(id);
        if (id === end) return true;
        for (const n of data.mains[id]?.neighbors || []) {
            if (data.mains[n] && solve(n)) return true;
        }
        path.pop();
        return false;
    };
    solve(start);
    return path;
}

/* ---------------- OPTIMIZER ---------------- */

export function optimize() {
    const data = structuredClone(get(graph));
    const ledger = [];
    const ids = Object.keys(data.loc);

    // Initial: First use local storage to satisfy immediate demand
    ids.forEach(id => {
        const node = data.loc[id];
        if (node.store > 0 && node.dem > node.prod) {
            const needed = node.dem - node.prod;
            const contribution = Math.min(node.store, needed);
            node.prod += contribution;
            node.store -= contribution;
        }
    });

    // 1. Prioritized Deficit Resolution
    const deficits = ids
        .filter(id => data.loc[id].dem > data.loc[id].prod)
        .sort((a, b) => (data.loc[a].priority || 5) - (data.loc[b].priority || 5));

    deficits.forEach(defId => {
        const deficit = data.loc[defId];
        let attempts = 0;

        while (deficit.dem > deficit.prod && attempts < 3) {
            attempts++;
            const localResult = bfsWeighted(defId, data);

            let sourceId, bestPath, cost;
            if (localResult) {
                ({ sourceId, path: bestPath, cost } = localResult);
            } else {
                // Global fallback via main grid
                const bestGlobId = ids
                    .filter(id => id !== defId && data.loc[id].prod > data.loc[id].dem)
                    .sort((a, b) => (data.loc[b].prod - data.loc[b].dem) - (data.loc[a].prod - data.loc[a].dem))[0];

                if (!bestGlobId) break;

                const dM = findNearestMain(defId, data);
                const sM = findNearestMain(bestGlobId, data);

                if (dM && sM) {
                    const mP = dfsMains(dM.mainId, sM.mainId, data);
                    if (mP.length) {
                        sourceId = bestGlobId;
                        bestPath = [...dM.path, ...mP.slice(1), ...sM.path.slice(1).reverse()];
                        cost = (dM.path.length + mP.length + sM.path.length) * 0.5; // Estimated cost
                    }
                }
            }

            if (sourceId && bestPath) {
                const src = data.loc[sourceId];
                const available = src.prod - src.dem;
                if (available <= 0) break;

                const amount = Math.min(available, deficit.dem - deficit.prod);
                const loss = amount * (cost * (CONFIGS["transmission loss factor"] || 0.02));
                const delivered = amount - loss;

                ledger.push({
                    start: sourceId,
                    end: defId,
                    path: [...bestPath].reverse(),
                    transfered: amount,
                    recieved: delivered,
                    loss: loss,
                    type: 'redistribution'
                });

                src.prod -= amount;
                deficit.prod += delivered;
            } else break;
        }
    });

    // 2. Predictive Storage Step
    // Move surplus energy into storage locally, or move it to high-priority nodes with space
    ids.forEach(id => {
        const node = data.loc[id];
        if (node.prod > node.dem) {
            const surplus = node.prod - node.dem;
            const space = 1000 - (node.store || 0);
            const toStore = Math.min(surplus, space);
            node.store = (node.store || 0) + (toStore * (CONFIGS["storage efficiency"] || 0.9));
            node.prod -= toStore;
        }
    });

    return ledger;
}

/**
 * Minimizes energy loss in the grid by rebalancing storage.
 * This runs after the main optimization to prepare for the next cycle.
 */
export function minimizeLoss(graphStore) {
    const data = structuredClone(get(graphStore));
    const ids = Object.keys(data.loc);
    const transfers = [];

    // Identify nodes with high storage and nodes with high likely future demand
    const saturatedNodes = ids.filter(id => (data.loc[id].store || 0) > 800);
    const needyNodes = ids.filter(id => data.loc[id].dem > data.loc[id].prod * 1.5);

    saturatedNodes.forEach(srcId => {
        needyNodes.forEach(destId => {
            const src = data.loc[srcId];
            const dest = data.loc[destId];
            const dist = distance(src.lat, src.lng, dest.lat, dest.lng);

            if (dist < 5 && dest.store < 500) {
                const amount = 100; // Transfer 100 units to prep storage
                src.store -= amount;
                dest.store += amount * (CONFIGS["storage efficiency"] || 0.9);
                transfers.push({ from: srcId, to: destId, amount });
            }
        });
    });

    return transfers;
}
