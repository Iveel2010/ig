"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";

export default function Home() {
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const iceQueueRef = useRef<RTCIceCandidateInit[]>([]);
  const [messages, setMessages] = useState<
    Array<{ from: "me" | "peer"; text: string; ts: number }>
  >([]);
  const [chatInput, setChatInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const router = useRouter();

  const [authChecked, setAuthChecked] = useState(false);
  const [authUser, setAuthUser] = useState<any | null>(null);
  const [isFakeStream, setIsFakeStream] = useState(false);
  const [onlineCount, setOnlineCount] = useState(0);
  const [status, setStatus] = useState<
    "idle" | "searching" | "connecting" | "connected"
  >("idle");
  const [myId, setMyId] = useState<string | null>(null);
  const [wsStatus, setWsStatus] = useState<
    "disconnected" | "connecting" | "connected"
  >("disconnected");
  const [recentPartners, setRecentPartners] = useState<
    Array<{
      id: string;
      imageUrl: string;
      timestamp: number;
    }>
  >([]);
  const [showGallery, setShowGallery] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (status === "idle") findPartner();
        else nextPartner();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [status]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const SIGNALING_URL =
    typeof window !== "undefined"
      ? process.env.NEXT_PUBLIC_SIGNALING_SERVER_URL || "ws://localhost:8082"
      : "";

  function createFakeMediaStream() {
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 480;
    const ctx = canvas.getContext("2d");
    let frame = 0;
    const iv = window.setInterval(() => {
      if (!ctx) return;
      const hue = frame % 360;
      ctx.fillStyle = `hsl(${hue}, 30%, 10%)`;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = "rgba(255,255,255,0.05)";
      ctx.lineWidth = 1;
      for (let i = 0; i < canvas.width; i += 40) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, canvas.height);
        ctx.stroke();
      }
      for (let i = 0; i < canvas.height; i += 40) {
        ctx.beginPath();
        ctx.moveTo(0, i);
        ctx.lineTo(canvas.width, i);
        ctx.stroke();
      }
      const x = canvas.width / 2 + Math.cos(frame / 20) * 100;
      const y = canvas.height / 2 + Math.sin(frame / 20) * 100;
      ctx.fillStyle = `hsl(${(hue + 180) % 360}, 70%, 50%)`;
      ctx.beginPath();
      ctx.arc(x, y, 40, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 32px sans-serif";
      ctx.fillText("VIRTUAL CAMERA", 40, 60);
      ctx.font = "20px monospace";
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      ctx.fillText(`TIME: ${new Date().toLocaleTimeString()}`, 40, 100);
      ctx.fillText(`FRAME: ${frame++}`, 40, 130);
      ctx.fillText(`STATUS: HARDCODED_ACTIVE`, 40, 160);
      ctx.fillStyle = "rgba(59, 130, 246, 0.8)";
      ctx.fillRect(40, 180, 140, 30);
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 14px sans-serif";
      ctx.fillText(authUser?.username || "YOU", 55, 200);
    }, 1000 / 30);

    const videoStream = (canvas as any).captureStream(30);
    const AudioCtx =
      (window as any).AudioContext || (window as any).webkitAudioContext;
    const ac = new AudioCtx();
    const dst = ac.createMediaStreamDestination();
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    gain.gain.value = 0;
    osc.connect(gain);
    gain.connect(dst);
    try {
      osc.start();
    } catch (e) {}

    const combined = new MediaStream([
      ...videoStream.getVideoTracks(),
      ...dst.stream.getAudioTracks(),
    ]);
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
    if (typeof window === "undefined" || !authChecked) return;

    let reconnectTimer: NodeJS.Timeout;

    function connect() {
      console.log("Connecting to WebSocket:", SIGNALING_URL);
      setWsStatus("connecting");
      const ws = new WebSocket(SIGNALING_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log("WebSocket connected");
        setWsStatus("connected");
        ws.send(JSON.stringify({ type: "get-stats" }));
      };

      ws.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data);
          console.log("WebSocket message received:", data);
          handleSignalMessage(data);
        } catch (e) {
          console.error("Error parsing WebSocket message:", e);
        }
      };

      ws.onerror = (e) => {
        console.error("WebSocket error:", e);
      };

      ws.onclose = () => {
        console.log("WebSocket closed, reconnecting in 3 seconds...");
        setWsStatus("disconnected");
        reconnectTimer = setTimeout(connect, 3000);
      };
    }

    connect();

    return () => {
      clearTimeout(reconnectTimer);
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [authChecked]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch("/api/me", { cache: "no-store" });
        if (!mounted) return;
        if (!res.ok) {
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

  async function startCamera() {
    if (localStreamRef.current) return;
    setIsFakeStream(true);
    const fake = createFakeMediaStream();
    localStreamRef.current = fake;
    if (localVideoRef.current) localVideoRef.current.srcObject = fake;
  }

  function send(obj: any) {
    console.log(
      "Sending WebSocket message:",
      obj,
      "WebSocket state:",
      wsRef.current?.readyState,
    );
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(obj));
    } else {
      console.error("WebSocket not ready, state:", wsRef.current?.readyState);
    }
  }

  function capturePartnerImage() {
    if (!remoteVideoRef.current) return;

    const canvas = document.createElement("canvas");
    canvas.width = remoteVideoRef.current.videoWidth;
    canvas.height = remoteVideoRef.current.videoHeight;
    const ctx = canvas.getContext("2d");

    if (ctx) {
      ctx.drawImage(remoteVideoRef.current, 0, 0);
      const imageUrl = canvas.toDataURL("image/jpeg", 0.8);

      setRecentPartners((prev) => {
        const newPartner = {
          id: `partner_${Date.now()}`,
          imageUrl,
          timestamp: Date.now(),
        };

        // Keep only the 10 most recent partners
        const updated = [newPartner, ...prev].slice(0, 10);
        return updated;
      });
    }
  }

  function reportUser(partnerId: string) {
    console.log(`Reporting user: ${partnerId}`);
    alert("User reported successfully");
    setRecentPartners((prev) => prev.filter((p) => p.id !== partnerId));
  }

  async function findPartner() {
    console.log("findPartner called");
    await startCamera();
    console.log("Camera started, sending join request");
    send({ type: "join" });
    setStatus("searching");
  }

  async function createPeerConnection(initiator?: boolean) {
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });
    pc.onicecandidate = (e) => {
      if (e.candidate) send({ type: "ice-candidate", candidate: e.candidate });
    };
    pc.ontrack = (e) => {
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = e.streams[0];
        setStatus("connected");
        setTimeout(() => capturePartnerImage(), 2000);
      }
    };
    pc.onconnectionstatechange = () => {
      console.log(`[PC] state: ${pc.connectionState}`);
      if (pc.connectionState === "connected") setStatus("connected");
      if (
        pc.connectionState === "failed" ||
        pc.connectionState === "disconnected"
      ) {
        cleanupPeer();
        setTimeout(() => findPartner(), 1000);
      }
    };
    pc.oniceconnectionstatechange = () => {
      console.log(`[ICE] state: ${pc.iceConnectionState}`);
      if (
        pc.iceConnectionState === "connected" ||
        pc.iceConnectionState === "completed"
      ) {
        setStatus("connected");
      }
    };
    if (localStreamRef.current) {
      for (const track of localStreamRef.current.getTracks()) {
        pc.addTrack(track, localStreamRef.current);
      }
    }

    if (initiator) {
      const dc = pc.createDataChannel("chat");
      dataChannelRef.current = dc;
      dc.onmessage = (e) => {
        setMessages((prev) => [
          ...prev,
          { from: "peer", text: String(e.data), ts: Date.now() },
        ]);
      };
    } else {
      pc.ondatachannel = (ev) => {
        const dc = ev.channel;
        dataChannelRef.current = dc;
        dc.onmessage = (e) => {
          setMessages((prev) => [
            ...prev,
            { from: "peer", text: String(e.data), ts: Date.now() },
          ]);
        };
      };
    }
    pcRef.current = pc;
    return pc;
  }

  async function handleSignalMessage(data: any) {
    console.log(`[WS] msg: ${data.type}`);
    switch (data.type) {
      case "stats":
        setOnlineCount(data.online);
        break;
      case "init":
        setMyId(data.id);
        if (authUser)
          send({ type: "set-username", username: authUser.username });
        break;
      case "waiting":
        setStatus("searching");
        break;
      case "paired":
        setStatus("connecting");
        {
          const initiator = data.initiator;
          await startCamera();
          const pc = await createPeerConnection(initiator);
          pcRef.current = pc;
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
          if (!pcRef.current) {
            await startCamera();
            pcRef.current = await createPeerConnection(false);
          }
          await pcRef.current.setRemoteDescription(
            new RTCSessionDescription(data.sdp),
          );

          while (iceQueueRef.current.length > 0) {
            const cand = iceQueueRef.current.shift();
            if (cand)
              await pcRef.current.addIceCandidate(new RTCIceCandidate(cand));
          }

          const answer = await pcRef.current.createAnswer();
          await pcRef.current.setLocalDescription(answer);
          send({ type: "answer", sdp: pcRef.current.localDescription });
        }
        break;
      case "answer":
        if (pcRef.current) {
          await pcRef.current.setRemoteDescription(
            new RTCSessionDescription(data.sdp),
          );

          while (iceQueueRef.current.length > 0) {
            const cand = iceQueueRef.current.shift();
            if (cand)
              await pcRef.current.addIceCandidate(new RTCIceCandidate(cand));
          }

          setStatus("connected");
        }
        break;
      case "ice-candidate":
        if (data.candidate) {
          if (pcRef.current && pcRef.current.remoteDescription) {
            try {
              await pcRef.current.addIceCandidate(
                new RTCIceCandidate(data.candidate),
              );
            } catch (e) {
              console.error("[ICE] error adding candidate:", e);
            }
          } else {
            iceQueueRef.current.push(data.candidate);
          }
        }
        break;
      case "peer-left":
        cleanupPeer();
        setTimeout(() => findPartner(), 500);
        break;
    }
  }

  function cleanupPeer() {
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    if (dataChannelRef.current) {
      dataChannelRef.current.close();
      dataChannelRef.current = null;
    }
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    iceQueueRef.current = [];
    setStatus("idle");
  }

  function endCall() {
    console.log("endCall called, clearing messages");
    setMessages([]);
    send({ type: "leave" });
    cleanupPeer();
  }

  function nextPartner() {
    console.log("nextPartner called");
    endCall();
    setTimeout(() => findPartner(), 100);
  }

  function sendChatMessage() {
    if (
      !chatInput.trim() ||
      !dataChannelRef.current ||
      dataChannelRef.current.readyState !== "open"
    )
      return;
    dataChannelRef.current.send(chatInput);
    setMessages((prev) => [
      ...prev,
      { from: "me", text: chatInput, ts: Date.now() },
    ]);
    setChatInput("");
  }

  if (!authChecked) return null;

  // Animation variants
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { duration: 0.4 } },
  };

  const messageVariants = {
    hidden: { opacity: 0, y: 10 },
    visible: { opacity: 1, y: 0 },
    exit: { opacity: 0, x: -20 },
  };

  const modalVariants = {
    hidden: { opacity: 0, scale: 0.95 },
    visible: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.95 },
  };

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={containerVariants}
      className="h-screen w-full bg-black flex flex-col overflow-hidden text-white font-sans relative"
    >
      {/* Animated gradient background */}
      <div className="absolute inset-0 bg-gradient-to-br from-blue-950/20 via-black to-purple-950/20 pointer-events-none" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(59,130,246,0.1),transparent_70%)] pointer-events-none" />

      {/* Top Header */}
      <header className="h-14 flex items-center justify-between px-4 sm:px-6 bg-zinc-900/30 backdrop-blur-xl border-b border-white/5 z-50">
        <div className="flex items-center gap-2 sm:gap-4">
          <motion.div
            initial={{ x: -20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="flex flex-col"
          >
            <h1 className="text-lg sm:text-xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-blue-600 italic">
              OMETV <span className="text-white not-italic">REALTIME</span>
            </h1>
          </motion.div>
          <div className="hidden sm:block h-6 w-[1px] bg-white/10"></div>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="hidden sm:flex items-center gap-2 text-xs font-bold text-zinc-400"
          >
            <div className="relative">
              <div className="h-2 w-2 rounded-full bg-green-500" />
              <div className="absolute inset-0 h-2 w-2 rounded-full bg-green-500 animate-ping opacity-75" />
            </div>
            <motion.span
              key={onlineCount}
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 500 }}
            >
              {onlineCount} ONLINE
            </motion.span>
          </motion.div>
          <div className="hidden sm:block h-6 w-[1px] bg-white/10"></div>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="hidden sm:flex items-center gap-2 text-xs font-bold"
          >
            <div
              className={`h-2 w-2 rounded-full ${wsStatus === "connected" ? "bg-green-500" : wsStatus === "connecting" ? "bg-yellow-500 animate-pulse" : "bg-red-500"}`}
            />
            <span
              className={
                wsStatus === "connected"
                  ? "text-green-400"
                  : wsStatus === "connecting"
                    ? "text-yellow-400"
                    : "text-red-400"
              }
            >
              {wsStatus}
            </span>
          </motion.div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setShowGallery(true)}
            className="relative text-[9px] sm:text-[10px] font-bold tracking-widest text-zinc-400 hover:text-white transition-colors uppercase"
          >
            Recent
            {recentPartners.length > 0 && (
              <span className="absolute -top-1 -right-2 h-4 w-4 bg-blue-600 rounded-full text-[8px] flex items-center justify-center text-white">
                {recentPartners.length}
              </span>
            )}
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={async () => {
              await fetch("/api/logout", { method: "POST" });
              router.push("/signup");
            }}
            className="text-[9px] sm:text-[10px] font-bold tracking-widest text-zinc-400 hover:text-white transition-colors uppercase"
          >
            Logout
          </motion.button>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col lg:flex-row p-3 sm:p-4 gap-3 sm:gap-4 overflow-hidden">
        {/* Videos Container */}
        <div className="flex-1 flex flex-col gap-3 sm:gap-4 lg:flex-row">
          {/* Remote Video */}
          <motion.div
            initial={{ scale: 0.98, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.4, delay: 0.1 }}
            className="flex-1 relative bg-zinc-900/50 backdrop-blur-sm rounded-3xl overflow-hidden border border-white/5 shadow-2xl group"
          >
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className="w-full h-full object-cover"
            />
            <AnimatePresence>
              {status !== "connected" && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-b from-zinc-900/80 to-black/80 backdrop-blur-md"
                >
                  <div className="relative">
                    <motion.div
                      animate={{
                        boxShadow: [
                          "0 0 0 0 rgba(59,130,246,0)",
                          "0 0 0 10px rgba(59,130,246,0.1)",
                          "0 0 0 0 rgba(59,130,246,0)",
                        ],
                      }}
                      transition={{ repeat: Infinity, duration: 2 }}
                      className="h-24 w-24 rounded-full border-2 border-white/5 flex items-center justify-center"
                    >
                      {status === "searching" ? (
                        <motion.div
                          animate={{ rotate: 360 }}
                          transition={{
                            repeat: Infinity,
                            duration: 1,
                            ease: "linear",
                          }}
                          className="h-12 w-12 border-4 border-blue-500 border-t-transparent rounded-full"
                        />
                      ) : (
                        <svg
                          className="h-12 w-12 text-zinc-700"
                          fill="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                        </svg>
                      )}
                    </motion.div>
                  </div>
                  <motion.p
                    initial={{ y: 10, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.2 }}
                    className="mt-6 text-sm font-bold tracking-widest text-zinc-400 uppercase"
                  >
                    {status === "idle"
                      ? "READY TO START"
                      : status === "searching"
                        ? "FINDING PARTNER..."
                        : "CONNECTING..."}
                  </motion.p>
                </motion.div>
              )}
            </AnimatePresence>
            <motion.div
              initial={{ x: -20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="absolute top-6 left-6 flex items-center gap-2"
            >
              <div className="bg-blue-600/20 backdrop-blur-xl border border-blue-500/30 px-3 py-1 rounded-full">
                <span className="text-[10px] font-black tracking-widest text-blue-400">
                  PARTNER
                </span>
              </div>
            </motion.div>
          </motion.div>

          {/* Local Video */}
          <motion.div
            initial={{ scale: 0.98, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.4, delay: 0.2 }}
            className="flex-1 relative bg-zinc-900/50 backdrop-blur-sm rounded-3xl overflow-hidden border border-white/5 shadow-2xl group"
          >
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
            />
            <motion.div
              initial={{ x: -20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ delay: 0.4 }}
              className="absolute top-6 left-6 flex items-center gap-2"
            >
              <div className="bg-white/10 backdrop-blur-xl border border-white/10 px-3 py-1 rounded-full">
                <span className="text-[10px] font-black tracking-widest text-white/70">
                  YOU
                </span>
              </div>
            </motion.div>
            <AnimatePresence>
              {isFakeStream && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 20 }}
                  className="absolute bottom-6 right-6"
                >
                  <div className="bg-yellow-500/20 backdrop-blur-xl border border-yellow-500/30 px-3 py-1 rounded-full">
                    <span className="text-[10px] font-black tracking-widest text-yellow-400 uppercase flex items-center gap-1">
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-yellow-500"></span>
                      </span>
                      Virtual Active
                    </span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </div>

        {/* Chat & Controls Sidebar */}
        <motion.div
          initial={{ x: 20, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.3 }}
          className="w-full lg:w-96 flex flex-col gap-3 sm:gap-4"
        >
          {/* Chat Box */}
          <div className="flex-1 bg-zinc-900/30 backdrop-blur-xl rounded-2xl sm:rounded-3xl border border-white/5 overflow-hidden flex flex-col shadow-2xl">
            <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-white/5 bg-zinc-900/50">
              <h2 className="text-[10px] sm:text-xs font-black tracking-widest text-zinc-300 uppercase flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span
                    className={`animate-ping absolute inline-flex h-full w-full rounded-full ${status === "connected" ? "bg-green-400" : "bg-zinc-500"} opacity-75`}
                  ></span>
                  <span
                    className={`relative inline-flex rounded-full h-2 w-2 ${status === "connected" ? "bg-green-500" : "bg-zinc-500"}`}
                  ></span>
                </span>
                Chat Messages
              </h2>
            </div>
            <div className="flex-1 overflow-y-auto p-3 sm:p-6 space-y-3 sm:space-y-4 scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent">
              <AnimatePresence initial={false}>
                {messages.length === 0 ? (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 0.3 }}
                    className="h-full flex flex-col items-center justify-center"
                  >
                    <svg
                      className="h-12 w-12 mb-2"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                      />
                    </svg>
                    <p className="text-[10px] font-bold tracking-widest uppercase">
                      No messages yet
                    </p>
                  </motion.div>
                ) : (
                  messages.map((m, i) => (
                    <motion.div
                      key={i}
                      variants={messageVariants}
                      initial="hidden"
                      animate="visible"
                      exit="exit"
                      layout
                      transition={{ duration: 0.2 }}
                      className={`flex ${m.from === "me" ? "justify-end" : "justify-start"}`}
                    >
                      <motion.div
                        whileHover={{ scale: 1.02 }}
                        className={`max-w-[85%] px-4 py-2.5 rounded-2xl text-sm ${m.from === "me" ? "bg-gradient-to-r from-blue-600 to-blue-500 text-white rounded-br-none shadow-lg shadow-blue-500/20" : "bg-zinc-800/80 backdrop-blur-sm text-zinc-100 rounded-bl-none border border-white/5"}`}
                      >
                        {m.text}
                      </motion.div>
                    </motion.div>
                  ))
                )}
              </AnimatePresence>
              <div ref={messagesEndRef} />
            </div>
            <div className="p-3 sm:p-4 bg-zinc-900/50 border-t border-white/5">
              <div className="flex gap-2">
                <motion.input
                  whileFocus={{
                    scale: 1.01,
                    borderColor: "rgba(59,130,246,0.5)",
                  }}
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && sendChatMessage()}
                  placeholder={
                    status === "connected"
                      ? "Type a message..."
                      : "Connect to chat"
                  }
                  disabled={status !== "connected"}
                  className="flex-1 bg-black/50 backdrop-blur-sm border border-white/5 rounded-xl sm:rounded-2xl px-4 sm:px-5 py-2.5 sm:py-3 text-xs sm:text-sm focus:outline-none focus:border-blue-500/50 transition-all disabled:opacity-50"
                />
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={sendChatMessage}
                  disabled={status !== "connected" || !chatInput.trim()}
                  className="h-10 w-10 sm:h-11 sm:w-11 bg-gradient-to-r from-blue-600 to-blue-500 rounded-xl sm:rounded-2xl flex items-center justify-center transition-all disabled:opacity-50 shadow-lg shadow-blue-500/20"
                >
                  <svg
                    className="h-4 w-4 sm:h-5 sm:w-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                    />
                  </svg>
                </motion.button>
              </div>
            </div>
          </div>

          {/* Controls */}
          <div className="flex gap-2 sm:gap-3">
            {status === "idle" ? (
              <motion.button
                whileHover={{
                  scale: 1.02,
                  boxShadow: "0 0 20px rgba(59,130,246,0.5)",
                }}
                whileTap={{ scale: 0.98 }}
                onClick={findPartner}
                disabled={wsStatus !== "connected"}
                className={`flex-1 py-4 sm:py-6 rounded-2xl sm:rounded-3xl font-black text-lg sm:text-xl tracking-tighter transition-all shadow-xl ${wsStatus === "connected" ? "bg-blue-600 hover:bg-blue-500 shadow-blue-500/20" : "bg-zinc-700 text-zinc-400 cursor-not-allowed"}`}
              >
                {wsStatus === "connected" ? "START" : "CONNECTING..."}
              </motion.button>
            ) : (
              <>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={nextPartner}
                  className="flex-[2] bg-white text-black hover:bg-zinc-200 py-4 sm:py-6 rounded-2xl sm:rounded-3xl font-black text-lg sm:text-xl tracking-tighter transition-all shadow-xl"
                >
                  NEXT
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={endCall}
                  className="flex-1 bg-zinc-800/80 backdrop-blur-sm hover:bg-zinc-700 py-4 sm:py-6 rounded-2xl sm:rounded-3xl font-black text-lg sm:text-xl tracking-tighter transition-all border border-white/5"
                >
                  STOP
                </motion.button>
              </>
            )}
          </div>
        </motion.div>
      </div>

      {/* Keyboard Hint */}
      <footer className="hidden sm:flex h-10 bg-black/30 backdrop-blur-sm border-t border-white/5 items-center justify-center gap-6">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 0.5, y: 0 }}
          transition={{ delay: 0.5 }}
          className="flex items-center gap-2"
        >
          <span className="bg-zinc-800 px-2 py-0.5 rounded text-[10px] font-bold">
            ESC
          </span>
          <span className="text-[10px] font-bold tracking-widest uppercase">
            Next Partner
          </span>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 0.5, y: 0 }}
          transition={{ delay: 0.6 }}
          className="flex items-center gap-2"
        >
          <span className="bg-zinc-800 px-2 py-0.5 rounded text-[10px] font-bold">
            ENTER
          </span>
          <span className="text-[10px] font-bold tracking-widest uppercase">
            Send Message
          </span>
        </motion.div>
      </footer>

      {/* Gallery Modal */}
      <AnimatePresence>
        {showGallery && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-3 sm:p-4"
            onClick={() => setShowGallery(false)}
          >
            <motion.div
              variants={modalVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="bg-zinc-900/90 backdrop-blur-xl rounded-2xl sm:rounded-3xl border border-white/10 max-w-4xl w-full max-h-[85vh] sm:max-h-[80vh] overflow-hidden shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-white/10 bg-zinc-900/80 flex items-center justify-between">
                <h2 className="text-base sm:text-lg font-black tracking-tighter text-white">
                  Recent Partners ({recentPartners.length}/10)
                </h2>
                <motion.button
                  whileHover={{ scale: 1.1, rotate: 90 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={() => setShowGallery(false)}
                  className="text-zinc-400 hover:text-white transition-colors"
                >
                  <svg
                    className="h-5 w-5 sm:h-6 sm:w-6"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </motion.button>
              </div>
              <div className="p-3 sm:p-6 overflow-y-auto max-h-[60vh] sm:max-h-[60vh] scrollbar-thin scrollbar-thumb-zinc-700">
                {recentPartners.length === 0 ? (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-center py-12 text-zinc-500"
                  >
                    <p className="text-sm font-bold tracking-widest uppercase">
                      No recent partners yet
                    </p>
                  </motion.div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
                    <AnimatePresence>
                      {recentPartners.map((partner, index) => (
                        <motion.div
                          key={partner.id}
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.8 }}
                          transition={{ delay: index * 0.05 }}
                          className="relative group"
                        >
                          <img
                            src={partner.imageUrl}
                            alt="Recent partner"
                            className="w-full aspect-square object-cover rounded-2xl border border-white/5"
                          />
                          <motion.div
                            initial={{ opacity: 0 }}
                            whileHover={{ opacity: 1 }}
                            className="absolute inset-0 bg-black/60 backdrop-blur-sm rounded-2xl flex items-center justify-center gap-2"
                          >
                            <motion.button
                              whileHover={{ scale: 1.1 }}
                              whileTap={{ scale: 0.9 }}
                              onClick={() => reportUser(partner.id)}
                              className="bg-red-600 hover:bg-red-500 text-white px-3 py-1 rounded-full text-xs font-bold transition-colors"
                            >
                              Report
                            </motion.button>
                          </motion.div>
                          <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: 0.2 }}
                            className="mt-2 text-xs text-zinc-400 text-center"
                          >
                            {new Date(partner.timestamp).toLocaleTimeString()}
                          </motion.div>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
