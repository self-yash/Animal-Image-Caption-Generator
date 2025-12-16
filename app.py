from flask import Flask, request, jsonify, render_template
import os
from werkzeug.utils import secure_filename
from PIL import Image
import torch
from transformers import BlipProcessor, BlipForConditionalGeneration, AutoTokenizer, AutoModelForSeq2SeqLM
import requests
import logging

app = Flask(__name__, template_folder='templates')

UPLOAD_FOLDER = 'uploads'
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

device = "cuda" if torch.cuda.is_available() else "cpu"
logging.basicConfig(level=logging.INFO)

# Load BLIP once
processor = BlipProcessor.from_pretrained("Salesforce/blip-image-captioning-base", use_fast=True)
model = BlipForConditionalGeneration.from_pretrained("Salesforce/blip-image-captioning-base").to(device)

# Cache for translation models loaded from Hugging Face
translation_models = {}  # model_name -> (tokenizer, model)

def load_hf_model_for_target(target_lang):
    """
    Try to load a Helsinki-NLP opus-mt model for en -> target_lang (e.g. en-fr).
    Returns (tokenizer, model) or (None, None) if unavailable.
    """
    base = target_lang.split('-')[0]
    model_name = f"Helsinki-NLP/opus-mt-en-{base}"
    if model_name in translation_models:
        return translation_models[model_name]
    try:
        logging.info(f"Loading HF model {model_name} for translation...")
        tokenizer = AutoTokenizer.from_pretrained(model_name)
        seq_model = AutoModelForSeq2SeqLM.from_pretrained(model_name).to(device)
        translation_models[model_name] = (tokenizer, seq_model)
        return tokenizer, seq_model
    except Exception as e:
        logging.warning(f"Could not load HF model {model_name}: {e}")
        return None, None

def translate_with_mymemory(text, target_lang):
    try:
        url = "https://api.mymemory.translated.net/get"
        langpair = f"en|{target_lang.split('-')[0]}"
        r = requests.get(url, params={"q": text, "langpair": langpair}, timeout=10)
        r.raise_for_status()
        data = r.json()
        if data.get("responseStatus") == 200 and data.get("responseData", {}).get("translatedText"):
            return data["responseData"]["translatedText"]
    except Exception as e:
        logging.warning("MyMemory fallback failed: %s", e)
    return None

def translate_with_google_unofficial(text, target_lang):
    try:
        tl = target_lang.split('-')[0]
        url = f"https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl={tl}&dt=t&q={requests.utils.requote_uri(text)}"
        r = requests.get(url, timeout=10)
        r.raise_for_status()
        data = r.json()
        if isinstance(data, list) and len(data) > 0:
            return "".join([seg[0] for seg in data[0] if seg and len(seg) > 0])
    except Exception as e:
        logging.warning("Google unofficial fallback failed: %s", e)
    return None

@app.route('/')
def index():
    # Ensure you have templates/icg.html (or adjust name)
    return render_template('icg.html')

@app.route('/predict', methods=['POST'])
def predict():
    if 'image' not in request.files:
        return jsonify({'error': 'No image uploaded'}), 400
    file = request.files['image']
    if file.filename == '':
        return jsonify({'error': 'Empty filename'}), 400

    filename = secure_filename(file.filename)
    path = os.path.join(UPLOAD_FOLDER, filename)
    file.save(path)

    image = Image.open(path).convert('RGB')
    inputs = processor(image, return_tensors="pt").to(device)
    output = model.generate(**inputs, max_length=50)
    caption = processor.decode(output[0], skip_special_tokens=True)
    return jsonify({'caption': caption})

@app.route('/translate', methods=['POST'])
def translate():
    data = request.get_json(force=True)
    if not data:
        return jsonify({'error': 'Missing JSON body'}), 400

    text = data.get('text') or data.get('q') or ''
    target = data.get('target') or data.get('lang') or ''
    if not text or not target:
        return jsonify({'error': 'Both "text" and "target" required'}), 400

    # 1) Try local HF Helsinki model (free open-source)
    tokenizer, seq_model = load_hf_model_for_target(target)
    if tokenizer and seq_model:
        try:
            inputs = tokenizer(text, return_tensors="pt", truncation=True, padding=True).to(device)
            outputs = seq_model.generate(**inputs, max_length=256)
            translated = tokenizer.decode(outputs[0], skip_special_tokens=True)
            return jsonify({'translatedText': translated, 'provider': 'hf-local'})
        except Exception as e:
            logging.warning("HF local model failed: %s", e)

    # 2) Fallback to MyMemory (free public)
    translated = translate_with_mymemory(text, target)
    if translated:
        return jsonify({'translatedText': translated, 'provider': 'mymemory'})

    # 3) Fallback to Google unofficial (free/unofficial)
    translated = translate_with_google_unofficial(text, target)
    if translated:
        return jsonify({'translatedText': translated, 'provider': 'google-unofficial'})

    return jsonify({'error': 'Translation failed (no working translator)'}), 500

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 10000))
    app.run(host="0.0.0.0", port=port)
