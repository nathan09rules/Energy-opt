<script lang="ts">
    import { onMount } from "svelte";
    import type { Map, LayerGroup, GeoJSON } from 'leaflet';

    let map: Map;
    let powerLayer: LayerGroup;
    let blueprintLayer: GeoJSON;
    let searchQuery = "";
    let isSearchOpen = false;
    let powerSources = [];
    let indicators = [];

    async function searchLocation() {
        if (!searchQuery) return;
        try {
            // Using a lighter search API
            const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}`);
            const data = await res.json();
            if (data.length > 0) {
                map.setView([data[0].lat, data[0].lon], 17);
                isSearchOpen = false;
                generateBlueprint();
            }
        } catch (e) { console.error("Search Fail"); }
    }

    async function generateBlueprint() {
        if (!map) return;
        const b = map.getBounds();
        const bbox = `${b.getSouth()},${b.getWest()},${b.getNorth()},${b.getEast()}`;
        
        // This query fetches the GEOMETRY (the shapes) of buildings
        const query = `[out:json][timeout:20];(way["building"](${bbox});node["power"~"generator|plant"](${bbox});way["power"~"generator|plant"](${bbox}););out geom center;`;

        try {
            // We use the most reliable mirror
            const res = await fetch("https://overpass.kumi.systems/api/interpreter", { method: "POST", body: query });
            const data = await res.json();

            blueprintLayer.clearLayers();
            powerLayer.clearLayers();
            powerSources = [];

            const geoData = { type: "FeatureCollection", features: [] };

            data.elements.forEach(el => {
                if (el.tags?.building) {
                    // Create the blue wireframe
                    // @ts-ignore
                    geoData.features.push({
                        type: "Feature",
                        geometry: { type: "Polygon", coordinates: [el.geometry.map(p => [p.lon, p.lat])] }
                    });
                } else if (el.tags?.power) {
                    const lat = el.lat || el.center.lat;
                    const lon = el.lon || el.center.lon;
                    powerSources.push({ id: el.id, lat, lng: lon });
                    // @ts-ignore
                    L.circleMarker([lat, lon], { radius: 10, color: '#0f8', fillColor: '#0f8', fillOpacity: 0.9 }).addTo(powerLayer);
                }
            });

            // @ts-ignore
            blueprintLayer.addData(geoData);
            updateIndicators();
        } catch (e) { console.error("Data fetch failed"); }
    }

    function updateIndicators() {
        if (!map) return;
        const size = map.getSize();
        const center = map.latLngToContainerPoint(map.getCenter());

        indicators = powerSources.map(s => {
            const target = map.latLngToContainerPoint([s.lat, s.lng]);
            const isOff = target.x < 0 || target.x > size.x || target.y < 0 || target.y > size.y;
            if (!isOff) return { ...s, visible: false };

            const dx = target.x - center.x;
            const dy = target.y - center.y;
            const angle = Math.atan2(dy, dx);
            const pad = 40;
            let x, y;
            const slope = dy / dx;

            if (Math.abs(slope) < (size.y / size.x)) {
                x = dx > 0 ? size.x - pad : pad;
                y = center.y + (x - center.x) * slope;
            } else {
                y = dy > 0 ? size.y - pad : pad;
                x = center.x + (y - center.y) / slope;
            }
            return { ...s, visible: true, x, y, rotation: angle * (180 / Math.PI) };
        });
        indicators = indicators;
    }

    onMount(async () => {
        const L = await import("leaflet");
        await import("leaflet/dist/leaflet.css");
        
        // NO TILES: We are starting with a blank canvas
        map = L.map("map", { 
            center: [25.2048, 55.2708], 
            zoom: 17, 
            zoomControl: false,
            attributionControl: false 
        });
        
        blueprintLayer = L.geoJSON(null, { 
            style: { color: "#00aaff", weight: 2, fillOpacity: 0, className: 'glow' } 
        }).addTo(map);

        powerLayer = L.layerGroup().addTo(map);
        map.on('move', updateIndicators);
    });
</script>

<div id="wrapper">
    <div id="map"></div>

    <div class="hud-top">
        {#if isSearchOpen}
            <input bind:value={searchQuery} placeholder="TYPE LOCATION..." on:keydown={e => e.key === 'Enter' && searchLocation()} />
        {/if}
        <button class="circle-btn" on:click={() => isSearchOpen = !isSearchOpen}>⌖</button>
    </div>

    {#each indicators as ind (ind.id)}
        {#if ind.visible}
            <div class="pointer" style="left:{ind.x}px; top:{ind.y}px;">
                <div class="arrow" style="transform:rotate({ind.rotation}deg)"></div>
            </div>
        {/if}
    {/each}

    <button class="scan-btn" on:click={generateBlueprint}>GENERATE BLUEPRINT</button>
</div>

<style>
    #wrapper { position: absolute; inset: 0; background: #000; overflow: hidden; }
    #map { width: 100%; height: 100%; background: #000; }

    .hud-top { position: absolute; top: 20px; right: 20px; z-index: 2000; display: flex; align-items: center; }
    .hud-top input { background: rgba(0, 0, 0, 0.8); border: 1px solid #00aaff; color: #00aaff; padding: 10px; margin-right: 10px; font-family: monospace; outline: none; }
    .circle-btn { width: 50px; height: 50px; border-radius: 50%; background: #000; color: #00aaff; border: 2px solid #00aaff; cursor: pointer; box-shadow: 0 0 10px #00aaff; font-size: 20px; }

    .scan-btn {
        position: absolute; bottom: 30px; left: 50%; transform: translateX(-50%);
        z-index: 1000; padding: 15px 40px; background: #000; color: #00aaff;
        border: 2px solid #00aaff; cursor: pointer; font-family: monospace; font-weight: bold;
        box-shadow: inset 0 0 15px #00aaff;
    }

    .pointer { position: absolute; width: 20px; height: 20px; z-index: 2000; pointer-events: none; }
    .arrow { width: 0; height: 0; border-top: 6px solid transparent; border-bottom: 6px solid transparent; border-left: 12px solid #0f8; }

    /* The "Neon" Blueprint Effect */
    :global(.glow) {
        filter: drop-shadow(0 0 3px #00aaff);
        stroke-dasharray: 4; /* Makes it look like a technical drawing */
    }
</style>