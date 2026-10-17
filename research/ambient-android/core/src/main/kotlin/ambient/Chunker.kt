package ambient

/** Re-frames arbitrary-length 16-bit PCM reads into fixed-size frames. */
class Chunker(private val frameSize: Int) {
    init { require(frameSize > 0) }
    private var buf = ShortArray(0)

    fun push(samples: ShortArray, onFrame: (ShortArray) -> Unit) {
        buf += samples
        var off = 0
        while (buf.size - off >= frameSize) {
            onFrame(buf.copyOfRange(off, off + frameSize))
            off += frameSize
        }
        buf = buf.copyOfRange(off, buf.size)
    }

    val pending: Int get() = buf.size
}
