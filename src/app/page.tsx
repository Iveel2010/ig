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

  // Instagram exchange state
  const [myIg, setMyIg] = useState("");
  const [myIgShared, setMyIgShared] = useState(false);
  const [peerIg, setPeerIg] = useState<string | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);
  const [status, setStatus] = useState<
    "idle" | "searching" | "connecting" | "connected"
  >("idle");
  const [myId, setMyId] = useState<string | null>(null);

  const SIGNALING_URL =
    typeof window !== "undefined"
      ? process.env.NEXT_PUBLIC_SIGNALING_SERVER_URL || "ws://localhost:8080"
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
    const ws = new WebSocket(SIGNALING_URL);
    wsRef.current = ws;
    ws.onopen = () => console.log("connected to signaling server");
    ws.onmessage = (ev) => {
      let data: any;
      try {
        data = JSON.parse(ev.data);
      } catch (e) {
        return;
      }
      handleSignalMessage(data);
    };
    ws.onclose = () => console.log("signaling closed");
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

  async function startCamera() {
    if (localStreamRef.current) return;
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      localStreamRef.current = s;
      if (localVideoRef.current) localVideoRef.current.srcObject = s;
    } catch (err) {
      console.error("getUserMedia error", err);
      // Fallback to a fake media stream so users without camera/mic can still test
      console.warn("Falling back to fake media stream for testing");
      const fake = createFakeMediaStream();
      localStreamRef.current = fake;
      if (localVideoRef.current) localVideoRef.current.srcObject = fake;
    }
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

  async function handleSignalMessage(data: any) {
    switch (data.type) {
      case "init":
        setMyId(data.id);
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
        alert("Peer disconnected.");
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

  // ----- UI Helpers -----
  const statusMessage = {
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
        <div className="flex items-center justify-between mb-6 px-2">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-gradient-to-tr from-blue-500 to-purple-600 shadow-lg flex items-center justify-center">
              <CameraIcon className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-white tracking-tight bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                VideoChat
              </h1>
              <p className="text-xs text-gray-400">
                Connect with people worldwide
              </p>
            </div>
          </div>
          {myId && (
            <div className="glass px-4 py-2 rounded-full">
              <span className="text-gray-400 text-sm">ID: </span>
              <span className="text-white font-mono text-sm bg-blue-500/10 px-2 py-1 rounded">
                {myId}
              </span>
            </div>
          )}
        </div>

        {/* Video Area */}
        <div className="relative glass rounded-2xl overflow-hidden shadow-2xl aspect-video">
          {/* Remote Video (main) */}
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className="w-full h-full object-cover"
          />

          {/* Remote Placeholder / Status Overlay */}
          {showRemotePlaceholder && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-gray-900/80 to-black/80 backdrop-blur-sm">
              <div className="text-center">
                <div className="relative inline-block mb-6">
                  <div className="h-24 w-24 rounded-full bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center shadow-2xl">
                    {status === "searching" ? (
                      <div className="relative">
                        <SearchIcon className="h-10 w-10 text-white animate-pulse" />
                        <div className="absolute -inset-4 bg-blue-500/20 rounded-full animate-ping"></div>
                      </div>
                    ) : status === "connecting" ? (
                      <div className="relative">
                        <ConnectionIcon className="h-10 w-10 text-yellow-400 animate-spin" />
                        <div className="absolute -inset-4 bg-yellow-500/20 rounded-full animate-pulse"></div>
                      </div>
                    ) : (
                      <CameraIcon className="h-10 w-10 text-gray-400" />
                    )}
                  </div>
                  {status === "searching" && (
                    <div className="absolute -top-2 -right-2">
                      <div className="flex space-x-1">
                        <span className="inline-block w-3 h-3 bg-blue-400 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                        <span className="inline-block w-3 h-3 bg-blue-400 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                        <span className="inline-block w-3 h-3 bg-blue-400 rounded-full animate-bounce"></span>
                      </div>
                    </div>
                  )}
                </div>
                <p className="text-white text-xl font-semibold mb-2">
                  {statusMessage}
                </p>
                <p className="text-gray-400 text-sm">
                  {status === "searching" &&
                    "Finding someone amazing to connect with..."}
                  {status === "connecting" &&
                    "Establishing secure connection..."}
                  {status === "idle" && "Ready to start a new conversation"}
                </p>
              </div>
            </div>
          )}

          {/* Local Video Preview (floating) */}
          <div
            className={`absolute bottom-6 right-6 w-32 md:w-48 rounded-2xl overflow-hidden shadow-2xl border-4 transition-all duration-500 transform hover:scale-105 ${
              isConnected
                ? "border-blue-500/60 shadow-blue-500/30"
                : "border-gray-600/50"
            }`}
          >
            <video
              ref={localVideoRef}
              autoPlay
              muted
              playsInline
              className="w-full h-full object-cover bg-gray-800"
            />
            {!localStreamRef.current && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-white text-sm font-medium backdrop-blur-sm">
                Camera off
              </div>
            )}
          </div>
        </div>

        {/* Controls */}
        <div className="flex flex-col sm:flex-row items-center sm:justify-center mt-8 gap-4">
          <button
            onClick={startCamera}
            className="group relative p-5 rounded-full glass hover:bg-white/10 transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-105"
            title="Start Camera"
          >
            <CameraIcon className="h-7 w-7 text-gray-300 group-hover:text-white transition-colors" />
            <div className="absolute inset-0 bg-gradient-to-r from-blue-500/0 to-purple-500/0 group-hover:from-blue-500/10 group-hover:to-purple-500/10 rounded-full transition-all duration-500"></div>
          </button>

          <button
            onClick={findPartner}
            disabled={status !== "idle"}
            className={`group relative px-8 py-4 rounded-full font-semibold flex items-center justify-center w-full sm:w-auto gap-3 transition-all duration-300 transform hover:scale-105 ${
              status === "idle"
                ? "gradient-primary text-white shadow-2xl shadow-blue-500/40 hover:shadow-blue-500/60"
                : "bg-gray-700/50 text-gray-500 cursor-not-allowed glass"
            }`}
          >
            <SearchIcon className="h-5 w-5" />
            <span>Find Random</span>
            {status === "idle" && (
              <div className="absolute -inset-1 bg-blue-500/20 rounded-full animate-pulse opacity-0 group-hover:opacity-100 transition-opacity"></div>
            )}
          </button>

          <button
            onClick={endCall}
            disabled={status === "idle"}
            className={`group relative p-5 rounded-full transition-all duration-300 shadow-lg transform hover:scale-105 ${
              status !== "idle"
                ? "bg-gradient-to-r from-red-600 to-red-500 text-white shadow-2xl shadow-red-500/40 hover:shadow-red-500/60 border border-red-400/50"
                : "bg-gray-700/50 text-gray-500 cursor-not-allowed glass"
            }`}
            title="End Call"
          >
            <EndIcon className="h-7 w-7 text-white" />
            {status !== "idle" && (
              <div className="absolute -inset-1 bg-red-500/20 rounded-full animate-pulse opacity-0 group-hover:opacity-100 transition-opacity"></div>
            )}
          </button>
        </div>

        {/* Chat panel */}
        <div className="max-w-2xl mx-auto mt-8 card p-0 overflow-hidden">
          <div className="bg-gradient-to-r from-blue-600 to-purple-600 px-4 py-3">
            <h3 className="text-white font-semibold flex items-center gap-2">
              <div className="h-2 w-2 bg-green-400 rounded-full animate-pulse"></div>
              Live Chat
            </h3>
          </div>
          <div
            className="h-48 overflow-y-auto p-4 space-y-3 text-sm bg-gray-900/50"
            id="chat-messages"
          >
            {messages.length === 0 ? (
              <div className="text-center text-gray-400 py-8">
                <div className="h-12 w-12 mx-auto mb-3 bg-gray-700/50 rounded-full flex items-center justify-center">
                  <div className="h-6 w-6 text-gray-500">💬</div>
                </div>
                <p className="text-sm">No messages yet</p>
                <p className="text-xs text-gray-500 mt-1">
                  Start a conversation when connected
                </p>
              </div>
            ) : (
              messages.map((m, i) => (
                <div
                  key={i}
                  className={`flex ${m.from === "me" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`${m.from === "me" ? "bg-gradient-to-r from-blue-600 to-blue-500 text-white" : "bg-gray-700 text-gray-200 glass"} px-4 py-2 rounded-2xl max-w-[80%] shadow-sm`}
                  >
                    <div className="text-sm">{m.text}</div>
                    <div
                      className={`text-xs mt-1 ${m.from === "me" ? "text-blue-100/70" : "text-gray-400"}`}
                    >
                      {new Date(m.ts).toLocaleTimeString()}
                    </div>
                  </div>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>
          <div className="p-3 bg-gray-800/50 border-t border-gray-700">
            <div className="flex gap-2">
              <textarea
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendChatMessage(chatInput);
                  }
                }}
                className="flex-1 resize-none input bg-gray-900 border-gray-700 text-sm"
                rows={1}
                placeholder={
                  isConnected
                    ? "Type a message..."
                    : "Chat opens when connected"
                }
                disabled={!isConnected}
              />
              <button
                onClick={() => sendChatMessage(chatInput)}
                disabled={!isConnected || !chatInput.trim()}
                className="px-4 py-2 rounded-md bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
              >
                Send
              </button>
            </div>
          </div>
        </div>

        {/* IG exchange panel */}
        <div className="max-w-2xl mx-auto mt-6 card p-0 overflow-hidden">
          <div className="bg-gradient-to-r from-green-600 to-emerald-600 px-4 py-3">
            <h3 className="text-white font-semibold flex items-center gap-2">
              <div className="h-5 w-5 bg-white/20 rounded-full flex items-center justify-center">
                <span className="text-xs">📸</span>
              </div>
              Instagram Exchange
            </h3>
          </div>
          <div className="p-4 bg-gray-900/50">
            <div className="flex items-center gap-3">
              <input
                value={myIg}
                onChange={(e) => setMyIg(e.target.value)}
                placeholder="Your Instagram (e.g. @username)"
                className="flex-1 input bg-gray-800 border-gray-600 text-sm"
                disabled={!isConnected || myIgShared}
              />
              <button
                onClick={shareIg}
                disabled={!isConnected || myIgShared}
                className={`px-5 py-2.5 rounded-md font-medium transition-all duration-200 ${
                  myIgShared 
                    ? 'bg-gray-600 text-gray-300 cursor-not-allowed' 
                    : 'bg-gradient-to-r from-green-600 to-emerald-500 hover:from-green-500 hover:to-emerald-400 text-white shadow-lg shadow-green-500/25'
                }`}
              >
                {myIgShared ? 'Shared ✓' : 'Share IG'}
              </button>
            </div>
            <div className="mt-3 p-3 bg-gray-800/30 rounded-lg border border-gray-700">
              <div className="text-sm text-gray-300 flex items-center gap-2">
                <div className="h-2 w-2 bg-green-400 rounded-full animate-pulse"></div>
                {peerIg ? (
                  <span>
                    Peer's Instagram: <span className="font-mono text-white bg-green-500/10 px-2 py-1 rounded">{peerIg}</span>
                  </span>
                ) : (
                  <span className="text-gray-400">Waiting for peer to share their Instagram...</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Status indicator */}
        <div className="text-center mt-6">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass">
            <div className={`h-2 w-2 rounded-full ${
              status === 'connected' ? 'bg-green-400 animate-pulse' :
              status === 'searching' ? 'bg-blue-400 animate-pulse' :
              status === 'connecting' ? 'bg-yellow-400 animate-spin' : 'bg-gray-400'
            }`}></div>
            <span className="text-sm font-medium text-gray-300">
              {statusMessage} {myId && <span className="text-gray-500">• ID: {myId}</span>}
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
