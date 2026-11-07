from pathlib import Path
from PIL import Image, ImageDraw

root = Path(__file__).resolve().parents[1] / "public" / "icons"
root.mkdir(parents=True, exist_ok=True)
for size in (192, 512):
    image = Image.new("RGB", (size, size), "#203d38")
    draw = ImageDraw.Draw(image)
    scale = size / 64
    draw.line([(18*scale, 48*scale), (31*scale, 35*scale), (46*scale, 18*scale)], fill="#f4f7f3", width=max(3, int(3.5*scale)), joint="curve")
    draw.line([(14*scale, 52*scale), (50*scale, 52*scale)], fill="#f4f7f3", width=max(3, int(3.5*scale)))
    draw.ellipse((16*scale, 16*scale, 34*scale, 34*scale), outline="#f4f7f3", width=max(2, int(2.5*scale)))
    image.save(root / f"icon-{size}.png", optimize=True)
