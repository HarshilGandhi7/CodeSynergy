import React, { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { io } from "socket.io-client";
import Editor from "../components/Editor";
import { ACTIONS } from "../../Actions";
import toast from "react-hot-toast";

const EditorPage = () => {
  const { roomId, userName } = useParams();
  const navigate = useNavigate();
  const socketRef = useRef(null);
  const [clients, setClients] = useState([]);
  const [code, setCode] = useState(`console.log("Hello from JavaScript!");`);

  // Video Chat Related References
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(new MediaStream());

  useEffect(() => {
    socketRef.current = io(import.meta.env.VITE_BACKEND_URL);

    socketRef.current.on("connect", () => {
      console.log("Connected to server:", socketRef.current.id);
    });

    socketRef.current.emit(ACTIONS.JOIN, { roomId, username: userName });

    socketRef.current.on(ACTIONS.JOINED, ({ clients, username }) => {
      if (username !== userName) {
        toast.success(`${username} joined the room`);
      }
      setClients(clients);
      startVideoCall();
    });

    socketRef.current.on(ACTIONS.CODE_CHANGE, ({ code }) => {
      setCode(code);
    });

    socketRef.current.on(
      ACTIONS.DISCONNECTED,
      ({ socketId, username, clients }) => {
        toast.error(`${username} left the room`);
        setClients(clients);
      }
    );

    return () => {
      if (socketRef.current) {
        socketRef.current.removeAllListeners();
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [roomId]);

  // Start the video call
  const startVideoCall = async () => {
    try {
      // Get the local media stream
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      setLocalStream(stream);
      localVideoRef.current.srcObject = stream;

      // Create a peer connection
      peerConnectionRef.current = new RTCPeerConnection({
        iceServers: [
          {
            urls: [
              "stun:stun.l.google.com:19302",
              "stun:stun1.l.google.com:19302",
            ],
          },
        ],
      });

      // Add the local stream to the peer connection
      stream.getTracks().forEach((track) => {
        peerConnectionRef.current.addTrack(track, stream);
      });

      // Handle the ontrack event, to receive remote stream
      peerConnectionRef.current.ontrack = (event) => {
        event.streams[0].getTracks().forEach((track) => {
          remoteStream.addTrack(track);
        });
        remoteVideoRef.current.srcObject = remoteStream;
      };

      // Send ICE Candidates to the other peer
      peerConnectionRef.current.onicecandidate = (event) => {
        if (event.candidate) {
          socketRef.current.emit(ACTIONS.ICE_CANDIDATE, {
            candidate: event.candidate,
            roomId,
          });
        }
      };

      // If the user is the first one in the room, create an offer
      if (clients.length === 0) {
        const offer = await peerConnectionRef.current.createOffer();
        await peerConnectionRef.current.setLocalDescription(offer);
        socketRef.current.emit(ACTIONS.OFFER, { offer, roomId });
      }
    } catch (error) {
      console.error("Error accessing media devices", error);
      toast.error("Failed to start video call");
    }
  };

  useEffect(() => {
    if (!socketRef.current) return;

    // When receiving an offer from another peer
    socketRef.current.on(ACTIONS.OFFER, async ({ offer }) => {
      await peerConnectionRef.current.setRemoteDescription(
        new RTCSessionDescription(offer)
      );
      const answer = await peerConnectionRef.current.createAnswer();
      await peerConnectionRef.current.setLocalDescription(answer);
      socketRef.current.emit(ACTIONS.ANSWER, { answer, roomId });
    });

    // When receiving an answer from the peer
    socketRef.current.on(ACTIONS.ANSWER, async ({ answer }) => {
      await peerConnectionRef.current.setRemoteDescription(
        new RTCSessionDescription(answer)
      );
    });

    // When receiving an ICE candidate from the peer
    socketRef.current.on(ACTIONS.ICE_CANDIDATE, ({ candidate }) => {
      peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate));
    });
  }, [socketRef.current]);

  // Copy room ID to clipboard
  const copyRoomId = () => {
    navigator.clipboard.writeText(roomId);
    toast.success("Room ID copied!");
  };

  // Leave the room and navigate back
  const leaveRoom = () => {
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
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="bg-gray-800 p-4 rounded-lg shadow-md flex flex-col items-center">
              <h3 className="text-lg font-semibold mb-2">Your Video</h3>
              <video
                ref={localVideoRef}
                autoPlay
                muted
                className="w-full h-52 rounded-lg object-contain bg-gray-900"
              ></video>
            </div>
            <div className="bg-gray-800 p-4 rounded-lg shadow-md flex flex-col items-center">
              <h3 className="text-lg font-semibold mb-2">Remote Video</h3>
              <video
                ref={remoteVideoRef}
                autoPlay
                className="w-full h-52 rounded-lg object-contain bg-gray-900"
              ></video>
            </div>
          </div>

          {/* Code Editor Section */}
          <div className="flex-1 bg-gray-800 p-4 rounded-lg shadow-md">
            <Editor
              code={code}
              setCode={setCode}
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
