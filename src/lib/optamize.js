import { graph } from "./stores.js";
import { get } from "svelte/store";

const MAX_LOCAL_DEPTH = 5;
const MAX_MAIN_ENTRY_LAYER = 5;

/* ---------------- HELPERS ---------------- */

function bfsLocal(startId, data) {
    const visited = new Set([startId]);
    const queue = [{ id: startId, path: [startId] }];

    while (queue.length) {
        const { id, path } = queue.shift();
        if (path.length > MAX_LOCAL_DEPTH) continue;

        const node = data.loc[id];
        if (!node) continue;

        if (id !== startId && node.prod > node.dem) {
            return { sourceId: id, path };
        }

        for (const n of node.neighbors || []) {
            if (!visited.has(n)) {
                visited.add(n);
                queue.push({ id: n, path: [...path, n] });
            }
        }
    }
    return null;
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

    function dfs(id) {
        if (visited.has(id)) return false;
        visited.add(id);
        path.push(id);

        if (id === end) return true;

        for (const n of data.mains[id]?.neighbors || []) {
            if (data.mains[n] && dfs(n)) return true;
        }

        path.pop();
        return false;
    }

    dfs(start);
    return path;
}

/* ---------------- OPTIMIZER ---------------- */

export function optimize() {
    // 🔒 CLONE — makes function PURE
    const data = structuredClone(get(graph));

    const ledger = [];
    const ids = Object.keys(data.loc);

    const deficits = ids
        .filter(id => data.loc[id].dem > data.loc[id].prod)
        .sort((a, b) => data.loc[a].priority - data.loc[b].priority);

    for (const deficitId of deficits) {
        const deficit = data.loc[deficitId];

        if (deficit.dem <= deficit.prod) continue; // 🔑 FIX

        let path = null;
        let sourceId = null;

        // 1️⃣ Local search
        const local = bfsLocal(deficitId, data);
        if (local) {
            sourceId = local.sourceId;
            path = local.path;
        }
        // 2️⃣ Global fallback
        else {
            const bestSource = ids
                .filter(id => id !== deficitId && data.loc[id].prod > data.loc[id].dem)
                .sort(
                    (a, b) =>
                        (data.loc[b].prod - data.loc[b].dem) -
                        (data.loc[a].prod - data.loc[a].dem)
                )[0];

            if (!bestSource) continue;

            const defMain = findNearestMain(deficitId, data);
            const srcMain = findNearestMain(bestSource, data);

            if (defMain && srcMain) {
                const mainPath = dfsMains(defMain.mainId, srcMain.mainId, data);
                if (mainPath.length) {
                    sourceId = bestSource;
                    path = [
                        ...defMain.path,
                        ...mainPath.slice(1),
                        ...srcMain.path.slice(1).reverse()
                    ];
                }
            }
        }

        // 3️⃣ Transfer (pure math)
        if (sourceId && path) {
            const source = data.loc[sourceId];

            const available = source.prod - source.dem;
            const needed = deficit.dem - deficit.prod;

            if (available > 0 && needed > 0) {
                const amount = Math.min(available, needed);

                ledger.push({
                    start: sourceId,
                    end: deficitId,
                    path: [...path].reverse(),
                    transfered: amount,
                    recieved: amount
                });

                // mutate ONLY the local clone
                source.prod -= amount;
                deficit.prod += amount;
            }
        }
    }

    return ledger;
}
