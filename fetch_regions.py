import requests
import json
import random
import time

def fetch_and_filter_all_data():
    # 1. Fetch Districts from Natural Earth (Admin 1)
    districts_url = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_1_states_provinces.geojson"
    me_iso3 = {
        'ARE', 'BHR', 'CYP', 'EGY', 'IRN', 'IRQ', 'ISR', 'JOR', 
        'KWT', 'LBN', 'OMN', 'PSE', 'QAT', 'SAU', 'SYR', 'TUR', 'YEM'
    }
    
    print("Connecting to Natural Earth database for districts...")
    try:
        response = requests.get(districts_url, timeout=30)
        response.raise_for_status()
        districts_data = response.json()
    except Exception as e:
        print(f"Error fetching districts: {e}")
        return

    filtered_features = []
    
    for feature in districts_data.get('features', []):
        props = feature.get('properties', {})
        iso_code = props.get('adm0_a3')
        if iso_code in me_iso3:
            clean_props = {
                "id": f"dist_{props.get('gn_id') or random.randint(1000, 9999)}",
                "name": props.get('name_en') or props.get('name'),
                "country": props.get('admin'),
                "type": "region",
                "prod": random.randint(100, 1000),
                "dem": random.randint(100, 1000),
                "store": random.randint(50, 500),
                "priority": random.randint(2, 5)
            }
            feature['properties'] = clean_props
            filtered_features.append(feature)

    # 2. Fetch Emergency Services & Power from Overpass (Points)
    overpass_endpoints = [
        "https://overpass-api.de/api/interpreter",
        "https://overpass.kumi.systems/api/interpreter"
    ]
    
    query = """
    [out:json][timeout:60];
    area["name:en"="United Arab Emirates"]->.uae;
    (
      node(area.uae)["amenity"~"hospital|police"];
      node(area.uae)["power"="plant"];
    );
    out body;
    """
    
    poi_features = []
    for url in overpass_endpoints:
        print(f"Fetching POIs from Overpass: {url}...")
        try:
            res = requests.post(url, data={'data': query}, timeout=40)
            if res.ok:
                poi_data = res.json()
                for el in poi_data.get('elements', []):
                    tags = el.get('tags', {})
                    etype = 'emergency' if 'amenity' in tags else 'power'
                    name = tags.get('name:en') or tags.get('name') or f"{etype.capitalize()}"
                    
                    feat = {
                        "type": "Feature",
                        "properties": {
                            "id": f"poi_{el['id']}",
                            "name": name,
                            "type": etype,
                            "prod": 0 if etype == 'emergency' else random.randint(5000, 10000),
                            "dem": random.randint(500, 1000) if etype == 'emergency' else 0,
                            "store": random.randint(200, 1000),
                            "priority": 1,
                            "pos": f"[{el['lon']},{el['lat']}]"
                        },
                        "geometry": {
                            "type": "Point",
                            "coordinates": [el['lon'], el['lat']]
                        }
                    }
                    poi_features.append(feat)
                break
        except Exception as e:
            print(f"Overpass error: {e}")
            continue

    all_features = filtered_features + poi_features
    print(f"Total Elements: Districts={len(filtered_features)}, POIs={len(poi_features)}")

    output_geojson = {
        "type": "FeatureCollection",
        "features": all_features
    }

    output_path = "static/regions.geojson"
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(output_geojson, f, separators=(',', ':'))
    
    print(f"Saved successfully to: {output_path}")

if __name__ == "__main__":
    fetch_and_filter_all_data()