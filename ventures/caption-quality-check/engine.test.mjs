import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseTimestamp, stripTags, parseCaptions, classifyCaptions, checkCaptionsText, DEFAULT_OPTIONS,
} from './engine.mjs';

test('parseTimestamp: SRT format with comma millis and hours', () => {
  assert.equal(parseTimestamp('01:02:03,456'), ((1 * 60 + 2) * 60 + 3) * 1000 + 456);
});

test('parseTimestamp: WebVTT format with dot millis, hours omitted', () => {
  assert.equal(parseTimestamp('00:05.500'), 5500);
});

test('parseTimestamp: WebVTT format with hours present', () => {
  assert.equal(parseTimestamp('1:00:00.000'), 3600000);
});

test('parseTimestamp: garbage returns null', () => {
  assert.equal(parseTimestamp('not a timestamp'), null);
  assert.equal(parseTimestamp(''), null);
});

test('stripTags removes inline markup and karaoke timestamp tags', () => {
  assert.equal(stripTags('<i>Hello</i> <c.yellow>world</c>'), 'Hello world');
  assert.equal(stripTags('<00:00:01.000>Hello<00:00:02.000> world'), 'Hello world');
});

test('parseCaptions: detects SRT format and parses two clean cues', () => {
  const srt = [
    '1',
    '00:00:01,000 --> 00:00:04,000',
    'Hello world',
    '',
    '2',
    '00:00:05,000 --> 00:00:06,000',
    'Short',
    '',
  ].join('\n');
  const { format, cues, parseErrors } = parseCaptions(srt);
  assert.equal(format, 'srt');
  assert.equal(parseErrors.length, 0);
  assert.equal(cues.length, 2);
  assert.equal(cues[0].startMs, 1000);
  assert.equal(cues[0].endMs, 4000);
  assert.deepEqual(cues[0].lines, ['Hello world']);
  assert.equal(cues[1].id, '2');
});

test('parseCaptions: detects WebVTT format, skips header, parses cues', () => {
  const vtt = [
    'WEBVTT',
    '',
    '00:00:01.000 --> 00:00:04.000',
    'Hello',
    '',
    '00:00:05.000 --> 00:00:07.000',
    'World',
    '',
  ].join('\n');
  const { format, cues } = parseCaptions(vtt);
  assert.equal(format, 'webvtt');
  assert.equal(cues.length, 2);
  assert.deepEqual(cues[0].lines, ['Hello']);
});

test('parseCaptions: NOTE blocks and blank runs are not treated as cues', () => {
  const vtt = [
    'WEBVTT',
    '',
    'NOTE this is a comment',
    '',
    '00:00:01.000 --> 00:00:02.000',
    'Hi',
    '',
  ].join('\n');
  const { cues } = parseCaptions(vtt);
  assert.equal(cues.length, 1);
});

test('parseCaptions: unparsable timestamps on an arrow line are reported as a parse error', () => {
  const srt = ['1', 'garbage --> 00:00:04,000', 'Hello', ''].join('\n');
  const { cues, parseErrors } = parseCaptions(srt);
  assert.equal(cues.length, 0);
  assert.equal(parseErrors.length, 1);
});

test('parseCaptions: multi-line cue text is preserved as separate lines', () => {
  const srt = ['1', '00:00:01,000 --> 00:00:04,000', 'Line one', 'Line two', ''].join('\n');
  const { cues } = parseCaptions(srt);
  assert.deepEqual(cues[0].lines, ['Line one', 'Line two']);
});

function cue(index, start, end, lines) {
  return { index, id: null, startMs: start, endMs: end, lines: Array.isArray(lines) ? lines : [lines] };
}

test('classifyCaptions: a clean track produces no findings', () => {
  const report = classifyCaptions([
    cue(0, 1000, 4000, 'Hello world'),
    cue(1, 5000, 6000, 'Short'),
  ]);
  assert.equal(report.ok, true);
  assert.equal(report.dangerCount, 0);
  assert.equal(report.noticeCount, 0);
});

test('classifyCaptions: no cues at all reports an input error', () => {
  const report = classifyCaptions([]);
  assert.equal(report.ok, false);
  assert.match(report.inputError, /No cues found/);
});

test('classifyCaptions: reading-too-fast fires above the CPS cap', () => {
  // 40 characters in 1 second = 40 cps, above the default 20 cap.
  const report = classifyCaptions([cue(0, 0, 1000, 'x'.repeat(40))]);
  const finding = report.findings.find((f) => f.id === 'reading-too-fast');
  assert.ok(finding, 'expected a reading-too-fast finding');
  assert.equal(finding.severity, 'danger');
});

test('classifyCaptions: a cue within the CPS cap produces no reading-speed finding', () => {
  const report = classifyCaptions([cue(0, 0, 3000, 'x'.repeat(11))]); // ~3.7 cps
  assert.equal(report.findings.some((f) => f.id === 'reading-too-fast'), false);
});

test('classifyCaptions: duration-too-short fires below the minimum', () => {
  const report = classifyCaptions([cue(0, 0, 500, 'Hi')]);
  const finding = report.findings.find((f) => f.id === 'duration-too-short');
  assert.ok(finding);
  assert.equal(finding.severity, 'notice');
});

test('classifyCaptions: duration-too-long fires above the maximum', () => {
  const report = classifyCaptions([cue(0, 0, 8000, 'Hi')]);
  const finding = report.findings.find((f) => f.id === 'duration-too-long');
  assert.ok(finding);
  assert.equal(finding.severity, 'notice');
});

test('classifyCaptions: line-too-long fires above the max line length', () => {
  const report = classifyCaptions([cue(0, 0, 3000, 'x'.repeat(50))]);
  const finding = report.findings.find((f) => f.id === 'line-too-long');
  assert.ok(finding);
});

test('classifyCaptions: too-many-lines fires above the max line count', () => {
  const report = classifyCaptions([cue(0, 0, 3000, ['one', 'two', 'three'])]);
  const finding = report.findings.find((f) => f.id === 'too-many-lines');
  assert.ok(finding);
});

test('classifyCaptions: empty-cue fires for a cue with no visible text', () => {
  const report = classifyCaptions([cue(0, 0, 3000, '')]);
  const finding = report.findings.find((f) => f.id === 'empty-cue');
  assert.ok(finding);
  assert.equal(finding.severity, 'notice');
});

test('classifyCaptions: invalid-timing fires when end is at or before start, and skips duration checks', () => {
  const report = classifyCaptions([cue(0, 4000, 4000, 'x'.repeat(100))]);
  const timing = report.findings.find((f) => f.id === 'invalid-timing');
  assert.ok(timing);
  assert.equal(timing.severity, 'danger');
  assert.equal(report.findings.some((f) => f.id === 'reading-too-fast'), false, 'duration-dependent checks must be skipped');
});

test('classifyCaptions: out-of-order fires when a later cue starts earlier than an earlier one', () => {
  const report = classifyCaptions([
    cue(0, 5000, 6000, 'A'),
    cue(1, 1000, 2000, 'B'),
  ]);
  const finding = report.findings.find((f) => f.id === 'out-of-order');
  assert.ok(finding);
  assert.equal(finding.severity, 'danger');
});

test('classifyCaptions: overlapping-cues fires when one cue ends after the next starts', () => {
  const report = classifyCaptions([
    cue(0, 0, 4000, 'A'),
    cue(1, 3000, 5000, 'B'),
  ]);
  const finding = report.findings.find((f) => f.id === 'overlapping-cues');
  assert.ok(finding);
  assert.equal(finding.severity, 'danger');
});

test('classifyCaptions: gap-too-short fires for a small positive gap, not for a healthy one', () => {
  const tight = classifyCaptions([cue(0, 0, 4000, 'A'), cue(1, 4050, 5000, 'B')]);
  assert.ok(tight.findings.find((f) => f.id === 'gap-too-short'));

  const healthy = classifyCaptions([cue(0, 0, 4000, 'A'), cue(1, 5000, 6000, 'B')]);
  assert.equal(healthy.findings.some((f) => f.id === 'gap-too-short'), false);
});

test('classifyCaptions: options are configurable and override the defaults', () => {
  const report = classifyCaptions([cue(0, 0, 1000, 'x'.repeat(15))], { maxCps: 10 });
  assert.ok(report.findings.find((f) => f.id === 'reading-too-fast'), 'a lowered cap should now flag 15 cps');
});

test('DEFAULT_OPTIONS documents the commonly-used thresholds this engine ships with', () => {
  assert.equal(DEFAULT_OPTIONS.maxCps, 20);
  assert.equal(DEFAULT_OPTIONS.maxLines, 2);
});

test('checkCaptionsText: end to end on a track with a reading-speed and an overlap problem', () => {
  const srt = [
    '1',
    '00:00:01,000 --> 00:00:02,000',
    'x'.repeat(60), // way above 20 cps in 1 second
    '',
    '2',
    '00:00:01,500 --> 00:00:03,000',
    'Overlaps the previous cue',
    '',
  ].join('\n');
  const result = checkCaptionsText(srt);
  assert.equal(result.format, 'srt');
  assert.equal(result.ok, false);
  assert.ok(result.findings.some((f) => f.id === 'reading-too-fast'));
  assert.ok(result.findings.some((f) => f.id === 'overlapping-cues'));
});

test('checkCaptionsText: a clean track is ok', () => {
  const vtt = [
    'WEBVTT', '', '00:00:01.000 --> 00:00:04.000', 'Hello there', '',
    '00:00:05.000 --> 00:00:07.000', 'Friend', '',
  ].join('\n');
  const result = checkCaptionsText(vtt);
  assert.equal(result.ok, true);
  assert.equal(result.dangerCount, 0);
});

test('checkCaptionsText: an unparsable block surfaces as a danger finding rather than throwing', () => {
  const result = checkCaptionsText(['1', 'nonsense --> also-nonsense', 'Hi', ''].join('\n'));
  assert.equal(result.ok, false);
  assert.ok(result.findings.some((f) => f.id === 'unparsable-block'));
});

test('checkCaptionsText: empty input reports an input error rather than throwing', () => {
  const result = checkCaptionsText('');
  assert.equal(result.ok, false);
  assert.ok(result.inputError);
});
