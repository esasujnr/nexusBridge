import { EVENTS as js_event } from './js_eventList.js';
import { js_eventEmitter } from './js_eventEmitter.js';

const MAX_ALERT_EVENTS = 80;

const uiAlertStore = {
  sequence: 0,
  events: [],
};

function fn_normalizeLevel(level) {
  if (level === 'error' || level === 'warn' || level === 'info') return level;
  return 'info';
}

function fn_cloneSnapshot() {
  return {
    events: uiAlertStore.events.map((entry) => ({ ...entry })),
  };
}

function fn_emitUpdated() {
  if (!js_event || !js_event.EE_uiAlertEvent) return;
  js_eventEmitter.fn_dispatch(js_event.EE_uiAlertEvent, fn_cloneSnapshot());
}

export function fn_uiAlertsSnapshot() {
  return fn_cloneSnapshot();
}

export function fn_uiAlertsAdd(entry = {}) {
  const message = String(entry.message || '').trim();
  if (message.length === 0) return null;

  const next = {
    id: `ua_${Date.now()}_${++uiAlertStore.sequence}`,
    ts: Date.now(),
    level: fn_normalizeLevel(entry.level),
    source: String(entry.source || 'system'),
    message: message,
    partyID: entry.partyID ? String(entry.partyID) : '',
    ack: false,
  };

  uiAlertStore.events.unshift(next);
  if (uiAlertStore.events.length > MAX_ALERT_EVENTS) {
    uiAlertStore.events = uiAlertStore.events.slice(0, MAX_ALERT_EVENTS);
  }
  fn_emitUpdated();
  return next.id;
}

export function fn_uiAlertsAcknowledge(alertID, ack = true) {
  if (!alertID) return;
  const idx = uiAlertStore.events.findIndex((entry) => entry.id === alertID);
  if (idx < 0) return;
  uiAlertStore.events[idx] = {
    ...uiAlertStore.events[idx],
    ack: ack === true,
  };
  fn_emitUpdated();
}

export function fn_uiAlertsAcknowledgeAll() {
  if (uiAlertStore.events.length === 0) return;
  uiAlertStore.events = uiAlertStore.events.map((entry) => ({ ...entry, ack: true }));
  fn_emitUpdated();
}

export function fn_uiAlertsClear(onlyAcknowledged = false) {
  if (onlyAcknowledged === true) {
    uiAlertStore.events = uiAlertStore.events.filter((entry) => entry.ack !== true);
  } else {
    uiAlertStore.events = [];
  }
  fn_emitUpdated();
}

export function fn_uiAlertsReset() {
  uiAlertStore.events = [];
  fn_emitUpdated();
}

