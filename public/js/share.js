import { placeLabel } from './ui.js';

/**
 * The share card: plain text, no markup, sized for a chat window. Local rank
 * beats global rank in the byline — "#4 in Lisbon" provokes a rematch in a way
 * that "#8,214 worldwide" never will.
 */
export function buildShareCard({ score, session, chillMoments = 0 }) {
  const lines = ['🦫 Capy River Run'];
  const place = placeLabel(session?.record);
  const local = session?.board?.local;
  const globalRank = session?.board?.you?.rank;

  let rank = null;
  if (local?.yourRank && place !== '—') rank = `#${local.yourRank} in ${place}`;
  else if (globalRank) rank = `#${globalRank} global`;

  lines.push(`Score: ${score.toLocaleString('en-US')}${rank ? ` | Rank: ${rank}` : ''}`);
  if (chillMoments > 0) {
    lines.push(`${chillMoments} chill moment${chillMoments === 1 ? '' : 's'} 🧘`);
  }
  lines.push(`Can you beat my chill? ${location.origin}${location.pathname}`);

  return lines.join('\n');
}

/**
 * Hand the card to the OS share sheet on touch devices, otherwise the
 * clipboard. Returns the channel used so the caller can word its toast.
 */
export async function shareCard(text) {
  const coarse = window.matchMedia?.('(pointer: coarse)').matches;

  if (coarse && navigator.share) {
    try {
      await navigator.share({ text });
      return 'shared';
    } catch (err) {
      if (err?.name === 'AbortError') return 'cancelled';
      // Fall through to the clipboard.
    }
  }

  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return 'copied';
    } catch {
      /* permissions policy or insecure context — try the legacy path */
    }
  }

  return legacyCopy(text) ? 'copied' : 'failed';
}

/** execCommand is deprecated but remains the only path on non-secure origins. */
function legacyCopy(text) {
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.cssText = 'position:fixed;top:-1000px;opacity:0';
  document.body.append(area);
  area.select();

  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  area.remove();
  return ok;
}
