<script lang="ts">
	import { onMount } from "svelte";
	import type { Map, GeoJSON, LayerGroup } from 'leaflet';

	let map: Map;
	let buildingsLayer: GeoJSON;
	let roadsLayer: GeoJSON;
	let roadMarkersLayer: LayerGroup;

	const overpassUrl = "https://overpass-api.de/api/interpreter";

	// Fetch building footprints
	async function fetchBuildings(bbox: [number,number,number,number]) {
		const [south, west, north, east] = bbox;

		const query = `
			[out:json][timeout:25];
			(
				way["building"](${south},${west},${north},${east});
			);
			out geom;
		`;

		const res = await fetch(overpassUrl, {
			method: "POST",
			body: query,
		});
		const data = await res.json();

		return window.osmtogeojson(data);
	}

	// Fetch main roads (primary, secondary, tertiary, motorway)
	async function fetchRoads(bbox: [number,number,number,number]) {
		const [south, west, north, east] = bbox;

		const query = `
			[out:json][timeout:25];
			(
				way["highway"~"primary|secondary|tertiary|motorway"](${south},${west},${north},${east});
			);
			out geom;
		`;

		const res = await fetch(overpassUrl, {
			method: "POST",
			body: query,
		});
		const data = await res.json();

		return window.osmtogeojson(data);
	}

	// Place markers along road coordinates at regular intervals
    // Place markers along road coordinates at regular intervals
    function placeRoadMarkers(geojson, intervalMeters = 100) {
        if (roadMarkersLayer) roadMarkersLayer.clearLayers();

        roadMarkersLayer = L.layerGroup().addTo(map);

        geojson.features.forEach(feature => {
            if (feature.geometry.type === "LineString") {
                const coords = feature.geometry.coordinates;

                let accumulatedDistance = 0;
                for (let i = 0; i < coords.length - 1; i++) {
                    const p1 = L.latLng(coords[i][1], coords[i][0]);
                    const p2 = L.latLng(coords[i+1][1], coords[i+1][0]);
                    const segmentDistance = p1.distanceTo(p2);

                    let t = intervalMeters - accumulatedDistance;
                    while (t < segmentDistance) {
                        const ratio = t / segmentDistance;
                        const lat = p1.lat + (p2.lat - p1.lat) * ratio;
                        const lng = p1.lng + (p2.lng - p1.lng) * ratio;

                        // Add circle marker
                        L.circleMarker([lat, lng], {
                            radius: 4,       // size of circle
                            fillColor: "blue",
                            color: "blue",
                            weight: 1,
                            fillOpacity: 0.8,
                        }).addTo(roadMarkersLayer);

                        t += intervalMeters;
                    }

                    accumulatedDistance = (segmentDistance + accumulatedDistance) % intervalMeters;
                }
            }
        });
    }

	async function loadData() {
		if (!map) return;

		const bounds = map.getBounds();
		const bbox: [number,number,number,number] = [
			bounds.getSouth(),
			bounds.getWest(),
			bounds.getNorth(),
			bounds.getEast(),
		];

		// Fetch buildings
		const buildingsGeo = await fetchBuildings(bbox);
		if (buildingsLayer) {
			buildingsLayer.clearLayers();
			buildingsLayer.addData(buildingsGeo);
		}

		// Fetch roads
		const roadsGeo = await fetchRoads(bbox);
		if (roadsLayer) {
			roadsLayer.clearLayers();
			roadsLayer.addData(roadsGeo);
		}

		placeRoadMarkers(roadsGeo , 200);
	}

	onMount(async () => {
		await import("leaflet/dist/leaflet.css");

		const L = await import("leaflet");
		// @ts-ignore
		window.osmtogeojson = (await import("osmtogeojson")).default;

		map = L.map("map", {
			center: [25.2048, 55.2708],
			zoom: 16,
			minZoom: 14,
			maxZoom: 18,
		});

		L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
			maxZoom: 19,
		}).addTo(map);

		// Layers
		buildingsLayer = L.geoJSON(null, {
			style: { color: "#ff7800", weight: 2, fillOpacity: 0.1 },
		}).addTo(map);

		roadsLayer = L.geoJSON(null, {
			style: { color: "red", weight: 3 },
		}).addTo(map);

		roadMarkersLayer = L.layerGroup().addTo(map);
	});
</script>

<style>
	#map {
		position: absolute;
		top: 0;
		right: 0;
		bottom: 0;
		left: 0;
	}

	#fetch-btn {
		position: absolute;
		top: 10px;
		right: 10px;
		z-index: 1000;
		background: white;
		border: 1px solid #ccc;
		padding: 6px 12px;
		cursor: pointer;
		border-radius: 4px;
		font-weight: bold;
		box-shadow: 0 2px 6px rgba(0,0,0,0.3);
	}
	#fetch-btn:hover {
		background: #f0f0f0;
	}

	.road-marker {
		font-size: 14px;
		color: blue;
		transform: translate(-50%, -50%);
	}
</style>

<div id="map"></div>
<button id="fetch-btn" on:click={loadData}>Fetch Buildings & Roads</button>
