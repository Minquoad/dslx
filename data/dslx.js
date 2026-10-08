const textarea = document.querySelector('textarea');
const activeLine = document.querySelector('.active-line');
const mirror = document.createElement('div');
mirror.className = 'caret-mirror';
mirror.setAttribute('aria-hidden', 'true');
document.body.append(mirror);

// Copy the actual typography and available width, excluding the scrollbar.
const mirroredProperties = [
    'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'fontVariant',
    'lineHeight', 'letterSpacing', 'wordSpacing', 'textIndent', 'textAlign',
    'textTransform', 'direction', 'tabSize',
    'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
];

let pendingFrame = null;

function updateActiveLine() {
    pendingFrame = null;
    if (document.activeElement !== textarea) {
        activeLine.hidden = true;
        return;
    }

    const style = getComputedStyle(textarea);
    for (const property of mirroredProperties) {
        mirror.style[property] = style[property];
    }
    mirror.style.width = `${textarea.clientWidth}px`;

    // Keep the remainder of the text so that a word crossing the caret wraps
    // exactly as it does in the textarea. textContent also keeps pasted HTML inert.
    const caret = textarea.selectionDirection === 'backward'
        ? textarea.selectionStart
        : textarea.selectionEnd;
    const marker = document.createElement('span');
    marker.textContent = textarea.value.slice(caret) || '\u200b';
    mirror.replaceChildren(document.createTextNode(textarea.value.slice(0, caret)), marker);

    const lineHeight = parseFloat(style.lineHeight);
    const paddingTop = parseFloat(style.paddingTop);
    // Inline glyph bounds are shorter than the line box: snap to the line grid.
    const lineIndex = Math.round((marker.offsetTop - paddingTop) / lineHeight);
    const top = paddingTop + lineIndex * lineHeight - textarea.scrollTop;
    activeLine.style.top = `${top}px`;
    activeLine.style.height = `${lineHeight}px`;
    activeLine.style.width = `${textarea.clientWidth}px`;
    activeLine.hidden = false;
}

function scheduleUpdate() {
    if (pendingFrame === null) {
        pendingFrame = requestAnimationFrame(updateActiveLine);
    }
}

for (const event of ['focus', 'blur', 'input', 'select', 'selectionchange', 'keyup', 'click', 'scroll']) {
    textarea.addEventListener(event, scheduleUpdate);
}
document.addEventListener('selectionchange', scheduleUpdate);
new ResizeObserver(scheduleUpdate).observe(textarea);
document.fonts.ready.then(scheduleUpdate);
document.fonts.addEventListener('loadingdone', scheduleUpdate);

const readButton = document.querySelector('#read-selection');
const pauseButton = document.querySelector('#pause-reading');
const stopButton = document.querySelector('#stop-reading');
const speechStatus = document.querySelector('#speech-status');
const languageSelect = document.querySelector('#speech-language');
const voiceSelect = document.querySelector('#speech-voice');
const rateSelect = document.querySelector('#speech-rate');
const player = document.querySelector('.speech-controls');
const settingsToggle = document.querySelector('#toggle-settings');
const playerSettings = document.querySelector('#player-settings');
const selectionInfo = document.querySelector('#selection-info');
const speechProgress = document.querySelector('#speech-progress');
const speechPosition = document.querySelector('#speech-position');
const speechSupported = 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
const synth = speechSupported ? window.speechSynthesis : null;
let currentUtterance = null;
let remainingText = '';
let reading = false;
let paused = false;
let readingLanguage = 'fr-fr';
let readingVoice = null;
let readingRate = 1;
let totalCharacters = 0;
let lastSelection = null;

settingsToggle.addEventListener('click', () => {
    playerSettings.hidden = !playerSettings.hidden;
    settingsToggle.setAttribute('aria-expanded', String(!playerSettings.hidden));
});

function voiceLanguage(voice) {
    return voice.lang.replace(/_/g, '-').toLowerCase();
}

function voiceKey(voice) {
    return voice.voiceURI || `${voice.name || 'Voix'}:${voice.lang}`;
}

function updateVoices() {
    const previous = voiceSelect.value;
    const voices = synth.getVoices().filter(voice => voiceLanguage(voice) === languageSelect.value);
    voiceSelect.replaceChildren(...(voices.length
        ? voices.map(voice => new Option(voice.name || 'Voix du navigateur', voiceKey(voice)))
        : [new Option('Voix du navigateur', '')]));
    if (voices.some(voice => voiceKey(voice) === previous)) voiceSelect.value = previous;
    updateSpeechControls();
}

function updateProgress(characters) {
    const percent = totalCharacters ? Math.min(100, Math.max(0, characters / totalCharacters * 100)) : 0;
    speechProgress.value = percent;
    speechPosition.textContent = `${Math.floor(percent)} %`;
}

function updateLanguages() {
    if (!synth) return;
    const previous = languageSelect.value;
    const languages = [...new Set(synth.getVoices().map(voiceLanguage).filter(Boolean))];
    // Some browsers deliver their voices asynchronously. Keep a usable default
    // until voiceschanged provides the list, without losing the current choice.
    if (!languages.length) {
        updateVoices();
        return;
    }
    const names = typeof Intl.DisplayNames === 'function'
        ? new Intl.DisplayNames(['fr'], { type: 'language' })
        : null;
    const options = languages.map(language => {
        let label = language;
        try { label = names?.of(language) || language; } catch { /* Keep the language code. */ }
        return new Option(label.charAt(0).toUpperCase() + label.slice(1), language);
    });
    options.sort((a, b) => a.text.localeCompare(b.text, 'fr'));
    languageSelect.replaceChildren(...options);
    languageSelect.value = languages.includes(previous) ? previous
        : languages.find(language => language === 'fr-fr')
            || languages.find(language => language.startsWith('fr'))
            || languages[0];
    updateVoices();
}

function selectedText() {
    return textarea.value.slice(textarea.selectionStart, textarea.selectionEnd);
}

function updateSpeechControls() {
    const selection = selectedText().trim();
    if (!reading && selection !== lastSelection) {
        totalCharacters = 0;
        updateProgress(0);
        if (speechSupported) {
            speechStatus.textContent = selection ? 'Prêt à lire ta sélection.' : 'Sélectionne un passage pour l’écouter.';
        }
    }
    lastSelection = selection;
    readButton.disabled = !speechSupported || !selection;
    pauseButton.disabled = !reading;
    stopButton.disabled = !reading;
    pauseButton.textContent = paused ? 'Reprendre' : 'Pause';
    languageSelect.disabled = !speechSupported || reading;
    voiceSelect.disabled = !speechSupported || reading || !voiceSelect.value;
    rateSelect.disabled = !speechSupported || reading;
    player.dataset.state = reading ? (paused ? 'paused' : 'reading') : 'idle';
    const words = selection ? selection.split(/\s+/u).length : 0;
    selectionInfo.textContent = words ? `${words} mot${words > 1 ? 's' : ''} sélectionné${words > 1 ? 's' : ''}` : 'Aucune sélection';
    if (speechSupported && !reading && (!speechStatus.textContent
        || /^(Sélectionne|Prêt à lire)/u.test(speechStatus.textContent))) {
        speechStatus.textContent = selection ? 'Prêt à lire ta sélection.' : 'Sélectionne un passage pour l’écouter.';
    }
}

function stopReading(message = '') {
    // Invalidate callbacks before cancelling: a previous utterance may still
    // dispatch an end/error event after another selection has started reading.
    currentUtterance = null;
    remainingText = '';
    reading = false;
    paused = false;
    if (!message) {
        totalCharacters = 0;
        updateProgress(0);
    }
    if (synth) {
        synth.cancel();
        if (synth.paused) synth.resume();
    }
    speechStatus.textContent = message;
    updateSpeechControls();
}

function speakNextPart() {
    if (!remainingText) {
        stopReading('Lecture terminée.');
        return;
    }

    // Short utterances avoid browsers cutting off a long selection mid-read.
    // Preserve every selected character and prefer splitting between words.
    const offset = totalCharacters - remainingText.length;
    let end = Math.min(Math.floor(200 * Math.min(1, readingRate)), remainingText.length);
    if (end < remainingText.length) {
        const space = Math.max(remainingText.lastIndexOf(' ', end), remainingText.lastIndexOf('\n', end));
        if (space > 80) end = space + 1;
        const lastCode = remainingText.charCodeAt(end - 1);
        if (lastCode >= 0xd800 && lastCode <= 0xdbff) end--;
    }
    const utterance = new SpeechSynthesisUtterance(remainingText.slice(0, end));
    remainingText = remainingText.slice(end);
    utterance.lang = readingLanguage;
    utterance.rate = readingRate;
    if (readingVoice) utterance.voice = readingVoice;
    currentUtterance = utterance;
    // Use reported character positions, never a timer that guesses audio timing.
    // Voices without boundary events still advance after each completed part.
    utterance.onboundary = event => {
        if (currentUtterance !== utterance || paused) return;
        if (Number.isFinite(event.charIndex)) {
            updateProgress(offset + Math.min(utterance.text.length, Math.max(0, event.charIndex)));
        }
    };
    utterance.onend = () => {
        if (currentUtterance !== utterance) return;
        updateProgress(offset + utterance.text.length);
        currentUtterance = null;
        if (!paused) speakNextPart();
    };
    utterance.onerror = () => {
        if (currentUtterance !== utterance) return;
        stopReading('La voix est indisponible. Réessaie ou choisis un autre navigateur.');
    };
    try {
        synth.speak(utterance);
    } catch {
        stopReading('La lecture vocale n’a pas pu démarrer.');
    }
}

readButton.addEventListener('click', () => {
    // Read the textarea's saved range even though clicking the button moves focus.
    const text = selectedText();
    if (!speechSupported || !text.trim()) return;
    stopReading();
    remainingText = text;
    readingLanguage = languageSelect.value;
    readingVoice = synth.getVoices().find(voice => voiceLanguage(voice) === readingLanguage
        && voiceKey(voice) === voiceSelect.value) || null;
    readingRate = Number(rateSelect.value);
    totalCharacters = text.length;
    updateProgress(0);
    reading = true;
    speechStatus.textContent = 'Lecture en cours…';
    updateSpeechControls();
    speakNextPart();
});

pauseButton.addEventListener('click', () => {
    if (!reading) return;
    paused = !paused;
    if (paused) {
        synth.pause();
    } else {
        synth.resume();
        if (!currentUtterance) speakNextPart();
    }
    if (reading) speechStatus.textContent = paused ? 'Lecture en pause.' : 'Lecture en cours…';
    updateSpeechControls();
});

stopButton.addEventListener('click', () => stopReading('Lecture arrêtée.'));
languageSelect.addEventListener('change', () => {
    if (synth) updateVoices();
});
for (const event of ['select', 'selectionchange', 'keyup', 'pointerup', 'focus']) {
    textarea.addEventListener(event, updateSpeechControls);
}
document.addEventListener('selectionchange', updateSpeechControls);
textarea.addEventListener('input', () => {
    if (reading) stopReading('Lecture arrêtée après modification du texte.');
    else updateSpeechControls();
});
window.addEventListener('pagehide', () => stopReading());
if (!speechSupported) speechStatus.textContent = 'Lecture vocale indisponible dans ce navigateur.';
if (synth) {
    synth.addEventListener('voiceschanged', updateLanguages);
    updateLanguages();
}
updateSpeechControls();
