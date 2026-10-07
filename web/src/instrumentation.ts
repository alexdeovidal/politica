export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const {warmSearchWorker} = await import("@/lib/database-worker");
    warmSearchWorker();
  } catch (error) {
    console.error("Unable to initialize the search worker:", error);
  }
}
