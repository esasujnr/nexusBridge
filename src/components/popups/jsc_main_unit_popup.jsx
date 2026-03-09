import React from 'react';
import { withTranslation } from 'react-i18next';
import { hlp_getFlightMode } from '../../js/js_main.js';

class ClssMainUnitPopup extends React.Component {
  constructor() {
    super();
    this.state = {
      initialized: false,
    };
    this.key = Math.random().toString();
  }

  componentWillUnmount() {}

  componentDidMount() {
    if (this.state.initialized === true) {
      return;
    }
    this.state.initialized = true;
    if (this.props.OnComplete !== null && this.props.OnComplete !== undefined) {
      this.props.OnComplete();
    }
  }

  render() {
    const { t } = this.props;
    const c_unit = this.props.p_unit;
    const nav = c_unit && c_unit.m_Nav_Info ? c_unit.m_Nav_Info : {};
    const loc = nav && nav.p_Location ? nav.p_Location : {};

    const toNum = (value, digits = 1, fallback = '?') => (
      Number.isFinite(value) ? value.toFixed(digits) : fallback
    );

    const armedClass = c_unit.m_isArmed ? 'nb-unit-popup__status--danger' : 'nb-unit-popup__status--ok';
    const flyingClass = c_unit.m_isFlying ? 'nb-unit-popup__status--danger' : 'nb-unit-popup__status--ok';
    const modeText = c_unit.m_IsGCS ? t('groundControlStation') : hlp_getFlightMode(c_unit);

    const latText = Number.isFinite(this.props.p_lat) ? this.props.p_lat.toFixed(6) : '?';
    const lngText = Number.isFinite(this.props.p_lng) ? this.props.p_lng.toFixed(6) : '?';

    return (
      <div key={this.key + 'popmu'} className="nb-context-menu nb-unit-popup-menu col-12">
        <div className="nb-context-menu__header">
          <p className="nb-context-menu__title">{c_unit.m_unitName}</p>
          <p className="nb-context-menu__coords">Lat {latText} | Lng {lngText}</p>
        </div>

        <div className="nb-context-card nb-unit-popup-card">
          <p className="nb-unit-popup__status-line">
            <span className={armedClass}>{c_unit.m_isArmed ? t('armed') : t('disarmed')}</span>
            <span className="nb-unit-popup__sep">|</span>
            <span className={flyingClass}>{c_unit.m_isFlying ? t('flying') : t('onGround')}</span>
          </p>

          <p className="nb-unit-popup__mode">{modeText}</p>

          <p className="nb-unit-popup__line">
            <span className="nb-unit-popup__label">Alt:</span>
            <span className="nb-unit-popup__value">{toNum(loc.alt_relative, 0)}</span>
            <span className="nb-unit-popup__label"> {t('meters')}</span>
            <span className="nb-unit-popup__label nb-unit-popup__label--sub">{t('absolute')}:</span>
            <span className="nb-unit-popup__value">{toNum(loc.alt_abs, 0)}</span>
            <span className="nb-unit-popup__label"> {t('meters')}</span>
          </p>

          <p className="nb-unit-popup__line">
            <span className="nb-unit-popup__label">{t('groundSpeed')}:</span>
            <span className="nb-unit-popup__value">{toNum(loc.ground_speed, 1)}</span>
            <span className="nb-unit-popup__label"> {t('metersPerSecond')}</span>
          </p>

          <p className="nb-unit-popup__line">
            <span className="nb-unit-popup__label">{t('airSpeed')}:</span>
            <span className="nb-unit-popup__value">{toNum(loc.air_speed, 1)}</span>
            <span className="nb-unit-popup__label"> {t('metersPerSecond')}</span>
          </p>
        </div>
      </div>
    );
  }
}

export default withTranslation()(ClssMainUnitPopup);
