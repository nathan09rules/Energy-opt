// map.js
import { graph, activeData, activeModel, powerSources } from './stores.js';
import { get, writable } from 'svelte/store';
import { CONFIGS } from './configs.js';

export let map, Light, Dark, layer, markerLayerGroup;
export let darkMode = writable(false); // Default to LIGHT mode for better visibility

let L;
let graphLayer;

export async function initMap(containerId, geojsonUrl) {
  L = window.L || (await import('leaflet')).default;

  map = L.map(containerId, { zoomControl: false });

  Light = L.tileLayer('https://{s}.tile.osm.org/{z}/{x}/{y}.png').addTo(map);
  Dark = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png');

  graphLayer = L.layerGroup().addTo(map);
  markerLayerGroup = L.layerGroup().addTo(map);

  const res = await fetch(geojsonUrl);
  const geojson = await res.json();

  let nextId = 1000;

  layer = L.geoJSON(geojson, {
    style: { color: 'black', weight: 1, fillOpacity: 0.5, fillColor: '#00ff88' },
    onEachFeature: (feature, lyr) => {
      const id = nextId++;
      const props = { ...feature.properties, id, type: 'loc', neighbors: [] };

      const coords = props.pos.slice(1, -1).split(',').map(Number);
      props.lat = coords[1];
      props.lng = coords[0];

      lyr.feature.properties = props;

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
  document.documentElement.setAttribute('data-theme', 'light');

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

export function syncPowerSources() {
  const sources = get(powerSources);
  const currentGraph = get(graph);
  let updated = false;

  sources.forEach(source => {
    if (!currentGraph.loc[source.id]) {
      currentGraph.loc[source.id] = {
        ...source,
        prod: 2000,
        dem: 0,
        priority: 1,
        store: 500,
        neighbors: [],
        type: 'loc'
      };
      updated = true;
    }
  });

  if (updated) graph.set(currentGraph);
}
