import React, { useEffect, useMemo, useState } from 'react';
import { js_globals } from '../../js/js_globals.js';
import { js_eventEmitter } from '../../js/js_eventEmitter.js';
import { EVENTS as js_event } from '../../js/js_eventList.js';
import { js_andruavAuth } from '../../js/js_andruav_auth.js';
import * as js_andruavUnit from '../../js/js_andruavUnit.js';
import { fn_getUnitColorPalette } from '../../js/js_unit_colors.js';
import { fn_gotoUnit_byPartyID } from '../../js/js_main.js';
import { fn_opsHealthAddEvent } from '../../js/js_ops_health.js';
import {
  fn_getMissionLayerState,
  fn_getOnlineDroneUnits,
  fn_setMissionLayerOpacity,
  fn_setMissionLayerVisibility,
  fn_setUIActiveUnit,
  fn_setUIFocusMode,
  fn_setUIFocusPartyID,
  fn_uiStateSnapshot,
} from '../../js/js_ui_state.js';
import ClssSafetyHoldButton from '../common/jsc_safety_hold_button.jsx';

const LAYOUT_PRESET_KEY = 'nb-layout-preset';
const SECTION_STATE_KEY = 'nb-ui-tools-sections';

const LAYOUT_PRESETS = [
  { id: 'balanced', label: 'Balanced' },
  { id: 'map_focus', label: 'Map Focus' },
  { id: 'controls_focus', label: 'Control Focus' },
];

function fn_loadLayoutPreset() {
  if (typeof window === 'undefined' || !window.localStorage) return 'balanced';
  try {
    const raw = window.localStorage.getItem(LAYOUT_PRESET_KEY);
    return LAYOUT_PRESETS.some((preset) => preset.id === raw) ? raw : 'balanced';
  } catch {
    return 'balanced';
  }
}

function fn_saveLayoutPreset(preset) {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(LAYOUT_PRESET_KEY, preset);
  } catch {
    return;
  }
}

function fn_loadSectionState() {
  const defaults = {
    layout: true,
    critical: true,
    mission: true,
  };
  if (typeof window === 'undefined' || !window.localStorage) return defaults;
  try {
    const raw = window.localStorage.getItem(SECTION_STATE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw);
    return {
      layout: parsed?.layout !== false,
      critical: parsed?.critical !== false,
      mission: parsed?.mission !== false,
    };
  } catch {
    return defaults;
  }
}

function fn_saveSectionState(state) {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(SECTION_STATE_KEY, JSON.stringify(state));
  } catch {
    return;
  }
}

function fn_getOnlineUnits() {
  return fn_getOnlineDroneUnits().filter((unit) => unit && typeof unit.getPartyID === 'function');
}

function ClssOpsUIToolsPanel() {
  const [uiSnapshot, setUiSnapshot] = useState(() => fn_uiStateSnapshot());
  const [sectionState, setSectionState] = useState(fn_loadSectionState);
  const [layoutPreset, setLayoutPreset] = useState(fn_loadLayoutPreset);
  const [actionScope, setActionScope] = useState('focused');
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const listener = { id: 'ops-ui-tools-panel' };
    const refresh = () => setTick((value) => value + 1);
    const onUiStateChanged = (me, snapshot) => {
      setUiSnapshot(snapshot || fn_uiStateSnapshot());
      refresh();
    };
    const onLayoutChanged = (me, payload) => {
      const nextPreset = payload?.preset;
      if (!LAYOUT_PRESETS.some((preset) => preset.id === nextPreset)) return;
      setLayoutPreset(nextPreset);
      fn_saveLayoutPreset(nextPreset);
    };

    js_eventEmitter.fn_subscribe(js_event.EE_uiFocusChanged, listener, onUiStateChanged);
    js_eventEmitter.fn_subscribe(js_event.EE_uiMissionLayerChanged, listener, onUiStateChanged);
    js_eventEmitter.fn_subscribe(js_event.EE_unitAdded, listener, refresh);
    js_eventEmitter.fn_subscribe(js_event.EE_unitOnlineChanged, listener, refresh);
    js_eventEmitter.fn_subscribe(js_event.EE_unitUpdated, listener, refresh);
    js_eventEmitter.fn_subscribe(js_event.EE_unitHighlighted, listener, refresh);
    js_eventEmitter.fn_subscribe(js_event.EE_uiLayoutPresetApplied, listener, onLayoutChanged);

    setUiSnapshot(fn_uiStateSnapshot());
    return () => {
      js_eventEmitter.fn_unsubscribe(js_event.EE_uiFocusChanged, listener);
      js_eventEmitter.fn_unsubscribe(js_event.EE_uiMissionLayerChanged, listener);
      js_eventEmitter.fn_unsubscribe(js_event.EE_unitAdded, listener);
      js_eventEmitter.fn_unsubscribe(js_event.EE_unitOnlineChanged, listener);
      js_eventEmitter.fn_unsubscribe(js_event.EE_unitUpdated, listener);
      js_eventEmitter.fn_unsubscribe(js_event.EE_unitHighlighted, listener);
      js_eventEmitter.fn_unsubscribe(js_event.EE_uiLayoutPresetApplied, listener);
    };
  }, []);

  const onlineUnits = useMemo(() => fn_getOnlineUnits(), [tick, uiSnapshot]);
  const canControl = js_andruavAuth.fn_do_canControl() === true;
  const focusPartyID = uiSnapshot.focusPartyID
    || uiSnapshot.activePartyID
    || (onlineUnits[0] ? onlineUnits[0].getPartyID() : '');

  const targetUnits = useMemo(() => {
    if (actionScope === 'all') return onlineUnits;
    if (!focusPartyID) return onlineUnits.length > 0 ? [onlineUnits[0]] : [];
    return onlineUnits.filter((unit) => String(unit.getPartyID()) === String(focusPartyID));
  }, [actionScope, focusPartyID, onlineUnits]);

  useEffect(() => {
    if (uiSnapshot.focusMode !== true) return;
    if (focusPartyID) return;
    if (onlineUnits.length === 0) return;
    const partyID = onlineUnits[0].getPartyID();
    fn_setUIFocusPartyID(partyID);
    fn_setUIActiveUnit(partyID);
  }, [uiSnapshot.focusMode, focusPartyID, onlineUnits]);

  const fn_toggleSection = (key) => {
    const next = {
      ...sectionState,
      [key]: sectionState[key] !== false ? false : true,
    };
    setSectionState(next);
    fn_saveSectionState(next);
  };

  const fn_applyLayoutPreset = (preset) => {
    if (!LAYOUT_PRESETS.some((item) => item.id === preset)) return;
    setLayoutPreset(preset);
    fn_saveLayoutPreset(preset);
    js_eventEmitter.fn_dispatch(js_event.EE_uiLayoutPresetApplied, { preset: preset });
    fn_opsHealthAddEvent({
      source: 'ui',
      level: 'info',
      message: `Layout preset: ${preset.replace('_', ' ')}`,
    });
  };

  const fn_executeCritical = (actionKey) => {
    if (canControl !== true) return;
    if (!js_globals.v_andruavFacade) return;
    if (targetUnits.length === 0) return;

    let label = '';
    for (const unit of targetUnits) {
      if (!unit) continue;
      switch (actionKey) {
        case 'arm_toggle':
          js_globals.v_andruavFacade.API_do_Arm(unit, unit.m_isArmed !== true, false);
          label = 'Arm/Disarm';
          break;
        case 'land':
          js_globals.v_andruavFacade.API_do_Land(unit);
          label = 'Land';
          break;
        case 'rtl':
          js_globals.v_andruavFacade.API_do_FlightMode(unit, js_andruavUnit.CONST_FLIGHT_CONTROL_RTL);
          label = 'RTL';
          break;
        case 'hold':
          js_globals.v_andruavFacade.API_do_FlightMode(unit, js_andruavUnit.CONST_FLIGHT_CONTROL_LOITER);
          label = 'Hold';
          break;
        default:
          return;
      }
    }

    const scopeText = actionScope === 'all' ? 'all online units' : 'focused unit';
    const countText = `${targetUnits.length} unit${targetUnits.length === 1 ? '' : 's'}`;
    const msg = `${label} command sent to ${countText} (${scopeText})`;
    fn_opsHealthAddEvent({
      source: 'ops',
      level: (actionKey === 'land' || actionKey === 'arm_toggle') ? 'warn' : 'info',
      message: msg,
    });
  };

  const fn_renderSection = (key, title, badge, body) => {
    const isOpen = sectionState[key] !== false;
    return (
      <section className="nb-ui-tools-section" key={key}>
        <button
          type="button"
          className="nb-ui-tools-section__toggle"
          onClick={() => fn_toggleSection(key)}
          aria-expanded={isOpen}
        >
          <span className="nb-ui-tools-section__title">{title}</span>
          <span className="nb-ui-tools-section__right">
            {badge ? <span className="nb-ui-tools-section__badge">{badge}</span> : null}
            <span className={`bi bi-chevron-down nb-ui-tools-section__chevron ${isOpen ? '' : 'is-collapsed'}`} aria-hidden="true"></span>
          </span>
        </button>
        {isOpen && <div className="nb-ui-tools-section__body">{body}</div>}
      </section>
    );
  };

  return (
    <div className="nb-ui-tools-panel">
      <div className="nb-ui-tools-panel__header">Control Tools</div>

      {fn_renderSection('layout', 'Layout & Focus', uiSnapshot.focusMode === true ? 'focus on' : null, (
        <div className="nb-ui-tools-grid">
          <div className="nb-ui-tools-row">
            <label className="nb-ui-tools-label" htmlFor="nb_layout_preset">Preset</label>
            <select
              id="nb_layout_preset"
              className="form-select form-select-sm nb-ui-tools-select"
              value={layoutPreset}
              onChange={(event) => fn_applyLayoutPreset(event.target.value)}
            >
              {LAYOUT_PRESETS.map((preset) => (
                <option key={preset.id} value={preset.id}>{preset.label}</option>
              ))}
            </select>
          </div>

          <div className="nb-ui-tools-row">
            <button
              type="button"
              className={`btn btn-sm nb-ui-tools-btn ${uiSnapshot.focusMode === true ? 'is-active' : ''}`}
              onClick={() => fn_setUIFocusMode(uiSnapshot.focusMode !== true)}
              disabled={onlineUnits.length === 0}
            >
              Focus Mode {uiSnapshot.focusMode === true ? 'On' : 'Off'}
            </button>
          </div>

          <div className="nb-ui-tools-row">
            <label className="nb-ui-tools-label" htmlFor="nb_focus_unit">Unit</label>
            <select
              id="nb_focus_unit"
              className="form-select form-select-sm nb-ui-tools-select"
              value={focusPartyID || ''}
              onChange={(event) => {
                const nextPartyID = event.target.value;
                fn_setUIFocusPartyID(nextPartyID);
                fn_setUIActiveUnit(nextPartyID);
              }}
              disabled={onlineUnits.length === 0}
            >
              {onlineUnits.length === 0 && <option value="">No units online</option>}
              {onlineUnits.map((unit) => (
                <option key={unit.getPartyID()} value={unit.getPartyID()}>
                  {unit.m_unitName || unit.getPartyID()}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn btn-sm nb-ui-tools-btn"
              onClick={() => fn_gotoUnit_byPartyID(focusPartyID)}
              disabled={!focusPartyID}
            >
              Go To
            </button>
          </div>
        </div>
      ))}

      {fn_renderSection('critical', 'Critical Action Bar', canControl === true ? `target ${targetUnits.length}` : 'read only', (
        <div className="nb-critical-actions">
          <div className="nb-ui-tools-row">
            <label className="nb-ui-tools-label" htmlFor="nb_action_scope">Scope</label>
            <select
              id="nb_action_scope"
              className="form-select form-select-sm nb-ui-tools-select"
              value={actionScope}
              onChange={(event) => setActionScope(event.target.value)}
            >
              <option value="focused">Focused</option>
              <option value="all">All Online</option>
            </select>
          </div>
          <div className="nb-critical-actions__grid">
            {[
              { id: 'arm_toggle', label: 'Arm/Disarm' },
              { id: 'land', label: 'Land' },
              { id: 'rtl', label: 'RTL' },
              { id: 'hold', label: 'Hold' },
            ].map((action) => (
              <ClssSafetyHoldButton
                key={action.id}
                className="btn btn-sm nb-critical-actions__btn"
                disabled={canControl !== true || targetUnits.length === 0}
                title="Press and hold to confirm"
                holdMs={900}
                showProgressText={true}
                onConfirm={() => fn_executeCritical(action.id)}
              >
                {action.label}
              </ClssSafetyHoldButton>
            ))}
          </div>
          <div className="nb-critical-actions__hint">Press and hold to send command</div>
        </div>
      ))}

      {fn_renderSection('mission', 'Mission Layer Manager', `${onlineUnits.length} units`, (
        <div className="nb-mission-layer-list">
          {onlineUnits.length === 0 && <div className="nb-ui-tools-empty">No online units</div>}
          {onlineUnits.map((unit) => {
            const partyID = unit.getPartyID();
            const layerState = fn_getMissionLayerState(partyID);
            const color = fn_getUnitColorPalette(unit).primary;
            return (
              <div className="nb-mission-layer-row" key={partyID}>
                <div className="nb-mission-layer-row__head">
                  <span className="nb-mission-layer-row__dot" style={{ backgroundColor: color }}></span>
                  <span className="nb-mission-layer-row__name">{unit.m_unitName || partyID}</span>
                  <label className="nb-mission-layer-row__toggle">
                    <input
                      type="checkbox"
                      checked={layerState.visible !== false}
                      onChange={(event) => fn_setMissionLayerVisibility(partyID, event.target.checked)}
                    />
                    <span>Show</span>
                  </label>
                </div>
                <div className="nb-mission-layer-row__range-wrap">
                  <input
                    type="range"
                    min="5"
                    max="100"
                    value={Math.round((layerState.opacity || 0.9) * 100)}
                    onChange={(event) => fn_setMissionLayerOpacity(partyID, parseInt(event.target.value, 10) / 100)}
                  />
                  <span>{Math.round((layerState.opacity || 0.9) * 100)}%</span>
                </div>
              </div>
            );
          })}
        </div>
      ))}

    </div>
  );
}

export default ClssOpsUIToolsPanel;
