// map.js
export let map, Light, Dark, layer, active, darkMode = false, debug = false;
let manualLayerGroup;
let clickHandler;
let currentNodes;

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
    onEachFeature: (feature, lyr) => {
      lyr.on('click', () => {
        lyr.setStyle({ fillColor: 'green' });

        if (active) active.setStyle({ fillColor: darkMode ? 'orange' : 'red' });
        active = lyr;

        const name = feature.properties.BASE_BBL || 'Unknown';
        const nameEl = document.getElementById('name');
        if (nameEl) nameEl.innerText = name;
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
export function ManualGraph(L, map, nodes, onNodeAdded) {
  if (!map) return { map, nodes };
  currentNodes = nodes;

  // 1. Ensure the layer group exists
  if (!manualLayerGroup) {
    manualLayerGroup = L.layerGroup().addTo(map);
  }

  // 2. Clear existing manual layers to redraw
  manualLayerGroup.clearLayers();

  // 3. Setup click listener once
  if (!clickHandler) {
    clickHandler = (e) => {
      const id = currentNodes.length;
      const vert = { id, lat: e.latlng.lat, lng: e.latlng.lng, neighbors: [] };
      const range = 0.0001;

      const exists = currentNodes.find(
        (n) =>
          Math.abs(n.lat - vert.lat) <= range &&
          Math.abs(n.lng - vert.lng) <= range,
      );

      if (exists) {
        exists.neighbors.push(id);
        vert.neighbors.push(exists.id);
        currentNodes.push(vert);
      } else {
        currentNodes.push(vert);
      }

      if (onNodeAdded) onNodeAdded([...currentNodes]);
      // Redraw after addition
      ManualGraph(L, map, currentNodes);
    };
    map.on("click", clickHandler);
  }

  // 4. Redraw all nodes and edges from current nodes array
  nodes.forEach((node, index) => {
    // Draw Node
    L.circleMarker([node.lat, node.lng], {
      radius: 6,
      color: "red",
      fillColor: "blue",
      fillOpacity: 0.8,
    }).addTo(manualLayerGroup);

    // Draw Edges (to neighbors or previous node based on original logic)
    // Original logic: if (id !== 0) drawEdge(L, vert, nodes[id - 1]);
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

  return { map, nodes };
}
