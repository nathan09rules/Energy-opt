// map.js
import { graph, activeData, activeModel, powerSources, regions } from './regions.js';
import { get, writable } from 'svelte/store';
import { CONFIGS } from './configs.js';

export let map, Light, Dark, layer, markerLayerGroup;
export let darkMode = writable(true); // Default to DARK mode for premium look

let L;
let graphLayer;

export async function initMap(containerId, geojsonUrl) {
  L = window.L || (await import('leaflet')).default;

  map = L.map(containerId, { zoomControl: false });

  Light = L.tileLayer('https://{s}.tile.osm.org/{z}/{x}/{y}.png');
  Dark = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png').addTo(map);

  graphLayer = L.layerGroup().addTo(map);
  markerLayerGroup = L.layerGroup().addTo(map);

  if (geojsonUrl) {
    const res = await fetch(geojsonUrl);
    const geojson = await res.json();
    regions.set(geojson);

    layer = L.geoJSON(geojson, {
      style: (feature) => ({
        color: '#00ccff',
        weight: 1,
        fillOpacity: 0.3,
        fillColor: feature.properties.prod > feature.properties.dem ? '#00ffa2' : '#ff4444'
      }),
      onEachFeature: (feature, lyr) => {
        const props = feature.properties;

        // Ensure standard properties exist
        props.neighbors = props.neighbors || [];
        props.type = props.type || 'loc';
        props.priority = props.priority || 3;
        props.store = props.store || 0;

        lyr.on('click', (e) => {
          L.DomEvent.stopPropagation(e);
          activeData.set(props);
        });
      }
    }).addTo(map);

    const tempLocs = {};
    layer.eachLayer(l => {
      tempLocs[l.feature.properties.id] = l.feature.properties;
    });
    graph.update(g => ({ ...g, loc: tempLocs }));

    map.fitBounds(layer.getBounds());
  }
  document.documentElement.setAttribute('data-theme', 'dark');

  return map;
}

export function toggleMode() {
  const current = get(darkMode);
  darkMode.set(!current);
  if (!current) {
    Dark.addTo(map);
    Light.remove();
    document.documentElement.setAttribute('data-theme', 'dark');
  } else {
    Light.addTo(map);
    Dark.remove();
    document.documentElement.setAttribute('data-theme', 'light');
  }
}

export function getL() { return L; }
export function getGraphLayer() { return graphLayer; }

export function updateLayerProperties(id, updates) {
  if (layer) {
    layer.eachLayer(l => {
      if (l.feature.properties.id === id) {
        Object.assign(l.feature.properties, updates);
      }
    });
  }
}

export function syncPowerSources() {
  const sources = get(powerSources);
  const currentGraph = get(graph);
  let updated = false;

  const mains = Object.values(currentGraph.mains);

  sources.forEach(source => {
    if (!currentGraph.loc[source.id]) {
      // Find nearest main to connect to
      let nearestMainId = null;
      let minDistance = Infinity;

      mains.forEach(m => {
        const d = Math.sqrt(Math.pow(source.lat - m.lat, 2) + Math.pow(source.lng - m.lng, 2));
        if (d < minDistance) {
          minDistance = d;
          nearestMainId = m.id;
        }
      });

      currentGraph.loc[source.id] = {
        ...source,
        prod: 5000, // High production for stations
        dem: 0,
        priority: 1,
        store: 1000,
        neighbors: nearestMainId !== null ? [nearestMainId] : [],
        type: 'loc'
      };

      // Also add backward link from main to station
      if (nearestMainId !== null) {
        if (!currentGraph.mains[nearestMainId].neighbors.includes(source.id)) {
          currentGraph.mains[nearestMainId].neighbors.push(source.id);
        }
      }

      updated = true;
    }
  });

  if (updated) graph.set(currentGraph);
}

export function getMarkerLayerGroup() { return markerLayerGroup; }

export function sublines(graph) {
  // TODO: Implement sublines function to update connections
  // Probably connects locs to mains or updates neighbors
}

export function updateInspect(data) {
  if (!data) return;

  const nameEl = document.getElementById('name');
  const idEl = document.getElementById('id');
  const priorityInput = document.getElementById('priority-input');
  const storeInput = document.getElementById('store-input');
  const prodInput = document.getElementById('prod-input');
  const demInput = document.getElementById('dem-input');
  const neighboursEl = document.getElementById('neighbours');
  const posEl = document.getElementById('pos');

  if (nameEl) nameEl.textContent = data.name || `ID: ${data.id}`;
  if (idEl) idEl.textContent = data.id;
  if (priorityInput) priorityInput.value = data.priority || 1;
  if (storeInput) storeInput.value = data.store || 0;
  if (prodInput) prodInput.value = data.prod || 0;
  if (demInput) demInput.value = data.dem || 0;
  if (neighboursEl) neighboursEl.textContent = data.neighbors ? data.neighbors.join(', ') : '';
  if (posEl) posEl.textContent = data.pos || `${data.lat}, ${data.lng}`;
}
