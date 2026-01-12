import { graph } from './stores.js';
import { get } from 'svelte/store';

const MAX_LOCAL_DEPTH = 5;
const MAX_MAIN_ENTRY_LAYER = 3;

// Local DFS to find surplus within neighbors
function dfsLocal(currentId, visited = new Set(), depth = 0) {
    if (depth > MAX_LOCAL_DEPTH) return null;
    visited.add(currentId);

    const node = get(graph).loc[currentId];
    if (!node) return null;

    if (node.prod > node.dem) return { path: [currentId], surplus: node };

    for (let neighborId of node.neighbors) {
        if (visited.has(neighborId)) continue;
        const res = dfsLocal(neighborId, visited, depth + 1);
        if (res) return { path: [currentId, ...res.path], surplus: res.surplus };
    }
    return null;
}

// Find nearest main node within max layers
function findNearestMain(nodeId) {
    const visited = new Set();
    const queue = [{ id: nodeId, path: [nodeId], depth: 0 }];

    while (queue.length) {
        const { id, path, depth } = queue.shift();
        if (depth > MAX_MAIN_ENTRY_LAYER) continue;
        visited.add(id);

        if (get(graph).mains[id]) return { mainNode: get(graph).mains[id], path };

        const node = get(graph).loc[id];
        if (!node) continue;

        for (let neighborId of node.neighbors) {
            if (!visited.has(neighborId)) queue.push({ id: neighborId, path: [...path, neighborId], depth: depth + 1 });
        }
    }
    return null;
}

// DFS along main chain only (non-branching)
function dfsMains(mainStartId, mainEndId) {
    const mains = get(graph).mains;
    const visited = new Set();
    const path = [];

    function dfs(currentId) {
        if (visited.has(currentId)) return false;
        visited.add(currentId);
        path.push(currentId);
        if (currentId === mainEndId) return true;

        const node = mains[currentId];
        if (!node) return false;

        // Only follow main neighbors
        for (let neighborId of node.neighbors) {
            if (dfs(neighborId)) return true;
        }
        path.pop();
        return false;
    }

    dfs(mainStartId);
    return path;
}

// Full fallback path: deficit → nearest main → main DFS → nearest main to surplus → surplus
function fallbackPathViaMains(deficitId, surplusId) {
    const deficitEntry = findNearestMain(deficitId);
    const surplusEntry = findNearestMain(surplusId);

    if (!deficitEntry || !surplusEntry) return null;

    const mainPath = dfsMains(deficitEntry.mainNode.id, surplusEntry.mainNode.id);

    if (!mainPath.length) return null;

    // Full path: deficit → deficit entry → main path → surplus entry → surplus
    const fullPath = [
        ...deficitEntry.path.reverse(), // deficit → nearest main
        ...mainPath,
        ...surplusEntry.path.slice(1),  // nearest main → surplus
        surplusId
    ];

    return fullPath;
}

// Main optimization
export function optimize() {
    const ledger = [];
    const nodes = Object.values(get(graph).loc);

    const deficits = nodes.filter(n => n.prod < n.dem)
                          .sort((a, b) => a.priority - b.priority);

    for (let deficit of deficits) {
        // Try local DFS
        const localResult = dfsLocal(deficit.id);

        let path, sourceNode;
        if (localResult) {
            path = localResult.path.reverse();
            sourceNode = localResult.surplus;
        } else {
            // fallback via mains
            const globalSurplus = nodes.filter(n => n.prod > n.dem)
                                       .sort((a, b) => (a.prod - a.dem) - (b.prod - b.dem))[0];
            if (!globalSurplus) continue;

            const fallbackPath = fallbackPathViaMains(deficit.id, globalSurplus.id);
            if (!fallbackPath) continue;

            path = fallbackPath;
            sourceNode = globalSurplus;
        }

        const transfer = Math.min(sourceNode.prod - sourceNode.dem, deficit.dem - deficit.prod);

        ledger.push({
            start: sourceNode.id,
            end: deficit.id,
            path,
            transfered: transfer,
            recieved: transfer
        });

        sourceNode.prod -= transfer;
        deficit.prod += transfer;
    }

    return ledger;
}
