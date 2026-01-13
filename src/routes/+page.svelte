<script>
  import { onMount } from "svelte";
  import { get } from "svelte/store";
  import "$lib/app.css";
  import "$lib/base.css";

  import { chunks } from "$lib/stores.js";

  import {
    initMap,
    toggleMode,
    getL,
    sublines,
  } from "$lib/map.js";
  import { place, draw, path, undo, applyTransfer } from "$lib/graph.js";
  import { optimize } from "$lib/optamize.js";
  //import { addMarker } from "$lib/markers.js";
  import { graph, activeModel, activeData } from "$lib/stores.js";
  import { updateInspect } from "$lib/map.js";

  let map;
  let L;
  let is_running = { mains: false };
  let clickHandler;
  let active_index = -1;
  let ledger = [];

  activeData.subscribe((data) => {
    if (data) updateInspect(data);
  });

  onMount(async () => {
    try {
      await import("leaflet/dist/leaflet.css");
      map = await initMap("map", "/data.geojson");
      L = getL();
      draw(map, get(graph), L, getGraphLayer());

      ledger = optimize(graph) || [];
    } catch (err) {
      console.error("Error initializing map:", err);
    }
  });

  function toggle(func) {
    if (func === "Dev") {
      const devEl = document.getElementById("dev");
      devEl.classList.toggle("hidden");
      devEl.classList.toggle("visible");
    } else if (func === "mains") {
      is_running.mains = !is_running.mains;

      //main wires
      if (is_running.mains) {
        if (map) {
          clickHandler = (e) => {
            // Get current active node to connect FROM
            const currentActive = get(activeModel);

            // Should valid 'main' node be neighbor?
            let neighbor = null;
            if (currentActive && currentActive.id !== undefined) {
              neighbor = currentActive;
            } else {
              // Fallback to last node if nothing selected (optional, or force user to select)
              const g = get(graph);
              const keys = Object.keys(g.mains);
              if (keys.length > 0) {
                neighbor = g.mains[keys[keys.length - 1]];
              }
            }

            graph.update((g) => {
              g.mains = place(
                map,
                g.mains,
                e.latlng.lat,
                e.latlng.lng,
                neighbor,
              );
              // Draw triggers redraw
              return g;
            });
          };
          map.on("click", clickHandler);
        }
      } else {
        if (map && clickHandler) {
          map.off("click", clickHandler);
          clickHandler = null;
        }
      }
    } else if (func === "print") {
      console.log(get(graph));
      //console.log(JSON.stringify(get(chunk), null, 2));
    } else if (func === "undo") {
      graph.update((g) => {
        const ids = Object.keys(g.mains)
          .map(Number)
          .sort((a, b) => b - a);
        if (ids.length > 0) {
          delete g.mains[ids[0]];
          // Redraw
          if (map) draw(map, g, L, getGraphLayer());
        }
        return g;
      });
    } else if (func === "optimize") {
      optimize(graph);
      draw(map, get(graph), L, getGraphLayer());
    } else if (func === "draw") {
      draw(map, get(graph), L, getGraphLayer());
    }
  }
</script>

<div id="map"></div>

<div id="ui">
  <div id="drop">
    <button on:click={() => toggleMode()} class="toggle" aria-label="mode">
      <div class="in"></div>
    </button>
    <button on:click={() => toggle("Dev")} class="toggle">
      <div class="in">||</div>
    </button>
  </div>

  <div id="dev" class="hidden">
    <button
      on:click={() => toggle("mains")}
      class="toggle"
      class:active={is_running.mains}
    >
      <div class="in">{is_running.mains ? "O" : "C"}</div>
    </button>
    <button on:click={() => toggle("undo")} class="toggle"
      ><div class="in">Z</div></button
    >
    <button on:click={() => toggle("optimize")} class="toggle"
      ><div class="in">O</div></button
    >
    <button on:click={() => toggle("print")} class="toggle"
      ><div class="in">P</div></button
    >
    <button on:click={() => toggle("draw")} class="toggle"
      ><div class="in">D</div></button
    >
  </div>

  <div id="inspect">
    <h1 id="name">{"Click on a tiles"}</h1>
    <button
      id="copy"
      on:click={() =>
        navigator.clipboard.writeText(
          document.getElementById("name").textContent,
        )}>COPY</button
    >
    <div id="subinspect">
      <h2 id="priority">priority</h2>
      <h2 id="store">store</h2>
      <h2 id="prod">production</h2>
      <h2 id="dem">demand</h2>
    </div>

    <h2 id="pos" class="visible">position</h2>
    <h2>{active_index}</h2>
  </div>

  <div id="timeline">
    <button
      on:click={() => {
        if (active_index > -1) {
          undo(ledger[active_index]);
          active_index--;
          draw(map, get(graph), L, getGraphLayer());
          if (active_index >= 0) path(map, get(graph), L, getGraphLayer(), ledger[active_index]);
        }
      }}>BACK</button
    >
    <button
      on:click={() => {
        for (let i = 0; i < ledger.length; i++) {
          applyTransfer(ledger[i]);
        }
        draw(map, get(graph), L, getGraphLayer());
        active_index = ledger.length - 1;
      }}>FINAL</button
    >
    <button
      on:click={() => {
        if (active_index < ledger.length - 1) {
          active_index++;
          console.log(ledger);
          //draw(map, get(graph), L, getGraphLayer());
          path(map, get(graph), L, getGraphLayer(), ledger[active_index]);
        }
      }}>FORWARD</button
    >
  </div>
</div>

<style>
  .hidden {
    display: none;
  }
  .visible {
    display: block;
  }
  .active {
    background-color: #ff3e00;
  } /* Visual feedback for active state */
</style>
