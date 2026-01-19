import { graph } from "./stores.js";
import { get } from "svelte/store";
import { CONFIGS } from "./configs.js";

const toInt = (v) => Math.trunc(Number(v) || 0);

export function optimize() {
    const rawData = get(graph);
    if (!rawData || !rawData.loc) return { ledger: [], data: rawData };

    const data = structuredClone(rawData);
    const ledger = [];
    const lossPerStep = parseFloat(CONFIGS["transmission loss factor"]) || 0.05;

    // Surplus and Deficit func
    const getSurplus = () => Object.keys(data.loc).filter(id => (data.loc[id].prod - data.loc[id].dem) > 0);
    const getDeficit = () => Object.keys(data.loc).filter(id => (data.loc[id].dem - data.loc[id].prod) > 0);

    let surplusPool = getSurplus();
    let deficitPool = getDeficit();

    let globalIteration = 0;
    while (deficitPool.length > 0 && surplusPool.length > 0 && globalIteration < 1500) {

        // Sort deficits by priority, then by deficit size ascending (small deficits first)
        deficitPool.sort((a, b) => {
            const pA = toInt(data.loc[a].priority) || 1;
            const pB = toInt(data.loc[b].priority) || 1;
            if (pB !== pA) return pB - pA;
            return (data.loc[a].dem - data.loc[a].prod) - (data.loc[b].dem - data.loc[b].prod);
        });

        const targetId = deficitPool[0];
        const targetNode = data.loc[targetId];

        // STRICT GRID BFS: No teleportation, uses data.mains as bridges
        let donorMatch = findPathThroughGrid(targetId, surplusPool, data);

        if (donorMatch) {
            const sourceNode = data.loc[donorMatch.id];
            const amountGiven = Math.min(sourceNode.prod - sourceNode.dem, targetNode.dem - targetNode.prod);

            // Loss based on actual wire steps found in BFS
            const steps = donorMatch.path.length;
            const baseLossPct = Math.min(0.95, steps * lossPerStep);
            // No loss for small transfers to allow filling small deficits
            const totalLossPct = amountGiven <= 1 ? 0 : baseLossPct;

            // Calculate received (rounding to nearest to avoid small deficits)
            let received = Math.round(amountGiven * (1 - totalLossPct));
            const finalReceived = Math.max(0, received);

            // Update state
            sourceNode.prod -= amountGiven;
            targetNode.prod += finalReceived;

            ledger.push({
                start: donorMatch.id,
                end: targetId,
                path: donorMatch.path,
                transfered: amountGiven,
                received: finalReceived,
                type: 'grid_transfer',
                steps: steps
            });

            surplusPool = getSurplus();
            deficitPool = getDeficit();
        } else {
            // Target cannot reach any surplus node through the current wire config
            deficitPool.shift();
        }
        globalIteration++;
    }

    console.log(`✅ Grid Optimization Complete. Remaining Surplus: ${getSurplus().length}`);
    return { ledger, data };
}

/**
 * A deep BFS that searches neighbors in both data.loc AND data.mains.
 * This forces the path to follow the physical "neighbors" array.
 */
function findPathThroughGrid(targetId, surplusPool, data) {
    const queue = [{ id: targetId, path: [targetId] }];
    const visited = new Set([targetId.toString()]);
    const poolSet = new Set(surplusPool.map(s => s.toString()));

    while (queue.length > 0) {
        const { id, path } = queue.shift();
        const sId = id.toString();

        // 1. Success: Current ID is in the surplus pool
        if (poolSet.has(sId) && sId !== targetId.toString()) {
            return { id: sId, path: [...path].reverse() };
        }

        // 2. Identify neighbors: check loc if ID > 25, else check mains
        const nodeObj = (toInt(id) < 26) ? data.mains[id] : data.loc[id];

        if (nodeObj && nodeObj.neighbors) {
            for (const nId of nodeObj.neighbors) {
                const nStr = nId.toString();
                if (!visited.has(nStr)) {
                    visited.add(nStr);
                    queue.push({ id: nId, path: [...path, nId] });
                }
            }
        }

        // Safety break for disconnected components
        if (path.length > 200) continue;
    }
    return null;
}
