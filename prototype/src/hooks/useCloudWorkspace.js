import { useEffect, useState, useSyncExternalStore } from "react";
import { CloudSync } from "../lib/cloudSync.js";
import { cloudRequest } from "../lib/cloudClient.js";

export function useCloudWorkspace(ownerId) {
  const [engine] = useState(
    () =>
      new CloudSync({ ownerId, storage: localStorage, request: cloudRequest }),
  );
  const snapshot = useSyncExternalStore(engine.subscribe, engine.getSnapshot);
  useEffect(() => {
    engine.start();
    const refresh = () => engine.retry(),
      flush = () => engine.cache();
    const timer = setInterval(refresh, 15000);
    window.addEventListener("online", refresh);
    window.addEventListener("focus", refresh);
    window.addEventListener("pagehide", flush);
    return () => {
      clearInterval(timer);
      window.removeEventListener("online", refresh);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("pagehide", flush);
      engine.stop();
    };
  }, [engine]);
  return {
    ...snapshot,
    setState: engine.setState,
    conflict: !!snapshot.remoteConflict,
    cloud: true,
    retry: engine.retry,
    resolveConflict: engine.resolve,
    forget: engine.forget,
  };
}
