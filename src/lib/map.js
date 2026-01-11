// map.js
import { activeData, activeModel, graph } from './stores.js';
import { get } from 'svelte/store';
export let map, Light, Dark, layer, markerLayerGroup;
export let darkMode = false;
let L; // Leaflet instance
let graphLayer; // Layer for graph nodes (mains)

export async function initMap(containerId, geojsonUrl, leafletInstance) {
  // Use passed instance or dynamic import
  L = leafletInstance || (await import('leaflet')).default;

  map = L.map(containerId);

  // Tile layers
  Light = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);

  Dark = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OpenStreetMap contributors &copy; <a href="https://carto.com/">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 19
  });

  // Initialize graph layer group
  graphLayer = L.layerGroup().addTo(map);
  markerLayerGroup = L.layerGroup().addTo(map);

  // Fetch GeoJSON
  const res = await fetch(geojsonUrl);
  const geojson = await res.json();

  let activeFeatureLayer = null;
  let temp = {};

  layer = L.geoJSON(geojson, {
    style: { color: 'black', weight: 1, fillOpacity: 0.5, fillColor: 'red' },
    //click thing
    onEachFeature: (feature, lyr) => {
      const props = feature.properties
      temp[props.id] = feature.properties;

      lyr.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        lyr.setStyle({ fillColor: 'green' });

        if (activeFeatureLayer) activeFeatureLayer.setStyle({ fillColor: darkMode ? 'yellow' : 'red' });
        activeFeatureLayer = lyr;

        // Update store
        activeData.set(feature);

        function setText(id, value, fallback = "Null") {
          const el = document.getElementById(id);
          if (el) el.innerText = value ?? fallback;
        }

        setText("name", props.name, "Click on a tile");
        setText("priority", `Priority: ${props.priority}`);
        setText("store", `Store: ${props.store}`);
        setText("prod", `Prod: ${props.prod}`);
        setText("dem", `Dem: ${props.dem}`);
        setText("pos", `${props.pos}`);
      });

      // Show small markers for existing points? This corresponds to original logic line 61
      try {
        const coords = props.pos.slice(1, -1).split(',').map(Number);
        if (coords.length === 2 && !isNaN(coords[0])) {
          L.circleMarker([coords[1], coords[0]], { radius: 10, color: 'gray' }).addTo(graphLayer);

        }
      } catch (e) { console.warn("Error parsing pos for marker", props.pos); }
    }
  }).addTo(map);

  get(graph).loc = temp;
  // Fit bounds and shift center
  const bounds = layer.getBounds();
  map.fitBounds(bounds);

  const southWest = bounds.getSouthWest();
  const northEast = bounds.getNorthEast();
  const center = bounds.getCenter();
  const latShift = (northEast.lat - southWest.lat) * -0.4;
  map.setView([center.lat + latShift, center.lng], map.getZoom());
  map.setMinZoom(map.getBoundsZoom(bounds));

  return map;
}

//--TOGGLE FUNCTIONS--//
export function toggleMode() {
  darkMode = !darkMode;
  document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light');

  if (darkMode) {
    Dark.addTo(map);
    Light.remove();
  } else {
    Light.addTo(map);
    Dark.remove();
  }

  layer.eachLayer(lyr => {
    lyr.setStyle({
      fillColor: darkMode ? 'yellow' : 'red',
      color: darkMode ? 'white' : 'black',
      fillOpacity: darkMode ? 0.2 : 0.5
    });
  });

  // Toggle graph visibility
  if (darkMode) {
    if (graphLayer) graphLayer.addTo(map);
  } else {
    if (graphLayer) graphLayer.remove();
  }
}


//--MARKER FUNCTIONS--//
/*
export function showMarkers() {
  if (markerLayerGroup && map) {
    markerLayerGroup.addTo(map);
  }
}

export function hideMarkers() {
  if (markerLayerGroup && map) {
    markerLayerGroup.remove();
  }
}

export function clearMarkers() {
  if (markerLayerGroup) {
    markerLayerGroup.clearLayers();
  }
}
*/
export function getL() { return L; }
export function getGraphLayer() { return graphLayer; }
export function getMarkerLayerGroup() { return markerLayerGroup; }

