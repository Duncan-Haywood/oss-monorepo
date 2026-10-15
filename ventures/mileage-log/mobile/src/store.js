// On-device storage only. Nothing here is sent anywhere.
import AsyncStorage from "@react-native-async-storage/async-storage";

const K = { engine: "ml.engine", pending: "ml.pending", trips: "ml.trips", places: "ml.places", vehicles: "ml.vehicles", active: "ml.activeVehicle", schedule: "ml.schedule" };
const read = async (k, d) => { try { const v = await AsyncStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } };
const write = (k, v) => AsyncStorage.setItem(k, JSON.stringify(v));

export const loadEngine = (initial) => read(K.engine, initial);
export const saveEngine = (s) => write(K.engine, s);
export const loadPending = () => read(K.pending, []);
export const loadTrips = () => read(K.trips, []);
export const loadPlaces = () => read(K.places, []);
export const savePlaces = (p) => write(K.places, p);
export const loadVehicles = () => read(K.vehicles, []);
export const saveVehicles = (v) => write(K.vehicles, v);
export const loadActiveVehicle = () => read(K.active, "");
export const saveActiveVehicle = (v) => write(K.active, v);
export const loadSchedule = () => read(K.schedule, null);
export const saveSchedule = (s) => write(K.schedule, s);
export const saveTrips = (t) => write(K.trips, t);
export async function deleteTrip(id) {
  await write(K.trips, (await loadTrips()).filter((t) => t.id !== id));
}

export async function addPending(drive) {
  const list = await loadPending();
  list.push({ id: String(drive.startedAt), ...drive });
  await write(K.pending, list);
}

// Classify a pending drive: moves it into the log in the web app's trip format.
export async function classify(id, logTrip, drive) {
  const pending = (await loadPending()).filter((p) => p.id !== id);
  const trips = await loadTrips();
  trips.push({ ...logTrip, id: "m" + id, to_loc: drive.to, from_loc: drive.from, startedAt: drive.startedAt });
  await write(K.pending, pending);
  await write(K.trips, trips);
}
export async function dismiss(id) {
  await write(K.pending, (await loadPending()).filter((p) => p.id !== id));
}
