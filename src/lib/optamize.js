import { graph } from "./regions.js";
import { get } from "svelte/store";
import { CONFIGS } from "./configs.js";

const toInt = (v) => Math.trunc(Number(v) || 0);

export function optimize() {
    const rawData = get(graph);
    if (!rawData) return { ledger: [], data: rawData };

    const data = structuredClone(rawData);
    // Combine mains and loc for pathfinding
    const allNodes = { ...data.mains, ...data.loc };
    const ledger = [];
    const lossPerStep = parseFloat(get(CONFIGS)["transmission loss factor"]) || 0.05;

    // Surplus and Deficit func
    const getSurplus = () => Object.entries(data.loc).filter(([id, node]) => (node.prod - node.dem) > 0).map(([id]) => id);
    const getDeficit = () => Object.entries(data.loc).filter(([id, node]) => (node.dem - node.prod) > 0).map(([id]) => id);

    let surplusPool = getSurplus();
    let deficitPool = getDeficit();

    let globalIteration = 0;
    while (deficitPool.length > 0 && surplusPool.length > 0 && globalIteration < 2000) {

        // Sort deficits by priority
        deficitPool.sort((a, b) => {
            const pA = toInt(data.loc[a].priority) || 1;
            const pB = toInt(data.loc[b].priority) || 1;
            if (pB !== pA) return pB - pA;
            return (data.loc[a].dem - data.loc[a].prod) - (data.loc[b].dem - data.loc[b].prod);
        });

        const targetId = deficitPool[0];
        const targetNode = data.loc[targetId];

        // Pathfinding using allNodes
        let donorMatch = findPathThroughGrid(targetId, surplusPool, allNodes);

        if (donorMatch) {
            const sourceNode = data.loc[donorMatch.id];
            const amountGiven = Math.min(sourceNode.prod - sourceNode.dem, targetNode.dem - targetNode.prod);

            const steps = donorMatch.path.length;
            const baseLossPct = Math.min(0.95, steps * lossPerStep);
            const totalLossPct = amountGiven <= 1 ? 0 : baseLossPct;

            let received = Math.round(amountGiven * (1 - totalLossPct));
            const finalReceived = Math.max(0, received);

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
            deficitPool.shift();
        }
        globalIteration++;
    }

    console.log(`✅ Optimization Complete. Total Steps: ${ledger.length}`);
    return { ledger, data };
}

function findPathThroughGrid(targetId, surplusPool, allNodes) {
    const queue = [{ id: targetId, path: [targetId] }];
    const visited = new Set([targetId.toString()]);
    const surplusSet = new Set(surplusPool.map(s => s.toString()));

    while (queue.length > 0) {
        const { id, path } = queue.shift();

        if (surplusSet.has(id.toString()) && id.toString() !== targetId.toString()) {
            return { id: id, path: [...path].reverse() };
        }

        const node = allNodes[id];
        if (node && node.neighbors) {
            for (const nId of node.neighbors) {
                const nStr = nId.toString();
                if (!visited.has(nStr)) {
                    visited.add(nStr);
                    queue.push({ id: nId, path: [...path, nId] });
                }
            }
        }

        if (path.length > 500) continue;
    }
    return null;
}
