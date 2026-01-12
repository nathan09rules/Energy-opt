// map.js
import { activeData, activeModel, graph } from './stores.js';
import { get } from 'svelte/store';
import { CONFIGS } from './configs.js';
export let map, Light, Dark, layer, markerLayerGroup;
export let darkMode = false;
let L; // Leaflet instance
let graphLayer; // Layer for graph nodes (mains)

export async function initMap(containerId, geojsonUrl, leafletInstance) {
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

  graphLayer = L.layerGroup().addTo(map);
  markerLayerGroup = L.layerGroup().addTo(map);

  const res = await fetch(geojsonUrl);
  const geojson = await res.json();

  let activeFeatureLayer = null;
  let temp = {};

  layer = L.geoJSON(geojson, {
    style: { color: 'black', weight: 1, fillOpacity: 0.5, fillColor: 'green' },
    onEachFeature: (feature, lyr) => {
      const props = feature.properties
      temp[props.name] = feature.properties;
      try {
        const coords = props.pos.slice(1, -1).split(',').map(Number);
        if (coords.length === 2 && !isNaN(coords[0]) && !isNaN(coords[1])) {
          temp[props.name].lat = coords[1];
          temp[props.name].lng = coords[0];
        }
      } catch (e) { console.warn("Error parsing pos for lat lng", props.pos); }

      //VISULAS
      if (feature.properties.prod < feature.properties.dem) {
        lyr.setStyle({fillColor: "red"});
      }

      //CLICKING
      lyr.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        lyr.setStyle({ fillColor: 'blue' });

        if (activeFeatureLayer) {
          const prevProps = activeFeatureLayer.feature.properties;
          const prevColor = (prevProps.prod - prevProps.dem < 0) ? 'red' : 'green';
          activeFeatureLayer.setStyle({ fillColor: prevColor });
        }
        activeFeatureLayer = lyr;

        // Update store
        activeData.set(feature);
        updateInspect(props);
      });

      // Show small markers for existing points? This corresponds to original logic line 61
      try {
        const coords = props.pos.slice(1, -1).split(',').map(Number);
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

  sublines(graph);

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
    const props = lyr.feature.properties;
    const baseColor = (props.prod - props.dem < 0) ? 'red' : 'green';
    lyr.setStyle({
      fillColor: baseColor,
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

export function getL() { return L; }
export function getGraphLayer() { return graphLayer; }
export function getMarkerLayerGroup() { return markerLayerGroup; }

function updateInspect(props) {
  function setText(id, value, fallback = "") {
    const el = document.getElementById(id);
    if (el) el.innerText = value ?? fallback;
  }
  setText("name", props.name || props.id || "Click on a tile");
  setText("priority", props.priority ? `Priority: ${props.priority}` : "");
  setText("store", props.store ? `Store: ${props.store}` : "");
  setText("prod", props.prod ? `Prod: ${props.prod}` : "");
  setText("dem", props.dem ? `Dem: ${props.dem}` : "");
  setText("pos", props.pos || "");
}

export { updateInspect };


export function sublines(graph) {
  let graphData = get(graph);
  //let mains = graphData.mains;
  //let loc = graphData.loc;
  let chunks = {};
  let mains_pos = [];

  for (let loc of Object.values(graphData.loc)) {
    const x = Math.floor(loc.lat / 10);
    const y = Math.floor(loc.lng / 10);

    chunks[x] ??= {};
    chunks[x][y] ??= [];
    chunks[x][y].push(loc);
  }

  for (let house of Object.values(graphData.loc)) {
    let closest = 100000000;
    let closestMain = null;
    for (let main of Object.values(graphData.mains)) {
      const dist = distance(house.lat - main.lat, house.lng - main.lng);
      if (dist < closest) {
        closest = dist;
        closestMain = main;
      }
    }

    let loc_closest = 100000000;
    let closestLoc = null;
    for (let other of chunks[Math.floor(house.lat / 10)][Math.floor(house.lng / 10)]) {

      if (other.name !== house.name && !other.neighbors?.includes(house.name) && other.neighbors?.length < CONFIGS['max neighbors']) {
        const to_main = distance(closestMain.lat - other.lat, closestMain.lng - other.lng);
        const to_loc = distance(other.lat - house.lat, other.lng - house.lng);
        const dist = to_main * CONFIGS['closest main weight'] + to_loc;
        if (dist < loc_closest) {
          loc_closest = dist;
          closestLoc = other;
        }
      }
    }

    if (!house.neighbors) house.neighbors = [];
    if ((closest * CONFIGS['main resistance']) < (loc_closest * CONFIGS['location resistance'])) {
      // export this closest main as neighbour
      if (closestMain && !house.neighbors.includes(closestMain.id)) {
        house.neighbors.push(closestMain.id);
      }
    } else {
      // export this closest loc as neighbour
      if (closestLoc && !house.neighbors.includes(closestLoc.name)) {
        house.neighbors.push(closestLoc.name);
      }
    }
  }

  // Update the store
  graph.update(g => ({ ...g, loc: graphData.loc }));
}


function distance(x, y) {
  return Math.sqrt(x * x + y * y);
}
