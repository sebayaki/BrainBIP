const STAGES = ['argon2id', 'pbkdf2', 'addresses'];
const STAGE_LABELS = {
  idle: 'Preparing',
  argon2id: 'Memory derivation',
  pbkdf2: 'CPU derivation',
  addresses: 'Recovery outputs',
  complete: 'Recovery ready',
};
const number = new Intl.NumberFormat('en-US');

function formatElapsed(seconds) {
  const total = Math.floor(Math.max(0, seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remainder = String(total % 60).padStart(2, '0');
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${remainder}`
    : `${String(minutes).padStart(2, '0')}:${remainder}`;
}

function memoryLabel(memoryKiB) {
  return memoryKiB % 1024 === 0
    ? `${number.format(memoryKiB / 1024)} MiB`
    : `${number.format(memoryKiB)} KiB`;
}

export function createProgressController({ getElement: $ }) {
  const panel = $('progress-state');
  const steps = [...$('stage-list').querySelectorAll('li[data-stage]')];
  let startedAt = null;
  let finalSeconds = 0;
  let timer = null;

  function elapsedSeconds() {
    return startedAt === null ? finalSeconds : Math.max(0, (performance.now() - startedAt) / 1000);
  }

  function renderElapsed() {
    const seconds = elapsedSeconds();
    $('progress-elapsed').textContent = formatElapsed(seconds);
    $('progress-elapsed').setAttribute('datetime', `PT${Math.floor(seconds)}S`);
  }

  function setStage(stage) {
    const name = stage === null ? 'idle' : stage;
    if (!Object.hasOwn(STAGE_LABELS, name)) return;
    const current = name === 'complete' ? STAGES.length : STAGES.indexOf(name);
    panel.dataset.stage = name;
    $('progress-stage-label').textContent = STAGE_LABELS[name];
    $('progress-completed').textContent = `${Math.max(0, current)} / 3 complete`;
    for (const step of steps) {
      const index = STAGES.indexOf(step.dataset.stage);
      const state = index < current ? 'complete' : index === current ? 'current' : 'upcoming';
      step.dataset.state = state;
      step.querySelector('.stage-marker').textContent =
        state === 'complete' ? '✓' : String(index + 1);
      step.querySelector('.stage-status').textContent =
        state === 'complete' ? 'Complete' : state === 'current' ? 'Running' : 'Waiting';
      if (state === 'current') step.setAttribute('aria-current', 'step');
      else step.removeAttribute('aria-current');
    }
  }

  function stop() {
    finalSeconds = elapsedSeconds();
    startedAt = null;
    clearInterval(timer);
    timer = null;
    panel.dataset.running = 'false';
    renderElapsed();
  }

  function start(profile) {
    stop();
    const { memoryKiB, iterations: passes } = profile.argon2id;
    $('progress-memory-meta').textContent =
      `Argon2id · ${memoryLabel(memoryKiB)} · ${number.format(passes)} ${passes === 1 ? 'pass' : 'passes'}`;
    $('progress-cpu-meta').textContent =
      `PBKDF2-SHA256 · ${number.format(profile.pbkdf2.iterations)} iterations`;
    finalSeconds = 0;
    startedAt = performance.now();
    panel.dataset.running = 'true';
    setStage(null);
    renderElapsed();
    timer = setInterval(renderElapsed, 250);
  }

  return { start, setStage, stop, elapsedSeconds };
}
