import { get, set, del } from "idb-keyval";

export const idbStorage = {
  getItem: async (name: string): Promise<string | null> => {
    const value = await get(name);
    return value ?? null;
  },
  setItem: async (name: string, value: string): Promise<void> => {
    await set(name, value);
  },
  removeItem: async (name: string): Promise<void> => {
    await del(name);
  },
};
