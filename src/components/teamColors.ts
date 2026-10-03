export const TEAM_GRADIENTS: Record<string, [string, string]> = {
  pumpkin: ["#ffb070", "#f2711c"],
  maple: ["#f08a6c", "#c8372a"],
  gold: ["#f7d27a", "#d99a12"],
  forest: ["#7fbf98", "#2f6b4c"],
  plum: ["#c39bd3", "#7b3f8c"],
  sky: ["#8ec5e8", "#2f6fa3"],
};

export function teamGradient(color: string): string {
  const [a, b] = TEAM_GRADIENTS[color] ?? TEAM_GRADIENTS.pumpkin;
  return `linear-gradient(135deg, ${a}, ${b})`;
}
