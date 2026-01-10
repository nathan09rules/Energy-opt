// map.js
import { writable } from 'svelte/store';

export let map, Light, Dark, layer, active, darkMode = false, debug = false;
export const activeData = writable(null);
let manualLayerGroup;

export async function initMap(containerId, geojsonUrl) {
  // browser-only import
  const L = (await import('leaflet')).default;
  await import('leaflet/dist/leaflet.css');

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

  // Initialize manual layer group
  manualLayerGroup = L.layerGroup().addTo(map);

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
}


// Manual Graph Logic
export function draw(map, nodes) {
  // Ensure the layer group exists
  if (!manualLayerGroup) {
    manualLayerGroup = L.layerGroup().addTo(map);
  }

  // Clear existing manual layers to redraw
  manualLayerGroup.clearLayers();

  // Draw all nodes and edges from current nodes array
  nodes.forEach((node, index) => {
    // Draw Node
    const marker = L.circleMarker([node.lat, node.lng], {
      radius: 6,
      color: "red",
      fillColor: "blue",
      fillOpacity: 0.8,
    }).addTo(manualLayerGroup);

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
      ).addTo(manualLayerGroup);
    }

    // Also draw explicit neighbors if any
    node.neighbors.forEach(neighborId => {
      const neighbor = nodes.find(n => n.id === neighborId);
      if (neighbor) {
        L.polyline(
          [[node.lat, node.lng], [neighbor.lat, neighbor.lng]],
          { color: "red", weight: 3 }
        ).addTo(manualLayerGroup);
      }
    });
  });
}

export function place(map, nodes, lat, lng, neighbors) {
  const id = nodes.length;
  const vert = { id, lat, lng, neighbors };
  const range = 0.0001;

  const exists = nodes.find(
    (n) =>
      Math.abs(n.lat - vert.lat) <= range &&
      Math.abs(n.lng - vert.lng) <= range,
  );

  if (exists) {
    exists.neighbors.push(id);
    vert.neighbors.push(exists.id);
    nodes.push(vert);
  } else {
    nodes.push(vert);
  }

  return nodes;
  draw(map, nodes);
}
