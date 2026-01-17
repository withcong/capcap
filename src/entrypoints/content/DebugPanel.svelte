<script lang="ts">
  import { ScoreDetails } from './types';

  let { hoveredElement, debugCandidates } = $props<{
    hoveredElement: Element | null;
    debugCandidates: ScoreDetails[];
  }>();

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

  type BreakdownItem = {
    label: string;
    value: number;
    isBonus: boolean;
  };

  function getBreakdownItems(
    breakdown: ScoreDetails['breakdown'],
  ): BreakdownItem[] {
    const items: BreakdownItem[] = [
      { label: 'Base', value: breakdown.base, isBonus: true },
      { label: 'Ratio Penalty', value: breakdown.ratioPenalty, isBonus: false },
    ];

    if (breakdown.semanticBonus > 0)
      items.push({
        label: 'Semantic',
        value: breakdown.semanticBonus,
        isBonus: true,
      });
    if (breakdown.mediaBonus > 0)
      items.push({
        label: 'Media',
        value: breakdown.mediaBonus,
        isBonus: true,
      });
    if (breakdown.roleBonus > 0)
      items.push({ label: 'Role', value: breakdown.roleBonus, isBonus: true });
    if (breakdown.bgBonus > 0)
      items.push({
        label: 'Background',
        value: breakdown.bgBonus,
        isBonus: true,
      });
    if (breakdown.borderBonus > 0)
      items.push({
        label: 'Border',
        value: breakdown.borderBonus,
        isBonus: true,
      });
    if (breakdown.bodyPenalty > 0)
      items.push({
        label: 'Body',
        value: breakdown.bodyPenalty,
        isBonus: false,
      });
    if (breakdown.largePenalty > 0)
      items.push({
        label: 'Too Large',
        value: breakdown.largePenalty,
        isBonus: false,
      });
    if (breakdown.depthPenalty > 0)
      items.push({
        label: 'Depth',
        value: breakdown.depthPenalty,
        isBonus: false,
      });

    return items;
  }
</script>

<!-- Debug Panel -->
<div class="debug-panel">
  <div class="debug-panel-header">
    <span>🐛 Debug Info</span>
  </div>

  <div class="debug-panel-content">
    {#if currentCandidate}
      <div class="debug-section">
        <div class="debug-label">Current Element:</div>
        <div class="debug-value">
          <code>{currentCandidate.selector}</code>
        </div>
        <div class="debug-label">Total Score:</div>
        <div
          class="debug-value score-value {getScoreClass(
            currentCandidate.score,
          )}"
        >
          {currentCandidate.score.toFixed(3)}
        </div>
        <div class="debug-label">Score Breakdown:</div>
        <div class="debug-breakdown">
          {#each getBreakdownItems(currentCandidate.breakdown) as item}
            <div class:bonus={item.isBonus} class:penalty={!item.isBonus}>
              {item.label}: {item.isBonus ? '+' : '-'}{item.value.toFixed(2)}
            </div>
          {/each}
        </div>
      </div>

      <div class="debug-section">
        <div class="debug-label">
          All Candidates ({debugCandidates.length}):
        </div>
        <div class="debug-candidates">
          {#each debugCandidates as candidate}
            <div
              class="debug-candidate"
              class:selected={candidate.element === hoveredElement}
            >
              <div class="candidate-selector">
                <code>{candidate.selector}</code>
                <span class="candidate-depth">depth: {candidate.depth}</span>
              </div>
              <div class="candidate-score {getScoreClass(candidate.score)}">
                {candidate.score.toFixed(2)}
              </div>
            </div>
          {/each}
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  /* Debug Panel Styles */
  .debug-panel {
    position: fixed;
    top: 12px;
    right: 12px;
    width: 360px;
    max-height: calc(100vh - 24px);
    overflow: hidden;
    background: rgba(20, 20, 22, 0.8);
    backdrop-filter: blur(16px) saturate(180%);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 12px;
    box-shadow:
      0 8px 32px rgba(0, 0, 0, 0.4),
      inset 0 1px 0 rgba(255, 255, 255, 0.08);
    color: rgba(255, 255, 255, 0.85);
    font:
      400 12px/1.4 ui-monospace,
      'SF Mono',
      Monaco,
      'Cascadia Code',
      monospace;
    pointer-events: none;
    cursor: default;
    user-select: text;
    z-index: calc(infinity - 1);
  }

  .debug-panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 12px;
    background: rgba(255, 255, 255, 0.06);
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    font:
      600 13px/1.2 system-ui,
      -apple-system,
      sans-serif;
  }

  .debug-panel-content {
    padding: 12px;
    max-height: calc(100vh - 90px);
    overflow-y: auto;
    overflow-x: hidden;
  }

  .debug-panel-content::-webkit-scrollbar {
    width: 8px;
  }

  .debug-panel-content::-webkit-scrollbar-track {
    background: rgba(255, 255, 255, 0.04);
    border-radius: 4px;
  }

  .debug-panel-content::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.2);
    border-radius: 4px;
  }

  .debug-panel-content::-webkit-scrollbar-thumb:hover {
    background: rgba(255, 255, 255, 0.3);
  }

  .debug-section {
    margin-bottom: 16px;
    padding-bottom: 16px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }

  .debug-section:last-child {
    border-bottom: none;
    margin-bottom: 0;
    padding-bottom: 0;
  }

  .debug-label {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: rgba(255, 255, 255, 0.5);
    margin-bottom: 6px;
    margin-top: 8px;
  }

  .debug-label:first-child {
    margin-top: 0;
  }

  .debug-value {
    color: rgba(255, 255, 255, 0.9);
    word-break: break-word;
  }

  .debug-value code {
    background: rgba(255, 255, 255, 0.08);
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 11px;
    color: rgba(100, 200, 255, 0.95);
    display: inline-block;
  }

  .score-value {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-size: 24px;
    font-weight: 700;
    font-family:
      system-ui,
      -apple-system,
      sans-serif;
    padding: 8px 12px;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.06);
  }

  .debug-breakdown {
    display: grid;
    grid-template-columns: 1fr;
    gap: 4px;
    margin-top: 8px;
    font-size: 11px;
    padding: 8px;
    background: rgba(255, 255, 255, 0.04);
    border-radius: 6px;
  }

  .debug-breakdown > div {
    color: rgba(255, 255, 255, 0.7);
  }

  .debug-breakdown .bonus {
    color: rgba(100, 255, 100, 0.9);
  }

  .debug-breakdown .penalty {
    color: rgba(255, 100, 100, 0.9);
  }

  .debug-candidates {
    display: grid;
    gap: 6px;
    margin-top: 8px;
    max-height: 300px;
    overflow-y: auto;
  }

  .debug-candidate {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 8px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 6px;
    transition: all 160ms cubic-bezier(0.22, 1, 0.36, 1);
  }

  .debug-candidate:hover {
    background: rgba(255, 255, 255, 0.08);
    border-color: rgba(255, 255, 255, 0.16);
  }

  .debug-candidate.selected {
    background: rgba(100, 200, 255, 0.15);
    border-color: rgba(100, 200, 255, 0.4);
  }

  .candidate-selector {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
    overflow: hidden;
  }

  .candidate-selector code {
    font-size: 10px;
    color: rgba(255, 255, 255, 0.8);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .candidate-depth {
    font-size: 9px;
    color: rgba(255, 255, 255, 0.4);
  }

  .candidate-score {
    font-size: 13px;
    font-weight: 700;
    font-family:
      system-ui,
      -apple-system,
      sans-serif;
    min-width: 50px;
    text-align: right;
    padding: 4px 8px;
    border-radius: 6px;
    background: rgba(255, 255, 255, 0.06);
  }

  .debug-empty {
    color: rgba(255, 255, 255, 0.4);
    text-align: center;
    padding: 24px;
    font-size: 11px;
    font-family:
      system-ui,
      -apple-system,
      sans-serif;
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
