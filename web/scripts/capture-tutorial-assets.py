"""Create compact, deterministic illustrated GIFs and reduced-motion posters for cooking tutorials."""
from pathlib import Path
from PIL import Image, ImageDraw
import math

OUT = Path(__file__).resolve().parents[1] / "games" / "cooking" / "public" / "tutorial"
SIZE = (480, 300)
STEPS = {
    "ham": ["hamTake", "hamCook", "hamPlate", "hamServe"],
    "steak": ["steakTake", "steakChop", "steakCook", "steakPlate", "steakServe"],
    "burger": ["burgerPrepare", "burgerCook", "burgerAssemble", "burgerServe"],
    "veggieBurger": ["veggiePrepare", "veggieCook", "veggieAssemble", "veggieServe"],
    "stew": ["stewPot", "stewWater", "stewChop", "stewFill", "stewCook", "stewServe"],
}

def rounded(draw, box, radius, fill, outline=None, width=1):
    draw.rounded_rectangle(box, radius, fill=fill, outline=outline, width=width)

def kitchen_frame(step, frame):
    image = Image.new("RGB", SIZE, "#f6eddf")
    d = ImageDraw.Draw(image)
    # Tiled backsplash and a broad timber counter keep each instruction visually grounded.
    for y in range(0, 156, 39):
        offset = 0 if (y // 39) % 2 == 0 else 32
        for x in range(-32 + offset, 512, 64):
            d.rectangle((x, y, x + 63, y + 38), fill="#e8dcc8", outline="#d5c6ad", width=2)
    d.rectangle((0, 192, 480, 300), fill="#a96f45")
    d.rectangle((0, 192, 480, 204), fill="#d4955e")
    d.line((0, 216, 480, 216), fill="#8b5738", width=3)
    d.line((0, 270, 480, 270), fill="#8b5738", width=2)
    cx = 240 + round(math.sin(frame * math.pi / 4) * 22)
    y = 166
    action = step.lower()
    if "pot" in action or "water" in action or "fill" in action or "stewcook" in action or "stewserve" in action:
        # Pot with handles; ingredients and water are animated inside it.
        rounded(d, (cx - 90, 116, cx + 90, 216), 24, "#697783", "#414d56", 5)
        d.rectangle((cx - 108, 148, cx - 88, 177), fill="#596671")
        d.rectangle((cx + 88, 148, cx + 108, 177), fill="#596671")
        d.ellipse((cx - 72, 128, cx + 72, 178), fill="#c7d9dc", outline="#e9f2ef", width=4)
        if "water" in action:
            d.line((cx + 86, 58, cx + 30, 132), fill="#53b6e7", width=10)
            d.ellipse((cx + 22, 123, cx + 38, 139), fill="#7bd3f2")
            d.ellipse((cx - 54, 145, cx + 54, 170), fill="#73c8e7")
        elif "fill" in action or "cook" in action or "serve" in action:
            for i, color in enumerate(("#e8b34c", "#db7548", "#8cbb55")):
                x = cx - 38 + i * 38
                d.ellipse((x - 15, 137 + (frame % 3) * 2, x + 15, 165), fill=color, outline="#754b32", width=2)
        if "cook" in action:
            for i in range(3):
                xx = cx - 25 + i * 24
                d.arc((xx, 79 - (frame % 3) * 8, xx + 24, 116), 200, 340, fill="#f2a33a", width=6)
    elif "cook" in action:
        # Pan, flame and a patty whose colour changes as it cooks.
        d.ellipse((cx - 100, 115, cx + 82, 203), fill="#3f4850", outline="#20292f", width=6)
        d.rounded_rectangle((cx + 55, 142, cx + 164, 162), 9, fill="#4f5960")
        d.ellipse((cx - 51, 130, cx + 42, 190), fill="#b76546" if frame < 4 else "#74452f", outline="#e19a65", width=3)
        for i in range(3):
            xx = cx - 34 + i * 25
            d.polygon([(xx, 225), (xx + 12, 199 - (frame % 2) * 8), (xx + 24, 225)], fill="#ff9a34")
    elif "chop" in action or "prepare" in action:
        rounded(d, (cx - 115, 128, cx + 115, 192), 14, "#d7a66d", "#8d5e3d", 4)
        for i in range(4):
            x = cx - 55 + i * 38
            is_cut = frame > 2
            color = "#8c4b35" if "steak" in action or "burger" in action else "#e6a74a"
            if is_cut:
                rounded(d, (x - 12, 142 + (i % 2) * 12, x + 10, 161 + (i % 2) * 12), 5, color, "#6d4534", 2)
            else:
                d.ellipse((x - 17, 138, x + 17, 177), fill=color, outline="#6d4534", width=3)
        knife_x = cx + round(math.sin(frame * math.pi / 2) * 28)
        d.polygon([(knife_x, 82), (knife_x + 15, 86), (knife_x - 2, 145), (knife_x - 17, 141)], fill="#d9e3e4", outline="#6e7a80")
    elif "assemble" in action:
        # Two halves of a bun meet around a cooked patty.
        separation = max(0, 35 - frame * 7)
        d.ellipse((cx - 60, 120 - separation, cx + 60, 167 - separation), fill="#e9b761", outline="#9a6139", width=4)
        d.ellipse((cx - 59, 157, cx + 59, 195), fill="#75452f", outline="#4a3026", width=4)
        d.ellipse((cx - 60, 180 + separation, cx + 60, 220 + separation), fill="#edbd70", outline="#9a6139", width=4)
        for sx in (-28, 4, 31):
            d.ellipse((cx + sx, 132 - separation, cx + sx + 5, 137 - separation), fill="#fff1cf")
    elif "serve" in action or "plate" in action:
        d.ellipse((cx - 114, 136, cx + 114, 195), fill="#fbfbf8", outline="#bbc4c4", width=6)
        d.ellipse((cx - 84, 145, cx + 84, 185), fill="#fffefa", outline="#e0e1dc", width=2)
        if "ham" in action:
            d.ellipse((cx - 41, 147, cx + 42, 180), fill="#cf765c", outline="#8c4639", width=3)
        elif "stew" in action:
            d.ellipse((cx - 45, 146, cx + 45, 183), fill="#a86838", outline="#78462d", width=3)
            d.ellipse((cx - 28, 151, cx - 12, 163), fill="#e5b34d")
            d.ellipse((cx + 8, 160, cx + 27, 174), fill="#8fbd5c")
        else:
            d.ellipse((cx - 39, 148, cx + 39, 182), fill="#81503a", outline="#4e3227", width=3)
            if "burger" in action:
                d.ellipse((cx - 40, 142, cx + 40, 163), fill="#e8b35d", outline="#9a6139", width=3)
    elif "take" in action:
        color = "#d17b62" if "ham" in action else "#9a533b"
        d.ellipse((cx - 58, 130, cx + 58, 192), fill=color, outline="#6f3f31", width=4)
        d.ellipse((cx - 26, 143, cx + 24, 181), fill="#efb69d", outline="#a96751", width=3)
    # A simple glove pointer gives the action a human cue without relying on fonts or emoji.
    hand_x = 356 - round(frame * 13)
    rounded(d, (hand_x - 15, 48 + (frame % 2) * 5, hand_x + 38, 90 + (frame % 2) * 5), 12, "#f4c89a", "#a36f4e", 3)
    d.ellipse((hand_x - 6, 67, hand_x + 4, 78), fill="#ffdfbd")
    return image

def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for dish, steps in STEPS.items():
        for number, step in enumerate(steps, start=1):
            frames = [kitchen_frame(step, index) for index in range(8)]
            frames[0].save(OUT / f"{dish}-{number}.png", optimize=True)
            frames[0].save(OUT / f"{dish}-{number}.gif", save_all=True, append_images=frames[1:], duration=110, loop=0, optimize=True)
    print(f"Created {sum(map(len, STEPS.values()))} tutorial GIFs and posters in {OUT}")

if __name__ == "__main__":
    main()
