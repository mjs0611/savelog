import os
from PIL import Image

def remove_background_floodfill(src_path, dest_path, tolerance=15):
    if not os.path.exists(src_path):
        print(f"Source file not found: {src_path}")
        return
        
    img = Image.open(src_path).convert("RGBA")
    width, height = img.size
    data = img.load()
    
    # Target color: pure white or near white at corner (0,0)
    bg_color = data[0, 0]
    
    # We will use BFS flood-fill to find all connected background pixels
    visited = [[False] * height for _ in range(width)]
    queue = []
    
    # Seed queue with all four corners
    corners = [(0, 0), (width - 1, 0), (0, height - 1), (width - 1, height - 1)]
    for x, y in corners:
        queue.append((x, y))
        visited[x][y] = True
        
    def is_similar(c1, c2, tol):
        # Compare RGB values
        return (abs(c1[0] - c2[0]) <= tol and 
                abs(c1[1] - c2[1]) <= tol and 
                abs(c1[2] - c2[2]) <= tol)
                
    # BFS
    while queue:
        cx, cy = queue.pop(0)
        
        # Make transparent
        data[cx, cy] = (0, 0, 0, 0)
        
        for dx, dy in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
            nx, ny = cx + dx, cy + dy
            if 0 <= nx < width and 0 <= ny < height:
                if not visited[nx][ny]:
                    color = data[nx, ny]
                    # If pixel color is similar to the corner background color, flood fill it
                    if is_similar(color, bg_color, tolerance) or (color[0] >= 240 and color[1] >= 240 and color[2] >= 240):
                        visited[nx][ny] = True
                        queue.append((nx, ny))
                        
    # Save the output image
    os.makedirs(os.path.dirname(dest_path), exist_ok=True)
    img.save(dest_path, "PNG")
    print(f"Saved transparent image to: {dest_path}")

# List of generated files to process
brain_dir = "/Users/junseungmo/.gemini/antigravity/brain/187f7c78-d05a-4c21-a3f1-75875a404b8d"
dest_dir = "/Users/junseungmo/Documents/03_Resources/repos/savelog/public/images"

files_mapping = {
    "icon_home": "icon_home_1779500691607.png",
    "icon_feed": "icon_feed_1779500714441.png",
    "icon_rank": "icon_rank_1779500735954.png",
    "icon_profile": "icon_profile_1779500758081.png",
    "icon_lock": "icon_lock_1779500777849.png",
    "icon_mailbox": "icon_mailbox_1779500799454.png",
    "icon_target": "icon_target_1779500819458.png",
    "icon_flame": "icon_flame_1779500838969.png"
}

for name, filename in files_mapping.items():
    src = os.path.join(brain_dir, filename)
    dest = os.path.join(dest_dir, f"{name}.png")
    # Using slightly higher tolerance for smooth edges
    remove_background_floodfill(src, dest, tolerance=20)
