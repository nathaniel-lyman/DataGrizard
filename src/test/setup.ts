// Node 26 exposes an experimental global localStorage getter that returns no
// usable storage unless Node is launched with --localstorage-file. That getter
// can prevent Vitest's jsdom environment from installing its own implementation.
// Keep the test environment deterministic across every supported Node >=20.
const storageDescriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
const needsStorageShim = storageDescriptor && !("value" in storageDescriptor && storageDescriptor.value);

if (needsStorageShim) {
  class MemoryStorage implements Storage {
    readonly #items = new Map<string, string>();

    get length() {
      return this.#items.size;
    }

    clear() {
      this.#items.clear();
    }

    getItem(key: string) {
      return this.#items.get(String(key)) ?? null;
    }

    key(index: number) {
      return [...this.#items.keys()][index] ?? null;
    }

    removeItem(key: string) {
      this.#items.delete(String(key));
    }

    setItem(key: string, value: string) {
      this.#items.set(String(key), String(value));
    }
  }

  Object.defineProperty(globalThis, "Storage", {
    configurable: true,
    value: MemoryStorage,
  });
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: new MemoryStorage(),
  });
}
