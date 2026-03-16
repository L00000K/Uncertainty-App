import xml.etree.ElementTree as ET
import sys
from collections import Counter

def parse_ghx(filepath):
    print(f"Parsing {filepath}...")
    try:
        tree = ET.parse(filepath)
        root = tree.getroot()
        
        chunk_names = []
        descriptions = []
        panels = []
        
        for item in root.iter('item'):
            name = item.attrib.get('name')
            if name == 'Name':
                chunk_names.append(item.text)
            elif name == 'Description':
                descriptions.append(item.text)
            elif name == 'UserText':
                panels.append(item.text)

        print("\n--- Component Types (Top 20) ---")
        for k, v in Counter(chunk_names).most_common(20):
            print(f"{k}: {v}")
            
        print("\n--- Panels (User Text) ---")
        for i, text in enumerate(panels):
            if text and text.strip():
                print(f"Panel {i}: {text.strip()}")
                
    except Exception as e:
        print(f"Error parsing file: {e}")

if __name__ == '__main__':
    parse_ghx(sys.argv[1])
