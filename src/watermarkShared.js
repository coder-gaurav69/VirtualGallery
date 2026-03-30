export function getWatermarkText() {
  return "Celebrare";
}

export function buildWatermarkLayout(width, height, text) {
  const base = Math.max(width, height);
  const fontSize = Math.max(22, Math.round(base * 0.042));
  const padding = Math.max(18, Math.round(base * 0.024));
  return {
    text,
    font: `700 ${fontSize}px Space Grotesk, Segoe UI, sans-serif`,
    x: width - padding,
    y: height - padding,
    angle: -0.2,
    fill: "rgba(255,255,255,0.9)",
    stroke: "rgba(12,20,33,0.38)",
    lineWidth: Math.max(2, Math.round(fontSize * 0.06))
  };
}
