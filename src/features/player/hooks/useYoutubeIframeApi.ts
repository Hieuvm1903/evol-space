let apiPromise: Promise<void> | null = null;

export function loadYouTubeIframeApi(): Promise<void> {
  if ((window as any).YT?.Player) return Promise.resolve();
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve, reject) => {
    let settled = false;
    const finish = (ok: boolean, err?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (ok) resolve();
      else {
        apiPromise = null;
        reject(err ?? new Error("Failed to load YouTube IFrame API"));
      }
    };

    const timer = window.setTimeout(() => {
      finish(false, new Error("Timed out loading YouTube IFrame API"));
    }, 15000);

    const prev = (window as any).onYouTubeIframeAPIReady;
    (window as any).onYouTubeIframeAPIReady = () => {
      prev?.();
      finish(true);
    };

    const existing = document.getElementById("yt-iframe-api") as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("error", () => finish(false, new Error("YouTube IFrame API script failed")), { once: true });
      return;
    }

    const tag = document.createElement("script");
    tag.id = "yt-iframe-api";
    tag.src = "https://www.youtube.com/iframe_api";
    tag.onerror = () => {
      tag.remove();
      finish(false, new Error("YouTube IFrame API script failed"));
    };
    document.body.appendChild(tag);
  });
  return apiPromise;
}