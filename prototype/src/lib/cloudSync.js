import {
  emptyCloudWorkspace,
  cloudCacheKey,
  mergeImportedWorkspace,
  canonicalJSON,
} from "./cloudWorkspace.js";
import { validWorkspace } from "./workspace.js";

const equal = (a, b) => canonicalJSON(a) === canonicalJSON(b);
export class CloudSync {
  constructor({
    ownerId,
    storage,
    request,
    makeId = () => crypto.randomUUID(),
    delay = 700,
  }) {
    this.ownerId = ownerId;
    this.storage = storage;
    this.request = request;
    this.makeId = makeId;
    this.delay = delay;
    this.key = cloudCacheKey(ownerId);
    this.listeners = new Set();
    this.epoch = 0;
    this.running = false;
    this.ready = false;
    this.inflight = false;
    this.sequence = 0;
    let cache,
      error = "";
    try {
      cache = JSON.parse(storage.getItem(this.key) || "null");
      if (cache && (!validWorkspace(cache.state) || cache.ownerId !== ownerId))
        throw new Error("账号草稿缓存无法读取，请先导出恢复副本。");
    } catch (e) {
      error = e.message;
      cache = null;
    }
    this.blocked = !!error;
    this.revision = cache?.revision ?? 0;
    this.dirty = !!cache?.dirty;
    this.mutationId = cache?.mutationId || makeId();
    this.lastCachedMutationId = cache?.mutationId;
    this.snapshot = {
      state: cache?.state || emptyCloudWorkspace(),
      saveState: "loading",
      error,
      remoteConflict: null,
      revision: this.revision,
      ready: false,
    };
  }
  getSnapshot = () => this.snapshot;
  subscribe = (fn) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  emit(patch) {
    this.snapshot = { ...this.snapshot, ...patch, revision: this.revision };
    for (const fn of this.listeners) fn();
  }
  cache() {
    if (this.blocked) return false;
    try {
      const previous = JSON.parse(this.storage.getItem(this.key) || "null");
      // Another window may have an offline edit. Preserve it before replacing the shared cache.
      if (
        previous?.dirty &&
        previous.mutationId !== this.lastCachedMutationId &&
        previous.mutationId !== this.mutationId &&
        !equal(previous.state, this.snapshot.state)
      )
        this.storage.setItem(
          this.key + ":recovery:" + previous.mutationId,
          JSON.stringify({
            state: previous.state,
            revision: previous.revision,
            time: Date.now(),
          }),
        );
      this.storage.setItem(
        this.key,
        JSON.stringify({
          ownerId: this.ownerId,
          state: this.snapshot.state,
          revision: this.revision,
          dirty: this.dirty,
          mutationId: this.mutationId,
        }),
      );
      this.lastCachedMutationId = this.mutationId;
      return true;
    } catch {
      this.emit({
        saveState: "error",
        error: "本机空间不足或缓存无法读取，未同步内容请立即导出备份。",
      });
      return false;
    }
  }
  forget = () => {
    this.blocked = true;
    this.stop();
    const keys = [];
    for (let i = 0; i < this.storage.length; i++) {
      const key = this.storage.key(i);
      if (key === this.key || key?.startsWith(this.key + ":")) keys.push(key);
    }
    keys.forEach((key) => this.storage.removeItem(key));
  };
  setState = (change) => {
    const next =
      typeof change === "function" ? change(this.snapshot.state) : change;
    if (next === this.snapshot.state) return;
    this.dirty = true;
    this.sequence++;
    this.mutationId = this.makeId();
    this.emit({
      state: next,
      saveState: this.snapshot.remoteConflict ? "conflict" : "syncing",
    });
    this.cache();
    this.schedule();
  };
  schedule() {
    clearTimeout(this.timer);
    if (this.running && !this.snapshot.remoteConflict)
      this.timer = setTimeout(() => this.push(), this.delay);
  }
  start() {
    this.running = true;
    this.epoch++;
    return this.pull();
  }
  stop() {
    this.running = false;
    this.epoch++;
    clearTimeout(this.timer);
    this.controller?.abort();
    this.inflight = false;
    this.cache();
  }
  fail(error) {
    if (error.name === "AbortError") return;
    const expired =
      error.status === 401 ||
      error.code === "ACCOUNT_CHANGED" ||
      error.code === "ACCOUNT_DISABLED";
    this.emit({
      saveState: expired ? "expired" : "offline",
      error: expired
        ? error.message
        : "同步失败，草稿已留在本机。网络恢复后会重试。",
    });
  }
  async pull() {
    if (!this.running || this.inflight || this.blocked) return;
    const epoch = this.epoch;
    this.inflight = true;
    const controller = new AbortController();
    this.controller = controller;
    try {
      const remote = await this.request("cloud/workspace", {
        ownerId: this.ownerId,
        signal: controller.signal,
      });
      if (!this.running || epoch !== this.epoch) return;
      if (!validWorkspace(remote.state)) throw new Error("云端资料格式异常");
      this.ready = true;
      this.emit({ ready: true });
      if (
        this.dirty &&
        remote.revision !== this.revision &&
        !equal(this.snapshot.state, remote.state)
      ) {
        this.emit({ remoteConflict: remote, saveState: "conflict", error: "" });
        return;
      }
      if (!this.dirty || equal(this.snapshot.state, remote.state)) {
        this.revision = remote.revision;
        this.dirty = false;
        this.emit({
          state: remote.state,
          saveState: "synced",
          error: "",
          remoteConflict: null,
        });
        this.cache();
      }
    } catch (error) {
      if (epoch === this.epoch) this.fail(error);
    } finally {
      if (epoch === this.epoch) {
        this.inflight = false;
        if (this.dirty && !this.snapshot.remoteConflict && this.ready)
          this.schedule();
      }
    }
  }
  async push() {
    if (
      !this.running ||
      this.inflight ||
      this.blocked ||
      !this.ready ||
      !this.dirty ||
      this.snapshot.remoteConflict
    )
      return;
    const epoch = this.epoch,
      sequence = this.sequence,
      state = this.snapshot.state,
      mutationId = this.mutationId;
    this.inflight = true;
    this.emit({ saveState: "syncing" });
    const controller = new AbortController();
    this.controller = controller;
    try {
      const result = await this.request("cloud/workspace", {
        method: "PUT",
        ownerId: this.ownerId,
        signal: controller.signal,
        body: {
          state,
          revision: this.revision,
          mutationId,
          resolve: this.resolving || false,
        },
      });
      if (!this.running || epoch !== this.epoch) return;
      this.revision = result.revision;
      this.resolving = false;
      this.dirty = sequence !== this.sequence;
      this.emit({ saveState: this.dirty ? "syncing" : "synced", error: "" });
      this.cache();
    } catch (error) {
      if (epoch !== this.epoch) return;
      if (error.code === "VERSION_CONFLICT" && error.remote)
        this.emit({
          remoteConflict: error.remote,
          saveState: "conflict",
          error: "",
        });
      else this.fail(error);
    } finally {
      if (epoch === this.epoch) {
        this.inflight = false;
        if (this.dirty && this.snapshot.saveState === "syncing")
          this.schedule();
      }
    }
  }
  retry = async () => {
    await this.pull();
    await this.push();
  };
  resolve = (choice) => {
    const remote = this.snapshot.remoteConflict;
    if (!remote) return;
    // Recovery copies are owner-scoped and written before either side can be replaced.
    try {
      this.storage.setItem(
        this.key + ":recovery:" + this.makeId(),
        JSON.stringify({
          state: this.snapshot.state,
          revision: this.revision,
          time: Date.now(),
        }),
      );
    } catch {
      this.emit({ error: "恢复副本保存失败，请先导出当前内容再处理冲突。" });
      return;
    }
    const state =
      choice === "cloud"
        ? remote.state
        : choice === "both"
          ? mergeImportedWorkspace(
              remote.state,
              {
                ...this.snapshot.state,
                documents: this.snapshot.state.documents.map((d) => ({
                  ...d,
                  title: d.title + "（本机冲突副本）",
                })),
              },
              this.makeId,
            )
          : this.snapshot.state;
    this.revision = remote.revision;
    this.sequence++;
    this.mutationId = this.makeId();
    this.dirty = choice !== "cloud";
    this.resolving = this.dirty;
    this.emit({
      state,
      remoteConflict: null,
      error: "",
      saveState: this.dirty ? "syncing" : "synced",
    });
    this.cache();
    if (this.dirty) this.schedule();
  };
}
