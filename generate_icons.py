from PIL import Image, ImageDraw, ImageFont
import os

def create_icon(size, output_path):
    """Create a simple icon with the given size"""
    img = Image.new('RGB', (size, size), color='#ff0000')
    d = ImageDraw.Draw(img)
    
    # Add text to the icon
    try:
        font_size = size // 3
        font = ImageFont.truetype("Arial", font_size)
        d.text((size//2, size//2), "KV", fill="white", anchor="mm", font=font, align="center")
    except:
        # Fallback if font loading fails
        d.rectangle([size//4, size//4, 3*size//4, 3*size//4], fill="white")
    
    # Save the icon
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    img.save(output_path, 'PNG')

# Generate icons in different sizes
icon_sizes = [192, 512]
for size in icon_sizes:
    output_path = f"static/icons/icon-{size}x{size}.png"
    create_icon(size, output_path)
    print(f"Created icon: {output_path}")

print("Icons generated successfully!")
