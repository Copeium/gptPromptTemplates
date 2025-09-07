// content.js
// Listens for space keypress and tries to expand `#keyword ` into stored template.
// Supports both <input>/<textarea> and contenteditable nodes (like chatgpt textbox)

let templates = {};

// Load templates initially and keep updated
chrome.storage.local.get({templates: {}}, data => {
  templates = data.templates || {};
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.templates) {
    templates = changes.templates.newValue || {};
  }
});

function isEditable(el) {
  if (!el) return false;
  const tag = el.tagName;
  if (!tag) return false;
  if (tag === 'TEXTAREA' || (tag === 'INPUT' && (el.type === 'text' || el.type === 'search' || el.type === 'url' || el.type === 'search'))) return true;
  if (el.isContentEditable) return true;
  return false;
}

function handleSpaceInInput(e) {
  const el = e.target;
  // only handle text inputs/textarea
  if (!(el.tagName === 'TEXTAREA' || el.tagName === 'INPUT')) return;
  const pos = el.selectionStart;
  const textBefore = el.value.slice(0, pos);
  // match trailing #keyword (keyword allowed: letters, numbers, underscore, hyphen)
  const m = textBefore.match(/#([\w-]+)$/);
  if (!m) return;
  const key = m[1];
  const tpl = templates[key];
  if (!tpl) return;
  // replace the '#keyword' with template
  const start = pos - m[0].length;
  const newText = el.value.slice(0, start) + tpl + ' ' + el.value.slice(pos);
  el.value = newText;
  // put caret after inserted template + space
  const newPos = start + tpl.length + 1;
  el.setSelectionRange(newPos, newPos);
  // trigger input events so the page notices change
  el.dispatchEvent(new Event('input', {bubbles:true}));
  e.preventDefault();
}

function handleSpaceInContentEditable(e) {
  // run when user typed space
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return;
  const range = sel.getRangeAt(0).cloneRange();
  const node = sel.anchorNode;
  if (!node) return;

  // Only proceed if inside an editable element
  let el = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
  while (el && !isEditable(el)) el = el.parentElement;
  if (!el) return;

  // Get text up to caret within the current text node (or concatenating adjacent text nodes if needed)
  // We'll build a string of up to 200 chars before the caret by walking previous siblings/parents.
  const maxLookback = 200;
  let textBefore = '';
  let walkingNode = node;
  let offset = sel.anchorOffset;

  // If node is text node, take node.textContent up to offset
  if (walkingNode.nodeType === Node.TEXT_NODE) {
    textBefore = walkingNode.textContent.slice(0, offset);
  } else {
    // element node: attempt to get text of child before offset
    let child = walkingNode.childNodes[offset - 1];
    if (child && child.nodeType === Node.TEXT_NODE) {
      textBefore = child.textContent;
    } else {
      // fallback to whole element text up to caret using range
      const preRange = range.cloneRange();
      preRange.selectNodeContents(el);
      preRange.setEnd(sel.anchorNode, sel.anchorOffset);
      textBefore = preRange.toString();
    }
  }

  // If too short, try to walk previousSibling text nodes
  let walkerNode = node;
  let collected = textBefore;
  while (collected.length < maxLookback) {
    // move to previous sibling
    if (walkerNode.previousSibling) {
      walkerNode = walkerNode.previousSibling;
      const t = walkerNode.textContent || '';
      collected = (t + collected).slice(-maxLookback);
    } else {
      // go up to parent and continue
      if (!walkerNode.parentNode || walkerNode.parentNode === el) break;
      walkerNode = walkerNode.parentNode;
      if (!walkerNode) break;
      const t = walkerNode.textContent || '';
      collected = (t + collected).slice(-maxLookback);
    }
  }
  // use collected as textBefore
  textBefore = collected;

  const m = textBefore.match(/#([\w-]+)$/);
  if (!m) return;
  const key = m[1];
  const tpl = templates[key];
  if (!tpl) return;

  // Replace the matched characters by deleting them then inserting the template+space.
  // We'll modify the DOM via range operations.
  // 1) Move an editable range that selects the matched text before caret
  const deleteRange = sel.getRangeAt(0).cloneRange();
  // compute how many characters to select
  const lenToDelete = m[0].length;
  // Set the start position lenToDelete chars before current caret
  // We'll create a new range to select that region
  let r = sel.getRangeAt(0).cloneRange();
  r.collapse(true);
  // Move start backwards by iterating through characters (robust approach)
  try {
    r.setStart(sel.anchorNode, Math.max(0, sel.anchorOffset - lenToDelete));
  } catch (err) {
    // fallback: use a broader selection using textContent
    const preRange = sel.getRangeAt(0).cloneRange();
    preRange.selectNodeContents(el);
    preRange.setEnd(sel.anchorNode, sel.anchorOffset);
    const preText = preRange.toString();
    const idx = preText.length - lenToDelete;
    // If cannot setStart precisely, replace whole text content of el (last resort)
    if (idx >= 0) {
      // rebuild content quickly: remove last lenToDelete chars and append template + space
      // This is invasive but fallback rarely needed.
      const fullText = preText.slice(0, idx) + tpl + ' ';
      // set element textContent and position caret at end of inserted text
      el.textContent = fullText + el.textContent.slice(preText.length);
      // place caret
      const newRange = document.createRange();
      const textNode = el.firstChild;
      if (textNode) {
        const pos = preText.length - lenToDelete + tpl.length + 1;
        newRange.setStart(textNode, pos);
        newRange.collapse(true);
        sel.removeAllRanges();
        sel.addRange(newRange);
      }
      el.dispatchEvent(new InputEvent('input', {bubbles:true}));
      e.preventDefault();
      return;
    }
  }

  // Now adjust start precisely by walking backwards character-by-character if needed
  // Expand start backwards until we've captured the exact match
  // We'll attempt to expand start by setting start to earlier offsets in same node where possible
  // If the match spans nodes the earlier logic attempted to gather text, but setStart may have failed.
  // Simpler approach: use preRange to find start position inside el
  const preRange = sel.getRangeAt(0).cloneRange();
  preRange.selectNodeContents(el);
  preRange.setEnd(sel.anchorNode, sel.anchorOffset);
  const preText = preRange.toString();
  const startIndex = preText.length - m[0].length;
  // Now we will replace the last m[0].length characters by removing them then inserting tpl
  // Replace by deleting last m[0].length characters inside el's text content at the appropriate place:
  // Build final text = preText.slice(0,startIndex) + tpl + ' ' + remainder (remainder is text after caret inside el)
  const postRange = sel.getRangeAt(0).cloneRange();
  // select content after caret inside el (if any)
  let postText = '';
  try {
    const afterRange = sel.getRangeAt(0).cloneRange();
    afterRange.selectNodeContents(el);
    afterRange.setStart(sel.anchorNode, sel.anchorOffset);
    postText = afterRange.toString();
  } catch (err) {
    postText = '';
  }
  const newFull = preText.slice(0, startIndex) + tpl + ' ' + postText;

  // Replace content of editable element with newFull while trying to preserve formatting minimally.
  // We'll set textContent (this strips HTML nodes inside editable area - ChatGPT's composer is mostly plain text)
  el.textContent = newFull;

  // place caret after inserted text
  const newRange = document.createRange();
  // choose first text node
  let firstText = null;
  function findTextNode(n){ if(n.nodeType===3) { firstText = n; return true;} for(let c of n.childNodes){ if(findTextNode(c)) return true;} return false;}
  findTextNode(el);
  if (firstText) {
    const caretPos = (preText.length - m[0].length) + tpl.length + 1;
    newRange.setStart(firstText, Math.min(caretPos, firstText.length));
    newRange.collapse(true);
    sel.removeAllRanges();
    sel.addRange(newRange);
  }

  el.dispatchEvent(new InputEvent('input', {bubbles:true}));
  e.preventDefault();
}

function onKeyDown(e) {
  // trigger only when space pressed
  if (e.key !== ' ') return;
  const el = e.target;
  if (!isEditable(el)) {
    // but if selection is inside contenteditable (not directly target), still check
    const sel = window.getSelection();
    if (sel && sel.anchorNode) {
      let nodeEl = sel.anchorNode.nodeType === Node.ELEMENT_NODE ? sel.anchorNode : sel.anchorNode.parentElement;
      if (nodeEl) {
        while (nodeEl && !isEditable(nodeEl)) nodeEl = nodeEl.parentElement;
        if (nodeEl && nodeEl.isContentEditable) {
          handleSpaceInContentEditable(e);
          return;
        }
      }
    }
    return;
  }

  if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
    handleSpaceInInput(e);
  } else {
    // contenteditable element
    handleSpaceInContentEditable(e);
  }
}

// Attach listener at document level
document.addEventListener('keydown', onKeyDown, true);
