import { checkForUpdate, updateNotice } from "../../infra/update/update-check.js";

export let updateState = null;
export async function refreshUpdateState() {
  updateState = await checkForUpdate();
  return updateState;
}

// The short form for tool results: null when there is nothing to say.
export function updateField() {
  return updateNotice(updateState);
}

// Spread into a result: adds `update` only when there is something to say.
export function withUpdate(payload) {
  const update = updateField();
  return update ? { ...payload, update } : payload;
}
