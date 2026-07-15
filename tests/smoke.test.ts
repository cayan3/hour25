import { describe, it, expect } from 'vitest';

describe('fake-indexeddb setup', () => {
  it('provides a global indexedDB', () => {
    expect(typeof indexedDB).toBe('object');
  });

  it('can open a database and put/get a record', async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('smoke-test-db', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('items', { keyPath: 'id' });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('items', 'readwrite');
      tx.objectStore('items').put({ id: 1, value: 'hello' });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    const value = await new Promise<{ id: number; value: string }>((resolve, reject) => {
      const tx = db.transaction('items', 'readonly');
      const req = tx.objectStore('items').get(1);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });

    expect(value).toEqual({ id: 1, value: 'hello' });
    db.close();
  });
});
