from flask import Flask, request, jsonify, render_template
import os
from PIL import Image
import torch
from transformers import BlipProcessor, BlipForConditionalGeneration
import requests
import logging

app = Flask(__name__, template_folder="templates")

torch.set_grad_enabled(False)
logging.basicConfig(level=logging.INFO)

processor = None
model = None

def load_model():
    global processor, model
    if model is None:
        logging.info("Loading BLIP model...")
        processor = BlipProcessor.from_pretrained(
            "Salesforce/blip-image-captioning-base"
        )
        model = BlipForConditionalGeneration.from_pretrained(
            "Salesforce/blip-image-captioning-base"
        )
        model.eval()
        logging.info("BLIP model loaded")

@app.route("/")
def index():
    return render_template("icg.html")

@app.route("/predict", methods=["POST"])
def predict():
    load_model()  # ✅ lazy load

    if "image" not in request.files:
        return jsonify({"error": "No image uploaded"}), 400

    image = Image.open(request.files["image"].stream).convert("RGB")
    image = image.resize((384, 384))

    inputs = processor(image, return_tensors="pt")

    with torch.no_grad():
        output = model.generate(**inputs, max_length=40)

    caption = processor.decode(output[0], skip_special_tokens=True)
    return jsonify({"caption": caption})

@app.route("/translate", methods=["POST"])
def translate():
    data = request.get_json(force=True)
    text = data.get("text")
    target = data.get("target")

    try:
        r = requests.get(
            "https://api.mymemory.translated.net/get",
            params={"q": text, "langpair": f"en|{target.split('-')[0]}"},
            timeout=10
        )
        return jsonify({"translatedText": r.json()["responseData"]["translatedText"]})
    except:
        return jsonify({"error": "Translation failed"}), 500

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 10000))
    app.run(host="0.0.0.0", port=port)
