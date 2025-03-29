import React, { useEffect, useRef, useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import { io } from "socket.io-client";
import Editor from "../components/Editor";
import { ACTIONS } from "../../Actions";
import toast from "react-hot-toast";
import { debounce } from "lodash";

const EditorPage = () => {
  const { roomId, userName } = useParams();
  const socketRef = useRef(null);
  const [clients, setClients] = useState([]);
  const [code, setCode] = useState(`console.log("Hello from JavaScript!");`);

  // Video Chat Related References
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(new MediaStream());
  const [isVideoOn, setIsVideoOn] = useState(true);
  const [isAudioOn, setIsAudioOn] = useState(true);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [webRTCConnected, setWebRTCConnected] = useState(false);

  // Debouncing code changes to reduce socket traffic resolving webrtc issues of video not available
  const debouncedCodeChange = useCallback(
    debounce((code) => {
      if (socketRef.current) {
        socketRef.current.emit(ACTIONS.CODE_CHANGE, {
          roomId,
          code,
        });
      }
    }, 500), // Wait 500ms after last keystroke before sending
    [roomId]
  );

  // SetCode function with debouncing
  const handleCodeChange = (newCode) => {
    setCode(newCode);
    debouncedCodeChange(newCode);
  };

  // Restarting WebRTC connection when it fails
  const restartConnection = async () => {
    if (!peerConnectionRef.current || !localStream) return;

    try {
      setIsReconnecting(true);
      console.log("Attempting to restart WebRTC connection...");

      // Create a new offer with iceRestart flag
      const offer = await peerConnectionRef.current.createOffer({
        iceRestart: true,
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
      });
      await peerConnectionRef.current.setLocalDescription(offer);
      socketRef.current.emit(ACTIONS.OFFER, { offer, roomId });

      setTimeout(() => {
        setIsReconnecting(false);
      }, 5000); // Show reconnecting UI for at least 5 seconds
    } catch (error) {
      console.error("Failed to restart connection:", error);
      setIsReconnecting(false);
    }
  };

  // Establish socket connection
  useEffect(() => {
    // Create socket
    socketRef.current = io(import.meta.env.VITE_BACKEND_URL, {
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
    });

    socketRef.current.on("connect", () => {
      console.log("Connected to server:", socketRef.current.id);
    });

    socketRef.current.on("connect_error", (err) => {
      console.error("Socket connection error:", err);
      toast.error("Connection error. Reconnecting...");
    });

    // Join room with the username
    socketRef.current.emit(ACTIONS.JOIN, { roomId, username: userName });

    socketRef.current.on(ACTIONS.JOINED, ({ clients, username }) => {
      if (username !== userName) {
        toast.success(`${username} joined the room`);
      }
      setClients(clients);

      // Only start video call if not already connected
      if (!localStream) {
        startVideoCall();
      } else if (username !== userName && peerConnectionRef.current) {
        // If someone else joined and we already have a peer connection,
        // restart the connection after a short delay
        setTimeout(() => {
          restartConnection();
        }, 1000);
      }
    });

    // Separate handler for code changes to optimize performance
    socketRef.current.on(ACTIONS.CODE_CHANGE, ({ code }) => {
      // Use requestAnimationFrame to prevent UI blocking
      requestAnimationFrame(() => {
        setCode(code);
      });
    });

    socketRef.current.on(
      ACTIONS.DISCONNECTED,
      ({ socketId, username, clients }) => {
        toast.error(`${username} left the room`);
        setClients(clients);

        // Reset remote video when peer disconnects
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = null;
          setWebRTCConnected(false);
        }
      }
    );

    return () => {
      // Enhanced cleanup
      if (localStream) {
        localStream.getTracks().forEach((track) => track.stop());
      }

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = null;
      }

      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = null;
      }

      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
        peerConnectionRef.current = null;
      }

      if (socketRef.current) {
        socketRef.current.removeAllListeners();
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [roomId, userName]);

  // Video call setup
  const startVideoCall = async () => {
    try {
      // Get the local media stream
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });

      setLocalStream(stream);

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      // Peer connection with STUN server config
      peerConnectionRef.current = new RTCPeerConnection({
        iceServers: [
          {
            urls: [
              "stun:stun.l.google.com:19302",
              "stun:stun1.l.google.com:19302",
              "stun:stun2.l.google.com:19302",
              "stun:stun3.l.google.com:19302",
            ],
          },
        ],
        iceCandidatePoolSize: 10, 
      });

      // Monitor connection state changes
      peerConnectionRef.current.onconnectionstatechange = () => {
        console.log(
          "Connection state:",
          peerConnectionRef.current.connectionState
        );

        if (peerConnectionRef.current.connectionState === "connected") {
          setWebRTCConnected(true);
          setIsReconnecting(false);
        } else if (
          peerConnectionRef.current.connectionState === "disconnected" ||
          peerConnectionRef.current.connectionState === "failed"
        ) {
          setWebRTCConnected(false);
          // Only show reconnection UI if we were previously connected
          if (webRTCConnected) {
            setIsReconnecting(true);
            toast.error("Video connection lost. Attempting to reconnect...");

            // Attempt to reconnect after a delay
            setTimeout(() => {
              if (clients.length > 1) {
                restartConnection();
              }
            }, 2000);
          }
        }
      };

      // Monitor ICE connection state
      peerConnectionRef.current.oniceconnectionstatechange = () => {
        console.log(
          "ICE connection state:",
          peerConnectionRef.current.iceConnectionState
        );
        if (peerConnectionRef.current.iceConnectionState === "failed") {
          console.log("ICE connection failed, attempting restart");
          peerConnectionRef.current.restartIce();
        }
      };

      // Add the local stream to the peer connection
      stream.getTracks().forEach((track) => {
        peerConnectionRef.current.addTrack(track, stream);
      });

      peerConnectionRef.current.ontrack = (event) => {
        console.log("Remote track received:", event.track.kind);
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = event.streams[0];
          setRemoteStream(event.streams[0]);
          setWebRTCConnected(true);
          setIsReconnecting(false);
          console.log("Remote video stream connected successfully");

          // Add track event listeners to detect track status changes
          event.track.onunmute = () => {
            console.log("Track unmuted:", event.track.kind);
            setWebRTCConnected(true);
          };

          event.track.onmute = () => {
            console.log("Track muted:", event.track.kind);
          };

          event.track.onended = () => {
            console.log("Track ended:", event.track.kind);
            setWebRTCConnected(false);
          };
        }
      };

      // Handle ICE candidates more efficiently
      peerConnectionRef.current.onicecandidate = (event) => {
        if (event.candidate && socketRef.current) {
          socketRef.current.emit(ACTIONS.ICE_CANDIDATE, {
            candidate: event.candidate,
            roomId,
          });
        }
      };

      // If we have other clients already in the room, create an offer
      if (clients.length > 1) {
        const offer = await peerConnectionRef.current.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: true,
        });
        await peerConnectionRef.current.setLocalDescription(offer);
        socketRef.current.emit(ACTIONS.OFFER, { offer, roomId });
      }
    } catch (error) {
      console.error("Error accessing media devices", error);
      toast.error("Failed to start video call");
    }
  };

  // Handling WebRTC signaling separately from code changes for better performance
  useEffect(() => {
    if (!socketRef.current) return;

    // Create handlers for WebRTC signaling
    const handleOffer = async ({ offer }) => {
      try {
        if (!peerConnectionRef.current) {
          // If we don't have a peer connection yet, start the video call
          await startVideoCall();
        }

        await peerConnectionRef.current.setRemoteDescription(
          new RTCSessionDescription(offer)
        );
        const answer = await peerConnectionRef.current.createAnswer();
        await peerConnectionRef.current.setLocalDescription(answer);
        socketRef.current.emit(ACTIONS.ANSWER, { answer, roomId });
      } catch (error) {
        console.error("Error handling offer:", error);
      }
    };

    const handleAnswer = async ({ answer }) => {
      try {
        if (peerConnectionRef.current) {
          await peerConnectionRef.current.setRemoteDescription(
            new RTCSessionDescription(answer)
          );
        }
      } catch (error) {
        console.error("Error handling answer:", error);
      }
    };

    const handleIceCandidate = async ({ candidate }) => {
      try {
        if (peerConnectionRef.current) {
          await peerConnectionRef.current.addIceCandidate(
            new RTCIceCandidate(candidate)
          );
        }
      } catch (error) {
        console.error("Error adding ICE candidate:", error);
      }
    };

    // Use listeners with high priority for WebRTC signaling
    socketRef.current.on(ACTIONS.OFFER, handleOffer);
    socketRef.current.on(ACTIONS.ANSWER, handleAnswer);
    socketRef.current.on(ACTIONS.ICE_CANDIDATE, handleIceCandidate);

    return () => {
      // Clean up listeners
      if (socketRef.current) {
        socketRef.current.off(ACTIONS.OFFER, handleOffer);
        socketRef.current.off(ACTIONS.ANSWER, handleAnswer);
        socketRef.current.off(ACTIONS.ICE_CANDIDATE, handleIceCandidate);
      }
    };
  }, [socketRef.current, roomId]);

  // Tab visibility detection to handle tab switching
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        // When returning to the tab, check if video connection is active
        if (
          peerConnectionRef.current &&
          clients.length > 1 &&
          (peerConnectionRef.current.iceConnectionState !== "connected" ||
            !webRTCConnected)
        ) {
          console.log("Tab visible again, checking video connection");
          setIsReconnecting(true);
          setTimeout(() => {
            restartConnection();
          }, 1000);
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [clients, webRTCConnected]);

  // Toggle video
  const toggleVideo = () => {
    if (localStream) {
      localStream
        .getVideoTracks()
        .forEach((track) => (track.enabled = !isVideoOn));
      setIsVideoOn(!isVideoOn);
    }
  };

  // Toggle audio
  const toggleAudio = () => {
    if (localStream) {
      localStream
        .getAudioTracks()
        .forEach((track) => (track.enabled = !isAudioOn));
      setIsAudioOn(!isAudioOn);
    }
  };

  // Copy the room ID to the clipboard
  const copyRoomId = () => {
    navigator.clipboard.writeText(roomId);
    toast.success("Room ID copied!");
  };

  // Leave the room and navigate back
  const leaveRoom = () => {
    // Stop all tracks in the local stream
    if (localStream) {
      localStream.getTracks().forEach((track) => track.stop());
    }

    // Clear remote video element
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }

    // Close and cleanup peer connection
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }

    // Disconnect socket
    if (socketRef.current) {
      socketRef.current.disconnect();
    }

    window.location.href = "/";
  };

  if (!socketRef.current)
    return (
      <p className="text-center text-gray-300 text-lg mt-5">Connecting...</p>
    );

  return (
    <div className="flex flex-col h-screen bg-gray-900 text-white">
      {/* Header */}
      <div className="flex justify-between items-center px-6 py-4 bg-gray-800 border-b border-gray-700 shadow-md fixed w-full z-10">
        <h3 className="text-2xl font-semibold">Collaborative Editor</h3>
        <div className="flex gap-4">
          <button
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition"
            onClick={copyRoomId}
          >
            📋 Copy Room ID
          </button>
          <button
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg transition"
            onClick={leaveRoom}
          >
            🚪 Leave Room
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden pt-16">
        {/* Sidebar */}
        <div className="w-1/4 bg-gray-800 p-6 shadow-md overflow-y-auto h-[calc(100vh-64px)]">
          <h3 className="text-lg font-semibold border-b pb-2 mb-3">
            Connected Users
          </h3>
          <ul className="space-y-3">
            {clients.map((client) => (
              <li
                key={client.socketId}
                className="flex items-center gap-2 bg-gray-700 px-4 py-2 rounded-lg"
              >
                <span className="text-green-400">👤</span> {client.username}
              </li>
            ))}
          </ul>
        </div>

        {/* Main Panel */}
        <div className="w-3/4 flex flex-col p-6 overflow-y-auto h-[calc(100vh-64px)]">
          {/* Video Section */}
          <div className="grid grid-cols-2 gap-6 mb-8">
            {/* Local Video */}
            <div className="bg-gray-800 rounded-xl shadow-lg overflow-hidden border border-gray-700">
              <div className="bg-gray-700 px-4 py-2 flex justify-between items-center">
                <div className="flex items-center">
                  <span className="inline-block w-2 h-2 rounded-full bg-green-500 mr-2 animate-pulse"></span>
                  <h3 className="font-medium text-gray-200">
                    {userName}{" "}
                    <span className="text-xs text-gray-400">(You)</span>
                  </h3>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    className={`p-1.5 rounded-full focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-offset-gray-800 ${
                      isAudioOn
                        ? "bg-blue-500 hover:bg-blue-600"
                        : "bg-red-500 hover:bg-red-600"
                    }`}
                    onClick={toggleAudio}
                    title={isAudioOn ? "Mute Audio" : "Unmute Audio"}
                  >
                    <span className="sr-only">
                      {isAudioOn ? "Mute Audio" : "Unmute Audio"}
                    </span>
                    {isAudioOn ? (
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-4 w-4 text-white"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                      >
                        <path
                          fillRule="evenodd"
                          d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z"
                          clipRule="evenodd"
                        />
                      </svg>
                    ) : (
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-4 w-4 text-white"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                      >
                        <path
                          fillRule="evenodd"
                          d="M13.477 14.89A6 6 0 015.11 6.524l8.367 8.368zm1.414-1.414L6.524 5.11a6 6 0 018.367 8.367zM18 10a8 8 0 11-16 0 8 8 0 0116 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                    )}
                  </button>
                  <button
                    className={`p-1.5 rounded-full focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-offset-gray-800 ${
                      isVideoOn
                        ? "bg-blue-500 hover:bg-blue-600"
                        : "bg-red-500 hover:bg-red-600"
                    }`}
                    onClick={toggleVideo}
                    title={isVideoOn ? "Turn Off Video" : "Turn On Video"}
                  >
                    <span className="sr-only">
                      {isVideoOn ? "Turn Off Video" : "Turn On Video"}
                    </span>
                    {isVideoOn ? (
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-4 w-4 text-white"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                      >
                        <path d="M2 6a2 2 0 012-2h6a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                        <path d="M14.553 7.106A1 1 0 0014 8v4a1 1 0 00.553.894l2 1A1 1 0 0018 13V7a1 1 0 00-1.447-.894l-2 1z" />
                      </svg>
                    ) : (
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-4 w-4 text-white"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                      >
                        <path
                          fillRule="evenodd"
                          d="M13.477 14.89A6 6 0 015.11 6.524l8.367 8.368zm1.414-1.414L6.524 5.11a6 6 0 018.367 8.367zM18 10a8 8 0 11-16 0 8 8 0 0116 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
              <div className="relative">
                <video
                  ref={localVideoRef}
                  autoPlay
                  muted
                  playsInline
                  className="w-full h-60 object-contain bg-gray-900"
                ></video>
                {!isVideoOn && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900 bg-opacity-90">
                    <div className="flex flex-col items-center justify-center p-4 bg-gray-800 bg-opacity-75 rounded-lg">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-12 w-12 text-gray-500 mb-2"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
                        />
                      </svg>
                      <p className="text-gray-300 font-medium text-sm">
                        Camera Off
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Remote Video */}
            <div className="bg-gray-800 rounded-xl shadow-lg overflow-hidden border border-gray-700">
              <div className="bg-gray-700 px-4 py-2 flex justify-between items-center">
                <div className="flex items-center">
                  {clients.length > 1 ? (
                    <>
                      <span className="inline-block w-2 h-2 rounded-full bg-green-500 mr-2 animate-pulse"></span>
                      <h3 className="font-medium text-gray-200">
                        {clients.find((client) => client.username !== userName)
                          ?.username || "Remote User"}
                      </h3>
                    </>
                  ) : (
                    <>
                      <span className="inline-block w-2 h-2 rounded-full bg-gray-500 mr-2"></span>
                      <h3 className="font-medium text-gray-400">
                        Waiting for connection...
                      </h3>
                    </>
                  )}
                </div>
                {clients.length > 1 && (
                  <span className="px-2 py-0.5 bg-green-500 bg-opacity-20 text-green-400 text-xs rounded-full border border-green-500">
                    Connected
                  </span>
                )}
              </div>
              <div className="relative">
                <video
                  ref={remoteVideoRef}
                  autoPlay
                  playsInline
                  className="w-full h-60 object-contain bg-gray-900"
                ></video>

                {clients.length <= 1 && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900 bg-opacity-90">
                    <div className="bg-gray-800 bg-opacity-75 p-4 rounded-lg flex flex-col items-center">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-12 w-12 text-gray-500 mb-2"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 4v16m8-8H4"
                        />
                      </svg>
                      <p className="text-gray-400 text-sm font-medium">
                        Invite someone to join
                      </p>
                      <button
                        onClick={copyRoomId}
                        className="mt-3 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-md transition flex items-center"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          className="h-4 w-4 mr-1"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                          />
                        </svg>
                        Copy Room ID
                      </button>
                    </div>
                  </div>
                )}

                {clients.length > 1 &&
                  remoteVideoRef.current &&
                  !remoteVideoRef.current.srcObject && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900 bg-opacity-90">
                      <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mb-2"></div>
                      <p className="text-gray-300 text-sm font-medium">
                        Connecting video...
                      </p>
                    </div>
                  )}
              </div>
            </div>
          </div>

          {/* Code Editor Section */}
          <div className="flex-1 bg-gray-800 p-4 rounded-lg shadow-md">
            <Editor
              code={code}
              setCode={handleCodeChange}
              socketRef={socketRef}
              roomId={roomId}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default EditorPage;
