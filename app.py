from flask import Flask, request, jsonify, render_template
import os
from PIL import Image
import torch
from transformers import BlipProcessor, BlipForConditionalGeneration
import requests
import logging

app = Flask(__name__, template_folder='templates')

device = "cpu"
torch.set_grad_enabled(False)
logging.basicConfig(level=logging.INFO)

# ✅ SMALL model (fits 512MB)
processor = BlipProcessor.from_pretrained(
    "Salesforce/blip-image-captioning-small"
)
model = BlipForConditionalGeneration.from_pretrained(
    "Salesforce/blip-image-captioning-small"
)
model.eval()

def translate_with_mymemory(text, target_lang):
    try:
        url = "https://api.mymemory.translated.net/get"
        langpair = f"en|{target_lang.split('-')[0]}"
        r = requests.get(url, params={"q": text, "langpair": langpair}, timeout=10)
        r.raise_for_status()
        data = r.json()
        if data.get("responseStatus") == 200:
            return data["responseData"]["translatedText"]
    except Exception as e:
        logging.warning("MyMemory failed: %s", e)
    return None

@app.route("/")
def index():
    return render_template("icg.html")

@app.route("/predict", methods=["POST"])
def predict():
    if "image" not in request.files:
        return jsonify({"error": "No image uploaded"}), 400

    file = request.files["image"]

    image = Image.open(file.stream).convert("RGB")
    image = image.resize((384, 384))  # memory safe

    inputs = processor(image, return_tensors="pt")

    with torch.no_grad():
        output = model.generate(**inputs, max_length=50)

    caption = processor.decode(output[0], skip_special_tokens=True)
    return jsonify({"caption": caption})


@app.route("/translate", methods=["POST"])
def translate():
    data = request.get_json(force=True)
    text = data.get("text")
    target = data.get("target")

    translated = translate_with_mymemory(text, target)
    if translated:
        return jsonify({"translatedText": translated})

    return jsonify({"error": "Translation failed"}), 500

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 10000))
    app.run(host="0.0.0.0", port=port)
