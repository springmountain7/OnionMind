export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || !process.env.DATABASE_URL) return;
  await import("./instrumentation-node").then(({ migrate }) => migrate());
}
