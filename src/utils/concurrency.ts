/**
 * Minimal p-limit replacement using a promise queue.
 * Drop-in compatible: `const limit = pLimit(N); await limit(fn)`
 */
export default function pLimit(concurrency: number) {
  let active = 0;
  const queue: (() => void)[] = [];

  const next = () => {
    if (queue.length > 0 && active < concurrency) {
      active++;
      queue.shift()!();
    }
  };

  return <T>(fn: () => Promise<T>): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      const run = () => {
        fn().then(
          (val) => { active--; resolve(val); next(); },
          (err) => { active--; reject(err); next(); },
        );
      };

      if (active < concurrency) {
        active++;
        run();
      } else {
        queue.push(run);
      }
    });
}
