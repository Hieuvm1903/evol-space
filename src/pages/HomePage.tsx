import React from "react";
import { Link } from "react-router-dom";
import {
  Sparkles, Music2, Map as MapIcon, Camera, Hammer, LogIn, UserRound, type LucideIcon,
} from "lucide-react";
import TextType from "../components/TextType";
import { useAuth } from "../contexts/AuthContext";
import "./music/MusicPage.css";
import "./AuthPage.css";
import "./HomePage.css";

// Same content/pacing as ui/pages/home.py's _QUOTE_LINES / _WORD_DELAY.
const QUOTE_LINES: string[] = [
  "Từng đau khổ mới biết thế nào là đau khổ.",
  "Từng chấp trước mới có thể rũ bỏ được chấp trước.",
  "Từng vấn vương mới có thể không còn vấn vương!",
];

const FB_POST_URL =
  "https://www.facebook.com/photo/?fbid=1423943031364508&set=a.167615383663952";
const FB_EMBED_WIDTH = 750;
const FB_EMBED_HEIGHT = 900;
const FB_VISIBLE_HEIGHT = 400;
const DISPLAY_SCALE = 0.65;

function FacebookEmbed() {
  const href = encodeURIComponent(FB_POST_URL);
  const embedSrc =
    `https://www.facebook.com/plugins/post.php?href=${href}&width=${FB_EMBED_WIDTH}` +
    `&show_text=false&height=${FB_EMBED_HEIGHT}&appId`;
  const displayWidth = FB_EMBED_WIDTH * DISPLAY_SCALE - 10;
  const displayHeight = FB_VISIBLE_HEIGHT * DISPLAY_SCALE;

  return (
    <div className="home-embed-outer">
      <div
        style={{
          width: displayWidth,
          height: displayHeight,
          overflow: "hidden",
          borderRadius: 14,
          border: "1px solid var(--evol-border)",
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
  const { user } = useAuth();

  const links: { label: string; path: string; icon: LucideIcon }[] = [
    { label: "Music", path: "/music", icon: Music2 },
    { label: "Map", path: "/map", icon: MapIcon },
    { label: "Photobooth", path: "/photobooth", icon: Camera },
    { label: "Work", path: "/work", icon: Hammer },
    user
      ? { label: "Profile", path: "/profile", icon: UserRound }
      : { label: "Log in", path: "/login", icon: LogIn },
  ];

  return (
    <div className="page auth-page-shell">
      <div className="music-shell-header fade-in-up">
        <h2 className="music-title"><Sparkles size={20} className="music-title-icon" /> Home</h2>
        <p className="music-subtitle">
          {user ? `Welcome back, ${user.username}.` : "Welcome to your little corner of the galaxy."}
        </p>
      </div>

      <div className="auth-workspace">
        {/* Left: quick links */}
        <div className="music-pane fade-in-up">
          <div className="auth-pane-body auth-side">
            <Sparkles size={34} className="auth-side-icon" />
            <h3>EVOL Space</h3>
            <p className="auth-side-sub">Jump to anywhere.</p>
            <div className="home-links">
              {links.map(({ label, path, icon: Icon }) => (
                <Link key={path} to={path} className="home-link cursor-target">
                  <Icon size={15} />
                  {label}
                </Link>
              ))}
            </div>
          </div>
        </div>

        {/* Right: quote + embed */}
        <div className="music-pane fade-in-up">
          <div className="auth-pane-body home-main">
            <div className="evol-quote-card">
              <TextType
                text={QUOTE_LINES.join("\n")}
                typingSpeed={50}
                pauseDuration={1500}
                showCursor
                cursorCharacter="_"
                deletingSpeed={50}
                cursorBlinkDuration={0.5}
                loop={false}
                className="evol-quote-text"
              />
            </div>
            <FacebookEmbed />
          </div>
        </div>
      </div>
    </div>
  );
}