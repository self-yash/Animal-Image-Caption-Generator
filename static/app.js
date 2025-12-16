const appRoot = document.getElementById('app');

const state = {
  file: null,
  lastCaption: '',
  lastTranslated: { lang: 'en', text: '' },
  lastRequestWas: null
};

const elements = {
  dropzone: document.getElementById('dropzone'),
  fileInput: document.getElementById('fileInput'),
  previewArea: document.getElementById('previewArea'),
  dzContent: document.getElementById('dzContent'),
  fileName: document.getElementById('fileName'),
  generateBtn: document.getElementById('generateBtn'),
  clearBtn: document.getElementById('clearBtn'),
  captionText: document.getElementById('captionText'),
  leftOverlay: document.getElementById('leftOverlay'),
  leftStatus: document.getElementById('leftStatus'),
  globalOverlay: document.getElementById('globalOverlay'),
  globalStatus: document.getElementById('globalStatus'),
  translateBtn: document.getElementById('translateBtn'),
  langSelect: document.getElementById('langSelect'),
  copyBtn: document.getElementById('copyBtn'),
  shareBtn: document.getElementById('shareBtn'),
  speakBtn: document.getElementById('speakBtn'),
  rateSlider: document.getElementById('rateSlider'),
  rateValue: document.getElementById('rateValue'),
  themeToggle: document.getElementById('themeToggle'),
  themeIcon: document.getElementById('themeIcon')
};

const translationCache = {};

const speechLangMap = { en: 'en-US', hi: 'hi-IN', fr: 'fr-FR', es: 'es-ES', de: 'de-DE' };

function showLeftOverlay(show, message='Generating caption…'){
  elements.leftOverlay.classList.toggle('show', !!show);
  elements.leftOverlay.setAttribute('aria-hidden', !show);
  elements.leftStatus.textContent = message;
}
function showGlobalOverlay(show, message='Processing…'){
  elements.globalOverlay.classList.toggle('show', !!show);
  elements.globalOverlay.setAttribute('aria-hidden', !show);
  elements.globalStatus.textContent = message;
}

function humanFileSize(size){
  if(size < 1024) return size + ' B';
  const i = Math.floor(Math.log(size) / Math.log(1024));
  const sizes = ['B','KB','MB','GB','TB'];
  return (size / Math.pow(1024, i)).toFixed(1) + ' ' + sizes[i];
}

function showError(message){
  elements.captionText.textContent = message;
  elements.captionText.style.color = 'var(--danger)';
}

function showCaptionText(text){
  elements.captionText.style.color = 'var(--text)';
  elements.captionText.textContent = text || 'No caption yet. Upload an image and click Generate Caption.';
}

function resetSelection(){
  state.file = null;
  elements.fileInput.value = '';
  elements.previewArea.innerHTML = '';
  elements.dzContent.style.display = 'block';
  elements.previewArea.setAttribute('aria-hidden','true');
  elements.fileName.textContent = 'None';
  elements.generateBtn.disabled = true;
  showCaptionText('No caption yet. Upload an image and click Generate Caption.');
}

function handleFile(file){
  if(!file) return resetSelection();
  if(!file.type.startsWith('image/')){
    showError('Selected file is not an image. Please choose a JPG or PNG image.');
    return;
  }

  if(file.size > 8 * 1024 * 1024){
    showCaptionText('Selected image is large (' + humanFileSize(file.size) + '). Upload may take longer.');
  } else {
    showCaptionText('');
  }

  state.file = file;
  elements.fileName.textContent = `${file.name} • ${humanFileSize(file.size)}`;
  elements.dzContent.style.display = 'none';
  elements.previewArea.setAttribute('aria-hidden','false');
  elements.previewArea.innerHTML = '';

  elements.generateBtn.disabled = false;

  const img = document.createElement('img');
  img.alt = 'Selected image preview';
  img.draggable = false;
  img.loading = 'lazy';
  img.tabIndex = -1;

  const reader = new FileReader();
reader.onload = (e) => {
  img.src = e.target.result;
  elements.previewArea.innerHTML = '';
  elements.previewArea.appendChild(img);
};
  reader.readAsDataURL(file);
}

['dragenter','dragover'].forEach(ev => {
  elements.dropzone.addEventListener(ev, (e) => {
    e.preventDefault();
    e.stopPropagation();
    elements.dropzone.classList.add('dragover');
  });
});
['dragleave','dragend','drop'].forEach(ev => {
  elements.dropzone.addEventListener(ev, (e) => {
    e.preventDefault();
    e.stopPropagation();
    elements.dropzone.classList.remove('dragover');
  });
});
elements.dropzone.addEventListener('drop', (e) => {
  const dt = e.dataTransfer;
  if(dt && dt.files && dt.files.length){
    handleFile(dt.files[0]);
  }
});
elements.dropzone.addEventListener('click', () => elements.fileInput.click());
elements.dropzone.addEventListener('keydown', (e) => {
  if(e.key === 'Enter' || e.key === ' ') { e.preventDefault(); elements.fileInput.click(); }
});
elements.fileInput.addEventListener('change', (e) => {
  const f = e.target.files && e.target.files[0];
  if(f) handleFile(f);
});
elements.clearBtn.addEventListener('click', resetSelection);

async function generateCaption(){
  if(!state.file){
    showError('Please select an image before generating a caption.');
    return;
  }

  const fd = new FormData();
  fd.append('image', state.file, state.file.name);

  showLeftOverlay(true, 'Generating caption…');
  elements.generateBtn.disabled = true;
  elements.lastRequestWas = 'predict';

  try {
    const resp = await fetch('/predict', {
      method: 'POST',
      body: fd
    });

    if(!resp.ok){
      const text = await resp.text().catch(()=> '');
      throw new Error(`Server error ${resp.status}: ${text || resp.statusText}`);
    }

    const data = await resp.json();

    if(!data || typeof data.caption !== 'string'){
      throw new Error('Invalid response format from server.');
    }

    state.lastCaption = data.caption.trim();
    state.lastTranslated = { lang: 'en', text: state.lastCaption };
    showCaptionText(state.lastCaption);
    elements.generateBtn.disabled = false;
    elements.captionText.focus && elements.captionText.focus();

  } catch (err) {
    console.error(err);
    showError('Failed to generate caption. ' + (err.message || 'Network or server error.'));
    elements.generateBtn.disabled = false;
  } finally {
    showLeftOverlay(false);
  }
}
elements.generateBtn.addEventListener('click', generateCaption);

// === TRANSLATION CONFIG ===
const TRANSLATE_API = '/translate';

// === UPDATED TRANSLATE FUNCTION ===
async function translateCaption(targetLang){
  const sourceText = state.lastCaption;

  if(!sourceText || sourceText.trim().length === 0){
    showError('No caption to translate. Generate a caption first.');
    return;
  }

  if(targetLang === 'en'){
    showCaptionText(sourceText);
    state.lastTranslated = { lang: 'en', text: sourceText };
    return;
  }

  const cacheKey = `${sourceText}::${targetLang}`;
  if(translationCache[cacheKey]){
    state.lastTranslated = { lang: targetLang, text: translationCache[cacheKey] };
    showCaptionText(translationCache[cacheKey]);
    return;
  }

  showGlobalOverlay(true, 'Translating…');
  elements.translateBtn.disabled = true;

  try {
    const resp = await fetch(TRANSLATE_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: sourceText,
        target: targetLang
      })
    });

    if(!resp.ok){
      const txt = await resp.text().catch(()=> '');
      throw new Error(`Translate API error ${resp.status}: ${txt || resp.statusText}`);
    }

    const resjson = await resp.json();
    const translated = (resjson.translatedText || '').trim();

    if(!translated){
      throw new Error('Empty translation received.');
    }

    translationCache[cacheKey] = translated;
    state.lastTranslated = { lang: targetLang, text: translated };
    showCaptionText(translated);

  } catch (err) {
    console.error('Translation error', err);
    showError('Translation failed. Please try again later.');
  } finally {
    elements.translateBtn.disabled = false;
    showGlobalOverlay(false);
  }
}

elements.translateBtn.addEventListener('click', () => {
  const lang = elements.langSelect.value;
  translateCaption(lang);
});

function speakText(text, langCode='en', rate=1.0){
  if(!('speechSynthesis' in window)){
    alert('Text-to-Speech is not supported in this browser.');
    return;
  }
  if(!text || text.trim().length === 0){
    showError('No caption to speak.');
    return;
  }

  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = speechLangMap[langCode] || 'en-US';
  utter.rate = rate;
  const voices = speechSynthesis.getVoices();
  if(voices && voices.length){
    let voice = voices.find(v => v.lang && v.lang.toLowerCase().startsWith(utter.lang.split('-')[0]));
    if(!voice) voice = voices.find(v => v.lang && v.lang.toLowerCase().startsWith('en'));
    if(voice) utter.voice = voice;
  }
  speechSynthesis.cancel();
  speechSynthesis.speak(utter);
}
elements.speakBtn.addEventListener('click', () => {
  const lang = state.lastTranslated.lang || elements.langSelect.value || 'en';
  const text = elements.captionText.textContent;
  const rate = parseFloat(elements.rateSlider.value) || 1.0;
  speakText(text, lang, rate);
});
elements.rateSlider.addEventListener('input', () => {
  elements.rateValue.textContent = parseFloat(elements.rateSlider.value).toFixed(1) + '×';
});

elements.copyBtn.addEventListener('click', async () => {
  const text = elements.captionText.textContent || '';
  if(!text || text.trim().length === 0 || text.includes('No caption yet')){
    showError('No caption to copy.');
    return;
  }
  try {
  await navigator.clipboard.writeText(text);

  elements.copyBtn.classList.add('success');
  elements.copyBtn.innerHTML = '<i class="fa-solid fa-check"></i> Copied';

  setTimeout(() => {
    elements.copyBtn.classList.remove('success');
    elements.copyBtn.innerHTML = '<i class="fa-regular fa-copy"></i> Copy';
  }, 1500);

  } catch (err) {
    console.error('Clipboard error', err);
    showError('Failed to copy to clipboard.');
  }
});

elements.shareBtn.addEventListener('click', async () => {
  const text = elements.captionText.textContent || '';
  if(!text || text.trim().length === 0 || text.includes('No caption yet')){
    showError('No caption to share.');
    return;
  }

  if(navigator.share){
    try {
      await navigator.share({ title: 'Animal Caption', text: text });
    } catch (err) {
      console.error('Share failed', err);
    }
  } else {
    try {
      await navigator.clipboard.writeText(text);
      alert('Sharing not supported. Caption copied to clipboard.');
    } catch (err) {
      alert('Sharing not supported and copy failed.');
    }
  }
});

elements.themeToggle.addEventListener('click', () => {
  const cur = document.documentElement.getAttribute('data-theme') || 'dark';
  const next = cur === 'dark' ? 'light' : 'dark';

  document.documentElement.setAttribute(
    'data-theme',
    next === 'light' ? 'light' : ''
  );

  elements.themeToggle.setAttribute('aria-pressed', next === 'light');
  elements.themeIcon.className =
    next === 'light' ? 'fa-solid fa-moon' : 'fa-solid fa-sun';
});


Array.from(document.querySelectorAll('.chip, .btn')).forEach((el) => {
  el.addEventListener('keydown', (e) => {
    if(e.key === 'Enter' || e.key === ' '){
      e.preventDefault();
      el.click();
    }
  });
});

(function init(){
  resetSelection();
  elements.rateValue.textContent = parseFloat(elements.rateSlider.value).toFixed(1) + '×';

  if('speechSynthesis' in window){
    speechSynthesis.onvoiceschanged = () => {};
    speechSynthesis.getVoices();
  }

  console.info('Animal Image Caption Generator initialized. Endpoint: POST /predict (multipart/form-data).');
})();

