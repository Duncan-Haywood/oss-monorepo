//
// Color themes selectable from the watch face settings. Backgrounds are kept
// pure black across every theme -- correct on MIP displays and the
// battery-friendly choice on AMOLED displays -- and only the accent/muted/dim
// tones change between themes. :dim is a darker version of :muted, used for
// the hour ring's night-side (18:00-06:00) ticks/numbers so the ring reads
// as a rough day/night cue at a glance.
//
module Themes {

    const THEMES = [
        { :label => "Midnight", :accent => 0x2D9CFF, :muted => 0x8A93A6, :dim => 0x454C59 },
        { :label => "Aurora",   :accent => 0x35D07F, :muted => 0x84A695, :dim => 0x3F4F47 },
        { :label => "Sand",     :accent => 0xE8A33D, :muted => 0xA69072, :dim => 0x574C3B },
        { :label => "Mono",     :accent => 0xE0E0E0, :muted => 0x808080, :dim => 0x454545 }
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
