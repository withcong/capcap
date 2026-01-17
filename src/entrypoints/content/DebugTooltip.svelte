<script lang="ts">
  import { ScoreDetails } from './types';

  let { hoveredElement, hoverBox, debugCandidates } = $props<{
    hoveredElement: Element | null;
    hoverBox: { x: number; y: number; width: number; height: number } | null;
    debugCandidates: ScoreDetails[];
  }>();

  const TOOLTIP_OFFSET = 4;

  let tooltipPosition = $derived.by(() => {
    if (!hoverBox) return null;
    // Position above the hover box with 4px margin
    return {
      left: hoverBox.x,
      top: Math.max(0, hoverBox.y - TOOLTIP_OFFSET),
      transform: 'translateY(-100%)',
    };
  });

  let currentCandidate = $derived(
    hoveredElement && debugCandidates.length > 0
      ? debugCandidates.find((c: ScoreDetails) => c.element === hoveredElement)
      : null,
  );

  function getScoreClass(score: number) {
    if (score >= 1) return 'high-score';
    if (score >= 0) return 'med-score';
    return 'low-score';
  }
</script>

{#if currentCandidate && tooltipPosition}
  <output
    class="debug-tooltip"
    style={`left:${tooltipPosition.left}px;top:${tooltipPosition.top}px;transform:${tooltipPosition.transform};`}
  >
    <strong>{currentCandidate.tagName}</strong>
    <span class="debug-score {getScoreClass(currentCandidate.score)}">
      {currentCandidate.score.toFixed(2)}
    </span>
  </output>
{/if}

<style>
  .debug-tooltip {
    position: absolute;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 12px;
    background: rgba(20, 20, 22, 0.95);
    backdrop-filter: blur(10px) saturate(180%);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 8px;
    box-shadow:
      0 4px 12px rgba(0, 0, 0, 0.3),
      inset 0 1px 0 rgba(255, 255, 255, 0.1);
    color: rgba(255, 255, 255, 0.95);
    font:
      600 11px/1.2 system-ui,
      -apple-system,
      sans-serif;
    pointer-events: none;
    z-index: calc(infinity - 2);
    white-space: nowrap;

    transition:
      left 250ms var(--capcap-ease),
      top 250ms var(--capcap-ease),
      width 250ms var(--capcap-ease),
      height 250ms var(--capcap-ease);
  }

  .debug-tooltip strong {
    color: rgba(100, 200, 255, 0.95);
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.3px;
    font-size: 10px;
  }

  .debug-score {
    font-size: 14px;
    font-weight: 700;
    padding: 2px 8px;
    border-radius: 6px;
    font-family: ui-monospace, 'SF Mono', Monaco, monospace;
  }

  /* Score Color Coding */
  .high-score {
    color: rgba(100, 255, 100, 1);
    background: rgba(100, 255, 100, 0.15);
  }

  .med-score {
    color: rgba(255, 200, 100, 1);
    background: rgba(255, 200, 100, 0.15);
  }

  .low-score {
    color: rgba(255, 100, 100, 1);
    background: rgba(255, 100, 100, 0.15);
  }
</style>
