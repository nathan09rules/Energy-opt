import { graph } from "./stores.js";
import { get } from "svelte/store";

const MAX_DEPTH = 3;

/**
 * DFS search for surplus or main
 * @param {object} graphData - graph store
 * @param {string} startId - starting location ID (deficit)
 * @param {Set} visited - visited nodes
 * @param {number} depth - current DFS depth
 * @returns {object|null} { sourceId, path, available }
 */
function dfsFindEnergy(graphData, startId, visited = new Set(), depth = 0) {
    if (depth > MAX_DEPTH) return null;

    if (visited.has(startId)) return null;
    visited.add(startId);

    const node = graphData.loc[startId] || graphData.mains[startId];
    if (!node) return null;

    // Main = infinite source
    if (graphData.mains[startId]) {
        return { sourceId: startId, path: [startId], available: Infinity };
    }

    const surplus = node.prod - node.dem;
    if (surplus > 0) {
        return { sourceId: startId, path: [startId], available: surplus };
    }

    if (!node.neighbors) return null;

    for (const nb of node.neighbors) {
        const res = dfsFindEnergy(graphData, nb, visited, depth + 1);
        if (res) {
            return { sourceId: res.sourceId, path: [startId, ...res.path], available: res.available };
        }
    }

    return null;
}

/**
 * Optimize energy distribution
 * Returns ledger array: { start, end, path, transfered, recieved }
 */
export function optimize() {
    const g = get(graph);
    const ledger = [];

    // Step 1: sort by priority
    const sortedLocs = Object.values(g.loc).sort((a, b) => a.priority - b.priority);

    // Step 2: identify deficits
    const deficits = sortedLocs.filter(l => l.prod < l.dem);

    // Step 3-4: DFS per deficit
    for (const deficit of deficits) {
        let remaining = deficit.dem - deficit.prod;
        if (remaining <= 0) continue;

        const visited = new Set();
        const result = dfsFindEnergy(g, deficit.id, visited);

        if (!result) continue;

        const transfer = Math.min(remaining, result.available);
        const pathArr = [...result.path].reverse(); // source -> deficit

        ledger.push({
            start: result.sourceId,
            end: deficit.id,
            path: pathArr,
            transfered: transfer,
            recieved: transfer
        });
    }

    console.log(ledger)
    return ledger;
}
