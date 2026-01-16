<script lang="ts">
    import { onMount } from "svelte";
    import type { Map, LayerGroup } from 'leaflet';

    let map: Map;
    let powerNodesLayer: LayerGroup;
    let powerSources = [];
    let indicators = [];

    const endpoints = [
        "https://overpass.kumi.systems/api/interpreter",
        "https://overpass-api.de/api/interpreter",
        "https://overpass.openstreetmap.ru/api/interpreter"
    ];

    const typeMap = {
        'solar': { code: 'S', color: '#FFD700' },
        'wind': { code: 'W', color: '#00BFFF' },
        'hydro': { code: 'H', color: '#4169E1' },
        'nuclear': { code: 'N', color: '#ADFF2F' }
    };

    async function loadPowerData() {
        if (!map) return;
        
        const b = map.getBounds();
        const bbox = `${b.getSouth()},${b.getWest()},${b.getNorth()},${b.getEast()}`;
        
        // ADDED "way" with "out center" to catch plants drawn as areas
        const query = `[out:json][timeout:15];(node["power"~"generator|plant"](${bbox});way["power"~"generator|plant"](${bbox}););out center;`;

        for (let url of endpoints) {
            try {
                console.log(`Scanning via ${url}...`);
                const res = await fetch(url, { method: "POST", body: query });
                if (!res.ok) continue;

                const data = await res.json();
                
                // Check if we actually got elements
                if (!data.elements || data.elements.length === 0) {
                    console.warn("No power sources found in this view. Try zooming out.");
                    continue; 
                }

                console.log(`SUCCESS: Found ${data.elements.length} sources.`);
                powerNodesLayer.clearLayers();

                powerSources = data.elements.map(el => {
                    const tags = el.tags || {};
                    const rawType = (tags['generator:source'] || tags['fuel'] || tags['power:source'] || '').toLowerCase();
                    const info = typeMap[rawType] || { 
                        code: tags.name ? tags.name.charAt(0).toUpperCase() : 'P', 
                        color: '#00FF88' 
                    };

                    // Coordinates for nodes use el.lat/lon; for ways they use el.center.lat/lon
                    const lat = el.lat || el.center.lat;
                    const lon = el.lon || el.center.lon;

                    // @ts-ignore
                    L.circleMarker([lat, lon], {
                        radius: 10, fillColor: info.color, color: '#fff', weight: 2, fillOpacity: 1
                    }).bindPopup(tags.name || "Station").addTo(powerNodesLayer);

                    return { id: el.id, lat, lng: lon, info, name: tags.name || "STATION" };
                });

                updateIndicators();
                return; 
            } catch (e) {
                console.error(`Mirror ${url} failed.`);
            }
        }
    }

    function updateIndicators() {
        if (!map) return;
        const size = map.getSize();
        const center = map.latLngToContainerPoint(map.getCenter());

        indicators = powerSources.map(source => {
            const targetPoint = map.latLngToContainerPoint([source.lat, source.lng]);
            const isOffScreen = targetPoint.x < 0 || targetPoint.x > size.x || 
                               targetPoint.y < 0 || targetPoint.y > size.y;

            if (!isOffScreen) return { ...source, visible: false };

            const dx = targetPoint.x - center.x;
            const dy = targetPoint.y - center.y;
            const angle = Math.atan2(dy, dx);

            const padding = 40;
            let x, y;
            const slope = dy / dx;

            if (Math.abs(slope) < (size.y / size.x)) {
                x = dx > 0 ? size.x - padding : padding;
                y = center.y + (x - center.x) * slope;
            } else {
                y = dy > 0 ? size.y - padding : padding;
                x = center.x + (y - center.y) / slope;
            }

            return { ...source, visible: true, x, y, rotation: angle * (180 / Math.PI) };
        });
        indicators = indicators;
    }

    onMount(async () => {
        const L = await import("leaflet");
        await import("leaflet/dist/leaflet.css");
        // Start at a lower zoom (12) to see more area
        map = L.map("map", { center: [25.2048, 55.2708], zoom: 12 });
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(map);
        powerNodesLayer = L.layerGroup().addTo(map);
        map.on('move', updateIndicators);
    });
</script>

<div id="wrapper">
    <div id="map"></div>

    {#each indicators as ind (ind.id)}
        {#if ind.visible}
            <div class="hud" style="left: {ind.x}px; top: {ind.y}px; border-color: {ind.info.color};">
                <div class="arrow" style="transform: rotate({ind.rotation}deg); border-left-color: {ind.info.color}"></div>
                <div class="sym" style="color: {ind.info.color}">{ind.info.code}</div>
            </div>
        {/if}
    {/each}

    <button on:click={loadPowerData}>📡 PULSE SCAN</button>
</div>

<style>
    #wrapper { position: absolute; inset: 0; overflow: hidden; }
    #map { width: 100%; height: 100%; }
    button {
        position: absolute; bottom: 20px; left: 50%; transform: translateX(-50%);
        z-index: 1000; background: #000; color: #0f8; border: 2px solid #0f8;
        padding: 10px 25px; cursor: pointer; font-family: monospace; font-size: 16px;
    }
    .hud {
        position: absolute; width: 40px; height: 40px; background: rgba(0,0,0,0.8);
        border: 2px solid; border-radius: 50%; display: flex; align-items: center;
        justify-content: center; z-index: 2000; transform: translate(-50%, -50%);
    }
    .arrow {
        width: 0; height: 0; border-top: 6px solid transparent; border-bottom: 6px solid transparent;
        border-left: 10px solid; position: absolute; right: -13px;
    }
    .sym { font-weight: bold; }
</style>