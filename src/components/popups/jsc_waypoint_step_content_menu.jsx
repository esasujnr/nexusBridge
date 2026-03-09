import React from 'react';

import * as js_andruavMessages from '../../js/protocol/js_andruavMessages.js';
import { fn_closeContextPopup, fn_doStartMissionFrom } from '../../js/js_main.js'



export class ClssWaypointStepContextMenu extends React.Component {
    constructor() {
        super();
        this.state = {

            initialized: false,
        };

        this.key = Math.random().toString();
    }


    componentWillUnmount() {

    }

    componentDidMount() {

        if (this.state.initialized === true) {
            return;
        }

        this.state.initialized = true;

        if (this.props.OnComplete !== null && this.props.OnComplete !== undefined)
        {
            this.props.OnComplete();
        }
    }


    render() {

        const lat = this.props.p_lat;
        const lng = this.props.p_lng;
        const unit = this.props.p_unit;
        const waypoint = this.props.p_waypoint;

        const formatCoord = (value) => (
            Number.isFinite(value) ? value.toFixed(6) : String(value)
        );

        const isCircle = waypoint.waypointType === js_andruavMessages.CONST_WayPoint_TYPE_CIRCLE;
        const seq = waypoint.m_Sequence;
        const unitType = unit.m_VehicleType_TXT || 'Vehicle';

        const radius = Number.isFinite(waypoint.m_Radius) ? waypoint.m_Radius.toFixed(1) : Number.parseFloat(waypoint.m_Radius || 0).toFixed(1);
        const turns = Number.isFinite(waypoint.m_Turns) ? waypoint.m_Turns.toFixed(0) : Number.parseFloat(waypoint.m_Turns || 0).toFixed(0);

        return (
            <div className="nb-context-menu nb-waypoint-menu col-12">
                <div className="nb-context-menu__header">
                    <p className="nb-context-menu__title">{isCircle ? `Circle Seq#${seq}` : `Waypoint Seq#${seq}`}</p>
                    <p className="nb-context-menu__coords">Lat {formatCoord(lat)} | Lng {formatCoord(lng)}</p>
                    {isCircle && (
                        <p className="nb-waypoint-menu__detail">
                            Radius {radius} m | Turns {turns}
                        </p>
                    )}
                </div>

                <div className="nb-context-card nb-waypoint-card">
                    <p className="nb-waypoint-card__unit">
                        {unit.m_unitName} | {unitType}
                    </p>
                    <button
                        type="button"
                        className="nb-context-btn nb-context-btn--goto nb-waypoint-btn"
                        onClick={() => {
                            fn_closeContextPopup();
                            fn_doStartMissionFrom(unit.getPartyID(), seq);
                        }}
                    >
                        Start Here
                    </button>
                </div>
            </div>
        );
    }

}
