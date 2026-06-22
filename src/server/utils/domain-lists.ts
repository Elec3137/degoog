import { searchListsFile } from "./paths";
import { createListStore } from "./list-store";
import { SEARCH_LIST_FIELDS } from "../../shared/settings-lists";

export type DomainListKey = (typeof SEARCH_LIST_FIELDS)[number];
export type DomainLists = Record<DomainListKey, string>;

const store = createListStore<DomainListKey>({
  keys: SEARCH_LIST_FIELDS,
  file: searchListsFile,
  namespace: "domain-lists",
});

export const isDomainListKey = store.isListKey;
export const readDomainLists = store.readLists;
export const writeDomainList = store.writeList;
