import os
import argparse
import pandas as pd
import re

# Mapping for dialects and levels
DIALECT_MAP = {
    'Si': '四', 'Hai': '海', 'Da': '大', 'Rao': '平', 'Zhao': '安'
}

LEVEL_MAP = {
    'Basic': '基',
    'Elem': '初',
    'Inter': '中',
    'InterUpper': '中高',
    'Adv': '高'
}

def convert_filename(filename):
    """
    Converts English filename to Chinese format based on mappings.
    Example: 114_Basic_Vocab_Si.ods -> 114四基.csv
    Example: 113_Adv_Vocab_Zhao.ods -> 113安高.csv
    """
    name, ext = os.path.splitext(filename)
    
    # Extract year
    year_match = re.match(r'^(\d+)_', name)
    if not year_match:
        return None
    year = year_match.group(1)
    
    # Extract Level
    level = None
    for eng, chi in LEVEL_MAP.items():
        if f"_{eng}_" in name:
            level = chi
            break
    if not level:
        return None

    # Extract Dialect
    dialect = None
    for eng, chi in DIALECT_MAP.items():
        if f"_{eng}" in name: # Match suffix or _Si_
            dialect = chi
            break
    if not dialect:
        return None
        
    return f"{year}{dialect}{level}.csv"

def convert_ods_to_csv(input_dir, output_dir):
    if not os.path.exists(output_dir):
        os.makedirs(output_dir)
        
    total = 0
    converted = 0
    errors = 0
    
    for filename in os.listdir(input_dir):
        if not filename.endswith(".ods") or filename.startswith("~$"):
            continue
            
        total += 1
        input_path = os.path.join(input_dir, filename)
        new_filename = convert_filename(filename)
        
        if not new_filename:
            print(f"⚠️  Skipping {filename}: Could not map filename pattern.")
            continue
            
        output_path = os.path.join(output_dir, new_filename)
        print(f"Converting {filename} -> {new_filename}...")
        
        try:
            # Read ODS file
            df = pd.read_excel(input_path, engine="odf")
            
            # Save as CSV
            df.to_csv(output_path, index=False, encoding="utf-8")
            converted += 1
            print(f"✅ Saved to {output_path}")
            
        except Exception as e:
            print(f"❌ Error converting {filename}: {e}")
            errors += 1
            
    print(f"\n--- Conversion Summary ---")
    print(f"Total ODS files found: {total}")
    print(f"Successfully converted: {converted}")
    print(f"Errors: {errors}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Convert Hakka ODS files to CSV with renaming.")
    parser.add_argument("--input", required=True, help="Input directory containing ODS files")
    parser.add_argument("--output", required=True, help="Output directory for CSV files")
    
    args = parser.parse_args()
    
    convert_ods_to_csv(args.input, args.output)
