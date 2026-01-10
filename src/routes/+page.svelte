<script>
  import { onMount } from "svelte";
  import "$lib/app.css";
  import "$lib/base.css";

  let map;
  let L; // Keep Leaflet reference available
  let graph = { main: {} };
  let is_running = { mains: false };
  let interval;
  let clickHandler;
  let location = []
  
  let toggleMode;
  let draw;
  let place;

  onMount(async () => {
    try {
      // Lazy import to avoid SSR issues
      const module = await import("$lib/map.js");
      const { initMap, activeData } = module;
      toggleMode = module.toggleMode;
      draw = module.draw;
      place = module.place;
      
      // Assign to the local L so other functions can use it
      await import("leaflet/dist/leaflet.css");
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
            graph.main = place(map,graph.main,e.latlng.lat,e.latlng.lng,Object.keys(graph.main).length === 0 ? [] : Object.values(graph.main)[Object.keys(graph.main).length - 1],
            );
            draw(map, graph.main);
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
      console.log(graph.main);
    } else if (func === "undo") {
      const ids = Object.keys(graph.main).map(Number).sort((a, b) => b - a);
      if (ids.length > 0) {
        delete graph.main[ids[0]];
        graph = { ...graph }; // Trigger reactivity
        if (map) {
          draw(map, graph.main);
        }
      }
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
    <button on:click={() => toggle("print")} class="toggle"
      ><div class="in">P</div></button
    >
  </div>

  <div id="inspect">
    <h1 id="name">{"Click on a tiles"}</h1>
    <div id="subinspect">
    <h2 id="priority">priority</h2>
    <h2 id="store">store</h2>
    <h2 id="prod">production</h2>
    <h2 id="dem">demand</h2>
  </div>

  <h2 id="pos">position</h2>
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
