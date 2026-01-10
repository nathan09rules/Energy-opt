// map.js
import { latLng } from 'leaflet';
import { writable } from 'svelte/store';


export let map, Light, Dark, layer, active, darkMode = false, debug = false, graph;
export const activeData = writable(null);

export async function initMap(containerId, geojsonUrl) {
  // browser-only import
  L = (await import('leaflet')).default;

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
  graph = L.layerGroup();

  // Fetch GeoJSON
  const res = await fetch(geojsonUrl);
  const geojson = await res.json();

  layer = L.geoJSON(geojson, {
    style: { color: 'black', weight: 1, fillOpacity: 0.5, fillColor: 'red' },

    //click thing
    onEachFeature: (feature, lyr) => {
      lyr.on('click', () => {
        lyr.setStyle({ fillColor: 'green' });

        if (active) active.setStyle({ fillColor: darkMode ? 'orange' : 'red' });
        active = lyr;
        activeData.set(feature);

        function setText(id, value, fallback = "Null") {
          const el = document.getElementById(id);
          if (el) el.innerText = value ?? fallback;
        }

        const props = feature.properties || {};

        setText("name", props.name, "Click on a tile");
        setText("priority", `Priority: ${props.priority}`);
        setText("store", `Store: ${props.store}`);
        setText("prod", `Prod: ${props.prod}`);
        setText("dem", `Dem: ${props.dem}`);
        setText("pos", `${props.pos}`);


      });
    
      //L.circleMarker(latLng(feature.pos[0] , feature.pos[1] , 0)).addTo(graph);
    }
  }).addTo(map);

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
    if (graph) graph.addTo(map);
  } else {
    if (graph) graph.remove();
  }
}


//--MARKER FUNCTIONS--//
export function addMarker(lat, lng, options = {}) {
  const marker = L.circleMarker([lat, lng], {
    radius: options.radius || 8,
    color: options.color || 'blue',
    fillColor: options.fillColor || 'blue',
    fillOpacity: options.fillOpacity || 0.8,
    ...options
  }).addTo(markerLayerGroup);
  
  if (options.popup) {
    marker.bindPopup(options.popup);
  }
  
  return marker;
}

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


// Manual Graph Logic
export function draw(map, graphMain) {
  // Ensure the layer group exists
  if (!graph) {
    graph = L.layerGroup();
  }

  // Clear existing manual layers to redraw
  graph.clearLayers();

  // Get nodes as array
  const nodes = Object.values(graphMain);

  // Draw all nodes and edges from current nodes array
  nodes.forEach((node, index) => {
    // Draw Node
    const marker = L.circleMarker([node.lat, node.lng], {
      radius: 6,
      color: "red",
      fillColor: "blue",
    }).addTo(graph);

    marker.on('click', () => {
      console.log('Node clicked:', node);
    });

    // Draw Edges (to neighbors or previous node based on original logic)
    if (index > 0) {
      const prevNode = nodes[index - 1];
      L.polyline(
        [
          [node.lat, node.lng],
          [prevNode.lat, prevNode.lng],
        ],
        { color: "red", weight: 3 },
      ).addTo(graph);
    }

    // Also draw explicit neighbors if any
    if (Array.isArray(node.neighbors)) {
      node.neighbors.forEach(neighborId => {
        const neighbor = graphMain[neighborId];
        if (neighbor) {
          L.polyline(
            [[node.lat, node.lng], [neighbor.lat, neighbor.lng]],
            { color: "red", weight: 3 }
          ).addTo(graph);
        }
      });
    }
  });
}

export function place(map, graphMain, lat, lng, neighbors) {
  const id = Object.keys(graphMain).length;
  
  // Normalize neighbors to an array
  let neighborIds = [];
  if (Array.isArray(neighbors)) {
    neighborIds = [...neighbors];
  } else if (neighbors && typeof neighbors === 'object' && neighbors.id !== undefined) {
    neighborIds = [neighbors.id];
  }
  
  const vert = { id, lat, lng, neighbors: neighborIds };
  const range = 0.0001;

  const exists = Object.values(graphMain).find(
    (n) =>
      Math.abs(n.lat - vert.lat) <= range &&
      Math.abs(n.lng - vert.lng) <= range,
  );

  if (exists) {
    if (!Array.isArray(exists.neighbors)) {
      exists.neighbors = [];
    }
    exists.neighbors.push(id);
    vert.neighbors.push(exists.id);
    graphMain[id] = vert;
  } else {
    graphMain[id] = vert;
  }

  return graphMain;
}
