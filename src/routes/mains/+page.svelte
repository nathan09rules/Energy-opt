<script>
  import { onMount } from "svelte";
  import { get } from "svelte/store";
  import { initial } from "$lib/initial.js";
  import "$lib/app.css";
  import "$lib/base.css";
  import { chunks, graph, powerSources, powerIndicators } from "$lib/stores.js";

  import {
    initMap,
    toggleMode,
    getL,
    getGraphLayer,
    getMarkerLayerGroup,
    sublines,
    updateLayerProperties,
  } from "$lib/map.js";
  import { place, draw, path, undo, applyTransfer } from "$lib/graph.js";
  import { optimize } from "$lib/optamize.js";
  import { activeModel, activeData } from "$lib/stores.js";
  import { updateInspect } from "$lib/map.js";
  import { validate } from "$lib/changes.js";
  import { loadHighwaysAndPlaceMains, drawMains } from "$lib/mains.js";

  let powerNodesLayer;

  const endpoints = [
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass-api.de/api/interpreter",
    "https://overpass.openstreetmap.ru/api/interpreter",
  ];

  function updateIndicators() {
    if (!map) return;
    const size = map.getSize();
    const center = map.latLngToContainerPoint(map.getCenter());
    const sources = get(powerSources);

    const inds = sources.map((source) => {
      const targetPoint = map.latLngToContainerPoint([source.lat, source.lng]);
      const isOffScreen =
        targetPoint.x < 0 ||
        targetPoint.x > size.x ||
        targetPoint.y < 0 ||
        targetPoint.y > size.y;

      if (!isOffScreen) return { ...source, visible: false };

      const dx = targetPoint.x - center.x;
      const dy = targetPoint.y - center.y;
      const angle = Math.atan2(dy, dx);

      const padding = 40;
      let x, y;
      const slope = dy / dx;

      if (Math.abs(slope) < size.y / size.x) {
        x = dx > 0 ? size.x - padding : padding;
        y = center.y + (x - center.x) * slope;
      } else {
        y = dy > 0 ? size.y - padding : padding;
        x = center.x + (y - center.y) / slope;
      }

      return {
        ...source,
        visible: true,
        x,
        y,
        rotation: angle * (180 / Math.PI),
      };
    });
    powerIndicators.set(inds);
  }

  let map;
  let L;
  let is_running = { mains: false };
  let clickHandler;
  let active_index = -1;
  let ledger = [];

  let g = {};

  activeData.subscribe((data) => {
    if (data) updateInspect(data);
  });

  onMount(async () => {
    try {
      await import("leaflet/dist/leaflet.css");
      map = await initMap("map", "../data.geojson");
      g = get(graph);
      L = getL();
      await loadHighwaysAndPlaceMains(
        map,
        L,
        graph,
        sublines,
        draw,
        getGraphLayer,
        drawMains,
      );
      sublines(graph);
      console.log(g.loc[27].prod, g.loc[27].dem);
      ledger = optimize() || [];
      console.log(g.loc[27].prod, g.loc[27].dem);
      powerNodesLayer = L.layerGroup().addTo(map);
      map.on("move", updateIndicators);
    } catch (err) {
      console.error("Error initializing map:", err);
    }
  });

  function handlePriorityChange(event) {
    const result = validate("priority", event.target.value, $activeData);
    if (result) {
      ledger = result.newLedger;
      active_index = -1;
    }
  }

  function handleStoreChange(event) {
    const result = validate("store", event.target.value, $activeData);
    if (result) {
      ledger = result.newLedger;
      active_index = -1;
    }
  }

  function handleProdChange(event) {
    const result = validate("prod", event.target.value, $activeData);
    if (result) {
      ledger = result.newLedger;
      active_index = -1;
    }
  }

  function handleDemChange(event) {
    const result = validate("dem", event.target.value, $activeData);
    if (result) {
      ledger = result.newLedger;
      active_index = -1;
    }
  }

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
      ledger = optimize() || [];
      draw(map, get(graph), L, getGraphLayer());
    } else if (func === "draw") {
      draw(map, get(graph), L, getGraphLayer());
    }
  }
</script>

<div id="map"></div>

{#each $powerIndicators as ind (ind.id)}
  {#if ind.visible}
    <div
      class="hud"
      style="left: {ind.x}px; top: {ind.y}px; border-color: {ind.info.color};"
    >
      <div
        class="arrow"
        style="transform: rotate({ind.rotation}deg); border-left-color: {ind
          .info.color}"
      ></div>
      <div class="sym" style="color: {ind.info.color}">{ind.info.code}</div>
    </div>
  {/if}
{/each}

<button
  id="search"
  class="search-btn"
  on:click={() =>
    loadHighwaysAndPlaceMains(
      map,
      L,
      graph,
      sublines,
      draw,
      getGraphLayer,
      drawMains,
    )}>LOAD MAINS</button
>

<div id="ui">
  <div id="drop">
    <button on:click={() => toggleMode()} class="toggle" aria-label="mode">
      <div class="in"></div>
    </button>

    <button on:click={() => toggle("Dev")} class="toggle">
      <div class="in">||</div>
    </button>
    <button
      class="toggle"
      on:click={async () => {
        if (!map || !L) return;
        const bounds = map.getBounds(); // get current viewport
        map = await initial(map, L, bounds); // pass bounds to load only current area
      }}
    >
      <div class="in">I</div>
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
    <h2 id="id">id</h2>
    <button
      id="copy"
      on:click={() =>
        navigator.clipboard.writeText(
          document.getElementById("name").textContent,
        )}
      aria-label="Copy to clipboard"
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M16 1H4C2.9 1 2 1.9 2 3V17H4V3H16V1ZM15 5H8C6.9 5 6 5.9 6 7V21C6 22.1 6.9 23 8 23H19C20.1 23 21 22.1 21 21V11C21 9.9 20.1 9 19 9H18V7C18 5.9 17.1 5 16 5ZM8 21H19V11H8V21Z"
          fill="currentColor"
        />
      </svg>
    </button>
    <div id="subinspect">
      <div>
        <h2>Priority:</h2>
        <input
          id="priority-input"
          type="number"
          min="0"
          step="any"
          on:input={handlePriorityChange}
          placeholder="priority"
        />
      </div>
      <div>
        <h2>Store:</h2>
        <input
          id="store-input"
          type="number"
          min="0"
          step="any"
          on:input={handleStoreChange}
          placeholder="store"
        />
      </div>
      <div>
        <h2>Production:</h2>
        <input
          id="prod-input"
          type="number"
          min="0"
          step="any"
          on:input={handleProdChange}
          placeholder="production"
        />
      </div>
      <div>
        <h2>Demand:</h2>
        <input
          id="dem-input"
          type="number"
          min="0"
          step="any"
          on:input={handleDemChange}
          placeholder="demand"
        />
      </div>
      <h2 id="neighbours">neighbours</h2>
    </div>

    <h2 id="pos" class="visible">position</h2>
    <h2>Step: {active_index}</h2>
  </div>

  <div id="timeline">
    <button
      on:click={() => {
        if (active_index > -1) {
          undo(ledger[active_index]);
          active_index--;
          draw(map, get(graph), L, getGraphLayer());
          if (active_index >= 0)
            path(map, get(graph), L, getGraphLayer(), ledger[active_index]);
        }
      }}
      aria-label="Previous step"
    >
      &lt
    </button>
    <button
      on:click={() => {
        for (let i = 0; i < ledger.length; i++) {
          applyTransfer(ledger[i]);
        }
        draw(map, get(graph), L, getGraphLayer());
        active_index = ledger.length - 1;
      }}
      aria-label="Final step"
    >
      FINAL
    </button>
    <button
      on:click={() => {
        if (active_index < ledger.length - 1) {
          active_index++;
          //draw(map, get(graph), L, getGraphLayer());
          path(map, get(graph), L, getGraphLayer(), ledger[active_index]);
        }
      }}
      aria-label="Next step"
    >
      >
    </button>
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
  }

  .hud {
    position: absolute;
    width: 40px;
    height: 40px;
    background: rgba(0, 0, 0, 0.8);
    border: 2px solid;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 2000;
    transform: translate(-50%, -50%);
  }
  .arrow {
    width: 0;
    height: 0;
    border-top: 6px solid transparent;
    border-bottom: 6px solid transparent;
    border-left: 10px solid;
    position: absolute;
    right: -13px;
  }
  .sym {
    font-weight: bold;
  }
</style>
