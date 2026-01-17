<script lang="ts">
  import { tick } from 'svelte';
  import './overlay.css';
  import DebugPanel from './DebugPanel.svelte';
  import DebugTooltip from './DebugTooltip.svelte';
  import { ScoreDetails } from './types';

  let { onExit } = $props<{ onExit?: () => void }>();

  type LockedTarget =
    | { kind: 'element'; element: Element }
    | {
        kind: 'region';
        rect: { x: number; y: number; width: number; height: number };
      };

  let overlayEl: HTMLElement | null = $state(null);

  // Debug state (only populated in dev mode)
  let debugCandidates = $state<ScoreDetails[]>([]);

  let hoveredElement: Element | null = $state(null);
  let hoverRect: DOMRect | null = $state(null);
  let lastHoveredElement: Element | null = $state(null);

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
    pad = UI_PADDING,
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
    y: number,
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

  const MIN_ELEMENT_SIZE = 24;
  const SEMANTIC_TAGS = new Set([
    'ARTICLE',
    'MAIN',
    'SECTION',
    'ASIDE',
    'NAV',
    'HEADER',
    'FOOTER',
  ]);
  const MEDIA_TAGS = new Set(['IMG', 'PICTURE', 'VIDEO', 'CANVAS', 'SVG']);

  function getElementSelector(el: Element): string {
    if (el.id) return `#${el.id}`;
    const classes = Array.from(el.classList).slice(0, 3).join('.');
    const classStr = classes ? `.${classes}` : '';
    return `${el.tagName.toLowerCase()}${classStr}`;
  }

  function scoreCandidate(el: Element, depth = 0): number | ScoreDetails {
    const rect = el.getBoundingClientRect();
    const area = rect.width * rect.height;
    if (!Number.isFinite(area) || area <= 0) return -Infinity;
    if (rect.width < MIN_ELEMENT_SIZE || rect.height < MIN_ELEMENT_SIZE)
      return -Infinity;

    const viewportArea = window.innerWidth * window.innerHeight;
    const ratio = viewportArea > 0 ? area / viewportArea : 0;

    const cs = window.getComputedStyle(el);
    const bg = cs.backgroundColor;
    const hasBg = bg !== 'transparent' && bg !== 'rgba(0, 0, 0, 0)';
    const hasBorder =
      Number.parseFloat(cs.borderTopWidth) > 0 ||
      Number.parseFloat(cs.borderRightWidth) > 0 ||
      Number.parseFloat(cs.borderBottomWidth) > 0 ||
      Number.parseFloat(cs.borderLeftWidth) > 0;

    const tag = el.tagName;
    const semanticBonus = SEMANTIC_TAGS.has(tag) ? 0.25 : 0;
    const mediaBonus = MEDIA_TAGS.has(tag) ? 0.7 : 0;

    const role = (el.getAttribute('role') || '').toLowerCase();
    const roleBonus = ['main', 'article', 'region', 'dialog'].includes(role)
      ? 0.2
      : 0;

    const targetRatio = 0.25;
    const ratioPenalty = Math.abs(Math.log((ratio + 1e-6) / targetRatio));

    const base = 1.2;
    const bgBonus = hasBg ? 0.15 : 0;
    const borderBonus = hasBorder ? 0.1 : 0;
    const bodyPenalty =
      el === document.body || el === document.documentElement ? 2 : 0;
    const largePenalty = ratio > 0.9 ? 1 : 0;
    const depthPenalty = depth * 0.25;

    const score =
      base -
      ratioPenalty +
      semanticBonus +
      roleBonus +
      mediaBonus +
      bgBonus +
      borderBonus -
      bodyPenalty -
      largePenalty -
      depthPenalty;

    // In dev mode, return detailed breakdown
    if (import.meta.env.DEV) {
      return {
        element: el,
        depth,
        score,
        breakdown: {
          base,
          ratioPenalty,
          semanticBonus,
          mediaBonus,
          roleBonus,
          bgBonus,
          borderBonus,
          bodyPenalty,
          largePenalty,
          depthPenalty,
        },
        rect,
        tagName: el.tagName,
        selector: getElementSelector(el),
      };
    }

    return score;
  }

  function pickMeaningfulContainer(start: Element): Element {
    let best: Element = start;
    let bestScore = -Infinity;
    let cur: Element | null = start;

    const candidates: ScoreDetails[] = [];

    const MAX_DEPTH = 5;
    for (let depth = 0; cur && depth < MAX_DEPTH; depth++) {
      if (!isVisible(cur)) {
        cur = cur.parentElement;
        continue;
      }

      const result = scoreCandidate(cur, depth);
      const score = typeof result === 'number' ? result : result.score;

      if (import.meta.env.DEV && typeof result !== 'number') {
        candidates.push(result);
      }

      if (score > bestScore) {
        bestScore = score;
        best = cur;
      }

      cur = cur.parentElement;
      if (!cur || cur === document.documentElement) break;
    }

    if (import.meta.env.DEV) {
      debugCandidates = candidates.sort((a, b) => b.score - a.score);
    }

    return best;
  }

  function isPointInMarginBox(x: number, y: number, el: Element): boolean {
    const rect = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);
    const marginTop = Math.max(0, Number.parseFloat(style.marginTop) || 0);
    const marginRight = Math.max(0, Number.parseFloat(style.marginRight) || 0);
    const marginBottom = Math.max(
      0,
      Number.parseFloat(style.marginBottom) || 0,
    );
    const marginLeft = Math.max(0, Number.parseFloat(style.marginLeft) || 0);

    return (
      x >= rect.left - marginLeft &&
      x <= rect.right + marginRight &&
      y >= rect.top - marginTop &&
      y <= rect.bottom + marginBottom
    );
  }

  function updateHover(x: number, y: number) {
    const base = elementFromPointThroughOverlay(x, y);
    if (!base) {
      hoveredElement = null;
      hoverRect = null;
      lastHoveredElement = null;
      return;
    }

    const candidate = pickMeaningfulContainer(base);

    // Sticky logic: if new candidate is an ancestor of current element
    // and mouse is still in current element's margin-box, keep the current highlight
    if (
      lastHoveredElement &&
      candidate.contains(lastHoveredElement) &&
      candidate !== lastHoveredElement &&
      isPointInMarginBox(x, y, lastHoveredElement)
    ) {
      return;
    }

    const rect = candidate.getBoundingClientRect();

    hoveredElement = candidate;
    hoverRect = rect;
    lastHoveredElement = candidate;
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
    rect: { x: number; y: number; width: number; height: number },
  ): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const dpr = window.devicePixelRatio || 1;
        const paddedRect = padRect(rect, UI_PADDING);

        const canvas = document.createElement('canvas');
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
          canvas.height,
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

  const CAPTURE_DELAY = 120;

  async function onCopy() {
    if (!locked || busy) return;
    busy = 'copy';
    capturing = true;
    await tick();
    await new Promise((r) => setTimeout(r, CAPTURE_DELAY)); // wait for UI to settle
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
    await new Promise((r) => setTimeout(r, CAPTURE_DELAY)); // wait for UI to settle
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
      const DRAG_THRESHOLD = 4;
      if (moved >= DRAG_THRESHOLD) {
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

    const MIN_CAPTURE_SIZE = 10;
    if (
      rect &&
      rect.width >= MIN_CAPTURE_SIZE &&
      rect.height >= MIN_CAPTURE_SIZE
    ) {
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
      : null,
  );
  let dragBox = $derived(
    isDragging && dragRect ? padRect(clampRect(dragRect), UI_PADDING) : null,
  );
  let lockedBox = $derived.by(() => {
    if (!locked) return null;
    if (locked.kind === 'element') {
      return padRect(
        domRectToXYWH(locked.element.getBoundingClientRect()),
        UI_PADDING,
      );
    }
    if (locked.kind === 'region') {
      return padRect(locked.rect, UI_PADDING);
    }
    return null;
  });
  let spotlightBox = $derived(lockedBox ?? dragBox ?? hoverBox);

  const MENU_OFFSET = 4;
  const MENU_WIDTH = 148;

  function menuPosition(rect: {
    x: number;
    y: number;
    width: number;
    height: number;
  }) {
    const rightEdge = rect.x + rect.width;
    const topY = rect.y + MENU_OFFSET;

    const fitsRight = rightEdge + MENU_OFFSET + MENU_WIDTH < window.innerWidth;

    const left = fitsRight
      ? rightEdge + MENU_OFFSET
      : rightEdge - MENU_WIDTH - MENU_OFFSET;

    return { left, top: topY };
  }

  let menuPos = $derived.by(() => (lockedBox ? menuPosition(lockedBox) : null));
</script>

<section
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
      <menu
        class="capcap-menu"
        style={`left:${menuPos?.left}px;top:${menuPos?.top}px;`}
      >
        <li>
          <button class="capcap-btn" disabled={busy !== null} onclick={onCopy}
            >Copy</button
          >
        </li>
        <li>
          <button class="capcap-btn" disabled={busy !== null} onclick={onSave}
            >Save</button
          >
        </li>
        <li>
          <button class="capcap-btn" disabled={busy !== null} onclick={exit}
            >Exit</button
          >
        </li>
      </menu>
    {/if}
  {/if}

  {#if !lockedBox && !capturing}
    <p class="capcap-hint">Click or drag to capture a portion of this page</p>
  {/if}

  {#if import.meta.env.DEV && !isDragging && !locked}
    <DebugTooltip {hoveredElement} {hoverBox} {debugCandidates} />
    <DebugPanel {hoveredElement} {debugCandidates} />
  {/if}
</section>
