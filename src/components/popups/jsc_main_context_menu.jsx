import React from 'react';

import { js_globals } from '../../js/js_globals.js'
import { js_andruavAuth } from '../../js/js_andruav_auth.js'
import { fn_doFlyHere, fn_doSetHome, fn_closeContextPopup, getVehicleIcon } from '../../js/js_main'
import { fn_uiStateSnapshot } from '../../js/js_ui_state.js';
import ClssSafetyHoldButton from '../common/jsc_safety_hold_button.jsx';

// Registration and Regeneration Control
export class ClssMainContextMenu extends React.Component {
    constructor() {
        super();
        this.state = {

            initialized: false,
        };
    }




    componentWillUnmount() {

    }

    componentDidMount() {

        if (this.state.initialized === true) {
            return;
        }

        this.setState({ initialized: true });

        if (this.props.OnComplete !== null && this.props.OnComplete !== undefined)
        {
            this.props.OnComplete();
        }
    }

    getActiveUnit() {
        const snapshot = fn_uiStateSnapshot();
        const activePartyID = snapshot?.activePartyID;
        if (!activePartyID) return null;
        const activeUnit = js_globals?.m_andruavUnitList?.fn_getUnit?.(activePartyID);
        if (!activeUnit) return null;
        if (activeUnit.m_IsGCS === true) return null;
        if (activeUnit.m_IsDisconnectedFromGCS === true) return null;
        if (activeUnit.m_IsShutdown === true) return null;
        if (activeUnit.m_defined !== true) return null;
        return activeUnit;
    }


    renderActiveUnitActions() {
        const p_lat = this.props.p_lat;
        const p_lng = this.props.p_lng;
        const p_andruavUnit = this.getActiveUnit();
        if (p_andruavUnit === null || p_andruavUnit === undefined) {
            return (
                <div className="nb-context-menu__empty">
                    No active vehicle selected. Select a vehicle tab first, then retry.
                </div>
            );
        }

        const v_partyID = p_andruavUnit.getPartyID();
        const v_unitType = p_andruavUnit.m_VehicleType_TXT || 'Vehicle';
        const v_icon = getVehicleIcon(p_andruavUnit);
        const v_location = (p_andruavUnit.m_Nav_Info && p_andruavUnit.m_Nav_Info.p_Location) ? p_andruavUnit.m_Nav_Info.p_Location : {};
        const v_relAlt = Number.isFinite(v_location.alt_relative) ? v_location.alt_relative : 0;
        const v_absAlt = Number.isFinite(v_location.alt_abs) ? v_location.alt_abs : v_relAlt;
        const v_homeAlt = v_absAlt - v_relAlt;
        const canFlyHere = js_andruavAuth.fn_canExecuteAction('fly_to_here') === true;
        const canSetHome = js_andruavAuth.fn_canExecuteAction('set_home') === true;
        const role = js_andruavAuth.fn_getRole();

        return (
            <div key={'cmc_active_' + v_partyID} className='nb-context-card'>
                <div className='nb-context-card__header'>
                    <img className='nb-context-card__icon' src={v_icon} alt='' aria-hidden='true' />
                    <div className='nb-context-card__meta'>
                        <p className='nb-context-card__name'>{p_andruavUnit.m_unitName}</p>
                        <p className='nb-context-card__type'>{v_unitType} | {v_partyID}</p>
                    </div>
                </div>

                <div className='nb-context-card__actions'>
                    <ClssSafetyHoldButton
                        className='nb-context-btn nb-context-btn--goto'
                        title={canFlyHere ? `Hold to fly active vehicle (${p_andruavUnit.m_unitName}) to selected point` : `Role ${role} cannot execute Fly To Here`}
                        showProgressText={true}
                        onConfirm={() => {
                            fn_closeContextPopup();
                            fn_doFlyHere(v_partyID, p_lat, p_lng, v_relAlt);
                        }}
                        disabled={canFlyHere !== true}
                    >
                        Fly To Here
                    </ClssSafetyHoldButton>
                    <ClssSafetyHoldButton
                        className='nb-context-btn nb-context-btn--home'
                        title={canSetHome ? `Hold to set home for active vehicle (${p_andruavUnit.m_unitName})` : `Role ${role} cannot execute Set Home`}
                        showProgressText={true}
                        onConfirm={() => {
                            fn_closeContextPopup();
                            fn_doSetHome(v_partyID, p_lat, p_lng, v_homeAlt);
                        }}
                        disabled={canSetHome !== true}
                    >
                        Set Home
                    </ClssSafetyHoldButton>
                </div>
            </div>
        );
    }


    render() {
        const activeUnitActions = this.renderActiveUnitActions();
        let v_lat = this.props.p_lat;
        let v_lng = this.props.p_lng;
        if (v_lat === null || v_lat === undefined)
        {
            v_lat = 0.0;
            v_lng = 0.0;
        }

        return (
            <div className="nb-context-menu col-12">
                <div className="nb-context-menu__header">
                    <p className="nb-context-menu__title">Map Action Menu</p>
                    <p className="nb-context-menu__coords">
                        Lat {v_lat.toFixed(6)} | Lng {v_lng.toFixed(6)}
                    </p>
                </div>
                {activeUnitActions}
            </div>
            
        );
    }

}


