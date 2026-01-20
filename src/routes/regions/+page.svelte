<script>
    import { onMount } from "svelte";
    import { get } from "svelte/store";
    import "$lib/app.css";
    import "$lib/base.css";
    import {
        graph,
        powerSources,
        powerIndicators,
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
        sublines,
        darkMode,
    } from "$lib/map.js";
    import { place, draw, path, autoConnect } from "$lib/graph.js";

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
        hospital: { code: "H+", color: "#FF0000", renewable: false },
        power: { code: "P", color: "#FFA500", renewable: false },
    };

    const mains_region = {
        1: [23.736336, 54.856952, 2],
        2: [25.401427, 55.584032, 3],
        3: [25.401427, 55.584032, 4],
        4: [24.323249, 54.730992, 5],
        5: [23.602901, 53.824291, 6],
        6: [22.953014, 54.88683, 7],
        7: [22.841741, 54.88683, 8],
        8: [24.371122, 55.370474, 9],
        9: [25.22839, 55.656264, 1],
    };
    // Reactive statement to redraw when graph changes
    $: if ($graph && map && L) draw(map, get(graph), L, getGraphLayer());

    let map, L;
    let isDashboardOpen = false;
    let showAdvanced = false;
    let isScanning = false;

    // SYSTEM MODES
    let currentMode = "standard";
    let positionClickHandler;
    let placingMain = false;
    let mainClickHandler;

    async function loadPowerData() {
        isScanning = true;
        const b = map.getBounds();
        const bbox = `${b.getSouth()},${b.getWest()},${b.getNorth()},${b.getEast()}`;
        const endpoints = [
            "https://overpass-api.de/api/interpreter",
            "https://overpass.kumi.systems/api/interpreter",
        ];

        const query = `[out:json][timeout:25];(node["power"~"generator|plant"](${bbox});way["power"~"generator|plant"](${bbox});node["amenity"="hospital"](${bbox}););out center;`;

        for (let url of endpoints) {
            try {
                const res = await fetch(url, { method: "POST", body: query });
                if (!res.ok) continue;
                const data = await res.json();
                const newSources = data.elements.map((el) => {
                    const tags = el.tags || {};
                    const etype =
                        tags.amenity === "hospital" ? "hospital" : "power";
                    const rawType = (
                        tags["generator:source"] ||
                        tags["fuel"] ||
                        tags["power:source"] ||
                        ""
                    ).toLowerCase();

                    let info = typeMap[rawType] ||
                        typeMap[etype] || {
                            code: tags.name
                                ? tags.name.charAt(0).toUpperCase()
                                : etype === "hospital"
                                  ? "H+"
                                  : "P",
                            color: etype === "hospital" ? "#FF0000" : "#FF8800",
                            renewable: false,
                        };

                    return {
                        id: el.id,
                        lat: el.lat || el.center.lat,
                        lng: el.lon || el.center.lon,
                        info,
                        name:
                            tags.name ||
                            (etype === "hospital"
                                ? "Hospital"
                                : "Power Station"),
                    };
                });
                powerSources.set(newSources);
                syncPowerSources();
                isScanning = false;
                return;
            } catch (e) {
                console.error(`Failed to fetch from ${url}:`, e);
            }
        }
        isScanning = false;
    }

    let regions = { type: "FeatureCollection", features: [] };

    async function loadRegions() {
        try {
            const response = await fetch("/regions.geojson");
            if (!response.ok) throw new Error("Failed to load regions.geojson");

            regions = await response.json();
            renderDistricts(regions);
        } catch (e) {
            console.error("Load Error:", e);
        }
    }

    function renderDistricts(geojson) {
        if (!map || !L || !geojson) return;

        // Clear old layers
        map.eachLayer((layer) => {
            if (layer instanceof L.GeoJSON) map.removeLayer(layer);
        });

        const geoLayer = L.geoJSON(geojson, {
            style: {
                color: "#2563eb",
                weight: 1.5,
                fillColor: "#3b82f6",
                fillOpacity: 0.2,
            },
            onEachFeature: (feature, layer) => {
                const name = feature.properties?.name || "Unknown District";
                layer.bindPopup(`<strong>${name}</strong>`);
            },
        }).addTo(map);

        // fitBounds will fail if there's only one point or empty data
        if (geojson.features && geojson.features.length > 0) {
            map.fitBounds(geoLayer.getBounds());
        }
    }

    onMount(async () => {
        // ADJUST CONFIGS FOR REGIONAL SCALE
        CONFIGS["transmission loss factor"] = 0.00005;
        CONFIGS["max neighbors"] = 8;
        CONFIGS["location resistance"] = 5;

        try {
            await import("leaflet/dist/leaflet.css");

            // Reset graph for regional view
            graph.set({ mains: {}, loc: {} });
            powerSources.set([]);

            // Use the newly created locations.geojson
            map = await initMap("map", "/locations.geojson");
            L = getL();

            // Load locations into powerSources store to show indicators
            const res = await fetch("/locations.geojson");
            const geo = await res.json();

            let newPowerSources = geo.features.map((f) => ({
                id: f.properties.id,
                lat: f.geometry.coordinates[1],
                lng: f.geometry.coordinates[0],
                info: typeMap[f.properties.type] || typeMap["power"],
                name: f.properties.name,
            }));

            // Trim out locations too close to each other
            const threshold = 0.01; // adjust as needed
            const filtered = [];
            newPowerSources.forEach((source) => {
                const tooClose = filtered.some(
                    (f) =>
                        Math.sqrt(
                            Math.pow(f.lat - source.lat, 2) +
                                Math.pow(f.lng - source.lng, 2),
                        ) < threshold,
                );
                if (!tooClose) filtered.push(source);
            });
            newPowerSources = filtered;

            powerSources.set(newPowerSources);

            syncPowerSources();
            sublines(get(graph));

            map.on("move", updateIndicators);

            // Load regions
            await loadRegions();

            // Place mains
            graph.update((g) => {
                Object.entries(mains_region).forEach(
                    ([id, [lat, lng, next]]) => {
                        g.mains[id] = {
                            id: parseInt(id),
                            lat,
                            lng,
                            neighbors: [next],
                            type: "main",
                        };
                    },
                );
                return g;
            });

            sublines(get(graph));
        } catch (e) {
            console.error("Initialization error:", e);
        }
    });

    function switchMode(m) {
        currentMode = m;
        if (currentMode === "coord") {
            positionClickHandler = (e) => {
                const lat = e.latlng.lat;
                const lng = e.latlng.lng;
                activeData.set({ lat, lng });
                navigator.clipboard.writeText(
                    `[${lat.toFixed(6)}, ${lng.toFixed(6)}]`,
                );
            };
            map.on("click", positionClickHandler);
        } else {
            if (positionClickHandler) {
                map.off("click", positionClickHandler);
                positionClickHandler = null;
            }
        }
    }

    function handleDashReturn() {
        isDashboardOpen = false;
    }

    let indicators = [];
    let ledger = [];
    let activeIndex = -1;

    function updateIndicators() {
        if (!map) return;
        const size = map.getSize();
        const center = map.latLngToContainerPoint(map.getCenter());
        const sources = get(powerSources);

        indicators = sources.map((source) => {
            const targetPoint = map.latLngToContainerPoint([
                source.lat,
                source.lng,
            ]);
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

    $: if ($powerSources && map) updateIndicators();

    $: if (placingMain && currentMode === "edit" && map) {
        mainClickHandler = (e) => {
            L.DomEvent.stopPropagation(e);
            const id = Object.keys(get(graph).mains).length + 1;
            graph.update((g) => {
                g.mains[id] = {
                    id,
                    lat: e.latlng.lat,
                    lng: e.latlng.lng,
                    neighbors: [],
                    type: "main",
                };
                return g;
            });
            sublines(get(graph));
        };
        map.on("click", mainClickHandler);
    } else {
        if (mainClickHandler) {
            map.off("click", mainClickHandler);
            mainClickHandler = null;
        }
    }
</script>

<div id="map"></div>

<div class="mode-badge">REGION VIEW: {currentMode.toUpperCase()}</div>

<div id="ui">
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
                const modes = ["standard", "edit", "predict", "coord"];
                const next =
                    modes[(modes.indexOf(currentMode) + 1) % modes.length];
                switchMode(next);
            }}
            class="toggle"
            title="Switch Mode"
        >
            <div class="in">M</div>
        </button>
    </div>

    {#if currentMode === "edit"}
        <div id="dev">
            <button
                on:click={() => (placingMain = !placingMain)}
                class="toggle"
                class:active={placingMain}
                title="Place Main"
            >
                <div class="in">PM</div>
            </button>
        </div>
    {/if}

    <div id="legend">
        <h4>Legend</h4>
        {#each Object.entries(typeMap) as [key, info]}
            <div class="legend-item">
                <div class="color-box" style="background: {info.color}"></div>
                <span>{key}</span>
            </div>
        {/each}
    </div>

    <div id="inspect">
        {#if $activeData}
            <div
                style="display: flex; justify-content: space-between; align-items: flex-start;"
            >
                <h1 id="name">
                    {#if $activeData.lat !== undefined && $activeData.lng !== undefined && !$activeData.id}
                        Position
                    {:else}
                        {$activeData.name || "ID: " + $activeData.id}
                    {/if}
                </h1>
                {#if $activeData.id}
                    <button
                        class="toggle"
                        style="width: 24px; height: 24px;"
                        on:click={() => (showAdvanced = !showAdvanced)}
                    >
                        <div class="in" style="font-size: 10px;">
                            {showAdvanced ? "S" : "A"}
                        </div>
                    </button>
                {/if}
            </div>

            <div id="subinspect">
                {#if $activeData.lat !== undefined && $activeData.lng !== undefined && !$activeData.id}
                    <div class="inspect-row">
                        <span class="label">Latitude:</span>
                        <span>{$activeData.lat.toFixed(6)}</span>
                    </div>
                    <div class="inspect-row">
                        <span class="label">Longitude:</span>
                        <span>{$activeData.lng.toFixed(6)}</span>
                    </div>
                {:else if !showAdvanced}
                    <div class="inspect-row">
                        <span class="label">Net Energy:</span>
                        <span
                            id="net-energy"
                            style="color: {$activeData.prod - $activeData.dem >=
                            0
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
                    <div class="inspect-row">
                        <label for="prod">Production:</label><input
                            id="prod"
                            type="number"
                            bind:value={$activeData.prod}
                            on:change={() => {}}
                        />
                    </div>
                    <div class="inspect-row">
                        <label for="dem">Demand:</label><input
                            id="dem"
                            type="number"
                            bind:value={$activeData.dem}
                            on:change={() => {}}
                        />
                    </div>
                    <div class="inspect-row">
                        <label for="store">Store:</label><input
                            id="store"
                            type="number"
                            bind:value={$activeData.store}
                            on:change={() => {}}
                        />
                    </div>
                    <div class="inspect-row">
                        <label for="priority">Priority:</label><input
                            id="priority"
                            type="number"
                            bind:value={$activeData.priority}
                            on:change={() => {}}
                        />
                    </div>
                    <div class="inspect-row">
                        <span class="label">Latitude:</span>
                        <span>{$activeData.lat.toFixed(6)}</span>
                    </div>
                    <div class="inspect-row">
                        <span class="label">Longitude:</span>
                        <span>{$activeData.lng.toFixed(6)}</span>
                    </div>
                {/if}
            </div>
        {:else}
            <p style="font-size: 0.8rem;">
                {#if currentMode === "coord"}
                    Click on the map to get coordinates.
                {:else}
                    Click a regional hub to inspect property.
                {/if}
            </p>
        {/if}
    </div>

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
                    path(
                        map,
                        get(graph),
                        L,
                        getGraphLayer(),
                        ledger[activeIndex],
                    );
                }
            }}>NEXT</button
        >
        <button
            on:click={() => {
                activeIndex = -1;
                draw(map, get(graph), L, getGraphLayer());
                for (let i = 0; i < ledger.length; i++) {
                    setTimeout(() => {
                        path(map, get(graph), L, getGraphLayer(), ledger[i]);
                        activeIndex = i;
                    }, 10 * i);
                }
            }}>PLAY ALL</button
        >
    </div>
</div>

<div id="dashboard" class:open={isDashboardOpen}>
    <div
        style="display: flex; justify-content: space-between; align-items: center;"
    >
        <h2 style="margin: 0;">Regional Settings</h2>
        <button class="toggle" on:click={handleDashReturn}
            ><div class="in">X</div></button
        >
    </div>
    <div style="overflow-y: auto; flex: 1;">
        <h3 style="font-size: 0.9rem;">Grid Constants</h3>
        {#each Object.entries(CONFIGS) as [key, value], i}
            <div
                style="display: flex; flex-direction: column; margin-bottom: 10px;"
            >
                <label for="config-{i}" style="font-size: 0.7rem;">{key}</label>
                <input
                    id="config-{i}"
                    type="number"
                    step="0.1"
                    bind:value={CONFIGS[key]}
                    on:change={() => {}}
                    style="width: 100%; border: 1px solid black;"
                />
            </div>
        {/each}
    </div>
</div>

<style>
    :global(body, html) {
        margin: 0;
        padding: 0;
        height: 100%;
    }

    .app-container {
        width: 100vw;
        height: 100vh;
        position: relative;
    }

    #map {
        width: 100%;
        height: 100%;
        background: #f7f7f7;
    }

    .mode-badge {
        position: absolute;
        top: 10px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(0, 0, 0, 0.8);
        color: white;
        padding: 5px 10px;
        border-radius: 5px;
        font-size: 0.9rem;
        z-index: 1000;
    }

    .search-btn {
        position: absolute;
        top: 10px;
        right: 10px;
        background: rgba(0, 0, 0, 0.8);
        color: white;
        border: none;
        padding: 10px 15px;
        border-radius: 5px;
        cursor: pointer;
        z-index: 1000;
    }

    #ui {
        position: absolute;
        bottom: 10px;
        right: 10px;
        display: flex;
        flex-direction: column;
        gap: 10px;
        z-index: 1000;
    }

    #drop {
        display: flex;
        gap: 5px;
    }

    #dev {
        display: flex;
        gap: 5px;
    }

    #inspect {
        background: rgba(255, 255, 255, 0.9);
        padding: 10px;
        border-radius: 5px;
        min-width: 200px;
        max-width: 300px;
    }

    .inspect-row {
        display: flex;
        justify-content: space-between;
        margin-bottom: 5px;
    }

    .label {
        font-weight: bold;
    }

    #dashboard {
        position: absolute;
        top: 0;
        right: 0;
        width: 300px;
        height: 100%;
        background: white;
        transform: translateX(100%);
        transition: transform 0.3s;
        padding: 20px;
        box-shadow: -2px 0 5px rgba(0, 0, 0, 0.3);
        z-index: 2000;
    }

    #dashboard.open {
        transform: translateX(0);
    }

    .toggle {
        background: #f0f0f0;
        border: 1px solid #ccc;
        border-radius: 3px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .toggle .in {
        width: 30px;
        height: 30px;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    #legend {
        background: rgba(255, 255, 255, 0.9);
        padding: 10px;
        border-radius: 5px;
        min-width: 150px;
        max-width: 200px;
    }

    #legend h4 {
        margin: 0 0 10px 0;
        font-size: 0.9rem;
    }

    .legend-item {
        display: flex;
        align-items: center;
        margin-bottom: 5px;
    }

    .color-box {
        width: 15px;
        height: 15px;
        margin-right: 8px;
        border: 1px solid #000;
    }

    .legend-item span {
        font-size: 0.8rem;
    }

    #timeline {
        background: rgba(255, 255, 255, 0.9);
        padding: 10px;
        border-radius: 5px;
        display: flex;
        gap: 5px;
        align-items: center;
    }

    #timeline button {
        background: #f0f0f0;
        border: 1px solid #ccc;
        border-radius: 3px;
        cursor: pointer;
        padding: 5px 10px;
    }
</style>
