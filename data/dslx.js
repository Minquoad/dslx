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
