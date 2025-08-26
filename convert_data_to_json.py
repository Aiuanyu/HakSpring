
import os
import re
import json
import glob

def convert_js_to_json():
    base_dir = os.getcwd()
    
    # Process only the files that are left
    js_files_to_process = [
        os.path.join(base_dir, 'tone_mapping_data.js'),
        os.path.join(base_dir, 'NAmedias.js'),
        os.path.join(base_dir, 'exclusions.js')
    ]

    print(f'Attempting to convert {len(js_files_to_process)} special files...\n')

    for js_path in js_files_to_process:
        if not os.path.exists(js_path):
            print(f"File not found: {js_path}, skipping.")
            continue

        filename = os.path.basename(js_path)
        print(f'Processing: {js_path}')
        try:
            with open(js_path, 'r', encoding='utf-8') as f:
                content = f.read()

            json_data = None
            new_filename = filename.replace('.js', '.json')

            if filename == 'exclusions.js':
                json_data = {}
                var_patterns = ['基例外音檔', '初例外音檔', '中例外音檔', '中高例外音檔', '高例外音檔']
                for var_name in var_patterns:
                    match = re.search(rf"const\s+{var_name}\s*=\s*(\[[\s\S]*?\]);", content)
                    if match:
                        array_str = match.group(1)
                        json_data[var_name] = json.loads(array_str)
                if not json_data: json_data = None

            elif filename == 'tone_mapping_data.js':
                match = re.search(r'const\s+toneMappingData\s*=\s*(\{[\s\S]*?\});', content)
                if match:
                    json_data = json.loads(match.group(1))

            elif filename == 'NAmedias.js':
                match = re.search(r'const\s+missingAudioData\s*=\s*(\{[\s\S]*?\});', content)
                if match:
                    object_str = match.group(1)
                    # Fix single quotes and unquoted keys
                    json_str = object_str.replace("'", '"')
                    json_str = re.sub(r'([{\s,])([a-zA-Z0-9_]+)(\s*:)', r'\1"\2"\3', json_str)
                    # Remove trailing commas
                    json_str = re.sub(r',(\s*[}\]])', r'\1', json_str)
                    json_data = json.loads(json_str)

            if json_data is not None:
                directory = os.path.dirname(js_path)
                json_path = os.path.join(directory, new_filename)
                with open(json_path, 'w', encoding='utf-8') as f:
                    json.dump(json_data, f, ensure_ascii=False, indent=2)
                print(f'  -> Successfully created: {json_path}')
                os.remove(js_path)
                print(f'  -> Removed old file: {js_path}')
            else:
                print(f'  -> SKIPPED: Could not find a matching data pattern in {filename}')
        
        except Exception as e:
            print(f'  -> ERROR: An unexpected error occurred while processing {js_path}: {e}')
        print('---')

    print('\nConversion process complete.')

if __name__ == '__main__':
    convert_js_to_json()
