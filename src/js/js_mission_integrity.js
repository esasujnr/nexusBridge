import { EVENTS as js_event } from './js_eventList.js';
import { js_eventEmitter } from './js_eventEmitter.js';

const STORE = {
  units: {},
};

function fn_now() {
  return Date.now();
}

function fn_hashString32(value) {
  const text = String(value || '');
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function fn_checksumWaypoints(waypoints) {
  if (!Array.isArray(waypoints) || waypoints.length === 0) return 'empty';
  const rows = waypoints.map((wp) => {
    if (!wp || typeof wp !== 'object') return '';
    const lat = Number.isFinite(wp.Latitude) ? wp.Latitude.toFixed(7) : '';
    const lng = Number.isFinite(wp.Longitude) ? wp.Longitude.toFixed(7) : '';
    const alt = Number.isFinite(wp.Altitude) ? wp.Altitude.toFixed(2) : '';
    const type = Number.isFinite(wp.waypointType) ? String(wp.waypointType) : '';
    const seq = Number.isFinite(wp.m_Sequence) ? String(wp.m_Sequence) : '';
    const radius = Number.isFinite(wp.m_Radius) ? wp.m_Radius.toFixed(2) : '';
    const turns = Number.isFinite(wp.m_Turns) ? String(wp.m_Turns) : '';
    return `${seq}|${type}|${lat}|${lng}|${alt}|${radius}|${turns}`;
  });
  return fn_hashString32(rows.join(';'));
}

function fn_defaultUnit(partyID, unitName = '') {
  return {
    partyID: partyID || '',
    unitName: unitName || partyID || '',
    droneVersion: 0,
    mapVersion: 0,
    droneChecksum: 'unknown',
    mapChecksum: 'unknown',
    stale: false,
    staleReason: '',
    pendingRead: false,
    updatedAt: 0,
  };
}

function fn_ensureUnit(partyID, unitName = '') {
  if (!partyID) return null;
  if (!STORE.units[partyID]) {
    STORE.units[partyID] = fn_defaultUnit(partyID, unitName);
  }
  if (unitName) {
    STORE.units[partyID].unitName = unitName;
  }
  return STORE.units[partyID];
}

function fn_cloneSnapshot() {
  const clonedUnits = {};
  Object.keys(STORE.units).forEach((partyID) => {
    clonedUnits[partyID] = { ...STORE.units[partyID] };
  });
  return {
    units: clonedUnits,
  };
}

function fn_emitUpdated() {
  if (!js_event || !js_event.EE_missionIntegrityUpdated) return;
  js_eventEmitter.fn_dispatch(js_event.EE_missionIntegrityUpdated, fn_cloneSnapshot());
}

export function fn_missionIntegritySnapshot() {
  return fn_cloneSnapshot();
}

export function fn_missionIntegrityGetUnit(partyID) {
  const unit = fn_ensureUnit(partyID);
  if (!unit) return null;
  return { ...unit };
}

export function fn_missionIntegrityReset() {
  STORE.units = {};
  fn_emitUpdated();
}

export function fn_missionIntegrityMarkReadRequested(partyID, unitName = '') {
  const unit = fn_ensureUnit(partyID, unitName);
  if (!unit) return;
  unit.pendingRead = true;
  unit.staleReason = unit.staleReason || 'read_pending';
  unit.updatedAt = fn_now();
  fn_emitUpdated();
}

export function fn_missionIntegrityMarkDroneMutationExpected(partyID, reason = 'mission_write_pending', unitName = '') {
  const unit = fn_ensureUnit(partyID, unitName);
  if (!unit) return;
  unit.pendingRead = true;
  unit.stale = true;
  unit.staleReason = reason;
  unit.updatedAt = fn_now();
  fn_emitUpdated();
}

export function fn_missionIntegrityMarkMapCleared(partyID, unitName = '') {
  const unit = fn_ensureUnit(partyID, unitName);
  if (!unit) return;
  unit.mapVersion += 1;
  unit.mapChecksum = 'empty';
  unit.pendingRead = false;
  unit.stale = unit.droneChecksum !== 'unknown' && unit.droneChecksum !== 'empty';
  unit.staleReason = unit.stale ? 'map_cleared_local' : '';
  unit.updatedAt = fn_now();
  fn_emitUpdated();
}

export function fn_missionIntegrityUpdateFromDroneMission(partyID, unitName, waypoints) {
  const unit = fn_ensureUnit(partyID, unitName);
  if (!unit) return;
  const checksum = fn_checksumWaypoints(waypoints);
  unit.droneVersion += 1;
  unit.mapVersion = unit.droneVersion;
  unit.droneChecksum = checksum;
  unit.mapChecksum = checksum;
  unit.pendingRead = false;
  unit.stale = false;
  unit.staleReason = '';
  unit.updatedAt = fn_now();
  fn_emitUpdated();
}

export function fn_missionIntegrityMarkUnitOffline(partyID) {
  if (!partyID || !STORE.units[partyID]) return;
  STORE.units[partyID].updatedAt = fn_now();
  fn_emitUpdated();
}
