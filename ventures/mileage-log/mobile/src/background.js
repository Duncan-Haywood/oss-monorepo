// Background location task. The OS wakes this with batches of fixes even when
// the app is closed; each batch runs through the pure detector, and finished
// drives land in the pending list for the user to classify.
import * as TaskManager from "expo-task-manager";
import * as Location from "expo-location";
import { initial, step, settle } from "./tripdetect.mjs";
import { loadEngine, saveEngine, addPending } from "./store";

export const TASK = "mileage-log-background";

TaskManager.defineTask(TASK, async ({ data, error }) => {
  if (error || !data) return;
  let state = await loadEngine(initial());
  for (const l of data.locations) {
    const r = step(state, {
      lat: l.coords.latitude, lon: l.coords.longitude, t: l.timestamp,
      speed: l.coords.speed, accuracy: l.coords.accuracy,
    });
    state = r.state;
    if (r.trip) await addPending(r.trip);
  }
  await saveEngine(state);
});

// Called when the app opens: a drive the OS stopped reporting on is closed now.
export async function settleDrives(now = Date.now()) {
  const r = settle(await loadEngine(initial()), now);
  if (r.trip) await addPending(r.trip);
  if (r.trip || r.state.mode === "idle") await saveEngine(r.state);
  return r.trip;
}

export async function startTracking() {
  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== "granted") return "foreground-denied";
  const bg = await Location.requestBackgroundPermissionsAsync();
  if (bg.status !== "granted") return "background-denied";
  if (await Location.hasStartedLocationUpdatesAsync(TASK)) return "running";
  await Location.startLocationUpdatesAsync(TASK, {
    accuracy: Location.Accuracy.Balanced,
    distanceInterval: 50,       // metres; saves battery when parked
    deferredUpdatesInterval: 15000,
    pausesUpdatesAutomatically: true,
    activityType: Location.ActivityType.AutomotiveNavigation,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: "Mileage Log is recording drives",
      notificationBody: "Locations stay on this phone.",
    },
  });
  return "started";
}

export const stopTracking = async () => {
  if (await Location.hasStartedLocationUpdatesAsync(TASK)) await Location.stopLocationUpdatesAsync(TASK);
};
