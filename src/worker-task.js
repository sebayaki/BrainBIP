/** Owns one worker job, including its Blob URL and stale-event checks. */
export function createWorkerOwner(source) {
  let activeTask = null;

  function stop() {
    const task = activeTask;
    activeTask = null;
    if (!task) return;
    task.worker.onmessage = null;
    task.worker.onerror = null;
    task.worker.terminate();
    URL.revokeObjectURL(task.url);
  }

  function start(id, input, { onMessage, onError }) {
    stop();
    const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
    let worker;
    try {
      worker = new Worker(url);
    } catch (error) {
      URL.revokeObjectURL(url);
      throw error;
    }
    const task = { id, url, worker };
    activeTask = task;
    worker.onmessage = ({ data }) => {
      if (activeTask !== task || data.id !== id) return;
      onMessage(data);
    };
    worker.onerror = (event) => {
      if (activeTask !== task) return;
      onError(event);
    };
    try {
      worker.postMessage({ id, ...input });
    } catch (error) {
      stop();
      throw error;
    }
  }

  return { start, stop, isRunning: () => activeTask !== null };
}
