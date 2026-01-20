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
  await import('leaflet.markercluster/dist/MarkerCluster.css');
  await import('leaflet.markercluster/dist/MarkerCluster.Default.css');
  const markerCluster = await import('leaflet.markercluster');

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
<<<<<<< HEAD
      style: { color: 'black', weight: 1, fillOpacity: 0.5, fillColor: '#00ff88' },
      pointToLayer: (feature, latlng) => {
        return L.circleMarker(latlng, {
          color: 'black',
          fillColor: '#3388ff',
          fillOpacity: 0.8,
          radius: 8
        });
      },
=======
      style: (feature) => ({
        color: '#00ccff',
        weight: 1,
        fillOpacity: 0.3,
        fillColor: feature.properties.prod > feature.properties.dem ? '#00ffa2' : '#ff4444'
      }),
>>>>>>> ae48445e04c5d3420bb1d5091221a752dfa04d54
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
    });

    // Create cluster group and add layer to it
    const markers = L.markerClusterGroup();
    markers.addLayer(layer);
    map.addLayer(markers);

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
        prod: source.renewable ? parseInt(Math.random() * (100 - 10) + 10) : 2000, // High production for stations
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

export function sublines(graphData) {
  const locs = Object.values(graphData.loc);
  locs.forEach(loc => {
    loc.neighbors = [];
    const others = locs.filter(l => l.id !== loc.id);
    others.sort((a, b) => {
      const d1 = Math.sqrt(Math.pow(loc.lat - a.lat, 2) + Math.pow(loc.lng - a.lng, 2));
      const d2 = Math.sqrt(Math.pow(loc.lat - b.lat, 2) + Math.pow(loc.lng - b.lng, 2));
      return d1 - d2;
    });
    loc.neighbors = others.slice(0, 3).map(o => o.id); // top 3 nearest
  });
  graph.set(graphData); // update store
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
