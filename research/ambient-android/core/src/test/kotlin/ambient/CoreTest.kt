package ambient

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

private fun tone(n: Int, amp: Int) = ShortArray(n) { if (it % 2 == 0) amp.toShort() else (-amp).toShort() }
private fun quiet(n: Int) = ShortArray(n)

class CoreTest {
    @Test fun chunkerKeepsRemainder() {
        val c = Chunker(4); val out = ArrayList<ShortArray>()
        c.push(ShortArray(6) { it.toShort() }) { out.add(it) }
        assertEquals(1, out.size); assertEquals(2, c.pending)
        c.push(ShortArray(2) { (6 + it).toShort() }) { out.add(it) }
        assertEquals(listOf<Short>(4, 5, 6, 7), out[1].toList()); assertEquals(0, c.pending)
    }

    @Test fun vadHangover() {
        val v = EnergyVad(1000.0, 2)
        assertTrue(!v.update(quiet(10)))
        assertTrue(v.update(tone(10, 2000)))
        assertTrue(v.update(quiet(10))); assertTrue(v.update(quiet(10)))
        assertTrue(!v.update(quiet(10)))
    }

    @Test fun segmenterEmitsOneUtteranceWithPreRoll() {
        val got = ArrayList<List<ShortArray>>()
        val s = Segmenter(EnergyVad(1000.0, 1), preRoll = 2, maxFrames = 100) { got.add(it) }
        repeat(5) { s.push(quiet(10)) }
        repeat(3) { s.push(tone(10, 2000)) }
        repeat(4) { s.push(quiet(10)) }
        assertEquals(1, got.size)
        assertEquals(2 + 3 + 1, got[0].size) // pre-roll + speech + one hangover frame
    }

    @Test fun segmenterCutsLongUtterances() {
        val got = ArrayList<List<ShortArray>>()
        val s = Segmenter(EnergyVad(1000.0, 0), preRoll = 0, maxFrames = 4) { got.add(it) }
        repeat(9) { s.push(tone(10, 2000)) }
        s.close()
        assertEquals(listOf(4, 4, 1), got.map { it.size })
    }

    @Test fun silenceIsNeverEmitted() {
        var n = 0
        val s = Segmenter(EnergyVad(1000.0, 3), 2, 10) { n++ }
        repeat(50) { s.push(quiet(10)) }; s.close()
        assertEquals(0, n)
    }

    @Test fun routePreference() {
        assertEquals(Route.BLUETOOTH_LE, selectRoute(setOf(Route.WIRED, Route.BLUETOOTH_LE, Route.PHONE_MIC), null))
        assertEquals(Route.WIRED, selectRoute(setOf(Route.WIRED, Route.PHONE_MIC), null))
    }

    @Test fun headsetDropPausesByDefault() {
        assertNull(selectRoute(setOf(Route.PHONE_MIC), Route.BLUETOOTH_SCO))
        assertEquals(Route.PHONE_MIC, selectRoute(setOf(Route.PHONE_MIC), Route.BLUETOOTH_SCO, true))
        assertEquals(Route.PHONE_MIC, selectRoute(setOf(Route.PHONE_MIC), null))
    }
}
