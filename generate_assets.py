import os
from PIL import Image, ImageDraw, ImageFont, ImageFilter

def generate_logo(base_logo_path, output_path):
    print("Generating App Logo...")
    # Load base logo
    base_img = Image.open(base_logo_path)
    
    # Resize directly to 600x600px using Lanczos
    logo_img = base_img.resize((600, 600), Image.Resampling.LANCZOS)
    
    # Save the logo
    logo_img.save(output_path, "PNG")
    print(f"App Logo saved to {output_path} (600x600px)")


def generate_thumbnail(base_logo_path, output_path):
    print("Generating Store Thumbnail...")
    width, height = 1932, 828
    
    # 1. Create a blank dark-mode background image
    # We use a solid deep charcoal/black (#0B0C0E) as base
    thumb = Image.new("RGBA", (width, height), (11, 12, 14, 255))
    
    # 2. Add modern neon glows (mesh gradients) using blurred layers
    # Glow 1: Mint Green glow in the center-left behind the logo card
    glow1_layer = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    draw1 = ImageDraw.Draw(glow1_layer)
    # Draw a mint green circle at the logo position (x=360, y=414)
    # circle radius = 300, bounding box: (cx - r, cy - r, cx + r, cy + r)
    draw1.ellipse([360 - 300, 414 - 300, 360 + 300, 414 + 300], fill=(0, 245, 160, 25))
    glow1_blurred = glow1_layer.filter(ImageFilter.GaussianBlur(150))
    thumb = Image.alpha_composite(thumb, glow1_blurred)
    
    # Glow 2: Cyan/Blue glow in the top-right corner (x=1600, y=100)
    glow2_layer = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    draw2 = ImageDraw.Draw(glow2_layer)
    draw2.ellipse([1600 - 350, 100 - 350, 1600 + 350, 100 + 350], fill=(14, 165, 233, 20))
    glow2_blurred = glow2_layer.filter(ImageFilter.GaussianBlur(180))
    thumb = Image.alpha_composite(thumb, glow2_blurred)

    # Glow 3: Subtle warm glow in the center-right (x=1100, y=500)
    glow3_layer = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    draw3 = ImageDraw.Draw(glow3_layer)
    draw3.ellipse([1100 - 250, 500 - 250, 1100 + 250, 500 + 250], fill=(168, 85, 247, 15)) # Purple/Violet accent
    glow3_blurred = glow3_layer.filter(ImageFilter.GaussianBlur(120))
    thumb = Image.alpha_composite(thumb, glow3_blurred)

    # 3. Add Logo Card on the left
    # Load and resize logo to 360x360px
    base_img = Image.open(base_logo_path)
    logo_size = 360
    logo_card = base_img.resize((logo_size, logo_size), Image.Resampling.LANCZOS).convert("RGBA")
    
    # Paste logo card on the left (x=180, y=234)
    # y = (828 - 360) / 2 = 234
    logo_x = 180
    logo_y = 234
    
    # Add a glassmorphic subtle border to the logo card
    # We create a mask for rounded corners
    logo_border = Image.new("RGBA", (logo_size, logo_size), (0, 0, 0, 0))
    draw_border = ImageDraw.Draw(logo_border)
    # Draw a rounded rectangle outline
    draw_border.rounded_rectangle(
        [0, 0, logo_size - 1, logo_size - 1], 
        radius=78, # Match squircle radius
        outline=(255, 255, 255, 30), 
        width=2
    )
    logo_card = Image.alpha_composite(logo_card, logo_border)
    thumb.paste(logo_card, (logo_x, logo_y), logo_card)
    
    # 4. Add Typography on the right side
    draw = ImageDraw.Draw(thumb)
    
    font_path_kr = "/System/Library/Fonts/AppleSDGothicNeo.ttc"
    font_path_en = "/System/Library/Fonts/HelveticaNeue.ttc"
    
    # Load fonts
    font_title = ImageFont.truetype(font_path_en, 105, index=1)      # Helvetica Neue Bold
    font_subtitle = ImageFont.truetype(font_path_kr, 42, index=6)   # Apple SD Gothic Neo Bold
    font_bullet = ImageFont.truetype(font_path_kr, 32, index=4)     # Apple SD Gothic Neo SemiBold
    font_checkmark = ImageFont.truetype(font_path_kr, 32, index=6)  # Bold for checkmark
    
    text_x = 640
    
    # Draw App Title "savelog"
    title_y = 195
    draw.text((text_x, title_y), "savelog", fill=(255, 255, 255, 255), font=font_title)
    
    # Draw Subtitle "매일 기록하는 소비, 매일 쌓이는 절약"
    sub_y = 325
    draw.text((text_x, sub_y), "매일 기록하는 소비, 매일 쌓이는 절약", fill=(241, 245, 249, 255), font=font_subtitle)
    
    # Draw subtle divider
    div_y = 400
    draw.line([text_x, div_y, text_x + 480, div_y], fill=(255, 255, 255, 15), width=2)
    
    # Bullet features
    bullets = [
        "간편한 일일 소비 기록",
        "포인트와 연속 절약 스트릭 보상",
        "친구들과 함께 나누는 소비 피드"
    ]
    
    bullet_start_y = 445
    line_height = 65
    
    for i, text in enumerate(bullets):
        curr_y = bullet_start_y + (i * line_height)
        # Draw checkmark in neon mint green (#00F5A0)
        draw.text((text_x, curr_y), "✓", fill=(0, 245, 160, 255), font=font_checkmark)
        # Draw text in slate-300 (#CBD5E1)
        draw.text((text_x + 45, curr_y), text, fill=(203, 213, 225, 255), font=font_bullet)
        
    # Save the thumbnail
    thumb.save(output_path, "PNG")
    print(f"Store Thumbnail saved to {output_path} (1932x828px)")


if __name__ == "__main__":
    base_logo = "/Users/junseungmo/.gemini/antigravity/brain/187f7c78-d05a-4c21-a3f1-75875a404b8d/savelog_base_logo_1779384329994.png"
    workspace_root = "/Users/junseungmo/Documents/03_Resources/repos/savelog"
    
    logo_out = os.path.join(workspace_root, "savelog_logo.png")
    thumb_out = os.path.join(workspace_root, "savelog_thumbnail.png")
    
    generate_logo(base_logo, logo_out)
    generate_thumbnail(base_logo, thumb_out)
    print("Asset generation complete!")
