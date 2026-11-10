import {deliverySelection, validatedChange} from './delivery.js';
import {restoreDeliveryIds} from './deliverySelection.js';

// Consume complete JSON objects in changes as they arrive. Never display raw
// provider output, incomplete JSON, or a paragraph without its own evidence.
// The full response still passes parseDelivery before anything can be saved.
export function deliveryFieldStream(prepared, publish) {
  let prefix = '', selection, depth = 0, quoted = false, escaped = false, entry = '', done = false;
  const seen = new Set();
  return (chunk) => {
    if (done || !chunk) return;
    if (!selection) {
      prefix += chunk;
      const wrapped = prefix.indexOf('<resume>');
      const json = (wrapped < 0 ? prefix.trimStart().replace(/^\x60\x60\x60(?:json)?\s*/i, '') : prefix.slice(wrapped + 8)).trimStart();
      const marker = /"changes"\s*:\s*\[/.exec(json);
      if (!json.startsWith('{') || !marker) {
        if (prefix.length > 16000) done = true;
        return;
      }
      try {
        const header = JSON.parse(json.slice(0, marker.index) + '"changes":[]}');
        selection = deliverySelection(restoreDeliveryIds(header, prepared.context), prepared);
      } catch { done = true; return; }
      chunk = json.slice(marker.index + marker[0].length);
      prefix = '';
    }
    for (const ch of chunk) {
      if (!depth) {
        if (ch === ']') { done = true; return; }
        if (ch === '{') { entry = ch; depth = 1; quoted = escaped = false; }
        else if (!/[\s,]/.test(ch)) { done = true; return; }
        continue;
      }
      entry += ch;
      if (quoted) {
        if (escaped) escaped = false;
        else if (ch === '\\') escaped = true;
        else if (ch === '"') quoted = false;
      } else if (ch === '"') quoted = true;
      else if (ch === '{') depth++;
      else if (ch === '}' && --depth === 0) {
        let change;
        try {
          const {changes} = restoreDeliveryIds({changes:[JSON.parse(entry)]}, prepared.context);
          change = validatedChange(changes[0], selection);
        } catch { done = true; return; }
        if (seen.has(change.field) || seen.size >= 20) { done = true; return; }
        seen.add(change.field);
        publish(change);
      }
    }
  };
}
