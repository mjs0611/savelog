import os
import glob
from rembg import remove
from PIL import Image

def process_images():
    image_dir = 'public/images'
    icon_files = glob.glob(os.path.join(image_dir, 'icon_*.png'))
    mbti_files = glob.glob(os.path.join(image_dir, 'mbti_*.png'))
    main_char = [os.path.join(image_dir, 'savelog_main_character.png')]
    all_files = icon_files + mbti_files + main_char
    
    print(f"Found {len(all_files)} images to process.")
    for file_path in all_files:
        try:
            print(f"Processing {file_path}...")
            with open(file_path, 'rb') as i:
                input_data = i.read()
                
            output_data = remove(input_data)
            
            with open(file_path, 'wb') as o:
                o.write(output_data)
                
            print(f"Successfully removed background for {file_path}")
        except Exception as e:
            print(f"Error processing {file_path}: {e}")

if __name__ == "__main__":
    process_images()
