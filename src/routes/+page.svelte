<script>
  import { onMount } from "svelte";
  import { initMap, toggleMode, draw, place, activeData } from "$lib/map.js";
  import "$lib/app.css";
  import "$lib/base.css";

  let map;
  let L; // Keep Leaflet reference available
  let nodes = [];
  let is_running = { mains: false };
  let interval;
  let clickHandler;

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

      //main wires
      if (is_running.mains) {
        if (map) {
          clickHandler = (e) => {
            nodes = place(map,nodes,e.latlng.lat,e.latlng.lng,nodes.length === 0 ? [] : nodes[nodes.length - 1],
            );
            draw(map, nodes);
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
      console.log(nodes);
    } else if (func === "undo") {
      nodes.pop();
      nodes = [...nodes]; // Trigger reactivity
      if (map) {
        draw(map, nodes);
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
    <h1 id="name">{$activeData?.properties?.name ?? "Click on a tiles"}</h1>
    <div id="subinspect">
      <h2 id="priority">{$activeData?.properties?.priority ?? "priority"}</h2>
      <h2 id="store">{$activeData?.properties?.store ?? "store"}</h2>
      <h2 id="prod">{$activeData?.properties?.prod ?? "production"}</h2>
      <h2 id="dem">{$activeData?.properties?.dem ?? "demand"}</h2>
    </div>
    <h2 id="pos">{$activeData?.properties?.pos ?? "position"}</h2>
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
