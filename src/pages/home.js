import '../css/bootstrap.min.css';
import 'leaflet/dist/leaflet.css';
import '../css/bootstrap-icons/font/bootstrap-icons.css';
import '../css/css_styles.css';
import '../css/css_styles2.css';
import '../css/css_gamepad.css';

import 'jquery-ui-dist/jquery-ui.min.js';
import 'jquery-knob/dist/jquery.knob.min.js';

import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';


import { js_globals } from '../js/js_globals.js';
import { EVENTS as js_event } from '../js/js_eventList.js';
import { js_eventEmitter } from '../js/js_eventEmitter.js';
import ClssHeaderControl from '../components/jsc_header';
import ClssGlobalSettings from '../components/jsc_globalSettings';
import ClssAndruavUnitList from '../components/unit_controls/jsc_unitControlMainList.jsx';
import ClssYawDialog from '../components/dialogs/jsc_yawDialogControl.jsx';
import ClssLidarInfoDialog from '../components/dialogs/jsc_lidarInfoDialogControl.jsx';
import ClssCameraDialog from '../components/dialogs/jsc_cameraDialogControl.jsx';
import ClssStreamDialog from '../components/dialogs/jsc_streamDialogControl.jsx';
import ClssModuleDetails from '../components/gadgets/jsc_ctrl_unit_module_details.jsx';
import ClssGamePadControl from '../components/gamepad/jsc_gamepadControl.jsx';
import ClssServoControl from '../components/dialogs/jsc_servoDialogControl.jsx';
import ClssAndruavUnitListArray from '../components/unit_controls/jsc_unitControlArrayView.jsx';
import ClssUnitParametersList from '../components/dialogs/jsc_unitParametersList.jsx';
import ClssConfigGenerator from '../components/jsc_config_generator.jsx'
import ClssFloatingOpsDock from '../components/gadgets/jsc_floating_ops_dock.jsx';
import { ClssCVideoControl } from '../components/video/jsc_videoDisplayComponent.jsx';
import { fn_on_ready, fn_showMap, fn_showVideoMainTab } from '../js/js_main';
import { js_leafletmap } from '../js/js_leafletmap.js';
import { fn_setUIActiveUnit } from '../js/js_ui_state.js';

const Home = () => {
  const { t } = useTranslation('home'); // Use home namespace
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isVideoView, setIsVideoView] = useState(false);
  const [layoutPreset, setLayoutPreset] = useState(() => {
    if (typeof window === 'undefined' || !window.localStorage) return 'balanced';
    try {
      const raw = window.localStorage.getItem('nb-layout-preset');
      if (raw === 'map_focus' || raw === 'controls_focus' || raw === 'balanced') return raw;
    } catch {
      return 'balanced';
    }
    return 'balanced';
  });

  const mapColumnClass = layoutPreset === 'map_focus'
    ? 'col-lg-9 col-xl-9 col-xxl-9 col-12'
    : (layoutPreset === 'controls_focus'
      ? 'col-lg-7 col-xl-7 col-xxl-7 col-12'
      : 'col-lg-8 col-xl-8 col-xxl-8 col-12');

  const rightColumnClass = layoutPreset === 'map_focus'
    ? 'col-lg-3 col-xl-3 col-xxl-3 col-12'
    : (layoutPreset === 'controls_focus'
      ? 'col-lg-5 col-xl-5 col-xxl-5 col-12'
      : 'col-lg-4 col-xl-4 col-xxl-4 col-12');

  const onCenterAllVehicles = useCallback(() => {
    const map = js_leafletmap?.m_Map;
    if (!map || typeof map.fitBounds !== 'function') return;

    const isEligibleUnit = (unit) => (
      unit
      && unit.m_defined === true
      && unit.m_IsGCS !== true
      && unit.m_IsDisconnectedFromGCS !== true
      && unit.m_IsShutdown !== true
    );

    const units = js_globals?.m_andruavUnitList?.fn_getUnitValues?.() || [];
    const points = [];
    units.forEach((unit) => {
      if (!isEligibleUnit(unit)) return;
      const lat = Number(unit?.m_Nav_Info?.p_Location?.lat);
      const lng = Number(unit?.m_Nav_Info?.p_Location?.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      points.push([lat, lng]);
    });

    if (points.length === 0) return;
    if (points.length === 1) {
      map.panTo(points[0], { animate: true });
      return;
    }

    map.fitBounds(points, {
      padding: [44, 44],
      maxZoom: 18,
      animate: true
    });
  }, []);

  const onFocusActiveVehicle = useCallback(() => {
    const isEligibleUnit = (unit) => (
      unit
      && unit.m_defined === true
      && unit.m_IsGCS !== true
      && unit.m_IsDisconnectedFromGCS !== true
      && unit.m_IsShutdown !== true
      && typeof unit.getPartyID === 'function'
    );

    const units = js_globals?.m_andruavUnitList?.fn_getUnitsSorted?.() || [];
    const activePartyID = js_globals?.v_ui_active_party_id;
    const activeUnit = activePartyID
      ? js_globals?.m_andruavUnitList?.fn_getUnit?.(activePartyID)
      : null;
    const hasValidLocation = (unit) => {
      const lat = Number(unit?.m_Nav_Info?.p_Location?.lat);
      const lng = Number(unit?.m_Nav_Info?.p_Location?.lng);
      return Number.isFinite(lat) && Number.isFinite(lng);
    };
    const fallbackUnit = units.find((unit) => isEligibleUnit(unit) && hasValidLocation(unit));
    const targetUnit = isEligibleUnit(activeUnit) ? activeUnit : fallbackUnit;
    if (!targetUnit) return;

    const targetLat = Number(targetUnit?.m_Nav_Info?.p_Location?.lat);
    const targetLng = Number(targetUnit?.m_Nav_Info?.p_Location?.lng);
    if (!Number.isFinite(targetLat) || !Number.isFinite(targetLng)) return;

    fn_setUIActiveUnit(targetUnit.getPartyID());
    if (js_globals?.v_andruavFacade?.API_do_GetHomeLocation) {
      js_globals.v_andruavFacade.API_do_GetHomeLocation(targetUnit);
    }

    const map = js_leafletmap?.m_Map;
    if (!map
      || typeof map.flyTo !== 'function'
      || typeof map.project !== 'function'
      || typeof map.unproject !== 'function'
      || typeof map.distance !== 'function') return;

    const scaleStepsMeters = [5, 10, 25, 50, 100, 150, 250, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000, 200000, 500000, 1000000, 2000000];
    const sampleWidthPx = 100;
    const targetScaleMeters = 100;

    const getSnappedScale = (rawMeters) => {
      if (!Number.isFinite(rawMeters) || rawMeters <= 0) return NaN;
      for (let i = 0; i < scaleStepsMeters.length - 1; i += 1) {
        if (rawMeters < ((scaleStepsMeters[i] + scaleStepsMeters[i + 1]) / 2)) {
          return scaleStepsMeters[i];
        }
      }
      return scaleStepsMeters[scaleStepsMeters.length - 1];
    };

    const measureSnappedScaleAtZoom = (zoom) => {
      const projected = map.project([targetLat, targetLng], zoom);
      if (!projected || !Number.isFinite(projected.x) || !Number.isFinite(projected.y)) return NaN;
      const rightCoord = map.unproject([projected.x + sampleWidthPx, projected.y], zoom);
      if (!rightCoord) return NaN;
      const rawMeters = map.distance([targetLat, targetLng], rightCoord);
      return getSnappedScale(Math.round(rawMeters));
    };

    const minZoom = Number.isFinite(map.getMinZoom?.()) ? map.getMinZoom() : 1;
    const maxZoom = Number.isFinite(map.getMaxZoom?.()) ? map.getMaxZoom() : 22;
    let bestZoom = Number.isFinite(map.getZoom?.()) ? map.getZoom() : minZoom;
    let bestScale = measureSnappedScaleAtZoom(bestZoom);
    let bestDelta = Number.isFinite(bestScale) ? Math.abs(bestScale - targetScaleMeters) : Number.POSITIVE_INFINITY;

    for (let zoom = minZoom; zoom <= maxZoom; zoom += 1) {
      const snapped = measureSnappedScaleAtZoom(zoom);
      if (!Number.isFinite(snapped)) continue;
      const delta = Math.abs(snapped - targetScaleMeters);
      if (delta < bestDelta || (delta === bestDelta && snapped === targetScaleMeters)) {
        bestZoom = zoom;
        bestScale = snapped;
        bestDelta = delta;
      }
      if (snapped === targetScaleMeters) break;
    }

    if (typeof map.stop === 'function') {
      map.stop();
    }
    map.setView([targetLat, targetLng], bestZoom, { animate: false });
  }, []);

  useEffect(() => {
    js_globals.CONST_MAP_EDITOR = false;
    fn_on_ready();
  }, []);

  useEffect(() => {
    const handleMainViewChanged = (event) => {
      const view = event && event.detail ? event.detail.view : 'map';
      setIsVideoView(view === 'video');
    };

    window.addEventListener('nb-main-view-changed', handleMainViewChanged);
    return () => {
      window.removeEventListener('nb-main-view-changed', handleMainViewChanged);
    };
  }, []);

  useEffect(() => {
    const listener = { id: 'home-layout-preset' };
    const onLayoutPresetApplied = (me, payload) => {
      const nextPreset = payload?.preset;
      if (nextPreset !== 'balanced' && nextPreset !== 'map_focus' && nextPreset !== 'controls_focus') return;
      setLayoutPreset(nextPreset);
      try {
        window.localStorage.setItem('nb-layout-preset', nextPreset);
      } catch {
        return;
      }
    };
    js_eventEmitter.fn_subscribe(js_event.EE_uiLayoutPresetApplied, listener, onLayoutPresetApplied);
    return () => {
      js_eventEmitter.fn_unsubscribe(js_event.EE_uiLayoutPresetApplied, listener);
    };
  }, []);

  return (
    <div>
      <ClssHeaderControl />

      <div id="mainBody" className={`row css_mainbody nb-layout-${layoutPreset}`}>
        <div id="row_1" className={mapColumnClass}>
          <div id="row_1_1" className="row margin_zero">
            <div id="displays" className="container-fluid text-center">
              <div className="monitorview" id="message_notification" style={{ display: 'none' }}>
                &nbsp;
              </div>
              <div id="div_cmp_hud"></div>
              <div className="monitorview" id="div_map_view">
                <div id="mapid" className="org_border fullscreen"></div>
                <div className="nb-map-quick-tools" role="toolbar" aria-label="Map quick tools">
                  <button
                    type="button"
                    className="btn btn-sm nb-map-quick-tools__btn"
                    title="Center map on all available vehicles"
                    aria-label="Center map on all available vehicles"
                    onClick={onCenterAllVehicles}
                  >
                    <span className="bi bi-house-fill" aria-hidden="true"></span>
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm nb-map-quick-tools__btn"
                    title="Focus active vehicle"
                    aria-label="Focus active vehicle"
                    onClick={onFocusActiveVehicle}
                  >
                    <span className="bi bi-bullseye" aria-hidden="true"></span>
                  </button>
                </div>
              </div>
              <div className="cameraview" id="div_video_control">
                <ClssCVideoControl />
              </div>
              <div id="andruav_unit_list_array_fixed" className="css_ontop andruav_unit_list_array">
                <ClssAndruavUnitListArray
                  prop_speed={true}
                  prop_battery={true}
                  prob_ekf={true}
                  prob_alt={true}
                  prob_ws={false}
                  prob_wp={false}
                />
              </div>
            </div>

            <div id="andruav_unit_list_array_float" className="css_ontop andruav_unit_list_array_float">
              <ClssAndruavUnitListArray
                prop_speed={true}
                prop_battery={true}
                prob_ekf={true}
                prob_alt={true}
                prob_ws={true}
                prob_wp={true}
              />
            </div>
          </div>

          <div id="modal_fpv" title={t('home:modal.image.title')} className="card css_ontop">
            <div className="card-header text-center">
              <div className="row">
                <div className="col-10">
                  <h3 className="text-success text-start">{t('home:modal.image.title')}</h3>
                </div>
                <div className="col-2 float-right">
                  <button id="btnclose" type="button" className="btn-close"></button>
                </div>
              </div>
            </div>
            <div id="modal_fpv_img" className="form-group text-center">
              <img id="unitImg" className="img-rounded" alt="camera" src="/public/images/camera_img.png" />
            </div>
            <div id="modal_fpv_footer" className="form-group text-center localcontainer">
              <button id="unitImg_save" type="button" className="btn btn-danger">
                {t('home:modal.image.save')}
              </button>
              <button id="btnGoto" type="button" className="btn btn-success">
                {t('home:modal.image.goto')}
              </button>
            </div>
          </div>

          <ClssModuleDetails/>
          <ClssLidarInfoDialog />
          <ClssYawDialog />
          <ClssCameraDialog />
          <ClssServoControl />
          <ClssUnitParametersList />
          <ClssConfigGenerator />
          <ClssGamePadControl p_index={js_globals.active_gamepad_index} />
          <ClssStreamDialog />
        </div>

        <div id="row_2" className={rightColumnClass}>
          <div id="andruavUnits" className="col-sm-12 padding_zero nb-right-panel">
            <div className="settings-panel-toolbar">
              <button
                type="button"
                id="btn_settingsPanelToggle"
                className="btn btn-warning btn-sm settings-panel-icon-btn"
                aria-expanded={isSettingsOpen}
                aria-controls="andruavUnits_in"
                aria-label="Toggle settings"
                onClick={() => setIsSettingsOpen((prev) => !prev)}
              >
                <span className="bi bi-gear-fill settings-panel-toggle__gear" aria-hidden="true"></span>
              </button>
              <button
                type="button"
                id="btn_mediaViewToggle"
                className="btn btn-warning btn-sm settings-panel-icon-btn"
                title={isVideoView ? 'Map' : 'Video'}
                aria-label={isVideoView ? 'Show map' : 'Show video'}
                onClick={() => {
                  if (isVideoView) {
                    fn_showMap();
                  } else {
                    fn_showVideoMainTab();
                  }
                }}
              >
                {isVideoView ? (
                  <span className="bi bi-map-fill settings-panel-map-icon" aria-hidden="true"></span>
                ) : (
                  <img src="/images/de/video_icon_white.svg" className="settings-panel-media-icon" alt="" aria-hidden="true" />
                )}
              </button>
            </div>
            <div id="andruavUnits_in" className="settings-panel-body" style={{ display: isSettingsOpen ? 'block' : 'none' }}>
              <ClssGlobalSettings />
              <div id="andruavUnitGlobals"></div>
              <div className="nb-right-panel-section-title">
                <strong>{t('home:onlineUnits')}</strong>
              </div>
            </div>
            <div id="guiMessageCtrl" className="row"></div>
            <div id="andruavUnitList" className="row">
              <ClssAndruavUnitList
                tab_planning={false}
                tab_main={true}
                tab_log={true}
                tab_details={true}
                tab_module={true}
              />
            </div>
          </div>
        </div>
      </div>
      <ClssFloatingOpsDock />

      <div className="modal fade" id="altitude_modal">
        <div className="modal-dialog">
          <div className="modal-content">
            <div className="modal-header">
              <button type="button" className="close" data-bs-dismiss="modal" aria-hidden="true">
                ×
              </button>
              <h4 className="modal-title text-primary">{t('home:modal.altitude.title')}</h4>
            </div>
            <div className="container"></div>
            <div className="modal-body">
              <div className="input-group">
                <input
                  id="txtAltitude"
                  type="text"
                  className="form-control"
                  placeholder={t('home:modal.altitude.placeholder')}
                  aria-describedby="basic-addon2"
                />
                <span className="input-group-addon">{t('home:modal.altitude.unit')}</span>
              </div>
            </div>
            <div className="modal-footer">
              <button id="btnCancel" type="button" data-bs-dismiss="modal" className="btn btn-muted">
                {t('home:modal.altitude.cancel')}
              </button>
              <button id="btnOK" type="button" data-bs-dismiss="modal" className="btn btn-success">
                {t('home:modal.altitude.go')}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div id="changespeed_modal" className="modal fade" role="dialog">
        <div className="modal-dialog">
          <div className="modal-content">
            <div className="modal-header">
              <h4 id="title" className="modal-title bg-warning rounded_10px p-1 text-white">
                {t('home:modal.speed.title')}
              </h4>
              <button type="button" className="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>
            <div className="modal-body">
              <div className="container"></div>
              <div className="input-group">
                <input
                  id="txtSpeed"
                  type="text"
                  className="form-control rounded-3 me-3"
                  placeholder=""
                  aria-describedby="basic-addon2"
                />
                <span id="txtSpeedUnit" className="input-group-addon">
                  {t('home:modal.speed.unit')}
                </span>
              </div>
            </div>
            <div className="modal-footer">
              <button id="btnCancel" type="button" data-bs-dismiss="modal" className="btn btn-muted">
                {t('home:modal.speed.cancel')}
              </button>
              <button id="btnOK" type="button" data-bs-dismiss="modal" className="btn btn-warning">
                {t('home:modal.speed.go')}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div id="modal_changeUnitInfo" className="modal fade" role="dialog">
        <div className="modal-dialog">
          <div className="modal-content">
            <div className="modal-header">
              <h4 id="title" className="modal-title bg-warning rounded_10px p-1 text-white">
                {t('home:modal.unitInfo.title')}
              </h4>
              <button type="button" className="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>
            <div className="modal-body">
              <div className="container"></div>
              <div className="input-group align-items-center">
                <span id="txtNamelbl" className="input-group-addon me-2">
                  {t('home:modal.unitInfo.name')}
                </span>
                <input
                  id="txtUnitName"
                  type="text"
                  className="form-control rounded-3 me-3"
                  placeholder=""
                  aria-describedby="basic-addon2"
                />
              </div>
              <div className="input-group mt-2 align-items-center">
                <span id="txtDescriptionlbl" className="input-group-addon me-2">
                  {t('home:modal.unitInfo.description')}
                </span>
                <input
                  id="txtDescription"
                  type="text"
                  className="form-control rounded-3 me-3"
                  placeholder=""
                  aria-describedby="basic-addon2"
                />
              </div>
            </div>
            <div className="modal-footer">
              <button id="btnCancel" type="button" data-bs-dismiss="modal" className="btn btn-muted">
                {t('home:modal.unitInfo.cancel')}
              </button>
              <button id="btnOK" type="button" data-bs-dismiss="modal" className="btn btn-warning">
                {t('home:modal.unitInfo.go')}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div id="modal_saveConfirmation" className="modal fade" role="dialog">
        <div className="modal-dialog">
          <div className="modal-content">
            <div className="modal-header">
              <h4 id="title" className="modal-title bg-success p-1 text-white">
                <strong>{t('home:modal.saveConfirmation.title')}</strong>
              </h4>
              <button type="button" className="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>
            <div className="modal-body text-white">
              <p>{t('home:modal.saveConfirmation.message')}</p>
            </div>
            <div className="modal-footer">
              <button id="btnCancel" type="button" data-bs-dismiss="modal" className="btn btn-secondary">
                {t('home:modal.saveConfirmation.cancel')}
              </button>
              <button id="modal_btn_confirm" type="button" data-bs-dismiss="modal" className="btn btn-danger">
                {t('home:modal.saveConfirmation.submit')}
              </button>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
};

export default Home;
