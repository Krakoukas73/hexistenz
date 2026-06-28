export function randomInt(maxExclusive) {
  return Math.floor(Math.random() * maxExclusive);
}

export function pickRandom(items) {
  if (!items.length) return null;
  return items[randomInt(items.length)];
}

export function pickWeighted(weightMap) {
  const entries = Object.entries(weightMap).filter(([, weight]) => weight > 0);
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = Math.random() * total;

  for (const [value, weight] of entries) {
    roll -= weight;
    if (roll <= 0) return value;
  }

  return entries.at(-1)[0];
}
