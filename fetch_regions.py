import requests
import json
import random

def fetch_and_filter_regions():
    # A reliable source for country boundaries
    url = "https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson"
    
    print(f"Fetching data from {url}...")
    try:
        response = requests.get(url)
        response.raise_for_status()
        data = response.json()
    except Exception as e:
        print(f"Error fetching data: {e}")
        return

    # Middle East country names and codes to be safe
    middle_east_iso3 = {
        'ARE', 'BHR', 'CYP', 'EGY', 'IRN', 'IRQ', 'ISR', 'JOR', 
        'KWT', 'LBN', 'OMN', 'PSE', 'QAT', 'SAU', 'SYR', 'TUR', 'YEM'
    }
    
    # Common keys for ISO3 in various GeoJSON datasets
    iso3_keys = ['ISO3166-1-Alpha-3', 'iso_a3', 'iso3', 'GU_A3', 'ADM0_A3']

    filtered_features = []
    
    for feature in data.get('features', []):
        properties = feature.get('properties', {})
        
        # Try to find the ISO3 code using various common keys
        iso3 = None
        for key in iso3_keys:
            if properties.get(key):
                iso3 = properties.get(key).upper()
                break
        
        if iso3 in middle_east_iso3:
            # Add some mock energy data
            properties['prod'] = random.randint(100, 1000)
            properties['dem'] = random.randint(100, 1000)
            properties['store'] = random.randint(50, 500)
            properties['id'] = iso3.lower()
            
            feature['properties'] = properties
            filtered_features.append(feature)

    if not filtered_features:
        print("Warning: No regions matched the filtering criteria. Printing properties of first 5 features for debugging:")
        for feat in data.get('features', [])[:5]:
            print(json.dumps(feat.get('properties'), indent=2))

    output_geojson = {
        "type": "FeatureCollection",
        "features": filtered_features
    }

    output_path = "static/regions.geojson"
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(output_geojson, f, indent=2)
    
    print(f"Successfully saved {len(filtered_features)} Middle East regions to {output_path}")

if __name__ == "__main__":
    fetch_and_filter_regions()
