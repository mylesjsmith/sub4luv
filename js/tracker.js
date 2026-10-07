/**
 * RenewalTracker: 30-day Twitch Prime sub renewal tracker.
 *
 * HOW IT WORKS (three states)
 *   READY      nothing in progress (never subscribed, or the last 30 days are over)
 *   PENDING    the visitor clicked the Twitch link. A short grace period runs (CONFIG.pendingDelayMs, 5 min).
 *   COUNTDOWN  starts AUTOMATICALLY when the grace period ends (click time + 5 min), or sooner if you call
 *              confirmSubscribed() / use a [data-tracker-confirm] button. The 30-day timer runs from that moment.
 *   Only two ISO timestamps are stored: pendingSince and lastConfirmed. The state itself is never
 *   stored, it is DERIVED from them each time, so reloads, other tabs and sleeping laptops can't drift.
 *   NOTE: a static page cannot verify a Twitch subscription, so the delay is a stand-in for "they finished signing up".
 *   Returning after the delay (even days later) still gives the right result: it is all derived from timestamps.
 *
 * DOM HOOKS (all optional except the root and the button; add your own classes freely)
 *   [data-tracker]               root element. Gets data-state="ready" | "countdown".
 *       data-link="https://..."      Twitch sub link to open (overrides CONFIG.link)
 *       data-window-ms="60000"       override the 30-day window, handy for testing
 *       data-pending-delay-ms="10000" override the 5-minute grace period, handy for testing
 *       data-dev                     show the [data-tracker-dev] controls
 *       data-text-ready / data-text-pending / data-text-renew / data-text-countdown   text for [data-tracker-status]
 *                                    (renew = READY again after a finished countdown)
 *   #sub-btn                     the action button (selector is in CONFIG.selectors).
 *                                Never disabled: clicking it mid-countdown just REOPENS the Twitch link
 *                                (so a failed sign-up can be redone) and leaves the timer untouched.
 *       data-label-ready / data-label-pending / data-label-renew / data-label-countdown   button text per state
 *   [data-unit="days|hours|minutes|seconds"]   receive the zero-padded countdown numbers
 *   root[data-last-hour]         present while COUNTDOWN has under 1 hour left (handy when you only show days + hours)
 *   [data-pending-time]          receives the m:ss left in the grace period while PENDING
 *   [data-tracker-progress]      gets style.width = % of the window elapsed (a progress bar)
 *   [data-tracker-next]          receives the date the next sub unlocks (<time datetime=...>)
 *   [data-tracker-last]          receives the date of the last click
 *   [data-tracker-status]        receives the status sentence
 *   [data-show-when="ready pending countdown"]  elements shown only in the listed state(s), space separated
 *   [data-tracker-confirm]       "I've subscribed": starts the 30-day timer (use with data-show-when="pending")
 *   [data-tracker-cancel]        "not yet": drops the pending state and goes back to READY
 *   [data-tracker-reset]         clears the timer (testing)
 *   [data-tracker-dev]           hidden unless data-dev is on the root or the URL has ?trackerDev
 *
 * EVENTS (dispatched on the root, bubbling): tracker:statechange, tracker:tick, tracker:pending, tracker:confirm, tracker:cancel, tracker:reopen, tracker:reset
 *   Each carries event.detail = the snapshot (see getSnapshot).
 *
 * CONSOLE / TESTING API
 *   RenewalTracker.getSnapshot()
 *   RenewalTracker.beginPending() / confirmSubscribed() / cancelPending()   same as the buttons
 *   RenewalTracker.reset()
 *   RenewalTracker.simulateElapsed(ms)   pretend the last click was `ms` ago
 *   RenewalTracker.setLastClick(isoOrMs)
 *   (state is data-state="ready" | "pending" | "countdown" on the root)
 *   Tip: RenewalTracker.simulateElapsed(RenewalTracker.config.windowMs - 10000) -> READY in 10 s.
 */
(function () {
  'use strict';

  /* ============================== 1. CONFIG ============================== */
  const SECOND = 1000, MINUTE = 60 * SECOND, HOUR = 60 * MINUTE, DAY = 24 * HOUR;

  const CONFIG = {
    storageKey: 'sub4luv:lastSubClick',     // ISO time the visitor CONFIRMED their sub (timer start)
    pendingKey: 'sub4luv:pendingSince',     // ISO time they opened Twitch but haven't confirmed
    windowMs: 30 * DAY,                     // 30 * 24 * 60 * 60 * 1000
    pendingDelayMs: 5 * MINUTE,             // countdown auto-starts this long after the click
    tickMs: 1000,                           // countdown refresh rate
    link: 'https://www.twitch.tv/subs/sub4luvv', // Twitch sub link opened on click
    selectors: {
      root: '[data-tracker]',
      button: '#sub-btn',
      reset: '[data-tracker-reset]',
      dev: '[data-tracker-dev]',
      status: '[data-tracker-status]',
      progress: '[data-tracker-progress]',
      pendingTime: '[data-pending-time]',
      confirm: '[data-tracker-confirm]',
      cancel: '[data-tracker-cancel]',
      next: '[data-tracker-next]',
      last: '[data-tracker-last]',
      showWhen: '[data-show-when]',
      unit: '[data-unit]',
    },
    text: {                                  // fallbacks if the markup has no data-text-*
      ready: 'Your free sub is ready.',
      pending: 'Finish subscribing on Twitch.',
      renew: 'A month has passed. Time to resubscribe.',
      countdown: 'Your next free sub unlocks in:',
      btnReady: 'Get your free sub',
      btnRenew: 'Resubscribe',
      btnPending: 'Open Twitch again',
      btnCountdown: 'Open sub page',
    },
  };

  const State = Object.freeze({ READY: 'READY', PENDING: 'PENDING', COUNTDOWN: 'COUNTDOWN' });

  /* ======================== 2. STORAGE (safe wrapper) ===================== */
  // localStorage can throw (private mode, blocked cookies, sandboxed iframes).
  // We always mirror into memory so the tracker still works for the current page view.
  const memory = {};
  const store = {
    get(key) {
      let v = null;
      try { v = localStorage.getItem(key); } catch (e) { /* ignore */ }
      return v !== null && v !== undefined ? v : (memory[key] !== undefined ? memory[key] : null);
    },
    set(key, value) {
      memory[key] = value;
      try { localStorage.setItem(key, value); } catch (e) { /* memory fallback only */ }
    },
    remove(key) {
      delete memory[key];
      try { localStorage.removeItem(key); } catch (e) { /* ignore */ }
    },
  };

  /* ===================== 3. STATE LOGIC (pure, no DOM) ==================== */
  let windowMs = CONFIG.windowMs;           // may be overridden by data-window-ms in init()
  let pendingDelayMs = CONFIG.pendingDelayMs; // may be overridden by data-pending-delay-ms in init()

  /** Read an ISO timestamp from storage as epoch ms, or null if missing/corrupt (corrupt data self-heals). */
  function readTime(key) {
    const raw = store.get(key);
    if (!raw) return null;
    const ms = Date.parse(raw);
    if (Number.isNaN(ms)) { store.remove(key); return null; }
    return ms;
  }
  const readLastClick = () => readTime(CONFIG.storageKey);   // when they confirmed
  const readPending = () => readTime(CONFIG.pendingKey);     // when they opened Twitch

  /**
   * Derive the full state from storage + the clock. Pure: same inputs, same output (it never writes).
   * Priority: COUNTDOWN (an unexpired confirmed start) > PENDING (inside the grace period) > READY.
   * A pending click older than the grace period is "promoted": its start becomes click time + delay,
   * reported in `promoteToMs` so sync() can persist it.
   */
  function computeSnapshot(now = Date.now()) {
    let last = readLastClick();
    const pending = readPending();

    let promoteToMs = null;
    if (pending !== null && now - pending >= pendingDelayMs) {   // grace period over -> auto-start
      promoteToMs = pending + pendingDelayMs;
      last = promoteToMs;
    }

    const snap = {
      state: State.READY, lastClickMs: last, elapsedMs: null, remainingMs: 0,
      nextAvailableMs: last === null ? null : last + windowMs,
      pendingSinceMs: promoteToMs !== null ? null : pending, pendingRemainingMs: 0, promoteToMs,
    };

    if (last !== null) {
      snap.elapsedMs = Math.max(0, now - last);               // clamp: protects against a clock set backwards
      snap.remainingMs = windowMs - snap.elapsedMs;
      if (snap.remainingMs > 0) { snap.state = State.COUNTDOWN; return snap; }
      snap.remainingMs = 0;
    }
    if (promoteToMs === null && pending !== null) {
      snap.state = State.PENDING;
      snap.pendingRemainingMs = Math.min(pendingDelayMs, Math.max(0, pendingDelayMs - (now - pending)));
    }
    return snap;
  }

  /** ms -> {days, hours, minutes, seconds} (whole numbers). */
  function splitDuration(ms) {
    const t = Math.max(0, Math.ceil(ms / SECOND));        // ceil so 0.4 s left still shows 1 s, never "00" early
    return {
      days: Math.floor(t / 86400),
      hours: Math.floor((t % 86400) / 3600),
      minutes: Math.floor((t % 3600) / 60),
      seconds: t % 60,
    };
  }
  const pad2 = (n) => String(n).padStart(2, '0');

  /* ============================== 4. DOM LAYER ============================ */
  let root = null, btn = null, currentState = null, timerId = null;
  const $$ = (sel, scope) => Array.from((scope || document).querySelectorAll(sel));

  function emit(name, detail) {
    if (root) root.dispatchEvent(new CustomEvent(name, { detail, bubbles: true }));
  }

  function formatDate(ms) {
    return new Date(ms).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  }

  /** Push a snapshot into the DOM. Never touches classes, only attributes/text, so your CSS stays yours. */
  function render(snap) {
    if (!root) return;
    const isReady = snap.state === State.READY;
    const isPending = snap.state === State.PENDING;
    const renew = isReady && snap.lastClickMs !== null;      // READY again after a finished countdown
    root.dataset.state = snap.state.toLowerCase();       // ready | pending | countdown
    root.toggleAttribute('data-renew', renew);
    root.toggleAttribute('data-last-hour', snap.state === State.COUNTDOWN && snap.remainingMs < HOUR);

    // Show/hide state-specific blocks.
    $$(CONFIG.selectors.showWhen, root).forEach((el) => {
      el.hidden = el.dataset.showWhen.split(/\s+/).indexOf(root.dataset.state) === -1;
    });

    // Countdown numbers.
    const parts = splitDuration(snap.remainingMs);
    $$(CONFIG.selectors.unit, root).forEach((el) => {
      const v = parts[el.dataset.unit];
      if (v !== undefined) el.textContent = pad2(v);
    });

    // Dates.
    $$(CONFIG.selectors.next, root).forEach((el) => {
      el.textContent = snap.nextAvailableMs ? formatDate(snap.nextAvailableMs) : '';
      if (snap.nextAvailableMs) el.setAttribute('datetime', new Date(snap.nextAvailableMs).toISOString());
    });
    $$(CONFIG.selectors.last, root).forEach((el) => {
      el.textContent = snap.lastClickMs ? formatDate(snap.lastClickMs) : '';
    });

    // Status sentence.
    $$(CONFIG.selectors.status, root).forEach((el) => {
      el.textContent = isPending ? (root.dataset.textPending || CONFIG.text.pending)
        : !isReady ? (root.dataset.textCountdown || CONFIG.text.countdown)
        : renew ? (root.dataset.textRenew || CONFIG.text.renew)
        : (root.dataset.textReady || CONFIG.text.ready);
    });

    // Grace-period clock (m:ss) while PENDING.
    const ps = Math.ceil(snap.pendingRemainingMs / SECOND);
    $$(CONFIG.selectors.pendingTime, root).forEach((el) => { el.textContent = Math.floor(ps / 60) + ':' + pad2(ps % 60); });

    // Progress bar (0 to 100 % of the window).
    const pct = snap.lastClickMs === null ? 0 : Math.min(100, (snap.elapsedMs / windowMs) * 100);
    $$(CONFIG.selectors.progress, root).forEach((el) => { el.style.width = pct.toFixed(2) + '%'; });

    // Action button: always enabled (never greyed out). Only its label changes per state.
    if (btn) {
      const label = isPending ? (btn.dataset.labelPending || CONFIG.text.btnPending)
        : !isReady ? (btn.dataset.labelCountdown || CONFIG.text.btnCountdown)
        : renew ? (btn.dataset.labelRenew || CONFIG.text.btnRenew)
        : (btn.dataset.labelReady || CONFIG.text.btnReady);
      const labelEl = btn.querySelector('[data-tracker-btn-label]');
      (labelEl || btn).textContent = label;
    }
  }

  /* =============================== 5. TIMER =============================== */
  function startTimer() {
    if (timerId === null) timerId = setInterval(sync, CONFIG.tickMs);
  }
  function stopTimer() {
    if (timerId !== null) { clearInterval(timerId); timerId = null; }
  }

  /**
   * The single "heartbeat": recompute from storage + clock, render, announce changes.
   * The remaining time is re-derived from Date.now() every tick (never decremented),
   * so throttled background tabs and sleeping devices cannot cause drift.
   */
  function sync() {
    let snap = computeSnapshot();
    const promoted = snap.promoteToMs !== null;
    if (promoted) {                                           // grace period finished: persist the auto-start
      store.set(CONFIG.storageKey, new Date(snap.promoteToMs).toISOString());
      store.remove(CONFIG.pendingKey);
      snap = computeSnapshot();
    }
    const changed = snap.state !== currentState;
    currentState = snap.state;
    render(snap);
    if (changed) emit('tracker:statechange', snap);
    if (promoted) emit('tracker:confirm', snap);
    emit('tracker:tick', snap);

    if (snap.state !== State.READY) startTimer();             // PENDING and COUNTDOWN both need the heartbeat
    else stopTimer();                                         // READY: nothing to count
    return snap;
  }

  /* ============================== 6. ACTIONS ============================== */
  const openLink = () =>
    // Call inside the click handler so popup blockers allow it. (With 'noopener' the browser returns
    // null even on success, so the result can't be checked.)
    window.open((root && root.dataset.link) || CONFIG.link, '_blank', 'noopener,noreferrer');

  /** READY -> PENDING. Opens Twitch but does NOT start the timer. */
  function beginPending() {
    store.set(CONFIG.pendingKey, new Date().toISOString());
    const snap = sync();
    emit('tracker:pending', snap);
    return snap;
  }

  /** PENDING/READY -> COUNTDOWN. Called when the visitor confirms they subscribed: THIS starts the timer. */
  function confirmSubscribed() {
    if (computeSnapshot().state === State.COUNTDOWN) return computeSnapshot(); // already counting, ignore
    store.set(CONFIG.storageKey, new Date().toISOString());
    store.remove(CONFIG.pendingKey);
    const snap = sync();
    emit('tracker:confirm', snap);
    return snap;
  }

  /** PENDING -> READY ("not yet"). */
  function cancelPending() {
    store.remove(CONFIG.pendingKey);
    const snap = sync();
    emit('tracker:cancel', snap);
    return snap;
  }

  /**
   * Main button (#sub-btn). It is never disabled so a failed sign-up can always be retried.
   *  - READY:              open Twitch + go PENDING (countdown auto-starts after the grace period)
   *  - PENDING/COUNTDOWN:  just reopen Twitch, nothing else changes
   */
  function handleSubClick() {
    const wasReady = computeSnapshot().state === State.READY;
    openLink();
    if (wasReady) beginPending();
    else emit('tracker:reopen', computeSnapshot());
  }

  /** Manual control: clear everything and go back to READY. */
  function reset() {
    store.remove(CONFIG.storageKey);
    store.remove(CONFIG.pendingKey);
    stopTimer();
    const snap = sync();
    emit('tracker:reset', snap);
    return snap;
  }

  /** Testing helpers. */
  function setLastClick(isoOrMs) {
    const ms = typeof isoOrMs === 'number' ? isoOrMs : Date.parse(isoOrMs);
    if (Number.isNaN(ms)) throw new Error('setLastClick expects an ISO string or epoch ms');
    store.set(CONFIG.storageKey, new Date(ms).toISOString());
    store.remove(CONFIG.pendingKey);
    return sync();
  }
  const simulateElapsed = (msAgo) => setLastClick(Date.now() - msAgo);

  /* ================================ 7. INIT =============================== */
  function init() {
    root = document.querySelector(CONFIG.selectors.root);
    if (!root) return;                                      // nothing to drive
    btn = root.querySelector(CONFIG.selectors.button) || document.querySelector(CONFIG.selectors.button);

    const override = Number(root.dataset.windowMs);         // optional test overrides
    if (override > 0) windowMs = override;
    const delayOverride = Number(root.dataset.pendingDelayMs);
    if (delayOverride > 0) pendingDelayMs = delayOverride;

    if (btn) btn.addEventListener('click', handleSubClick);
    $$(CONFIG.selectors.reset, root).forEach((el) => el.addEventListener('click', reset));
    $$(CONFIG.selectors.confirm, root).forEach((el) => el.addEventListener('click', confirmSubscribed));
    $$(CONFIG.selectors.cancel, root).forEach((el) => el.addEventListener('click', cancelPending));

    // Dev-only controls.
    const dev = root.hasAttribute('data-dev') || /[?&]trackerDev\b/.test(location.search);
    $$(CONFIG.selectors.dev, root).forEach((el) => { el.hidden = !dev; });

    // Keep other tabs and sleeping tabs honest.
    window.addEventListener('storage', (e) => {
      if (e.key === CONFIG.storageKey || e.key === CONFIG.pendingKey || e.key === null) sync();
    });
    // Coming back from the Twitch tab while PENDING: nudge the visitor to confirm (data-attention for ~3.5 s).
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) return;
      if (sync().state === State.PENDING) {
        root.setAttribute('data-attention', '');
        setTimeout(() => root.removeAttribute('data-attention'), 3500);
      }
    });

    sync();                                                 // initial state from storage
  }

  window.RenewalTracker = {
    init, reset, refresh: () => sync(), setLastClick, simulateElapsed, beginPending, confirmSubscribed, cancelPending,
    getSnapshot: () => computeSnapshot(),
    config: CONFIG,
    _internals: { computeSnapshot, splitDuration },         // exposed for unit tests
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
