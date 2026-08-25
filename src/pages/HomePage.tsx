import React, { useEffect, useState } from "react";

// Same content/pacing as ui/pages/home.py's _QUOTE_LINES / _WORD_DELAY.
const QUOTE_LINES: { text: string; bold: boolean }[] = [
  { text: "Từng đau khổ mới biết thế nào là đau khổ.", bold: false },
  { text: "Từng chấp trước mới có thể rũ bỏ được chấp trước.", bold: false },
  { text: "Từng vấn vương mới có thể không còn vấn vương!", bold: true },
];
const WORD_DELAY_MS = 45;

const FB_POST_URL =
  "https://www.facebook.com/photo/?fbid=1423943031364508&set=a.167615383663952";
const FB_EMBED_WIDTH = 750;
const FB_EMBED_HEIGHT = 900;
const FB_VISIBLE_HEIGHT = 400;
const DISPLAY_SCALE = 0.65;

function TypingQuote() {
  const [displayed, setDisplayed] = useState<string[]>(Array(QUOTE_LINES.length).fill(""));
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function typeAll() {
      for (let li = 0; li < QUOTE_LINES.length; li++) {
        const words = QUOTE_LINES[li].text.split(" ");
        for (let wi = 0; wi < words.length; wi++) {
          if (cancelled) return;
          await new Promise((r) => setTimeout(r, WORD_DELAY_MS));
          if (cancelled) return;
          setDisplayed((prev) => {
            const next = [...prev];
            next[li] = words.slice(0, wi + 1).join(" ");
            return next;
          });
        }
      }
      if (!cancelled) setDone(true);
    }

    typeAll();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="evol-quote-card">
      <div className="evol-quote-mark evol-quote-mark-open">"</div>
      <div className={`evol-quote-typing${done ? "" : " evol-quote-cursor"}`}>
        {QUOTE_LINES.map((line, i) => (
          <p key={i}>{line.bold ? <strong>{displayed[i]}</strong> : displayed[i]}</p>
        ))}
      </div>
      <div className="evol-quote-mark evol-quote-mark-close">"</div>
    </div>
  );
}

function FacebookEmbed() {
  const href = encodeURIComponent(FB_POST_URL);
  const embedSrc =
    `https://www.facebook.com/plugins/post.php?href=${href}&width=${FB_EMBED_WIDTH}` +
    `&show_text=false&height=${FB_EMBED_HEIGHT}&appId`;
  const displayWidth = FB_EMBED_WIDTH * DISPLAY_SCALE - 10;
  const displayHeight = FB_VISIBLE_HEIGHT * DISPLAY_SCALE;

  return (
    <div style={{ display: "flex", justifyContent: "center" }}>
      <div
        style={{
          width: displayWidth,
          height: displayHeight,
          overflow: "hidden",
          borderRadius: 14,
          border: "1px solid #2a2a2a",
          background: "#161616",
          boxShadow: "0 2px 10px rgba(0,0,0,0.25)",
          position: "relative",
        }}
      >
        <div
          style={{
            width: FB_EMBED_WIDTH,
            height: FB_EMBED_HEIGHT,
            transform: `scale(${DISPLAY_SCALE})`,
            transformOrigin: "top left",
            position: "absolute",
            top: 0,
            left: 0,
          }}
        >
          <iframe
            src={embedSrc}
            width={FB_EMBED_WIDTH}
            height={FB_EMBED_HEIGHT}
            style={{ border: "none", position: "absolute", top: 0, left: 0 }}
            scrolling="no"
            frameBorder={0}
            allowFullScreen
            allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share"
          />
        </div>
      </div>
    </div>
  );
}

export function HomePage() {
  return (
    <div className="page">
      <h1 className="hero-title">EVOL Space</h1>
      <TypingQuote />
      <FacebookEmbed />
      <hr style={{ borderColor: "#2a2a2a", margin: "24px 0" }} />
    </div>
  );
}
