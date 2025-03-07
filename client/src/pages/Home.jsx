import React, { useState } from "react";
import Icon from "../assets/Icon.jpg";
import { v4 as uuidv4 } from "uuid";
import toast from "react-hot-toast";
import { useNavigate } from "react-router-dom";

const Home = () => {
  const navigate = useNavigate();
  const [roomId, setRoomId] = useState("");
  const [userName, setUserName] = useState("");
  // New Room Handler
  const CreateNewRoomHandler = (e) => {
    e.preventDefault();
    const id = uuidv4();
    setRoomId(id);
    toast.success("New Room Created");
  };
  const JoinRoomHandler = (e) => {
    if (!roomId || !userName) {
      toast.error("Enter valid Room ID and Username");
      return;
    }

    navigate(`/editor/${roomId}/${userName}`, {
      state: {
        userName: userName,
      },
    });
  };
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900">
      {/* Main Card */}
      <div className="w-full max-w-md bg-gray-800 p-6 rounded-2xl shadow-lg text-center">
        {/* Logo */}
        <div className="flex justify-center mb-4">
          <img src={Icon} alt="App Icon" className="w-16 h-16 rounded-full" />
        </div>

        {/* Title */}
        <h4 className="text-white text-lg font-semibold mb-4">
          Enter Your Invitation Room ID
        </h4>

        {/* Form */}
        <form className="flex flex-col space-y-4">
          <input
            type="text"
            placeholder="ROOM ID"
            className="w-full p-3 bg-gray-700 text-white rounded-lg border border-gray-600 outline-none focus:ring-2 focus:ring-blue-500"
            onChange={(e) => setRoomId(e.target.value)}
            value={roomId}
          />
          <input
            type="text"
            placeholder="USERNAME"
            className="w-full p-3 bg-gray-700 text-white rounded-lg border border-gray-600 outline-none focus:ring-2 focus:ring-blue-500"
            onChange={(e) => setUserName(e.target.value)}
            value={userName}
          />

          {/* Button */}
          <button
            type="submit"
            className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 transition"
            onClick={JoinRoomHandler}
          >
            Join Room
          </button>

          {/* Create Room Link */}
          <span className="text-gray-400 text-sm">
            Don't have a ROOM ID?{" "}
            <a
              href="#"
              onClick={CreateNewRoomHandler}
              className="text-blue-500 hover:underline font-semibold"
            >
              Create a new room
            </a>
          </span>
        </form>
      </div>

      {/* Footer */}
      <footer className="mt-6 text-gray-400 text-sm text-center">
        Created by{" "}
        <a
          href="https://www.linkedin.com/in/harshilgandhi77"
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-400 hover:underline font-medium"
        >
          Harshil Gandhi
        </a>{" "}
        – Connect with me on LinkedIn
      </footer>
    </div>
  );
};

export default Home;
