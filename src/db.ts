/** Minimaler IndexedDB-Wrapper. Alle Daten bleiben lokal im Browser. */
const DB_NAME = 'haushaltsbudget';
const DB_VERSION = 1;
export type StoreName = 'entries' | 'recurring' | 'meta';

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('entries')) db.createObjectStore('entries', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('recurring')) db.createObjectStore('recurring', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

function wrap<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx(store: StoreName, mode: IDBTransactionMode): Promise<IDBObjectStore> {
  const db = await open();
  return db.transaction(store, mode).objectStore(store);
}

export async function getAll<T>(store: StoreName): Promise<T[]> {
  return wrap((await tx(store, 'readonly')).getAll() as IDBRequest<T[]>);
}
export async function put(store: 'entries' | 'recurring', value: { id: string }): Promise<void> {
  await wrap((await tx(store, 'readwrite')).put(value));
}
export async function remove(store: 'entries' | 'recurring', id: string): Promise<void> {
  await wrap((await tx(store, 'readwrite')).delete(id));
}
export async function getMeta<T>(key: string): Promise<T | undefined> {
  return wrap((await tx('meta', 'readonly')).get(key) as IDBRequest<T | undefined>);
}
export async function setMeta(key: string, value: unknown): Promise<void> {
  await wrap((await tx('meta', 'readwrite')).put(value, key));
}

/** Ersetzt alle Daten atomar in einer Transaktion. */
export async function replaceAll(settings: unknown, entries: { id: string }[], recurring: { id: string }[]): Promise<void> {
  const db = await open();
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction(['entries', 'recurring', 'meta'], 'readwrite');
    t.objectStore('entries').clear();
    t.objectStore('recurring').clear();
    entries.forEach((e) => t.objectStore('entries').put(e));
    recurring.forEach((r) => t.objectStore('recurring').put(r));
    t.objectStore('meta').put(settings, 'settings');
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

export async function putMany(store: 'entries' | 'recurring', values: { id: string }[]): Promise<void> {
  const db = await open();
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction(store, 'readwrite');
    values.forEach((v) => t.objectStore(store).put(v));
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}
