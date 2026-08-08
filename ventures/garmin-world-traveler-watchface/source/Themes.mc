//
// Color themes selectable from the watch face settings. Backgrounds are kept
// pure black across every theme -- correct on MIP displays and the
// battery-friendly choice on AMOLED displays -- and only the accent/muted
// tones change between themes.
//
module Themes {

    const THEMES = [
        { :label => "Midnight", :accent => 0x2D9CFF, :muted => 0x8A93A6 },
        { :label => "Aurora",   :accent => 0x35D07F, :muted => 0x84A695 },
        { :label => "Sand",     :accent => 0xE8A33D, :muted => 0xA69072 },
        { :label => "Mono",     :accent => 0xE0E0E0, :muted => 0x808080 }
    ];

    function get(index) {
        var n = THEMES.size();
        var i = index % n;
        if (i < 0) {
            i += n;
        }
        return THEMES[i];
    }

}
