import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Music2,
  Map as MapIcon,
  Camera,
  Hammer,
  LogIn,
  Play,
  RotateCcw,
  ArrowUpRight,
  type LucideIcon,
} from "lucide-react";
import TextType from "../components/TextType";
import SpotlightCard from "../components/SpotlightCard";
import { useAuth } from "../contexts/AuthContext";
import { usePlayer } from "../features/player/PlayerProvider";
import { POP } from "../content/musicLibrary";
import { getPlaylists } from "../lib/musicService";
import { getPlaces } from "../lib/placesService";
import { getPhotos } from "../lib/photosService";
import { listScenes } from "../lib/scenesService";
import "./music/MusicPage.css";
import "./HomePage.css";

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
const DISPLAY_SCALE = 0.62;

const VIDEO_ID_RE = /(?:v=|\/embed\/|\/shorts\/|youtu\.be\/)([A-Za-z0-9_-]{11})/;

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function buildQuickMixTracks() {
  return POP.map(([title, url], idx) => {
    const match = url.match(VIDEO_ID_RE);
    return match
      ? {
          id: -(idx + 1),
          title,
          video_id: match[1],
          thumbnail_url: `https://i.ytimg.com/vi/${match[1]}/mqdefault.jpg`,
        }
      : null;
  }).filter((t): t is NonNullable<typeof t> => t !== null);
}

function FeaturedMemoryCard() {
  const href = encodeURIComponent(FB_POST_URL);
  const embedSrc =
    `https://www.facebook.com/plugins/post.php?href=${href}&width=${FB_EMBED_WIDTH}` +
    `&show_text=false&height=${FB_EMBED_HEIGHT}&appId`;
  const displayWidth = Math.round(FB_EMBED_WIDTH * DISPLAY_SCALE - 10);
  const displayHeight = Math.round(FB_VISIBLE_HEIGHT * DISPLAY_SCALE);

  return (
    <div
      className="music-pane home-memory-card fade-in-up"
      style={{ width: displayWidth, height: displayHeight }}
    >
      <div
        style={{
          width: displayWidth,
          height: displayHeight,
          overflow: "hidden",
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
            title="EVOL Space memory"
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

interface SpaceItem {
  label: string;
  path: string;
  icon: LucideIcon;
  glow: string;
  meta: string;
}

export function HomePage() {
  const { user } = useAuth();
  const { loadQueue, isPlaying } = usePlayer();
  const [quoteRunKey, setQuoteRunKey] = useState(0);
  const [counts, setCounts] = useState<{
    playlists: number;
    places: number;
    photos: number;
    scenes: number;
  } | null>(null);

  useEffect(() => {
    if (!user) {
      setCounts(null);
      return;
    }
    let cancelled = false;
    Promise.allSettled([
      getPlaylists(user.id),
      getPlaces(user.id),
      getPhotos(user.id),
      listScenes(user.id),
    ]).then(([pl, pm, ph, sc]) => {
      if (cancelled) return;
      setCounts({
        playlists: pl.status === "fulfilled" ? pl.value.length : 0,
        places: pm.status === "fulfilled" ? pm.value.length : 0,
        photos: ph.status === "fulfilled" ? ph.value.length : 0,
        scenes: sc.status === "fulfilled" ? sc.value.length : 0,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleQuickMix() {
    const tracks = buildQuickMixTracks();
    if (tracks.length > 0) loadQueue(tracks, "normal");
  }

  const spaces: SpaceItem[] = [
    {
      label: "Music",
      path: "/music",
      icon: Music2,
      glow: "139, 111, 245",
      meta: counts ? `${counts.playlists} playlists` : "Playlists & player",
    },
    {
      label: "Map",
      path: "/map",
      icon: MapIcon,
      glow: "34, 211, 238",
      meta: counts ? `${counts.places} places` : "Atlas & lists",
    },
    {
      label: "Photobooth",
      path: "/photobooth",
      icon: Camera,
      glow: "232, 121, 249",
      meta: counts ? `${counts.photos} photos` : "Camera & filters",
    },
    {
      label: "Work",
      path: "/work",
      icon: Hammer,
      glow: "139, 111, 245",
      meta: counts ? `${counts.scenes} scenes` : "3D studio",
    },
  ];

  return (
    <div className="page home-page-shell">
      <section className="home-hero-grid">
        <div className="music-pane home-hero-card fade-in-up">
          <div>
            <div className="home-kicker-meta">
              <span className="home-kicker-accent">EVOL Space</span>
              <span aria-hidden="true">·</span>
              <span>{user ? `@${user.username}` : "Guest"}</span>
            </div>

            <h1 className="home-hero-headline">
              {user ? `${getGreeting()}, ${user.name}.` : "Your corner of the galaxy."}
            </h1>
          </div>

          <div className="home-quote-block">
            <div className="home-quote-body">
              <TextType
                key={quoteRunKey}
                text={QUOTE_LINES.join("\n")}
                typingSpeed={40}
                pauseDuration={1500}
                showCursor
                cursorCharacter="_"
                deletingSpeed={45}
                cursorBlinkDuration={0.5}
                loop={false}
                className="home-quote-text"
              />
            </div>
            <button
              type="button"
              className="home-quote-replay"
              onClick={() => setQuoteRunKey((k) => k + 1)}
              title="Replay quote"
              aria-label="Replay quote"
            >
              <RotateCcw size={13} />
            </button>
          </div>

          <div className="home-cta-row">
            <Link
              to={user ? "/music" : "/login"}
              className="home-primary-cta cursor-target"
            >
              {user ? <Music2 size={14} /> : <LogIn size={14} />}
              {user ? "Music" : "Sign in"}
            </Link>
            <button
              type="button"
              className="home-secondary-cta cursor-target"
              onClick={handleQuickMix}
            >
              <Play size={13} />
              {isPlaying ? "Restart mix" : "Quick mix"}
            </button>
          </div>
        </div>

        <FeaturedMemoryCard />
      </section>

      <section className="home-spaces-grid fade-in-up">
        {spaces.map(({ label, path, icon: Icon, glow, meta }) => (
          <Link key={path} to={path} className="home-space-link">
            <SpotlightCard glowColor={glow} className="home-space-card cursor-target">
              <div className="home-space-top">
                <div className="home-space-title-row">
                  <Icon size={17} className="home-space-icon" />
                  <h2 className="home-space-name">{label}</h2>
                </div>
                <ArrowUpRight size={15} className="home-space-arrow" />
              </div>
              <div className="home-space-meta">{meta}</div>
            </SpotlightCard>
          </Link>
        ))}
      </section>
    </div>
  );
}