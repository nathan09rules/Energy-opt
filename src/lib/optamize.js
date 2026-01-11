import { get } from 'svelte/store';
import { graph } from './stores.js';

let graphData = get(graph);
const mains = graphData.mains;
let loc = graphData.loc;
let chunks = {};
let mains_pos = [];
export function optimize() {
    for (let loc of graphData.loc) {
        chunks[Math.floor(loc.lat / 10)] ??= {};
        chunks[Math.floor(loc.lat / 10)][Math.floor(loc.lng / 10)] ??= [];
        chunks[Math.floor(loc.lat / 10)][Math.floor(loc.lng / 10)].push(loc);
    }

    for (let main of mains) {
        const pos = [Math.floor(main.lat / 10), Math.floor(main.lng / 10)];
        mains_pos.push(pos, main.id);
    }

    for (let house of graphData.loc) {
        let closest = 100000000;
        let closestMain = null;
        for (let main of mains_pos) {
            const dist = distance(house.lat - main[0], house.lng - main[1]);
            if (dist < closest) {
                closest = dist;
                closestMain = main;
            }
        }

        let loc_closest = 100000000;
        let closestLoc = null;
        for (let other of chunks[Math.floor(house.lat / 10)][Math.floor(house.lng / 10)]) {
            if (other.id !== house.id) {
                const dist = distance(house.lat - other.lat, house.lng - other.lng);
                if (dist < loc_closest) {
                    loc_closest = dist;
                    closestLoc = other;
                }
            }
        }

        if (!house.neighbors) house.neighbors = [];
        if ((closest * 1.2) < loc_closest) {
            // export this closest main as neighbour
            if (closestMain && !house.neighbors.includes(closestMain.id)) {
                house.neighbors.push(closestMain.id);
            }
        } else {
            // export this closest loc as neighbour
            if (closestLoc && !house.neighbors.includes(closestLoc.id)) {
                house.neighbors.push(closestLoc.id);
            }
        }
    }

    // Update the store
    graph.update(g => ({ ...g, loc: graphData.loc }));
}


function distance(x, y) {
    return Math.sqrt(x * x + y * y);
}
