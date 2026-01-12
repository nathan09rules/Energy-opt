import { chunks, graph } from "./stores.js";
import { get } from "svelte/store";

const chunk = get(chunks);
const graphData = get(graph)
export function optimize(g) {
    let ledger = [] //{start , end , path , transfered , recieved}
    const sorted = Object.values(graphData.loc).sort((a, b) => a.priority - b.priority);

    let deficet = [];
    let surplus = [];

    //sort into deficet and surplus
    sorted.forEach((loc) => {
        const net = loc.prod - loc.dem;
        if (net < 0) {
            deficet.push(loc);
        } else if (net > 0) {
            surplus.push(loc);
        }
    })

    //deficet.forEach((loc) => { //ignore weights for now
    if (sorted.length === 0) return [];
    const loc = sorted[0]

    /*
    if (!loc.neighbors) return [];
    const net = loc.prod - loc.dem;
    let gains = 0;
    let path = []
    let current = Object.values(loc.neighbors).map(x => [x, 0, [loc.id]]); //0 is weighs sum and [] is path
    let next = []


    let margin = net;
    let step = 0;
    let value = [];
    while (margin < 0 || step < 1) {
        for (const n of current) {
            const near = graphData.loc[n[0]];
            if (!near) continue;

            let x = 0;
            if (near.prod - near.dem > 0) {
                x = near.prod - near.dem;
            }

            value = [near.neighbors, x + n[1], [...n[2], near.name]];

            if (value[1] >= margin) {
                ledger.push({
                    start: value[2][0],
                    end: value[2][value[2].length - 1],
                    path: value[2],
                    transfered: -margin,
                    recieved: -margin
                });

                break;
            }

            next.push(value);
        }

        current = next;
        next = [];

        step += 1;

        value = current[0]; //next.sort((a, b) => a[1] - b[1])[0];
        console.log(next);
        if (step > 1 && value && value[2]) {
            console.log((value));
            ledger.push({
                start: value[2][0],
                end: value[2][value[2].length - 1],
                path: value[2],
                transfered: -margin,
                recieved: -margin
            });
        }
    };
*/
    console.log(ledger)
    return ledger

}
