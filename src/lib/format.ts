export function compact(n: number): string {
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(Math.round(n));
}

const STRIDE_M = 0.762; // average stride length
const EARTH_KM = 40_075;

export function stepsToKm(steps: number): number {
  return (steps * STRIDE_M) / 1000;
}

export function earthLaps(steps: number): string {
  const laps = stepsToKm(steps) / EARTH_KM;
  if (laps >= 1) return `${laps.toFixed(laps >= 10 ? 0 : 1)}×`;
  return `${(laps * 100).toFixed(laps < 0.01 ? 2 : 1)}%`;
}
