"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const [messages, setMessages] = useState<
    Array<{ from: "me" | "peer"; text: string; ts: number }>
  >([]);
  const [chatInput, setChatInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const router = useRouter();

  const [authChecked, setAuthChecked] = useState(false);
  const [authUser, setAuthUser] = useState<any | null>(null);
  const [callInitiated, setCallInitiated] = useState(false);

  // Instagram exchange state
  const [myIg, setMyIg] = useState("");
  const [myIgShared, setMyIgShared] = useState(false);
  const [peerIg, setPeerIg] = useState<string | null>(null);

  const chatInputRef = useRef<HTMLInputElement | null>(null);
  const [country, setCountry] = useState("United States");
  const [language, setLanguage] = useState("English");
  const [isLive, setIsLive] = useState(false);
  const [isFakeStream, setIsFakeStream] = useState(false);
  const [onlineCount, setOnlineCount] = useState(0);
  const [waitingCount, setWaitingCount] = useState(0);
  const [status, setStatus] = useState<
    "idle" | "searching" | "connecting" | "connected"
  >("idle");
  const [myId, setMyId] = useState<string | null>(null);

  // Admin Features: Snap Filters
  const [activeFilter, setActiveFilter] = useState("none");
  const [wsStatus, setWsStatus] = useState<
    "disconnected" | "connecting" | "connected"
  >("disconnected");
  const isAdmin = authUser?.role === "admin";

  const filters = [
    { id: "none", name: "Original", style: "" },
    { id: "grayscale", name: "Noir", style: "grayscale(100%)" },
    { id: "sepia", name: "Vintage", style: "sepia(100%)" },
    {
      id: "brightness",
      name: "Glamour",
      style: "brightness(1.5) contrast(1.1) saturate(1.2)",
    },
    { id: "blur", name: "Privacy", style: "blur(10px)" },
    { id: "hue", name: "Cyberpunk", style: "hue-rotate(180deg) saturate(2)" },
    { id: "invert", name: "Negative", style: "invert(100%)" },
  ];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (status === "connected") {
      setIsLive(true);
      setTimeout(() => chatInputRef.current?.focus(), 100);
    } else {
      setIsLive(false);
    }
  }, [status]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (status === "idle") {
          findPartner();
        } else {
          nextPartner();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [status]);

  const SIGNALING_URL =
    typeof window !== "undefined"
      ? process.env.NEXT_PUBLIC_SIGNALING_SERVER_URL || "ws://localhost:8082"
      : "";

  // Create a synthetic MediaStream (canvas video + silent audio) for testing without camera/mic
  function createFakeMediaStream() {
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 480;
    const ctx = canvas.getContext("2d");
    let frame = 0;
    const iv = window.setInterval(() => {
      if (!ctx) return;
      ctx.fillStyle = "#0b1220";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#ffffff";
      ctx.font = "24px sans-serif";
      ctx.fillText("Fake Camera", 20, 40);
      ctx.fillText(new Date().toLocaleTimeString(), 20, 80);
      ctx.fillText(`Frame ${frame++}`, 20, 120);
    }, 1000 / 30);

    const videoStream = (canvas as any).captureStream(30);

    // create a silent audio track
    const AudioCtx =
      (window as any).AudioContext || (window as any).webkitAudioContext;
    const ac = new AudioCtx();
    const dst = ac.createMediaStreamDestination();
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    gain.gain.value = 0; // silent
    osc.connect(gain);
    gain.connect(dst);
    try {
      osc.start();
    } catch (e) {}

    const combined = new MediaStream([
      ...videoStream.getVideoTracks(),
      ...dst.stream.getAudioTracks(),
    ]);
    // attach cleanup helper
    (combined as any)._fakeCleanup = () => {
      clearInterval(iv);
      try {
        osc.stop();
      } catch (e) {}
      try {
        ac.close();
      } catch (e) {}
    };
    return combined;
  }

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!authChecked) return;
    setWsStatus("connecting");
    const ws = new WebSocket(SIGNALING_URL);
    wsRef.current = ws;
    ws.onopen = () => {
      console.log("connected to signaling server");
      setWsStatus("connected");
      // Request initial stats
      ws.send(JSON.stringify({ type: "get-stats" }));
    };
    ws.onmessage = (ev) => {
      let data: any;
      try {
        data = JSON.parse(ev.data);
      } catch (e) {
        return;
      }
      handleSignalMessage(data);
    };
    ws.onclose = () => {
      console.log("signaling closed");
      setWsStatus("disconnected");
    };
    return () => {
      ws.close();
    };
  }, []);

  // check authentication before allowing access to home
  useEffect(() => {
    if (typeof window === "undefined") return;
    let mounted = true;
    (async () => {
      try {
        const res = await fetch("/api/me", { cache: "no-store" });
        if (!mounted) return;
        if (!res.ok) {
          // not authenticated -> redirect to signup
          router.replace("/signup");
          return;
        }
        const json = await res.json();
        if (json?.ok) setAuthUser(json.user);
      } catch (e) {
        router.replace("/signup");
      } finally {
        if (mounted) setAuthChecked(true);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [router]);

  // Poll for stats every 5 seconds
  useEffect(() => {
    if (wsStatus !== "connected") return;
    const iv = setInterval(() => {
      send({ type: "get-stats" });
    }, 5000);
    return () => clearInterval(iv);
  }, [wsStatus]);

  async function startCamera() {
    if (localStreamRef.current) return;

    const constraints = [
      { video: true, audio: true },
      { video: true, audio: false },
      { video: false, audio: true },
    ];

    for (const constraint of constraints) {
      try {
        const s = await navigator.mediaDevices.getUserMedia(constraint);
        localStreamRef.current = s;
        if (localVideoRef.current) localVideoRef.current.srcObject = s;
        console.log("Media started with constraints:", constraint);
        setIsFakeStream(false);
        return;
      } catch (err) {
        console.warn(
          `Failed to start media with constraints:`,
          constraint,
          err,
        );
      }
    }

    // If all real hardware attempts fail, fallback to fake stream
    console.warn("No camera/mic found. Using virtual stream for testing.");
    setIsFakeStream(true);
    const fake = createFakeMediaStream();
    localStreamRef.current = fake;
    if (localVideoRef.current) localVideoRef.current.srcObject = fake;
  }

  function send(obj: any) {
    wsRef.current?.send(JSON.stringify(obj));
  }

  async function findPartner() {
    await startCamera();
    send({ type: "join" });
    setStatus("searching");
  }

  // Handle structured messages received over the RTC data channel
  function handleDataChannelMessage(data: any) {
    if (!data || typeof data !== "object") return;
    switch (data.type) {
      case "ig-approved":
        // peer has shared their IG (both sides must click approve to send)
        if (data.ig) setPeerIg(String(data.ig));
        break;
      default:
        console.log("unknown datachannel message", data);
    }
  }

  async function createPeerConnection(initiator?: boolean) {
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });
    pc.onicecandidate = (e) => {
      if (e.candidate) send({ type: "ice-candidate", candidate: e.candidate });
    };
    pc.ontrack = (e) => {
      if (remoteVideoRef.current)
        remoteVideoRef.current.srcObject = e.streams[0];
    };
    if (localStreamRef.current) {
      for (const track of localStreamRef.current.getTracks()) {
        pc.addTrack(track, localStreamRef.current);
      }
    }

    // Set up data channel handlers: initiator creates, receiver listens
    if (initiator) {
      const dc = pc.createDataChannel("chat");
      dataChannelRef.current = dc;
      dc.onopen = () => console.log("datachannel open");
      dc.onmessage = (e) => {
        const raw = e.data;
        try {
          const parsed = JSON.parse(String(raw));
          if (parsed && parsed.type) {
            handleDataChannelMessage(parsed);
            return;
          }
        } catch (err) {
          // not JSON, treat as chat text
        }
        setMessages((prev) => [
          ...prev,
          { from: "peer", text: String(raw), ts: Date.now() },
        ]);
      };
    } else {
      pc.ondatachannel = (ev) => {
        const dc = ev.channel;
        dataChannelRef.current = dc;
        dc.onopen = () => console.log("datachannel open");
        dc.onmessage = (e) => {
          const raw = e.data;
          try {
            const parsed = JSON.parse(String(raw));
            if (parsed && parsed.type) {
              handleDataChannelMessage(parsed);
              return;
            }
          } catch (err) {
            // not JSON, treat as chat text
          }
          setMessages((prev) => [
            ...prev,
            { from: "peer", text: String(raw), ts: Date.now() },
          ]);
        };
      };
    }

    pcRef.current = pc;
    return pc;
  }

  // watch for call param in URL
  useEffect(() => {
    if (!authChecked || !authUser || authUser.role !== "admin" || callInitiated)
      return;
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

    const urlParams = new URLSearchParams(window.location.search);
    const targetId = urlParams.get("call");
    if (targetId) {
      setCallInitiated(true);
      console.log("Initiating admin call to", targetId);
      send({ type: "identify", role: "admin", name: "Administrator" });
      setTimeout(() => {
        send({ type: "admin-call", targetId });
      }, 100);
    }
  }, [authChecked, authUser, callInitiated, myId]); // myId ensures ws is connected and initialized

  // handle signaling messages
  async function handleSignalMessage(data: any) {
    switch (data.type) {
      case "stats":
        setOnlineCount(data.online);
        setWaitingCount(data.waiting);
        break;
      case "init":
        setMyId(data.id);
        // Send username to signaling server for identification
        if (authUser) {
          send({ type: "set-username", username: authUser.username });
        }
        break;
      case "active-users":
        // Admin might get this if they are on this page
        break;
      case "waiting":
        setStatus("searching");
        break;
      case "paired":
        if (data.adminCall) {
          console.log(
            data.initiator
              ? "Calling user..."
              : `Admin ${data.fromName} is calling!`,
          );
        }
        setStatus("connecting");
        {
          const initiator = data.initiator;
          await startCamera();
          const pc = await createPeerConnection(initiator);
          if (initiator) {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            send({ type: "offer", sdp: pc.localDescription });
          }
        }
        break;
      case "offer":
        {
          setStatus("connecting");
          await startCamera();
          const pc2 = await createPeerConnection(false);
          await pc2.setRemoteDescription(new RTCSessionDescription(data.sdp));
          const answer = await pc2.createAnswer();
          await pc2.setLocalDescription(answer);
          send({ type: "answer", sdp: pc2.localDescription });
        }
        break;
      case "answer":
        if (pcRef.current) {
          await pcRef.current.setRemoteDescription(
            new RTCSessionDescription(data.sdp),
          );
          setStatus("connected");
        }
        break;
      case "ice-candidate":
        if (pcRef.current && data.candidate) {
          try {
            await pcRef.current.addIceCandidate(
              new RTCIceCandidate(data.candidate),
            );
          } catch (e) {
            console.warn("Error adding ice candidate:", e);
          }
        }
        break;
      case "peer-left":
        cleanupPeer();
        // Auto-rejoin after a brief delay
        setTimeout(() => {
          findPartner();
        }, 1500);
        break;
      default:
        console.log("unknown signal", data);
    }
  }

  function cleanupPeer() {
    if (pcRef.current) {
      try {
        pcRef.current.close();
      } catch (e) {}
      pcRef.current = null;
    }
    if (dataChannelRef.current) {
      try {
        dataChannelRef.current.close();
      } catch (e) {}
      dataChannelRef.current = null;
    }
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    if (localStreamRef.current) {
      try {
        const s: any = localStreamRef.current;
        if (s._fakeCleanup) {
          try {
            s._fakeCleanup();
          } catch (e) {}
        }
        for (const t of localStreamRef.current.getTracks()) {
          try {
            t.stop();
          } catch (e) {}
        }
      } catch (e) {}
      localStreamRef.current = null;
      if (localVideoRef.current) localVideoRef.current.srcObject = null;
    }
    // reset IG exchange state
    setMyIgShared(false);
    setPeerIg(null);
    setStatus("idle");
  }

  function endCall() {
    send({ type: "leave" });
    cleanupPeer();
  }

  function sendChatMessage(text: string) {
    if (!text) return;
    const dc = dataChannelRef.current;
    if (!dc || dc.readyState !== "open") {
      alert("Chat not connected yet.");
      return;
    }
    try {
      dc.send(text);
      setMessages((prev) => [...prev, { from: "me", text, ts: Date.now() }]);
      setChatInput("");
    } catch (e) {
      console.error("failed to send chat message", e);
    }
  }

  function shareIg() {
    const dc = dataChannelRef.current;
    if (!dc || dc.readyState !== "open") {
      alert("Chat not connected yet.");
      return;
    }
    const ig = myIg.trim();
    if (!ig) {
      alert("Enter your Instagram handle before approving.");
      return;
    }
    try {
      dc.send(JSON.stringify({ type: "ig-approved", ig }));
      setMyIgShared(true);
    } catch (e) {
      console.error("failed to send ig-approved", e);
    }
  }

  async function nextPartner() {
    endCall();
    // Small delay to ensure the signaling server processes the leave
    setTimeout(() => {
      findPartner();
    }, 100);
  }

  // ----- UI Helpers -----
  const statusMessage =
    status === "searching" && waitingCount <= 1
      ? "Waiting for someone to join..."
      : {
          idle: "Ready to chat",
          searching: "Looking for a partner...",
          connecting: "Establishing connection...",
          connected: "Connected",
        }[status];

  const isConnected = status === "connected";
  const showRemotePlaceholder =
    status !== "connected" || !remoteVideoRef.current?.srcObject;

  if (!authChecked) {
    return (
      <div className="min-h-screen gradient-bg flex items-center justify-center p-4">
        <div className="text-center text-white">
          <div className="flex justify-center mb-4">
            <div className="h-12 w-12 rounded-full bg-gradient-to-tr from-blue-500 to-purple-600 flex items-center justify-center shadow-lg animate-pulse">
              <div className="h-6 w-6 bg-white/20 rounded-full animate-ping"></div>
            </div>
          </div>
          <div className="text-lg font-medium">Checking authentication…</div>
          <div className="text-sm text-gray-400 mt-2">
            If you don't have an account, you'll be redirected to sign up.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen gradient-bg flex items-center justify-center p-4">
      <div className="w-full max-w-6xl">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-center justify-between mb-6 gap-4 px-2">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-gradient-to-tr from-blue-500 to-purple-600 shadow-lg flex items-center justify-center">
              <CameraIcon className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-white tracking-tight bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                OmeTV Clone
              </h1>
              <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">
                Real-Time Video Chat
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 glass px-3 py-1.5 rounded-lg border border-white/5">
              <div
                className={`h-2 w-2 rounded-full ${
                  wsStatus === "connected"
                    ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]"
                    : wsStatus === "connecting"
                      ? "bg-yellow-500 animate-pulse"
                      : "bg-red-500"
                }`}
              />
              <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">
                Server: {wsStatus}
              </span>
            </div>
            <div className="flex items-center gap-2 glass px-3 py-1.5 rounded-lg border border-white/5">
              <div className="h-2 w-2 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.6)]" />
              <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">
                Online: {onlineCount}
              </span>
            </div>
            <div className="flex items-center gap-2 glass px-3 py-1.5 rounded-lg border border-white/5">
              <span className="text-[10px] text-gray-400 font-bold uppercase">
                Country
              </span>
              <select
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                className="bg-transparent text-white text-xs font-medium focus:outline-none cursor-pointer"
              >
                <option className="bg-gray-900" value="United States">
                  🇺🇸 USA
                </option>
                <option className="bg-gray-900" value="Global">
                  🌐 Global
                </option>
                <option className="bg-gray-900" value="Europe">
                  🇪🇺 Europe
                </option>
                <option className="bg-gray-900" value="Asia">
                  🌏 Asia
                </option>
              </select>
            </div>
            {myId && (
              <div className="glass px-4 py-2 rounded-full border border-white/5">
                <span className="text-gray-400 text-sm">ID: </span>
                <span className="text-white font-mono text-sm bg-blue-500/10 px-2 py-1 rounded">
                  {myId}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex flex-col lg:flex-row gap-8">
          {/* Left Column: Videos and Main Controls */}
          <div className="flex-1">
            {/* Video Area - OmeTV Style Side-by-Side */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6 h-[350px] md:h-[450px]">
              {/* My Video */}
              <div className="relative glass rounded-2xl overflow-hidden shadow-2xl bg-gray-900 border-2 border-blue-500/30">
                {isLive && (
                  <div className="absolute top-4 right-4 flex items-center gap-2 bg-red-600 px-2 py-1 rounded-md shadow-lg animate-pulse z-10">
                    <div className="h-2 w-2 bg-white rounded-full"></div>
                    <span className="text-[10px] text-white font-bold tracking-wider">
                      LIVE
                    </span>
                  </div>
                )}
                <video
                  ref={localVideoRef}
                  autoPlay
                  muted
                  playsInline
                  className="w-full h-full object-cover scale-x-[-1] transition-all duration-500"
                  style={{
                    filter: filters.find((f) => f.id === activeFilter)?.style,
                  }}
                />
                {isFakeStream && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900/90 backdrop-blur-sm z-20 p-6 text-center">
                    <div className="h-12 w-12 bg-yellow-500/20 rounded-full flex items-center justify-center mb-3">
                      <CameraIcon className="h-6 w-6 text-yellow-500" />
                    </div>
                    <p className="text-white font-bold text-sm mb-1">
                      No Camera Detected
                    </p>
                    <p className="text-gray-400 text-[10px] max-w-[180px]">
                      We're using a virtual stream so you can still test the app
                      features.
                    </p>
                  </div>
                )}
                {!localStreamRef.current && !isFakeStream && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900/80 backdrop-blur-sm">
                    <CameraIcon className="h-12 w-12 text-gray-600 mb-2" />
                    <p className="text-gray-400 font-medium text-sm">
                      Camera is off
                    </p>
                  </div>
                )}
                <div className="absolute bottom-4 left-4 glass px-3 py-1 rounded-lg">
                  <span className="text-white text-xs font-semibold flex items-center gap-2">
                    <div className="h-2 w-2 bg-blue-500 rounded-full"></div>
                    You{" "}
                    {isAdmin && (
                      <span className="text-[9px] bg-blue-500 text-white px-1 rounded ml-1">
                        ADMIN
                      </span>
                    )}
                  </span>
                </div>

                {/* Snap Filters for Admin */}
                {isAdmin && (
                  <div className="absolute top-4 left-4 right-16 flex gap-1 overflow-x-auto pb-2 scrollbar-hide z-20">
                    {filters.map((f) => (
                      <button
                        key={f.id}
                        onClick={() => setActiveFilter(f.id)}
                        className={`px-3 py-1 rounded-full text-[9px] font-bold uppercase tracking-wider transition-all backdrop-blur-md border ${
                          activeFilter === f.id
                            ? "bg-blue-600 text-white border-blue-400"
                            : "bg-black/40 text-gray-400 border-white/10 hover:bg-black/60"
                        }`}
                      >
                        {f.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Remote Video */}
              <div className="relative glass rounded-2xl overflow-hidden shadow-2xl bg-gray-900 border-2 border-purple-500/30">
                <video
                  ref={remoteVideoRef}
                  autoPlay
                  playsInline
                  className="w-full h-full object-cover"
                />
                {showRemotePlaceholder && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900/80 backdrop-blur-md">
                    <div className="relative">
                      <div className="h-16 w-16 rounded-full bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center shadow-2xl">
                        {status === "searching" ? (
                          <div className="relative">
                            <SearchIcon className="h-8 w-8 text-white animate-pulse" />
                            <div className="absolute -inset-3 bg-blue-500/20 rounded-full animate-ping"></div>
                          </div>
                        ) : status === "connecting" ? (
                          <ConnectionIcon className="h-8 w-8 text-yellow-400 animate-spin" />
                        ) : (
                          <CameraIcon className="h-8 w-8 text-gray-500" />
                        )}
                      </div>
                    </div>
                    <p className="text-white text-base font-semibold mt-4 mb-1">
                      {statusMessage}
                    </p>
                    <p className="text-gray-500 text-xs max-w-[150px] text-center px-4">
                      {status === "searching" && "Looking for a partner..."}
                      {status === "connecting" && "Establishing link..."}
                      {status === "idle" && "Click Start to meet someone"}
                    </p>
                  </div>
                )}
                <div className="absolute bottom-4 left-4 glass px-3 py-1 rounded-lg">
                  <span className="text-white text-xs font-semibold flex items-center gap-2">
                    <div className="h-2 w-2 bg-purple-500 rounded-full animate-pulse"></div>
                    {status === "connected" ? "Partner" : "Waiting..."}
                  </span>
                </div>
              </div>
            </div>

            {/* Main Controls */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              {status === "idle" ? (
                <button
                  onClick={findPartner}
                  className="group relative px-12 py-4 rounded-xl font-bold text-lg flex items-center justify-center w-full sm:w-auto gap-4 transition-all duration-300 transform hover:scale-[1.02] bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-xl shadow-blue-500/20"
                >
                  <SearchIcon className="h-5 w-5" />
                  <div className="flex flex-col items-start">
                    <span className="leading-tight">START CHAT</span>
                    <span className="text-[10px] opacity-60 font-normal">
                      Press ESC
                    </span>
                  </div>
                </button>
              ) : (
                <>
                  <button
                    onClick={nextPartner}
                    className="group relative px-12 py-4 rounded-xl font-bold text-lg flex items-center justify-center w-full sm:w-auto gap-4 transition-all duration-300 transform hover:scale-[1.02] bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-xl shadow-blue-500/20"
                  >
                    <NextIcon className="h-5 w-5" />
                    <div className="flex flex-col items-start">
                      <span className="leading-tight">NEXT PARTNER</span>
                      <span className="text-[10px] opacity-60 font-normal">
                        Press ESC
                      </span>
                    </div>
                  </button>

                  <button
                    onClick={endCall}
                    className="group relative px-8 py-4 rounded-xl font-bold text-lg flex items-center justify-center w-full sm:w-auto gap-4 transition-all duration-300 transform hover:scale-[1.02] bg-gray-800 text-white border border-red-500/30 hover:bg-red-950/20"
                  >
                    <EndIcon className="h-5 w-5 text-red-500" />
                    <span>STOP</span>
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Right Column: Chat and IG Exchange */}
          <div className="w-full lg:w-96 flex flex-col gap-6">
            {/* Chat panel */}
            <div className="card p-0 overflow-hidden flex flex-col h-[400px]">
              <div className="bg-gradient-to-r from-blue-600 to-purple-600 px-4 py-3 flex items-center justify-between">
                <h3 className="text-white text-sm font-semibold flex items-center gap-2">
                  <div className="h-2 w-2 bg-green-400 rounded-full animate-pulse"></div>
                  Live Chat
                </h3>
                {isConnected && (
                  <span className="text-[10px] text-blue-100 bg-white/10 px-2 py-0.5 rounded-full">
                    Connected
                  </span>
                )}
              </div>
              <div
                className="flex-1 overflow-y-auto p-4 space-y-3 text-sm bg-gray-900/50"
                id="chat-messages"
              >
                {messages.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-gray-500 text-center p-4">
                    <div className="h-10 w-10 bg-gray-800 rounded-full flex items-center justify-center mb-2">
                      <span className="text-lg">💬</span>
                    </div>
                    <p className="text-xs">No messages yet</p>
                    <p className="text-[10px] mt-1 opacity-50">
                      Messages appear here once you're connected
                    </p>
                  </div>
                ) : (
                  messages.map((m, i) => (
                    <div
                      key={i}
                      className={`flex ${m.from === "me" ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`${m.from === "me" ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-200 border border-gray-700"} px-3 py-1.5 rounded-xl max-w-[90%] shadow-sm`}
                      >
                        <div className="text-[13px] leading-relaxed">
                          {m.text}
                        </div>
                        <div
                          className={`text-[9px] mt-1 opacity-60 text-right`}
                        >
                          {new Date(m.ts).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </div>
                      </div>
                    </div>
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>
              <div className="p-3 bg-gray-800/80 border-t border-gray-700">
                <div className="flex gap-2">
                  <input
                    ref={chatInputRef}
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        sendChatMessage(chatInput);
                      }
                    }}
                    className="flex-1 input bg-gray-900 border-gray-700 text-xs h-9"
                    placeholder={
                      isConnected
                        ? "Type a message... (Enter to send)"
                        : "Waiting for partner..."
                    }
                    disabled={!isConnected}
                  />
                  <button
                    onClick={() => sendChatMessage(chatInput)}
                    disabled={!isConnected || !chatInput.trim()}
                    className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-medium disabled:opacity-50 transition-colors"
                  >
                    Send
                  </button>
                </div>
              </div>
            </div>

            {/* IG exchange panel */}
            <div className="card p-0 overflow-hidden">
              <div className="bg-gradient-to-r from-green-600/80 to-emerald-600/80 px-4 py-2">
                <h3 className="text-white text-[12px] font-semibold flex items-center gap-2">
                  📸 Instagram Swap
                </h3>
              </div>
              <div className="p-3 bg-gray-900/50">
                <div className="flex gap-2">
                  <input
                    value={myIg}
                    onChange={(e) => setMyIg(e.target.value)}
                    placeholder="@username"
                    className="flex-1 input bg-gray-800 border-gray-700 text-[12px] h-8"
                    disabled={!isConnected || myIgShared}
                  />
                  <button
                    onClick={shareIg}
                    disabled={!isConnected || myIgShared}
                    className={`px-3 py-1 rounded-lg text-[11px] font-bold transition-all ${
                      myIgShared
                        ? "bg-gray-700 text-gray-400"
                        : "bg-green-600 text-white hover:bg-green-500"
                    }`}
                  >
                    {myIgShared ? "SHARED" : "SHARE"}
                  </button>
                </div>
                {peerIg && (
                  <div className="mt-2 p-2 bg-green-500/10 border border-green-500/20 rounded-lg">
                    <p className="text-[10px] text-green-400 font-medium">
                      Partner's IG:
                    </p>
                    <p className="text-sm text-white font-mono mt-0.5">
                      {peerIg}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Status indicator */}
        <div className="text-center mt-6">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass">
            <div
              className={`h-2 w-2 rounded-full ${
                status === "connected"
                  ? "bg-green-400 animate-pulse"
                  : status === "searching"
                    ? "bg-blue-400 animate-pulse"
                    : status === "connecting"
                      ? "bg-yellow-400 animate-spin"
                      : "bg-gray-400"
              }`}
            ></div>
            <span className="text-sm font-medium text-gray-300">
              {statusMessage}{" "}
              {myId && <span className="text-gray-500">• ID: {myId}</span>}
            </span>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 text-center">
          <p className="text-xs text-gray-500">
            Secure video chat platform • Built with WebRTC technology
          </p>
          <p className="text-xs text-gray-600 mt-1">
            For demonstration purposes only
          </p>
        </div>
      </div>
    </div>
  );
}

// Simple SVG Icons (inline to avoid extra dependencies)
const CameraIcon = ({ className }: { className?: string }) => (
  <svg
    className={className}
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth={2}
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
    />
  </svg>
);

const SearchIcon = ({ className }: { className?: string }) => (
  <svg
    className={className}
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth={2}
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
    />
  </svg>
);

const EndIcon = ({ className }: { className?: string }) => (
  <svg
    className={className}
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth={2}
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-3.28a1 1 0 00-.684-.948l-4.493-1.498a1 1 0 00-1.21.502l-1.13 2.257a11.042 11.042 0 01-5.516-5.517l2.257-1.128a1 1 0 00.502-1.21L9.228 3.683A1 1 0 008.28 3H5z"
    />
  </svg>
);

const ConnectionIcon = ({ className }: { className?: string }) => (
  <svg
    className={className}
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth={2}
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-4.08-3.8a8 8 0 0110.14 0M6.343 9.343a8 8 0 0111.314 0"
    />
  </svg>
);

const NextIcon = ({ className }: { className?: string }) => (
  <svg
    className={className}
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth={2}
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M13 5l7 7-7 7M5 5l7 7-7 7"
    />
  </svg>
);
