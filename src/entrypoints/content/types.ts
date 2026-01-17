export type ScoreDetails = {
  element: Element;
  depth: number;
  score: number;
  breakdown: {
    base: number;
    ratioPenalty: number;
    semanticBonus: number;
    mediaBonus: number;
    roleBonus: number;
    bgBonus: number;
    borderBonus: number;
    bodyPenalty: number;
    largePenalty: number;
    depthPenalty: number;
  };
  rect: DOMRect;
  tagName: string;
  selector: string;
};