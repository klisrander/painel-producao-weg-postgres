const url = process.argv[2];
if (!url) throw Error("URL required");
let ready = false;
for (let i = 0; i < 30; i++) {
  try {
    if ((await fetch(url, { signal: AbortSignal.timeout(1000) })).ok) {
      ready = true;
      break;
    }
  } catch {}
  await new Promise((r) => setTimeout(r, 1000));
}
if (!ready) throw Error("Service did not become ready");
