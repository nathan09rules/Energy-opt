<script>
  import { onMount } from "svelte";
  import { initMap, toggleMode, ManualGraph, active } from "$lib/map.js";
  import "$lib/app.css";
  import "$lib/base.css";

  let map;
  let L; // Keep Leaflet reference available
  let nodes = [];
  let is_running = { mains: false };
  let interval;

  onMount(async () => {
    try {
      // Assign to the local L so other functions can use it
      L = (await import("leaflet")).default;
      map = await initMap("map", "/Manhattan.geojson", L);
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

      if (is_running.mains) {
        if (map && L) {
          // Initialize manual drawing mode once
          ManualGraph(L, map, nodes, (updatedNodes) => {
            nodes = updatedNodes;
          });
        }
      } else {
        // Option to disable drawing could be added here
      }
    } else if (func === "print") {
      console.log(nodes);
    } else if (func === "undo") {
      nodes.pop();
      nodes = [...nodes]; // Trigger reactivity
      if (map && L) {
        ManualGraph(L, map, nodes); // This will clear and redraw based on nodes.pop()
      }
    }
  }
</script>

<div id="map"></div>

<div id="ui">
  <div id="drop">
    <button on:click={toggleMode} class="toggle" aria-label="mode">
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
    <button on:click={() => toggle("print")} class="toggle"
      ><div class="in">P</div></button
    >
  </div>

  <div id="inspect">
    <h1>{active.nodes}</h1>
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
