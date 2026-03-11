import { js_eventEmitter } from './js_eventEmitter.js';
import { EVENTS as js_event } from './js_eventList.js';
import * as js_andruavMessages from './protocol/js_andruavMessages.js';
import * as js_andruavUnit from './js_andruavUnit.js';
import { fn_opsHealthAddEvent } from './js_ops_health.js';
import { fn_uiAlertsAdd } from './js_ui_alerts.js';

const COMMAND_TIMEOUT_MS = 12000;
const HOME_TIMEOUT_MS = 15000;
const HOME_TOLERANCE_DEG = 0.00012;

const STORE = {
  initialized: false,
  seq: 0,
  pendingByKey: {},
  listener: { id: 'command-feedback' },
  timerID: null,
};

function fn_now() {
  return Date.now();
}

function fn_toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function fn_partyIDFromUnit(unit) {
  if (!unit || typeof unit.getPartyID !== 'function') return '';
  return String(unit.getPartyID() || '');
}

function fn_unitNameFromUnit(unit, fallback = '') {
  if (!unit) return fallback;
  const name = String(unit.m_unitName || '').trim();
  if (name) return name;
  return fn_partyIDFromUnit(unit) || fallback;
}

function fn_pendingKey(kind, partyID) {
  return `${String(kind || '')}:${String(partyID || '')}`;
}

function fn_isHomeMatched(unit, expected) {
  if (!unit || !expected) return false;
  const home = unit?.m_Geo_Tags?.p_HomePoint;
  if (!home || home.m_isValid !== true) return false;
  const homeLat = Number(home.lat);
  const homeLng = Number(home.lng);
  if (!Number.isFinite(homeLat) || !Number.isFinite(homeLng)) return false;
  const expLat = Number(expected.lat);
  const expLng = Number(expected.lng);
  if (!Number.isFinite(expLat) || !Number.isFinite(expLng)) return false;
  return (
    Math.abs(homeLat - expLat) <= HOME_TOLERANCE_DEG
    && Math.abs(homeLng - expLng) <= HOME_TOLERANCE_DEG
  );
}

function fn_modeAliases(targetMode) {
  switch (fn_toNumber(targetMode, -1)) {
    case js_andruavUnit.CONST_FLIGHT_CONTROL_LOITER:
      return [
        js_andruavUnit.CONST_FLIGHT_CONTROL_LOITER,
        js_andruavUnit.CONST_FLIGHT_CONTROL_HOLD,
        js_andruavUnit.CONST_FLIGHT_PX4_AUTO_HOLD,
      ];

    case js_andruavUnit.CONST_FLIGHT_CONTROL_RTL:
      return [
        js_andruavUnit.CONST_FLIGHT_CONTROL_RTL,
        js_andruavUnit.CONST_FLIGHT_CONTROL_SMART_RTL,
        js_andruavUnit.CONST_FLIGHT_CONTROL_QRTL,
        js_andruavUnit.CONST_FLIGHT_PX4_AUTO_RTL,
      ];

    case js_andruavUnit.CONST_FLIGHT_CONTROL_LAND:
      return [
        js_andruavUnit.CONST_FLIGHT_CONTROL_LAND,
        js_andruavUnit.CONST_FLIGHT_CONTROL_QLAND,
        js_andruavUnit.CONST_FLIGHT_PX4_AUTO_LAND,
      ];

    default:
      return [fn_toNumber(targetMode, -1)];
  }
}

function fn_modeMatches(actualMode, expectedMode) {
  const actual = fn_toNumber(actualMode, -1);
  return fn_modeAliases(expectedMode).some((mode) => fn_toNumber(mode, -99) === actual);
}

function fn_emitConfirmed(entry, detail = '') {
  const suffix = detail ? ` (${detail})` : '';
  fn_opsHealthAddEvent({
    source: 'cmd',
    level: 'info',
    partyID: entry.partyID,
    message: `${entry.label} confirmed for ${entry.unitName}${suffix}`,
  });
}

function fn_emitFailed(entry, reason) {
  const message = `${entry.label} not confirmed for ${entry.unitName}: ${reason}`;
  fn_opsHealthAddEvent({
    source: 'cmd',
    level: 'warn',
    partyID: entry.partyID,
    message: message,
  });
  fn_uiAlertsAdd({
    source: 'cmd',
    level: 'warn',
    partyID: entry.partyID,
    message: message,
  });
}

function fn_removePendingByKey(key) {
  if (!key) return null;
  const current = STORE.pendingByKey[key];
  if (!current) return null;
  delete STORE.pendingByKey[key];
  return current;
}

function fn_confirmEntry(entry, detail = '') {
  if (!entry) return;
  fn_removePendingByKey(entry.key);
  fn_emitConfirmed(entry, detail);
}

function fn_failEntry(entry, reason) {
  if (!entry) return;
  fn_removePendingByKey(entry.key);
  fn_emitFailed(entry, reason || 'timeout');
}

function fn_registerPending(entry, sendAccepted, unitForImmediateCheck = null) {
  if (!entry || !entry.partyID || !entry.key) return false;

  if (sendAccepted !== true) {
    fn_emitFailed(entry, 'send failed (websocket not ready)');
    return false;
  }

  if (entry.kind === 'arm' && unitForImmediateCheck) {
    if (unitForImmediateCheck.m_isArmed === (entry.expected?.armed === true)) {
      fn_emitConfirmed(entry, 'already in requested state');
      return true;
    }
  }

  if (entry.kind === 'mode' && unitForImmediateCheck) {
    if (fn_modeMatches(unitForImmediateCheck.m_flightMode, entry.expected?.mode)) {
      fn_emitConfirmed(entry, 'already in requested mode');
      return true;
    }
  }

  if (entry.kind === 'home' && unitForImmediateCheck) {
    if (fn_isHomeMatched(unitForImmediateCheck, entry.expected)) {
      fn_emitConfirmed(entry, 'already matching requested home');
      return true;
    }
  }

  STORE.pendingByKey[entry.key] = entry;
  return true;
}

function fn_checkUnit(unit) {
  const partyID = fn_partyIDFromUnit(unit);
  if (!partyID) return;

  const armEntry = STORE.pendingByKey[fn_pendingKey('arm', partyID)];
  if (armEntry && unit.m_isArmed === (armEntry.expected?.armed === true)) {
    fn_confirmEntry(armEntry);
  }

  const modeEntry = STORE.pendingByKey[fn_pendingKey('mode', partyID)];
  if (modeEntry && fn_modeMatches(unit.m_flightMode, modeEntry.expected?.mode)) {
    fn_confirmEntry(modeEntry);
  }

  const homeEntry = STORE.pendingByKey[fn_pendingKey('home', partyID)];
  if (homeEntry && fn_isHomeMatched(unit, homeEntry.expected)) {
    fn_confirmEntry(homeEntry);
  }
}

function fn_failAllPending(reason) {
  const keys = Object.keys(STORE.pendingByKey);
  for (const key of keys) {
    const entry = STORE.pendingByKey[key];
    fn_failEntry(entry, reason);
  }
}

function fn_checkTimeouts() {
  const now = fn_now();
  const keys = Object.keys(STORE.pendingByKey);
  for (const key of keys) {
    const entry = STORE.pendingByKey[key];
    if (!entry) continue;
    if (entry.expiresAt <= now) {
      fn_failEntry(entry, 'timeout waiting for telemetry confirmation');
    }
  }
}

function fn_onSocketStatus(me, event) {
  const status = event?.status;
  const reason = String(event?.reason || '').trim();
  if (status === js_andruavMessages.CONST_SOCKET_STATUS_DISCONNECTED && event?.retrying !== true) {
    fn_failAllPending(reason || 'connection disconnected');
    return;
  }
  if (status === js_andruavMessages.CONST_SOCKET_STATUS_ERROR && event?.failed === true) {
    fn_failAllPending(reason || 'connection failed');
  }
}

export function fn_commandFeedbackInit() {
  if (STORE.initialized === true) return;
  STORE.initialized = true;

  js_eventEmitter.fn_subscribe(js_event.EE_unitUpdated, STORE.listener, (me, unit) => fn_checkUnit(unit));
  js_eventEmitter.fn_subscribe(js_event.EE_andruavUnitArmedUpdated, STORE.listener, (me, unit) => fn_checkUnit(unit));
  js_eventEmitter.fn_subscribe(js_event.EE_andruavUnitFightModeUpdated, STORE.listener, (me, unit) => fn_checkUnit(unit));
  js_eventEmitter.fn_subscribe(js_event.EE_HomePointChanged, STORE.listener, (me, unit) => fn_checkUnit(unit));
  js_eventEmitter.fn_subscribe(js_event.EE_onSocketStatus, STORE.listener, fn_onSocketStatus);

  STORE.timerID = setInterval(fn_checkTimeouts, 500);
}

export function fn_commandFeedbackReset() {
  STORE.pendingByKey = {};
}

export function fn_commandFeedbackTrackArm(unit, targetArmed, sendAccepted, options = {}) {
  const partyID = fn_partyIDFromUnit(unit);
  if (!partyID) return false;
  const unitName = fn_unitNameFromUnit(unit, partyID);
  const entry = {
    id: `cmd_${++STORE.seq}`,
    key: fn_pendingKey('arm', partyID),
    kind: 'arm',
    partyID: partyID,
    unitName: unitName,
    label: options.label || (targetArmed === true ? 'ARM' : 'DISARM'),
    expected: { armed: targetArmed === true },
    createdAt: fn_now(),
    expiresAt: fn_now() + fn_toNumber(options.timeoutMs, COMMAND_TIMEOUT_MS),
  };
  return fn_registerPending(entry, sendAccepted, unit);
}

export function fn_commandFeedbackTrackFlightMode(unit, targetMode, sendAccepted, options = {}) {
  const partyID = fn_partyIDFromUnit(unit);
  if (!partyID) return false;
  const unitName = fn_unitNameFromUnit(unit, partyID);
  const entry = {
    id: `cmd_${++STORE.seq}`,
    key: fn_pendingKey('mode', partyID),
    kind: 'mode',
    partyID: partyID,
    unitName: unitName,
    label: options.label || `Mode ${targetMode}`,
    expected: { mode: targetMode },
    createdAt: fn_now(),
    expiresAt: fn_now() + fn_toNumber(options.timeoutMs, COMMAND_TIMEOUT_MS),
  };
  return fn_registerPending(entry, sendAccepted, unit);
}

export function fn_commandFeedbackTrackSetHome(partyID, unitName, targetLat, targetLng, sendAccepted, unit = null, options = {}) {
  if (!partyID) return false;
  const resolvedName = String(unitName || partyID);
  const entry = {
    id: `cmd_${++STORE.seq}`,
    key: fn_pendingKey('home', partyID),
    kind: 'home',
    partyID: String(partyID),
    unitName: resolvedName,
    label: options.label || 'Set Home',
    expected: {
      lat: Number(targetLat),
      lng: Number(targetLng),
    },
    createdAt: fn_now(),
    expiresAt: fn_now() + fn_toNumber(options.timeoutMs, HOME_TIMEOUT_MS),
  };
  return fn_registerPending(entry, sendAccepted, unit);
}

export function fn_commandFeedbackTrackDispatch(partyID, unitName, label, sendAccepted) {
  const resolvedPartyID = String(partyID || '');
  const resolvedUnitName = String(unitName || resolvedPartyID || 'unit');
  const resolvedLabel = String(label || 'Command');
  if (sendAccepted === true) {
    fn_opsHealthAddEvent({
      source: 'cmd',
      level: 'info',
      partyID: resolvedPartyID,
      message: `${resolvedLabel} requested for ${resolvedUnitName}`,
    });
    return true;
  }

  fn_emitFailed({
    partyID: resolvedPartyID,
    unitName: resolvedUnitName,
    label: resolvedLabel,
  }, 'send failed (websocket not ready)');
  return false;
}

export function fn_commandFeedbackSnapshot() {
  return {
    pending: Object.keys(STORE.pendingByKey).map((key) => ({ ...STORE.pendingByKey[key] })),
  };
}
