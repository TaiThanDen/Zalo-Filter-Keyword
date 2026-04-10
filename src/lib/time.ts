export function now() {
  return new Date();
}

export function addMilliseconds(date: Date, amount: number) {
  return new Date(date.getTime() + amount);
}

export function ageInMilliseconds(date: Date | null | undefined) {
  if (!date) {
    return Number.POSITIVE_INFINITY;
  }

  return Date.now() - date.getTime();
}

export function minuteBucket(input: Date, bucketMs: number) {
  return Math.floor(input.getTime() / bucketMs) * bucketMs;
}
