import os
import argparse
import pandas as pd

def load_csv_as_set(file_path):
    """
    Loads a CSV and returns a set of unique identifiers or content hashes.
    Assumes '編號' (ID) is the unique key.
    Returns: dictionary {id: row_content_string}
    """
    try:
        # Force all columns to be strings to avoid type issues
        df = pd.read_csv(file_path, dtype=str)
        # Fill NA with empty string
        df = df.fillna("")
        # Normalize: basic strip strings
        df = df.apply(lambda x: x.str.strip())
        
        # Normalize headers
        if '編碼' in df.columns:
            df.rename(columns={'編碼': '編號'}, inplace=True)
            
        # Drop Unnamed columns
        df = df.loc[:, ~df.columns.str.contains('^Unnamed')]

        data_map = {}
        if '編號' in df.columns:
            for _, row in df.iterrows():
                # specific content to compare (excluding ID itself)
                # Concatenate all values to detect ANY change
                content_list = row.tolist()
                content_str = "|".join(content_list)
                data_map[row['編號']] = content_str
        return data_map
    except Exception as e:
        print(f"Error loading {file_path}: {e}")
        return {}

def compare_folders(old_dir, new_dir):
    old_files = {f: os.path.join(old_dir, f) for f in os.listdir(old_dir) if f.endswith('.csv')}
    new_files = {f: os.path.join(new_dir, f) for f in os.listdir(new_dir) if f.endswith('.csv')}
    
    # Match files by mapping 113 and 114 names
    # Assuming names like 113四基.csv and 114四基.csv
    # We match by suffix "四基.csv"
    
    comparisons = []
    
    for new_file in new_files:
        suffix = new_file[3:] # Remove "114"
        old_file_match = f"113{suffix}"
        
        if old_file_match in old_files:
            comparisons.append((old_files[old_file_match], new_files[new_file], suffix))
        else:
            print(f"⚠️  No matching old file for {new_file}")

    print(f"\n{'='*60}")
    print(f"{'FILE (Suffix)':<15} | {'NEW':<6} | {'MOD':<6} | {'DEL':<6} | {'TOTAL':<6} | {'RATIO':<6}")
    print(f"{'-'*60}")
    
    total_new = 0
    total_mod = 0
    
    for old_path, new_path, suffix in comparisons:
        old_data = load_csv_as_set(old_path)
        new_data = load_csv_as_set(new_path)
        
        old_ids = set(old_data.keys())
        new_ids = set(new_data.keys())
        
        # Added IDs
        added = new_ids - old_ids
        # Deleted IDs
        deleted = old_ids - new_ids
        # Modified content (same ID, different content)
        common_ids = old_ids & new_ids
        modified = {uid for uid in common_ids if old_data[uid] != new_data[uid]}
        
        # Sort of Ratio: (Added + Modified) / New Total
        count_new = len(new_ids)
        if count_new > 0:
            ratio = (len(added) + len(modified)) / count_new
        else:
            ratio = 0
            
        print(f"{suffix:<15} | {len(added):<6} | {len(modified):<6} | {len(deleted):<6} | {count_new:<6} | {ratio:.1%}")
        
        total_new += len(added)
        total_mod += len(modified)
        
    print(f"{'='*60}")
    print(f"Total Added Entries: {total_new}")
    print(f"Total Modified Entries: {total_mod}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Compare 113 and 114 Hakka CSV data.")
    parser.add_argument("--old", required=True, help="Directory containing old CSVs (113)")
    parser.add_argument("--new", required=True, help="Directory containing new CSVs (114)")
    
    args = parser.parse_args()
    
    compare_folders(args.old, args.new)
