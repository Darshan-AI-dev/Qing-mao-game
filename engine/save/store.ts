/**
 * Save storage: IndexedDB first, localStorage as a fallback.
 *
 * Safari evicts script-writable storage after seven days of browser use without a
 * visit to the site, which would quietly destroy a player's save over a holiday.
 * Home-screen web apps are exempt, so the game asks for persistence and, on iOS,
 * recommends installing. `persisted()` drives that prompt.
 */

const DB_NAME = 'qing-mao';
const DB_VERSION = 1;
const STORE = 'saves';
const LS_PREFIX = 'qing-mao:';

export type SlotId = 'auto' | 'slot1' | 'slot2' | 'slot3' | 'legacy';

export interface SlotSummary {
  slot: SlotId;
  savedAt: number;
  chapter: number;
  act: string;
  playtimeSeconds: number;
  bytes: number;
}

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') return resolve(null);
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      // Private windows and locked-down profiles throw here rather than erroring.
      return resolve(null);
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
  return dbPromise;
}

function idb<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest): Promise<T | null> {
  return openDb().then(
    (db) =>
      new Promise<T | null>((resolve) => {
        if (!db) return resolve(null);
        try {
          const tx = db.transaction(STORE, mode);
          const request = run(tx.objectStore(STORE));
          request.onsuccess = () => resolve(request.result as T);
          request.onerror = () => resolve(null);
        } catch {
          resolve(null);
        }
      })
  );
}

/** Ask the browser not to evict us. Safe to call more than once. */
export async function requestPersistence(): Promise<boolean> {
  try {
    if (navigator.storage?.persisted && (await navigator.storage.persisted())) return true;
    if (navigator.storage?.persist) return await navigator.storage.persist();
  } catch {
    /* some browsers reject rather than returning false */
  }
  return false;
}

export async function persisted(): Promise<boolean> {
  try {
    return (await navigator.storage?.persisted?.()) ?? false;
  } catch {
    return false;
  }
}

/** True on iOS Safari outside a home-screen app, where the seven-day eviction applies. */
export function atEvictionRisk(): boolean {
  const ua = navigator.userAgent;
  const iOS = /iP(hone|ad|od)/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1);
  const standalone =
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return iOS && !standalone;
}

function lsKey(slot: SlotId): string {
  return `${LS_PREFIX}${slot}`;
}

export async function write(slot: SlotId, data: unknown): Promise<number> {
  const json = JSON.stringify(data);
  const stored = await idb<IDBValidKey>('readwrite', (store) => store.put(json, slot));
  if (stored === null) {
    try {
      localStorage.setItem(lsKey(slot), json);
    } catch {
      // Quota or a blocked profile. The caller surfaces this; we never throw from a save.
      return 0;
    }
  }
  return json.length;
}

export async function read<T>(slot: SlotId): Promise<T | null> {
  const fromIdb = await idb<string>('readonly', (store) => store.get(slot));
  const json = fromIdb ?? safeLocalGet(lsKey(slot));
  if (!json) return null;
  try {
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

export async function remove(slot: SlotId): Promise<void> {
  await idb('readwrite', (store) => store.delete(slot));
  try {
    localStorage.removeItem(lsKey(slot));
  } catch {
    /* nothing to remove */
  }
}

function safeLocalGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Reads the previous build's v1-v4 save, which always lived in localStorage. */
export function readLegacyBuildSave(): unknown | null {
  for (const key of ['qingmao.save', 'qing-mao-save', 'qingMaoSave', 'save']) {
    const json = safeLocalGet(key);
    if (!json) continue;
    try {
      const parsed = JSON.parse(json) as { version?: number };
      if (typeof parsed?.version === 'number' && parsed.version >= 1 && parsed.version <= 4) return parsed;
    } catch {
      /* not ours */
    }
  }
  return null;
}
