<script lang="ts">
  import { tick } from 'svelte';

  let { onExit } = $props<{ onExit?: () => void }>();

  type LockedTarget =
    | { kind: 'element'; element: Element }
    | {
        kind: 'region';
        rect: { x: number; y: number; width: number; height: number };
      };

  let overlayEl: HTMLDivElement | null = $state(null);

  let hoveredElement: Element | null = $state(null);
  let hoverRect: DOMRect | null = $state(null);

  let isDragging = $state(false);
  let dragStart = $state<{ x: number; y: number } | null>(null);
  let dragRect = $state<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  let pendingDrag = $state(false);

  let locked = $state<LockedTarget | null>(null);

  let lastBlob = $state<Blob | null>(null);
  let busy = $state<'copy' | 'save' | null>(null);
  let capturing = $state(false);

  const UI_PADDING = 4;

  function clampRect(rect: {
    x: number;
    y: number;
    width: number;
    height: number;
  }) {
    const x1 = Math.max(0, Math.min(window.innerWidth, rect.x));
    const y1 = Math.max(0, Math.min(window.innerHeight, rect.y));
    const x2 = Math.max(0, Math.min(window.innerWidth, rect.x + rect.width));
    const y2 = Math.max(0, Math.min(window.innerHeight, rect.y + rect.height));
    return {
      x: Math.min(x1, x2),
      y: Math.min(y1, y2),
      width: Math.abs(x2 - x1),
      height: Math.abs(y2 - y1),
    };
  }

  function padRect(
    rect: { x: number; y: number; width: number; height: number },
    pad = UI_PADDING
  ) {
    return clampRect({
      x: rect.x - pad,
      y: rect.y - pad,
      width: rect.width + pad * 2,
      height: rect.height + pad * 2,
    });
  }

  function domRectToXYWH(rect: DOMRect) {
    return {
      x: rect.left,
      y: rect.top,
      width: rect.width,
      height: rect.height,
    };
  }

  function isCapCapElement(el: Element) {
    return Boolean(el.closest('#capcap-root'));
  }

  function elementFromPointThroughOverlay(
    x: number,
    y: number
  ): Element | null {
    const els = document.elementsFromPoint(x, y);
    for (const el of els) {
      if (!(el instanceof Element)) continue;
      if (isCapCapElement(el)) continue;
      if (el === document.documentElement || el === document.body) continue;
      return el;
    }
    return null;
  }

  function isVisible(el: Element) {
    const cs = window.getComputedStyle(el);
    if (cs.display === 'none') return false;
    if (cs.visibility === 'hidden') return false;
    const opacity = Number.parseFloat(cs.opacity || '1');
    if (opacity <= 0) return false;
    return true;
  }

  function scoreCandidate(el: Element, rect: DOMRect) {
    const area = rect.width * rect.height;
    if (!Number.isFinite(area) || area <= 0) return -Infinity;
    if (rect.width < 24 || rect.height < 24) return -Infinity;

    const viewportArea = window.innerWidth * window.innerHeight;
    const ratio = viewportArea > 0 ? area / viewportArea : 0;

    const cs = window.getComputedStyle(el);
    const bg = cs.backgroundColor;
    const hasBg = bg !== 'transparent' && bg !== 'rgba(0, 0, 0, 0)';
    const hasBorder =
      Number.parseFloat(cs.borderTopWidth || '0') > 0 ||
      Number.parseFloat(cs.borderRightWidth || '0') > 0 ||
      Number.parseFloat(cs.borderBottomWidth || '0') > 0 ||
      Number.parseFloat(cs.borderLeftWidth || '0') > 0;

    const tag = el.tagName;
    const semanticTags = new Set([
      'ARTICLE',
      'MAIN',
      'SECTION',
      'ASIDE',
      'NAV',
      'HEADER',
      'FOOTER',
    ]);
    const semanticBonus = semanticTags.has(tag) ? 0.35 : 0;

    // Prefer selecting actual media elements (especially <img>) when hovered.
    const mediaTags = new Set(['IMG', 'PICTURE', 'VIDEO', 'CANVAS', 'SVG']);
    const mediaBonus = tag === 'IMG' ? 0.9 : mediaTags.has(tag) ? 0.45 : 0;

    const role = (el.getAttribute('role') || '').toLowerCase();
    const roleBonus = ['main', 'article', 'region', 'dialog'].includes(role)
      ? 0.25
      : 0;

    const textLen = (el.textContent || '').trim().length;
    const textBonus = Math.min(textLen / 300, 1) * 0.4;

    const targetRatio = 0.25;
    const ratioPenalty = Math.abs(Math.log((ratio + 1e-6) / targetRatio));

    let score = 1.2 - ratioPenalty;
    score += semanticBonus + roleBonus + textBonus + mediaBonus;
    if (hasBg) score += 0.15;
    if (hasBorder) score += 0.1;

    if (el === document.body || el === document.documentElement) score -= 2;
    if (ratio > 0.9) score -= 1;

    return score;
  }

  function pickMeaningfulContainer(start: Element): Element {
    let best: Element = start;
    let bestScore = -Infinity;

    let cur: Element | null = start;
    for (let depth = 0; cur && depth < 12; depth++) {
      if (!isVisible(cur)) {
        cur = cur.parentElement;
        continue;
      }

      const rect = cur.getBoundingClientRect();
      const score = scoreCandidate(cur, rect);
      if (score > bestScore) {
        bestScore = score;
        best = cur;
      }

      cur = cur.parentElement;
      if (!cur || cur === document.documentElement) break;
    }

    return best;
  }

  function updateHover(x: number, y: number) {
    const base = elementFromPointThroughOverlay(x, y);
    if (!base) {
      hoveredElement = null;
      hoverRect = null;
      return;
    }

    const candidate = pickMeaningfulContainer(base);
    const rect = candidate.getBoundingClientRect();

    hoveredElement = candidate;
    hoverRect = rect;
  }

  function lockElementCapture(el: Element) {
    locked = { kind: 'element', element: el };
    lastBlob = null;
  }

  function lockRegionCapture(rect: {
    x: number;
    y: number;
    width: number;
    height: number;
  }) {
    locked = { kind: 'region', rect: clampRect(rect) };
    lastBlob = null;
  }

  async function captureViewport(): Promise<string> {
    const response = await browser.runtime.sendMessage({
      type: 'CAPTURE_SCREENSHOT',
    });
    if (response?.error) {
      throw new Error(response.error);
    }
    if (!response?.dataUrl) {
      throw new Error('Failed to capture screenshot');
    }
    return response.dataUrl;
  }

  function cropImageFromDataUrl(
    dataUrl: string,
    rect: { x: number; y: number; width: number; height: number }
  ): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const dpr = window.devicePixelRatio || 1;
        const canvas = document.createElement('canvas');
        const paddedRect = padRect(rect, UI_PADDING);

        canvas.width = Math.max(1, Math.round(paddedRect.width * dpr));
        canvas.height = Math.max(1, Math.round(paddedRect.height * dpr));

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('No canvas context'));
          return;
        }

        ctx.drawImage(
          img,
          paddedRect.x * dpr,
          paddedRect.y * dpr,
          paddedRect.width * dpr,
          paddedRect.height * dpr,
          0,
          0,
          canvas.width,
          canvas.height
        );

        canvas.toBlob((blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('Failed to create blob'));
          }
        }, 'image/png');
      };
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = dataUrl;
    });
  }

  async function captureLocked(): Promise<Blob> {
    if (!locked) throw new Error('Nothing selected');

    const rect =
      locked.kind === 'element'
        ? domRectToXYWH(locked.element.getBoundingClientRect())
        : locked.rect;

    const dataUrl = await captureViewport();
    return cropImageFromDataUrl(dataUrl, rect);
  }

  function filename() {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
    return `capcap_${stamp}.png`;
  }

  async function ensureBlob() {
    if (lastBlob) return lastBlob;
    lastBlob = await captureLocked();
    return lastBlob;
  }

  async function onCopy() {
    if (!locked || busy) return;
    busy = 'copy';
    capturing = true;
    await tick();
    await new Promise((r) => setTimeout(r, 120)); // wait for UI to settle
    try {
      const blob = await ensureBlob();
      await navigator.clipboard.write([
        new ClipboardItem({ [blob.type]: blob }),
      ]);
    } finally {
      busy = null;
      exit();
      capturing = false;
    }
  }

  async function onSave() {
    if (!locked || busy) return;
    busy = 'save';
    capturing = true;
    await tick();
    await new Promise((r) => setTimeout(r, 120)); // wait for UI to settle
    try {
      const blob = await ensureBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename();
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      busy = null;
      exit();
      capturing = false;
    }
  }

  function exit() {
    onExit?.();
  }

  function onPointerDown(e: PointerEvent) {
    if (e.button !== 0) return;
    if (locked) return;

    e.preventDefault();
    e.stopPropagation();

    pendingDrag = true;
    isDragging = false;
    dragStart = { x: e.clientX, y: e.clientY };
    dragRect = null;
  }

  function onPointerMove(e: PointerEvent) {
    if (locked) return;

    e.preventDefault();
    e.stopPropagation();

    if (pendingDrag && dragStart) {
      const dx = e.clientX - dragStart.x;
      const dy = e.clientY - dragStart.y;
      const moved = Math.hypot(dx, dy);

      // Only start manual region selection after a small movement threshold.
      if (moved >= 4) {
        isDragging = true;
      }

      if (isDragging) {
        dragRect = {
          x: dragStart.x,
          y: dragStart.y,
          width: dx,
          height: dy,
        };
        return;
      }
    }

    updateHover(e.clientX, e.clientY);
  }

  function onPointerUp(e: PointerEvent) {
    if (e.button !== 0) return;
    if (locked) return;

    e.preventDefault();
    e.stopPropagation();

    const didDrag = isDragging;
    pendingDrag = false;
    isDragging = false;

    const rect = didDrag && dragRect ? clampRect(dragRect) : null;
    dragStart = null;
    dragRect = null;

    if (rect && rect.width >= 10 && rect.height >= 10) {
      lockRegionCapture(rect);
      return;
    }

    // Click without dragging: lock current smart-selected element.
    if (!didDrag && hoveredElement) {
      lockElementCapture(hoveredElement);
    }
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      exit();
      return;
    }

    if (e.key === 'Enter' && !locked && hoveredElement) {
      e.preventDefault();
      e.stopPropagation();
      lockElementCapture(hoveredElement);
    }
  }

  $effect(() => {
    window.addEventListener('keydown', onKeyDown, { capture: true });

    return () => {
      window.removeEventListener('keydown', onKeyDown, {
        capture: true,
      } as AddEventListenerOptions);
    };
  });

  let hoverBox = $derived(
    hoverRect && !locked && !isDragging
      ? padRect(domRectToXYWH(hoverRect), UI_PADDING)
      : null
  );
  let dragBox = $derived(
    isDragging && dragRect ? padRect(clampRect(dragRect), UI_PADDING) : null
  );
  let lockedBox = $derived.by(() => {
    if (!locked) return null;
    if (locked.kind === 'element') {
      return padRect(
        domRectToXYWH(locked.element.getBoundingClientRect()),
        UI_PADDING
      );
    }
    if (locked.kind === 'region') {
      return padRect(locked.rect, UI_PADDING);
    }
    return null;
  });
  let spotlightBox = $derived(lockedBox ?? dragBox ?? hoverBox);
</script>

<div
  bind:this={overlayEl}
  class="capcap-overlay"
  class:capcap-overlay--locked={Boolean(lockedBox)}
  class:capcap-overlay--capturing={capturing}
  tabindex="-1"
  onpointerdown={onPointerDown}
  onpointermove={onPointerMove}
  onpointerup={onPointerUp}
>
  {#if spotlightBox}
    <div
      class="capcap-spotlight"
      class:no-transition={isDragging}
      style={`left:${spotlightBox.x}px;top:${spotlightBox.y}px;width:${spotlightBox.width}px;height:${spotlightBox.height}px;`}
    ></div>
  {:else}
    <div class="capcap-dim"></div>
  {/if}

  {#if hoverBox}
    <div
      class="capcap-frame"
      style={`left:${hoverBox.x}px;top:${hoverBox.y}px;width:${hoverBox.width}px;height:${hoverBox.height}px;`}
    ></div>
  {/if}

  {#if dragBox}
    <div
      class="capcap-frame capcap-frame--locked no-transition"
      style={`left:${dragBox.x}px;top:${dragBox.y}px;width:${dragBox.width}px;height:${dragBox.height}px;`}
    ></div>
  {/if}

  {#if lockedBox}
    <div
      class="capcap-frame capcap-frame--locked"
      style={`left:${lockedBox.x}px;top:${lockedBox.y}px;width:${lockedBox.width}px;height:${lockedBox.height}px;`}
    ></div>

    {@const r = lockedBox}
    {#if !capturing}
      <div
        class="capcap-menu"
        style={`left:${Math.min(window.innerWidth - 156, Math.max(12, r.x + r.width - 156))}px;top:${Math.min(window.innerHeight - 120, Math.max(12, r.y + 8))}px;`}
      >
        <button class="capcap-btn" disabled={busy !== null} onclick={onCopy}
          >Copy</button
        >
        <button class="capcap-btn" disabled={busy !== null} onclick={onSave}
          >Save</button
        >
        <button class="capcap-btn" disabled={busy !== null} onclick={exit}
          >Exit</button
        >
      </div>
    {/if}
  {/if}

  {#if !lockedBox && !capturing}
    <div class="capcap-hint">
      Click or drag to capture a portion of this page
    </div>
  {/if}
</div>

<style>
  :global(#capcap-root) {
    position: fixed;
    inset: 0;
    z-index: 2147483647;
    --capcap-ease: cubic-bezier(0.22, 1, 0.36, 1);
  }

  .capcap-overlay {
    position: fixed;
    inset: 0;
    pointer-events: auto;
    cursor: crosshair;
    outline: none;
    transition: opacity 160ms var(--capcap-ease);
  }

  .capcap-overlay--locked {
    cursor: default;
  }

  .capcap-overlay--capturing {
    pointer-events: none;
    display: none;
  }

  .capcap-dim {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.38);
    transition: background 160ms var(--capcap-ease);
  }

  .capcap-spotlight,
  .capcap-frame {
    position: absolute;
    border-radius: 8px;
    transition:
      left 200ms var(--capcap-ease),
      top 200ms var(--capcap-ease),
      width 200ms var(--capcap-ease),
      height 200ms var(--capcap-ease);
  }

  .capcap-spotlight {
    box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.38);
  }

  .capcap-frame {
    border: 2px solid rgba(255, 255, 255, 0.6);
    background: rgba(255, 255, 255, 0.04);
  }

  .capcap-frame--locked {
    border-color: rgba(255, 255, 255, 0.92);
    background: rgba(255, 255, 255, 0.06);
  }

  .no-transition {
    transition: none !important;
  }

  .capcap-menu {
    position: absolute;
    width: 148px;
    padding: 8px;
    border-radius: 12px;
    background: rgba(20, 20, 22, 0.72);
    backdrop-filter: blur(10px) saturate(180%);
    border: 1px solid rgba(255, 255, 255, 0.18);
    box-shadow:
      0 4px 12px rgba(0, 0, 0, 0.32),
      0 0 0 1px rgba(0, 0, 0, 0.08),
      inset 0 1px 0 rgba(255, 255, 255, 0.08);
    display: grid;
    gap: 6px;
    transition:
      transform 160ms var(--capcap-ease),
      opacity 160ms var(--capcap-ease);
  }

  .capcap-hint {
    position: absolute;
    left: 50%;
    bottom: 32px;
    transform: translateX(-50%);
    padding: 24px 40px;
    border-radius: 20px;
    background: rgba(255, 255, 255, 0.92);
    color: rgba(0, 180, 216, 0.95);
    border: 1px solid rgba(0, 212, 255, 0.24);
    box-shadow:
      0 10px 28px rgba(0, 0, 0, 0.22),
      0 1px 0 rgba(255, 255, 255, 0.55),
      0 0 32px rgba(0, 212, 255, 0.16);
    backdrop-filter: blur(10px) saturate(180%);
    pointer-events: auto;
    cursor: default;
    user-select: none;
    white-space: nowrap;
    font:
      600 14px/1.1 system-ui,
      -apple-system,
      BlinkMacSystemFont,
      'Segoe UI',
      sans-serif;
    transition: opacity 200ms var(--capcap-ease);
  }

  .capcap-hint:hover {
    opacity: 0.12;
  }

  .capcap-btn {
    appearance: none;
    border: 0;
    border-radius: 10px;
    padding: 10px 10px;
    text-align: left;
    background: rgba(255, 255, 255, 0.08);
    color: rgba(255, 255, 255, 0.95);
    cursor: pointer;
    font:
      600 13px/1.1 system-ui,
      -apple-system,
      BlinkMacSystemFont,
      'Segoe UI',
      sans-serif;
    transition: background 160ms var(--capcap-ease);
  }

  .capcap-btn:hover:enabled {
    background: rgba(255, 255, 255, 0.14);
  }

  .capcap-btn:disabled {
    opacity: 0.6;
    cursor: default;
  }
</style>
