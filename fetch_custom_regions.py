import requests
import json
import random

def fetch_data():
    endpoints = [
        "https://overpass-api.de/api/interpreter",
        "https://overpass.kumi.systems/api/interpreter",
        "https://maps.mail.ru/osm/tools/overpass/api/interpreter"
    ]
    
    # More reliable query using areas
    query = """
    [out:json][timeout:90];
    area["name:en"="United Arab Emirates"]->.uae;
    (
      // Level 6 for UAE (Al Ain etc)
      rel(area.uae)["admin_level"="6"]["boundary"="administrative"];
      
      // Major Emergency in UAE
      node(area.uae)["amenity"~"hospital|police"];
      
      // Major Power in UAE
      node(area.uae)["power"="plant"];
    );
    out center body;
    """
    
    data = None
    for url in endpoints:
        print(f"Trying Overpass endpoint: {url}...")
        try:
            response = requests.post(url, data={'data': query}, timeout=100)
            response.raise_for_status()
            data = response.json()
            if data and 'elements' in data and len(data['elements']) > 0:
                print(f"Successfully fetched data from {url}")
                break
        except Exception as e:
            print(f"Endpoint {url} failed: {e}")
            continue

    if not data:
        print("All Overpass endpoints failed or returned no data.")
        return

    features = []
    
    for el in data.get('elements', []):
        props = {}
        tags = el.get('tags', {})
        
        # Determine type
        if 'admin_level' in tags:
            etype = 'region'
            name = tags.get('name:en') or tags.get('name') or "Unnamed District"
        elif tags.get('amenity') in ['hospital', 'police', 'fire_station']:
            etype = 'emergency'
            name = tags.get('name:en') or tags.get('name') or f"Emergency ({tags.get('amenity')})"
        elif tags.get('power') in ['plant', 'substation']:
            etype = 'power'
            name = tags.get('name:en') or tags.get('name') or f"Power ({tags.get('power')})"
        else:
            continue

        # Map to common properties expected by the app
        props['name'] = name
        props['type'] = etype
        props['osm_id'] = el.get('id')
        props['country'] = tags.get('ISO3166-1') or tags.get('addr:country', 'Unknown')
        
        # Random mock data
        if etype == 'region':
            props['prod'] = random.randint(50, 500)
            props['dem'] = random.randint(100, 800)
            props['store'] = random.randint(20, 1000)
            props['priority'] = random.randint(1, 5)
        elif etype == 'emergency':
            props['prod'] = 0
            props['dem'] = random.randint(200, 1000)
            props['store'] = random.randint(100, 500)
            props['priority'] = 1
        elif etype == 'power':
            props['prod'] = random.randint(5000, 20000)
            props['dem'] = 0
            props['store'] = random.randint(2000, 10000)
            props['priority'] = 1

        lat = el.get('lat') or (el.get('center', {}).get('lat'))
        lon = el.get('lon') or (el.get('center', {}).get('lon'))
        
        if lat is None or lon is None:
            continue
            
        # Format as expected by map.js parse logic: "[lng,lat]"
        # map.js: const coords = props.pos.slice(1, -1).split(',').map(Number);
        props['pos'] = f"[{lon},{lat}]"
        props['lat'] = lat
        props['lng'] = lon

        # Create GeoJSON Feature
        # For simplicity in this demo, treat everything as Points (markers) as requested
        # "add to regions.geojson as markers only as we only need pos of eme service"
        # However, for regions, the app might want boundaries. 
        # But the user said "markers only" for emergency services.
        
        feature = {
            "type": "Feature",
            "properties": props,
            "geometry": {
                "type": "Point",
                "coordinates": [lon, lat]
            }
        }
        features.append(feature)

    output_geojson = {
        "type": "FeatureCollection",
        "features": features
    }

    output_path = "static/regions.geojson"
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(output_geojson, f, indent=2)
    
    print(f"Successfully saved {len(features)} elements (districts, emergency services, power) to {output_path}")

if __name__ == "__main__":
    fetch_data()
