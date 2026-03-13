import React from 'react';
import { withTranslation } from 'react-i18next';

import * as js_andruavMessages from '../js/protocol/js_andruavMessages.js';
import * as js_common from '../js/js_common.js';
import { EVENTS as js_event } from '../js/js_eventList.js';
import { js_globals } from '../js/js_globals.js';
import { js_localStorage } from '../js/js_localStorage';
import * as js_siteConfig from '../js/js_siteConfig.js';
import { js_eventEmitter } from '../js/js_eventEmitter';
import { js_speak } from '../js/js_speak';
import * as js_andruav_ws from '../js/server_comm/js_andruav_ws.js';
import { QueryString, fn_connect, fn_logout, getTabStatus } from '../js/js_main';

const CONST_NOT_CONNECTION_OFFLINE = 0;
const CONST_NOT_CONNECTION_IN_PROGRESS = 1;
const CONST_NOT_CONNECTION_ONLINE = 2;
const CONST_NOT_CONNECTION_OFFLINE_FAILED = 3;
const CONST_NOT_CONNECTION_RETRYING = 4;

class ClssLoginControl extends React.Component {
  constructor() {
    super();
    this.state = {
      is_connected: CONST_NOT_CONNECTION_OFFLINE,
      m_update: 0,
      use_plugin: false,
      status_reason: '',
    };

    this.m_flag_mounted = false;
    this.key = Math.random().toString();
    this.txtEmailRef = React.createRef();
    this.txtAccessCodeRef = React.createRef();
    this.txtUnitIDRef = React.createRef();
    this.btnConnectRef = React.createRef();
    this.dropdownToggleRef = React.createRef();
    this.txtGroupNameRef = React.createRef();

    this.chkUsePluginRef = React.createRef();

    js_eventEmitter.fn_subscribe(js_event.EE_onSocketStatus, this, this.fn_onSocketStatus);
    js_eventEmitter.fn_subscribe(js_event.EE_Auth_Login_In_Progress, this, this.fn_onAuthInProgress);
    js_eventEmitter.fn_subscribe(js_event.EE_Auth_BAD_Logined, this, this.fn_onAuthBad);
    js_eventEmitter.fn_subscribe(js_event.EE_Auth_Logout_Completed, this, this.fn_onAuthLogoutCompleted);
    js_eventEmitter.fn_subscribe(js_event.EE_Auth_Logout_Failed, this, this.fn_onAuthLogoutCompleted);

  }

  fn_setConnectionState(nextState, nextReason = '', extraPatch = null) {
    const patch = {
      is_connected: nextState,
      status_reason: nextReason || '',
      ...(extraPatch || {}),
    };
    if (this.m_flag_mounted === false) return;
    this.setState((prev) => ({
      ...prev,
      ...patch,
      m_update: prev.m_update + 1,
    }));
  }

  fn_getEffectiveConnectionState() {
    const wsStatus = js_andruav_ws.AndruavClientWS.getSocketStatus();
    if (wsStatus === js_andruavMessages.CONST_SOCKET_STATUS_REGISTERED) {
      return CONST_NOT_CONNECTION_ONLINE;
    }
    if (
      wsStatus === js_andruavMessages.CONST_SOCKET_STATUS_CONNECTING
      || wsStatus === js_andruavMessages.CONST_SOCKET_STATUS_CONNECTED
    ) {
      return (this.state.is_connected === CONST_NOT_CONNECTION_RETRYING)
        ? CONST_NOT_CONNECTION_RETRYING
        : CONST_NOT_CONNECTION_IN_PROGRESS;
    }
    return this.state.is_connected;
  }

  fn_syncWithRuntimeState() {
    const effectiveState = this.fn_getEffectiveConnectionState();
    if (effectiveState !== this.state.is_connected) {
      this.fn_setConnectionState(
        effectiveState,
        effectiveState === CONST_NOT_CONNECTION_ONLINE ? '' : this.state.status_reason,
      );
    }
  }


  fn_onSocketStatus(me, params) {
    const { t } = me.props; // Access t function
    js_common.fn_console_log('REACT:' + JSON.stringify(params));

    if (me.m_flag_mounted === false) return;

    if (params.status === js_andruavMessages.CONST_SOCKET_STATUS_REGISTERED) {
      me.fn_setConnectionState(
        CONST_NOT_CONNECTION_ONLINE,
        '',
        { username: me.txtUnitIDRef.current ? me.txtUnitIDRef.current.value : '' }
      );
      js_speak.fn_speak(t('connectedSpeech')); // Translate "Connected"
      me.fn_hideLoginDropdown();
    } else if (params.retrying === true) {
      const attempt = params.attempt ? ` (${params.attempt}/${params.maxAttempts || ''})` : '';
      me.fn_setConnectionState(CONST_NOT_CONNECTION_RETRYING, (params.reason || t('title.retrying')) + attempt);
    } else if (params.status === js_andruavMessages.CONST_SOCKET_STATUS_CONNECTING) {
      me.fn_setConnectionState(CONST_NOT_CONNECTION_IN_PROGRESS, params.reason || t('title.connecting'));
    } else if (params.failed === true) {
      me.fn_setConnectionState(CONST_NOT_CONNECTION_OFFLINE_FAILED, params.reason || 'Connection failed');
    } else {
      const wsStatus = js_andruav_ws.AndruavClientWS.getSocketStatus();
      if (wsStatus === js_andruavMessages.CONST_SOCKET_STATUS_REGISTERED) {
        me.fn_setConnectionState(CONST_NOT_CONNECTION_ONLINE, '');
      } else {
        me.fn_setConnectionState(CONST_NOT_CONNECTION_OFFLINE, '');
      }
    }
  }

  fn_hideLoginDropdown() {
    const dropdownToggle = this.dropdownToggleRef.current;
    if (!dropdownToggle) return;

    dropdownToggle.setAttribute('aria-expanded', 'false');
    const dropdownRoot = dropdownToggle.closest('.dropdown');
    if (!dropdownRoot) return;

    dropdownRoot.classList.remove('show');
    const dropdownMenu = dropdownRoot.querySelector('.dropdown-menu');
    if (dropdownMenu) {
      dropdownMenu.classList.remove('show');
    }
  }

  fn_onAuthInProgress(me) {
    if (me.m_flag_mounted === false) return;
    me.fn_setConnectionState(CONST_NOT_CONNECTION_IN_PROGRESS, '');
  }

  fn_onAuthBad(me, p_error) {
    if (me.m_flag_mounted === false) return;
    me.fn_setConnectionState(CONST_NOT_CONNECTION_OFFLINE_FAILED, p_error?.em || p_error?.error || 'Authentication failed');
  }

  fn_onAuthLogoutCompleted(me) {
    if (me.m_flag_mounted === false) return;
    me.fn_setConnectionState(CONST_NOT_CONNECTION_OFFLINE, '');
  }


  clickConnect(e) {
    const effectiveState = this.fn_getEffectiveConnectionState();
    if ((effectiveState !== CONST_NOT_CONNECTION_OFFLINE) && (effectiveState !== CONST_NOT_CONNECTION_OFFLINE_FAILED)) {
      // online or connecting
      fn_logout();
      this.fn_setConnectionState(CONST_NOT_CONNECTION_OFFLINE, '');
    } else {
      // offline
      this.setState({ m_update: this.state.m_update + 1, status_reason: '' });

      const usePlugin = (this.chkUsePluginRef.current && this.chkUsePluginRef.current.checked === true);
      js_localStorage.fn_setWebConnectorEnabled(usePlugin);

      js_localStorage.fn_setEmail(this.txtEmailRef.current.value);
      js_localStorage.fn_setAccessCode(this.txtAccessCodeRef.current.value);
      let s = this.txtUnitIDRef.current.value;
      if (s !== null) {
        js_localStorage.fn_setUnitID(s);
        if (usePlugin === true) {
          js_localStorage.fn_setUnitIDShared(s);
        }
      }
      js_localStorage.fn_setGroupName(this.txtGroupNameRef.current.value);

      fn_connect(this.txtEmailRef.current.value, this.txtAccessCodeRef.current.value);
    }
  }

  componentWillUnmount() {
    js_eventEmitter.fn_unsubscribe(js_event.EE_onSocketStatus, this);
    js_eventEmitter.fn_unsubscribe(js_event.EE_Auth_Login_In_Progress, this);
    js_eventEmitter.fn_unsubscribe(js_event.EE_Auth_BAD_Logined, this);
    js_eventEmitter.fn_unsubscribe(js_event.EE_Auth_Logout_Completed, this);
    js_eventEmitter.fn_unsubscribe(js_event.EE_Auth_Logout_Failed, this);
  }

  componentDidMount() {
    
    this.m_flag_mounted = true;
  
    const tabStatus = getTabStatus();

    const lsPluginEnabled = js_localStorage.fn_getWebConnectorEnabled();
    const pluginConfigured = js_siteConfig.CONST_WEBCONNECTOR_ENABLED === true;
    const usePlugin = pluginConfigured && ((lsPluginEnabled !== null) ? lsPluginEnabled : true);
    if (this.chkUsePluginRef.current) {
      this.chkUsePluginRef.current.checked = usePlugin;
    }
    switch (tabStatus) {
      case 'new':
        js_globals.m_current_tab_status = 'new';
        console.log('This is a newly opened tab.');
        break;
      case 'refresh':
        js_globals.m_current_tab_status = 'refresh';
        console.log('This tab was refreshed.');
        break;
      case 'duplicate':
        js_globals.m_current_tab_status = 'duplicate';
        console.log('This tab is a duplicate.');
        if (usePlugin !== true) {
          js_localStorage.fn_resetUnitID();
        }
        break;
      default:
        js_globals.m_current_tab_status = 'unknown';
        console.log('Unknown tab status.');
    }

    const queryParams = QueryString;

    const hasRequiredParams =
      queryParams.accesscode !== undefined ||
      queryParams.email !== undefined ||
      queryParams.groupName !== undefined ||
      queryParams.unitName !== undefined;

    if (hasRequiredParams && this.txtAccessCodeRef.current) {
      this.txtAccessCodeRef.current.value = queryParams.accesscode || '';
      this.txtEmailRef.current.value = queryParams.email || '';
      this.txtGroupNameRef.current.value = queryParams.groupName || '';
      this.txtUnitIDRef.current.value = queryParams.unitName || '';
    } else {
      this.txtEmailRef.current.value = js_localStorage.fn_getEmail();
      this.txtAccessCodeRef.current.value = js_localStorage.fn_getAccessCode();
      this.txtGroupNameRef.current.value = js_localStorage.fn_getGroupName();
      this.txtUnitIDRef.current.value = usePlugin === true ? js_localStorage.fn_getUnitIDShared() : js_localStorage.fn_getUnitID();
    }

    if (queryParams.connect !== undefined) {
      this.clickConnect(null);
    }

    this.setState({ use_plugin: usePlugin, m_update: 1 }, () => {
      this.fn_syncWithRuntimeState();
    });

    
  }

  render() {
    const { t } = this.props; // Access t function
    const connectionState = this.fn_getEffectiveConnectionState();
    let control = [];
    let title;
    let css = 'btn-success';

    let ctrls = [];
    let ctrls2 = [];
    const dir = this.props.i18n.language === 'ar' ? 'al_r' : 'al_l';
    switch (connectionState) {
      
      case CONST_NOT_CONNECTION_OFFLINE_FAILED:
      case CONST_NOT_CONNECTION_OFFLINE:
        title = t('title.login');
        css = connectionState===CONST_NOT_CONNECTION_OFFLINE_FAILED?'btn-warning':'btn-success';
        ctrls.push(
          <div key={'div_login' + this.key} className="">
            {js_siteConfig.CONST_WEBCONNECTOR_ENABLE && (
              <div className={`form-group ${dir}`}>
                <label className="txt-theme-aware">
                    <input
                    type="checkbox"
                    ref={this.chkUsePluginRef}
                    defaultChecked={this.state.use_plugin === true}
                    onChange={(e) => {
                      const enabled = e.target.checked === true;
                      this.setState({ use_plugin: enabled });
                      js_localStorage.fn_setWebConnectorEnabled(enabled);

                      if (this.txtUnitIDRef.current) {
                        if (enabled === true) {
                          this.txtUnitIDRef.current.value = js_localStorage.fn_getUnitIDShared();
                        } else {
                          js_localStorage.fn_resetUnitID();
                          this.txtUnitIDRef.current.value = js_localStorage.fn_getUnitID();
                        }
                      }
                      try {
                        console.info('[WebConnector] UI toggle', { enabled: enabled });
                      } catch {
                      }
                    }}
                  />
                  &nbsp;Use WebConnector
                </label>
              </div>
            )}

            <div className={`form-group ${dir}${this.state.use_plugin === true ? ' hidden' : ''}`}>
              <label key={'txtEmail1' + this.key} htmlFor="txtEmail" id="email" className="txt-theme-aware">
                {t('label.email')}
              </label>
              <input
                type="email"
                id="txtEmail"
                name="txtEmail"
                ref={this.txtEmailRef}
                className="form-control"
                defaultValue={
                  QueryString.email != null ? QueryString.email : js_localStorage.fn_getEmail()
                }
              />
            </div>
            <div className={`form-group ${dir}${this.state.use_plugin === true ? ' hidden' : ''}`}>
              <label htmlFor="txtAccessCode" id="account" className="txt-theme-aware" title={t('tooltip.accessCode')}>
                {t('label.password')}
              </label>
              <input
                type="password"
                id="txtAccessCode"
                title={t('tooltip.accessCode')}
                name="txtAccessCode"
                ref={this.txtAccessCodeRef}
                className="form-control"
                defaultValue={
                  QueryString.accesscode != null ? QueryString.accesscode : js_localStorage.fn_getAccessCode()
                }
              />
            </div>
            <div className={`form-group ${dir} hidden`}>
              <label htmlFor="txtGroupName" id="group" className="txt-theme-aware">
                {t('label.groupName')}
              </label>
              <input
                type="text"
                id="txtGroupName"
                name="txtGroupName"
                ref={this.txtGroupNameRef}
                className="form-control"
                defaultValue={
                  QueryString.groupName != null ? QueryString.groupName : js_localStorage.fn_getGroupName()
                }
              />
            </div>
            <div className={`form-group ${dir}${this.state.use_plugin === true ? ' hidden' : ''}`}>
              <label htmlFor="txtUnitID" id="unitID" className="text-muted">
                {t('label.gcsId')}
              </label>
              <input
                type="text"
                id="txtUnitID"
                name="txtUnitID"
                ref={this.txtUnitIDRef}
                className="form-control"
                defaultValue={
                  QueryString.unitName != null ? QueryString.unitName : js_localStorage.fn_getUnitID()
                }
              />
            </div>
            <br />
          </div>
        );
        break;
      case CONST_NOT_CONNECTION_ONLINE:
        {
        title = t('title.logout'); // "Logout"
          const lsPluginEnabled = js_localStorage.fn_getWebConnectorEnabled();
          const pluginConfigured = js_siteConfig.CONST_WEBCONNECTOR_ENABLED === true;
          const usePlugin = pluginConfigured && ((lsPluginEnabled !== null) ? (lsPluginEnabled === true) : (this.state.use_plugin === true));
          css = usePlugin === true ? 'btn-info' : 'btn-danger';
        ctrls2.push(
          <div key={'div_logout' + this.key} className=" ">
            <div className={`form-group ${dir}`}>
              <span key={'txtEmail2' + this.key} className="text-muted">
                {t('label.email')} {/* "Email" */}
              </span>
              <p>{js_localStorage.fn_getEmail()}</p>
            </div>
            <div className={`form-group ${dir}`}>
              <p className="text-muted">{t('label.gcsId') + (usePlugin === true ? ' (Plugin)' : '')}</p> 
              <p>{js_localStorage.fn_getUnitID()}</p>
            </div>
          </div>
        );
        }
        break;
      case CONST_NOT_CONNECTION_RETRYING:
      case CONST_NOT_CONNECTION_IN_PROGRESS:
        title = connectionState === CONST_NOT_CONNECTION_RETRYING ? t('title.retrying') : t('title.connecting'); // "Connecting.."
        css = connectionState === CONST_NOT_CONNECTION_RETRYING ? 'btn-warning' : 'bg-warning';
        if (connectionState === CONST_NOT_CONNECTION_RETRYING) {
          css += ' text-dark';
        }
        if (this.state.status_reason && this.state.status_reason.length > 0) {
          ctrls.push(
            <div key={'div_connecting_info' + this.key} className={`small text-warning ${dir}`}>
              {this.state.status_reason}
            </div>
          );
        }
        ctrls.push(
          <div key={'div_connecting' + this.key} className="">
            <div className={`form-group ${dir} ${this.state.use_plugin === true ? ' hidden' : ''}`}>
              <label key={'txtEmail1' + this.key} htmlFor="txtEmail" id="email" className="txt-theme-aware">
                {t('label.email')} {/* "Email" */}
              </label>
              <input
                type="email"
                id="txtEmail"
                name="txtEmail"
                ref={this.txtEmailRef}
                className="form-control"
                defaultValue={
                  QueryString.email != null ? QueryString.email : js_localStorage.fn_getEmail()
                }
                disabled
              />
            </div>
            <div className={`form-group ${dir}${this.state.use_plugin === true ? ' hidden' : ''}`}>
              <label htmlFor="txtAccessCode" id="account" className="txt-theme-aware" title={t('tooltip.accessCode')}>
                {t('label.password')}
              </label>
              <input
                type="password"
                id="txtAccessCode"
                title={t('tooltip.accessCode')}
                name="txtAccessCode"
                ref={this.txtAccessCodeRef}
                className="form-control"
                defaultValue={
                  QueryString.accesscode != null ? QueryString.accesscode : js_localStorage.fn_getAccessCode()
                }
                disabled
              />
            </div>
            <div className={`form-group ${dir} hidden`}>
              <label htmlFor="txtGroupName" id="group" className="txt-theme-aware">
                {t('label.groupName')} {/* "Group Name" */}
              </label>
              <input
                type="text"
                id="txtGroupName"
                name="txtGroupName"
                ref={this.txtGroupNameRef}
                className="form-control"
                defaultValue={
                  QueryString.groupName != null ? QueryString.groupName : js_localStorage.fn_getGroupName()
                }
                disabled
              />
            </div>
            <div className={`form-group ${dir}${this.state.use_plugin === true ? ' hidden' : ''}`}>
              <label htmlFor="txtUnitID" id="unitID" className="text-muted">
                {t('label.gcsId')} {/* "GCS ID" */}
              </label>
              <input
                type="text"
                id="txtUnitID"
                name="txtUnitID"
                ref={this.txtUnitIDRef}
                className="form-control"
                defaultValue={
                  QueryString.unitName != null ? QueryString.unitName : js_localStorage.fn_getUnitID()
                }
                disabled
              />
            </div>
            <br />
          </div>
        );
        break;
    }

    control.push(
      <div key={'ClssLoginControl_complex' + this.key} className="dropdown">
        <button
          className={'btn btn-secondary dropdown-toggle btn-sm header-login-toggle ' + css}
          type="button"
          id="dropdownMenuButton1"
          data-bs-toggle="dropdown"
          aria-expanded="false"
          ref={this.dropdownToggleRef}
        >
          {title}
        </button>
        <div className="dropdown-menu" aria-labelledby="dropdownMenuButton1">
          <div id="login_form" className="card-body">
            {ctrls}
            <button
              id="btnConnect"
              className={'btn button_large rounded-3 m-2 user-select-none ' + css + ' p-0'}
              title={this.state.status_reason || this.state.username || title}
              onClick={(e) => this.clickConnect(e)}
              ref={this.btnConnectRef}
            >
              {title}
            </button>
            {ctrls2}
          </div>
        </div>
      </div>
    );

    return control;
  }
}

export default withTranslation()(ClssLoginControl);
