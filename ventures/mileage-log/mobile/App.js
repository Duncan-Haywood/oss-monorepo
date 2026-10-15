import React, { useCallback, useEffect, useState } from "react";
import { SafeAreaView, Text, View, FlatList, Pressable, TextInput, Share, StyleSheet, Linking } from "react-native";
import { startTracking, stopTracking } from "./src/background";
import { loadPending, loadTrips, classify, dismiss } from "./src/store";
import { suggestCategory, toLogTrip, CATEGORIES } from "./src/classify.mjs";
import { summarize, toCsv, money } from "../calc.mjs";

const DONATE = "https://github.com/sponsors/Duncan-Haywood";

export default function App() {
  const [pending, setPending] = useState([]);
  const [trips, setTrips] = useState([]);
  const [status, setStatus] = useState("off");
  const [purpose, setPurpose] = useState({});
  const offset = -new Date().getTimezoneOffset();

  const refresh = useCallback(async () => { setPending(await loadPending()); setTrips(await loadTrips()); }, []);
  useEffect(() => { refresh(); const i = setInterval(refresh, 5000); return () => clearInterval(i); }, [refresh]);

  const year = new Date().getFullYear();
  const s = summarize(trips, { year }).summary;
  const choose = async (p, category) => {
    const log = toLogTrip(p, category, { utcOffsetMin: offset, purpose: purpose[p.id] || "", to: "" });
    await classify(p.id, log, p);
    refresh();
  };

  return (
    <SafeAreaView style={st.root}>
      <Text style={st.h1}>Mileage Log</Text>
      <Text style={st.sub}>{year} deduction so far: {money(s.mileageDeduction ?? 0)} · {Math.round(s.by.business.miles)} business miles</Text>
      <View style={st.row}>
        <Pressable style={st.btn} onPress={async () => setStatus(await startTracking())}><Text style={st.btnT}>Start auto-tracking</Text></Pressable>
        <Pressable style={st.btn2} onPress={async () => { await stopTracking(); setStatus("off"); }}><Text>Stop</Text></Pressable>
      </View>
      <Text style={st.note}>Tracking: {status}. Locations are processed and stored on this phone only.</Text>
      <Text style={st.h2}>To review ({pending.length})</Text>
      <FlatList data={pending} keyExtractor={(p) => p.id} ListEmptyComponent={<Text style={st.note}>New drives appear here after you park.</Text>}
        renderItem={({ item: p }) => {
          const sug = suggestCategory(trips.map((t) => ({ ...t, to: t.to_loc, from: t.from_loc })), { to: p.to, from: p.from, startedAt: p.startedAt }, { utcOffsetMin: offset });
          return (
            <View style={st.card}>
              <Text>{new Date(p.startedAt).toLocaleString()} · {p.miles} mi</Text>
              {sug && <Text style={st.note}>Suggested: {sug.category} ({sug.reason})</Text>}
              <TextInput style={st.input} placeholder="Purpose (required for business)" value={purpose[p.id] || ""} onChangeText={(v) => setPurpose({ ...purpose, [p.id]: v })} />
              <View style={st.row}>{CATEGORIES.map((c) => (
                <Pressable key={c} style={[st.chip, sug?.category === c && st.chipOn]} onPress={() => choose(p, c)}><Text>{c}</Text></Pressable>
              ))}</View>
              <Pressable onPress={async () => { await dismiss(p.id); refresh(); }}><Text style={st.note}>Not a trip — dismiss</Text></Pressable>
            </View>
          );
        }} />
      <View style={st.row}>
        <Pressable style={st.btn2} onPress={() => Share.share({ message: toCsv(trips), title: `mileage-${year}.csv` })}><Text>Export CSV</Text></Pressable>
        <Pressable style={st.btn2} onPress={() => Linking.openURL(DONATE)}><Text>Support the creator</Text></Pressable>
      </View>
      <Text style={st.note}>Not tax advice. Business trips need a purpose; check with a tax professional.</Text>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, padding: 16, backgroundColor: "#fff" },
  h1: { fontSize: 24, fontWeight: "700" }, h2: { fontSize: 18, fontWeight: "600", marginTop: 12 },
  sub: { color: "#333", marginVertical: 4 }, note: { color: "#555", fontSize: 12, marginVertical: 4 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginVertical: 6 },
  btn: { backgroundColor: "#0b5", padding: 10, borderRadius: 8 }, btnT: { color: "#fff", fontWeight: "600" },
  btn2: { borderWidth: 1, borderColor: "#999", padding: 10, borderRadius: 8 },
  card: { borderWidth: 1, borderColor: "#ddd", borderRadius: 8, padding: 10, marginVertical: 6 },
  input: { borderWidth: 1, borderColor: "#ccc", borderRadius: 6, padding: 8, marginVertical: 6 },
  chip: { borderWidth: 1, borderColor: "#999", borderRadius: 14, paddingHorizontal: 10, paddingVertical: 6 }, chipOn: { backgroundColor: "#cfe" },
});
