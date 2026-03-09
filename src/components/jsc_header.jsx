
import React from 'react';

import * as  js_siteConfig from '../js/js_siteConfig'

import ClssLoginControl from './jsc_login.jsx'
import ClssCtrlLayout from './jsc_ctrl_layoutControl.jsx'

class ClssHeaderControl extends React.Component {
    constructor() {
        super();
        this.state = {
            now: new Date()
        };
        this.clockTimer = null;
    }

    componentDidMount() {
        this.clockTimer = setInterval(() => {
            this.setState({ now: new Date() });
        }, 1000);
    }

    componentWillUnmount() {
        if (this.clockTimer !== null) {
            clearInterval(this.clockTimer);
            this.clockTimer = null;
        }
    }

    render() {
        const now = this.state.now;
        const shortDay = `${now.toLocaleDateString('en-GB', { weekday: 'short' })},`;
        const shortDate = `${String(now.getDate()).padStart(2, '0')} ${now.toLocaleDateString('en-GB', { month: 'short' })} ${now.getFullYear()}`;
        const timeText = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
        const dateTimeTitle = `${shortDay} ${shortDate} ${timeText}`;

        let ctrl = [];
        if (this.props.no_layout_ctrl !== null && this.props.no_layout_ctrl !== undefined) {
            ctrl.push(
                <div key='hdr_ctrl2' className='col-9 col-lg-4     css_margin_zero css_padding_zero al_r '>
                </div>
            );
        }
        else {
            ctrl.push(
                <div key='hdr_ctrl2' className='col-9 col-lg-4     css_margin_zero css_padding_zero al_r '>
                    <div className='header-mid-controls'>
                        <ClssCtrlLayout />
                        <img
                            src="/images/de/wingxtra_brand_image.svg"
                            className="header-wingxtra-logo d-none d-lg-block"
                            alt="Wingxtra"
                        />
                        <div className='header-clock d-none d-lg-flex' title={dateTimeTitle}>
                            <span className='header-clock-day'>{shortDay}</span>
                            <span className='header-clock-date'>{shortDate}</span>
                            <span className='header-clock-time'>{timeText}</span>
                        </div>
                    </div>
                </div>
            );
        }
        if (this.props.no_login !== null && this.props.no_login !== undefined) {
            ctrl.push(
                <div key='hdr_ctrl1' className=' col-2 col-lg-1 css_margin_zero al_r header-login-slot'>

                </div>
            );
        }
        else {
            ctrl.push(
                <div key='hdr_ctrl1' className=' col-2 col-lg-1 css_margin_zero al_r header-login-slot'>
                    <ClssLoginControl simple='true' />
                </div>
            );
        }
        return (
            <div id='rowheader' key='ClssHeaderControl' className='row  css_padding_zero txt-theme-aware-bg fixed-top ps-3'>
                <div className='col-7  css_margin_zero css_padding_zero d-lg-block d-none d-xl-block header-brand-slot'>
                    <nav className="navbar navbar-expand-lg txt-theme-aware-navbar p-0 header-brand-nav">
                        <a className="navbar-brand ms-2 d-flex align-items-end header-brand-link" href=".">
                            <img src="/images/de/nexus_bridge_logo.svg" width="31" height="31" className="d-inline-block me-2 header-brand-logo" alt="Nexus Bridge logo" />
                            <span className="header-brand-title">{js_siteConfig.CONST_TITLE}</span>
                        </a>
                    </nav>
                </div>
                {ctrl}
            </div>
        );
    }
}


export default ClssHeaderControl;


