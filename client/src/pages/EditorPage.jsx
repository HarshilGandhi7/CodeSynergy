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
      <div className="flex flex-col items-center p-4 bg-gray-800 shadow-md border-b border-gray-700">
        <h3 className="text-xl font-semibold mb-3">Connected Users</h3>
        <ul className="flex flex-wrap gap-3">
          {clients.map((client) => (
            <li
              key={client.socketId}
              className="flex items-center gap-2 bg-gray-700 px-4 py-2 rounded-md text-sm"
            >
              <span className="text-blue-400">👤</span> {client.username}
            </li>
          ))}
        </ul>
        <div className="mt-4 flex gap-4">
          <button
            className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white font-medium rounded-md transition"
            onClick={copyRoomId}
          >
            📋 Copy Room ID
          </button>
          <button
            className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white font-medium rounded-md transition"
            onClick={leaveRoom}
          >
            🚪 Leave Room
          </button>
        </div>
      </div>

      {/* Code Editor */}
      <div className="flex-1">
        <Editor
          code={code}
          setCode={setCode}
          socketRef={socketRef}
          roomId={roomId}
        />
      </div>
    </div>
  );
};

export default EditorPage;
