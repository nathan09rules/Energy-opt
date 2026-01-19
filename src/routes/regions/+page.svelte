<script>
    import { onMount } from "svelte";

    let regions = { type: "FeatureCollection", features: [] };
    let map;
    let L;
    let isFetching = false;

    // Use your local data
    let localData = regions;
    function renderDistricts(geojson) {
        if (!map || !L || !geojson) return;

        console.log(
            "Total Features Found:",
            geojson.features ? geojson.features.length : "Not a collection",
        );

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
    async function loadRegions() {
        if (isFetching) return;
        isFetching = true;

        try {
            console.log("Fetching local regions.geojson...");
            const response = await fetch("/regions.geojson");
            if (!response.ok) throw new Error("Failed to load regions.geojson");

            const geojson = await response.json();
            renderDistricts(geojson);
        } catch (e) {
            console.error("Load Error:", e);
            alert("Error loading local regions. Standard backup used.");
            renderDistricts(localData);
        } finally {
            isFetching = false;
        }
    }

    onMount(async () => {
        // 1. Initialize Leaflet
        const leaflet = await import("leaflet");
        await import("leaflet/dist/leaflet.css");
        L = leaflet.default;

        // 2. Setup Map - Centered on Middle East
        map = L.map("map").setView([25.0, 45.0], 4);

        L.tileLayer(
            "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
            { attribution: "&copy; OpenStreetMap &copy; CARTO" },
        ).addTo(map);

        // 3. Load the data
        await loadRegions();
    });
</script>

<div class="app-container">
    <div id="map"></div>

    <div class="ui-panel">
        <button on:click={loadRegions} disabled={isFetching}>
            {isFetching ? "LOADING REGIONS..." : "RELOAD REGIONS"}
        </button>
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
    .ui-panel {
        position: absolute;
        bottom: 30px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 1000;
    }
    button {
        background: white;
        color: #1e40af;
        border: 2px solid #1e40af;
        padding: 12px 24px;
        font-weight: bold;
        border-radius: 8px;
        cursor: pointer;
        box-shadow: 0 4px 10px rgba(0, 0, 0, 0.1);
    }
</style>
