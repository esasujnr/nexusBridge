import React from 'react';

import { js_globals } from '../../js/js_globals.js'
import { js_localStorage } from '../../js/js_localStorage'
import * as js_andruavUnit from '../../js/js_andruavUnit'
import { fn_doFlyHere, fn_doSetHome, fn_closeContextPopup, getVehicleIcon } from '../../js/js_main'

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

    isActionableUnit(v_unit) {
        if (v_unit === null || v_unit === undefined) return false;
        if (v_unit.m_IsGCS === true) return false;

        return (
            (v_unit.m_flightMode === js_andruavUnit.CONST_FLIGHT_CONTROL_GUIDED)
            || (v_unit.m_flightMode === js_andruavUnit.CONST_FLIGHT_CONTROL_AUTO)
            || (v_unit.m_flightMode === js_andruavUnit.CONST_FLIGHT_PX4_AUTO_HOLD)
        );
    }


    listUnits() {
        let v_contextMenu = [];
        let sortedPartyIDs;
        if (js_localStorage.fn_getUnitSortEnabled() === true) {
            // Sort the array alphabetically
            sortedPartyIDs = js_globals.m_andruavUnitList.fn_getUnitsSortedBy_APID();
        }
        else {
            sortedPartyIDs = js_globals.m_andruavUnitList.fn_getUnitsSorted();
        }
        const p_lat = this.props.p_lat;
        const p_lng = this.props.p_lng;

        sortedPartyIDs.map((p_andruavUnit) => {

            if (this.isActionableUnit(p_andruavUnit) !== true) return null;

            const v_partyID = p_andruavUnit.getPartyID();
            const v_unitType = p_andruavUnit.m_VehicleType_TXT || 'Vehicle';
            const v_icon = getVehicleIcon(p_andruavUnit);
            const v_location = (p_andruavUnit.m_Nav_Info && p_andruavUnit.m_Nav_Info.p_Location) ? p_andruavUnit.m_Nav_Info.p_Location : {};
            const v_relAlt = Number.isFinite(v_location.alt_relative) ? v_location.alt_relative : 0;
            const v_absAlt = Number.isFinite(v_location.alt_abs) ? v_location.alt_abs : v_relAlt;
            const v_homeAlt = v_absAlt - v_relAlt;

            v_contextMenu.push(
                <div key={'cmc_' + v_partyID} className='nb-context-card'>
                    <div className='nb-context-card__header'>
                        <img className='nb-context-card__icon' src={v_icon} alt='' aria-hidden='true' />
                        <div className='nb-context-card__meta'>
                            <p className='nb-context-card__name'>{p_andruavUnit.m_unitName}</p>
                            <p className='nb-context-card__type'>{v_unitType} | {v_partyID}</p>
                        </div>
                    </div>

                    <div className='nb-context-card__actions'>
                        <button
                            type='button'
                            className='nb-context-btn nb-context-btn--goto'
                            title={'Fly ' + p_andruavUnit.m_unitName + ' to selected point'}
                            onClick={() => {
                                fn_closeContextPopup();
                                fn_doFlyHere(v_partyID, p_lat, p_lng, v_relAlt);
                            }}
                        >
                            Fly To Here
                        </button>
                        <button
                            type='button'
                            className='nb-context-btn nb-context-btn--home'
                            title={'Set home for ' + p_andruavUnit.m_unitName}
                            onClick={() => {
                                fn_closeContextPopup();
                                fn_doSetHome(v_partyID, p_lat, p_lng, v_homeAlt);
                            }}
                        >
                            Set Home Here
                        </button>
                    </div>
                </div>
            );

            return null;
        });

        return v_contextMenu;
    }


    render() {
        const listUnitsElement = this.listUnits();
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
                {listUnitsElement.length > 0 ? listUnitsElement : (
                    <div className="nb-context-menu__empty">No compatible vehicles are ready for guided actions.</div>
                )}
            </div>
            
        );
    }

}


