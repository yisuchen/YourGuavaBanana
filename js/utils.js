export function escapeHtml(unsafe) {
    if (!unsafe) return "";
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

export function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\\]/g, '\\$&');
}

export function extractImage(body) {
    if (!body) return null;
    const mdMatch = body.match(/!\s*\[.*?\]\((.*?)\)/);
    if (mdMatch) return mdMatch[1];
    const htmlMatch = body.match(/<img.*?src=["'](.*?)["']/);
    if (htmlMatch) return htmlMatch[1];
    return null;
}

export function extractSection(body, headingText) {
    if (!body) return null;
    const lines = body.split('\n');
    let content = [];
    let found = false;

    for (let i = 0; i < lines.length; i++) {
        const trimmedLine = lines[i].trim();
        if (
            trimmedLine.startsWith('### ' + headingText) ||
            (headingText.includes('(') && trimmedLine.startsWith('### ' + headingText.split(' (')[0]))
        ) {
            found = true;
            continue;
        }
        if (found) {
            if (trimmedLine.startsWith('### ')) {
                break;
            }
            content.push(lines[i]);
        }
    }

    if (!found) return null;
    const result = content.join('\n').trim();
    const lowerResult = result.toLowerCase();
    if (lowerResult === '_no response_' || lowerResult === 'no response') return "";
    return result;
}

export function cleanContent(text) {
    if (!text) return text;
    return text.split(/Variables\s*\(key=value\)/i)[0].trim();
}

export function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
    });
}

export function copyToClipboard(btn, text) {
    navigator.clipboard.writeText(text).then(() => {
        const originalText = btn.innerHTML;
        btn.innerHTML = '✅ 已複製';
        btn.classList.add('copied');
        setTimeout(() => {
            btn.innerHTML = originalText;
            btn.classList.remove('copied');
        }, 2000);
    }).catch(err => {
        console.error('Copy failed:', err);
    });
}

// Helper to get cursor coordinates in textarea using a mirror div
export function getCursorXY(textarea, selectionPoint) {
    const div = document.createElement('div');
    const copyStyle = getComputedStyle(textarea);

    // Basic styles
    div.style.whiteSpace = 'pre-wrap';
    div.style.wordWrap = 'break-word';
    div.style.position = 'absolute';
    div.style.visibility = 'hidden';

    // Copy relevant styles for measuring
    const props = [
        'font-family', 'font-size', 'font-weight', 'font-style', 'font-variant',
        'line-height', 'text-transform', 'letter-spacing', 'word-spacing',
        'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
        'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width',
        'box-sizing', 'width'
    ];

    props.forEach(prop => {
        div.style[prop] = copyStyle.getPropertyValue(prop);
    });

    // Special handle for width to match scrollbar behavior
    div.style.width = textarea.clientWidth + 'px';
    div.style.overflow = 'hidden';

    document.body.appendChild(div);

    // Content up to cursor
    const textContent = textarea.value.substring(0, selectionPoint);
    div.textContent = textContent;

    // Marker for cursor position
    const span = document.createElement('span');
    span.textContent = '|';
    div.appendChild(span);

    // Calculate relative coordinates
    const relativeTop = span.offsetTop - textarea.scrollTop;
    const relativeLeft = span.offsetLeft - textarea.scrollLeft;

    const finalX = textarea.offsetLeft + relativeLeft;
    const finalY = textarea.offsetTop + relativeTop;

    document.body.removeChild(div);

    return { x: finalX, y: finalY };
}
