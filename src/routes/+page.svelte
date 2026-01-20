<script>
  import { onMount } from "svelte";
  import { get } from "svelte/store";
  import "$lib/app.css";
  import "$lib/base.css";
  import {
    graph,
    powerSources,
    powerIndicators,
    initialPowerSources,
    activeData,
    activeModel,
  } from "$lib/stores.js";
  import { CONFIGS } from "$lib/configs.js";

  import {
    initMap,
    toggleMode,
    getL,
    getGraphLayer,
    syncPowerSources,
    darkMode,
  } from "$lib/map.js";
  import { place, draw, path, autoConnect } from "$lib/graph.js";
  import { optimize } from "$lib/optamize.js";

  const typeMap = {
    solar: { code: "S", color: "#FFD700", renewable: true },
    wind: { code: "W", color: "#00BFFF", renewable: true },
    hydro: { code: "H", color: "#4169E1", renewable: true },
    nuclear: { code: "N", color: "#ADFF2F", renewable: true },
    biomass: { code: "B", color: "#32CD32", renewable: true },
    geothermal: { code: "G", color: "#F4A460", renewable: true },
    coal: { code: "C", color: "#8B4513", renewable: false },
    gas: { code: "G", color: "#FFA500", renewable: false },
    oil: { code: "O", color: "#FF4500", renewable: false },
  };

  // Reactive statement to redraw when graph or activeData changes
  $: if (($graph || $activeData) && map && L)
    draw(map, get(graph), L, getGraphLayer());

  let map, L;
  let isDashboardOpen = false;
  let showAdvanced = false;
  let isScanning = false;
  let PlayedAll = false;
  let ledger = [];
  let activeIndex = -1;

  // SYSTEM MODES
  // Standard: Basic view and optimization
  // Edit: Add nodes, change connections
  // Predict: Future usage analysis
  let currentMode = "standard";

  let optimizedData = null;

  async function reoptimize() {
    autoConnect(graph);
    const result = optimize();
    ledger = result.ledger || [];
    optimizedData = result.data;

    console.log("Optimization Result:", result);
  }

  async function loadPowerData() {
    isScanning = true;
    const b = map.getBounds();
    const bbox = `${b.getSouth()},${b.getWest()},${b.getNorth()},${b.getEast()}`;
    // Using multiple endpoints for reliability
    const endpoints = [
      "https://overpass-api.de/api/interpreter",
      "https://overpass.kumi.systems/api/interpreter",
    ];

    const query = `[out:json][timeout:25];(node["power"~"generator|plant"](${bbox});way["power"~"generator|plant"](${bbox}););out center;`;

    for (let url of endpoints) {
      try {
        const res = await fetch(url, { method: "POST", body: query });
        if (!res.ok) continue;
        const data = await res.json();
        const newSources = data.elements.map((el) => {
          const tags = el.tags || {};
          const rawType = (
            tags["generator:source"] ||
            tags["fuel"] ||
            tags["power:source"] ||
            ""
          ).toLowerCase();
          const info = typeMap[rawType] || {
            code: tags.name ? tags.name.charAt(0).toUpperCase() : "P",
            color: "#FF8800", // Default to non-renewable orange
            renewable: false,
          };

          return {
            id: el.id,
            lat: el.lat || el.center.lat,
            lng: el.lon || el.center.lon,
            info,
            name: tags.name || "Station",
          };
        });
        powerSources.set(newSources);
        console.log("Fetched Stations:", get(powerSources));
        syncPowerSources();
        reoptimize();
        isScanning = false;
        return;
      } catch (e) {
        console.error(`Failed to fetch from ${url}:`, e);
      }
    }
    isScanning = false;
  }

  onMount(async () => {
    try {
      await import("leaflet/dist/leaflet.css");
      map = await initMap("map", "../data.geojson");
      L = getL();
      powerSources.set(initialPowerSources);
      console.log("Initial Stations:", get(powerSources));
      syncPowerSources();
      reoptimize();

      map.on("moveend", () => {
        // Optional: Auto fetch on move?
      });
      map.on("move", updateIndicators);
    } catch (e) {
      console.error("Initialization error:", e);
    }
  });

  function switchMode(m) {
    currentMode = m;
    is_running.mains = m === "edit";
    reoptimize();
  }

  function handleDashReturn() {
    isDashboardOpen = false;
    reoptimize();
  }

  let is_running = { mains: false };
  let clickHandler;

  function toggleMains() {
    is_running.mains = !is_running.mains;
    if (is_running.mains) {
      clickHandler = (e) => {
        const currentActive = get(activeModel);
        graph.update((g) => {
          g.mains = place(
            map,
            g.mains,
            e.latlng.lat,
            e.latlng.lng,
            currentActive,
          );
          return g;
        });
        draw(map, get(graph), L, getGraphLayer());
      };
      map.on("click", clickHandler);
    } else {
      if (clickHandler) map.off("click", clickHandler);
    }
  }

  let indicators = [];

  function updateIndicators() {
    if (!map) return;
    const size = map.getSize();
    const center = map.latLngToContainerPoint(map.getCenter());
    const sources = get(powerSources);

    indicators = sources.map((source) => {
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

      const padding = 60;
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
  }

  // Reactive station indicators
  $: if ($powerSources && map) updateIndicators();
</script>

<div id="map"></div>

{#each indicators as ind (ind.id)}
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

<div class="mode-badge">MODE: {currentMode.toUpperCase()}</div>

<div id="ui">
  <!-- Top Right Controls (Classic Style) -->
  <div id="drop">
    <button
      on:click={() => toggleMode()}
      class="toggle"
      title="Toggle Dark/Light"
    >
      <div class="in">🌓</div>
    </button>
    <button
      on:click={() => (isDashboardOpen = true)}
      class="toggle"
      title="Settings"
    >
      <div class="in">⚙️</div>
    </button>
    <button
      on:click={() => {
        const modes = ["standard", "edit", "predict"];
        const next = modes[(modes.indexOf(currentMode) + 1) % modes.length];
        switchMode(next);
      }}
      class="toggle"
      title="Switch Mode"
    >
      <div class="in">M</div>
    </button>
  </div>

  <!-- Mode Specific Tools -->
  {#if currentMode === "edit"}
    <div id="dev">
      <button
        on:click={toggleMains}
        class="toggle"
        class:active={is_running.mains}
        title="Add Main"
      >
        <div class="in">A</div>
      </button>
      <button
        on:click={() => {
          graph.update((g) => {
            const ids = Object.keys(g.mains)
              .map(Number)
              .sort((a, b) => b - a);
            if (ids.length > 0) delete g.mains[ids[0]];
            return g;
          });
          draw(map, get(graph), L, getGraphLayer());
        }}
        class="toggle"
        title="Undo"
      >
        <div class="in">Z</div>
      </button>
    </div>
  {/if}

  <!-- Inspector Panel (Classic Style) -->
  <div id="inspect">
    {#if $activeData}
      <div
        style="display: flex; justify-content: space-between; align-items: flex-start;"
      >
        <h1 id="name">{$activeData.name || "ID: " + $activeData.id}</h1>
        <button
          class="toggle"
          style="width: 24px; height: 24px;"
          on:click={() => (showAdvanced = !showAdvanced)}
        >
          <div class="in" style="font-size: 10px;">
            {showAdvanced ? "S" : "A"}
          </div>
        </button>
      </div>

      <div id="subinspect">
        {#if !showAdvanced}
          <!-- Simple Mode -->
          <div class="inspect-row">
            <span class="label">Net Energy:</span>
            <span
              id="net-energy"
              style="color: {$activeData.prod - $activeData.dem >= 0
                ? 'green'
                : 'red'}; font-weight: bold;"
            >
              {($activeData.prod - $activeData.dem).toFixed(2)}
            </span>
          </div>
          <div class="inspect-row">
            <span class="label">Storage:</span>
            <span id="storage"
              >{($activeData.store || 0).toFixed(0)} / 1000</span
            >
          </div>
        {:else}
          <!-- Advanced Mode (Full Access) -->
          <div class="inspect-row">
            <label for="prod">Production:</label><input
              id="prod"
              type="number"
              bind:value={$activeData.prod}
              on:change={reoptimize}
            />
          </div>
          <div class="inspect-row">
            <label for="dem">Demand:</label><input
              id="dem"
              type="number"
              bind:value={$activeData.dem}
              on:change={reoptimize}
            />
          </div>
          <div class="inspect-row">
            <label for="store">Store:</label><input
              id="store"
              type="number"
              bind:value={$activeData.store}
              on:change={reoptimize}
            />
          </div>
          <div class="inspect-row">
            <label for="priority">Priority:</label><input
              id="priority"
              type="number"
              bind:value={$activeData.priority}
              on:change={reoptimize}
            />
          </div>
          {#if false}
            <div class="inspect-row">
              <label for="pos">Position:</label><input
                id="pos"
                type="position"
                bind:value={$activeData.pos}
              />
            </div>

            {#if currentMode === "predict"}
              <hr />
              <div class="inspect-row">
                <label for="future-use">Future Use:</label><span id="future-use"
                  >Expected +12%</span
                >
              </div>
            {/if}
          {/if}
        {/if}
      </div>
    {:else}
      <p style="font-size: 0.8rem;">
        Click a map element to inspect grid properties.
      </p>
    {/if}
  </div>
  {#if showAdvanced}
    <div
      id="log"
      style="position: fixed; bottom: 15px; right: 15px; border-radius: 20px; width: 100px; height: 300px; background-color: rgba(255, 255, 255, 0.9);"
    >
      {ledger.length}
    </div>
  {/if}

  <!-- Timeline (Classic Style) -->
  <div id="timeline">
    <button
      on:click={() => {
        activeIndex = -1;
        if (map) draw(map, get(graph), L, getGraphLayer());
      }}>RESET</button
    >
    <div style="text-align: center; min-width: 100px;">
      <span style="font-weight: bold;"
        >STEP {activeIndex + 1} / {ledger.length}</span
      >
    </div>
    <button
      on:click={() => {
        if (activeIndex === -1 && map)
          draw(map, get(graph), L, getGraphLayer());
        if (activeIndex < ledger.length - 1) {
          activeIndex++;
          path(map, get(graph), L, getGraphLayer(), ledger[activeIndex]);
        }
      }}>NEXT</button
    >
    <button
      on:click={() => {
        if (!PlayedAll) {
          PlayedAll = true;
          activeIndex = -1;
          draw(map, get(graph), L, getGraphLayer());
          for (let i = 0; i < ledger.length; i++) {
            setTimeout(() => {
              path(map, get(graph), L, getGraphLayer(), ledger[i]);
              activeIndex = i;
              if (i === ledger.length - 1) isPlayingAll = false;
            }, 10 * i); // Staggered delay
          }
        }
      }}>PLAY ALL</button
    >

    {#if currentMode === "predict"}
      <button
        on:click={() => {
          reoptimize();
        }}
        style="background: yellow; color: black; font-weight: bold;"
        >RUN PREDICTION</button
      >
    {/if}
  </div>
</div>

<!-- SETTINGS DASHBOARD -->
<div id="dashboard" class:open={isDashboardOpen}>
  <div
    style="display: flex; justify-content: space-between; align-items: center;"
  >
    <h2 style="margin: 0;">Settings</h2>
    <button class="toggle" on:click={handleDashReturn}
      ><div class="in">X</div></button
    >
  </div>

  <div style="overflow-y: auto; flex: 1;">
    <h3 style="font-size: 0.9rem;">Grid Constants</h3>
    {#each Object.entries($CONFIGS) as [key, value], i}
      <div style="display: flex; flex-direction: column; margin-bottom: 10px;">
        <label for="config-{i}" style="font-size: 0.7rem;">{key}</label>
        <input
          id="config-{i}"
          type="number"
          step="0.1"
          {value}
          on:change={(e) => {
            CONFIGS.update((c) => ({
              ...c,
              [key]: parseFloat(e.target.value) || 0,
            }));
            reoptimize();
          }}
          style="width: 90%; margin-left: 1%; border: 1px solid black;"
        />
      </div>
    {/each}
  </div>

  <div style="padding: 10px; border: 1px solid gray; font-size: 0.8rem;">
    <button
      on:click={reoptimize}
      style="width: 100%; padding: 5px; background: #007bff; color: white; border: none; border-radius: 3px; cursor: pointer;"
      >OPTIMIZE</button
    >
  </div>
</div>
