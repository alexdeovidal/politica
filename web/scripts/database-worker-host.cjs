// A process boundary lets cancellation stop SQLite native code immediately.
// Terminating a JS worker alone can wait indefinitely for a native query.
const { Worker } = require('node:worker_threads');
process.once('message', ({ scriptPath, workerData }) => {
  const worker = new Worker(scriptPath, { workerData });
  let sent = false;
  function reply(result) {
    if (sent) return;
    sent = true;
    process.send(result, () => process.exit(0));
  }
  worker.once('message', reply);
  worker.once('error', error => reply({ error: error.message }));
  worker.once('exit', code => {
    if (!sent) reply({ error: `Database worker exited without a result (${code})` });
  });
});
process.once('disconnect', () => process.exit(0));
