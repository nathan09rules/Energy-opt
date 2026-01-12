import { chunks } from "./stores.js";
import { graph } from "./stores.js";
import { get } from "svelte/store";

const chunk = get(chunks);

export function optimize(g) {
    const sorted = Object.values(get(graph).loc).sort((a, b) => a.priority - b.priority);

    console.log(get(chunks))
    const index = { 
        start: "1001420025", end: "1000530033", path: [
            "1001420025",
            "1",
            "2",
            "3",
            "4",
            "5",
            "6",
            "1000530028",
            "1000530033"
        ], transfered: 100, recived: 90, cost: 100
    };
    return [index]
}