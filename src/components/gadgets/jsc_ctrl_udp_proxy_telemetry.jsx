import React from 'react';
import { withTranslation } from 'react-i18next';
import { js_globals } from '../../js/js_globals';
import { EVENTS as js_event } from '../../js/js_eventList.js';
import { js_eventEmitter } from '../../js/js_eventEmitter';
import { js_andruavAuth } from '../../js/js_andruav_auth';
import { fn_recoverTelemetry } from '../../js/js_main';
import { fn_opsHealthSnapshot } from '../../js/js_ops_health.js';
import { fn_missionIntegritySnapshot } from '../../js/js_mission_integrity.js';

class ClssCtrlUDPPoxyTelemetry extends React.Component {
  constructor(props) {
    super(props);
    this.telemetry_level = ["OFF", "1", "2", "3"];
    this.state = {
      m_message: [],
      m_update: 0,
      m_opsSnapshot: fn_opsHealthSnapshot(),
      m_missionSnapshot: fn_missionIntegritySnapshot(),
    };

    this.m_flag_mounted = false;

    js_eventEmitter.fn_subscribe(js_event.EE_onProxyInfoUpdated, this, this.fn_onProxyInfoUpdated);
    js_eventEmitter.fn_subscribe(js_event.EE_Language_Changed, this, this.fn_updateLanguage);
    js_eventEmitter.fn_subscribe(js_event.EE_opsHealthUpdated, this, this.fn_onOpsHealthUpdated);
    js_eventEmitter.fn_subscribe(js_event.EE_missionIntegrityUpdated, this, this.fn_onMissionIntegrityUpdated);
  }

  shouldComponentUpdate(nextProps, nextState) {
    const update = this.state.m_update !== nextState.m_update;
    return update;
  }

  componentWillUnmount() {
    js_eventEmitter.fn_unsubscribe(js_event.EE_Language_Changed, this);
    js_eventEmitter.fn_unsubscribe(js_event.EE_onProxyInfoUpdated, this);
    js_eventEmitter.fn_unsubscribe(js_event.EE_opsHealthUpdated, this);
    js_eventEmitter.fn_unsubscribe(js_event.EE_missionIntegrityUpdated, this);
  }

  componentDidMount() {
    this.m_flag_mounted = true;
  }

  fn_updateLanguage(p_me) {
    if (p_me.m_flag_mounted === false) return;
    p_me.setState({ m_update: p_me.state.m_update + 1 });
  }

  fn_onProxyInfoUpdated(p_me, p_andruavUnit) {
    try {
      if (p_me.props.p_unit.getPartyID() !== p_andruavUnit.getPartyID()) return;
      if (p_me.m_flag_mounted === false) return;
      p_me.setState({ m_update: p_me.state.m_update + 1 });
    } catch (ex) {}
  }

  fn_requestUdpProxyStatus(p_andruavUnit) {
    js_globals.v_andruavFacade.API_requestUdpProxyStatus(p_andruavUnit);
  }

  fn_markManualTelemetryOverride(p_andruavUnit) {
    if (p_andruavUnit == null || p_andruavUnit.m_Telemetry == null) return;
    p_andruavUnit.m_Telemetry.m_bridge_manual_override = true;
    p_andruavUnit.m_Telemetry.m_bridge_manual_override_at = Date.now();
  }

  fn_changeTelemetryOptimizationLevel(p_andruavUnit, step) {
    if (p_andruavUnit == null) return;
    this.fn_markManualTelemetryOverride(p_andruavUnit);
    let next_step = p_andruavUnit.m_Telemetry.m_telemetry_level + step;
    if (next_step < 0) next_step = 0;
    if (next_step > 3) next_step = 3;
    js_globals.v_andruavFacade.API_adjustTelemetryDataRate(p_andruavUnit, next_step);
    js_globals.v_andruavFacade.API_requestUdpProxyStatus(p_andruavUnit);
    p_andruavUnit.m_Telemetry.m_telemetry_level = next_step;
  }

  fn_pauseTelemetry(p_andruavUnit) {
    if (p_andruavUnit == null) return;
    this.fn_markManualTelemetryOverride(p_andruavUnit);
    js_globals.v_andruavFacade.API_pauseTelemetry(p_andruavUnit);
    js_globals.v_andruavFacade.API_requestUdpProxyStatus(p_andruavUnit);
  }

  fn_startTelemetry(p_andruavUnit) {
    if (p_andruavUnit == null) return;
    this.fn_markManualTelemetryOverride(p_andruavUnit);
    js_globals.v_andruavFacade.API_resumeTelemetry(p_andruavUnit);
    js_globals.v_andruavFacade.API_requestUdpProxyStatus(p_andruavUnit);
  }

  fn_onOpsHealthUpdated(p_me, snapshot) {
    if (p_me.m_flag_mounted === false) return;
    p_me.setState({
      m_opsSnapshot: snapshot || fn_opsHealthSnapshot(),
      m_update: p_me.state.m_update + 1,
    });
  }

  fn_onMissionIntegrityUpdated(p_me, snapshot) {
    if (p_me.m_flag_mounted === false) return;
    p_me.setState({
      m_missionSnapshot: snapshot || fn_missionIntegritySnapshot(),
      m_update: p_me.state.m_update + 1,
    });
  }

  fn_recoverTelemetry(p_andruavUnit) {
    if (p_andruavUnit == null) return;
    fn_recoverTelemetry(p_andruavUnit, {
      reason: 'manual_refresh',
      maxAttempts: 2,
      pollMs: 1200,
      force: true,
    });
  }

  fn_getHealthClass(state) {
    switch (state) {
      case 'connected':
      case 'ok':
      case 'active':
      case 'streaming':
      case 'paused':
        return 'ops-unit-state is-ok';

      case 'connecting':
      case 'retrying':
      case 'recovering':
      case 'degraded':
        return 'ops-unit-state is-warn';

      case 'failed':
      case 'error':
      case 'inactive':
      case 'disconnected':
        return 'ops-unit-state is-bad';

      default:
        return 'ops-unit-state is-idle';
    }
  }

  fn_formatStateLabel(state) {
    const raw = String(state || '').trim().toLowerCase();
    if (!raw) return 'Unknown';

    switch (raw) {
      case 'ok': return 'OK';
      case 'connected': return 'Connected';
      case 'connecting': return 'Connecting';
      case 'retrying': return 'Retrying';
      case 'failed': return 'Failed';
      case 'error': return 'Error';
      case 'disconnected': return 'Disconnected';
      case 'active': return 'Active';
      case 'inactive': return 'Inactive';
      case 'recovering': return 'Recovering';
      case 'paused': return 'Paused';
      case 'streaming': return 'Streaming';
      case 'idle': return 'Idle';
      case 'degraded': return 'Degraded';
      default:
        return raw
          .replaceAll('_', ' ')
          .replace(/\b\w/g, (ch) => ch.toUpperCase());
    }
  }

  renderUnitHealth(v_andruavUnit, canControl) {
    const partyID = v_andruavUnit.getPartyID ? v_andruavUnit.getPartyID() : '';
    const snapshot = this.state.m_opsSnapshot || fn_opsHealthSnapshot();
    const unitState = (snapshot && snapshot.units) ? snapshot.units[partyID] : null;
    const wsState = unitState?.ws?.state || snapshot?.global?.ws?.state || 'disconnected';
    const wsRetryCount = unitState?.ws?.attempt || snapshot?.global?.ws?.attempt || 0;
    const wsRetryMax = unitState?.ws?.maxAttempts || snapshot?.global?.ws?.maxAttempts || 0;
    const udpState = unitState?.udp?.state || 'inactive';
    const udpNote = unitState?.udp?.statusNote || '';
    const videoState = unitState?.video?.state || 'idle';
    const udpRetryCount = unitState?.udp?.retryCount || 0;
    const udpRetryMax = unitState?.udp?.retryMax || 0;
    const missionSnapshot = this.state.m_missionSnapshot || fn_missionIntegritySnapshot();
    const missionState = missionSnapshot?.units?.[partyID] || null;
    const droneChecksum = missionState?.droneChecksum || 'unknown';
    const mapChecksum = missionState?.mapChecksum || 'unknown';
    const shortDroneChecksum = String(droneChecksum).slice(0, 8);
    const shortMapChecksum = String(mapChecksum).slice(0, 8);
    const missionStale = missionState?.stale === true || missionState?.pendingRead === true;
    const wsStateLabel = this.fn_formatStateLabel(wsState);
    const udpStateLabel = this.fn_formatStateLabel(udpState);
    const videoStateLabel = this.fn_formatStateLabel(videoState);
    const missionLabel = `D${missionState?.droneVersion || 0}/M${missionState?.mapVersion || 0}`;

    return (
      <div className="ops-unit-health" dir={this.props.i18n.language === 'ar' ? 'rtl' : 'ltr'}>
        <div className="ops-unit-health-grid">
          <div className="ops-unit-chip" title={`WebSocket: ${wsStateLabel}`}>
            <span className="ops-unit-chip__label">WS</span>
            <span className={this.fn_getHealthClass(wsState)}>{wsStateLabel}</span>
          </div>
          <div className="ops-unit-chip" title={`UDP: ${udpStateLabel}`}>
            <span className="ops-unit-chip__label">UDP</span>
            <span className={this.fn_getHealthClass(udpState)}>{udpStateLabel}</span>
          </div>
          <div className="ops-unit-chip" title={`Video: ${videoStateLabel}`}>
            <span className="ops-unit-chip__label">Video</span>
            <span className={this.fn_getHealthClass(videoState)}>{videoStateLabel}</span>
          </div>
          <div className="ops-unit-chip" title={`WebSocket retry: ${wsRetryCount}/${wsRetryMax || '?'}`}>
            <span className="ops-unit-chip__label">WS Retry</span>
            <span className="ops-unit-state is-idle">{wsRetryCount}/{wsRetryMax || '?'}</span>
          </div>
          <div className="ops-unit-chip" title={`UDP retry: ${udpRetryCount}/${udpRetryMax || '?'}`}>
            <span className="ops-unit-chip__label">UDP Retry</span>
            <span className="ops-unit-state is-idle">{udpRetryCount}/{udpRetryMax || '?'}</span>
          </div>
          <div className="ops-unit-chip" title={`Mission: ${missionLabel}`}>
            <span className="ops-unit-chip__label">Mission</span>
            <span className={this.fn_getHealthClass(missionStale ? 'degraded' : 'active')}>
              {missionLabel}
            </span>
          </div>
        </div>
        <div className={`ops-unit-checksum ${missionStale ? 'is-stale' : ''}`}>
          <span className="ops-unit-checksum__title">chk</span>
          <code>d:{shortDroneChecksum}</code>
          <code>m:{shortMapChecksum}</code>
          {missionStale ? (
            <span className="ops-unit-checksum__flag" title={missionState?.staleReason || 'pending_read'}>
              stale
            </span>
          ) : null}
        </div>
        {udpNote && (
          <div className="ops-unit-note">{udpNote}</div>
        )}
        <div className="ops-unit-actions">
          <button
            type="button"
            className="btn btn-sm ops-unit-btn"
            title={canControl ? 'Force UDP recovery' : 'Read-only: no control permission'}
            disabled={canControl !== true}
            onClick={() => this.fn_recoverTelemetry(v_andruavUnit)}
          >
            UDP Refresh
          </button>
        </div>
      </div>
    );
  }

  renderUdpProxy() {
    const { t } = this.props;
    const canControl = js_andruavAuth.fn_do_canControl() === true;

    let v_udpproxy_text_ip = '';
    let v_udpproxy_text_port = '';
    let v_telemetry_lvl_class = canControl ? 'text-warning' : 'txt-theme-aware';
    const v_andruavUnit = this.props.p_unit;
    let v_udp_data = [];
    let v_udp_on_off = [];

    if (v_andruavUnit.m_Telemetry.m_udpProxy_active === true) {
      v_udpproxy_text_ip = t('udpProxyTelemetry:ip') + ':' + v_andruavUnit.m_Telemetry.m_udpProxy_ip;
      v_udpproxy_text_port = t('udpProxyTelemetry:port') + ':' + v_andruavUnit.m_Telemetry.m_udpProxy_port;

      if (v_andruavUnit.m_Telemetry.m_udpProxy_paused === false) {
        v_telemetry_lvl_class = 'text-warning';
        if (canControl) {
          v_udp_on_off.push(
            <span
              key={v_andruavUnit.getPartyID() + 'pause'}
              title={t('udpProxyTelemetry:pauseTitle')}
              onClick={(e) => this.fn_pauseTelemetry(v_andruavUnit)}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                fill="currentColor"
                className="bi bi-power"
                viewBox="0 0 16 16"
              >
                <path d="M7.5 1v7h1V1h-1z" />
                <path d="M3 8.812a4.999 4.999 0 0 1 2.578-4.375l-.485-.874A6 6 0 1 0 11 3.616l-.501.865A5 5 0 1 1 3 8.812z" />
              </svg>
            </span>
          );
        }
      } else {
        v_telemetry_lvl_class = 'txt-theme-aware';
        if (canControl) {
          v_udp_on_off.push(
            <span
              key={v_andruavUnit.getPartyID() + 'active'}
              title={t('udpProxyTelemetry:activateTitle')}
              onClick={(e) => this.fn_startTelemetry(v_andruavUnit)}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                fill="currentColor"
                className="bi bi-power txt-theme-aware"
                viewBox="0 0 16 16"
              >
                <path d="M7.5 1v7h1V1h-1z" />
                <path d="M3 8.812a4.999 4.999 0 0 1 2.578-4.375l-.485-.874A6 6 0 1 0 11 3.616l-.501.865A5 5 0 1 1 3 8.812z" />
              </svg>
            </span>
          );
        }
      }

      v_udp_data.push(
        <div
          key={v_andruavUnit.getPartyID() + 'txt'}
          className={'col-12 padding_zero css_user_select_text ' + v_telemetry_lvl_class}
        >
          <p id="udpproxy_t" className="si-07x css_margin_zero user-select-none">
            {t('udpProxyTelemetry:smartTelemetry')}
          </p>
          <p id="udpproxy_a" className="si-07x css_margin_zero css_user_select_text">
            {v_udpproxy_text_ip}
          </p>
          <p id="udpproxy_p" className="si-07x css_margin_zero css_user_select_text">
            {v_udpproxy_text_port}
          </p>
        </div>
      );
    } else {
      v_telemetry_lvl_class = 'txt-theme-aware';
      const statusNote = v_andruavUnit.m_Telemetry.m_udpProxy_status_note || '';
      const isRecovering = v_andruavUnit.m_Telemetry.m_udpProxy_recovery_state === 'recovering';
      v_udp_data.push(
        <div key={v_andruavUnit.getPartyID() + 'refresh'} className="col-12 padding_zero css_user_select_text">
          <div className="css_margin_zero user-select-none">
            {isRecovering && (
              <p className="si-07x css_margin_zero text-info">
                {t('udpProxyTelemetry:recovering')}
              </p>
            )}
            {statusNote === 'drone-side-inactive' && (
              <p className="si-07x css_margin_zero text-warning">
                {t('udpProxyTelemetry:droneSideInactive')}
              </p>
            )}
          </div>
        </div>
      );
    }

    const rows = (
      <div className="row padding_zero css_user_select_text" dir={this.props.i18n.language === 'ar' ? 'rtl' : 'ltr'}>
        {canControl && (
          <div className={v_telemetry_lvl_class + ' row al_l css_margin_zero'}>
            <div className="col-12 margin_2px padding_zero css_user_select_text">
              <p className="rounded-3 cursor_hand textunit_w135 mb-0" title={t('udpProxyTelemetry:smartTelemetry')}>
                <span
                  title={t('udpProxyTelemetry:decreaseTitle')}
                  onClick={(e) => this.fn_changeTelemetryOptimizationLevel(v_andruavUnit, -1)}
                >
                  <svg
                    className="bi bi-caret-down-fill"
                    width="1em"
                    height="1em"
                    viewBox="0 0 16 16"
                    fill="currentColor"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path d="M7.247 11.14L2.451 5.658C1.885 5.013 2.345 4 3.204 4h9.592a1 1 0 0 1 .753 1.659l-4.796 5.48a1 1 0 0 1-1.506 0z" />
                  </svg>
                </span>
                <span
                  id="telemetry_rate"
                  className="user-select-none"
                  onClick={(e) => this.fn_requestUdpProxyStatus(v_andruavUnit)}
                >
                  <small>
                    <b>
                      &nbsp;
                      {t('udpProxyTelemetry:levelLabel', { level: this.telemetry_level[v_andruavUnit.m_Telemetry.m_telemetry_level] })}
                      &nbsp;
                    </b>
                  </small>
                </span>
                <span
                  title={t('udpProxyTelemetry:increaseTitle')}
                  onClick={(e) => this.fn_changeTelemetryOptimizationLevel(v_andruavUnit, +1)}
                >
                  <svg
                    className="bi bi-caret-up-fill"
                    width="1em"
                    height="1em"
                    viewBox="0 0 16 16"
                    fill="currentColor"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path d="M3.204 11L8 5.519 12.796 11H3.204zm-.753-.659l4.796-5.48a1 1 0 0 1 1.506 0l4.796 5.48c.566.647.106 1.659-.753 1.659H3.204a1 1 0 0 1-.753-1.659z" />
                  </svg>
                </span>
                {v_udp_on_off}
              </p>
            </div>
          </div>
        )}
        <div className="row al_l css_margin_zero css_user_select_text">{v_udp_data}</div>
        <div className="row al_l css_margin_zero css_user_select_text">
          <div className="col-12 margin_2px padding_zero css_user_select_text">
            {this.renderUnitHealth(v_andruavUnit, canControl)}
          </div>
        </div>
      </div>
    );

    return rows;
  }

  render() {
    return this.renderUdpProxy();
  }
}

export default withTranslation('udpProxyTelemetry')(ClssCtrlUDPPoxyTelemetry);
