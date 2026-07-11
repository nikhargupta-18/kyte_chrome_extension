import sys
from PIL import Image

src_path = "/home/nikhargupta/kyte-mac-app/design/logo-kit/transparent/kyte-mark-1024.png"
img = Image.open(src_path)

# Crop to the actual non-transparent pixels
bbox = img.getbbox()
if bbox:
    w = bbox[2] - bbox[0]
    h = bbox[3] - bbox[1]
    # Make a square bounding box based on the max dimension
    max_dim = max(w, h)
    
    cx = (bbox[0] + bbox[2]) // 2
    cy = (bbox[1] + bbox[3]) // 2
    
    # Add a tiny 2% padding so it doesn't quite touch the absolute edge
    pad = int(max_dim * 0.02)
    max_dim += pad * 2

    left = cx - max_dim // 2
    upper = cy - max_dim // 2
    right = left + max_dim
    lower = upper + max_dim
    
    img = img.crop((left, upper, right, lower))

# Resize to all required sizes for the Chrome extension
for size in [16, 48, 128, 1024]:
    try:
        resample = Image.Resampling.LANCZOS
    except AttributeError:
        resample = Image.ANTIALIAS
        
    resized = img.resize((size, size), resample)
    resized.save(f"/home/nikhargupta/kyte_chrome_extension/icons/icon-{size}.png")
    
print("Successfully cropped and maximized the logo!")
