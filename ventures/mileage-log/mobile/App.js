import React, { useCallback, useEffect, useMemo, useState } from "react";
import { SafeAreaView, ScrollView, Text, View, Pressable, TextInput, Share, StyleSheet, Linking } from "react-native";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import { startTracking, stopTracking, settleDrives } from "./src/background";
import { loadPending, loadTrips, loadPlaces, savePlaces, classify, dismiss, deleteTrip } from "./src/store";
import { suggestCategory, CATEGORIES } from "./src/classify.mjs";
import { addPlace, describeDrive, logTripFor, remember, readyToConfirm } from "./src/places.mjs";
import { summarize, toCsv, money, preparerReportHtml } from "../calc.mjs";

const DONATE = "https://github.com/sponsors/Duncan-Haywood";

export default function App() {
  const [pending, setPending] = useState([]);
  const [trips, setTrips] = useState([]);
  const [places, setPlaces] = useState([]);
  const [status, setStatus] = useState("off");
  const [purpose, setPurpose] = useState({});
  const [names, setNames] = useState({}); // `${driveId}:to` -> text being typed
  const offset = -new Date().getTimezoneOffset();
  const year = new Date().getFullYear();

  const refresh = useCallback(async () => {
    await settleDrives(); // close a drive the OS stopped reporting on
    setPending(await loadPending()); setTrips(await loadTrips()); setPlaces(await loadPlaces());
  }, []);
  useEffect(() => { refresh(); const i = setInterval(refresh, 5000); return () => clearInterval(i); }, [refresh]);

  const history = useMemo(() => trips.map((t) => ({ ...t, to: t.to_loc, from: t.from_loc })), [trips]);
  const suggestFor = useCallback(
    (p) => suggestCategory(history, { to: p.to, from: p.from, startedAt: p.startedAt }, { utcOffsetMin: offset }),
    [history, offset],
  );
  const s = summarize(trips, { year }).summary;
  const ready = useMemo(() => readyToConfirm(pending, suggestFor, places), [pending, suggestFor, places]);

  // Name the unnamed ends of a drive (once per place, ever).
  const nameEnd = async (p, end) => {
    const text = (names[`${p.id}:${end}`] || "").trim();
    if (!text) return;
    const next = addPlace(places, { name: text, ...p[end] });
    await savePlaces(next); setPlaces(next);
  };
  const choose = async (p, category, placeList = places, given = {}) => {
    const typed = given.purpose ?? purpose[p.id] ?? "";
    const log = logTripFor(placeList, p, category, { utcOffsetMin: offset, purpose: typed, client: given.client || "" });
    await classify(p.id, log, p);
    const learned = remember(placeList, p, category, { purpose: log.purpose, client: log.client });
    if (learned !== placeList) await savePlaces(learned);
    await refresh();
  };
  const confirmAll = async () => {
    let list = places;
    for (const r of ready) {
      const log = logTripFor(list, r.drive, r.category, { utcOffsetMin: offset, purpose: r.purpose, client: r.client });
      await classify(r.drive.id, log, r.drive);
    }
    await refresh();
  };
  const shareReport = async () => {
    const html = preparerReportHtml(trips, { year });
    const uri = FileSystem.cacheDirectory + `mileage-report-${year}.html`;
    await FileSystem.writeAsStringAsync(uri, html);
    if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: "text/html", dialogTitle: `Mileage report ${year}` });
  };

  const recent = [...trips].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 15);

  return (
    <SafeAreaView style={st.root}>
      <ScrollView>
        <Text style={st.h1}>Mileage Log</Text>
        <Text style={st.sub}>{year} deduction so far: {money(s.mileageDeduction ?? 0)} · {Math.round(s.by.business.miles)} business miles</Text>
        <View style={st.row}>
          <Pressable style={st.btn} onPress={async () => setStatus(await startTracking())}><Text style={st.btnT}>Start auto-tracking</Text></Pressable>
          <Pressable style={st.btn2} onPress={async () => { await stopTracking(); setStatus("off"); }}><Text>Stop</Text></Pressable>
        </View>
        <Text style={st.note}>Tracking: {status}. Locations are processed and stored on this phone only.</Text>

        <Text style={st.h2}>To review ({pending.length})</Text>
        {ready.length > 1 && (
          <Pressable style={st.btn} onPress={confirmAll}><Text style={st.btnT}>Confirm {ready.length} drives I recognise</Text></Pressable>
        )}
        {pending.length === 0 && <Text style={st.note}>New drives appear here after you park.</Text>}
        {pending.map((p) => {
          const d = describeDrive(places, p);
          const sug = suggestFor(p);
          return (
            <View key={p.id} style={st.card}>
              <Text>{new Date(p.startedAt).toLocaleString()} · {p.miles} mi</Text>
              <Text style={st.route}>{d.from || "Unnamed place"} → {d.to || "Unnamed place"}</Text>
              {d.unnamed.map((end) => (
                <View key={end} style={st.row}>
                  <TextInput style={[st.input, st.grow]} placeholder={`Name the ${end === "to" ? "destination" : "start"} (e.g. Home, Smith job site)`}
                    value={names[`${p.id}:${end}`] || ""} onChangeText={(v) => setNames({ ...names, [`${p.id}:${end}`]: v })} />
                  <Pressable style={st.btn2} onPress={() => nameEnd(p, end)}><Text>Save</Text></Pressable>
                </View>
              ))}
              {sug && <Text style={st.note}>Suggested: {sug.category} ({sug.reason})</Text>}
              <TextInput style={st.input} placeholder={d.purpose ? `Purpose (usually: ${d.purpose})` : "Purpose (required for business)"}
                value={purpose[p.id] || ""} onChangeText={(v) => setPurpose({ ...purpose, [p.id]: v })} />
              <View style={st.row}>{CATEGORIES.map((c) => (
                <Pressable key={c} style={[st.chip, sug?.category === c && st.chipOn]} onPress={() => choose(p, c)}><Text>{c}</Text></Pressable>
              ))}</View>
              <Pressable onPress={async () => { await dismiss(p.id); refresh(); }}><Text style={st.note}>Not a trip — dismiss</Text></Pressable>
            </View>
          );
        })}

        <Text style={st.h2}>Recent trips</Text>
        {recent.length === 0 && <Text style={st.note}>Classified drives are listed here.</Text>}
        {recent.map((t) => (
          <View key={t.id} style={st.trip}>
            <View style={st.grow}>
              <Text>{t.date} · {t.category} · {t.miles} mi</Text>
              <Text style={st.note}>{t.from || "?"} → {t.to || "?"}{t.purpose ? ` · ${t.purpose}` : ""}</Text>
            </View>
            <Pressable onPress={async () => { await deleteTrip(t.id); refresh(); }}><Text style={st.note}>Delete</Text></Pressable>
          </View>
        ))}

        <View style={st.row}>
          <Pressable style={st.btn2} onPress={shareReport}><Text>Report for my tax preparer</Text></Pressable>
          <Pressable style={st.btn2} onPress={() => Share.share({ message: toCsv(trips), title: `mileage-${year}.csv` })}><Text>Export CSV</Text></Pressable>
          <Pressable style={st.btn2} onPress={() => Linking.openURL(DONATE)}><Text>Support the creator</Text></Pressable>
        </View>
        <Text style={st.note}>Not tax advice. Business trips need a destination and a purpose; check with a tax professional.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, padding: 16, backgroundColor: "#fff" },
  h1: { fontSize: 24, fontWeight: "700" }, h2: { fontSize: 18, fontWeight: "600", marginTop: 12 },
  sub: { color: "#333", marginVertical: 4 }, note: { color: "#555", fontSize: 12, marginVertical: 4 },
  route: { fontWeight: "600", marginTop: 2 }, grow: { flex: 1 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginVertical: 6 },
  btn: { backgroundColor: "#0b5", padding: 10, borderRadius: 8 }, btnT: { color: "#fff", fontWeight: "600" },
  btn2: { borderWidth: 1, borderColor: "#999", padding: 10, borderRadius: 8 },
  card: { borderWidth: 1, borderColor: "#ddd", borderRadius: 8, padding: 10, marginVertical: 6 },
  trip: { flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderColor: "#eee", paddingVertical: 6 },
  input: { borderWidth: 1, borderColor: "#ccc", borderRadius: 6, padding: 8, marginVertical: 6 },
  chip: { borderWidth: 1, borderColor: "#999", borderRadius: 14, paddingHorizontal: 10, paddingVertical: 6 }, chipOn: { backgroundColor: "#cfe" },
});
