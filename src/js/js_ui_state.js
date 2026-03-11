import { js_globals } from './js_globals.js';
import { EVENTS as js_event } from './js_eventList.js';
import { js_eventEmitter } from './js_eventEmitter.js';

const DEFAULT_MISSION_LAYER_STATE = Object.freeze({
  visible: true,
  opacity: 0.9,
});

function fn_clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function fn_cloneSnapshot() {
  return {
    focusMode: js_globals.v_ui_focus_mode === true,
    focusPartyID: js_globals.v_ui_focus_party_id || null,
    activePartyID: js_globals.v_ui_active_party_id || null,
    missionLayers: { ...(js_globals.v_ui_mission_layers || {}) },
  };
}

function fn_emitFocusChanged() {
  if (!js_event || !js_event.EE_uiFocusChanged) return;
  js_eventEmitter.fn_dispatch(js_event.EE_uiFocusChanged, fn_cloneSnapshot());
}

function fn_emitMissionLayerChanged() {
  if (!js_event || !js_event.EE_uiMissionLayerChanged) return;
  js_eventEmitter.fn_dispatch(js_event.EE_uiMissionLayerChanged, fn_cloneSnapshot());
}

function fn_getAllUnits() {
  const list = js_globals?.m_andruavUnitList;
  if (!list || typeof list.fn_getUnitValues !== 'function') return [];
  return list.fn_getUnitValues() || [];
}

export function fn_getOnlineDroneUnits() {
  return fn_getAllUnits().filter((unit) => (
    unit
    && unit.m_defined === true
    && unit.m_IsGCS !== true
    && unit.m_IsDisconnectedFromGCS !== true
    && unit.m_IsShutdown !== true
  ));
}

function fn_getFocusMarkerOpacity(partyID) {
  if (js_globals.v_ui_focus_mode !== true) return 1;
  const focusedPartyID = js_globals.v_ui_focus_party_id;
  if (!focusedPartyID) return 1;
  // Keep non-focused vehicles clearly visible to avoid operator confusion.
  return String(partyID) === String(focusedPartyID) ? 1 : 0.85;
}

export function fn_getMissionLayerState(partyID) {
  if (!partyID) return { ...DEFAULT_MISSION_LAYER_STATE };
  const layers = js_globals.v_ui_mission_layers || {};
  const existing = layers[partyID];
  if (!existing) return { ...DEFAULT_MISSION_LAYER_STATE };
  return {
    visible: existing.visible !== false,
    opacity: fn_clamp(Number.isFinite(existing.opacity) ? existing.opacity : DEFAULT_MISSION_LAYER_STATE.opacity, 0.05, 1),
  };
}

export function fn_setMissionLayerVisibility(partyID, visible) {
  if (!partyID) return;
  const next = fn_getMissionLayerState(partyID);
  next.visible = visible !== false;
  js_globals.v_ui_mission_layers = {
    ...(js_globals.v_ui_mission_layers || {}),
    [partyID]: next,
  };
  fn_emitMissionLayerChanged();
}

export function fn_setMissionLayerOpacity(partyID, opacity) {
  if (!partyID) return;
  const next = fn_getMissionLayerState(partyID);
  next.opacity = fn_clamp(Number.isFinite(opacity) ? opacity : parseFloat(opacity), 0.05, 1);
  js_globals.v_ui_mission_layers = {
    ...(js_globals.v_ui_mission_layers || {}),
    [partyID]: next,
  };
  fn_emitMissionLayerChanged();
}

export function fn_setUIActiveUnit(partyID) {
  js_globals.v_ui_active_party_id = partyID || null;
  if (js_globals.v_ui_focus_mode === true && js_globals.v_ui_focus_party_id === null && partyID) {
    js_globals.v_ui_focus_party_id = partyID;
  }
  fn_emitFocusChanged();
}

export function fn_setUIFocusMode(enabled) {
  js_globals.v_ui_focus_mode = enabled === true;
  if (js_globals.v_ui_focus_mode === true && !js_globals.v_ui_focus_party_id) {
    const first = fn_getOnlineDroneUnits()[0];
    js_globals.v_ui_focus_party_id = first?.getPartyID?.() || null;
  }
  fn_emitFocusChanged();
}

export function fn_setUIFocusPartyID(partyID) {
  js_globals.v_ui_focus_party_id = partyID || null;
  fn_emitFocusChanged();
}

export function fn_toggleUIFocusMode() {
  fn_setUIFocusMode(js_globals.v_ui_focus_mode !== true);
}

export function fn_getPrimaryUIUnit() {
  const onlineUnits = fn_getOnlineDroneUnits();
  if (onlineUnits.length === 0) return null;

  if (js_globals.v_ui_focus_party_id) {
    const focused = onlineUnits.find((unit) => String(unit.getPartyID()) === String(js_globals.v_ui_focus_party_id));
    if (focused) return focused;
  }

  if (js_globals.v_ui_active_party_id) {
    const active = onlineUnits.find((unit) => String(unit.getPartyID()) === String(js_globals.v_ui_active_party_id));
    if (active) return active;
  }

  return onlineUnits[0];
}

function fn_applyMarkerOpacity(marker, opacity) {
  if (!marker || typeof marker.setOpacity !== 'function') return;
  marker.setOpacity(opacity);
}

function fn_applyShapeOpacity(shape, opacity, fillOpacity) {
  if (!shape || typeof shape.setStyle !== 'function') return;
  const style = {};
  if (Number.isFinite(opacity)) style.opacity = opacity;
  if (Number.isFinite(fillOpacity)) style.fillOpacity = fillOpacity;
  shape.setStyle(style);
}

export function fn_applyMissionLayerStyleForUnit(unit) {
  if (!unit || unit.m_IsGCS === true || typeof unit.getPartyID !== 'function') return;
  const partyID = unit.getPartyID();
  const layerState = fn_getMissionLayerState(partyID);
  const focusOpacity = fn_getFocusMarkerOpacity(partyID);
  const missionBaseOpacity = layerState.visible === true ? fn_clamp(layerState.opacity, 0.05, 1) : 0;
  const finalMissionOpacity = fn_clamp(missionBaseOpacity * focusOpacity, 0, 1);

  const missionMarkers = unit.m_gui?.m_wayPoint_markers || [];
  for (const marker of missionMarkers) {
    fn_applyMarkerOpacity(marker, finalMissionOpacity);
  }

  const missionPolygons = unit.m_gui?.m_wayPoint_polygons || [];
  for (const polygon of missionPolygons) {
    fn_applyShapeOpacity(polygon, finalMissionOpacity, finalMissionOpacity * 0.65);
  }

  const missionPolyline = unit.m_wayPoint?.polylines;
  if (missionPolyline) {
    fn_applyShapeOpacity(missionPolyline, finalMissionOpacity, undefined);
  }
}

export function fn_applyUIFocusRendering() {
  const allUnits = fn_getAllUnits();
  for (const unit of allUnits) {
    fn_applyUIFocusForUnit(unit);
  }
}

export function fn_applyUIFocusForUnit(unit) {
  if (!unit || typeof unit.getPartyID !== 'function') return;
  const partyID = unit.getPartyID();
  const focusOpacity = fn_getFocusMarkerOpacity(partyID);

  fn_applyMarkerOpacity(unit.m_gui?.m_marker, focusOpacity);
  fn_applyMarkerOpacity(unit.m_gui?.m_marker_destination, focusOpacity);
  fn_applyMarkerOpacity(unit.m_gui?.m_marker_home?.home_marker, focusOpacity);
  fn_applyShapeOpacity(unit.m_gui?.m_marker_home?.radius_marker, focusOpacity, focusOpacity * 0.3);

  fn_applyMissionLayerStyleForUnit(unit);
}

export function fn_applyMissionLayerStylesAll() {
  const allUnits = fn_getAllUnits();
  for (const unit of allUnits) {
    fn_applyMissionLayerStyleForUnit(unit);
  }
}

export function fn_uiStateSnapshot() {
  return fn_cloneSnapshot();
}

export function fn_uiStateReset() {
  js_globals.v_ui_focus_mode = false;
  js_globals.v_ui_focus_party_id = null;
  js_globals.v_ui_active_party_id = null;
  js_globals.v_ui_mission_layers = {};
  fn_emitFocusChanged();
  fn_emitMissionLayerChanged();
}
