package ambient

/**
 * Turns a frame stream into utterances. Frames are only buffered while the VAD is active
 * (plus [preRoll] frames before onset), so silence is never kept or sent. [onUtterance]
 * receives the frames of one utterance, e.g. to stream to the recogniser on the device.
 * Utterances longer than [maxFrames] are cut.
 */
class Segmenter(
    private val vad: EnergyVad,
    private val preRoll: Int,
    private val maxFrames: Int,
    private val onUtterance: (List<ShortArray>) -> Unit,
) {
    private val ring = ArrayDeque<ShortArray>()
    private val cur = ArrayList<ShortArray>()
    private var active = false

    fun push(frame: ShortArray) {
        val speech = vad.update(frame)
        if (speech) {
            if (!active) { cur.addAll(ring); ring.clear(); active = true }
            cur.add(frame)
            if (cur.size >= maxFrames) flush()
        } else {
            if (active) flush()
            ring.addLast(frame)
            while (ring.size > preRoll) ring.removeFirst()
        }
    }

    /** Emit any open utterance (call on service stop). */
    fun close() { if (active) flush() }

    private fun flush() {
        if (cur.isNotEmpty()) onUtterance(cur.toList())
        cur.clear()
        active = false
    }
}
