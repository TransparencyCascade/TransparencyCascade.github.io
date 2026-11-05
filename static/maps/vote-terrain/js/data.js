/* Where the data files come from. Normally the page folder; with ?snapshot=<slug>, the frozen copy in
   snapshots/<slug>/ written by tools/vote-terrain/snapshot.mjs, so a published piece keeps showing the
   numbers it was written from after the live data is refreshed. */
const slug = new URLSearchParams(location.search).get('snapshot');
export const SNAPSHOT = slug && /^[a-z0-9][a-z0-9-]{0,80}$/.test(slug) ? slug : null;
export const dataUrl = (file) => (SNAPSHOT ? `snapshots/${SNAPSHOT}/${file}` : file);
const get = async (file) => {
  const r = await fetch(dataUrl(file));
  if (!r.ok) throw new Error(`${dataUrl(file)}: ${r.status}`);
  return r;
};
export const getJSON = async (file) => (await get(file)).json();
export const getBin = async (file, Type) => new Type(await (await get(file)).arrayBuffer());
